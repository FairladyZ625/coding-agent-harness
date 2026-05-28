#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const testRunnerOutDir = process.env.HARNESS_TEST_RUNNER_OUT_DIR || "";
const snapshotMatrixCli = testRunnerOutDir
  ? path.join(testRunnerOutDir, "tests/scripts/snapshot-matrix.mjs")
  : path.join(repoRoot, "tests/scripts/snapshot-matrix.mts");
const {
  compareSnapshotMatrices,
  normalizeSnapshotMatrix,
  runSnapshotSelfTest,
  snapshotCommands,
} = await import(pathToFileURL(snapshotMatrixCli).href) as {
  compareSnapshotMatrices: (before: SnapshotMatrix, after: SnapshotMatrix) => SnapshotDiff;
  normalizeSnapshotMatrix: (matrix: SnapshotMatrix, options: { repoRoot: string }) => SnapshotMatrix;
  runSnapshotSelfTest: (options: { repoRoot: string; outDir: string }) => { ok: boolean; diff: SnapshotDiff };
  snapshotCommands: SnapshotCommand[];
};

type SnapshotCommand = { id: string };
type SnapshotDrift = { code: string };
type SnapshotDiff = {
  ok: boolean;
  markdown: string;
  drifts: SnapshotDrift[];
};
type SnapshotCapture = {
  exitCode?: number;
  stdout?: unknown;
  stderr?: string;
  command?: string;
  durationMs?: number;
};
type SnapshotMatrix = {
  generatedAt?: string;
  captures?: Record<string, SnapshotCapture>;
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

assert(snapshotCommands.length === 6, `expected 6 snapshot commands, got ${snapshotCommands.length}`);
assert(snapshotCommands.some((command) => command.id === "status"), "snapshot matrix should capture status");
assert(snapshotCommands.some((command) => command.id === "task-list"), "snapshot matrix should capture task-list");
assert(snapshotCommands.some((command) => command.id === "preset-list"), "snapshot matrix should capture preset list");
assert(snapshotCommands.some((command) => command.id === "source-check"), "snapshot matrix should capture source check");
assert(snapshotCommands.some((command) => command.id === "target-check"), "snapshot matrix should capture target check");
assert(snapshotCommands.some((command) => command.id === "migrate-plan"), "snapshot matrix should capture migrate-plan");

const normalized = normalizeSnapshotMatrix(
  {
    generatedAt: "2026-05-28T12:34:56.789Z",
    captures: {
      status: {
        command: "node /Users/example/repo/dist/harness.mjs status --json /Users/example/repo",
        exitCode: 0,
        stdout: {
          generatedAt: "2026-05-28T12:34:56.789Z",
          durationMs: 123,
          target: "/Users/example/repo",
          temp: "/var/folders/abc/tmp/run-123",
        },
        stderr: "Warning from /Users/example/repo",
        durationMs: 456,
      },
    },
  },
  { repoRoot: "/Users/example/repo" },
);

assert(normalized.generatedAt === "<timestamp>", "top-level generatedAt should normalize");
const normalizedStatus = normalized.captures?.status;
const normalizedStdout = normalizedStatus?.stdout as { generatedAt: string; durationMs: string; target: string; temp: string };
assert(typeof normalizedStatus?.command === "string" && normalizedStatus.command.includes("<repo>"), "command should normalize repo path");
assert(normalizedStdout.generatedAt === "<timestamp>", "nested timestamp should normalize");
assert(normalizedStdout.durationMs === "<duration>", "duration field should normalize");
assert(normalizedStdout.target === "<repo>", "repo path should normalize");
assert(normalizedStdout.temp.includes("<tmp>"), "tmp path should normalize");

const before = {
  captures: {
    "task-list": { exitCode: 0, stdout: { tasks: [{ id: "a" }] } },
    "preset-list": { exitCode: 0, stdout: { presets: [{ id: "core" }] } },
  },
};
const after = {
  captures: {
    "task-list": { exitCode: 0, stdout: { tasks: [{ id: "a" }] } },
    "preset-list": { exitCode: 0, stdout: { presets: [{ id: "core" }] } },
  },
};
const cleanDiff = compareSnapshotMatrices(before, after);
assert(cleanDiff.ok === true, `identical normalized snapshots should pass:\n${cleanDiff.markdown}`);

const drift = compareSnapshotMatrices(before, {
  captures: {
    "task-list": { exitCode: 1, stdout: { tasks: [{ id: "a" }, { id: "b" }] } },
    "preset-list": { exitCode: 0, stdout: { presets: [{ id: "core" }, { id: "extra" }] } },
  },
});
assert(drift.ok === false, "blocking snapshot drift should fail");
assert(drift.drifts.some((entry) => entry.code === "exit-code"), "diff should report exit code drift");
assert(drift.drifts.some((entry) => entry.code === "task-count"), "diff should report task count drift");
assert(drift.drifts.some((entry) => entry.code === "preset-id-set"), "diff should report preset id set drift");
assert(drift.markdown.includes("Snapshot Matrix Diff"), "diff should render markdown");

const textDrift = compareSnapshotMatrices(
  { captures: { "source-check": { exitCode: 0, stdout: "Harness check passed\nWarning: before\n", stderr: "" } } },
  { captures: { "source-check": { exitCode: 0, stdout: "Harness check passed\nWarning: after\n", stderr: "" } } },
);
assert(textDrift.ok === false, "normalized text output drift should fail");
assert(textDrift.drifts.some((entry) => entry.code === "stdout-text"), "diff should report stdout text drift");

const migrationDrift = compareSnapshotMatrices(
  {
    captures: {
      "migrate-plan": {
        exitCode: 0,
        stdout: {
          summary: { taskActions: 1, visualMapActions: 0, legacyResiduals: 1 },
          taskActions: [{ id: "task-a" }],
          visualMapActions: [],
          legacyActions: [],
          legacyResiduals: [{ id: "legacy-a" }],
        },
      },
    },
  },
  {
    captures: {
      "migrate-plan": {
        exitCode: 0,
        stdout: {
          summary: { taskActions: 2, visualMapActions: 1, legacyResiduals: 2 },
          taskActions: [{ id: "task-a" }, { id: "task-b" }],
          visualMapActions: [{ id: "visual-a" }],
          legacyActions: [{ id: "legacy-action-a" }],
          legacyResiduals: [{ id: "legacy-a" }, { id: "legacy-b" }],
        },
      },
    },
  },
);
assert(migrationDrift.ok === false, "migrate-plan action/residual count drift should fail");
assert(migrationDrift.drifts.some((entry) => entry.code === "migration-task-actions"), "diff should report taskActions drift");
assert(migrationDrift.drifts.some((entry) => entry.code === "migration-visual-map-actions"), "diff should report visualMapActions drift");
assert(migrationDrift.drifts.some((entry) => entry.code === "migration-legacy-actions"), "diff should report legacyActions drift");
assert(migrationDrift.drifts.some((entry) => entry.code === "migration-legacy-residuals"), "diff should report legacyResiduals drift");

const limitedMigrationDrift = compareSnapshotMatrices(
  {
    captures: {
      "migrate-plan": {
        exitCode: 0,
        stdout: {
          summary: { taskActions: 21, legacyReferenceGaps: 21, legacyResiduals: 21 },
          taskActions: Array.from({ length: 20 }, (_, index) => ({ id: `task-${index}` })),
          legacyActions: Array.from({ length: 20 }, (_, index) => ({ id: `legacy-action-${index}` })),
          legacyResiduals: Array.from({ length: 20 }, (_, index) => ({ id: `legacy-${index}` })),
        },
      },
    },
  },
  {
    captures: {
      "migrate-plan": {
        exitCode: 0,
        stdout: {
          summary: { taskActions: 22, legacyReferenceGaps: 22, legacyResiduals: 22 },
          taskActions: Array.from({ length: 20 }, (_, index) => ({ id: `task-${index}` })),
          legacyActions: Array.from({ length: 20 }, (_, index) => ({ id: `legacy-action-${index}` })),
          legacyResiduals: Array.from({ length: 20 }, (_, index) => ({ id: `legacy-${index}` })),
        },
      },
    },
  },
);
assert(limitedMigrationDrift.ok === false, "summary count drift should fail even when limited top-level arrays stay the same length");
assert(limitedMigrationDrift.drifts.some((entry) => entry.code === "migration-task-actions"), "diff should prefer summary taskActions count over limited array length");
assert(limitedMigrationDrift.drifts.some((entry) => entry.code === "migration-legacy-actions"), "diff should prefer summary legacyReferenceGaps count over limited legacyActions array length");
assert(limitedMigrationDrift.drifts.some((entry) => entry.code === "migration-legacy-residuals"), "diff should prefer summary legacyResiduals count over limited array length");

const selfTestDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-snapshot-self-test-"));
const selfTest = runSnapshotSelfTest({ repoRoot, outDir: selfTestDir });
assert(selfTest.ok === true, `snapshot self-test should pass:\n${selfTest.diff.markdown}`);
assert(fs.existsSync(path.join(selfTestDir, "before", "matrix.normalized.json")), "self-test should write before normalized matrix");
assert(fs.existsSync(path.join(selfTestDir, "after", "matrix.normalized.json")), "self-test should write after normalized matrix");
assert(fs.existsSync(path.join(selfTestDir, "diff.md")), "self-test should write diff markdown");

const cliDir = fs.mkdtempSync(path.join(os.tmpdir(), "harness-snapshot-cli-"));
const beforeDir = path.join(cliDir, "before");
const afterDir = path.join(cliDir, "after");
const diffPath = path.join(cliDir, "diff.md");
for (const [label, outDir] of [
  ["before", beforeDir],
  ["after", afterDir],
]) {
  const result = spawnSync(process.execPath, [snapshotMatrixCli, "capture", "--label", label, "--out-dir", outDir], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(result.status === 0, `snapshot capture CLI should pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert(fs.existsSync(path.join(outDir, "matrix.normalized.json")), `snapshot capture CLI should write ${label} normalized matrix`);
}
const diffCli = spawnSync(
  process.execPath,
  [snapshotMatrixCli, "diff", "--before-dir", beforeDir, "--after-dir", afterDir, "--out", diffPath],
  { cwd: repoRoot, encoding: "utf8" },
);
assert(diffCli.status === 0, `snapshot diff CLI should pass\nSTDOUT:\n${diffCli.stdout}\nSTDERR:\n${diffCli.stderr}`);
assert(fs.existsSync(diffPath), "snapshot diff CLI should write diff markdown");

console.log("Snapshot matrix tooling tests passed");
