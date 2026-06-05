export const taskKernelAdaptersBoundary = {
  layer: "adapters",
  purpose: "Task Kernel CLI, REST, dashboard, preset, and test adapters live here after adapter cutover tasks.",
} as const;

export {
  buildKernelTaskListCommandResult,
  createMarkdownTaskPackageStoreService,
} from "./cli-task-list.mjs";
export type {
  KernelTaskListCommandResult,
  KernelTaskListOptions,
  KernelTaskListPayload,
} from "./cli-task-list.mjs";

export {
  createTaskKernelHttpAdapter,
  createTaskKernelNextRouteHandler,
  handleTaskKernelHttpRequest,
} from "./http.mjs";
export type {
  TaskKernelHttpAdapterServices,
  TaskKernelHttpActor,
  TaskKernelHttpContext,
  TaskKernelHttpErrorBody,
  TaskKernelHttpMethod,
  TaskKernelHttpRequest,
  TaskKernelHttpResponse,
  TaskKernelHttpResponseBody,
  TaskKernelNextRequestLike,
  TaskKernelNextResponseLike,
  TaskKernelNextRouteOptions,
} from "./http.mjs";
