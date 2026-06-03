#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dist-build-"));
const distRoot = path.join(tempRoot, "dist");

type DistBuildSummary = {
  ok: boolean;
  files: string[];
};

type PackageJsonShape = {
  bin?: { harness?: string };
  scripts?: Record<string, string>;
  files: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function collectFiles(directory: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(directory)) return files;
  walk(directory, files);
  return files.sort();
}

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function walk(current: string, files: string[]): void {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(current)) walk(path.join(current, entry), files);
    return;
  }
  if (stat.isFile()) files.push(current);
}

const build = spawnSync(process.execPath, ["scripts/build-dist.mts", "--out-dir", distRoot, "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert(build.status === 0, `dist build should pass\nSTDOUT:\n${build.stdout}\nSTDERR:\n${build.stderr}`);

const quietBuildRoot = path.join(tempRoot, "quiet-dist");
const quietBuild = spawnSync(process.execPath, ["scripts/build-dist.mts", "--out-dir", quietBuildRoot, "--quiet"], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert(quietBuild.status === 0, `quiet dist build should pass\nSTDOUT:\n${quietBuild.stdout}\nSTDERR:\n${quietBuild.stderr}`);
assert(quietBuild.stdout === "", "quiet dist build should not print stdout on success");
assert(quietBuild.stderr === "", "quiet dist build should not print stderr on success");

const unsafeNestedRepoOutput = spawnSync(process.execPath, ["scripts/build-dist.mts", "--out-dir", "scripts/lib", "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert(unsafeNestedRepoOutput.status !== 0, "dist build must reject repo-internal output directories outside dist/");
assert(
  unsafeNestedRepoOutput.stdout.includes("refusing to clean unsafe dist output directory"),
  "unsafe output rejection should explain the refused clean",
);

const buildSummary = JSON.parse(build.stdout) as DistBuildSummary;
assert(buildSummary.ok === true, "dist build JSON summary should report ok");
assert(buildSummary.files.includes("harness.mjs"), "dist build should emit root harness.mjs");
assert(buildSummary.files.includes("postinstall.mjs"), "dist build should emit root postinstall.mjs");
assert(buildSummary.files.includes("lib/harness-core.mjs"), "dist build should emit runtime library files");
assert(!buildSummary.files.includes("scripts/harness.mjs"), "dist build must not preserve the scripts/ prefix");

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as PackageJsonShape;
assert(packageJson.bin?.harness === "dist/harness.mjs", "package bin should run the dist harness entrypoint");
assert(packageJson.scripts?.postinstall === "node postinstall.mjs", "package postinstall should run the source-safe postinstall bootstrap");
assert(packageJson.scripts?.prepare === "node postinstall.mjs --build-only", "package prepare should build dist for Git/source installs");
assert(packageJson.scripts?.prepublishOnly?.includes("check-dist-observation.mjs"), "package prepublishOnly should run dist observation before publish");
assert(packageJson.scripts?.check === "node run-dist.mjs harness.mjs check --profile source-package .", "npm check should run through source-safe dist bootstrap");
assert(packageJson.files.includes("dist/"), "package allowlist should include generated dist artifacts");
assert(packageJson.files.includes("postinstall.mjs"), "package allowlist should include postinstall bootstrap");
assert(packageJson.files.includes("run-dist.mjs"), "package allowlist should include npm script dist bootstrap");
assert(!packageJson.files.includes("scripts/"), "package allowlist should not include historical scripts shims after PR-28");
assert(packageJson.files.includes("tsconfig.dist.json"), "package allowlist should include the dist build config");
assert(packageJson.scripts?.test === "node scripts/run-built-tests.mts", "test runner should avoid a redundant run-dist build before emitting tests");

const help = spawnSync(process.execPath, [path.join(distRoot, "harness.mjs"), "--help"], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert(help.status === 0, `dist harness help should run\nSTDOUT:\n${help.stdout}\nSTDERR:\n${help.stderr}`);
assert(help.stdout.includes("Usage:"), "dist harness help should print usage");
assert((fs.statSync(path.join(distRoot, "harness.mjs")).mode & 0o111) !== 0, "dist harness should be executable for npm bin links");

const postinstall = spawnSync(process.execPath, [path.join(distRoot, "postinstall.mjs")], {
  cwd: repoRoot,
  encoding: "utf8",
  env: { ...process.env, CODING_AGENT_HARNESS_SKIP_POSTINSTALL: "1" },
});
assert(postinstall.status === 0, `dist postinstall should run with skip flag\nSTDOUT:\n${postinstall.stdout}\nSTDERR:\n${postinstall.stderr}`);

const packagedPostinstallFixture = fs.mkdtempSync(path.join(os.tmpdir(), "harness-postinstall-no-dist-"));
fs.copyFileSync(path.join(repoRoot, "postinstall.mjs"), path.join(packagedPostinstallFixture, "postinstall.mjs"));
const packagedPostinstall = spawnSync(process.execPath, [path.join(packagedPostinstallFixture, "postinstall.mjs")], {
  cwd: packagedPostinstallFixture,
  encoding: "utf8",
});
assert(packagedPostinstall.status !== 0, "packaged postinstall without dist should fail cleanly instead of trying unavailable source scripts");
assert(
  packagedPostinstall.stderr.includes("missing dist/postinstall.mjs"),
  `packaged postinstall should explain the missing dist runtime\nSTDOUT:\n${packagedPostinstall.stdout}\nSTDERR:\n${packagedPostinstall.stderr}`,
);

for (const requiredHistoricalShim of ["scripts/harness.mjs", "scripts/postinstall.mjs", "tests/run-all.mjs"]) {
  assert(!fs.existsSync(path.join(repoRoot, requiredHistoricalShim)), `PR-28 must remove historical shim: ${requiredHistoricalShim}`);
}

for (const file of collectFiles(distRoot).filter((entry) => entry.endsWith(".mjs"))) {
  const content = fs.readFileSync(file, "utf8");
  assert(!/from\s+["'][^"']+\.(ts|mts)["']/.test(content), `${path.relative(distRoot, file)} must not import TypeScript source files`);
  assert(!/import\s*\(\s*["'][^"']+\.(ts|mts)["']/.test(content), `${path.relative(distRoot, file)} must not dynamically import TypeScript source files`);
}

const gitignore = readFile(".gitignore");
assert(gitignore.includes("/dist/"), "generated dist/ should be ignored by git");
const trackedDist = spawnSync("git", ["ls-files", "dist"], { cwd: repoRoot, encoding: "utf8" });
assert(trackedDist.status === 0, `git ls-files dist should pass\nSTDOUT:\n${trackedDist.stdout}\nSTDERR:\n${trackedDist.stderr}`);
assert(trackedDist.stdout.trim() === "", "generated dist artifacts should not be tracked by git");

console.log("Dist build pipeline tests passed");
