import type { ResolvedHarnessPaths } from "../harness-paths.mjs";
import type { TaskBudget, TaskScannerTarget } from "./task-scanner.js";

export type LifecycleTarget = TaskScannerTarget & {
  docsRoot: string;
  harness: ResolvedHarnessPaths;
  locale?: string;
};

export type LifecycleState = "not_started" | "planned" | "in_progress" | "review" | "blocked" | "done" | "unknown";
export type LifecycleEvent = "new-task" | "task-start" | "task-log" | "task-block" | "task-review" | "task-complete";
export type PhaseState = "planned" | "in_progress" | "review" | "blocked" | "done" | "skipped";
export type EvidenceStatus = "missing" | "partial" | "present" | "waived";

export type PresetPackage = {
  id: string;
  version?: string | number;
  source?: string;
  compatibleBudgets: string[];
  task?: {
    defaultTaskId?: string;
    kind?: string;
    projectLevelOnly?: boolean;
    requiresFromSession?: boolean;
  } & Record<string, unknown>;
} & Record<string, unknown>;

export type PresetInputs = {
  inputs: Record<string, unknown>;
  targetInput?: string;
};

export type PresetGeneratedFile = {
  relativePath: string;
  source: string;
  content: string;
};

export type PresetResourceRow = Record<string, string>;

export type PresetAudit = Record<string, unknown>;

export type PresetContext = {
  kind: string;
  preset: string;
  presetVersion: string;
  presetPackage: PresetPackage;
  audit: PresetAudit;
  resolvedInputs: Record<string, unknown>;
  taskId: string;
  taskTitle: string;
  taskRelativeDir: string;
  values: Record<string, unknown>;
  migrationTargetLevel?: string;
  migrationAchievedLevel?: string;
  evidenceBundle?: string;
  evidenceFiles?: PresetGeneratedFile[];
  resourceFiles?: PresetGeneratedFile[];
  resourceIndexRows?: Record<string, PresetResourceRow[]>;
};

export type LifecycleTask = {
  id: string;
  shortId?: string;
  title: string;
  module?: string | null;
  path: string;
  locale?: string;
  budget?: TaskBudget;
  kind?: string;
  preset?: string;
  presetVersion?: string;
  presetAudit?: PresetAudit | null;
  migrationTargetLevel?: string;
  migrationAchievedLevel?: string;
  evidenceBundle?: string;
  longRunning?: boolean;
  state?: string;
  completion?: number;
  materialsReady?: boolean;
  deletionState?: string;
  hiddenByDefault?: boolean;
  taskQueues?: string[];
  taskKey?: string;
  currentPath?: string;
  taskPlanPath?: string;
  inferredModule?: string;
  taskPreset?: string;
  reviewStatus?: string;
  lessonCandidateStatus?: string;
  lessonCandidateReviewDecision?: string;
  lessonCandidatePromotionState?: string;
  lessonCandidateDecisionComplete?: boolean;
  reviewQueueState?: string;
  walkthroughPath?: string;
};

export type TaskIdentity = {
  normalizedTaskId: string;
  semanticSlug: string;
};

export type CreateTaskOptions = {
  title?: string;
  locale?: string;
  dryRun?: boolean;
  moduleKey?: string;
  budget?: string;
  longRunning?: boolean;
  preset?: string;
  fromSession?: string;
  presetArgs?: string[];
  automaticTaskId?: boolean;
  deferCommit?: boolean;
  allowDirtyRelativePaths?: string[];
  registerModule?: boolean;
  moduleRegistration?: {
    title?: string;
    prefix?: string;
    status?: string;
    branch?: string;
    owner?: string;
    currentStep?: string;
    scope?: string[];
    shared?: string[];
    dependsOn?: string[];
    locale?: string;
  };
};

export type CreateTaskBatchItem = {
  id: string;
  title?: string;
};

export type CreateTaskBatchOptions = Omit<CreateTaskOptions, "deferCommit" | "allowDirtyRelativePaths" | "automaticTaskId" | "fromSession" | "presetArgs" | "registerModule" | "moduleRegistration"> & {
  tasks: CreateTaskBatchItem[];
};

export type LifecycleUpdateOptions = {
  event?: string;
  state?: string;
  message?: string;
  evidence?: string;
};

export type ReviewConfirmOptions = {
  reviewer?: string;
  message?: string;
  confirmText?: string;
  evidence?: string;
  deferCommit?: boolean;
};

export type DeferredReviewConfirmOptions = {
  commitSha?: string;
};

export type PhaseUpdateOptions = {
  state?: string;
  completion?: string;
  evidenceStatus?: string;
};

export type ModuleStepOptions = {
  state?: string;
};

export type ListLifecycleTasksOptions = {
  state?: string;
  moduleKey?: string;
  queue?: string;
  preset?: string;
  review?: string;
  lesson?: string;
  search?: string;
  missingMaterials?: boolean;
  includeArchived?: boolean;
};

export type LifecycleChange = {
  destination: string;
  source?: string;
  action: string;
};
