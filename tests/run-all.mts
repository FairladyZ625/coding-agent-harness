#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runnerRoot = process.env.HARNESS_TEST_RUNNER_OUT_DIR || repoRoot;
const suites: string[] = [
  "tests/meta-test-layout.mjs",
  "tests/directory-structure-v2.mjs",
  "tests/hard-cutover-guards.mjs",
  "tests/type-boundary-guards.mjs",
  "tests/no-ts-nocheck-gate.mjs",
  "tests/import-graph-gate.mjs",
  "tests/snapshot-matrix-tooling.mjs",
  "tests/shared-type-islands.mjs",
  "tests/runtime-emit-contract.mjs",
  "tests/dist-build-pipeline.mjs",
  "tests/dist-observation-gates.mjs",
  "tests/helpers/test-helper-types.mjs",
  "tests/source-package-boundary.mjs",
  "tests/architecture-health.mjs",
  "tests/cli-help.mjs",
  "tests/dashboard-generation.mjs",
  "tests/dashboard-preset-ui.mjs",
  "tests/dashboard-workbench.mjs",
  "tests/template-governance.mjs",
  "tests/review-confirm-git-gate.mjs",
  "tests/lifecycle/task-index-audit-metadata.mjs",
  "tests/governance-table-boundary.mjs",
  "tests/governance-sync.mjs",
  "tests/governance-generated-indexes.mjs",
  "tests/preset-engine.mjs",
  "tests/release-closeout-preset.mjs",
  "tests/task-lifecycle.mjs",
  "tests/lifecycle-queues.mjs",
  "tests/migration-adoption.mjs",
  "tests/test-harness.mjs",
];

for (const suite of suites) {
  const suitePath = process.env.HARNESS_TEST_RUNNER_MODE === "built" ? path.join(runnerRoot, suite) : suite;
  const result = spawnSync(process.execPath, [suitePath], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log("Harness v1 tests passed");
