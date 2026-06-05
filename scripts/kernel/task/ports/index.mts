export const taskKernelPortsBoundary = {
  layer: "ports",
  purpose: "Task Kernel repository, transaction, review, and projection ports live here after TK-02 and TK-03.",
} as const;

export {
  generatedProjectionPortPlaceholder,
  GeneratedProjectionPortPlaceholderLayer,
  gitUnitOfWorkPlaceholder,
  GitUnitOfWorkPlaceholderLayer,
  humanReviewPortPlaceholder,
  HumanReviewPortPlaceholderLayer,
  taskRepositoryPlaceholder,
  TaskPortsPlaceholderLayer,
  TaskRepositoryPlaceholderLayer,
} from "./layers.mjs";
export {
  GENERATED_PROJECTION_PORT_ID,
} from "./projection.mjs";
export type {
  GeneratedProjectionPortServiceShape,
  ProjectionDriftReport,
  ProjectionScopeInput,
} from "./projection.mjs";
export {
  TASK_REPOSITORY_PORT_ID,
} from "./repository.mjs";
export type {
  TaskRepositoryDetail,
  TaskRepositoryListInput,
  TaskRepositoryServiceShape,
  TaskRepositorySummary,
} from "./repository.mjs";
export {
  GeneratedProjectionPort,
  GitUnitOfWork,
  HumanReviewPort,
  TaskRepository,
} from "./services.mjs";
export {
  GIT_UNIT_OF_WORK_PORT_ID,
} from "./unit-of-work.mjs";
export type {
  GitUnitOfWorkInput,
  GitUnitOfWorkResult,
  GitUnitOfWorkServiceShape,
} from "./unit-of-work.mjs";
export {
  HUMAN_REVIEW_PORT_ID,
} from "./human-review.mjs";
export type {
  HumanReviewConfirmationInput,
  HumanReviewPortServiceShape,
} from "./human-review.mjs";
