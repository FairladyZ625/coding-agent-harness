#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-source-no-dist-"));
const fixtureRoot = path.join(tempRoot, "source");
const home = path.join(tempRoot, "home");

interface PackedEntry {
  path: string;
  mode?: number;
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

copySourcePackage(fixtureRoot);
fs.rmSync(path.join(fixtureRoot, "dist"), { recursive: true, force: true });
fs.mkdirSync(home, { recursive: true });

const install = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
  cwd: fixtureRoot,
  encoding: "utf8",
  env: isolatedEnv(home),
  maxBuffer: 32 * 1024 * 1024,
});
assert(install.status === 0, `no-dist source npm install should pass\nSTDOUT:\n${install.stdout}\nSTDERR:\n${install.stderr}`);

const distHarness = path.join(fixtureRoot, "dist/harness.mjs");
assert(fs.existsSync(distHarness), "no-dist source npm install should create dist/harness.mjs");
assert((fs.statSync(distHarness).mode & 0o111) !== 0, "generated dist/harness.mjs should be executable");

const help = spawnSync(process.execPath, [distHarness, "--help"], {
  cwd: fixtureRoot,
  encoding: "utf8",
});
assert(help.status === 0, `generated source CLI should run\nSTDOUT:\n${help.stdout}\nSTDERR:\n${help.stderr}`);
assert(help.stdout.includes("Usage:"), "generated source CLI should print usage");

const skillHome = path.join(tempRoot, "skill-home");
const installUser = spawnSync(process.execPath, [distHarness, "install-user", "--agent", "codex", "--home", skillHome, "--yes"], {
  cwd: fixtureRoot,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
assert(installUser.status === 0, `install-user should pass from no-dist source install\nSTDOUT:\n${installUser.stdout}\nSTDERR:\n${installUser.stderr}`);
assert(
  fs.existsSync(path.join(skillHome, ".codex/skills/coding-agent-harness/dist/harness.mjs")),
  "install-user should copy generated dist runtime into user skill package",
);

const doctorUser = spawnSync(process.execPath, [distHarness, "doctor-user", "--agent", "codex", "--home", skillHome], {
  cwd: fixtureRoot,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
assert(doctorUser.status === 0, `doctor-user should pass for generated user skill package\nSTDOUT:\n${doctorUser.stdout}\nSTDERR:\n${doctorUser.stderr}`);

const pack = spawnSync("npm", ["pack", "--dry-run", "--json"], {
  cwd: fixtureRoot,
  encoding: "utf8",
  env: isolatedEnv(home),
  maxBuffer: 32 * 1024 * 1024,
});
assert(pack.status === 0, `no-dist source pack dry-run should pass\nSTDOUT:\n${pack.stdout}\nSTDERR:\n${pack.stderr}`);
const packedEntries = JSON.parse(pack.stdout)[0].files as PackedEntry[];
const packedByPath = new Map(packedEntries.map((entry) => [entry.path, entry]));
assert(packedByPath.has("dist/harness.mjs"), "no-dist source pack should include generated dist/harness.mjs");
assert(packedByPath.has("dist/postinstall.mjs"), "no-dist source pack should include generated dist/postinstall.mjs");
assert(packedByPath.has("postinstall.mjs"), "no-dist source pack should include source-safe postinstall bootstrap");
assert(packedByPath.has("run-dist.mjs"), "no-dist source pack should include npm script dist bootstrap");
const packedHarnessMode = packedByPath.get("dist/harness.mjs")?.mode;
assert(typeof packedHarnessMode === "number" && (packedHarnessMode & 0o111) !== 0, "packed dist/harness.mjs should be executable");
assert(!packedEntries.some((entry) => entry.path.startsWith("scripts/")), "package should not include scripts/");
assert(!packedEntries.some((entry) => entry.path.startsWith("tests/")), "package should not include tests/");

console.log("Source no-dist lifecycle tests passed");

function copySourcePackage(targetRoot: string) {
  for (const entry of [
    "package.json",
    "README.md",
    "README.en-US.md",
    "README.zh-CN.md",
    "CONTRIBUTING.md",
    "CHANGELOG.md",
    "SKILL.md",
    "postinstall.mjs",
    "run-dist.mjs",
    "LICENSE",
    "LICENSE-EXCEPTION.md",
    "tsconfig.json",
    "tsconfig.dist.json",
    "tsconfig.runtime.json",
    "scripts",
    "presets",
    "templates",
    "templates-zh-CN",
    "docs-release",
    "examples",
    "references",
    "skills",
  ]) {
    const source = path.join(repoRoot, entry);
    const target = path.join(targetRoot, entry);
    if (!fs.existsSync(source)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, dereference: true });
  }
}

function isolatedEnv(homeDir: string) {
  return {
    ...process.env,
    HOME: homeDir,
    npm_config_cache: process.env.npm_config_cache || path.join(os.homedir(), ".npm"),
    CODING_AGENT_HARNESS_SKIP_POSTINSTALL: "",
  };
}
