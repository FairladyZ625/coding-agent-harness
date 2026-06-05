import { Effect, Layer } from "effect";

import { TaskKernelNotImplementedError } from "../errors.mjs";
import {
  GENERATED_PROJECTION_PORT_ID,
  type GeneratedProjectionPortServiceShape,
} from "./projection.mjs";
import {
  GIT_UNIT_OF_WORK_PORT_ID,
  type GitUnitOfWorkServiceShape,
} from "./unit-of-work.mjs";
import {
  HUMAN_REVIEW_PORT_ID,
  type HumanReviewPortServiceShape,
} from "./human-review.mjs";
import {
  TASK_PACKAGE_STORE_PORT_ID,
  type TaskPackageStoreServiceShape,
} from "./repository.mjs";
import {
  GeneratedProjectionPort,
  GitUnitOfWork,
  HumanReviewPort,
  TaskPackageStore,
} from "./services.mjs";

const failNotImplemented = (serviceId: string, methodName: string) =>
  Effect.fail(new TaskKernelNotImplementedError(serviceId, methodName));

export const taskPackageStorePlaceholder: TaskPackageStoreServiceShape = {
  identity: TASK_PACKAGE_STORE_PORT_ID,
  list: () => failNotImplemented(TASK_PACKAGE_STORE_PORT_ID, "list"),
  get: () => failNotImplemented(TASK_PACKAGE_STORE_PORT_ID, "get"),
  resolve: () => failNotImplemented(TASK_PACKAGE_STORE_PORT_ID, "resolve"),
  create: () => failNotImplemented(TASK_PACKAGE_STORE_PORT_ID, "create"),
  save: () => failNotImplemented(TASK_PACKAGE_STORE_PORT_ID, "save"),
  archive: () => failNotImplemented(TASK_PACKAGE_STORE_PORT_ID, "archive"),
  delete: () => failNotImplemented(TASK_PACKAGE_STORE_PORT_ID, "delete"),
};

export const gitUnitOfWorkPlaceholder: GitUnitOfWorkServiceShape = {
  identity: GIT_UNIT_OF_WORK_PORT_ID,
  transact: () => failNotImplemented(GIT_UNIT_OF_WORK_PORT_ID, "transact"),
};

export const humanReviewPortPlaceholder: HumanReviewPortServiceShape = {
  identity: HUMAN_REVIEW_PORT_ID,
  confirm: () => failNotImplemented(HUMAN_REVIEW_PORT_ID, "confirm"),
};

export const generatedProjectionPortPlaceholder: GeneratedProjectionPortServiceShape = {
  identity: GENERATED_PROJECTION_PORT_ID,
  rebuild: () => failNotImplemented(GENERATED_PROJECTION_PORT_ID, "rebuild"),
  detectDrift: () => failNotImplemented(GENERATED_PROJECTION_PORT_ID, "detectDrift"),
};

export const TaskPackageStorePlaceholderLayer = Layer.succeed(TaskPackageStore, taskPackageStorePlaceholder);
export const GitUnitOfWorkPlaceholderLayer = Layer.succeed(GitUnitOfWork, gitUnitOfWorkPlaceholder);
export const HumanReviewPortPlaceholderLayer = Layer.succeed(HumanReviewPort, humanReviewPortPlaceholder);
export const GeneratedProjectionPortPlaceholderLayer = Layer.succeed(
  GeneratedProjectionPort,
  generatedProjectionPortPlaceholder,
);

export const TaskPortsPlaceholderLayer = Layer.mergeAll(
  TaskPackageStorePlaceholderLayer,
  GitUnitOfWorkPlaceholderLayer,
  HumanReviewPortPlaceholderLayer,
  GeneratedProjectionPortPlaceholderLayer,
);
