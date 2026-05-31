#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { buildDashboardBundle } from "../scripts/lib/dashboard-data.mjs";
import { normalizeTarget, readJsonSafe, walkFiles } from "../scripts/lib/core-shared.mjs";
import { collectTasks, listTaskPlanPaths } from "../scripts/lib/task-scanner.mjs";
import { buildStatusData } from "../scripts/lib/status-builder.mjs";

type DashboardDocument = {
  path: string;
  partial?: boolean;
};

type DashboardBundleSnapshot = {
  schemaVersion?: string;
  status: {
    tasks: unknown[];
    git: { dirty?: boolean };
    checkState: {
      validationMode?: string;
      failures?: number;
      details: { warnings: string[] };
    };
    summary: { fullCutoverEligible?: boolean };
  };
  documents: {
    documents: DashboardDocument[];
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-architecture-health-"));

function copyMinimalProject(name: string): string {
  const target = path.join(tmpRoot, name);
  fs.cpSync(path.join(repoRoot, "examples/minimal-project"), target, { recursive: true });
  return target;
}

const statusBuilderTarget = normalizeTarget("examples/minimal-project");
const status = buildStatusData(statusBuilderTarget as Parameters<typeof buildStatusData>[0]);
assert(status.schemaVersion === 2, "status-builder should preserve status schema version");
assert(status.tasks.length === 1, "status-builder should collect tasks without validator orchestration");
assert(status.tasks[0].module === null, "v2 project-root tasks should not be treated as explicit module tasks");
assert(status.tasks[0].inferredModule === "base", "v2 project-root tasks should default to the base module bucket");
assert(status.tasks[0].classificationSource === "structure", "v2 project-root task base classification should be structure-derived");
assert(status.checkState.validationMode === "data-only", "status-builder should mark data-only status as validationMode=data-only");
assert(status.checkState.status === "pass", "data-only status should not report validator failures");
assert(status.summary.fullCutoverEligible === false, "data-only status must not claim full cutover eligibility");

const invalidReviewTarget = copyMinimalProject("invalid-review-dashboard");
fs.writeFileSync(
  path.join(invalidReviewTarget, "coding-agent-harness/planning/tasks/demo-task/review.md"),
  "# Broken Review\n\nThis intentionally lacks required review sections.\n",
);
const bundle = buildDashboardBundle(invalidReviewTarget) as DashboardBundleSnapshot;
assert(bundle.schemaVersion === "dashboard-bundle/v1", "dashboard bundle should expose explicit schema version");
assert(bundle.status.tasks.length === 1, "dashboard bundle should still include task data");
assert(bundle.status.checkState.validationMode === "data-only", "dashboard should use status-builder data-only status");
assert(bundle.status.checkState.failures === 0, "dashboard data collection should not run validator failures");
assert(bundle.status.summary.fullCutoverEligible === false, "dashboard data-only status must not claim validated cutover readiness");

const dirtyDashboardTarget = copyMinimalProject("dirty-dashboard-target");
git(dirtyDashboardTarget, ["init"]);
git(dirtyDashboardTarget, ["config", "user.name", "Harness Test"]);
git(dirtyDashboardTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(dirtyDashboardTarget, ["add", "."]);
git(dirtyDashboardTarget, ["commit", "-m", "baseline"]);
fs.writeFileSync(path.join(dirtyDashboardTarget, "DIRTY.txt"), "dirty\n");
const dirtyBundle = buildDashboardBundle(dirtyDashboardTarget) as DashboardBundleSnapshot;
assert(dirtyBundle.status.git.dirty === true, "dashboard status should expose dirty git state");
assert(
  dirtyBundle.status.checkState.details.warnings.some((warning) => warning.includes("dirty-state")),
  "dashboard warnings should include dirty-state when git state is dirty",
);

const closeoutTargetPath = copyMinimalProject("cached-closeout-target");
const closeoutTarget = normalizeTarget(closeoutTargetPath);
const taskPlanPaths = listTaskPlanPaths(closeoutTarget);
const closeoutContent = "| Task | Status |\n| --- | --- |\n| `coding-agent-harness/planning/tasks/demo-task/task_plan.md` | closed |\n";
const tasks = collectTasks(closeoutTarget, { taskPlanPaths, closeoutContent });
assert(tasks.length === 1, "collectTasks should accept precomputed task plan paths");
assert(tasks[0].closeoutStatus === "closed", "collectTasks should use provided closeoutContent instead of rereading the closeout file per task");

const historicalDashboardTarget = copyMinimalProject("historical-dashboard-target");
fs.writeFileSync(
  path.join(historicalDashboardTarget, "coding-agent-harness/planning/tasks/demo-task/progress.md"),
  "# Demo Task - Progress\n\n## Status\n\ndone\n",
);
const historicalTaskDir = path.join(historicalDashboardTarget, "coding-agent-harness/planning/tasks/demo-task");
fs.writeFileSync(
  path.join(historicalTaskDir, "visual_map.md"),
  fs.readFileSync(path.join(historicalTaskDir, "visual_map.md"), "utf8").replace("| P2 | P1 | planned | 0 |", "| P2 | P1 | done | 100 |").replace("| P2 | P1 | done | 100 | Example verification | command | missing |", "| P2 | P1 | done | 100 | Example verification | command | present |"),
);
fs.mkdirSync(path.join(historicalTaskDir, "references"), { recursive: true });
fs.mkdirSync(path.join(historicalTaskDir, "artifacts"), { recursive: true });
fs.writeFileSync(path.join(historicalTaskDir, "references/INDEX.md"), "# References\n\nheavy reference index\n");
fs.writeFileSync(path.join(historicalTaskDir, "artifacts/INDEX.md"), "# Artifacts\n\nheavy artifact index\n");
fs.writeFileSync(path.join(historicalTaskDir, "walkthrough.md"), "# Demo Task Walkthrough\n\nCloseout Status: closed\n");
const historicalBundle = buildDashboardBundle(historicalDashboardTarget) as DashboardBundleSnapshot;
const historicalDocs = historicalBundle.documents.documents.filter((document) => document.path.includes("/demo-task/"));
assert(historicalDocs.some((document) => document.path.endsWith("/brief.md") && document.partial === true), "closed historical tasks should keep a partial brief document");
assert(!historicalDocs.some((document) => document.path.endsWith("/task_plan.md")), "closed historical tasks should not eagerly load task_plan.md");
assert(!historicalDocs.some((document) => document.path.endsWith("/review.md")), "closed historical tasks should not eagerly load review.md");
assert(!historicalDocs.some((document) => document.path.endsWith("/references/INDEX.md")), "closed historical tasks should not eagerly load references index");
assert(!historicalDocs.some((document) => document.path.endsWith("/artifacts/INDEX.md")), "closed historical tasks should not eagerly load artifacts index");

const walkRoot = path.join(tmpRoot, "walk-filter");
fs.mkdirSync(path.join(walkRoot, "keep"), { recursive: true });
fs.mkdirSync(path.join(walkRoot, "skip"), { recursive: true });
fs.writeFileSync(path.join(walkRoot, "keep/visible.txt"), "visible\n");
fs.writeFileSync(path.join(walkRoot, "skip/hidden.txt"), "hidden\n");
const filteredFiles = walkFiles(walkRoot, { dirFilter: (dirName: string) => dirName !== "skip" }).map((file) => path.relative(walkRoot, file));
assert(filteredFiles.includes("keep/visible.txt"), "walkFiles dirFilter should keep accepted directories");
assert(!filteredFiles.includes("skip/hidden.txt"), "walkFiles dirFilter should skip rejected directories");

const validJson = path.join(tmpRoot, "valid.json");
const invalidJson = path.join(tmpRoot, "invalid.json");
fs.writeFileSync(validJson, JSON.stringify({ ok: true }));
fs.writeFileSync(invalidJson, "{broken");
assert(readJsonSafe(validJson, { ok: false }).ok === true, "readJsonSafe should parse valid JSON files");
assert(readJsonSafe(path.join(tmpRoot, "missing.json"), { missing: true }).missing === true, "readJsonSafe should return fallback for missing files");
assert(readJsonSafe(invalidJson, { invalid: true }).invalid === true, "readJsonSafe should return fallback for invalid JSON");

function git(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  return result;
}
