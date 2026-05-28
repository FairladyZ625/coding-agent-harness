#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "tmp/test-runner-emit");
const typescriptVersion = "5.9.3";

fs.rmSync(outDir, { recursive: true, force: true });
const emit = spawnSync(
  "npm",
  ["exec", "--yes", "--package", `typescript@${typescriptVersion}`, "--", "tsc", "-p", "tsconfig.tests.json", "--outDir", outDir, "--noCheck"],
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  },
);
if (emit.status !== 0) process.exit(emit.status || 1);

linkPackageResources();

const runner = path.join(outDir, "tests/run-all.mjs");
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
if (result.status !== 0) process.exit(result.status || 1);

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
    if (!fs.existsSync(source) || fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(source, target);
  }
}
