import type { ArtifactId, ModuleKey, PhaseId, TaskId, TaskRelation } from "./identity.mjs";
import { assertUniqueValues, parseArtifactId, parsePhaseId } from "./identity.mjs";
import type { CloseoutState, LifecycleState, ReviewStatus, TaskState } from "./states.mjs";

export type HumanActor = Readonly<{
  kind: "human";
  id: string;
}>;

export type AgentActor = Readonly<{
  kind: "agent";
  id: string;
}>;

export type ReviewActor = HumanActor | AgentActor;

export type ReviewConfirmation = Readonly<{
  actor: HumanActor;
  confirmedAt: Date;
  evidence: string;
}>;

export type ModulePlacement = Readonly<{
  moduleKey: ModuleKey;
  taskPath: string;
}>;

export type TaskPhase = Readonly<{
  id: PhaseId;
  title: string;
  order: number;
}>;

export type TaskArtifact = Readonly<{
  id: ArtifactId;
  title: string;
}>;

export type MaterialsState = Readonly<
  | {
      kind: "complete";
      required: readonly ArtifactId[];
    }
  | {
      kind: "missing";
      required: readonly ArtifactId[];
      missing: readonly ArtifactId[];
    }
>;

export type Task = Readonly<{
  id: TaskId;
  title: string;
  state: TaskState;
  lifecycleState: LifecycleState;
  reviewStatus: ReviewStatus;
  closeoutState: CloseoutState;
  materials: MaterialsState;
  phases: readonly TaskPhase[];
  artifacts: readonly TaskArtifact[];
  relations: readonly TaskRelation[];
  modulePlacement?: ModulePlacement;
  auditMetadata?: Readonly<Record<string, string>>;
  reviewConfirmation?: ReviewConfirmation;
}>;

export type CreateTaskInput = Omit<Task, "title" | "phases" | "artifacts" | "relations" | "auditMetadata"> & {
  title: string;
  phases?: readonly TaskPhase[];
  artifacts?: readonly TaskArtifact[];
  relations?: readonly TaskRelation[];
  auditMetadata?: Readonly<Record<string, string>>;
};

export function createHumanReviewConfirmation(input: {
  actor: ReviewActor;
  confirmedAt: Date;
  evidence: string;
}): ReviewConfirmation {
  if (input.actor.kind !== "human") {
    throw new Error("ReviewConfirmation requires a human actor");
  }
  const evidence = requireNonEmpty(input.evidence, "ReviewConfirmation.evidence");
  return {
    actor: input.actor,
    confirmedAt: new Date(input.confirmedAt.getTime()),
    evidence,
  };
}

export function createTask(input: CreateTaskInput): Task {
  const title = requireNonEmpty(input.title, "Task.title");
  if (input.reviewStatus === "human-confirmed" && !input.reviewConfirmation) {
    throw new Error("reviewStatus human-confirmed requires ReviewConfirmation");
  }
  if (input.reviewConfirmation && input.reviewStatus !== "human-confirmed") {
    throw new Error("ReviewConfirmation may only be attached to human-confirmed tasks");
  }
  if (input.reviewConfirmation) {
    assertHumanReviewConfirmation(input.reviewConfirmation);
  }
  assertUniqueValues((input.phases ?? []).map((phase) => phase.id), "PhaseId");
  assertUniqueValues((input.artifacts ?? []).map((artifact) => artifact.id), "ArtifactId");
  assertPhaseOrder(input.phases ?? []);
  return {
    ...input,
    title,
    phases: [...(input.phases ?? [])],
    artifacts: [...(input.artifacts ?? [])],
    relations: [...(input.relations ?? [])],
    auditMetadata: input.auditMetadata ? { ...input.auditMetadata } : undefined,
  };
}

export function createTaskPhase(input: { id: string; title: string; order: number }): TaskPhase {
  if (!Number.isInteger(input.order) || input.order < 0) throw new Error(`Invalid TaskPhase.order: ${input.order}`);
  return {
    id: parsePhaseId(input.id),
    title: requireNonEmpty(input.title, "TaskPhase.title"),
    order: input.order,
  };
}

export function createTaskArtifact(input: { id: string; title: string }): TaskArtifact {
  return {
    id: parseArtifactId(input.id),
    title: requireNonEmpty(input.title, "TaskArtifact.title"),
  };
}

function assertPhaseOrder(phases: readonly TaskPhase[]): void {
  const orders = phases.map((phase) => phase.order);
  assertUniqueValues(orders.map(String), "TaskPhase.order");
}

function assertHumanReviewConfirmation(reviewConfirmation: ReviewConfirmation): void {
  const actorKind = (reviewConfirmation as { actor?: { kind?: unknown } }).actor?.kind;
  if (actorKind !== "human") throw new Error("ReviewConfirmation requires a human actor");
}

function requireNonEmpty(raw: string, label: string): string {
  const value = raw.trim();
  if (value.length === 0) throw new Error(`${label} must not be empty`);
  return value;
}
