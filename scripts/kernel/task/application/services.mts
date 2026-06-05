import { Context, Effect } from "effect";

import type { TaskKernelError } from "../errors.mjs";
import type {
  ArchiveTaskCommandInput,
  BlockTaskCommandInput,
  CompleteTaskCommandInput,
  ConfirmHumanReviewCommandInput,
  ConfirmHumanReviewOutput,
  CreateTaskCommandInput,
  DeleteTaskCommandInput,
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
  ReopenTaskCommandInput,
  ResolveTaskRefInput,
  ResolveTaskRefOutput,
  StartTaskCommandInput,
  SubmitAgentReviewCommandInput,
  TaskMutationOutput,
  UpdateTaskProgressCommandInput,
} from "./contracts.mjs";

export const TASK_QUERY_SERVICE_ID = "coding-agent-harness/task-kernel/application/TaskQueryService";
export const TASK_COMMAND_SERVICE_ID = "coding-agent-harness/task-kernel/application/TaskCommandService";

export type TaskQueryServiceShape = Readonly<{
  identity: typeof TASK_QUERY_SERVICE_ID;
  listTasks: (input: ListTasksInput) => Effect.Effect<ListTasksOutput, TaskKernelError>;
  getTaskDetail: (input: GetTaskDetailInput) => Effect.Effect<GetTaskDetailOutput, TaskKernelError>;
  resolveTaskRef: (input: ResolveTaskRefInput) => Effect.Effect<ResolveTaskRefOutput, TaskKernelError>;
  getReviewQueue: (input: GetReviewQueueInput) => Effect.Effect<GetReviewQueueOutput, TaskKernelError>;
  getMaterialsIssues: (input: GetMaterialsIssuesInput) => Effect.Effect<GetMaterialsIssuesOutput, TaskKernelError>;
  getRelationGraph: (input: GetRelationGraphInput) => Effect.Effect<GetRelationGraphOutput, TaskKernelError>;
  getGateReport: (input: GetGateReportInput) => Effect.Effect<GetGateReportOutput, TaskKernelError>;
}>;

export type TaskCommandServiceShape = Readonly<{
  identity: typeof TASK_COMMAND_SERVICE_ID;
  createTask: (input: CreateTaskCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
  updateTaskProgress: (input: UpdateTaskProgressCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
  startTask: (input: StartTaskCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
  blockTask: (input: BlockTaskCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
  submitAgentReview: (input: SubmitAgentReviewCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
  confirmHumanReview: (input: ConfirmHumanReviewCommandInput) => Effect.Effect<ConfirmHumanReviewOutput, TaskKernelError>;
  completeTask: (input: CompleteTaskCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
  archiveTask: (input: ArchiveTaskCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
  deleteTask: (input: DeleteTaskCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
  reopenTask: (input: ReopenTaskCommandInput) => Effect.Effect<TaskMutationOutput, TaskKernelError>;
}>;

export class TaskQueryService extends Context.Tag(TASK_QUERY_SERVICE_ID)<
  TaskQueryService,
  TaskQueryServiceShape
>() {}

export class TaskCommandService extends Context.Tag(TASK_COMMAND_SERVICE_ID)<
  TaskCommandService,
  TaskCommandServiceShape
>() {}

export const TaskQueries = Effect.serviceFunctions(TaskQueryService);
export const TaskCommands = Effect.serviceFunctions(TaskCommandService);
