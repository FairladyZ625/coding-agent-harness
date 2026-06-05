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
  buildTaskIndexCommandResult,
  buildTaskListCommandResult,
} from "../scripts/lib/task-command-results.mjs";
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
writeOracleHarnessManifest(tmpRoot);
for (const record of taskKernelOracleParityRecords) {
  writeTaskPackage(tmpRoot, record.oldRuntimeOutputs.taskListJson);
}
const parityRecords = captureLegacyOracleParityRecords(tmpRoot, taskKernelOracleParityRecords);

const repository = createMarkdownTaskPackageStoreReader({ root: tmpRoot });
const actualIds = repository.list({ includeArchived: true }).map((snapshot) => String(snapshot.task.id)).sort();
assert(!actualIds.includes("2026-06-05-human-confirmed-task"), "human-confirmed fixture should fail closed until review confirmation is parsed");
assert(actualIds.includes("2026-06-05-active-standard-task"), "oracle project should expose ordinary task packages");

const observedDiffs: ClassifiedDiff[] = [];
for (const record of parityRecords) {
  const actual = readNewKernelOutput(record);
  for (const surface of oracleParitySurfaces) {
    const diffs = diffSurface(record, surface, actual);
    for (const diff of diffs) observedDiffs.push(diff);
  }
}

assert.deepEqual(
  observedDiffs.map((diff) => `${diff.fixtureId}:${diff.surface}:${diff.field}`).sort(),
  [
    "blocked-task:dashboardTaskIndex:lifecycleState",
    "blocked-task:dashboardTaskIndex:queue",
    "blocked-task:moduleOutput:lifecycleState",
    "blocked-task:moduleOutput:queue",
    "blocked-task:taskListJson:lifecycleState",
    "blocked-task:taskListJson:queue",
    "human-confirmed-task:dashboardTaskIndex:__record",
    "human-confirmed-task:moduleOutput:__record",
    "human-confirmed-task:taskListJson:__record",
    "missing-materials-task:dashboardTaskIndex:artifacts",
    "missing-materials-task:dashboardTaskIndex:lifecycleState",
    "missing-materials-task:dashboardTaskIndex:state",
    "missing-materials-task:moduleOutput:artifacts",
    "missing-materials-task:moduleOutput:lifecycleState",
    "missing-materials-task:moduleOutput:state",
    "missing-materials-task:taskListJson:artifacts",
    "missing-materials-task:taskListJson:lifecycleState",
    "missing-materials-task:taskListJson:state",
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
  () => diffSurface(captureLegacyOracleParityRecords(tmpRoot, [unclassifiedMismatchRecord])[0], "taskListJson", readNewKernelOutput(unclassifiedMismatchRecord)),
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

type LegacyTaskProjection = Readonly<Record<string, unknown>>;

function captureLegacyOracleParityRecords(root: string, records: readonly TaskKernelOracleParityRecord[]): TaskKernelOracleParityRecord[] {
  const taskListOutput = buildTaskListCommandResult(root, { includeArchived: true }).payload.tasks as readonly LegacyTaskProjection[];
  const taskIndexOutput = buildTaskIndexCommandResult(root).payload.tasks as readonly LegacyTaskProjection[];
  assert(taskListOutput.length > 0, "legacy task-list oracle capture must discover fixture tasks");
  assert(taskIndexOutput.length > 0, "legacy task-index oracle capture must discover fixture tasks");
  return records.map((record) => {
    const fixtureId = record.oldRuntimeOutputs.taskListJson.id;
    return {
      ...record,
      oldRuntimeOutputs: {
        taskListJson: normalizeLegacyProjectionOutput(fixtureId, findLegacyTask(taskListOutput, fixtureId, "task-list"), record.oldRuntimeOutputs.taskListJson),
        dashboardTaskIndex: normalizeLegacyProjectionOutput(fixtureId, findLegacyTask(taskIndexOutput, fixtureId, "task-index"), record.oldRuntimeOutputs.dashboardTaskIndex),
        moduleOutput: normalizeLegacyProjectionOutput(fixtureId, findLegacyTask(taskIndexOutput, fixtureId, "module-output"), record.oldRuntimeOutputs.moduleOutput),
      },
    };
  });
}

function findLegacyTask(tasks: readonly LegacyTaskProjection[], fixtureId: string, surface: string): LegacyTaskProjection {
  const found = tasks.find((task) => legacyProjectionMatches(task, fixtureId));
  assert(found, `${fixtureId}.${surface} old runtime output fixture is required`);
  return found;
}

function legacyProjectionMatches(task: LegacyTaskProjection, fixtureId: string): boolean {
  return [task.id, task.taskKey, task.shortId, task.path, task.currentPath, task.taskPlanPath]
    .map((value) => String(value || ""))
    .some((value) => value === fixtureId || value.endsWith(`/${fixtureId}`) || value.endsWith(`/${fixtureId}/task_plan.md`));
}

function normalizeLegacyProjectionOutput(fixtureId: string, task: LegacyTaskProjection, expected: TaskKernelOracleRuntimeOutput): TaskKernelOracleRuntimeOutput {
  return {
    id: fixtureId,
    title: stringField(task.title, expected.title),
    state: normalizeLegacyStateValue(task.state, expected.state),
    lifecycleState: normalizeLegacyLifecycleValue(task.lifecycleState, expected.lifecycleState),
    reviewStatus: normalizeLegacyReviewStatusValue(task.reviewStatus, expected.reviewStatus),
    closeoutState: normalizeLegacyCloseoutValue(task.closeoutStatus, expected.closeoutState),
    materials: expected.materials,
    phases: expected.phases,
    artifacts: expected.artifacts,
    relations: expected.relations,
    modulePlacement: expected.modulePlacement,
    auditMetadata: normalizeAuditMetadata(
      Object.fromEntries(Object.entries(expected.auditMetadata ?? {}).map(([key]) => [key, String(task[key] ?? expected.auditMetadata?.[key] ?? "")]).filter(([, value]) => value)),
      expected.auditMetadata,
    ),
    reviewConfirmation: expected.reviewConfirmation,
    queue: legacyQueueValue(task.taskQueues, task.reviewQueueState, expected.queue),
    readiness: expected.readiness,
    archiveEligibility: expected.archiveEligibility,
    deleteEligibility: expected.deleteEligibility,
    agentCanSetHumanConfirmed: expected.agentCanSetHumanConfirmed,
  };
}

function normalizeLegacyStateValue(value: unknown, fallback: TaskKernelOracleRuntimeOutput["state"]): TaskKernelOracleRuntimeOutput["state"] {
  const raw = stringField(value, fallback);
  if (raw === "in_progress") return "active";
  if (raw === "done" && ["archived", "deleted"].includes(fallback)) return fallback;
  return raw as TaskKernelOracleRuntimeOutput["state"];
}

function normalizeLegacyCloseoutValue(value: unknown, fallback: TaskKernelOracleRuntimeOutput["closeoutState"]): TaskKernelOracleRuntimeOutput["closeoutState"] {
  const raw = stringField(value, fallback);
  if (raw === "missing") return "open";
  if (raw === "pending") return fallback === "ready-to-close" ? "ready-to-close" : "open";
  return raw as TaskKernelOracleRuntimeOutput["closeoutState"];
}

function normalizeLegacyLifecycleValue(value: unknown, fallback: TaskKernelOracleRuntimeOutput["lifecycleState"]): TaskKernelOracleRuntimeOutput["lifecycleState"] {
  const raw = stringField(value, fallback);
  if (raw === "closed" && fallback === "closed-review-pending") return fallback;
  return raw as TaskKernelOracleRuntimeOutput["lifecycleState"];
}

function normalizeLegacyReviewStatusValue(value: unknown, fallback: TaskKernelOracleRuntimeOutput["reviewStatus"]): TaskKernelOracleRuntimeOutput["reviewStatus"] {
  return stringField(value, fallback) as TaskKernelOracleRuntimeOutput["reviewStatus"];
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

function firstStringArrayValue(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.find((item): item is string => typeof item === "string" && item.length > 0) || "";
}

function legacyQueueValue(taskQueues: unknown, reviewQueueState: unknown, fallback: TaskKernelOracleRuntimeOutput["queue"]): TaskKernelOracleRuntimeOutput["queue"] {
  if (Array.isArray(taskQueues) && taskQueues.includes(fallback)) return fallback;
  const raw = firstStringArrayValue(taskQueues) || stringField(reviewQueueState, fallback);
  if (raw === "done" && ["archived", "deleted"].includes(fallback)) return fallback;
  return raw as TaskKernelOracleRuntimeOutput["queue"];
}

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
      diffs.push(classifyDiff(record, surface, field, expectedValue, actualValue));
    }
  }
  return diffs;
}

function classifyDiff(record: TaskKernelOracleParityRecord, surface: TaskKernelOracleParitySurface, field: string, expected?: unknown, actual?: unknown): ClassifiedDiff {
  const classification = record.allowedMismatches.find((candidate) => candidate.field === field && candidate.surfaces.includes(surface));
  if (!classification) throw new Error(`Unclassified oracle mismatch: ${record.id}.${surface}.${field} expected=${stableJson(expected)} actual=${stableJson(actual)}`);
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
      return value === undefined ? [] : [[key, normalizeAuditValue(key, value)]];
    }),
  );
}

function normalizeAuditKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normalizeAuditValue(key: string, value: string): string {
  if (normalizeAuditKey(key) === "evidencebundle") return value.replace(/^TARGET:/, "");
  return value;
}

function writeOracleHarnessManifest(root: string): void {
  const harnessRoot = path.join(root, "coding-agent-harness");
  fs.mkdirSync(harnessRoot, { recursive: true });
  fs.writeFileSync(
    path.join(harnessRoot, "harness.yaml"),
    [
      "version: 2",
      "locale: en-US",
      "capabilities:",
      "  - core",
      "  - dashboard",
      "structure:",
      "  harnessRoot: coding-agent-harness",
      "  planningRoot: coding-agent-harness/planning",
      "  tasksRoot: coding-agent-harness/planning/tasks",
      "  modulesRoot: coding-agent-harness/planning/modules",
      "  externalRoot: coding-agent-harness/planning/external",
      "  governanceRoot: coding-agent-harness/governance",
      "  generatedRoot: coding-agent-harness/governance/generated",
      "  regressionRoot: coding-agent-harness/governance/regression",
      "modules:",
      "  schema: harness-modules/v1",
      "  generatedView: coding-agent-harness/planning/modules/Module-Registry.md",
      "  items:",
      "    task-kernel:",
      "      title: Task Kernel",
      "      prefix: TK",
      "      status: in-progress",
      "      branch: codex/task-kernel",
      "      owner: coordinator",
      "      currentStep: TK-04b",
      "      scope:",
      "        - scripts/kernel/task/**",
      "        - tests/fixtures/task-kernel-fixtures/**",
      "      shared:",
      "        - tests/run-all.mts",
      "      dependsOn: []",
      "      plan: coding-agent-harness/planning/modules/task-kernel/module_plan.md",
      "      brief: coding-agent-harness/planning/modules/task-kernel/brief.md",
      "      updated: 2026-06-05",
      "",
    ].join("\n"),
    "utf8",
  );
}

function writeTaskPackage(root: string, output: TaskKernelOracleRuntimeOutput): void {
  const taskDirectory = path.join(root, "coding-agent-harness/planning/modules/task-kernel/tasks", output.id);
  fs.mkdirSync(taskDirectory, { recursive: true });
  fs.writeFileSync(path.join(taskDirectory, "task_plan.md"), renderTaskPlan(output), "utf8");
  fs.writeFileSync(path.join(taskDirectory, "brief.md"), `# ${output.title}\n\nOracle parity fixture.\n`, "utf8");
  fs.writeFileSync(path.join(taskDirectory, "visual_map.md"), renderVisualMap(output), "utf8");
  fs.writeFileSync(path.join(taskDirectory, "lesson_candidates.md"), renderLessonCandidates(), "utf8");
  if (output.closeoutState === "closed") fs.writeFileSync(path.join(taskDirectory, "walkthrough.md"), "Closeout Status: closed\n", "utf8");
  if (output.closeoutState === "ready-to-close") fs.writeFileSync(path.join(taskDirectory, "walkthrough.md"), "Closeout Status: pending\n", "utf8");
  if (!isMissingMaterial(output, "ART-002")) fs.writeFileSync(path.join(taskDirectory, "progress.md"), renderMaterial(output, "ART-002"), "utf8");
  if (!isMissingMaterial(output, "ART-003")) fs.writeFileSync(path.join(taskDirectory, "review.md"), renderMaterial(output, "ART-003"), "utf8");
  for (const artifactId of output.materials.required) {
    if (isMissingMaterial(output, artifactId)) continue;
    const materialPath = materialPathForArtifact(artifactId);
    if (materialPath === "task_plan.md") continue;
    if (materialPath === "progress.md" || materialPath === "review.md") continue;
    fs.writeFileSync(path.join(taskDirectory, materialPath), renderMaterial(output, artifactId), "utf8");
  }
}

function isMissingMaterial(output: TaskKernelOracleRuntimeOutput, artifactId: string): boolean {
  return output.materials.kind === "missing" && output.materials.missing.includes(artifactId);
}

function renderMaterial(output: TaskKernelOracleRuntimeOutput, artifactId: string): string {
  if (artifactId === "ART-002") {
    return [
      "# Progress",
      "",
      "## Current Status",
      "",
      legacyProgressState(output.state),
      "",
      "## Log",
      "",
      "- Oracle parity progress fixture.",
      "",
    ].join("\n");
  }
  if (artifactId === "ART-003") {
    if (output.reviewStatus === "missing") return "";
    if (output.reviewStatus !== "agent-reviewed") return `# Review\n\nOracle parity review status: ${output.reviewStatus}\n`;
    return [
      "# Review",
      "",
      "## Agent Review Submission",
      "",
      "| Field | Value |",
      "| --- | --- |",
      `| Submission ID | ARS-${output.id} |`,
      "| Submitted At | 2026-06-05T00:00:00.000Z |",
      "| Submitted By | oracle-parity-fixture |",
      `| Task Key | MODULES/task-kernel/${output.id} |`,
      "| Evidence Summary | Oracle parity fixture submission. |",
      "| Open Findings Count | 0 |",
      "| Scanner Version | task-scanner/2026-05-25-phase-kind |",
      "",
    ].join("\n");
  }
  return `# ${artifactId}\n\nOracle parity material.\n`;
}

function legacyProgressState(state: string): string {
  if (state === "active") return "in_progress";
  if (state === "archived" || state === "deleted") return "done";
  return state;
}

function renderVisualMap(output: TaskKernelOracleRuntimeOutput): string {
  return [
    "# Visual Map",
    "",
    "Visual Map Contract: v1.0",
    "",
    "## Phase Table",
    "",
    "| Phase ID | Kind | Depends On | State | Completion | Output | Required Evidence | Exit Command | Actor | Evidence Status | Blocking Risk | Owner / Handoff |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
    ...output.phases.map((phase) => `| ${phase.id} | execution | none | ${phaseState(output.state)} | ${phaseCompletion(output.state)} | ${phase.title} | task_plan.md | none | agent | present | none | TK-04b |`),
    "",
  ].join("\n");
}

function renderLessonCandidates(): string {
  return [
    "# Lesson Candidates",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Task-level status | no-candidate-accepted |",
    "| Review decision | accepted-no-candidate |",
    "| Promotion state | not-promoted |",
    "| Closeout token | checked-candidate:LC-ORACLE-000 |",
    "",
    "## No Candidate Rationale",
    "",
    "Oracle parity fixture has no reusable lesson candidate.",
    "",
  ].join("\n");
}

function phaseState(state: string): string {
  if (state === "active") return "in_progress";
  if (state === "archived" || state === "deleted") return "done";
  return ["planned", "review", "blocked", "done"].includes(state) ? state : "planned";
}

function phaseCompletion(state: string): number {
  return ["done", "archived", "deleted"].includes(state) ? 100 : 50;
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
    "Selected budget: simple",
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
