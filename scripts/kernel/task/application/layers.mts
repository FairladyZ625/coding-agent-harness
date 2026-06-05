import { Effect, Layer } from "effect";

import { TaskKernelNotImplementedError } from "../errors.mjs";
import {
  TASK_COMMAND_SERVICE_ID,
  TASK_QUERY_SERVICE_ID,
  TaskCommandService,
  TaskQueryService,
  type TaskCommandServiceShape,
  type TaskQueryServiceShape,
} from "./services.mjs";

const failNotImplemented = (serviceId: string, methodName: string) =>
  Effect.fail(new TaskKernelNotImplementedError(serviceId, methodName));

export const taskQueryServicePlaceholder: TaskQueryServiceShape = {
  identity: TASK_QUERY_SERVICE_ID,
  listTasks: () => failNotImplemented(TASK_QUERY_SERVICE_ID, "listTasks"),
  getTaskDetail: () => failNotImplemented(TASK_QUERY_SERVICE_ID, "getTaskDetail"),
  resolveTaskRef: () => failNotImplemented(TASK_QUERY_SERVICE_ID, "resolveTaskRef"),
  getReviewQueue: () => failNotImplemented(TASK_QUERY_SERVICE_ID, "getReviewQueue"),
  getMaterialsIssues: () => failNotImplemented(TASK_QUERY_SERVICE_ID, "getMaterialsIssues"),
  getRelationGraph: () => failNotImplemented(TASK_QUERY_SERVICE_ID, "getRelationGraph"),
  getGateReport: () => failNotImplemented(TASK_QUERY_SERVICE_ID, "getGateReport"),
};

export const taskCommandServicePlaceholder: TaskCommandServiceShape = {
  identity: TASK_COMMAND_SERVICE_ID,
  createTask: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "createTask"),
  updateTaskProgress: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "updateTaskProgress"),
  startTask: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "startTask"),
  blockTask: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "blockTask"),
  submitAgentReview: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "submitAgentReview"),
  confirmHumanReview: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "confirmHumanReview"),
  completeTask: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "completeTask"),
  archiveTask: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "archiveTask"),
  deleteTask: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "deleteTask"),
  reopenTask: () => failNotImplemented(TASK_COMMAND_SERVICE_ID, "reopenTask"),
};

export const TaskQueryServicePlaceholderLayer = Layer.succeed(TaskQueryService, taskQueryServicePlaceholder);
export const TaskCommandServicePlaceholderLayer = Layer.succeed(TaskCommandService, taskCommandServicePlaceholder);

export const TaskApplicationServicesPlaceholderLayer = Layer.mergeAll(
  TaskQueryServicePlaceholderLayer,
  TaskCommandServicePlaceholderLayer,
);
