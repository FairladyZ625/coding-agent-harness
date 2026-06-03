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

export type TaskLifecycleTask = TaskStatusProjection & {
  locale?: string;
  kind?: string;
  preset?: string;
  presetAudit?: Record<string, unknown> | null;
  longRunning?: boolean;
};

export type TaskLifecycleReader = {
  getLifecycleTaskByDirectory(taskDir: string): TaskLifecycleTask | undefined;
  listLifecycleTasks(query?: TaskQuery): TaskLifecycleTask[];
};

export type TaskReviewConfirmationSubject = {
  id?: string;
  title?: string;
  reviewStatus?: string;
  walkthroughPath?: string;
  reviewQueueState?: string;
  state?: string;
  taskQueues?: string[];
  lessonCandidateDecisionComplete?: boolean;
  lessonCandidateStatus?: string;
};

export type TaskReviewConfirmationSubjectReader = {
  findReviewConfirmationSubjectByDirectory(taskDir: string): TaskReviewConfirmationSubject | undefined;
};

export type TaskWorkbenchReviewSubject = {
  id: string;
  taskKey?: string;
  shortId?: string;
  aliases: string[];
  paths: {
    directory: string;
    relativeDirectory: string;
  };
  confirmText: string;
  reviewTask: {
    id?: string;
    reviewStatus?: string;
    walkthroughPath?: string;
    reviewQueueState?: string;
    state?: string;
    taskQueues?: string[];
    lessonCandidateDecisionComplete?: boolean;
    lessonCandidateStatus?: string;
  };
  queueReasons: TaskOperationQueueReason[];
  repairPrompt: string;
  semanticProjection: TaskOperationSemanticProjection;
};

export type TaskWorkbenchReviewSubjectReader = {
  listWorkbenchReviewSubjects(query?: TaskQuery): TaskWorkbenchReviewSubject[];
};

export type TaskIndexIssue = {
  code?: string;
  message?: string;
  sourcePath?: string;
};

export type TaskIndexProjection = {
  aliases?: string[];
  archiveMetadata?: Record<string, unknown>;
  briefPath?: string;
  closeoutStatus?: string;
  completion?: number;
  currentPath?: string;
  deletionState?: string;
  deleteReason?: string;
  evidenceBundle?: string;
  executionStrategyPath?: string;
  findingsPath?: string;
  hiddenByDefault?: boolean;
  id: string;
  identitySource?: string;
  inferredModule?: string;
  lessonCandidateIssues?: unknown[];
  lessonCandidatePath?: string;
  lessonCandidatePromotionState?: string;
  lessonCandidateReviewDecision?: string;
  lessonCandidateRows?: unknown[];
  lessonCandidateStatus?: string;
  lifecycleState?: string;
  materialIssues?: TaskIndexIssue[];
  materialsReady?: boolean;
  module?: string | null;
  namespace?: string;
  originalPath?: string;
  packageRole?: string;
  path?: string;
  presetVersion?: string;
  progressPath?: string;
  queueReasons?: TaskIndexIssue[];
  repairPrompt?: string;
  reviewPath?: string;
  reviewQueueState?: string;
  reviewStatus?: string;
  reviewSubmitted?: boolean;
  risks?: unknown[];
  shortId?: string;
  state?: string;
  stateConflicts?: unknown[];
  supersededBy?: string;
  supersedes?: unknown[];
  taskKey?: string;
  taskKind?: string;
  taskPlanPath?: string;
  taskPreset?: string;
  taskQueues?: unknown[];
  taskRootKind?: string;
  title?: string;
  visibilityScopes?: string[];
  visualMapPath?: string;
  walkthroughPath?: string;
};

export type TaskIndexProjectionReader = {
  listTaskIndexTasks(query?: TaskQuery): TaskIndexProjection[];
};

export type TaskPlanContractTask = {
  path?: string;
  taskPlanPath?: string;
};

export type TaskPlanContractReader = {
  listPlanContractTasks(query?: TaskQuery): TaskPlanContractTask[];
};

export type TaskStatusIssue = {
  code?: string;
  queue?: string;
  message?: string;
  sourcePath?: string;
  severity?: string;
};

export type TaskStatusBriefQuality = {
  status: "pass" | "fail";
  issues: string[];
};

export type TaskStatusBudget = "simple" | "standard" | "complex";

export type TaskStatusLifecycleProjection = {
  state?: string;
  lifecycleState?: string;
  reviewStatus?: string;
  reviewQueueState?: string;
  closeoutStatus?: string;
  taskQueues?: string[];
  materialsReady?: boolean;
  reviewSubmitted?: boolean;
  lessonCandidateDecisionComplete?: boolean;
  deletionState?: string;
};

export type TaskStatusVisibilityProjection = {
  scopes?: string[];
  defaultVisible?: boolean;
  activeCycle?: boolean;
  reviewWorkbench?: boolean;
  archiveHistory?: boolean;
  tombstoneHistory?: boolean;
  taskIndexDefault?: boolean;
  hiddenReason?: string;
};

export type TaskStatusDashboardTaskView = {
  visibleInSwimlane?: boolean;
  swimlaneStage?: string;
  swimlane?: Record<string, unknown>;
  materials?: Record<string, unknown>;
  needsEvidence?: boolean;
  reasonCode?: string;
  reasonMessage?: string;
};

export type TaskStatusReviewWorkbenchQueueView = {
  queues?: string[];
  primaryQueue?: string;
  inQueue?: boolean;
  humanConfirmable?: boolean;
  blocked?: boolean;
  needsMaterials?: boolean;
  confirmed?: boolean;
  finalized?: boolean;
  hasPendingLessonWork?: boolean;
  readyForCloseout?: boolean;
  reasonCodes?: string[];
  reasonSummaries?: TaskStatusIssue[];
};

export type TaskStatusSemanticProjection = {
  taskLifecycleProjection?: TaskStatusLifecycleProjection;
  visibility?: TaskStatusVisibilityProjection;
  dashboardTaskView?: TaskStatusDashboardTaskView;
  reviewWorkbenchQueueView?: TaskStatusReviewWorkbenchQueueView;
};

export type TaskStatusPhase = {
  id?: string;
  kind?: string;
  dependsOn?: string[];
  state?: string;
  completion?: number;
  output?: string;
  requiredEvidence?: string[];
  exitCommand?: string;
  actor?: string;
  evidenceStatus?: string;
  blockingRisk?: string;
  owner?: string;
};

export type TaskStatusProjection = {
  aliases?: string[];
  archiveEligible?: boolean;
  archiveMetadata?: Record<string, unknown>;
  briefPath?: string;
  briefQuality?: TaskStatusBriefQuality;
  briefSource?: string;
  budget?: TaskStatusBudget;
  classificationBucket?: string;
  classificationSource?: string;
  closeoutStatus?: string;
  completion?: number;
  currentPath?: string;
  deleteReason?: string;
  deletionState?: string;
  dependencies?: unknown[];
  evidence?: unknown[];
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
  lessonCandidateCloseoutToken?: string;
  lessonCandidateDecisionComplete?: boolean;
  lessonCandidateOpenCount?: number;
  lessonCandidatePromotionState?: string;
  lessonCandidateReviewDecision?: string;
  lessonCandidateRowCount?: number;
  lessonCandidateRows?: unknown[];
  lessonCandidateStatus?: string;
  legacyVisualRoadmapPresent?: boolean;
  lifecycleState?: string;
  longRunningContractPath?: string;
  longRunningContractStatus?: string;
  materialIssues?: TaskStatusIssue[];
  materialsReady?: boolean;
  migrationAchievedLevel?: string;
  migrationClassification?: string;
  migrationSnapshot?: unknown;
  migrationTargetLevel?: string;
  module?: string | null;
  originalPath?: string;
  path?: string;
  phases?: TaskStatusPhase[];
  presetVersion?: string;
  progressPath?: string;
  queueReasons?: TaskStatusIssue[];
  reopenEligible?: boolean;
  repairPrompt?: string;
  reviewPath?: string;
  reviewConfirmation?: Record<string, unknown> | null;
  reviewStatus?: string;
  reviewQueueState?: string;
  reviewSubmission?: unknown;
  reviewSubmitted?: boolean;
  risks?: unknown[];
  roadmapSource?: string;
  scaffoldProvenance?: unknown;
  semanticProjection?: TaskStatusSemanticProjection;
  shortId?: string;
  state?: string;
  stateConflicts?: unknown[];
  stateRaw?: string;
  stateSource?: string;
  supersededBy?: string;
  supersedes?: unknown[];
  taskAudit?: unknown;
  taskContractGenerated?: boolean;
  taskContractVersion?: string;
  taskKind?: string;
  taskKey?: string;
  taskLifecycleProjection?: TaskStatusLifecycleProjection;
  taskPlanPath?: string;
  taskPreset?: string;
  taskQueues?: unknown[];
  title?: string;
  tombstoneSourcePath?: string;
  visibility?: TaskStatusVisibilityProjection;
  visibilityScopes?: string[];
  reviewWorkbenchQueueView?: TaskStatusReviewWorkbenchQueueView;
  dashboardTaskView?: TaskStatusDashboardTaskView;
  visualMapPath?: string;
  visualMapSource?: string;
  visualMapStatus?: string;
  walkthroughPath?: string;
};

export type TaskStatusCutoverProjection = {
  visualMapStatus: string;
  migrationClassification: string;
  briefQuality?: TaskStatusBriefQuality;
  visualMapSource: string;
};

export type TaskStatusProjectionReader = {
  listStatusTasks(query?: TaskQuery): TaskStatusProjection[];
};
