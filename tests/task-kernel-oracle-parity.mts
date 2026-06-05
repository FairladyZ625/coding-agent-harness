#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  canAgentSetReviewStatus,
  classifyTaskQueue,
  createTaskRef,
  decideArchiveEligibility,
  decideDeleteEligibility,
  decideTaskReadiness,
} from "../scripts/kernel/task/domain/index.mjs";
import {
  createMarkdownTaskPackageStoreReader,
} from "../scripts/kernel/task/infrastructure/index.mjs";
import type {
  TaskPackageSnapshot,
} from "../scripts/kernel/task/ports/index.mjs";
import {
  oracleParitySurfaces,
  taskKernelOracleParityRecords,
  taskKernelResolvedDivergenceRecords,
  validateOracleParityRecord,
  validateTaskKernelOracleParityFixtureSet,
} from "./fixtures/task-kernel-fixtures/oracle-parity.mjs";
import type {
  TaskKernelOracleMismatchRecord,
  TaskKernelOracleParityRecord,
  TaskKernelOracleParitySurface,
  TaskKernelOracleRuntimeOutput,
} from "./fixtures/task-kernel-fixtures/oracle-parity.mjs";

validateTaskKernelOracleParityFixtureSet({
  records: taskKernelOracleParityRecords,
  divergenceRecords: taskKernelResolvedDivergenceRecords,
});

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-kernel-oracle-parity-"));
for (const record of taskKernelOracleParityRecords) {
  writeTaskPackage(tmpRoot, record.oldRuntimeOutputs.taskListJson);
}

const repository = createMarkdownTaskPackageStoreReader({ root: tmpRoot });
const actualIds = repository.list({ includeArchived: true }).map((snapshot) => String(snapshot.task.id)).sort();
assert(!actualIds.includes("2026-06-05-human-confirmed-task"), "human-confirmed fixture should fail closed until review confirmation is parsed");
assert(actualIds.includes("2026-06-05-active-standard-task"), "oracle project should expose ordinary task packages");

const observedDiffs: ClassifiedDiff[] = [];
for (const record of taskKernelOracleParityRecords) {
  const actual = readNewKernelOutput(record);
  for (const surface of oracleParitySurfaces) {
    const diffs = diffSurface(record, surface, actual);
    for (const diff of diffs) observedDiffs.push(diff);
  }
}

assert.deepEqual(
  observedDiffs.map((diff) => `${diff.fixtureId}:${diff.surface}:${diff.field}`).sort(),
  [
    "human-confirmed-task:dashboardTaskIndex:__record",
    "human-confirmed-task:moduleOutput:__record",
    "human-confirmed-task:taskListJson:__record",
    "missing-materials-task:dashboardTaskIndex:artifacts",
    "missing-materials-task:moduleOutput:artifacts",
    "missing-materials-task:taskListJson:artifacts",
    "module-owned-task:dashboardTaskIndex:modulePlacement",
    "module-owned-task:moduleOutput:modulePlacement",
    "module-owned-task:taskListJson:modulePlacement",
    "multi-module-task:dashboardTaskIndex:modulePlacement",
    "multi-module-task:dashboardTaskIndex:relations",
    "multi-module-task:moduleOutput:modulePlacement",
    "multi-module-task:moduleOutput:relations",
    "multi-module-task:taskListJson:modulePlacement",
    "multi-module-task:taskListJson:relations",
    "relation-parent-child:dashboardTaskIndex:relations",
    "relation-parent-child:moduleOutput:relations",
    "relation-parent-child:taskListJson:relations",
    "soft-deleted-task:dashboardTaskIndex:relations",
    "soft-deleted-task:moduleOutput:relations",
    "soft-deleted-task:taskListJson:relations",
  ].sort(),
);

for (const diff of observedDiffs) {
  assert(diff.classification, `${diff.fixtureId}.${diff.surface}.${diff.field} mismatch must be classified`);
  assert(diff.classification.owner.trim().length > 0, `${diff.fixtureId}.${diff.field} classification owner is required`);
  assert(diff.classification.followUp.trim().length > 0, `${diff.fixtureId}.${diff.field} classification follow-up is required`);
  assert.equal(diff.classification.expiry, "kernel-cutover", `${diff.fixtureId}.${diff.field} classification expiry is required`);
}

const activeLegacyPath = "coding-agent-harness/planning/modules/task-kernel/tasks/2026-06-05-active-standard-task";
assert.equal(
  repository.resolve(createTaskRef({ kind: "legacy-path", value: activeLegacyPath })).relativeDirectory,
  activeLegacyPath,
);

const missingOldTruth = structuredClone(taskKernelOracleParityRecords[0]);
delete (missingOldTruth.oldRuntimeOutputs as { taskListJson?: unknown }).taskListJson;
assert.throws(
  () => validateOracleParityRecord(missingOldTruth),
  /active-standard-task\.oldRuntimeOutputs\.taskListJson is required/,
);

const unclassifiedMismatchRecord = structuredClone(taskKernelOracleParityRecords.find((record) => record.id === "relation-parent-child"));
if (!unclassifiedMismatchRecord) throw new Error("relation-parent-child oracle record missing");
(unclassifiedMismatchRecord as { allowedMismatches: readonly TaskKernelOracleMismatchRecord[] }).allowedMismatches = [];
assert.throws(
  () => diffSurface(unclassifiedMismatchRecord, "taskListJson", readNewKernelOutput(unclassifiedMismatchRecord)),
  /Unclassified oracle mismatch: relation-parent-child\.taskListJson\.relations/,
);

console.log("Task Kernel oracle parity tests passed");

type NewKernelRead =
  | Readonly<{ kind: "present"; output: TaskKernelOracleRuntimeOutput }>
  | Readonly<{ kind: "missing"; error: string }>;

type ClassifiedDiff = Readonly<{
  fixtureId: TaskKernelOracleParityRecord["id"];
  surface: TaskKernelOracleParitySurface;
  field: string;
  classification: TaskKernelOracleMismatchRecord;
}>;

function readNewKernelOutput(record: TaskKernelOracleParityRecord): NewKernelRead {
  const ref = createTaskRef({ kind: "task-id", value: record.oldRuntimeOutputs.taskListJson.id });
  try {
    const snapshot = repository.get(ref);
    return {
      kind: "present",
      output: normalizeSnapshot(snapshot, record.oldRuntimeOutputs.taskListJson),
    };
  } catch (error) {
    return {
      kind: "missing",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeSnapshot(snapshot: TaskPackageSnapshot, expected: TaskKernelOracleRuntimeOutput): TaskKernelOracleRuntimeOutput {
  const task = snapshot.task;
  return {
    id: task.id,
    title: task.title,
    state: task.state,
    lifecycleState: task.lifecycleState,
    reviewStatus: task.reviewStatus,
    closeoutState: task.closeoutState,
    materials: task.materials,
    phases: task.phases,
    artifacts: task.artifacts,
    relations: task.relations,
    modulePlacement: task.modulePlacement,
    auditMetadata: normalizeAuditMetadata(task.auditMetadata, expected.auditMetadata),
    reviewConfirmation: task.reviewConfirmation
      ? {
          actor: task.reviewConfirmation.actor,
          confirmedAt: task.reviewConfirmation.confirmedAt.toISOString(),
          evidence: task.reviewConfirmation.evidence,
        }
      : undefined,
    queue: classifyTaskQueue({ task }),
    readiness: decideTaskReadiness(task),
    archiveEligibility: decideArchiveEligibility(task),
    deleteEligibility: decideDeleteEligibility(task),
    agentCanSetHumanConfirmed: canAgentSetReviewStatus("human-confirmed"),
  };
}

function diffSurface(record: TaskKernelOracleParityRecord, surface: TaskKernelOracleParitySurface, actual: NewKernelRead): ClassifiedDiff[] {
  const expected = record.oldRuntimeOutputs[surface];
  if (actual.kind === "missing") {
    assert(actual.error.length > 0, `${record.id}.${surface} missing new output must report an error`);
    return [classifyDiff(record, surface, "__record")];
  }

  const diffs: ClassifiedDiff[] = [];
  for (const field of comparableFields(record, expected)) {
    const expectedValue = valueAt(expected, field);
    const actualValue = valueAt(actual.output, field);
    if (stableJson(expectedValue) !== stableJson(actualValue)) {
      diffs.push(classifyDiff(record, surface, field));
    }
  }
  return diffs;
}

function classifyDiff(record: TaskKernelOracleParityRecord, surface: TaskKernelOracleParitySurface, field: string): ClassifiedDiff {
  const classification = record.allowedMismatches.find((candidate) => candidate.field === field && candidate.surfaces.includes(surface));
  if (!classification) throw new Error(`Unclassified oracle mismatch: ${record.id}.${surface}.${field}`);
  return {
    fixtureId: record.id,
    surface,
    field,
    classification,
  };
}

function comparableFields(record: TaskKernelOracleParityRecord, expected: TaskKernelOracleRuntimeOutput): string[] {
  return record.noDataLossFields
    .map((field) => field.field)
    .filter((field) => fieldApplies(expected, field));
}

function fieldApplies(expected: TaskKernelOracleRuntimeOutput, field: string): boolean {
  if ([
    "id",
    "title",
    "state",
    "lifecycleState",
    "reviewStatus",
    "closeoutState",
    "materials",
    "phases",
    "artifacts",
    "relations",
    "queue",
    "readiness",
    "archiveEligibility",
    "deleteEligibility",
    "agentCanSetHumanConfirmed",
  ].includes(field)) return true;
  return valueAt(expected, field) !== undefined;
}

function valueAt(value: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((current, key) => {
    if (typeof current !== "object" || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, value);
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortJson(item)]));
}

function normalizeAuditMetadata(
  raw: Readonly<Record<string, string>> | undefined,
  expected: Readonly<Record<string, string>> | undefined,
): Readonly<Record<string, string>> | undefined {
  if (!expected) return undefined;
  const rawByNormalizedKey = new Map(Object.entries(raw ?? {}).map(([key, value]) => [normalizeAuditKey(key), value]));
  return Object.fromEntries(
    Object.keys(expected).flatMap((key) => {
      const value = rawByNormalizedKey.get(normalizeAuditKey(key));
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

function normalizeAuditKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function writeTaskPackage(root: string, output: TaskKernelOracleRuntimeOutput): void {
  const taskDirectory = path.join(root, "coding-agent-harness/planning/modules/task-kernel/tasks", output.id);
  fs.mkdirSync(taskDirectory, { recursive: true });
  fs.writeFileSync(path.join(taskDirectory, "task_plan.md"), renderTaskPlan(output), "utf8");
  for (const artifactId of output.materials.required) {
    if (output.materials.kind === "missing" && output.materials.missing.includes(artifactId)) continue;
    const materialPath = materialPathForArtifact(artifactId);
    if (materialPath === "task_plan.md") continue;
    fs.writeFileSync(path.join(taskDirectory, materialPath), `# ${artifactId}\n\nOracle parity material.\n`, "utf8");
  }
}

function renderTaskPlan(output: TaskKernelOracleRuntimeOutput): string {
  const metadata = [
    `Task Contract: harness-task/v1`,
    `State: ${output.state}`,
    `Lifecycle State: ${output.lifecycleState}`,
    `Review Status: ${output.reviewStatus}`,
    `Closeout State: ${output.closeoutState}`,
    output.modulePlacement ? `Module: ${output.modulePlacement.moduleKey}` : "",
    ...Object.entries(output.auditMetadata ?? {}).map(([key, value]) => `${auditLabel(key)}: ${value}`),
  ].filter(Boolean);
  return [
    `# ${output.title}`,
    "",
    ...metadata,
    "",
    "## Phases",
    "",
    "| Phase | Title |",
    "| --- | --- |",
    ...output.phases.map((phase) => `| ${phase.id} | ${phase.title} |`),
    "",
    "## Artifacts",
    "",
    "| Artifact | Title | Path | Requirement |",
    "| --- | --- | --- | --- |",
    ...artifactRows(output).map((artifact) => `| ${artifact.id} | ${artifact.title} | ${materialPathForArtifact(artifact.id)} | required |`),
    "",
    ...relationSection(output),
    ...reviewConfirmationSection(output),
  ].join("\n");
}

function artifactRows(output: TaskKernelOracleRuntimeOutput): Array<{ id: string; title: string }> {
  const rows = new Map(output.artifacts.map((artifact) => [artifact.id, { id: artifact.id, title: artifact.title }]));
  for (const artifactId of output.materials.required) {
    if (!rows.has(artifactId)) rows.set(artifactId, { id: artifactId, title: `Required material ${artifactId}` });
  }
  return [...rows.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function relationSection(output: TaskKernelOracleRuntimeOutput): string[] {
  if (output.relations.length === 0) return [];
  return [
    "## Relations",
    "",
    "| Type | Target Kind | Target |",
    "| --- | --- | --- |",
    ...output.relations.map((relation) => `| ${relation.type} | ${relation.target.kind} | ${relation.target.value} |`),
    "",
  ];
}

function reviewConfirmationSection(output: TaskKernelOracleRuntimeOutput): string[] {
  if (!output.reviewConfirmation) return [];
  return [
    "## Review Confirmation",
    "",
    `Actor: ${output.reviewConfirmation.actor.id}`,
    `Confirmed At: ${output.reviewConfirmation.confirmedAt}`,
    `Evidence: ${output.reviewConfirmation.evidence}`,
    "",
  ];
}

function materialPathForArtifact(artifactId: string): string {
  const materialPaths: Record<string, string> = {
    "ART-001": "task_plan.md",
    "ART-002": "progress.md",
    "ART-003": "review.md",
  };
  return materialPaths[artifactId] ?? `${artifactId.toLowerCase()}.md`;
}

function auditLabel(key: string): string {
  return key.replace(/[A-Z]/g, (match) => ` ${match}`).replace(/^./, (match) => match.toUpperCase());
}
