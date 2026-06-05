import type {
  ArtifactId,
  GeneratedProjection,
  ModuleKey,
  QueueName,
  ReviewConfirmation,
  ReviewStatus,
  Task,
  TaskId,
  TaskRef,
  TaskRelation,
  WriteScope,
} from "../domain/index.mjs";

export type TaskScopeInput = Readonly<{
  moduleKey?: ModuleKey;
}>;

export type ListTasksInput = TaskScopeInput & Readonly<{
  queue?: QueueName;
  includeArchived?: boolean;
  includeDeleted?: boolean;
}>;

export type TaskSummary = Readonly<{
  id: TaskId;
  title: string;
  moduleKey?: ModuleKey;
  queue: QueueName;
  reviewStatus: ReviewStatus;
}>;

export type ListTasksOutput = Readonly<{
  tasks: readonly TaskSummary[];
}>;

export type GetTaskDetailInput = Readonly<{
  ref: TaskRef;
}>;

export type TaskPackageDetail = Readonly<{
  task: Task;
  taskPath: string;
  projections: readonly GeneratedProjection[];
}>;

export type GetTaskDetailOutput = Readonly<{
  detail: TaskPackageDetail;
}>;

export type ResolveTaskRefInput = Readonly<{
  ref: TaskRef;
}>;

export type ResolveTaskRefOutput = Readonly<{
  taskId: TaskId;
  taskPath: string;
}>;

export type GetReviewQueueInput = TaskScopeInput;

export type ReviewQueueItem = Readonly<{
  taskId: TaskId;
  taskPath: string;
  reviewStatus: ReviewStatus;
  humanConfirmable: boolean;
}>;

export type GetReviewQueueOutput = Readonly<{
  items: readonly ReviewQueueItem[];
}>;

export type GetMaterialsIssuesInput = TaskScopeInput & Readonly<{
  ref?: TaskRef;
}>;

export type MaterialsIssue = Readonly<{
  taskId: TaskId;
  missingArtifactIds: readonly ArtifactId[];
  repairHints: readonly string[];
}>;

export type GetMaterialsIssuesOutput = Readonly<{
  issues: readonly MaterialsIssue[];
}>;

export type GetRelationGraphInput = TaskScopeInput & Readonly<{
  root?: TaskRef;
}>;

export type RelationGraphNode = Readonly<{
  taskId: TaskId;
  title: string;
}>;

export type RelationGraphEdge = Readonly<{
  sourceTaskId: TaskId;
  relation: TaskRelation;
}>;

export type GetRelationGraphOutput = Readonly<{
  nodes: readonly RelationGraphNode[];
  edges: readonly RelationGraphEdge[];
}>;

export type GetGateReportInput = TaskScopeInput & Readonly<{
  gateProfile?: string;
}>;

export type GateReportItem = Readonly<{
  gate: string;
  passed: boolean;
  evidenceRefs: readonly string[];
  waiverRefs: readonly string[];
}>;

export type GetGateReportOutput = Readonly<{
  items: readonly GateReportItem[];
}>;

export type CreateTaskCommandInput = Readonly<{
  id: TaskId;
  title: string;
  moduleKey: ModuleKey;
  presetId: string;
  budget: string;
  writeScope: WriteScope;
}>;

export type TaskMutationOutput = Readonly<{
  taskId: TaskId;
  taskPath: string;
  evidenceRefs: readonly string[];
}>;

export type UpdateTaskProgressCommandInput = Readonly<{
  ref: TaskRef;
  entry: string;
  evidenceRefs: readonly string[];
  writeScope: WriteScope;
}>;

export type StartTaskCommandInput = Readonly<{
  ref: TaskRef;
  message: string;
  writeScope: WriteScope;
}>;

export type BlockTaskCommandInput = Readonly<{
  ref: TaskRef;
  reason: string;
  writeScope: WriteScope;
}>;

export type SubmitAgentReviewCommandInput = Readonly<{
  ref: TaskRef;
  summary: string;
  writeScope: WriteScope;
}>;

export type ConfirmHumanReviewCommandInput = Readonly<{
  ref: TaskRef;
  humanActorId: string;
  evidence: string;
  writeScope: WriteScope;
}>;

export type ConfirmHumanReviewOutput = TaskMutationOutput & Readonly<{
  confirmation: ReviewConfirmation;
}>;

export type CompleteTaskCommandInput = Readonly<{
  ref: TaskRef;
  evidenceRefs: readonly string[];
  writeScope: WriteScope;
}>;

export type ArchiveTaskCommandInput = Readonly<{
  ref: TaskRef;
  actor: string;
  reason: string;
  writeScope: WriteScope;
}>;

export type DeleteTaskCommandInput = Readonly<{
  ref: TaskRef;
  mode: "soft" | "hard";
  reason: string;
  writeScope: WriteScope;
}>;

export type ReopenTaskCommandInput = Readonly<{
  ref: TaskRef;
  reason: string;
  writeScope: WriteScope;
}>;
