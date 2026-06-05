export type TaskId = string & { readonly __taskId: unique symbol };
export type ModuleKey = string & { readonly __moduleKey: unique symbol };
export type PhaseId = string & { readonly __phaseId: unique symbol };
export type ArtifactId = string & { readonly __artifactId: unique symbol };

export type TaskRef = Readonly<{
  kind: "task-id" | "module-path" | "legacy-path";
  value: TaskId | string;
}>;

export const taskRelationTypes = [
  "parent",
  "child",
  "supersedes",
  "superseded-by",
  "depends-on",
  "feeds-gate",
] as const;

export type TaskRelationType = (typeof taskRelationTypes)[number];

export type TaskRelation = Readonly<{
  type: TaskRelationType;
  target: TaskRef;
}>;

export function parseTaskId(raw: string): TaskId {
  const canonical = normalizeSlug(raw);
  if (!/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(canonical)) {
    throw new Error(`Invalid TaskId: ${JSON.stringify(raw)}`);
  }
  return canonical as TaskId;
}

export function parseModuleKey(raw: string): ModuleKey {
  const canonical = normalizeSlug(raw);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(canonical)) {
    throw new Error(`Invalid ModuleKey: ${JSON.stringify(raw)}`);
  }
  return canonical as ModuleKey;
}

export function parsePhaseId(raw: string): PhaseId {
  const canonical = raw.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9]*-\d{2,}$/.test(canonical)) {
    throw new Error(`Invalid PhaseId: ${JSON.stringify(raw)}`);
  }
  return canonical as PhaseId;
}

export function parseArtifactId(raw: string): ArtifactId {
  const canonical = raw.trim().toUpperCase();
  if (!/^ART-\d{3,}$/.test(canonical)) {
    throw new Error(`Invalid ArtifactId: ${JSON.stringify(raw)}`);
  }
  return canonical as ArtifactId;
}

export function createTaskRef(input: { kind: TaskRef["kind"]; value: string }): TaskRef {
  if (!["task-id", "module-path", "legacy-path"].includes(input.kind)) {
    throw new Error(`Invalid TaskRef.kind: ${input.kind}`);
  }
  const value = input.kind === "task-id" ? parseTaskId(input.value) : requireNonEmpty(input.value, "TaskRef.value");
  return { kind: input.kind, value };
}

export function createTaskRelation(input: { type: TaskRelationType; target: TaskRef }): TaskRelation {
  if (!taskRelationTypes.includes(input.type)) throw new Error(`Invalid TaskRelationType: ${input.type}`);
  return { type: input.type, target: input.target };
}

export function assertUniqueTaskIds(taskIds: readonly TaskId[]): void {
  assertUniqueValues(taskIds, "TaskId");
}

export function assertUniqueValues(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`Duplicate ${label}: ${value}`);
    seen.add(value);
  }
}

function normalizeSlug(raw: string): string {
  return requireNonEmpty(raw, "slug")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function requireNonEmpty(raw: string, label: string): string {
  const value = raw.trim();
  if (value.length === 0) throw new Error(`${label} must not be empty`);
  return value;
}
