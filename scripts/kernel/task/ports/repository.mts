import type { Effect } from "effect";

import type { GeneratedProjection, QueueName, ReviewStatus, Task, TaskId, TaskRef } from "../domain/index.mjs";
import type { TaskKernelError } from "../errors.mjs";

export const TASK_REPOSITORY_PORT_ID = "coding-agent-harness/task-kernel/ports/TaskRepository";

export type TaskRepositoryListInput = Readonly<{
  moduleKey?: string;
  queue?: QueueName;
  includeArchived?: boolean;
  includeDeleted?: boolean;
}>;

export type TaskRepositorySummary = Readonly<{
  id: TaskId;
  title: string;
  taskPath: string;
  queue: QueueName;
  reviewStatus: ReviewStatus;
}>;

export type TaskRepositoryDetail = Readonly<{
  task: Task;
  taskPath: string;
  projections: readonly GeneratedProjection[];
}>;

export type TaskRepositoryServiceShape = Readonly<{
  identity: typeof TASK_REPOSITORY_PORT_ID;
  list: (input: TaskRepositoryListInput) => Effect.Effect<readonly TaskRepositorySummary[], TaskKernelError>;
  get: (ref: TaskRef) => Effect.Effect<TaskRepositoryDetail, TaskKernelError>;
  resolve: (ref: TaskRef) => Effect.Effect<{ taskId: TaskId; taskPath: string }, TaskKernelError>;
  create: (task: Task) => Effect.Effect<TaskRepositoryDetail, TaskKernelError>;
  save: (task: Task) => Effect.Effect<TaskRepositoryDetail, TaskKernelError>;
  archive: (ref: TaskRef) => Effect.Effect<TaskRepositoryDetail, TaskKernelError>;
  delete: (ref: TaskRef, mode: "soft" | "hard") => Effect.Effect<TaskRepositoryDetail, TaskKernelError>;
}>;
