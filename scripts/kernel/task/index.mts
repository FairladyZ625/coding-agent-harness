export {
  TASK_KERNEL_FRAME_VERSION,
  listTaskKernelLayers,
  taskKernelFrame,
  taskKernelLayerIds,
} from "./kernel-frame.mjs";
export type {
  TaskKernelFrame,
  TaskKernelLayerDescriptor,
  TaskKernelLayerId,
} from "./kernel-frame.mjs";

export { taskKernelAdaptersBoundary } from "./adapters/index.mjs";
export { taskKernelApplicationBoundary } from "./application/index.mjs";
export { taskKernelDomainBoundary } from "./domain/index.mjs";
export { taskKernelInfrastructureBoundary } from "./infrastructure/index.mjs";
export { taskKernelPortsBoundary } from "./ports/index.mjs";

export {
  HumanConfirmationRequiredError,
  InvalidTaskStateError,
  LegacyFallbackDetectedError,
  ProjectionDriftError,
  TaskKernelNotImplementedError,
  TaskNotFoundError,
  TaskRefAmbiguousError,
  WriteScopeViolationError,
} from "./errors.mjs";
export type {
  TaskKernelError,
  TaskKernelErrorTag,
} from "./errors.mjs";

export type {
  ArchiveTaskCommandInput,
  BlockTaskCommandInput,
  CompleteTaskCommandInput,
  ConfirmHumanReviewCommandInput,
  ConfirmHumanReviewOutput,
  CreateTaskCommandInput,
  DeleteTaskCommandInput,
  GateReportItem,
  GetGateReportInput,
  GetGateReportOutput,
  GetMaterialsIssuesInput,
  GetMaterialsIssuesOutput,
  GetRelationGraphInput,
  GetRelationGraphOutput,
  GetReviewQueueInput,
  GetReviewQueueOutput,
  GetTaskDetailInput,
  GetTaskDetailOutput,
  ListTasksInput,
  ListTasksOutput,
  MaterialsIssue,
  RelationGraphEdge,
  RelationGraphNode,
  ReopenTaskCommandInput,
  ResolveTaskRefInput,
  ResolveTaskRefOutput,
  ReviewQueueItem,
  StartTaskCommandInput,
  SubmitAgentReviewCommandInput,
  TaskMutationOutput,
  TaskPackageDetail,
  TaskScopeInput,
  TaskSummary,
  UpdateTaskProgressCommandInput,
} from "./application/index.mjs";
export {
  TASK_COMMAND_SERVICE_ID,
  TASK_QUERY_SERVICE_ID,
  makeTaskCommandService,
  makeTaskQueryService,
  TaskApplicationServicesLiveLayer,
  taskCommandServicePlaceholder,
  TaskApplicationServicesPlaceholderLayer,
  TaskCommandServiceLiveLayer,
  TaskCommands,
  TaskCommandService,
  TaskCommandServicePlaceholderLayer,
  taskQueryServicePlaceholder,
  TaskQueries,
  TaskQueryService,
  TaskQueryServiceLiveLayer,
  TaskQueryServicePlaceholderLayer,
} from "./application/index.mjs";
export type {
  TaskCommandServiceShape,
  TaskQueryServiceShape,
} from "./application/index.mjs";

export {
  GENERATED_PROJECTION_PORT_ID,
  GeneratedProjectionPort,
  generatedProjectionPortPlaceholder,
  GeneratedProjectionPortPlaceholderLayer,
  GIT_UNIT_OF_WORK_PORT_ID,
  GitUnitOfWork,
  gitUnitOfWorkPlaceholder,
  GitUnitOfWorkPlaceholderLayer,
  HUMAN_REVIEW_PORT_ID,
  HumanReviewPort,
  humanReviewPortPlaceholder,
  HumanReviewPortPlaceholderLayer,
  TASK_PACKAGE_STORE_PORT_ID,
  TaskPortsPlaceholderLayer,
  TaskPackageStore,
  taskPackageStorePlaceholder,
  TaskPackageStorePlaceholderLayer,
} from "./ports/index.mjs";
export type {
  GeneratedProjectionPortServiceShape,
  GitUnitOfWorkInput,
  GitUnitOfWorkResult,
  GitUnitOfWorkServiceShape,
  HumanReviewConfirmationInput,
  HumanReviewPortServiceShape,
  ProjectionDriftReport,
  ProjectionScopeInput,
  TaskPackageStoreDetail,
  TaskPackageStoreListInput,
  TaskPackageStoreServiceShape,
  TaskPackageStoreSummary,
} from "./ports/index.mjs";
