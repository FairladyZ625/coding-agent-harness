export type TaskRef = {
  id?: string;
  path?: string;
};

export type TaskQuery = {
  state?: string;
  module?: string;
  queue?: string;
  preset?: string;
  review?: string;
  lesson?: string;
  includeArchived?: boolean;
  search?: string;
  missingMaterials?: boolean;
  requireGeneratedScaffoldProvenance?: boolean;
  closeoutContent?: string;
};

export type TaskLocation = {
  id: string;
  directory: string;
  taskPlanPath: string;
};

export type TaskTombstonePolicyFacts = {
  state?: string;
  budget?: string;
  closeoutStatus?: string;
  reviewSubmitted?: unknown;
  reviewStatus?: string;
  reviewConfirmation?: ({ confirmed?: unknown } & Record<string, unknown>) | null;
  materialsReady?: boolean;
  evidence?: unknown[];
  taskQueues?: string[];
  risks?: Array<{ id?: string; open?: unknown; blocksRelease?: unknown; severity?: unknown }>;
  deletionState?: string;
};

export type TaskTombstoneSubject = {
  id: string;
  location: TaskLocation;
  paths: {
    directory: string;
    taskPlanPath: string;
    progressPath: string;
    relativeDirectory: string;
    relativeTaskPlanPath: string;
    relativeProgressPath: string;
  };
  policy: TaskTombstonePolicyFacts;
};

export type TombstoneSubjectReader = {
  getTombstoneSubject(ref: TaskRef): TaskTombstoneSubject;
};

export type TaskOperationQueueReason = {
  code?: string;
  queue?: string;
  message?: string;
  severity?: string;
};

export type TaskOperationLifecycleProjection = {
  state: string;
  lifecycleState: string;
  reviewStatus: string;
  reviewQueueState: string;
  closeoutStatus: string;
  taskQueues: string[];
  materialsReady: boolean;
  reviewSubmitted: boolean;
  lessonCandidateDecisionComplete: boolean;
  deletionState: string;
};

export type TaskOperationReviewWorkbenchQueueView = {
  queues: string[];
  primaryQueue: string;
  inQueue: boolean;
  humanConfirmable: boolean;
  blocked: boolean;
  needsMaterials: boolean;
  confirmed: boolean;
  finalized: boolean;
  hasPendingLessonWork: boolean;
  readyForCloseout: boolean;
  reasonCodes: string[];
  reasonSummaries: TaskOperationQueueReason[];
};

export type TaskOperationSemanticProjection = {
  taskLifecycleProjection: TaskOperationLifecycleProjection;
  reviewWorkbenchQueueView: TaskOperationReviewWorkbenchQueueView;
};

export type TaskOperationBlockingRisk = {
  id?: string;
  open?: unknown;
  blocksRelease?: unknown;
  severity?: unknown;
};

export type TaskOperationSubject = {
  id: string;
  budget: string;
  lessonCandidateStatus: string;
  lessonCandidatePromotionState: string;
  repairPrompt: string;
  queueReasons: unknown[];
  blockingReviewRisks: TaskOperationBlockingRisk[];
  semanticProjection: TaskOperationSemanticProjection;
};

export type TaskOperationSubjectReader = {
  getOperationSubject(ref: TaskRef): TaskOperationSubject;
};

export type TaskStatusIssue = {
  code?: string;
  message?: string;
  sourcePath?: string;
};

export type TaskStatusProjection = {
  [key: string]: unknown;
  aliases?: string[];
  briefPath?: string;
  briefSource?: string;
  closeoutStatus?: string;
  completion?: number;
  currentPath?: string;
  deletionState?: string;
  documentRefs?: unknown[];
  evidenceBundle?: string;
  executionStrategyPath?: string;
  findingsPath?: string;
  handoffs?: unknown[];
  hiddenByDefault?: boolean;
  id?: string;
  identitySource?: string;
  inferredModule?: string;
  lessonCandidateIssues?: unknown[];
  lessonCandidatePath?: string;
  lessonCandidateRows?: unknown[];
  lessonCandidateStatus?: string;
  lifecycleState?: string;
  materialIssues?: TaskStatusIssue[];
  materialsReady?: boolean;
  module?: string | null;
  namespace?: string;
  originalPath?: string;
  packageRole?: string;
  path?: string;
  presetVersion?: string;
  progressPath?: string;
  queueReasons?: TaskStatusIssue[];
  repairPrompt?: string;
  reviewPath?: string;
  reviewStatus?: string;
  reviewSubmitted?: boolean;
  risks?: unknown[];
  shortId?: string;
  state?: string;
  stateConflicts?: unknown[];
  supersededBy?: string;
  supersedes?: unknown[];
  taskKind?: string;
  taskKey?: string;
  taskPlanPath?: string;
  taskPreset?: string;
  taskQueues?: unknown[];
  taskRootKind?: string;
  title?: string;
  visualMapPath?: string;
  visualMapSource?: string;
  visualMapStatus?: string;
  walkthroughPath?: string;
};

export type TaskStatusProjectionReader = {
  listStatusTasks(query?: TaskQuery): TaskStatusProjection[];
};
