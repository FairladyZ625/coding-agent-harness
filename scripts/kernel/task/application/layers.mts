import { Effect, Layer } from "effect";

import {
  classifyTaskQueue,
  createTask,
  decideTaskReadiness,
  type Task,
  type TaskId,
} from "../domain/index.mjs";
import {
  InvalidTaskStateError,
  TaskKernelNotImplementedError,
  type TaskKernelError,
} from "../errors.mjs";
import type {
  GitUnitOfWorkServiceShape,
  HumanReviewPortServiceShape,
  TaskPackageStoreDetail,
  TaskPackageStoreServiceShape,
} from "../ports/index.mjs";
import {
  GitUnitOfWork,
  HumanReviewPort,
  TaskPackageStore,
} from "../ports/index.mjs";
import type {
  GetGateReportInput,
  GetMaterialsIssuesInput,
  GetRelationGraphInput,
  GetReviewQueueInput,
  ListTasksInput,
  MaterialsIssue,
  RelationGraphEdge,
  RelationGraphNode,
  TaskSummary,
} from "./contracts.mjs";
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

const unsupportedCommand = (methodName: string) => failNotImplemented(TASK_COMMAND_SERVICE_ID, methodName);

export function makeTaskQueryService(repository: TaskPackageStoreServiceShape): TaskQueryServiceShape {
  const listScopedTaskDetails = (input: ListTasksInput | GetReviewQueueInput | GetMaterialsIssuesInput | GetRelationGraphInput | GetGateReportInput) =>
    Effect.gen(function* () {
      const summaries = yield* repository.list({
        moduleKey: input.moduleKey,
        includeArchived: false,
        includeDeleted: false,
      });
      return yield* Effect.forEach(summaries, (summary) => repository.get({ kind: "task-id", value: summary.id }));
    });

  return {
    identity: TASK_QUERY_SERVICE_ID,
    listTasks: (input) =>
      Effect.gen(function* () {
        const summaries = yield* repository.list({
          moduleKey: input.moduleKey,
          queue: input.queue,
          includeArchived: input.includeArchived ?? false,
          includeDeleted: input.includeDeleted ?? false,
        });
        const details = yield* Effect.forEach(summaries, (summary) => repository.get({ kind: "task-id", value: summary.id }));
        return {
          tasks: details.map((detail): TaskSummary => taskSummaryFromDetail(detail)),
        };
      }),
    getTaskDetail: (input) =>
      Effect.map(repository.get(input.ref), (detail) => ({ detail })),
    resolveTaskRef: (input) =>
      Effect.map(repository.resolve(input.ref), ({ taskId, taskPath }) => ({ taskId, taskPath })),
    getReviewQueue: (input) =>
      Effect.gen(function* () {
        const details = yield* listScopedTaskDetails(input);
        const items = details
          .filter((detail) =>
            classifyTaskQueue({ task: detail.task }) === "review"
            || detail.task.reviewStatus === "required"
            || detail.task.reviewStatus === "agent-reviewed"
          )
          .map((detail) => ({
            taskId: detail.task.id,
            taskPath: detail.taskPath,
            reviewStatus: detail.task.reviewStatus,
            humanConfirmable: detail.task.reviewStatus === "agent-reviewed",
          }));
        return { items };
      }),
    getMaterialsIssues: (input) =>
      Effect.gen(function* () {
        const details = input.ref
          ? [yield* repository.get(input.ref)]
          : yield* listScopedTaskDetails(input);
        return {
          issues: details.flatMap((detail) => materialIssueFromDetail(detail)),
        };
      }),
    getRelationGraph: (input) =>
      Effect.gen(function* () {
        const details = input.root
          ? yield* collectRootRelationGraphDetails(repository, yield* repository.get(input.root))
          : yield* listScopedTaskDetails(input);
        return {
          nodes: relationGraphNodes(details),
          edges: relationGraphEdges(details),
        };
      }),
    getGateReport: (input) =>
      Effect.gen(function* () {
        const details = yield* listScopedTaskDetails(input);
        return {
          items: details.flatMap((detail) => gateReportItemsForTask(detail.task, input.gateProfile)),
        };
      }),
  };
}

export function makeTaskCommandService(input: {
  repository: TaskPackageStoreServiceShape;
  humanReview: HumanReviewPortServiceShape;
  unitOfWork: GitUnitOfWorkServiceShape;
}): TaskCommandServiceShape {
  return {
    identity: TASK_COMMAND_SERVICE_ID,
    createTask: () => unsupportedCommand("createTask"),
    updateTaskProgress: () => unsupportedCommand("updateTaskProgress"),
    startTask: () => unsupportedCommand("startTask"),
    blockTask: () => unsupportedCommand("blockTask"),
    submitAgentReview: () => unsupportedCommand("submitAgentReview"),
    confirmHumanReview: (command) =>
      input.unitOfWork.transact(
        {
          label: "task-kernel.confirm-human-review",
          writeScope: command.writeScope,
          evidenceRefs: [command.evidence],
        },
        Effect.gen(function* () {
          const current = yield* input.repository.get(command.ref);
          const confirmation = yield* input.humanReview.confirm({
            ref: command.ref,
            humanActorId: command.humanActorId,
            evidence: command.evidence,
            confirmedAt: new Date(),
          });
          const task = yield* recreateTask({
            ...current.task,
            reviewStatus: "human-confirmed",
            reviewConfirmation: confirmation,
          });
          const saved = yield* input.repository.save(task);
          return {
            taskId: saved.task.id,
            taskPath: saved.taskPath,
            evidenceRefs: [confirmation.evidence],
            confirmation,
          };
        }),
      ).pipe(
        Effect.map((result) => ({
          ...result.value,
          evidenceRefs: result.evidenceRefs.length > 0 ? result.evidenceRefs : result.value.evidenceRefs,
        })),
      ),
    completeTask: () => unsupportedCommand("completeTask"),
    archiveTask: () => unsupportedCommand("archiveTask"),
    deleteTask: () => unsupportedCommand("deleteTask"),
    reopenTask: () => unsupportedCommand("reopenTask"),
  };
}

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

export const TaskQueryServiceLiveLayer = Layer.effect(
  TaskQueryService,
  Effect.map(TaskPackageStore, makeTaskQueryService),
);

export const TaskCommandServiceLiveLayer = Layer.effect(
  TaskCommandService,
  Effect.gen(function* () {
    const repository = yield* TaskPackageStore;
    const humanReview = yield* HumanReviewPort;
    const unitOfWork = yield* GitUnitOfWork;
    return makeTaskCommandService({ repository, humanReview, unitOfWork });
  }),
);

export const TaskApplicationServicesLiveLayer = Layer.mergeAll(
  TaskQueryServiceLiveLayer,
  TaskCommandServiceLiveLayer,
);

function taskSummaryFromDetail(detail: TaskPackageStoreDetail): TaskSummary {
  return {
    id: detail.task.id,
    title: detail.task.title,
    moduleKey: detail.task.modulePlacement?.moduleKey,
    queue: classifyTaskQueue({ task: detail.task }),
    reviewStatus: detail.task.reviewStatus,
  };
}

function materialIssueFromDetail(detail: TaskPackageStoreDetail): readonly MaterialsIssue[] {
  if (detail.task.materials.kind !== "missing") return [];
  return [{
    taskId: detail.task.id,
    missingArtifactIds: detail.task.materials.missing,
    repairHints: detail.task.materials.missing.map((artifactId) =>
      `Provide required material ${artifactId} before rerunning task gates.`,
    ),
  }];
}

function relationGraphNodes(details: readonly TaskPackageStoreDetail[]): readonly RelationGraphNode[] {
  const nodes = new Map<TaskId, RelationGraphNode>();
  for (const detail of details) {
    nodes.set(detail.task.id, {
      taskId: detail.task.id,
      title: detail.task.title,
    });
  }
  return [...nodes.values()];
}

function collectRootRelationGraphDetails(
  repository: TaskPackageStoreServiceShape,
  root: TaskPackageStoreDetail,
): Effect.Effect<readonly TaskPackageStoreDetail[], TaskKernelError> {
  return Effect.gen(function* () {
    const targetDetails = yield* Effect.forEach(root.task.relations, (relation) =>
      repository.get(relation.target).pipe(
        Effect.map((detail) => [detail] as const),
        Effect.catchAll(() => Effect.succeed([] as const)),
      ),
    );
    return dedupeDetailsByTaskId([root, ...targetDetails.flat()]);
  });
}

function dedupeDetailsByTaskId(details: readonly TaskPackageStoreDetail[]): readonly TaskPackageStoreDetail[] {
  const unique = new Map<TaskId, TaskPackageStoreDetail>();
  for (const detail of details) unique.set(detail.task.id, detail);
  return [...unique.values()];
}

function relationGraphEdges(details: readonly TaskPackageStoreDetail[]): readonly RelationGraphEdge[] {
  return details.flatMap((detail) =>
    detail.task.relations.map((relation) => ({
      sourceTaskId: detail.task.id,
      relation,
    })),
  );
}

function gateReportItemsForTask(task: Task, gateProfile?: string) {
  const waivers = waiverRefsForTask(task);
  const readiness = decideTaskReadiness(task);
  const items = [
    {
      gate: `${task.id}/materials-complete`,
      passed: task.materials.kind === "complete",
      evidenceRefs: task.materials.required.map((artifactId) => `${task.id}/${artifactId}`),
      waiverRefs: waivers,
    },
    {
      gate: `${task.id}/task-readiness`,
      passed: readiness.ready,
      evidenceRefs: readiness.reasons.length === 0 ? [`${task.id}/readiness`] : readiness.reasons,
      waiverRefs: waivers,
    },
  ];
  if (!gateProfile) return items;
  return items.filter((item) => item.gate.includes(gateProfile));
}

function waiverRefsForTask(task: Task): readonly string[] {
  return Object.entries(task.auditMetadata ?? {})
    .filter(([key]) => key.toLowerCase().includes("waiver"))
    .flatMap(([, value]) => value.split(",").map((entry) => entry.trim()).filter(Boolean));
}

function recreateTask(task: Task): Effect.Effect<Task, TaskKernelError> {
  return Effect.try({
    try: () => createTask(task),
    catch: (error) => new InvalidTaskStateError(error instanceof Error ? error.message : String(error)),
  });
}
