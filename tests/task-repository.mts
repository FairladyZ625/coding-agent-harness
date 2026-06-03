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
import { createScannerTaskRepository, createTaskCheckProfileReader, createTaskGovernanceProjectionReader, createTaskIndexProjectionReader, createTaskLessonPromotionReader, createTaskLifecycleReader, createTaskModuleReferenceReader, createTaskPlanContractReader, createTaskReviewConfirmationSubjectReader, createTaskStatusProjectionReader, createTaskWorkbenchReviewSubjectReader } from "../scripts/lib/task-repository.mjs";

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

const taskIndexProjectionKeys = [
  "aliases",
  "archiveMetadata",
  "briefPath",
  "closeoutStatus",
  "completion",
  "currentPath",
  "deletionState",
  "deleteReason",
  "evidenceBundle",
  "executionStrategyPath",
  "findingsPath",
  "hiddenByDefault",
  "id",
  "identitySource",
  "inferredModule",
  "lessonCandidateIssues",
  "lessonCandidatePath",
  "lessonCandidatePromotionState",
  "lessonCandidateReviewDecision",
  "lessonCandidateRows",
  "lessonCandidateStatus",
  "lifecycleState",
  "materialIssues",
  "materialsReady",
  "module",
  "namespace",
  "originalPath",
  "packageRole",
  "path",
  "presetVersion",
  "progressPath",
  "queueReasons",
  "repairPrompt",
  "reviewPath",
  "reviewQueueState",
  "reviewStatus",
  "reviewSubmitted",
  "risks",
  "shortId",
  "state",
  "stateConflicts",
  "supersededBy",
  "supersedes",
  "taskKey",
  "taskKind",
  "taskPlanPath",
  "taskPreset",
  "taskQueues",
  "taskRootKind",
  "title",
  "visibilityScopes",
  "visualMapPath",
  "walkthroughPath",
].sort();

const planContractTaskKeys = [
  "path",
  "taskPlanPath",
].sort();

const lessonPromotionTaskKeys = [
  "id",
  "paths",
  "shortId",
].sort();

const checkProfileTaskKeys = [
  "briefQuality",
  "briefSource",
  "budget",
  "closeoutStatus",
  "evidenceBundle",
  "materialIssues",
  "migrationAchievedLevel",
  "migrationClassification",
  "migrationSnapshot",
  "migrationTargetLevel",
  "path",
  "phases",
  "presetVersion",
  "state",
  "stateRaw",
  "stateSource",
  "taskKind",
  "taskPlanPath",
  "taskPreset",
  "visualMapPath",
  "visualMapSource",
  "visualMapStatus",
].sort();

const governanceProjectionKeys = [
  "closeoutStatus",
  "deletionState",
  "id",
  "lessonCandidateDecisionComplete",
  "lessonCandidateStatus",
  "lifecycleState",
  "materialIssues",
  "materialsReady",
  "module",
  "path",
  "reviewPath",
  "reviewQueueState",
  "reviewStatus",
  "reviewSubmitted",
  "shortId",
  "state",
  "stateConflicts",
  "taskKey",
  "taskLifecycleProjection",
  "taskPlanPath",
  "taskQueues",
  "title",
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

function sortComparableTasks(tasks: ComparableTask[]): ComparableTask[] {
  return [...tasks].sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));
}

function governanceQueueComparable(task: ComparableTask): ComparableTask {
  const comparable = queueComparable(task);
  delete comparable.queueReasons;
  return comparable;
}

function statusProjectionComparable(task: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(statusProjectionKeys.map((key) => [key, task[key]]));
}

function taskIndexProjectionComparable(task: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(taskIndexProjectionKeys.map((key) => [key, task[key]]));
}

function checkProfileTaskComparable(task: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(checkProfileTaskKeys.map((key) => [key, task[key]]));
}

function governanceProjectionComparable(task: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(governanceProjectionKeys.map((key) => [key, task[key]]));
}

function expectedTaskIndexProjectionComparableFromRepository(task: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(taskIndexProjectionKeys.map((key) => {
    if (key === "namespace") return [key, task[key] || "main"];
    if (key === "packageRole") return [key, task[key] || "local"];
    if (key === "taskRootKind") return [key, task[key] || (task.module ? "module-task" : "project-task")];
    return [key, task[key]];
  }));
}

function assertJsonEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  assert(actualJson === expectedJson, `${message}\nActual: ${actualJson}\nExpected: ${expectedJson}`);
}

const targetPath = copyMinimalProject("minimal");
const target = normalizeTarget(targetPath);
const repository = createScannerTaskRepository(target);
const taskIndexProjectionReader = createTaskIndexProjectionReader(target);
const governanceProjectionReader = createTaskGovernanceProjectionReader(target);
const planContractReader = createTaskPlanContractReader(target);
const lessonPromotionReader = createTaskLessonPromotionReader(target);
const checkProfileReader = createTaskCheckProfileReader(target);
const lifecycleReader = createTaskLifecycleReader(target);
const statusProjectionReader = createTaskStatusProjectionReader(target);
const reviewConfirmationSubjectReader = createTaskReviewConfirmationSubjectReader(target);
const workbenchReviewSubjectReader = createTaskWorkbenchReviewSubjectReader(target);
const legacyTaskPlanPaths = listTaskPlanPaths(target);
const legacyTasks = collectTasks(target, { taskPlanPaths: legacyTaskPlanPaths });
const repositoryTasks = repository.list();
const taskIndexProjectionTasks = taskIndexProjectionReader.listTaskIndexTasks();
const governanceProjectionTasks = governanceProjectionReader.listGovernanceTasks();
const planContractTasks = planContractReader.listPlanContractTasks();
const checkProfileTasks = checkProfileReader.listCheckProfileTasks();
const lifecycleTasks = lifecycleReader.listLifecycleTasks();
const statusProjectionTasks = statusProjectionReader.listStatusTasks();
const workbenchReviewSubjects = workbenchReviewSubjectReader.listWorkbenchReviewSubjects();
const statusProjectionTypeKeys = topLevelStatusProjectionTypeKeys();
const taskIndexProjectionTypeKeys = topLevelProjectionTypeKeys("TaskIndexProjection");
const checkProfileTaskTypeKeys = topLevelProjectionTypeKeys("TaskCheckProfileTask");
const governanceProjectionTypeKeys = topLevelProjectionTypeKeys("TaskGovernanceProjection");

assert(repositoryTasks.length === legacyTasks.length, "repository list should preserve task count");
assert(taskIndexProjectionTasks.length === repositoryTasks.length, "task-index projection reader should preserve task count without exposing scanner records to task-index");
assert(governanceProjectionTasks.length === repositoryTasks.length, "governance projection reader should preserve task count without exposing scanner records to generated governance");
assert(planContractTasks.length === repositoryTasks.length, "plan-contract reader should preserve task count without exposing scanner records to check-task-contracts");
assert(checkProfileTasks.length === repositoryTasks.length, "check-profile reader should preserve task count without exposing scanner records to check-profiles");
assert(lifecycleTasks.length === repositoryTasks.length, "lifecycle reader should preserve task count without exposing scanner records");
assert(workbenchReviewSubjects.length === repositoryTasks.length, "workbench review subject reader should preserve task count without exposing scanner records");

const moduleTargetPath = copyMinimalProject("module-references");
fs.mkdirSync(path.join(moduleTargetPath, "coding-agent-harness/planning/modules/auth/tasks"), { recursive: true });
fs.cpSync(
  path.join(moduleTargetPath, "coding-agent-harness/planning/tasks/demo-task"),
  path.join(moduleTargetPath, "coding-agent-harness/planning/modules/auth/tasks/module-task"),
  { recursive: true },
);
const moduleTarget = normalizeTarget(moduleTargetPath);
const moduleLegacyTasks = collectTasks(moduleTarget, { taskPlanPaths: listTaskPlanPaths(moduleTarget) });
const moduleReferences = createTaskModuleReferenceReader(moduleTarget).listModuleReferences("auth");
assertJsonEqual(
  moduleReferences,
  moduleLegacyTasks.filter((task) => task.module === "auth").map((task) => ({ blocker: String(task.id || task.taskPlanPath || "") })),
  "module reference reader should preserve module unregister blocker identity without exposing raw scanner records",
);
assert(Object.keys(moduleReferences[0] || {}).join(",") === "blocker", "module reference reader should expose only the module blocker contract");

assertJsonEqual(sortComparableTasks(repositoryTasks.map(queueComparable)), sortComparableTasks(legacyTasks.map(queueComparable)), "repository list should preserve scanner queue/material fields");
assertJsonEqual(sortComparableTasks(taskIndexProjectionTasks.map(queueComparable)), sortComparableTasks(repositoryTasks.map(queueComparable)), "task-index projection reader should preserve queue/material fields without exposing broad repository identity to task-index");
assertJsonEqual(sortComparableTasks(governanceProjectionTasks.map(governanceQueueComparable)), sortComparableTasks(repositoryTasks.map(governanceQueueComparable)), "governance projection reader should preserve generated governance queue/material fields without exposing broad repository identity");
assertJsonEqual(planContractTasks, repositoryTasks.map((item) => ({ path: item.path, taskPlanPath: item.taskPlanPath })), "plan-contract reader should preserve only the task path facts needed by contract validation");
assertJsonEqual(
  checkProfileTasks.map((item) => checkProfileTaskComparable(item as Record<string, unknown>)),
  repositoryTasks.map((item) => checkProfileTaskComparable(item as Record<string, unknown>)),
  "check-profile reader should preserve every checker validation field from the scanner-backed repository source",
);
assertJsonEqual(sortComparableTasks(lifecycleTasks.map(queueComparable)), sortComparableTasks(repositoryTasks.map(queueComparable)), "lifecycle reader should preserve lifecycle queue/material fields without exposing the broad TaskRepository identity");
assert(statusProjectionKeys.every((key) => Object.keys(lifecycleTasks[0] || {}).includes(key)), "lifecycle reader should preserve every explicit task-list/status projection field");
assertJsonEqual(sortComparableTasks(statusProjectionTasks.map(queueComparable)), sortComparableTasks(repositoryTasks.map(queueComparable)), "status projection reader should preserve queue/material fields without exposing scanner repository to status-builder");
assertJsonEqual(statusProjectionTypeKeys, statusProjectionKeys, "TaskStatusProjection type keys must match the runtime status projection allowlist");
assertJsonEqual(taskIndexProjectionTypeKeys, taskIndexProjectionKeys, "TaskIndexProjection type keys must match the runtime task-index projection allowlist");
assertJsonEqual(checkProfileTaskTypeKeys, checkProfileTaskKeys, "TaskCheckProfileTask type keys must match the runtime check-profile allowlist");
assertJsonEqual(governanceProjectionTypeKeys, governanceProjectionKeys, "TaskGovernanceProjection type keys must match the runtime governance projection allowlist");
assertJsonEqual(Object.keys(taskIndexProjectionTasks[0] || {}).sort(), taskIndexProjectionKeys, "task-index projection reader should expose only the explicit task-index contract field allowlist");
assertJsonEqual(Object.keys(governanceProjectionTasks[0] || {}).sort(), governanceProjectionKeys, "governance projection reader should expose only the generated governance contract field allowlist");
assertJsonEqual(Object.keys(planContractTasks[0] || {}).sort(), planContractTaskKeys, "plan-contract reader should expose only the task path contract field allowlist");
assertJsonEqual(Object.keys(checkProfileTasks[0] || {}).sort(), checkProfileTaskKeys, "check-profile reader should expose only the explicit checker validation field allowlist");
assertJsonEqual(Object.keys(statusProjectionTasks[0] || {}).sort(), statusProjectionKeys, "status projection reader should expose only the explicit status/dashboard contract field allowlist");
assert(taskIndexProjectionTasks.every((item) => Array.isArray(item.visibilityScopes)), "task-index projection reader should materialize visibility scopes so task-index does not reinterpret raw visibility facts");
assertJsonEqual(
  statusProjectionTasks.map((item) => statusProjectionComparable(item as Record<string, unknown>)),
  repositoryTasks.map((item) => statusProjectionComparable(item as Record<string, unknown>)),
  "status projection reader should preserve every explicit status/dashboard contract field from the scanner-backed repository source",
);
assertJsonEqual(
  taskIndexProjectionTasks.map((item) => taskIndexProjectionComparable(item as Record<string, unknown>)),
  repositoryTasks.map((item) => expectedTaskIndexProjectionComparableFromRepository(item as Record<string, unknown>)),
  "task-index projection reader should preserve every explicit task-index contract field from the scanner-backed repository source",
);
assertJsonEqual(
  governanceProjectionTasks.map((item) => governanceProjectionComparable(item as Record<string, unknown>)),
  repositoryTasks.map((item) => governanceProjectionComparable(item as Record<string, unknown>)),
  "governance projection reader should preserve every generated governance contract field from the scanner-backed repository source",
);

const task = repository.get({ id: "TASKS/demo-task" });
const lifecycleTask = lifecycleReader.getLifecycleTaskByDirectory(path.dirname(absoluteTargetPath(targetPath, task.taskPlanPath)));
assert(lifecycleTask?.id === task.id, "lifecycle reader should find a task by task directory");
assert(lifecycleTask.taskPlanPath === task.taskPlanPath, "lifecycle reader should preserve taskPlanPath for lifecycle updates");
assertJsonEqual(lifecycleTask.semanticProjection, task.semanticProjection, "lifecycle reader should preserve current task-list projection output until P06/P09 shrink it");
assertJsonEqual(lifecycleTask.materialIssues, task.materialIssues, "lifecycle reader should preserve material issue output for lifecycle no-data-loss");
assert(lifecycleTask.kind === task.taskKind, "lifecycle reader should expose task kind compatibility alias");
assert(lifecycleTask.preset === task.taskPreset, "lifecycle reader should expose task preset compatibility alias");
assert(lifecycleReader.listLifecycleTasks({ state: "done" }).every((item) => item.state === "done"), "lifecycle reader should preserve state filtering for task-list");
const reviewConfirmationSubject = reviewConfirmationSubjectReader.findReviewConfirmationSubjectByDirectory(path.dirname(absoluteTargetPath(targetPath, task.taskPlanPath)));
assert(reviewConfirmationSubject, "review confirmation subject reader should find the demo task by directory");
assertJsonEqual(reviewConfirmationSubject, {
  id: task.id,
  title: task.title,
  reviewStatus: task.reviewStatus,
  walkthroughPath: task.walkthroughPath,
  reviewQueueState: task.reviewQueueState,
  state: task.state,
  taskQueues: task.taskQueues,
  lessonCandidateDecisionComplete: task.lessonCandidateDecisionComplete,
  lessonCandidateStatus: task.lessonCandidateStatus,
}, "review confirmation subject reader should expose only the review-confirm gate and display identity facts");
assert(!("taskPlanPath" in reviewConfirmationSubject), "review confirmation subject should not expose raw scanner taskPlanPath");
assert(!("path" in reviewConfirmationSubject), "review confirmation subject should not expose raw scanner path");
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
const lessonPromotionTask = lessonPromotionReader.resolveLessonPromotionTask("demo-task");
assertJsonEqual(Object.keys(lessonPromotionTask).sort(), lessonPromotionTaskKeys, "lesson promotion reader should expose only promotion lookup identity and candidate paths");
assert(lessonPromotionTask.id === task.id, "lesson promotion reader should resolve bare task slugs");
assert(lessonPromotionTask.shortId === task.shortId, "lesson promotion reader should preserve the short id used for next commands");
assert(lessonPromotionTask.paths.directory.endsWith("coding-agent-harness/planning/tasks/demo-task"), "lesson promotion reader should expose the source task directory for promotion locality");
assert(lessonPromotionTask.paths.lessonCandidatePath.endsWith("coding-agent-harness/planning/tasks/demo-task/lesson_candidates.md"), "lesson promotion reader should expose the source candidate file path");
assert(lessonPromotionTask.paths.relativeLessonCandidatePath === "coding-agent-harness/planning/tasks/demo-task/lesson_candidates.md", "lesson promotion reader should expose the relative source candidate path for write-scope commits");
assert(!("taskPlanPath" in lessonPromotionTask), "lesson promotion reader should not expose raw scanner taskPlanPath");
assert(!("path" in lessonPromotionTask), "lesson promotion reader should not expose raw scanner path");

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
  sortComparableTasks(status.tasks.map(queueComparable)),
  sortComparableTasks(statusProjectionTasks.map(queueComparable)),
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
  return topLevelProjectionTypeKeys("TaskStatusProjection");
}

function topLevelProjectionTypeKeys(typeName: string): string[] {
  const source = fs.readFileSync(path.join(repoRoot, "scripts/lib/types/task-repository.ts"), "utf8");
  const match = source.match(new RegExp(`export type ${typeName} = \\{\\n([\\s\\S]*?)\\n\\};`));
  assert(match, `${typeName} type declaration should be parseable`);
  return [...match[1].matchAll(/^\s{2}([A-Za-z0-9_]+)\??:/gm)].map((item) => item[1]).sort();
}

function absoluteTargetPath(projectRoot: string, rawPath: string): string {
  const withoutTarget = String(rawPath || "").replace(/^TARGET:/, "");
  if (path.isAbsolute(withoutTarget)) return withoutTarget;
  return path.join(projectRoot, withoutTarget.replace(/^\/+/, ""));
}
