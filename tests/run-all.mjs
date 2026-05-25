#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const suites = [
  "tests/meta-test-layout.mjs",
  "tests/source-package-boundary.mjs",
  "tests/cli-help.mjs",
  "tests/dashboard-generation.mjs",
  "tests/template-governance.mjs",
  "tests/review-confirm-git-gate.mjs",
  "tests/governance-table-boundary.mjs",
  "tests/governance-sync.mjs",
  "tests/governance-generated-indexes.mjs",
  "tests/preset-engine.mjs",
  "tests/task-lifecycle.mjs",
  "tests/lifecycle-queues.mjs",
  "tests/migration-adoption.mjs",
  "tests/test-harness.mjs",
];

for (const suite of suites) {
  const result = spawnSync(process.execPath, [suite], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Harness v1 tests passed");
