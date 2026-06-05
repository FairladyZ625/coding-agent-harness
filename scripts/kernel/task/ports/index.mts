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
  taskPackageStorePlaceholder,
  TaskPortsPlaceholderLayer,
  TaskPackageStorePlaceholderLayer,
} from "./layers.mjs";
export {
  taskMaterialNames,
} from "./task-package-store-reader.mjs";
export {
  GENERATED_PROJECTION_PORT_ID,
} from "./projection.mjs";
export type {
  GeneratedProjectionPortServiceShape,
  ProjectionDriftReport,
  ProjectionScopeInput,
} from "./projection.mjs";
export {
  TASK_PACKAGE_STORE_PORT_ID,
} from "./repository.mjs";
export type {
  TaskPackageStoreDetail,
  TaskPackageStoreListInput,
  TaskPackageStoreServiceShape,
  TaskPackageStoreSummary,
} from "./repository.mjs";
export {
  GeneratedProjectionPort,
  GitUnitOfWork,
  HumanReviewPort,
  TaskPackageStore,
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
export type {
  TaskMaterialName,
  TaskMaterialSnapshot,
  TaskPackageMaterials,
  TaskPackageSnapshot,
  TaskPackageStoreLocation,
  TaskPackageStoreQuery,
  TaskPackageStoreReader,
  WriteTaskMaterialInput,
} from "./task-package-store-reader.mjs";
