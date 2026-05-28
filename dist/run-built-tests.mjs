#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "tmp", `test-runner-emit-${process.pid}`);
const typescriptVersion = "5.9.3";
const options = parseArgs(process.argv.slice(2));
fs.rmSync(outDir, { recursive: true, force: true });
const emit = spawnSync("npm", ["exec", "--yes", "--package", `typescript@${typescriptVersion}`, "--", "tsc", "-p", "tsconfig.tests.json", "--outDir", outDir, "--noCheck"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
});
if (emit.status !== 0)
    process.exit(emit.status || 1);
linkPackageResources();
const runner = path.join(outDir, options.test || "tests/run-all.mjs");
if (!fs.existsSync(runner)) {
    console.error(`Built test runner not found: ${runner}`);
    process.exit(1);
}
const result = spawnSync(process.execPath, [runner], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
    env: {
        ...process.env,
        HARNESS_TEST_REPO_ROOT: repoRoot,
        HARNESS_TEST_RUNNER_MODE: "built",
        HARNESS_TEST_RUNNER_OUT_DIR: outDir,
    },
});
if (result.status !== 0)
    process.exit(result.status || 1);
function parseArgs(argv) {
    const parsed = { test: undefined };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--test") {
            parsed.test = requireValue(argv, index, arg);
            index += 1;
        }
        else {
            throw new Error(`Unknown run-built-tests option: ${arg}`);
        }
    }
    return parsed;
}
function requireValue(argv, index, option) {
    const value = argv[index + 1];
    if (!value)
        throw new Error(`${option} requires a value`);
    return value;
}
function linkPackageResources() {
    for (const entry of [
        "package.json",
        "README.md",
        "README.en-US.md",
        "README.zh-CN.md",
        "CONTRIBUTING.md",
        "CHANGELOG.md",
        "SKILL.md",
        "LICENSE",
        "LICENSE-EXCEPTION.md",
        "presets",
        "templates",
        "templates-zh-CN",
        "docs-release",
        "examples",
        "references",
        "skills",
    ]) {
        const source = path.join(repoRoot, entry);
        const target = path.join(outDir, entry);
        if (!fs.existsSync(source) || fs.existsSync(target))
            continue;
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.symlinkSync(source, target);
    }
}
