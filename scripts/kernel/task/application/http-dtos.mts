import {
  createTaskRef,
  createWriteScope,
  parseModuleKey,
  parseQueueName,
  parseTaskId,
  type TaskRef,
  type WriteScope,
} from "../domain/index.mjs";
import type {
  GetMaterialsIssuesInput,
  GetReviewQueueInput,
  ListTasksInput,
} from "./contracts.mjs";

export type HttpTaskRefDto = Readonly<{
  kind: TaskRef["kind"];
  value: string;
}>;

export type HttpWriteScopeDto = Readonly<{
  allowedPaths: readonly string[];
}>;

export function createTaskRefFromHttpDto(input: HttpTaskRefDto): TaskRef {
  return createTaskRef(input);
}

export function createTaskRefFromHttpPath(value: string, kind: TaskRef["kind"] = "task-id"): TaskRef {
  return createTaskRef({ kind, value });
}

export function createWriteScopeFromHttpDto(input: HttpWriteScopeDto): WriteScope {
  return createWriteScope(input);
}

export function createListTasksInputFromHttpQuery(query: Readonly<Record<string, unknown>>): ListTasksInput {
  return {
    moduleKey: optionalModuleKey(query.moduleKey),
    queue: optionalQueueName(query.queue),
    includeArchived: optionalBoolean(query.includeArchived),
    includeDeleted: optionalBoolean(query.includeDeleted),
  };
}

export function createReviewQueueInputFromHttpQuery(query: Readonly<Record<string, unknown>>): GetReviewQueueInput {
  return {
    moduleKey: optionalModuleKey(query.moduleKey),
  };
}

export function createMaterialsIssuesInputFromHttpQuery(query: Readonly<Record<string, unknown>>): GetMaterialsIssuesInput {
  const ref = optionalString(query.ref);
  const refKind = optionalTaskRefKind(query.refKind) ?? "task-id";
  return {
    moduleKey: optionalModuleKey(query.moduleKey),
    ref: ref ? createTaskRefFromHttpPath(ref, refKind) : undefined,
  };
}

export function parseHttpTaskId(value: unknown): ReturnType<typeof parseTaskId> {
  return parseTaskId(requiredString(value, "id"));
}

export function parseHttpModuleKey(value: unknown): ReturnType<typeof parseModuleKey> {
  return parseModuleKey(requiredString(value, "moduleKey"));
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${field} must not be empty`);
  return trimmed;
}

export function requiredStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((entry, index) => requiredString(entry, `${field}[${index}]`));
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, "query value");
}

export function optionalBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") throw new Error("boolean query value must be a boolean or string");
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Invalid boolean query value: ${JSON.stringify(value)}`);
}

export function optionalTaskRefKind(value: unknown): TaskRef["kind"] | undefined {
  if (value === undefined) return undefined;
  const kind = requiredString(value, "refKind");
  if (kind === "task-id" || kind === "module-path" || kind === "legacy-path") return kind;
  throw new Error(`Invalid refKind: ${kind}`);
}

function optionalModuleKey(value: unknown) {
  const raw = optionalString(value);
  return raw ? parseModuleKey(raw) : undefined;
}

function optionalQueueName(value: unknown) {
  const raw = optionalString(value);
  return raw ? parseQueueName(raw) : undefined;
}
