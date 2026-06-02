export type TaskRef = {
  id?: string;
  path?: string;
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
