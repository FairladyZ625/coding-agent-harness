#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const runnerRoot = process.env.HARNESS_TEST_RUNNER_OUT_DIR || repoRoot;

type Suite = {
  path: string;
  phase?: "package" | "exclusive";
  isolated?: boolean;
};

type TestUnit = {
  args: string[];
  label: string;
};

const suites: Suite[] = [
  { path: "tests/meta-test-layout.mjs" },
  { path: "tests/directory-structure-v2.mjs" },
  { path: "tests/hard-cutover-guards.mjs", phase: "package" },
  { path: "tests/type-boundary-guards.mjs" },
  { path: "tests/no-ts-nocheck-gate.mjs" },
  { path: "tests/import-graph-gate.mjs" },
  { path: "tests/legacy-fallback-detector.mjs" },
  { path: "tests/full-retirement-gate-profile.mjs" },
  { path: "tests/impact-classifier.mjs" },
  { path: "tests/snapshot-matrix-tooling.mjs" },
  { path: "tests/shared-type-islands.mjs" },
  { path: "tests/runtime-emit-contract.mjs" },
  { path: "tests/dist-build-pipeline.mjs", phase: "package" },
  { path: "tests/package-surface.mjs", phase: "package" },
  { path: "tests/source-no-dist-lifecycle.mjs" },
  { path: "tests/dist-observation-gates.mjs", phase: "package" },
  { path: "tests/helpers/test-helper-types.mjs" },
  { path: "tests/source-package-boundary.mjs", phase: "package" },
  { path: "tests/architecture-health.mjs" },
  { path: "tests/task-kernel-smoke.mjs" },
  { path: "tests/task-kernel-domain.mjs" },
  { path: "tests/task-kernel-service-tags.mjs" },
  { path: "tests/task-kernel-repository-adapter.mjs" },
  { path: "tests/task-semantic-projection.mjs" },
  { path: "tests/semantic-contract-baseline.mjs" },
  { path: "tests/task-archive-eligibility.mjs" },
  { path: "tests/task-repository.mjs" },
  { path: "tests/task-tombstone-commands.mjs" },
  { path: "tests/task-operations.mjs" },
  { path: "tests/git-runner.mjs" },
  { path: "tests/harness-transaction.mjs" },
  { path: "tests/cli-write-performance.mjs" },
  { path: "tests/runtime-reliability-spike.mjs" },
  { path: "tests/command-registry.mjs" },
  { path: "tests/cli-help.mjs" },
  { path: "tests/dashboard-generation.mjs", phase: "exclusive", isolated: true },
  { path: "tests/dashboard-task-index-ui.mjs" },
  { path: "tests/dashboard-preset-ui.mjs" },
  { path: "tests/dashboard-swimlane-ui.mjs" },
  { path: "tests/dashboard-workbench.mjs", phase: "exclusive", isolated: true },
  { path: "tests/document-contract-kernel.mjs" },
  { path: "tests/template-governance.mjs" },
  { path: "tests/task-material-template-readiness.mjs" },
  { path: "tests/review-confirm-git-gate.mjs" },
  { path: "tests/lifecycle/task-index-audit-metadata.mjs" },
  { path: "tests/governance-table-boundary.mjs" },
  { path: "tests/governance-sync.mjs" },
  { path: "tests/governance-generated-indexes.mjs" },
  { path: "tests/preset-engine.mjs" },
  { path: "tests/preset-action-runner.mjs" },
  { path: "tests/release-closeout-preset.mjs" },
  { path: "tests/publish-standard-preset.mjs" },
  { path: "tests/task-lifecycle.mjs", phase: "exclusive", isolated: true },
  { path: "tests/lifecycle-queues.mjs" },
  { path: "tests/migration-adoption.mjs" },
  { path: "tests/test-harness.mjs" },
];

const forceIsolation = process.env.HARNESS_TEST_RUNNER_ISOLATE === "1";
const batchSize = Math.max(1, Number.parseInt(process.env.HARNESS_TEST_RUNNER_BATCH_SIZE || "16", 10) || 16);
const jobs = Math.max(1, Number.parseInt(process.env.HARNESS_TEST_RUNNER_JOBS || "1", 10) || 1);
const batchRunner = process.env.HARNESS_TEST_RUNNER_MODE === "built" ? path.join(runnerRoot, "tests", "run-batch.mjs") : "tests/run-batch.mts";

if (jobs === 1) {
  await runUnitsSequential(materializeUnits(suites));
} else {
  const packageUnits = materializeUnits(suites.filter((suite) => suite.phase === "package"));
  const parallelUnits = materializeUnits(suites.filter((suite) => !suite.phase));
  const exclusiveUnits = materializeUnits(suites.filter((suite) => suite.phase === "exclusive"));
  await runUnitsSequential(packageUnits);
  await runUnitsParallel(parallelUnits, jobs);
  await runUnitsSequential(exclusiveUnits);
}

console.log("Harness v1 tests passed");

function materializeUnits(selectedSuites: Suite[]): TestUnit[] {
  const units: TestUnit[] = [];
  let batch: string[] = [];
  const flushBatch = (): void => {
    if (batch.length === 0) return;
    const current = batch;
    batch = [];
    units.push({ args: [batchRunner, ...current], label: `batch:${current.length}` });
  };
  for (const suite of selectedSuites) {
    const suitePath = resolveSuitePath(suite.path);
    if (!forceIsolation && !suite.isolated) {
      batch.push(suitePath);
      if (batch.length >= batchSize) flushBatch();
      continue;
    }
    flushBatch();
    units.push({ args: [suitePath], label: suite.path });
  }
  flushBatch();
  return units;
}

async function runUnitsSequential(units: TestUnit[]): Promise<void> {
  for (const unit of units) {
    const status = runNodeSync(unit);
    if (status !== 0) process.exit(status || 1);
  }
}

async function runUnitsParallel(units: TestUnit[], concurrency: number): Promise<void> {
  let next = 0;
  let active = 0;
  let failedStatus = 0;
  await new Promise<void>((resolve) => {
    const pump = (): void => {
      if (failedStatus !== 0 && active === 0) {
        resolve();
        return;
      }
      while (failedStatus === 0 && active < concurrency && next < units.length) {
        const unit = units[next++];
        active += 1;
        runNodeAsync(unit).then((status) => {
          active -= 1;
          if (status !== 0 && failedStatus === 0) failedStatus = status;
          pump();
        });
      }
      if ((next >= units.length || failedStatus !== 0) && active === 0) resolve();
    };
    pump();
  });
  if (failedStatus !== 0) process.exit(failedStatus || 1);
}

function runNodeSync(unit: TestUnit): number {
  const started = performance.now();
  const result = spawnSync(process.execPath, unit.args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: "inherit",
  });
  const duration = formatDuration(performance.now() - started);
  if (result.status !== 0) {
    console.error(`[test] ${unit.label} failed in ${duration}`);
    return result.status || 1;
  }
  console.log(`[test] ${unit.label} passed in ${duration}`);
  return 0;
}

async function runNodeAsync(unit: TestUnit): Promise<number> {
  const started = performance.now();
  console.log(`[test] ${unit.label} started`);
  const child = spawn(process.execPath, unit.args, {
    cwd: repoRoot,
    stdio: "inherit",
  });
  const status = await new Promise<number>((resolve) => {
    child.on("error", (error) => {
      console.error(`[test] ${unit.label} failed to start: ${error.message}`);
      resolve(1);
    });
    child.on("exit", (code) => resolve(code || 0));
  });
  const duration = formatDuration(performance.now() - started);
  if (status !== 0) {
    console.error(`[test] ${unit.label} failed in ${duration}`);
    return status;
  }
  console.log(`[test] ${unit.label} passed in ${duration}`);
  return 0;
}

function resolveSuitePath(suite: string): string {
  return process.env.HARNESS_TEST_RUNNER_MODE === "built" ? path.join(runnerRoot, suite) : suite;
}

function formatDuration(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}
