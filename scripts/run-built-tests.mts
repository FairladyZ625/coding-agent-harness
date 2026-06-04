#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(repoRoot, "tmp", `test-runner-emit-${process.pid}`);
const typescriptVersion = "5.9.3";

const options = parseArgs(process.argv.slice(2));

if (!options.skipDistBuild) {
  const build = spawnSync(process.execPath, ["scripts/build-dist.mts", "--quiet"], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status || 1);
}

fs.rmSync(outDir, { recursive: true, force: true });
const npmArgs = ["exec", "--yes", "--package", `typescript@${typescriptVersion}`, "--", "tsc", "-p", "tsconfig.tests.json", "--outDir", outDir, "--noCheck"];
const npmCommand = resolveNpmCommand(npmArgs);
const emit = spawnSync(
  npmCommand.command,
  npmCommand.args,
  {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  },
);
if (emit.status !== 0) process.exit(emit.status || 1);

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
    ...(options.jobs ? { HARNESS_TEST_RUNNER_JOBS: String(options.jobs) } : {}),
    ...(options.batchSize ? { HARNESS_TEST_RUNNER_BATCH_SIZE: String(options.batchSize) } : {}),
    HARNESS_TEST_REPO_ROOT: repoRoot,
    HARNESS_TEST_RUNNER_MODE: "built",
    HARNESS_TEST_RUNNER_OUT_DIR: outDir,
  },
});
if (result.status !== 0) process.exit(result.status || 1);

type RunBuiltTestsOptions = {
  batchSize?: number;
  jobs?: number;
  skipDistBuild?: boolean;
  test?: string;
};

function parseArgs(argv: string[]): RunBuiltTestsOptions {
  const parsed: RunBuiltTestsOptions = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--test") {
      parsed.test = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--jobs") {
      parsed.jobs = requirePositiveInteger(argv, index, arg);
      index += 1;
    } else if (arg === "--batch-size") {
      parsed.batchSize = requirePositiveInteger(argv, index, arg);
      index += 1;
    } else if (arg === "--skip-dist-build") {
      parsed.skipDistBuild = true;
    } else {
      throw new Error(`Unknown run-built-tests option: ${arg}`);
    }
  }
  return parsed;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${option} requires a value`);
  return value;
}

function requirePositiveInteger(argv: string[], index: number, option: string): number {
  const value = Number.parseInt(requireValue(argv, index, option), 10);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${option} requires a positive integer`);
  return value;
}

function resolveNpmCommand(npmArgs: string[]): { command: string; args: string[] } {
  const npmExecPath = process.env.npm_execpath;
  if (npmExecPath) return { command: process.execPath, args: [npmExecPath, ...npmArgs] };
  return { command: process.platform === "win32" ? "npm.cmd" : "npm", args: npmArgs };
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
    if (!fs.existsSync(source) || fs.existsSync(target)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(source, target);
  }
}
