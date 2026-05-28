#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dist-build-"));
const distRoot = path.join(tempRoot, "dist");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
function collectFiles(directory) {
    const files = [];
    if (!fs.existsSync(directory))
        return files;
    walk(directory, files);
    return files.sort();
}
function walk(current, files) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink())
        return;
    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(current))
            walk(path.join(current, entry), files);
        return;
    }
    if (stat.isFile())
        files.push(current);
}
const build = spawnSync(process.execPath, ["scripts/build-dist.mjs", "--out-dir", distRoot, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
});
assert(build.status === 0, `dist build should pass\nSTDOUT:\n${build.stdout}\nSTDERR:\n${build.stderr}`);
const unsafeNestedRepoOutput = spawnSync(process.execPath, ["scripts/build-dist.mjs", "--out-dir", "scripts/lib", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
});
assert(unsafeNestedRepoOutput.status !== 0, "dist build must reject repo-internal output directories outside dist/");
assert(unsafeNestedRepoOutput.stdout.includes("refusing to clean unsafe dist output directory"), "unsafe output rejection should explain the refused clean");
const buildSummary = JSON.parse(build.stdout);
assert(buildSummary.ok === true, "dist build JSON summary should report ok");
assert(buildSummary.files.includes("harness.mjs"), "dist build should emit root harness.mjs");
assert(buildSummary.files.includes("postinstall.mjs"), "dist build should emit root postinstall.mjs");
assert(buildSummary.files.includes("lib/harness-core.mjs"), "dist build should emit runtime library files");
assert(!buildSummary.files.includes("scripts/harness.mjs"), "dist build must not preserve the scripts/ prefix");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
assert(packageJson.bin?.harness === "scripts/harness.mjs", "PR-24 must not switch package bin to dist");
assert(packageJson.scripts?.postinstall === "node scripts/postinstall.mjs", "PR-24 must not switch postinstall to dist");
assert(!packageJson.files.includes("dist/"), "PR-24 keeps dist generated-only until the runtime cutover PR");
assert(packageJson.files.includes("tsconfig.dist.json"), "package allowlist should include the dist build config");
const help = spawnSync(process.execPath, [path.join(distRoot, "harness.mjs"), "--help"], {
    cwd: repoRoot,
    encoding: "utf8",
});
assert(help.status === 0, `dist harness help should run\nSTDOUT:\n${help.stdout}\nSTDERR:\n${help.stderr}`);
assert(help.stdout.includes("Usage:"), "dist harness help should print usage");
for (const file of collectFiles(distRoot).filter((entry) => entry.endsWith(".mjs"))) {
    const content = fs.readFileSync(file, "utf8");
    assert(!/from\s+["'][^"']+\.(ts|mts)["']/.test(content), `${path.relative(distRoot, file)} must not import TypeScript source files`);
    assert(!/import\s*\(\s*["'][^"']+\.(ts|mts)["']/.test(content), `${path.relative(distRoot, file)} must not dynamically import TypeScript source files`);
}
console.log("Dist build pipeline tests passed");
