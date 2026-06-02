#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeTarget } from "../scripts/lib/core-shared.mjs";
import { buildStatusData } from "../scripts/lib/status-builder.mjs";
import { collectTasks, listTaskPlanPaths } from "../scripts/lib/task-scanner.mjs";
import { createScannerTaskRepository } from "../scripts/lib/task-repository.mjs";

type ComparableTask = {
  id?: string;
  taskPlanPath?: string;
  state?: string;
  reviewStatus?: string;
  reviewQueueState?: string;
  materialsReady?: boolean;
  taskQueues?: unknown[];
  queueReasons?: unknown[];
  materialIssues?: unknown[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function copyMinimalProject(name: string): string {
  const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "harness-task-repository-")), name);
  fs.cpSync(path.join(repoRoot, "examples/minimal-project"), target, { recursive: true });
  return target;
}

function queueComparable(task: ComparableTask): ComparableTask {
  return {
    id: task.id,
    taskPlanPath: task.taskPlanPath,
    state: task.state,
    reviewStatus: task.reviewStatus,
    reviewQueueState: task.reviewQueueState,
    materialsReady: task.materialsReady,
    taskQueues: task.taskQueues,
    queueReasons: task.queueReasons,
    materialIssues: task.materialIssues,
  };
}

function assertJsonEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(actualJson === expectedJson, `${message}\nActual: ${actualJson}\nExpected: ${expectedJson}`);
}

const targetPath = copyMinimalProject("minimal");
const target = normalizeTarget(targetPath);
const repository = createScannerTaskRepository(target);
const legacyTaskPlanPaths = listTaskPlanPaths(target);
const legacyTasks = collectTasks(target, { taskPlanPaths: legacyTaskPlanPaths });
const repositoryTasks = repository.list();

assert(repositoryTasks.length === legacyTasks.length, "repository list should preserve task count");
assertJsonEqual(repositoryTasks.map(queueComparable), legacyTasks.map(queueComparable), "repository list should preserve scanner queue/material fields");

const task = repository.get({ id: "TASKS/demo-task" });
assert(task.id === "TASKS/demo-task", "repository get should find a task by canonical id");
assert(repository.get({ id: "demo-task" }).id === task.id, "repository get should find a task by short id");
assert(repository.get({ path: path.join(targetPath, "coding-agent-harness/planning/tasks/demo-task/task_plan.md") }).id === task.id, "repository get should find a task by task_plan path");

const location = repository.resolve({ id: "demo-task" });
assert(location.id === "TASKS/demo-task", "repository resolve should return canonical task id");
assert(location.directory.endsWith("coding-agent-harness/planning/tasks/demo-task"), "repository resolve should return the task directory");
assert(location.taskPlanPath.endsWith("coding-agent-harness/planning/tasks/demo-task/task_plan.md"), "repository resolve should return the task plan path");

const tombstoneSubject = repository.getTombstoneSubject({ id: "demo-task" });
assert(tombstoneSubject.id === "TASKS/demo-task", "repository tombstone subject should preserve canonical task id");
assert(tombstoneSubject.paths.relativeDirectory === "coding-agent-harness/planning/tasks/demo-task", "repository tombstone subject should expose normalized relative directory");
assert(tombstoneSubject.paths.relativeTaskPlanPath === "coding-agent-harness/planning/tasks/demo-task/task_plan.md", "repository tombstone subject should expose normalized task_plan path");
assert(tombstoneSubject.paths.relativeProgressPath === "coding-agent-harness/planning/tasks/demo-task/progress.md", "repository tombstone subject should expose normalized progress path");
assert(tombstoneSubject.policy.state === task.state, "repository tombstone subject should expose lifecycle state as policy facts");
assertJsonEqual(tombstoneSubject.policy.taskQueues, task.taskQueues, "repository tombstone subject should preserve projected queue policy facts");

const materials = repository.readMaterials({ id: "demo-task" });
assert(materials.taskPlan.content.includes("Task Contract: harness-task/v1"), "repository materials should read task_plan.md");
assert(materials.brief.content.includes("Minimal example task"), "repository materials should read brief.md");
assert(materials.visualMap.content.includes("Visual Map Contract"), "repository materials should read visual_map.md");

const status = buildStatusData(target as Parameters<typeof buildStatusData>[0]);
assertJsonEqual(
  status.tasks.map(queueComparable),
  repositoryTasks.map(queueComparable),
  "status-builder should preserve repository task queue/material projection",
);

const missingTargetPath = copyMinimalProject("missing-materials");
const missingTaskDir = path.join(missingTargetPath, "coding-agent-harness/planning/tasks/demo-task");
fs.writeFileSync(path.join(missingTaskDir, "progress.md"), "# Demo Task Progress\n\n## Status\n\nreview\n");
fs.writeFileSync(path.join(missingTaskDir, "review.md"), "# Broken Review\n\n");
const missingTarget = normalizeTarget(missingTargetPath);
const missingRepositoryTask = createScannerTaskRepository(missingTarget).get({ id: "TASKS/demo-task" });
const missingLegacyTask = collectTasks(missingTarget, { taskPlanPaths: listTaskPlanPaths(missingTarget) })[0];
assert(missingRepositoryTask.queueReasons.length > 0 || missingRepositoryTask.materialIssues.length > 0, "missing-material fixture should exercise queue/material readiness fields");
assertJsonEqual(queueComparable(missingRepositoryTask), queueComparable(missingLegacyTask), "repository should not drift unknown queue/material readiness behavior");

console.log("Task repository compatibility tests passed");
