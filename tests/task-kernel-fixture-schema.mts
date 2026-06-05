#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  taskKernelDivergenceSeeds,
  taskKernelExpectedFixtures,
} from "./fixtures/task-kernel-fixtures/expected-values.mjs";
import {
  validateDivergenceSeed,
  validateExpectedRecord,
  validateTaskKernelFixtureSet,
} from "./fixtures/task-kernel-fixtures/schema.mjs";

validateTaskKernelFixtureSet({
  fixtures: taskKernelExpectedFixtures,
  divergenceSeeds: taskKernelDivergenceSeeds,
});

const byId = new Map(taskKernelExpectedFixtures.map((fixture) => [fixture.id, fixture]));
assert.equal(byId.get("active-standard-task")?.policy.queue, "active");
assert.equal(byId.get("review-ready-task")?.task.reviewStatus, "agent-reviewed");
assert.equal(byId.get("human-confirmed-task")?.task.reviewConfirmation?.actor.kind, "human");
assert.equal(byId.get("missing-materials-task")?.policy.readiness.ready, false);
assert.equal(byId.get("blocked-task")?.policy.queue, "blocked");
assert.equal(byId.get("archived-task")?.policy.deleteEligibility.allowed, true);
assert.equal(byId.get("soft-deleted-task")?.task.relations[0]?.type, "superseded-by");
assert.equal(byId.get("relation-parent-child")?.task.relations.length, 3);
assert.equal(byId.get("module-owned-task")?.task.modulePlacement?.moduleKey, "task-kernel");
assert.equal(byId.get("multi-module-task")?.task.relations[1]?.type, "feeds-gate");
assert.equal(byId.get("preset-created-task")?.task.auditMetadata?.createdBy, "coding-agent-harness-task");

const missingExpectedValue = structuredClone(byId.get("active-standard-task"));
if (!missingExpectedValue) throw new Error("active-standard-task fixture missing");
delete (missingExpectedValue as { policy?: unknown }).policy;
assert.throws(
  () => validateExpectedRecord(missingExpectedValue),
  /active-standard-task\.policy is required/,
);

const missingRequiredMaterial = structuredClone(byId.get("missing-materials-task"));
if (!missingRequiredMaterial) throw new Error("missing-materials-task fixture missing");
delete (missingRequiredMaterial.task.materials as { missing?: unknown }).missing;
assert.throws(
  () => validateExpectedRecord(missingRequiredMaterial),
  /missing-materials-task\.task\.materials\.missing is required/,
);

const missingDivergenceClassification = structuredClone(taskKernelDivergenceSeeds[0]);
delete (missingDivergenceClassification as { classification?: unknown }).classification;
assert.throws(
  () => validateDivergenceSeed(missingDivergenceClassification),
  /queue-divergence-task\.compatibility\.diffClassification is required/,
);

const broadFixtureCorpus = taskKernelExpectedFixtures.slice(1);
assert.throws(
  () => validateTaskKernelFixtureSet({ fixtures: broadFixtureCorpus, divergenceSeeds: taskKernelDivergenceSeeds }),
  /TK-04a golden fixture ids must match ART-008 exactly/,
);

console.log("Task Kernel fixture schema tests passed");
