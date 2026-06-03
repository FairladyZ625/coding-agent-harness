import fs from "node:fs";
import path from "node:path";
import {
  datePrefix,
  lessonCandidatesFile,
  longRunningTaskContractFile,
  normalizeTarget,
  normalizeTaskId,
  readFileSafe,
  toPosix,
  visualMapFile,
} from "./core-shared.mjs";
import {
  resolveHarnessPaths,
  taskIdFromDirectory,
  taskRefPath,
} from "./harness-paths.mjs";
import {
  collectTasks,
  listTaskPlanPaths,
  readTaskContractFile,
  readVisualMapContractFile,
  taskCutoverCounters,
} from "./task-scanner.mjs";
import { taskIdFromArchiveStoragePath } from "./task-archive-storage.mjs";
import { buildTaskSemanticProjection, taskMatchesVisibilityScope } from "./task-semantic-projection.mjs";
import { buildTaskOperationSubject, buildTaskTombstoneSubject } from "../domain/task/task-subjects.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";
import type { CollectTasksOptions, TaskContractFile, TaskScannerTarget, VisualMapContractFile } from "./types/task-scanner.js";
import type {
  TaskOperationBlockingRisk as TaskRepositoryOperationBlockingRisk,
  TaskOperationSemanticProjection as TaskRepositoryOperationSemanticProjection,
  TaskOperationSubject as TaskRepositoryOperationSubject,
  TaskOperationSubjectReader as TaskRepositoryOperationSubjectReader,
  TaskLifecycleReader as TaskRepositoryLifecycleReader,
  TaskLifecycleTask as TaskRepositoryLifecycleTask,
  TaskLocation as TaskRepositoryLocation,
  TaskQuery as TaskRepositoryQuery,
  TaskReviewConfirmationSubject as TaskRepositoryReviewConfirmationSubject,
  TaskReviewConfirmationSubjectReader as TaskRepositoryReviewConfirmationSubjectReader,
  TaskStatusCutoverProjection as TaskRepositoryStatusCutoverProjection,
  TaskRef as TaskRepositoryRef,
  TaskStatusProjection as TaskRepositoryStatusProjection,
  TaskStatusProjectionReader as TaskRepositoryStatusProjectionReader,
  TaskTombstonePolicyFacts as TaskRepositoryTombstonePolicyFacts,
  TaskTombstoneSubject as TaskRepositoryTombstoneSubject,
  TaskWorkbenchReviewSubject as TaskRepositoryWorkbenchReviewSubject,
  TaskWorkbenchReviewSubjectReader as TaskRepositoryWorkbenchReviewSubjectReader,
  TombstoneSubjectReader as TaskRepositoryTombstoneSubjectReader,
} from "./types/task-repository.js";

export {
  isActiveTaskState,
  parsePhases,
  taskCutoverCounters,
} from "./task-scanner.mjs";
export {
  parseTaskBudget,
  parseTaskContractInfo,
  parseTaskState,
} from "./task-metadata.mjs";
export { readVisualMapContractFile } from "./task-scanner.mjs";

export type TaskRecord = ReturnType<typeof collectTasks>[number];
export type TaskRef = TaskRepositoryRef;
export type TaskLocation = TaskRepositoryLocation;
export type TaskQuery = TaskRepositoryQuery;
export type TaskStatusProjection = TaskRepositoryStatusProjection;
export type TaskStatusCutoverProjection = TaskRepositoryStatusCutoverProjection;
export type TaskStatusProjectionReader = TaskRepositoryStatusProjectionReader;
export type TaskTombstonePolicyFacts = TaskRepositoryTombstonePolicyFacts;
export type TaskTombstoneSubject = TaskRepositoryTombstoneSubject;
export type TombstoneSubjectReader = TaskRepositoryTombstoneSubjectReader;
export type TaskOperationBlockingRisk = TaskRepositoryOperationBlockingRisk;
export type TaskOperationSemanticProjection = TaskRepositoryOperationSemanticProjection;
export type TaskOperationSubject = TaskRepositoryOperationSubject;
export type TaskOperationSubjectReader = TaskRepositoryOperationSubjectReader;
export type TaskLifecycleTask = TaskRepositoryLifecycleTask;
export type TaskLifecycleReader = TaskRepositoryLifecycleReader;
export type TaskReviewConfirmationSubject = TaskRepositoryReviewConfirmationSubject;
export type TaskReviewConfirmationSubjectReader = TaskRepositoryReviewConfirmationSubjectReader;
export type TaskWorkbenchReviewSubject = TaskRepositoryWorkbenchReviewSubject;
export type TaskWorkbenchReviewSubjectReader = TaskRepositoryWorkbenchReviewSubjectReader;

export type TaskMaterial = {
  path: string;
  content: string;
  source: "standalone" | "legacy" | "missing";
};

export type TaskMaterials = {
  location: TaskLocation;
  index: TaskMaterial;
  brief: TaskContractFile;
  taskPlan: TaskMaterial;
  executionStrategy: TaskMaterial;
  visualMap: VisualMapContractFile;
  progress: TaskMaterial;
  findings: TaskMaterial;
  review: TaskMaterial;
  lessonCandidates: TaskMaterial;
  longRunningContract: TaskMaterial;
  walkthrough: TaskMaterial;
};

export type TaskRepository = TaskRepositoryTombstoneSubjectReader & TaskRepositoryOperationSubjectReader & {
  list(query?: TaskQuery): TaskRecord[];
  listStatusTasks(query?: TaskQuery): TaskStatusProjection[];
  listWorkbenchReviewSubjects(query?: TaskQuery): TaskWorkbenchReviewSubject[];
  get(ref: TaskRef): TaskRecord;
  resolve(ref: TaskRef): TaskLocation;
  readMaterials(ref: TaskRef): TaskMaterials;
};

type ScannerRepositoryOptions = Pick<CollectTasksOptions, "requireGeneratedScaffoldProvenance" | "closeoutContent">;

export function createScannerTaskRepository(targetInput: TaskScannerTarget | string | undefined = ".", defaults: ScannerRepositoryOptions = {}): TaskRepository {
  const target = normalizeRepositoryTarget(targetInput);
  return {
    list(query: TaskQuery = {}) {
      const tasks = collectTasks(target, {
        requireGeneratedScaffoldProvenance: query.requireGeneratedScaffoldProvenance ?? defaults.requireGeneratedScaffoldProvenance,
        includeArchived: query.includeArchived !== false,
        closeoutContent: query.closeoutContent ?? defaults.closeoutContent,
      });
      return applyTaskQuery(tasks, query);
    },
    listStatusTasks(query: TaskQuery = {}) {
      return collectStatusTasks(target, defaults, query);
    },
    listWorkbenchReviewSubjects(query: TaskQuery = {}) {
      return collectWorkbenchReviewSubjects(target, defaults, query);
    },
    get(ref: TaskRef) {
      const location = resolveRepositoryTaskLocation(target, ref);
      const task = collectTasks(target, {
        requireGeneratedScaffoldProvenance: defaults.requireGeneratedScaffoldProvenance,
        includeArchived: true,
        closeoutContent: defaults.closeoutContent,
      }).find((candidate) => candidate.id === location.id);
      if (!task) throw new Error(`Task not found: ${ref.id || ref.path || ""}`);
      return task;
    },
    resolve(ref: TaskRef) {
      return resolveRepositoryTaskLocation(target, ref);
    },
    readMaterials(ref: TaskRef) {
      const location = resolveRepositoryTaskLocation(target, ref);
      const taskDir = location.directory;
      const taskPlanContent = readFileSafe(location.taskPlanPath);
      return {
        location,
        index: readMaterialFile(path.join(taskDir, "INDEX.md")),
        brief: readTaskContractFile(taskDir, "brief.md", ""),
        taskPlan: materialFromContent(location.taskPlanPath, taskPlanContent),
        executionStrategy: readMaterialFile(path.join(taskDir, "execution_strategy.md")),
        visualMap: readVisualMapContractFile(taskDir, taskPlanContent),
        progress: readMaterialFile(path.join(taskDir, "progress.md")),
        findings: readMaterialFile(path.join(taskDir, "findings.md")),
        review: readMaterialFile(path.join(taskDir, "review.md")),
        lessonCandidates: readMaterialFile(path.join(taskDir, lessonCandidatesFile)),
        longRunningContract: readMaterialFile(path.join(taskDir, longRunningTaskContractFile)),
        walkthrough: readMaterialFile(path.join(taskDir, "walkthrough.md")),
      };
    },
    getTombstoneSubject(ref: TaskRef) {
      const location = resolveRepositoryTaskLocation(target, ref);
      const task = readRepositoryTask(target, defaults, location, ref);
      return tombstoneSubjectFromRecord(target, location, task);
    },
    getOperationSubject(ref: TaskRef) {
      const location = resolveRepositoryTaskLocation(target, ref);
      const task = readRepositoryTask(target, defaults, location, ref);
      return operationSubjectFromRecord(task);
    },
  };
}

export function createTaskLifecycleReader(targetInput: TaskScannerTarget | string | undefined = ".", defaults: ScannerRepositoryOptions = {}): TaskLifecycleReader {
  const target = normalizeRepositoryTarget(targetInput);
  return {
    getLifecycleTaskByDirectory(taskDir: string) {
      return readLifecycleTaskByDirectory(target, defaults, taskDir);
    },
    listLifecycleTasks(query: TaskQuery = {}) {
      return collectLifecycleTasks(target, defaults, query);
    },
  };
}

export function createTaskWorkbenchReviewSubjectReader(targetInput: TaskScannerTarget | string | undefined = ".", defaults: ScannerRepositoryOptions = {}): TaskWorkbenchReviewSubjectReader {
  const target = normalizeRepositoryTarget(targetInput);
  return {
    listWorkbenchReviewSubjects(query: TaskQuery = {}) {
      return collectWorkbenchReviewSubjects(target, defaults, query);
    },
  };
}

export function createTaskReviewConfirmationSubjectReader(targetInput: TaskScannerTarget | string | undefined = ".", defaults: ScannerRepositoryOptions = {}): TaskReviewConfirmationSubjectReader {
  const target = normalizeRepositoryTarget(targetInput);
  return {
    findReviewConfirmationSubjectByDirectory(taskDir: string) {
      return findReviewConfirmationSubjectByDirectory(target, defaults, taskDir);
    },
  };
}

export function createTaskStatusProjectionReader(targetInput: TaskScannerTarget | string | undefined = ".", defaults: ScannerRepositoryOptions = {}): TaskStatusProjectionReader {
  const target = normalizeRepositoryTarget(targetInput);
  return {
    listStatusTasks(query: TaskQuery = {}) {
      return collectStatusTasks(target, defaults, query);
    },
  };
}

export function taskStatusCutoverCounters(tasks: TaskStatusCutoverProjection[]): ReturnType<typeof taskCutoverCounters> {
  return taskCutoverCounters(tasks);
}

export function taskPlanPathFromRecord(target: { projectRoot: string }, task: { taskPlanPath?: string; path?: string }): string {
  const raw = String(task.taskPlanPath || "");
  if (raw) return absoluteTargetPath(target, raw);
  const taskDir = absoluteTargetPath(target, String(task.path || ""));
  return path.join(taskDir, "task_plan.md");
}

export function resolveTaskDirectory(targetInput: TaskScannerTarget | string | undefined, taskRef: string): string {
  return resolveRepositoryTaskLocation(normalizeRepositoryTarget(targetInput), { id: taskRef }).directory;
}

function normalizeRepositoryTarget(targetInput: TaskScannerTarget | string | undefined): TaskScannerTarget {
  if (targetInput && typeof targetInput === "object" && "projectRoot" in targetInput) return targetInput;
  return normalizeTarget(typeof targetInput === "string" ? targetInput : ".") as TaskScannerTarget;
}

function readRepositoryTask(target: TaskScannerTarget, defaults: ScannerRepositoryOptions, location: TaskLocation, ref: TaskRef): TaskRecord {
  const task = collectTasks(target, {
    requireGeneratedScaffoldProvenance: defaults.requireGeneratedScaffoldProvenance,
    includeArchived: true,
    closeoutContent: defaults.closeoutContent,
  }).find((candidate) => candidate.id === location.id);
  if (!task) throw new Error(`Task not found: ${ref.id || ref.path || ""}`);
  return task;
}

function tombstoneSubjectFromRecord(target: TaskScannerTarget, location: TaskLocation, task: TaskRecord): TaskTombstoneSubject {
  const directory = location.directory;
  const taskPlanPath = absoluteTargetPath(target, task.taskPlanPath || location.taskPlanPath);
  const progressPath = absoluteTargetPath(target, task.progressPath || path.join(directory, "progress.md"));
  return buildTaskTombstoneSubject(task, {
    location,
    paths: {
      directory,
      taskPlanPath,
      progressPath,
      relativeDirectory: toPosix(path.relative(target.projectRoot, directory)),
      relativeTaskPlanPath: toPosix(path.relative(target.projectRoot, taskPlanPath)),
      relativeProgressPath: toPosix(path.relative(target.projectRoot, progressPath)),
    },
  });
}

function operationSubjectFromRecord(task: TaskRecord): TaskOperationSubject {
  return buildTaskOperationSubject(task);
}

function readLifecycleTaskByDirectory(target: TaskScannerTarget, defaults: ScannerRepositoryOptions, taskDir: string): TaskLifecycleTask | undefined {
  const location = resolveRepositoryTaskLocation(target, { path: taskDir });
  const task = collectTasks(target, {
    requireGeneratedScaffoldProvenance: defaults.requireGeneratedScaffoldProvenance,
    includeArchived: true,
    closeoutContent: defaults.closeoutContent,
  }).find((candidate) => candidate.id === location.id);
  return task ? lifecycleTaskFromRecord(task) : undefined;
}

function collectLifecycleTasks(target: TaskScannerTarget, defaults: ScannerRepositoryOptions, query: TaskQuery = {}): TaskLifecycleTask[] {
  const tasks = collectTasks(target, {
    requireGeneratedScaffoldProvenance: query.requireGeneratedScaffoldProvenance ?? defaults.requireGeneratedScaffoldProvenance,
    includeArchived: query.includeArchived !== false,
    closeoutContent: query.closeoutContent ?? defaults.closeoutContent,
  });
  return applyTaskQuery(tasks, query).map(lifecycleTaskFromRecord);
}

function lifecycleTaskFromRecord(task: TaskRecord): TaskLifecycleTask {
  const record = task as TaskRecord & Record<string, unknown>;
  return {
    ...taskStatusProjectionFromRecord(task),
    locale: typeof record.locale === "string" ? record.locale : undefined,
    kind: typeof record.kind === "string" ? record.kind : typeof task.taskKind === "string" ? task.taskKind : undefined,
    preset: typeof record.preset === "string" ? record.preset : typeof task.taskPreset === "string" ? task.taskPreset : undefined,
    presetAudit: record.presetAudit && typeof record.presetAudit === "object" ? record.presetAudit as Record<string, unknown> : null,
    longRunning: typeof record.longRunning === "boolean" ? record.longRunning : Boolean(task.longRunningContractPath),
  };
}

function findReviewConfirmationSubjectByDirectory(target: TaskScannerTarget, defaults: ScannerRepositoryOptions, taskDir: string): TaskReviewConfirmationSubject | undefined {
  const absoluteTaskDir = absoluteTargetPath(target, taskDir);
  const tasks = collectTasks(target, {
    requireGeneratedScaffoldProvenance: defaults.requireGeneratedScaffoldProvenance,
    includeArchived: true,
    closeoutContent: defaults.closeoutContent,
  });
  const task = tasks.find((candidate) => taskDirectoryFromRecord(target, candidate) === absoluteTaskDir);
  return task ? reviewConfirmationSubjectFromRecord(task) : undefined;
}

function reviewConfirmationSubjectFromRecord(task: TaskRecord): TaskReviewConfirmationSubject {
  return {
    id: task.id,
    title: task.title,
    reviewStatus: task.reviewStatus,
    walkthroughPath: task.walkthroughPath,
    reviewQueueState: task.reviewQueueState,
    state: task.state,
    taskQueues: Array.isArray(task.taskQueues) ? task.taskQueues.map(String) : [],
    lessonCandidateDecisionComplete: task.lessonCandidateDecisionComplete,
    lessonCandidateStatus: task.lessonCandidateStatus,
  };
}

function collectWorkbenchReviewSubjects(target: TaskScannerTarget, defaults: ScannerRepositoryOptions, query: TaskQuery = {}): TaskWorkbenchReviewSubject[] {
  const tasks = collectTasks(target, {
    requireGeneratedScaffoldProvenance: query.requireGeneratedScaffoldProvenance ?? defaults.requireGeneratedScaffoldProvenance,
    includeArchived: query.includeArchived !== false,
    closeoutContent: query.closeoutContent ?? defaults.closeoutContent,
  });
  return applyTaskQuery(tasks, query).map((task) => workbenchReviewSubjectFromRecord(target, task));
}

function workbenchReviewSubjectFromRecord(target: TaskScannerTarget, task: TaskRecord): TaskWorkbenchReviewSubject {
  const directory = taskDirectoryFromRecord(target, task);
  return {
    id: String(task.id || ""),
    taskKey: task.taskKey,
    shortId: task.shortId,
    aliases: [task.id, task.taskKey, task.shortId, ...(Array.isArray(task.aliases) ? task.aliases : [])].filter(Boolean).map(String),
    paths: {
      directory,
      relativeDirectory: toPosix(path.relative(target.projectRoot, directory)),
    },
    confirmText: String(task.shortId || task.id || ""),
    reviewTask: {
      id: task.id,
      reviewStatus: task.reviewStatus,
      walkthroughPath: task.walkthroughPath,
      reviewQueueState: task.reviewQueueState,
      state: task.state,
      taskQueues: Array.isArray(task.taskQueues) ? task.taskQueues.map(String) : [],
      lessonCandidateDecisionComplete: task.lessonCandidateDecisionComplete,
      lessonCandidateStatus: task.lessonCandidateStatus,
    },
    queueReasons: Array.isArray(task.queueReasons) ? task.queueReasons : [],
    repairPrompt: task.repairPrompt || "",
    semanticProjection: buildTaskSemanticProjection(task as Record<string, unknown>),
  };
}

function collectStatusTasks(target: TaskScannerTarget, defaults: ScannerRepositoryOptions, query: TaskQuery = {}): TaskStatusProjection[] {
  const tasks = collectTasks(target, {
    requireGeneratedScaffoldProvenance: query.requireGeneratedScaffoldProvenance ?? defaults.requireGeneratedScaffoldProvenance,
    includeArchived: query.includeArchived !== false,
    closeoutContent: query.closeoutContent ?? defaults.closeoutContent,
  });
  return applyTaskQuery(tasks, query).map(taskStatusProjectionFromRecord);
}

function taskStatusProjectionFromRecord(task: TaskRecord): TaskStatusProjection {
  return {
    id: task.id,
    taskKey: task.taskKey,
    currentPath: task.currentPath,
    originalPath: task.originalPath,
    aliases: task.aliases,
    identitySource: task.identitySource,
    shortId: task.shortId,
    title: task.title,
    path: task.path,
    taskPlanPath: task.taskPlanPath,
    executionStrategyPath: task.executionStrategyPath,
    progressPath: task.progressPath,
    reviewPath: task.reviewPath,
    findingsPath: task.findingsPath,
    module: task.module,
    inferredModule: task.inferredModule,
    classificationSource: task.classificationSource,
    classificationBucket: task.classificationBucket,
    briefSource: task.briefSource,
    briefPath: task.briefPath,
    visualMapSource: task.visualMapSource,
    visualMapStatus: task.visualMapStatus,
    visualMapPath: task.visualMapPath,
    legacyVisualRoadmapPresent: task.legacyVisualRoadmapPresent,
    briefQuality: task.briefQuality,
    migrationClassification: task.migrationClassification,
    roadmapSource: task.roadmapSource,
    state: task.state,
    budget: task.budget,
    taskContractVersion: task.taskContractVersion,
    taskContractGenerated: task.taskContractGenerated,
    stateSource: task.stateSource,
    stateRaw: task.stateRaw,
    taskKind: task.taskKind,
    taskPreset: task.taskPreset,
    presetVersion: task.presetVersion,
    migrationTargetLevel: task.migrationTargetLevel,
    migrationAchievedLevel: task.migrationAchievedLevel,
    evidenceBundle: task.evidenceBundle,
    migrationSnapshot: task.migrationSnapshot,
    scaffoldProvenance: task.scaffoldProvenance,
    taskAudit: task.taskAudit,
    lifecycleState: task.lifecycleState,
    reviewStatus: task.reviewStatus,
    reviewSubmitted: task.reviewSubmitted,
    reviewSubmission: task.reviewSubmission,
    reviewQueueState: task.reviewQueueState,
    reviewConfirmation: task.reviewConfirmation,
    materialsReady: task.materialsReady,
    materialIssues: task.materialIssues,
    taskQueues: task.taskQueues,
    queueReasons: task.queueReasons,
    repairPrompt: task.repairPrompt,
    closeoutStatus: task.closeoutStatus,
    walkthroughPath: task.walkthroughPath,
    lessonCandidatePath: task.lessonCandidatePath,
    lessonCandidateStatus: task.lessonCandidateStatus,
    lessonCandidateReviewDecision: task.lessonCandidateReviewDecision,
    lessonCandidatePromotionState: task.lessonCandidatePromotionState,
    lessonCandidateCloseoutToken: task.lessonCandidateCloseoutToken,
    lessonCandidateRowCount: task.lessonCandidateRowCount,
    lessonCandidateRows: task.lessonCandidateRows,
    lessonCandidateOpenCount: task.lessonCandidateOpenCount,
    lessonCandidateIssues: task.lessonCandidateIssues,
    lessonCandidateDecisionComplete: task.lessonCandidateDecisionComplete,
    longRunningContractPath: task.longRunningContractPath,
    longRunningContractStatus: task.longRunningContractStatus,
    deletionState: task.deletionState,
    supersededBy: task.supersededBy,
    supersedes: task.supersedes,
    deleteReason: task.deleteReason,
    archiveMetadata: task.archiveMetadata,
    hiddenByDefault: task.hiddenByDefault,
    reopenEligible: task.reopenEligible,
    archiveEligible: task.archiveEligible,
    tombstoneSourcePath: task.tombstoneSourcePath,
    stateConflicts: task.stateConflicts,
    completion: task.completion,
    phases: task.phases,
    risks: task.risks,
    evidence: task.evidence,
    handoffs: task.handoffs,
    dependencies: task.dependencies,
    semanticProjection: task.semanticProjection,
    taskLifecycleProjection: task.taskLifecycleProjection,
    visibility: task.visibility,
    visibilityScopes: task.visibilityScopes,
    dashboardTaskView: task.dashboardTaskView,
    reviewWorkbenchQueueView: task.reviewWorkbenchQueueView,
  };
}

function taskDirectoryFromRecord(target: { projectRoot: string }, task: { currentPath?: string; path?: string; taskPlanPath?: string; id?: string; taskKey?: string }): string {
  const taskPlan = String(task.taskPlanPath || "");
  if (taskPlan) return path.dirname(absoluteTargetPath(target, taskPlan));
  const raw = String(task.currentPath || task.path || "");
  if (!raw) throw new Error(`Task has no currentPath/path: ${task.id || task.taskKey || "unknown"}`);
  const withoutTarget = raw.replace(/^TARGET:/, "");
  return path.isAbsolute(withoutTarget) ? withoutTarget : path.join(target.projectRoot, withoutTarget.replace(/^\/+/, ""));
}

function applyTaskQuery(tasks: TaskRecord[], query: TaskQuery): TaskRecord[] {
  let result = [...tasks];
  if (query.includeArchived === false) {
    result = result.filter((task) => taskMatchesVisibilityScope(task, "active-cycle"));
  }
  if (query.state) result = result.filter((task) => task.state === String(query.state).toLowerCase().replaceAll("-", "_"));
  if (query.module) result = result.filter((task) => task.module === query.module);
  if (query.queue) {
    const normalizedQueue = queryToken(query.queue);
    result = result.filter((task) => (task.taskQueues || []).map(queryToken).includes(normalizedQueue));
  }
  if (query.preset) result = result.filter((task) => queryToken(task.taskPreset || "none") === queryToken(query.preset));
  if (query.review) result = result.filter((task) => queryToken(task.reviewStatus || "") === queryToken(query.review));
  if (query.lesson) {
    const needle = queryToken(query.lesson);
    result = result.filter((task) => [task.lessonCandidateStatus, task.lessonCandidateReviewDecision, task.lessonCandidatePromotionState].some((value) => queryToken(value) === needle));
  }
  if (query.missingMaterials) result = result.filter((task) => !task.materialsReady);
  if (query.search) {
    const needle = String(query.search).toLowerCase();
    result = result.filter((task) => [
      task.id,
      task.taskKey,
      task.shortId,
      task.title,
      task.currentPath,
      task.taskPlanPath,
      task.module,
      task.inferredModule,
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }
  return result;
}

function resolveRepositoryTaskLocation(target: TaskScannerTarget, ref: TaskRef): TaskLocation {
  const harnessPaths = (target.harness || resolveHarnessPaths(target)) as ResolvedHarnessPaths;
  const pathLocation = ref.path ? resolvePathRef(target, harnessPaths, ref.path) : null;
  if (pathLocation) return pathLocation;
  const raw = normalizeRawTaskRef(ref.id || ref.path || "");
  if (!raw) throw new Error("Missing task id");
  const direct = taskRefPath(harnessPaths, raw);
  if (direct && fs.existsSync(path.join(direct, "task_plan.md"))) return taskLocationFromDirectory(harnessPaths, direct);
  const normalized = normalizeTaskId(raw);
  const candidates = taskDirectories(target).filter((taskDir) => {
    const id = repositoryTaskIdFromDirectory(harnessPaths, taskDir);
    const dirName = path.basename(taskDir);
    return id === raw || id.endsWith(`/${raw}`) || dirName === normalized;
  });
  if (candidates.length === 1) return taskLocationFromDirectory(harnessPaths, candidates[0]);
  if (candidates.length > 1) {
    const options = candidates.map((taskDir) => `- ${repositoryTaskIdFromDirectory(harnessPaths, taskDir)}`).join("\n");
    throw new Error(`Ambiguous task reference: ${ref.id || ref.path}\n${options}`);
  }
  if (!datePrefix.test(normalized)) {
    const datedCandidates = taskDirectories(target).filter((taskDir) => {
      const dirName = path.basename(taskDir);
      return datePrefix.test(dirName) && dirName.replace(datePrefix, "") === normalized;
    });
    if (datedCandidates.length === 1) return taskLocationFromDirectory(harnessPaths, datedCandidates[0]);
    if (datedCandidates.length > 1) {
      const options = datedCandidates.map((taskDir) => `- ${repositoryTaskIdFromDirectory(harnessPaths, taskDir)}`).join("\n");
      throw new Error(`Ambiguous task reference: ${ref.id || ref.path}\n${options}`);
    }
  }
  const legacy = path.join(harnessPaths.tasksRoot, normalized);
  if (fs.existsSync(path.join(legacy, "task_plan.md"))) return taskLocationFromDirectory(harnessPaths, legacy);
  throw new Error(`Task not found: ${ref.id || ref.path}`);
}

function resolvePathRef(target: TaskScannerTarget, harnessPaths: ResolvedHarnessPaths, rawPath: string): TaskLocation | null {
  const absolute = absoluteTargetPath(target, rawPath);
  const taskPlanPath = path.basename(absolute) === "task_plan.md" ? absolute : path.join(absolute, "task_plan.md");
  if (!fs.existsSync(taskPlanPath)) return null;
  return taskLocationFromDirectory(harnessPaths, path.dirname(taskPlanPath));
}

function absoluteTargetPath(target: { projectRoot: string }, rawPath: string): string {
  const withoutPrefix = String(rawPath || "").replace(/^TARGET:/, "");
  if (path.isAbsolute(withoutPrefix)) return withoutPrefix;
  const normalized = withoutPrefix.replace(/^\/+/, "");
  if (!normalized) return "";
  return path.join(target.projectRoot, normalized);
}

function normalizeRawTaskRef(rawRef: string): string {
  return String(rawRef || "")
    .replace(/^TARGET:/, "")
    .replace(/^coding-agent-harness\/planning\//, "")
    .replace(/^planning\//, "")
    .replace(new RegExp(`^${legacyPlanningPrefix()}\\/`), "")
    .replace(/^\/+/, "");
}

function legacyPlanningPrefix(): string {
  return "docs\\/09-PLANNING";
}

function taskDirectories(target: TaskScannerTarget): string[] {
  return listTaskPlanPaths(target, { includeArchived: true }).map((taskPlanPath) => path.dirname(taskPlanPath));
}

function taskLocationFromDirectory(harnessPaths: ResolvedHarnessPaths, directory: string): TaskLocation {
  return {
    id: repositoryTaskIdFromDirectory(harnessPaths, directory),
    directory,
    taskPlanPath: path.join(directory, "task_plan.md"),
  };
}

function repositoryTaskIdFromDirectory(harnessPaths: ResolvedHarnessPaths, directory: string): string {
  return taskIdFromArchiveStoragePath(harnessPaths.projectRoot, directory) || taskIdFromDirectory(harnessPaths, directory);
}

function readMaterialFile(filePath: string): TaskMaterial {
  return materialFromContent(filePath, readFileSafe(filePath));
}

function materialFromContent(filePath: string, content: string): TaskMaterial {
  return {
    path: filePath,
    content,
    source: content.trim() ? "standalone" : "missing",
  };
}

function queryToken(value: unknown): string {
  return String(value || "").trim().toLowerCase().replaceAll("_", "-");
}
