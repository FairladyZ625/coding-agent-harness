import type { ArtifactId } from "./identity.mjs";
import { assertUniqueValues } from "./identity.mjs";
import type { QueueName, ReviewStatus } from "./states.mjs";
import type { MaterialsState, ReviewConfirmation, Task } from "./task.mjs";

export type PolicyDecision = Readonly<{
  allowed: boolean;
  reasons: readonly string[];
}>;

export type TaskReadinessDecision = PolicyDecision & Readonly<{
  ready: boolean;
}>;

export type QueuePolicyInput = Readonly<{
  task: Task;
  requiresLessonReview?: boolean;
}>;

export function determineMaterialsState(input: {
  requiredArtifactIds: readonly ArtifactId[];
  availableArtifactIds: readonly ArtifactId[];
}): MaterialsState {
  assertUniqueValues(input.requiredArtifactIds, "required ArtifactId");
  assertUniqueValues(input.availableArtifactIds, "available ArtifactId");
  const available = new Set(input.availableArtifactIds);
  const missing = input.requiredArtifactIds.filter((artifactId) => !available.has(artifactId));
  if (missing.length > 0) return { kind: "missing", required: [...input.requiredArtifactIds], missing };
  return { kind: "complete", required: [...input.requiredArtifactIds] };
}

export function deriveReviewStatus(input: {
  reviewRequired: boolean;
  agentReviewed: boolean;
  humanConfirmation?: ReviewConfirmation;
}): ReviewStatus {
  if (input.humanConfirmation) return "human-confirmed";
  if (input.agentReviewed) return "agent-reviewed";
  if (input.reviewRequired) return "required";
  return "missing";
}

export function canAgentSetReviewStatus(target: ReviewStatus): PolicyDecision {
  if (target === "human-confirmed") {
    return {
      allowed: false,
      reasons: ["human-confirmed requires the human review adapter"],
    };
  }
  return { allowed: true, reasons: [] };
}

export function assertAgentReviewTransition(target: ReviewStatus): void {
  const decision = canAgentSetReviewStatus(target);
  if (!decision.allowed) throw new Error(decision.reasons.join("; "));
}

export function decideTaskReadiness(task: Task): TaskReadinessDecision {
  const reasons: string[] = [];
  if (task.state === "blocked") reasons.push("task is blocked");
  if (task.state === "deleted") reasons.push("task is deleted");
  if (task.materials.kind === "missing") reasons.push(`missing materials: ${task.materials.missing.join(", ")}`);
  if (task.reviewStatus === "required") reasons.push("review is required");
  const ready = reasons.length === 0;
  return { allowed: ready, ready, reasons };
}

export function classifyTaskQueue(input: QueuePolicyInput): QueueName {
  const task = input.task;
  if (task.state === "blocked") return "blocked";
  if (task.state === "done") return "done";
  if (task.state === "archived") return "archived";
  if (task.state === "deleted") return "deleted";
  if (task.materials.kind === "missing") return "missing-materials";
  if (input.requiresLessonReview) return "lessons";
  if (task.reviewStatus === "required" || task.lifecycleState === "in_review" || task.state === "review") return "review";
  if (task.state === "active" || task.lifecycleState === "active") return "active";
  if (task.state === "planned") return "planned";
  return assertUnreachableTaskState(task.state);
}

export function decideArchiveEligibility(task: Task): PolicyDecision {
  const reasons: string[] = [];
  if (task.state === "deleted") reasons.push("deleted tasks cannot be archived");
  if (task.state !== "done" && task.state !== "archived") reasons.push(`task state is ${task.state}`);
  if (task.closeoutState !== "closed" && task.closeoutState !== "not-required") {
    reasons.push(`closeout is ${task.closeoutState}`);
  }
  if (task.reviewStatus === "required") reasons.push("review is still required");
  return { allowed: reasons.length === 0, reasons };
}

export function decideDeleteEligibility(task: Task): PolicyDecision {
  const reasons: string[] = [];
  if (task.state !== "archived") reasons.push("task must be archived before deletion");
  if (task.closeoutState !== "closed" && task.closeoutState !== "not-required") {
    reasons.push(`closeout is ${task.closeoutState}`);
  }
  if (task.reviewStatus === "required") reasons.push("review is still required");
  return { allowed: reasons.length === 0, reasons };
}

function assertUnreachableTaskState(value: never): never {
  throw new Error(`Unhandled TaskState for queue classification: ${value}`);
}
