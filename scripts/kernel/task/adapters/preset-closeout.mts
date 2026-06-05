import { Effect } from "effect";

import {
  TASK_QUERY_SERVICE_ID,
  makeTaskQueryService,
  type MaterialsIssue,
} from "../application/index.mjs";
import {
  InvalidTaskStateError,
  TaskKernelNotImplementedError,
  TaskNotFoundError,
  type TaskKernelError,
} from "../errors.mjs";
import {
  classifyTaskQueue,
  createGeneratedProjection,
  createTaskRef,
  type QueueName,
} from "../domain/index.mjs";
import {
  createMarkdownTaskPackageStoreReader,
} from "../infrastructure/index.mjs";
import {
  TASK_PACKAGE_STORE_PORT_ID,
  type TaskPackageStoreDetail,
  type TaskPackageStoreListInput,
  type TaskPackageStoreServiceShape,
  type TaskPackageSnapshot,
} from "../ports/index.mjs";

export type PresetTaskKernelPreflight = Readonly<{
  contract: "task-kernel-preset-closeout/v1";
  operation: "preset-action.preflight";
  queryService: typeof TASK_QUERY_SERVICE_ID;
  queries: readonly string[];
  taskId: string;
  taskPath: string;
  materialsIssues: readonly MaterialsIssue[];
  residuals: readonly string[];
}>;

export type PresetTaskKernelBoundaryInput = Readonly<{
  targetRoot: string;
  taskPath: string;
}>;

export function preflightPresetActionTaskKernelBoundary(input: PresetTaskKernelBoundaryInput): PresetTaskKernelPreflight {
  const queryService = makeTaskQueryService(createReadonlyMarkdownTaskPackageStore(input.targetRoot));
  const ref = createTaskRef({ kind: "module-path", value: input.taskPath });
  const resolved = Effect.runSync(queryService.resolveTaskRef({ ref }));
  const queries = ["ResolveTaskRef"];
  let materialsIssues: readonly MaterialsIssue[] = [];
  const residuals: string[] = [];
  try {
    const materials = Effect.runSync(queryService.getMaterialsIssues({ ref }));
    queries.push("GetMaterialsIssues");
    materialsIssues = materials.issues;
  } catch (error) {
    residuals.push(`TK-11: GetMaterialsIssues query needs Task Kernel metadata on preset-created tasks before it can become an active preset preflight gate: ${errorMessage(error)}`);
  }
  return {
    contract: "task-kernel-preset-closeout/v1",
    operation: "preset-action.preflight",
    queryService: queryService.identity,
    queries,
    taskId: resolved.taskId,
    taskPath: resolved.taskPath,
    materialsIssues,
    residuals,
  };
}

function createReadonlyMarkdownTaskPackageStore(root: string): TaskPackageStoreServiceShape {
  const reader = createMarkdownTaskPackageStoreReader({ root });
  return {
    identity: TASK_PACKAGE_STORE_PORT_ID,
    list: (input) =>
      Effect.try({
        try: () =>
          reader.list({ module: input.moduleKey }).map(snapshotSummary).filter((summary) =>
            matchesTaskPackageStoreListInput(summary, input)
          ),
        catch: taskKernelErrorFromUnknown,
      }),
    get: (ref) =>
      Effect.try({
        try: () => detailFromSnapshot(reader.get(ref)),
        catch: taskKernelErrorFromUnknown,
      }),
    resolve: (ref) =>
      Effect.try({
        try: () => {
          const resolved = reader.resolve(ref);
          return { taskId: resolved.id, taskPath: resolved.relativeDirectory };
        },
        catch: taskKernelErrorFromUnknown,
      }),
    create: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "create")),
    save: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "save")),
    archive: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "archive")),
    delete: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "delete")),
  };
}

function snapshotSummary(snapshot: TaskPackageSnapshot) {
  return {
    id: snapshot.task.id,
    title: snapshot.task.title,
    taskPath: snapshot.location.relativeDirectory,
    queue: classifyTaskQueue({ task: snapshot.task }),
    reviewStatus: snapshot.task.reviewStatus,
  };
}

function matchesTaskPackageStoreListInput(
  summary: ReturnType<typeof snapshotSummary>,
  input: TaskPackageStoreListInput,
): boolean {
  if (input.queue && summary.queue !== input.queue) return false;
  if (input.includeArchived !== true && (summary.queue as QueueName) === "archived") return false;
  if (input.includeDeleted !== true && (summary.queue as QueueName) === "deleted") return false;
  return true;
}

function detailFromSnapshot(snapshot: TaskPackageSnapshot): TaskPackageStoreDetail {
  return {
    task: snapshot.task,
    taskPath: snapshot.location.relativeDirectory,
    projections: [createGeneratedProjection({ name: "markdown-task-package-store", sourceTaskIds: [snapshot.task.id] })],
  };
}

function taskKernelErrorFromUnknown(error: unknown): TaskKernelError {
  if (isTaskKernelError(error)) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/Task not found/i.test(message)) return new TaskNotFoundError(message);
  return new InvalidTaskStateError(message);
}

function isTaskKernelError(error: unknown): error is TaskKernelError {
  return typeof error === "object" && error !== null && "_tag" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
