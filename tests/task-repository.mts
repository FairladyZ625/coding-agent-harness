#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeTarget } from "../scripts/lib/core-shared.mjs";
import {
  createScannerTaskOperationSubjectReader,
  createScannerTaskTombstoneSubjectReader,
} from "../scripts/adapters/cli/task-operation-subject-reader.mjs";
import { buildTaskOperationSubject, buildTaskTombstoneSubject } from "../scripts/domain/task/task-subjects.mjs";
import { buildStatusData } from "../scripts/lib/status-builder.mjs";
import { collectTasks, listTaskPlanPaths } from "../scripts/lib/task-scanner.mjs";
import { createScannerTaskRepository, createTaskStatusProjectionReader, createTaskWorkbenchReviewSubjectReader } from "../scripts/lib/task-repository.mjs";

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

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const statusProjectionKeys = [
  "aliases",
  "archiveEligible",
  "archiveMetadata",
  "briefPath",
  "briefQuality",
  "briefSource",
  "budget",
  "classificationBucket",
  "classificationSource",
  "closeoutStatus",
  "completion",
  "currentPath",
  "dashboardTaskView",
  "deleteReason",
  "deletionState",
  "dependencies",
  "evidence",
  "evidenceBundle",
  "executionStrategyPath",
  "findingsPath",
  "handoffs",
  "hiddenByDefault",
  "id",
  "identitySource",
  "inferredModule",
  "legacyVisualRoadmapPresent",
  "lessonCandidateCloseoutToken",
  "lessonCandidateDecisionComplete",
  "lessonCandidateIssues",
  "lessonCandidateOpenCount",
  "lessonCandidatePath",
  "lessonCandidatePromotionState",
  "lessonCandidateReviewDecision",
  "lessonCandidateRowCount",
  "lessonCandidateRows",
  "lessonCandidateStatus",
  "lifecycleState",
  "longRunningContractPath",
  "longRunningContractStatus",
  "materialIssues",
  "materialsReady",
  "migrationAchievedLevel",
  "migrationClassification",
  "migrationSnapshot",
  "migrationTargetLevel",
  "module",
  "originalPath",
  "path",
  "phases",
  "presetVersion",
  "progressPath",
  "queueReasons",
  "reopenEligible",
  "repairPrompt",
  "reviewConfirmation",
  "reviewPath",
  "reviewQueueState",
  "reviewStatus",
  "reviewSubmission",
  "reviewSubmitted",
  "reviewWorkbenchQueueView",
  "risks",
  "roadmapSource",
  "scaffoldProvenance",
  "semanticProjection",
  "shortId",
  "state",
  "stateConflicts",
  "stateRaw",
  "stateSource",
  "supersededBy",
  "supersedes",
  "taskAudit",
  "taskContractGenerated",
  "taskContractVersion",
  "taskKey",
  "taskKind",
  "taskLifecycleProjection",
  "taskPlanPath",
  "taskPreset",
  "taskQueues",
  "title",
  "tombstoneSourcePath",
  "visibility",
  "visibilityScopes",
  "visualMapPath",
  "visualMapSource",
  "visualMapStatus",
  "walkthroughPath",
].sort();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function copyMinimalProject(name: string): string {
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

function statusProjectionComparable(task: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(statusProjectionKeys.map((key) => [key, task[key]]));
}

function assertJsonEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(actualJson === expectedJson, `${message}\nActual: ${actualJson}\nExpected: ${expectedJson}`);
}

const targetPath = copyMinimalProject("minimal");
const target = normalizeTarget(targetPath);
const repository = createScannerTaskRepository(target);
const statusProjectionReader = createTaskStatusProjectionReader(target);
const workbenchReviewSubjectReader = createTaskWorkbenchReviewSubjectReader(target);
const legacyTaskPlanPaths = listTaskPlanPaths(target);
const legacyTasks = collectTasks(target, { taskPlanPaths: legacyTaskPlanPaths });
const repositoryTasks = repository.list();
const statusProjectionTasks = statusProjectionReader.listStatusTasks();
const workbenchReviewSubjects = workbenchReviewSubjectReader.listWorkbenchReviewSubjects();
const statusProjectionTypeKeys = topLevelStatusProjectionTypeKeys();

assert(repositoryTasks.length === legacyTasks.length, "repository list should preserve task count");
assert(workbenchReviewSubjects.length === repositoryTasks.length, "workbench review subject reader should preserve task count without exposing scanner records");
assertJsonEqual(repositoryTasks.map(queueComparable), legacyTasks.map(queueComparable), "repository list should preserve scanner queue/material fields");
assertJsonEqual(statusProjectionTasks.map(queueComparable), repositoryTasks.map(queueComparable), "status projection reader should preserve queue/material fields without exposing scanner repository to status-builder");
assertJsonEqual(statusProjectionTypeKeys, statusProjectionKeys, "TaskStatusProjection type keys must match the runtime status projection allowlist");
assertJsonEqual(Object.keys(statusProjectionTasks[0] || {}).sort(), statusProjectionKeys, "status projection reader should expose only the explicit status/dashboard contract field allowlist");
assertJsonEqual(
  statusProjectionTasks.map((item) => statusProjectionComparable(item as Record<string, unknown>)),
  repositoryTasks.map((item) => statusProjectionComparable(item as Record<string, unknown>)),
  "status projection reader should preserve every explicit status/dashboard contract field from the scanner-backed repository source",
);

const task = repository.get({ id: "TASKS/demo-task" });
const workbenchReviewSubject = workbenchReviewSubjects.find((subject) => subject.id === task.id);
assert(workbenchReviewSubject, "workbench review subject reader should include the demo task");
assert(workbenchReviewSubject.aliases.includes(task.id) && workbenchReviewSubject.aliases.includes(task.shortId), "workbench review subject should expose only lookup aliases needed by bulk review actions");
assert(workbenchReviewSubject.paths.directory === path.dirname(absoluteTargetPath(targetPath, task.taskPlanPath)), "workbench review subject should expose task directory for review-confirm context");
assert(workbenchReviewSubject.confirmText === task.shortId, "workbench review subject should expose the human confirm text without leaking the full TaskRecord");
assertJsonEqual(workbenchReviewSubject.reviewTask, {
  id: task.id,
  reviewStatus: task.reviewStatus,
  walkthroughPath: task.walkthroughPath,
  reviewQueueState: task.reviewQueueState,
  state: task.state,
  taskQueues: task.taskQueues,
  lessonCandidateDecisionComplete: task.lessonCandidateDecisionComplete,
  lessonCandidateStatus: task.lessonCandidateStatus,
}, "workbench review subject should preserve the review gate facts used by review-confirm");
assertJsonEqual(workbenchReviewSubject.semanticProjection.taskLifecycleProjection, task.taskLifecycleProjection, "workbench review subject should preserve lifecycle projection for bulk review gating");
assertJsonEqual(workbenchReviewSubject.semanticProjection.reviewWorkbenchQueueView, task.reviewWorkbenchQueueView, "workbench review subject should preserve workbench queue projection for bulk review gating");
assert(!("taskPlanPath" in workbenchReviewSubject), "workbench review subject should not expose raw scanner taskPlanPath");
assert(!("path" in workbenchReviewSubject), "workbench review subject should not expose raw scanner path");
assert(task.id === "TASKS/demo-task", "repository get should find a task by canonical id");
assert(repository.get({ id: "demo-task" }).id === task.id, "repository get should find a task by short id");
assert(repository.get({ path: path.join(targetPath, "coding-agent-harness/planning/tasks/demo-task/task_plan.md") }).id === task.id, "repository get should find a task by task_plan path");

const location = repository.resolve({ id: "demo-task" });
assert(location.id === "TASKS/demo-task", "repository resolve should return canonical task id");
assert(location.directory.endsWith("coding-agent-harness/planning/tasks/demo-task"), "repository resolve should return the task directory");
assert(location.taskPlanPath.endsWith("coding-agent-harness/planning/tasks/demo-task/task_plan.md"), "repository resolve should return the task plan path");

const tombstoneSubject = repository.getTombstoneSubject({ id: "demo-task" });
const adapterTombstoneSubject = createScannerTaskTombstoneSubjectReader(target).getTombstoneSubject({ id: "demo-task" });
assert(tombstoneSubject.id === "TASKS/demo-task", "repository tombstone subject should preserve canonical task id");
assert(tombstoneSubject.paths.relativeDirectory === "coding-agent-harness/planning/tasks/demo-task", "repository tombstone subject should expose normalized relative directory");
assert(tombstoneSubject.paths.relativeTaskPlanPath === "coding-agent-harness/planning/tasks/demo-task/task_plan.md", "repository tombstone subject should expose normalized task_plan path");
assert(tombstoneSubject.paths.relativeProgressPath === "coding-agent-harness/planning/tasks/demo-task/progress.md", "repository tombstone subject should expose normalized progress path");
assert(tombstoneSubject.policy.state === task.state, "repository tombstone subject should expose lifecycle state as policy facts");
assertJsonEqual(tombstoneSubject.policy.taskQueues, task.taskQueues, "repository tombstone subject should preserve projected queue policy facts");
assertJsonEqual(adapterTombstoneSubject, tombstoneSubject, "tombstone subject CLI adapter should preserve repository tombstone subject semantics without exposing TaskRepository to commands");

const operationSubject = repository.getOperationSubject({ id: "demo-task" });
const adapterOperationSubject = createScannerTaskOperationSubjectReader(target).getOperationSubject({ id: "demo-task" });
const adapterPlanningPathOperationSubject = createScannerTaskOperationSubjectReader(target).getOperationSubject({ id: "coding-agent-harness/planning/tasks/demo-task" });
const adapterShortPlanningPathOperationSubject = createScannerTaskOperationSubjectReader(target).getOperationSubject({ id: "planning/tasks/demo-task" });
const adapterTaskPlanPathOperationSubject = createScannerTaskOperationSubjectReader(target).getOperationSubject({ id: path.join(targetPath, "coding-agent-harness/planning/tasks/demo-task/task_plan.md") });
assert(operationSubject.id === "TASKS/demo-task", "repository operation subject should preserve canonical task id");
assert(!("taskPlanPath" in operationSubject), "repository operation subject should not expose raw scanner taskPlanPath");
assert(!("path" in operationSubject), "repository operation subject should not expose raw scanner path");
assertJsonEqual(operationSubject.semanticProjection.taskLifecycleProjection.taskQueues, task.taskLifecycleProjection.taskQueues, "repository operation subject should expose projected lifecycle queues");
assertJsonEqual(operationSubject.semanticProjection.reviewWorkbenchQueueView.queues, task.reviewWorkbenchQueueView.queues, "repository operation subject should expose projected workbench queues");
assertJsonEqual(adapterOperationSubject, operationSubject, "operation subject CLI adapter should preserve repository operation subject semantics without importing TaskRepository");
assertJsonEqual(adapterPlanningPathOperationSubject, operationSubject, "operation subject CLI adapter should preserve repository planning path task references");
assertJsonEqual(adapterShortPlanningPathOperationSubject, operationSubject, "operation subject CLI adapter should preserve repository short planning path task references");
assertJsonEqual(adapterTaskPlanPathOperationSubject, operationSubject, "operation subject CLI adapter should preserve repository task_plan path references passed as ids");
const scannerTaskWithoutAttachedProjection = {
  ...task,
  semanticProjection: undefined,
  taskLifecycleProjection: undefined,
  reviewWorkbenchQueueView: undefined,
};
assertJsonEqual(
  buildTaskOperationSubject(scannerTaskWithoutAttachedProjection),
  operationSubject,
  "task subject domain mapper should preserve repository fallback semantics when scanner records do not have attached projections",
);
const partialProjectionSubject = buildTaskOperationSubject({
  id: "partial-projection",
  budget: "standard",
  semanticProjection: {
    taskLifecycleProjection: operationSubject.semanticProjection.taskLifecycleProjection,
  },
  reviewWorkbenchQueueView: operationSubject.semanticProjection.reviewWorkbenchQueueView,
  risks: [
    { id: "closed-risk", open: "no", blocksRelease: "yes", severity: "P1" },
    { id: "blocking-risk", open: "yes", blocksRelease: "yes", severity: "P3" },
    { id: "p2-risk", open: "open", blocksRelease: "no", severity: "P2" },
    { id: "nonblocking-risk", open: "yes", blocksRelease: "no", severity: "P3" },
  ],
});
assertJsonEqual(partialProjectionSubject.semanticProjection, operationSubject.semanticProjection, "task subject domain mapper should combine partial semanticProjection with direct projection fields");
assertJsonEqual(partialProjectionSubject.blockingReviewRisks.map((risk) => risk.id), ["blocking-risk", "p2-risk"], "task subject domain mapper should filter blocking review risks consistently");
const invalidReviewConfirmationSubject = buildTaskTombstoneSubject(
  { id: "review-confirmation-fixture", reviewConfirmation: null, risks: [] },
  {
    location: tombstoneSubject.location,
    paths: tombstoneSubject.paths,
  },
);
const validReviewConfirmationSubject = buildTaskTombstoneSubject(
  { id: "review-confirmation-fixture", reviewConfirmation: { confirmed: true, reviewer: "Human Reviewer" }, risks: [] },
  {
    location: tombstoneSubject.location,
    paths: tombstoneSubject.paths,
  },
);
assert(invalidReviewConfirmationSubject.policy.reviewConfirmation === null, "task subject domain mapper should normalize missing reviewConfirmation to null");
assert(validReviewConfirmationSubject.policy.reviewConfirmation?.confirmed === true, "task subject domain mapper should preserve object reviewConfirmation facts");

const materials = repository.readMaterials({ id: "demo-task" });
assert(materials.taskPlan.content.includes("Task Contract: harness-task/v1"), "repository materials should read task_plan.md");
assert(materials.brief.content.includes("Minimal example task"), "repository materials should read brief.md");
assert(materials.visualMap.content.includes("Visual Map Contract"), "repository materials should read visual_map.md");

const status = buildStatusData(target as Parameters<typeof buildStatusData>[0]);
assertJsonEqual(
  status.tasks.map(queueComparable),
  statusProjectionTasks.map(queueComparable),
  "status-builder should preserve task status projection queue/material semantics",
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

function topLevelStatusProjectionTypeKeys(): string[] {
  const source = fs.readFileSync(path.join(repoRoot, "scripts/lib/types/task-repository.ts"), "utf8");
  const match = source.match(/export type TaskStatusProjection = \{\n([\s\S]*?)\n\};/);
  assert(match, "TaskStatusProjection type declaration should be parseable");
  return [...match[1].matchAll(/^\s{2}([A-Za-z0-9_]+)\?:/gm)].map((item) => item[1]).sort();
}

function absoluteTargetPath(projectRoot: string, rawPath: string): string {
  const withoutTarget = String(rawPath || "").replace(/^TARGET:/, "");
  if (path.isAbsolute(withoutTarget)) return withoutTarget;
  return path.join(projectRoot, withoutTarget.replace(/^\/+/, ""));
}
