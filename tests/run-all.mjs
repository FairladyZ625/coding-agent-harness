#!/usr/bin/env node
// @ts-nocheck
import { spawnSync } from "node:child_process";
import path from "node:path";
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const suites = [
    "tests/meta-test-layout.mjs",
    "tests/directory-structure-v2.mjs",
    "tests/hard-cutover-guards.mjs",
    "tests/type-boundary-guards.mjs",
    "tests/import-graph-gate.mjs",
    "tests/snapshot-matrix-tooling.mjs",
    "tests/shared-type-islands.mjs",
    "tests/runtime-emit-contract.mjs",
    "tests/dist-build-pipeline.mjs",
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
    if (result.status !== 0)
        process.exit(result.status || 1);
}
console.log("Harness v1 tests passed");
