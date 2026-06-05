#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  assertAgentReviewTransition,
  assertUniqueTaskIds,
  classifyTaskQueue,
  createHumanReviewConfirmation,
  createGeneratedProjection,
  createModule,
  createTask,
  createTaskArtifact,
  createTaskPhase,
  createTaskRef,
  createWriteScope,
  decideArchiveEligibility,
  decideDeleteEligibility,
  decideTaskReadiness,
  deriveReviewStatus,
  determineMaterialsState,
  parseArtifactId,
  parseLifecycleState,
  parseModuleKey,
  parsePhaseId,
  parseQueueName,
  parseReviewStatus,
  parseTaskId,
  parseTaskState,
  isPathAllowedByWriteScope,
} from "../scripts/kernel/task/domain/index.mjs";

const taskId = parseTaskId(" 2026-06-05_Task Kernel TK01 ");
const moduleKey = parseModuleKey(" Task_Kernel ");
const phaseId = parsePhaseId(" init-01 ");
const artifactId = parseArtifactId(" art-001 ");

assert.equal(taskId, "2026-06-05-task-kernel-tk01");
assert.equal(moduleKey, "task-kernel");
assert.equal(phaseId, "INIT-01");
assert.equal(artifactId, "ART-001");
assert.equal(parseTaskState("active"), "active");
assert.equal(parseLifecycleState("in_review"), "in_review");
assert.equal(parseReviewStatus("agent-reviewed"), "agent-reviewed");
assert.equal(parseQueueName("blocked"), "blocked");

assert.throws(() => parseTaskId("task-kernel-tk01"), /Invalid TaskId/);
assert.throws(() => parseTaskState("in-review"), /Invalid TaskState/);
assert.throws(() => parseReviewStatus("confirmed"), /Invalid ReviewStatus/);
assert.throws(() => assertUniqueTaskIds([taskId, parseTaskId("2026-06-05-task-kernel-tk01")]), /Duplicate TaskId/);
assert.throws(() => createTaskRef({ kind: "unknown" as "task-id", value: "2026-06-05-task-kernel-tk01" }), /Invalid TaskRef.kind/);

const moduleModel = createModule({
  key: moduleKey,
  title: "Task Kernel",
  scope: "Active runtime task domain contracts",
  sharedPaths: ["scripts/kernel/task/domain"],
  dependencies: [],
  activeTaskIds: [taskId],
});
const projection = createGeneratedProjection({ name: "task-index", sourceTaskIds: [taskId] });
const writeScope = createWriteScope({ allowedPaths: ["scripts/kernel/task/domain", "tests/task-kernel-domain.mts"] });

assert.equal(moduleModel.sharedPaths[0], "scripts/kernel/task/domain");
assert.equal(projection.readOnly, true);
assert.equal(isPathAllowedByWriteScope(writeScope, "scripts/kernel/task/domain/index.mts"), true);
assert.equal(isPathAllowedByWriteScope(writeScope, "scripts/lib/task-scanner.mts"), false);
assert.throws(() => createWriteScope({ allowedPaths: ["../scripts/kernel/task/domain"] }), /repository-relative path/);

const availableArtifact = createTaskArtifact({ id: "ART-001", title: "Domain inventory" });
const missingArtifact = parseArtifactId("ART-002");
const completeMaterials = determineMaterialsState({
  requiredArtifactIds: [availableArtifact.id],
  availableArtifactIds: [availableArtifact.id],
});
const missingMaterials = determineMaterialsState({
  requiredArtifactIds: [availableArtifact.id, missingArtifact],
  availableArtifactIds: [availableArtifact.id],
});

assert.equal(completeMaterials.kind, "complete");
assert.deepEqual(missingMaterials, {
  kind: "missing",
  required: [availableArtifact.id, missingArtifact],
  missing: [missingArtifact],
});
assert.throws(
  () => determineMaterialsState({ requiredArtifactIds: [availableArtifact.id, availableArtifact.id], availableArtifactIds: [] }),
  /Duplicate required ArtifactId/,
);

const baseTask = createTask({
  id: taskId,
  title: "TK-01 Domain model",
  state: "active",
  lifecycleState: "active",
  reviewStatus: "missing",
  closeoutState: "open",
  materials: completeMaterials,
  modulePlacement: {
    moduleKey,
    taskPath: "planning/modules/task-kernel/tasks/2026-06-05-task-kernel-tk01-domain-model-value-objects",
  },
  phases: [
    createTaskPhase({ id: "INIT-01", title: "Initialize domain", order: 0 }),
    createTaskPhase({ id: "GATE-01", title: "Verify gates", order: 1 }),
  ],
  artifacts: [availableArtifact],
});

assert.equal(baseTask.title, "TK-01 Domain model");
assert.equal(classifyTaskQueue({ task: baseTask }), "active");
assert.deepEqual(decideTaskReadiness(baseTask), { allowed: true, ready: true, reasons: [] });

const missingMaterialsTask = createTask({
  ...baseTask,
  materials: missingMaterials,
});
assert.equal(classifyTaskQueue({ task: missingMaterialsTask }), "missing-materials");
assert.deepEqual(decideTaskReadiness(missingMaterialsTask), {
  allowed: false,
  ready: false,
  reasons: ["missing materials: ART-002"],
});

const reviewTask = createTask({
  ...baseTask,
  state: "review",
  lifecycleState: "in_review",
  reviewStatus: "required",
});
assert.equal(classifyTaskQueue({ task: reviewTask }), "review");
assert.equal(decideArchiveEligibility(reviewTask).allowed, false);

assert.equal(classifyTaskQueue({ task: createTask({ ...baseTask, state: "blocked", materials: missingMaterials }) }), "blocked");
assert.equal(classifyTaskQueue({ task: createTask({ ...baseTask, state: "done", lifecycleState: "ready" }) }), "done");
assert.equal(classifyTaskQueue({ task: createTask({ ...baseTask, state: "archived", lifecycleState: "active" }) }), "archived");
assert.equal(classifyTaskQueue({ task: createTask({ ...baseTask, state: "deleted", lifecycleState: "in_review" }) }), "deleted");

assert.equal(classifyTaskQueue({ task: baseTask, requiresLessonReview: true }), "lessons");
assert.equal(deriveReviewStatus({ reviewRequired: true, agentReviewed: false }), "required");
assert.equal(deriveReviewStatus({ reviewRequired: true, agentReviewed: true }), "agent-reviewed");
assert.throws(() => assertAgentReviewTransition("human-confirmed"), /human review adapter/);

assert.throws(
  () => createHumanReviewConfirmation({ actor: { kind: "agent", id: "TK-01-worker" }, confirmedAt: new Date("2026-06-05T00:00:00Z"), evidence: "agent note" }),
  /requires a human actor/,
);
assert.throws(
  () => createTask({ ...baseTask, reviewStatus: "human-confirmed" }),
  /requires ReviewConfirmation/,
);
const forgedAgentConfirmation = JSON.parse(JSON.stringify({
  actor: { kind: "agent", id: "TK-01-worker" },
  confirmedAt: "2026-06-05T00:00:00Z",
  evidence: "forged-agent-note",
})) as Parameters<typeof createTask>[0]["reviewConfirmation"];
assert.throws(
  () => createTask({ ...baseTask, reviewStatus: "human-confirmed", reviewConfirmation: forgedAgentConfirmation }),
  /requires a human actor/,
);

const humanConfirmation = createHumanReviewConfirmation({
  actor: { kind: "human", id: "reviewer-1" },
  confirmedAt: new Date("2026-06-05T00:00:00Z"),
  evidence: "git:evidence-sha",
});
const humanConfirmedTask = createTask({
  ...baseTask,
  state: "archived",
  reviewStatus: "human-confirmed",
  closeoutState: "closed",
  reviewConfirmation: humanConfirmation,
});
assert.equal(deriveReviewStatus({ reviewRequired: true, agentReviewed: true, humanConfirmation }), "human-confirmed");
assert.equal(decideArchiveEligibility(humanConfirmedTask).allowed, true);
assert.equal(decideDeleteEligibility(humanConfirmedTask).allowed, true);

assert.throws(
  () => createTask({
    ...baseTask,
    phases: [
      createTaskPhase({ id: "EXEC-01", title: "First", order: 0 }),
      createTaskPhase({ id: "EXEC-02", title: "Second", order: 0 }),
    ],
  }),
  /Duplicate TaskPhase.order/,
);

console.log("Task Kernel domain tests passed");
