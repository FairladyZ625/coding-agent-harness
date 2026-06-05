import type { Effect } from "effect";

import type { GeneratedProjection, QueueName, ReviewStatus, Task, TaskId, TaskRef } from "../domain/index.mjs";
import type { TaskKernelError } from "../errors.mjs";

export const TASK_PACKAGE_STORE_PORT_ID = "coding-agent-harness/task-kernel/ports/TaskPackageStore";

export type TaskPackageStoreListInput = Readonly<{
  moduleKey?: string;
  queue?: QueueName;
  includeArchived?: boolean;
  includeDeleted?: boolean;
}>;

export type TaskPackageStoreSummary = Readonly<{
  id: TaskId;
  title: string;
  taskPath: string;
  queue: QueueName;
  reviewStatus: ReviewStatus;
}>;

export type TaskPackageStoreDetail = Readonly<{
  task: Task;
  taskPath: string;
  projections: readonly GeneratedProjection[];
}>;

export type TaskPackageStoreServiceShape = Readonly<{
  identity: typeof TASK_PACKAGE_STORE_PORT_ID;
  list: (input: TaskPackageStoreListInput) => Effect.Effect<readonly TaskPackageStoreSummary[], TaskKernelError>;
  get: (ref: TaskRef) => Effect.Effect<TaskPackageStoreDetail, TaskKernelError>;
  resolve: (ref: TaskRef) => Effect.Effect<{ taskId: TaskId; taskPath: string }, TaskKernelError>;
  create: (task: Task) => Effect.Effect<TaskPackageStoreDetail, TaskKernelError>;
  save: (task: Task) => Effect.Effect<TaskPackageStoreDetail, TaskKernelError>;
  archive: (ref: TaskRef) => Effect.Effect<TaskPackageStoreDetail, TaskKernelError>;
  delete: (ref: TaskRef, mode: "soft" | "hard") => Effect.Effect<TaskPackageStoreDetail, TaskKernelError>;
}>;
