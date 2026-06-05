import { Effect } from "effect";

import {
  createListTasksInputFromHttpQuery,
  createMaterialsIssuesInputFromHttpQuery,
  createReviewQueueInputFromHttpQuery,
  createTaskRefFromHttpPath,
  createWriteScopeFromHttpDto,
  parseHttpModuleKey,
  parseHttpTaskId,
  requiredString,
  requiredStringArray,
  type TaskCommandServiceShape,
  type TaskQueryServiceShape,
} from "../application/index.mjs";
import {
  HumanConfirmationRequiredError,
  InvalidTaskStateError,
  LegacyFallbackDetectedError,
  ProjectionDriftError,
  TaskKernelNotImplementedError,
  TaskNotFoundError,
  TaskRefAmbiguousError,
  WriteScopeViolationError,
  type TaskKernelError,
} from "../errors.mjs";

export type TaskKernelHttpMethod = "GET" | "POST";

export type TaskKernelHttpActor =
  | Readonly<{ kind: "agent"; id?: string }>
  | Readonly<{ kind: "human"; id: string }>;

export type TaskKernelHttpContext = Readonly<{
  isLocal: boolean;
  csrfVerified?: boolean;
  actor?: TaskKernelHttpActor;
}>;

export type TaskKernelHttpRequest = Readonly<{
  method: TaskKernelHttpMethod;
  path: string;
  query?: Readonly<Record<string, unknown>>;
  body?: unknown;
  context: TaskKernelHttpContext;
}>;

export type TaskKernelHttpResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: TaskKernelHttpResponseBody;
}>;

export type TaskKernelHttpResponseBody =
  | Readonly<{ ok: true; data: unknown }>
  | Readonly<{ ok: false; error: TaskKernelHttpErrorBody }>;

export type TaskKernelHttpErrorBody = Readonly<{
  code: string;
  message: string;
}>;

export type TaskKernelHttpAdapterServices = Readonly<{
  queries: TaskQueryServiceShape;
  commands: TaskCommandServiceShape;
}>;

export type TaskKernelNextRequestLike = Readonly<{
  method: string;
  url: string;
  json: () => Promise<unknown>;
  headers?: Readonly<{ get: (name: string) => string | null }>;
}>;

export type TaskKernelNextResponseLike = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: TaskKernelHttpResponseBody;
}>;

export type TaskKernelNextRouteOptions = Readonly<{
  contextFromRequest: (request: TaskKernelNextRequestLike) => TaskKernelHttpContext;
}>;

export function createTaskKernelHttpAdapter(services: TaskKernelHttpAdapterServices) {
  return {
    handle: (request: TaskKernelHttpRequest): Promise<TaskKernelHttpResponse> =>
      handleTaskKernelHttpRequest(services, request),
  };
}

export function createTaskKernelNextRouteHandler(
  services: TaskKernelHttpAdapterServices,
  options: TaskKernelNextRouteOptions,
) {
  const adapter = createTaskKernelHttpAdapter(services);
  return async function taskKernelNextRouteHandler(request: TaskKernelNextRequestLike): Promise<TaskKernelNextResponseLike> {
    const url = new URL(request.url, "http://localhost");
    const method = normalizeMethod(request.method);
    const body = method === "GET" ? undefined : await request.json();
    const response = await adapter.handle({
      method,
      path: url.pathname,
      query: queryFromUrl(url),
      body,
      context: options.contextFromRequest(request),
    });
    return response;
  };
}

export async function handleTaskKernelHttpRequest(
  services: TaskKernelHttpAdapterServices,
  request: TaskKernelHttpRequest,
): Promise<TaskKernelHttpResponse> {
  try {
    requireLocalRequest(request);
    requireCsrfForMutation(request);
    const route = parseRoute(request.path);
    if (request.method === "GET" && route.kind === "tasks") {
      return ok(await runKernelEffect(services.queries.listTasks(createListTasksInputFromHttpQuery(request.query ?? {}))));
    }
    if (request.method === "GET" && route.kind === "review-queue") {
      return ok(await runKernelEffect(services.queries.getReviewQueue(createReviewQueueInputFromHttpQuery(request.query ?? {}))));
    }
    if (request.method === "GET" && route.kind === "materials-issues") {
      return ok(await runKernelEffect(services.queries.getMaterialsIssues(createMaterialsIssuesInputFromHttpQuery(request.query ?? {}))));
    }
    if (request.method === "GET" && route.kind === "task-detail") {
      return ok(await runKernelEffect(services.queries.getTaskDetail({ ref: route.ref })));
    }
    if (request.method === "GET" && route.kind === "task-gates") {
      const gateProfile = optionalBodyString(request.query?.gateProfile, "gateProfile");
      return ok(await runKernelEffect(services.queries.getGateReport({ gateProfile })));
    }
    if (request.method === "POST" && route.kind === "tasks") {
      const body = objectBody(request.body);
      return ok(await runKernelEffect(services.commands.createTask({
        id: parseHttpTaskId(body.id),
        title: requiredString(body.title, "title"),
        moduleKey: parseHttpModuleKey(body.moduleKey),
        presetId: requiredString(body.presetId, "presetId"),
        budget: requiredString(body.budget, "budget"),
        writeScope: writeScopeFromBody(body),
      })));
    }
    if (request.method === "POST" && route.kind === "task-review") {
      const body = objectBody(request.body);
      return ok(await runKernelEffect(services.commands.submitAgentReview({
        ref: route.ref,
        summary: requiredString(body.summary, "summary"),
        writeScope: writeScopeFromBody(body),
      })));
    }
    if (request.method === "POST" && route.kind === "task-confirm") {
      if (request.context.actor?.kind !== "human") {
        throw new HumanConfirmationRequiredError("ConfirmHumanReview requires a human-controlled adapter context.");
      }
      const body = objectBody(request.body);
      return ok(await runKernelEffect(services.commands.confirmHumanReview({
        ref: route.ref,
        humanActorId: optionalBodyString(body.humanActorId, "humanActorId") ?? request.context.actor.id,
        evidence: requiredString(body.evidence, "evidence"),
        writeScope: writeScopeFromBody(body),
      })));
    }
    if (request.method === "POST" && route.kind === "task-archive") {
      const body = objectBody(request.body);
      return ok(await runKernelEffect(services.commands.archiveTask({
        ref: route.ref,
        actor: requiredString(body.actor, "actor"),
        reason: requiredString(body.reason, "reason"),
        writeScope: writeScopeFromBody(body),
      })));
    }
    return errorResponse(404, "route-not-found", `No Task Kernel HTTP route for ${request.method} ${request.path}`);
  } catch (error) {
    return errorFromUnknown(error);
  }
}

type ParsedRoute =
  | Readonly<{ kind: "tasks" }>
  | Readonly<{ kind: "review-queue" }>
  | Readonly<{ kind: "materials-issues" }>
  | Readonly<{ kind: "task-detail"; ref: ReturnType<typeof createTaskRefFromHttpPath> }>
  | Readonly<{ kind: "task-gates"; ref: ReturnType<typeof createTaskRefFromHttpPath> }>
  | Readonly<{ kind: "task-review"; ref: ReturnType<typeof createTaskRefFromHttpPath> }>
  | Readonly<{ kind: "task-confirm"; ref: ReturnType<typeof createTaskRefFromHttpPath> }>
  | Readonly<{ kind: "task-archive"; ref: ReturnType<typeof createTaskRefFromHttpPath> }>
  | Readonly<{ kind: "not-found" }>;

function parseRoute(pathname: string): ParsedRoute {
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length === 2 && parts[0] === "api" && parts[1] === "tasks") return { kind: "tasks" };
  if (parts.length === 3 && parts[0] === "api" && parts[1] === "tasks" && parts[2] === "review-queue") {
    return { kind: "review-queue" };
  }
  if (parts.length === 3 && parts[0] === "api" && parts[1] === "tasks" && parts[2] === "materials-issues") {
    return { kind: "materials-issues" };
  }
  if (parts.length >= 3 && parts[0] === "api" && parts[1] === "tasks") {
    const ref = createTaskRefFromHttpPath(parts[2] ?? "");
    if (parts.length === 3) return { kind: "task-detail", ref };
    if (parts.length === 4 && parts[3] === "gates") return { kind: "task-gates", ref };
    if (parts.length === 4 && parts[3] === "review") return { kind: "task-review", ref };
    if (parts.length === 4 && parts[3] === "confirm") return { kind: "task-confirm", ref };
    if (parts.length === 4 && parts[3] === "archive") return { kind: "task-archive", ref };
  }
  return { kind: "not-found" };
}

function requireLocalRequest(request: TaskKernelHttpRequest): void {
  if (!request.context.isLocal) {
    throw new TaskKernelHttpValidationError(403, "local-only-required", "Task Kernel HTTP routes are local-only.");
  }
}

function requireCsrfForMutation(request: TaskKernelHttpRequest): void {
  if (request.method === "POST" && request.context.csrfVerified !== true) {
    throw new TaskKernelHttpValidationError(403, "csrf-required", "Task Kernel mutation routes require CSRF verification.");
  }
}

function objectBody(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TaskKernelHttpValidationError(400, "invalid-body", "Request body must be an object.");
  }
  return value as Readonly<Record<string, unknown>>;
}

function writeScopeFromBody(body: Readonly<Record<string, unknown>>) {
  const writeScope = objectField(body, "writeScope");
  return createWriteScopeFromHttpDto({
    allowedPaths: requiredStringArray(writeScope.allowedPaths, "writeScope.allowedPaths"),
  });
}

function objectField(body: Readonly<Record<string, unknown>>, field: string): Readonly<Record<string, unknown>> {
  const value = body[field];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TaskKernelHttpValidationError(400, "invalid-body", `${field} must be an object.`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function optionalBodyString(value: unknown, field: string): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, field);
}

function ok(data: unknown): TaskKernelHttpResponse {
  return {
    status: 200,
    headers: { "content-type": "application/json" },
    body: { ok: true, data },
  };
}

async function runKernelEffect<A>(effect: Effect.Effect<A, TaskKernelError>): Promise<A> {
  const result = await Effect.runPromise(Effect.either(effect));
  if (result._tag === "Left") throw result.left;
  return result.right;
}

function errorFromUnknown(error: unknown): TaskKernelHttpResponse {
  if (error instanceof TaskKernelHttpValidationError) return errorResponse(error.status, error.code, error.message);
  if (error instanceof TaskNotFoundError) return kernelErrorResponse(404, error);
  if (error instanceof TaskRefAmbiguousError) return kernelErrorResponse(409, error);
  if (error instanceof InvalidTaskStateError) return kernelErrorResponse(422, error);
  if (error instanceof HumanConfirmationRequiredError) return kernelErrorResponse(403, error);
  if (error instanceof WriteScopeViolationError) return kernelErrorResponse(403, error);
  if (error instanceof ProjectionDriftError) return kernelErrorResponse(409, error);
  if (error instanceof LegacyFallbackDetectedError) return kernelErrorResponse(500, error);
  if (error instanceof TaskKernelNotImplementedError) return kernelErrorResponse(501, error);
  if (error instanceof Error && "_tag" in error) return kernelErrorResponse(500, error as TaskKernelError);
  return errorResponse(400, "invalid-body", error instanceof Error ? error.message : String(error));
}

function kernelErrorResponse(status: number, error: TaskKernelError): TaskKernelHttpResponse {
  return errorResponse(status, error._tag, error.message);
}

function errorResponse(status: number, code: string, message: string): TaskKernelHttpResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: {
      ok: false,
      error: { code, message },
    },
  };
}

function normalizeMethod(method: string): TaskKernelHttpMethod {
  if (method === "GET" || method === "POST") return method;
  throw new TaskKernelHttpValidationError(405, "method-not-allowed", `Unsupported Task Kernel HTTP method: ${method}`);
}

function queryFromUrl(url: URL): Readonly<Record<string, unknown>> {
  const query: Record<string, unknown> = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;
  return query;
}

class TaskKernelHttpValidationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "TaskKernelHttpValidationError";
  }
}
