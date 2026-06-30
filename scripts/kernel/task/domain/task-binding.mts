export const taskBindingSchemaVersion = "task-binding/v1" as const;

export const issueBackendProviders = [
  "none",
  "multica",
  "github",
  "linear",
  "standalone",
] as const;

export const taskBindingStateBackends = ["local"] as const;
export const taskBindingSyncModes = ["local-only", "bound-optional", "bound-sync"] as const;
export const taskBindingRoles = ["root", "child", "subtask", "evidence-only"] as const;

export const allowedMulticaMetadataKeys = [
  "harness_task_ref",
  "harness_artifact_index_ref",
  "pipeline_status",
  "pr_url",
  "pr_number",
  "deploy_url",
  "external_issue_url",
  "waiting_on",
  "blocked_reason",
  "decision",
] as const;

export type IssueBackendProvider = (typeof issueBackendProviders)[number] | (string & {});
export type TaskBindingStateBackend = (typeof taskBindingStateBackends)[number];
export type TaskBindingSyncMode = (typeof taskBindingSyncModes)[number];
export type TaskBindingRole = (typeof taskBindingRoles)[number];
export type MulticaMetadataKey = (typeof allowedMulticaMetadataKeys)[number];
export type IssueMetadataPrimitive = string | number | boolean | null;

export type ExternalTaskRef = Readonly<{
  provider: IssueBackendProvider;
  id: string;
  identifier?: string;
  url?: string;
  projectId?: string;
  parentId?: string;
}>;

export type HarnessTaskBindingRef = Readonly<{
  taskRef: string;
  taskPackagePath: string;
}>;

export type BaseTaskBinding = Readonly<{
  schemaVersion: typeof taskBindingSchemaVersion;
  stateBackend: "local";
  issueBackend: IssueBackendProvider;
  syncMode: TaskBindingSyncMode;
  bindingRole: TaskBindingRole;
  harnessTask: HarnessTaskBindingRef;
  parentHarnessTaskRef?: string;
  bindingCreatedAt: string;
  bindingUpdatedAt?: string;
  titleOverrideReason?: string;
}>;

export type LocalTaskBinding = BaseTaskBinding & Readonly<{
  issueBackend: "none";
  syncMode: "local-only";
  externalTask?: never;
  titleSnapshot?: never;
}>;

export type ExternalTaskBinding = BaseTaskBinding & Readonly<{
  issueBackend: Exclude<IssueBackendProvider, "none">;
  syncMode: Exclude<TaskBindingSyncMode, "local-only">;
  externalTask: ExternalTaskRef;
  titleSnapshot: string;
}>;

export type TaskBinding = LocalTaskBinding | ExternalTaskBinding;

export function createLocalTaskBinding(input: {
  harnessTask: HarnessTaskBindingRef;
  bindingRole?: TaskBindingRole;
  parentHarnessTaskRef?: string;
  bindingCreatedAt: string;
  bindingUpdatedAt?: string;
  titleOverrideReason?: string;
}): LocalTaskBinding {
  return assertTaskBinding({
    schemaVersion: taskBindingSchemaVersion,
    stateBackend: "local",
    issueBackend: "none",
    syncMode: "local-only",
    bindingRole: input.bindingRole ?? "root",
    harnessTask: input.harnessTask,
    parentHarnessTaskRef: input.parentHarnessTaskRef,
    bindingCreatedAt: input.bindingCreatedAt,
    bindingUpdatedAt: input.bindingUpdatedAt,
    titleOverrideReason: input.titleOverrideReason,
  }) as LocalTaskBinding;
}

export function createExternalTaskBinding(input: {
  issueBackend: Exclude<IssueBackendProvider, "none">;
  syncMode?: Exclude<TaskBindingSyncMode, "local-only">;
  bindingRole?: TaskBindingRole;
  externalTask: ExternalTaskRef;
  harnessTask: HarnessTaskBindingRef;
  parentHarnessTaskRef?: string;
  titleSnapshot: string;
  bindingCreatedAt: string;
  bindingUpdatedAt?: string;
  titleOverrideReason?: string;
}): ExternalTaskBinding {
  return assertTaskBinding({
    schemaVersion: taskBindingSchemaVersion,
    stateBackend: "local",
    issueBackend: input.issueBackend,
    syncMode: input.syncMode ?? "bound-optional",
    bindingRole: input.bindingRole ?? "root",
    externalTask: input.externalTask,
    harnessTask: input.harnessTask,
    parentHarnessTaskRef: input.parentHarnessTaskRef,
    titleSnapshot: input.titleSnapshot,
    bindingCreatedAt: input.bindingCreatedAt,
    bindingUpdatedAt: input.bindingUpdatedAt,
    titleOverrideReason: input.titleOverrideReason,
  }) as ExternalTaskBinding;
}

export function assertTaskBinding(input: unknown): TaskBinding {
  const binding = requireRecord(input, "TaskBinding");
  const schemaVersion = requireLiteral(binding.schemaVersion, taskBindingSchemaVersion, "TaskBinding.schemaVersion");
  const stateBackend = requireLiteral(binding.stateBackend, "local", "TaskBinding.stateBackend");
  const issueBackend = requireNonEmptyString(binding.issueBackend, "TaskBinding.issueBackend");
  const syncMode = requireEnum(binding.syncMode, taskBindingSyncModes, "TaskBinding.syncMode");
  const bindingRole = requireEnum(binding.bindingRole, taskBindingRoles, "TaskBinding.bindingRole");
  const harnessTask = assertHarnessTaskBindingRef(binding.harnessTask, "TaskBinding.harnessTask");
  const parentHarnessTaskRef = optionalNonEmptyString(binding.parentHarnessTaskRef, "TaskBinding.parentHarnessTaskRef");
  const bindingCreatedAt = requireIsoTimestamp(binding.bindingCreatedAt, "TaskBinding.bindingCreatedAt");
  const bindingUpdatedAt = optionalIsoTimestamp(binding.bindingUpdatedAt, "TaskBinding.bindingUpdatedAt");
  const titleOverrideReason = optionalNonEmptyString(binding.titleOverrideReason, "TaskBinding.titleOverrideReason");

  if (bindingRole === "subtask" && !parentHarnessTaskRef) {
    throw new Error("TaskBinding.parentHarnessTaskRef is required when bindingRole is subtask");
  }

  if (issueBackend === "none") {
    if (syncMode !== "local-only") throw new Error("TaskBinding.syncMode must be local-only when issueBackend is none");
    if ("externalTask" in binding && binding.externalTask !== undefined) {
      throw new Error("TaskBinding.externalTask must be omitted when issueBackend is none");
    }
    if ("titleSnapshot" in binding && binding.titleSnapshot !== undefined) {
      throw new Error("TaskBinding.titleSnapshot must be omitted when issueBackend is none");
    }
    return stripUndefined({
      schemaVersion,
      stateBackend,
      issueBackend: "none",
      syncMode,
      bindingRole,
      harnessTask,
      parentHarnessTaskRef,
      bindingCreatedAt,
      bindingUpdatedAt,
      titleOverrideReason,
    });
  }

  if (syncMode === "local-only") throw new Error("TaskBinding.syncMode must not be local-only when issueBackend is external");
  const externalTask = assertExternalTaskRef(binding.externalTask, "TaskBinding.externalTask");
  const titleSnapshot = requireNonEmptyString(binding.titleSnapshot, "TaskBinding.titleSnapshot");
  if (externalTask.provider !== issueBackend) {
    throw new Error("TaskBinding.externalTask.provider must match issueBackend");
  }
  if (issueBackend === "multica") assertMulticaExternalTaskRef(externalTask);

  return stripUndefined({
    schemaVersion,
    stateBackend,
    issueBackend,
    syncMode,
    bindingRole,
    externalTask,
    harnessTask,
    parentHarnessTaskRef,
    titleSnapshot,
    bindingCreatedAt,
    bindingUpdatedAt,
    titleOverrideReason,
  }) as ExternalTaskBinding;
}

export function assertExternalTaskRef(input: unknown, label = "ExternalTaskRef"): ExternalTaskRef {
  const ref = requireRecord(input, label);
  return stripUndefined({
    provider: requireNonEmptyString(ref.provider, `${label}.provider`),
    id: requireNonEmptyString(ref.id, `${label}.id`),
    identifier: optionalNonEmptyString(ref.identifier, `${label}.identifier`),
    url: optionalNonEmptyString(ref.url, `${label}.url`),
    projectId: optionalNonEmptyString(ref.projectId, `${label}.projectId`),
    parentId: optionalNonEmptyString(ref.parentId, `${label}.parentId`),
  });
}

export function isAllowedMulticaMetadataKey(key: string): key is MulticaMetadataKey {
  return (allowedMulticaMetadataKeys as readonly string[]).includes(key);
}

function assertHarnessTaskBindingRef(input: unknown, label: string): HarnessTaskBindingRef {
  const ref = requireRecord(input, label);
  return {
    taskRef: requireNonEmptyString(ref.taskRef, `${label}.taskRef`),
    taskPackagePath: requireRepoRelativePath(ref.taskPackagePath, `${label}.taskPackagePath`),
  };
}

function assertMulticaExternalTaskRef(ref: ExternalTaskRef): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref.id)) {
    throw new Error("TaskBinding.externalTask.id must be a Multica issue UUID when issueBackend is multica");
  }
  if (!ref.identifier) throw new Error("TaskBinding.externalTask.identifier is required when issueBackend is multica");
}

function requireRecord(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error(`${label} must be an object`);
  return input as Record<string, unknown>;
}

function requireLiteral<T extends string>(input: unknown, expected: T, label: string): T {
  if (input !== expected) throw new Error(`${label} must be ${expected}`);
  return expected;
}

function requireEnum<T extends readonly string[]>(input: unknown, allowed: T, label: string): T[number] {
  const value = requireNonEmptyString(input, label);
  if (!allowed.includes(value)) throw new Error(`${label} must be one of ${allowed.join(", ")}`);
  return value as T[number];
}

function requireNonEmptyString(input: unknown, label: string): string {
  if (typeof input !== "string" || input.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return input.trim();
}

function optionalNonEmptyString(input: unknown, label: string): string | undefined {
  if (input === undefined || input === null) return undefined;
  return requireNonEmptyString(input, label);
}

function requireRepoRelativePath(input: unknown, label: string): string {
  const value = requireNonEmptyString(input, label).replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (value.startsWith("/") || value === "." || value === ".." || value.includes("../") || value.includes("/..")) {
    throw new Error(`${label} must be a repository-relative path`);
  }
  return value;
}

function requireIsoTimestamp(input: unknown, label: string): string {
  const value = requireNonEmptyString(input, label);
  if (Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return value;
}

function optionalIsoTimestamp(input: unknown, label: string): string | undefined {
  if (input === undefined || input === null) return undefined;
  return requireIsoTimestamp(input, label);
}

function stripUndefined<T extends Record<string, unknown>>(input: T): T {
  const entries = Object.entries(input).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries) as T;
}
