import {
  taskKernelDivergenceSeeds,
  taskKernelExpectedFixtures,
} from "./expected-values.mjs";
import type {
  ExpectedCompatibilitySnapshot,
  ExpectedDecisionSnapshot,
  ExpectedFieldClassification,
  ExpectedMaterialsSnapshot,
  ExpectedModulePlacementSnapshot,
  ExpectedPolicySnapshot,
  ExpectedReviewConfirmationSnapshot,
  ExpectedTaskSnapshot,
  TaskKernelDivergenceFixtureId,
  TaskKernelExpectedRecord,
} from "./schema.mjs";

export const taskKernelOracleParitySchemaVersion = "task-kernel-oracle-parity/2026-06-05-tk04b" as const;

export const oracleParitySurfaces = [
  "taskListJson",
  "dashboardTaskIndex",
  "moduleOutput",
] as const;

export type TaskKernelOracleParitySurface = (typeof oracleParitySurfaces)[number];

export type TaskKernelOracleRuntimeOutput = Readonly<{
  id: string;
  title: string;
  state: ExpectedTaskSnapshot["state"];
  lifecycleState: ExpectedTaskSnapshot["lifecycleState"];
  reviewStatus: ExpectedTaskSnapshot["reviewStatus"];
  closeoutState: ExpectedTaskSnapshot["closeoutState"];
  materials: ExpectedMaterialsSnapshot;
  phases: ExpectedTaskSnapshot["phases"];
  artifacts: ExpectedTaskSnapshot["artifacts"];
  relations: ExpectedTaskSnapshot["relations"];
  modulePlacement?: ExpectedModulePlacementSnapshot;
  auditMetadata?: Readonly<Record<string, string>>;
  reviewConfirmation?: ExpectedReviewConfirmationSnapshot;
  queue: ExpectedPolicySnapshot["queue"];
  readiness: ExpectedPolicySnapshot["readiness"];
  archiveEligibility: ExpectedDecisionSnapshot;
  deleteEligibility: ExpectedDecisionSnapshot;
  agentCanSetHumanConfirmed: ExpectedDecisionSnapshot;
}>;

export type TaskKernelOracleDiffClassification =
  | "aligned"
  | "selected-compatible"
  | "intentional-break"
  | "display-only"
  | "deprecated-legacy-field";

export type TaskKernelOracleMismatchRecord = Readonly<{
  fixtureId: TaskKernelExpectedRecord["id"];
  field: string;
  surfaces: readonly TaskKernelOracleParitySurface[];
  classification: Exclude<TaskKernelOracleDiffClassification, "aligned">;
  fieldClassification: ExpectedFieldClassification["classification"];
  selectedBehavior: "old-runtime-oracle" | "new-kernel-output" | "adapter-display";
  owner: string;
  followUp: string;
  expiry: "kernel-cutover";
  policyRef: "divergence-resolution-policy.md";
  reason: string;
}>;

export type TaskKernelOracleParityRecord = Readonly<{
  id: TaskKernelExpectedRecord["id"];
  schemaVersion: typeof taskKernelOracleParitySchemaVersion;
  ownerChildTask: "TK-04b";
  sourceFixtureOwner: "TK-04a";
  compatibilityRef: ExpectedCompatibilitySnapshot["decision"];
  oldRuntimeOutputs: Readonly<Record<TaskKernelOracleParitySurface, TaskKernelOracleRuntimeOutput>>;
  noDataLossFields: readonly ExpectedFieldClassification[];
  allowedMismatches: readonly TaskKernelOracleMismatchRecord[];
}>;

export type TaskKernelResolvedDivergenceRecord = Readonly<{
  id: TaskKernelDivergenceFixtureId;
  schemaVersion: typeof taskKernelOracleParitySchemaVersion;
  ownerChildTask: "TK-04b";
  field: string;
  surfaces: readonly TaskKernelOracleParitySurface[];
  classification: Exclude<TaskKernelOracleDiffClassification, "aligned">;
  fieldClassification: ExpectedFieldClassification["classification"];
  selectedBehavior: "old-runtime-oracle" | "new-kernel-output" | "adapter-display";
  owner: string;
  followUp: string;
  expiry: "kernel-cutover";
  policyRef: "divergence-resolution-policy.md";
  reason: string;
}>;

export const taskKernelOracleParityRecords: readonly TaskKernelOracleParityRecord[] = taskKernelExpectedFixtures.map((fixture) => {
  const output = oracleOutputFromExpected(fixture);
  return {
    id: fixture.id,
    schemaVersion: taskKernelOracleParitySchemaVersion,
    ownerChildTask: "TK-04b",
    sourceFixtureOwner: fixture.ownerChildTask,
    compatibilityRef: fixture.compatibility.decision,
    oldRuntimeOutputs: {
      taskListJson: output,
      dashboardTaskIndex: output,
      moduleOutput: output,
    },
    noDataLossFields: fixture.compatibility.noDataLossFields,
    allowedMismatches: allowedMismatchesForFixture(fixture),
  };
});

export const taskKernelResolvedDivergenceRecords: readonly TaskKernelResolvedDivergenceRecord[] = [
  {
    id: "queue-divergence-task",
    schemaVersion: taskKernelOracleParitySchemaVersion,
    ownerChildTask: "TK-04b",
    field: "queue",
    surfaces: oracleParitySurfaces,
    classification: "selected-compatible",
    fieldClassification: "generated projection field",
    selectedBehavior: "new-kernel-output",
    owner: "Task Kernel query projection owner",
    followUp: "Route CLI, Dashboard, and module views through TaskQueueProjection before kernel cutover.",
    expiry: "kernel-cutover",
    policyRef: "divergence-resolution-policy.md",
    reason: "Domain queue policy wins when old consumers disagree on queue placement.",
  },
  {
    id: "active-predicate-divergence-task",
    schemaVersion: taskKernelOracleParitySchemaVersion,
    ownerChildTask: "TK-04b",
    field: "active",
    surfaces: ["taskListJson", "dashboardTaskIndex"],
    classification: "selected-compatible",
    fieldClassification: "generated projection field",
    selectedBehavior: "new-kernel-output",
    owner: "Task Kernel query projection owner",
    followUp: "Replace legacy active-count predicates with TaskSummaryProjection.active before kernel cutover.",
    expiry: "kernel-cutover",
    policyRef: "divergence-resolution-policy.md",
    reason: "Active status must be derived once from state/lifecycle policy instead of per-consumer predicates.",
  },
  {
    id: "review-boundary-divergence-task",
    schemaVersion: taskKernelOracleParitySchemaVersion,
    ownerChildTask: "TK-04b",
    field: "reviewConfirmation",
    surfaces: ["dashboardTaskIndex", "moduleOutput"],
    classification: "intentional-break",
    fieldClassification: "domain field",
    selectedBehavior: "new-kernel-output",
    owner: "Task Kernel review boundary owner",
    followUp: "Keep agent-reviewed work in review/ready-to-confirm until the human review adapter records Git-backed confirmation.",
    expiry: "kernel-cutover",
    policyRef: "divergence-resolution-policy.md",
    reason: "Agent review evidence is not human confirmation and must not enter finalized output.",
  },
  {
    id: "generated-stale-row-task",
    schemaVersion: taskKernelOracleParitySchemaVersion,
    ownerChildTask: "TK-04b",
    field: "generatedProjection",
    surfaces: ["dashboardTaskIndex"],
    classification: "intentional-break",
    fieldClassification: "generated projection field",
    selectedBehavior: "new-kernel-output",
    owner: "Task Kernel generated projection owner",
    followUp: "Rebuild generated task-index/dashboard rows from source task packages and reject stale generated truth.",
    expiry: "kernel-cutover",
    policyRef: "divergence-resolution-policy.md",
    reason: "Generated rows are rebuildable projections and must lose to current task package truth.",
  },
];

export function validateTaskKernelOracleParityFixtureSet(input: {
  records: readonly TaskKernelOracleParityRecord[];
  divergenceRecords: readonly TaskKernelResolvedDivergenceRecord[];
}): void {
  assertExactIds(input.records.map((record) => record.id), taskKernelExpectedFixtures.map((fixture) => fixture.id), "TK-04b oracle parity fixture");
  assertExactIds(input.divergenceRecords.map((record) => record.id), taskKernelDivergenceSeeds.map((fixture) => fixture.id), "TK-04b resolved divergence");

  for (const record of input.records) validateOracleParityRecord(record);
  for (const record of input.divergenceRecords) validateResolvedDivergenceRecord(record);
}

export function validateOracleParityRecord(record: TaskKernelOracleParityRecord): void {
  assertEqual(record.schemaVersion, taskKernelOracleParitySchemaVersion, `${record.id}.schemaVersion`);
  assertEqual(record.ownerChildTask, "TK-04b", `${record.id}.ownerChildTask`);
  assertEqual(record.sourceFixtureOwner, "TK-04a", `${record.id}.sourceFixtureOwner`);
  assertNonEmptyArray(record.noDataLossFields, `${record.id}.noDataLossFields`);

  for (const surface of oracleParitySurfaces) {
    if (!record.oldRuntimeOutputs[surface]) throw new Error(`${record.id}.oldRuntimeOutputs.${surface} is required`);
    validateOracleOutput(record.id, surface, record.oldRuntimeOutputs[surface]);
  }
  for (const mismatch of record.allowedMismatches) validateMismatchRecord(record.id, mismatch);
}

export function validateResolvedDivergenceRecord(record: TaskKernelResolvedDivergenceRecord): void {
  assertEqual(record.schemaVersion, taskKernelOracleParitySchemaVersion, `${record.id}.schemaVersion`);
  assertEqual(record.ownerChildTask, "TK-04b", `${record.id}.ownerChildTask`);
  validateResolvedFields(record.id, record);
}

function oracleOutputFromExpected(fixture: TaskKernelExpectedRecord): TaskKernelOracleRuntimeOutput {
  return {
    id: fixture.task.id,
    title: fixture.task.title,
    state: fixture.task.state,
    lifecycleState: fixture.task.lifecycleState,
    reviewStatus: fixture.task.reviewStatus,
    closeoutState: fixture.task.closeoutState,
    materials: fixture.task.materials,
    phases: fixture.task.phases,
    artifacts: fixture.task.artifacts,
    relations: fixture.task.relations,
    modulePlacement: fixture.task.modulePlacement,
    auditMetadata: fixture.task.auditMetadata,
    reviewConfirmation: fixture.task.reviewConfirmation,
    queue: fixture.policy.queue,
    readiness: fixture.policy.readiness,
    archiveEligibility: fixture.policy.archiveEligibility,
    deleteEligibility: fixture.policy.deleteEligibility,
    agentCanSetHumanConfirmed: fixture.policy.agentCanSetHumanConfirmed,
  };
}

function allowedMismatchesForFixture(fixture: TaskKernelExpectedRecord): readonly TaskKernelOracleMismatchRecord[] {
  const records: TaskKernelOracleMismatchRecord[] = [];
  if (fixture.id === "human-confirmed-task") {
    records.push({
      fixtureId: fixture.id,
      field: "__record",
      surfaces: oracleParitySurfaces,
      classification: "selected-compatible",
      fieldClassification: "domain field",
      selectedBehavior: "old-runtime-oracle",
      owner: "Task Kernel repository adapter owner",
      followUp: "Teach the MarkdownTaskPackageStoreReader to parse human review confirmation before kernel cutover.",
      expiry: "kernel-cutover",
      policyRef: "divergence-resolution-policy.md",
      reason: "The expected domain fixture has Git-backed human confirmation, but TK-03 reader currently rejects human-confirmed records without parsed confirmation evidence.",
    });
  }
  if (fixture.id === "missing-materials-task") {
    for (const field of ["state", "lifecycleState", "reviewStatus", "closeoutState", "queue"] as const) {
      records.push({
        fixtureId: fixture.id,
        field,
        surfaces: oracleParitySurfaces,
        classification: "selected-compatible",
        fieldClassification: fieldClassificationForFixtureField(fixture, field),
        selectedBehavior: "new-kernel-output",
        owner: "Task Kernel fixture owner",
        followUp: "Keep missing-material fixtures state-preserving by reading task_plan.md domain metadata when progress.md is absent before kernel cutover.",
        expiry: "kernel-cutover",
        policyRef: "divergence-resolution-policy.md",
        reason: "The fixture intentionally omits ART-002/progress.md, so the legacy runtime loses some lifecycle projection fields while the new Kernel preserves task_plan.md domain facts.",
      });
    }
    records.push({
      fixtureId: fixture.id,
      field: "artifacts",
      surfaces: oracleParitySurfaces,
      classification: "selected-compatible",
      fieldClassification: "domain field",
      selectedBehavior: "new-kernel-output",
      owner: "Task Kernel fixture owner",
      followUp: "Align the TK-04a missing-materials expected artifact list with the required missing ART-002 material before kernel cutover.",
      expiry: "kernel-cutover",
      policyRef: "divergence-resolution-policy.md",
      reason: "The missing-materials oracle must include ART-002 as a required artifact row so the TK-03 reader can fail closed on the missing material.",
    });
  }
  if (fixture.id === "blocked-task") {
    for (const field of ["lifecycleState", "queue"] as const) {
      records.push({
        fixtureId: fixture.id,
        field,
        surfaces: oracleParitySurfaces,
        classification: "selected-compatible",
        fieldClassification: fieldClassificationForFixtureField(fixture, field),
        selectedBehavior: "new-kernel-output",
        owner: "Task Kernel domain policy owner",
        followUp: "Keep blocked as a queue/state overlay on an active lifecycle instead of copying legacy blocked lifecycle before kernel cutover.",
        expiry: "kernel-cutover",
        policyRef: "divergence-resolution-policy.md",
        reason: "Legacy derives blocked lifecycle/queue from review findings and state heuristics; TK-04a selected active lifecycle with a blocked queue/state overlay.",
      });
    }
  }
  if (fixture.task.modulePlacement) {
    records.push({
      fixtureId: fixture.id,
      field: "modulePlacement",
      surfaces: oracleParitySurfaces,
      classification: "selected-compatible",
      fieldClassification: "domain field",
      selectedBehavior: "old-runtime-oracle",
      owner: "Task Kernel module query owner",
      followUp: "Normalize ModuleTaskProjection taskPath to the module-relative ART-008 contract before kernel cutover.",
      expiry: "kernel-cutover",
      policyRef: "divergence-resolution-policy.md",
      reason: "TK-04a expected values use module-relative task paths, while the TK-03 reader exposes root-relative package paths.",
    });
  }
  if (fixture.task.relations.length > 0) {
    records.push({
      fixtureId: fixture.id,
      field: "relations",
      surfaces: oracleParitySurfaces,
      classification: "selected-compatible",
      fieldClassification: "domain field",
      selectedBehavior: "old-runtime-oracle",
      owner: "Task Kernel repository adapter owner",
      followUp: "Teach the MarkdownTaskPackageStoreReader to parse task relation rows before relation graph cutover.",
      expiry: "kernel-cutover",
      policyRef: "divergence-resolution-policy.md",
      reason: "Relation rows are selected domain truth, but TK-03 reader currently returns an empty relation set.",
    });
  }
  return records;
}

function validateOracleOutput(fixtureId: string, surface: TaskKernelOracleParitySurface, output: TaskKernelOracleRuntimeOutput): void {
  assertNonEmpty(output.id, `${fixtureId}.oldRuntimeOutputs.${surface}.id`);
  assertNonEmpty(output.title, `${fixtureId}.oldRuntimeOutputs.${surface}.title`);
  assertNonEmpty(output.state, `${fixtureId}.oldRuntimeOutputs.${surface}.state`);
  assertNonEmpty(output.lifecycleState, `${fixtureId}.oldRuntimeOutputs.${surface}.lifecycleState`);
  assertNonEmpty(output.reviewStatus, `${fixtureId}.oldRuntimeOutputs.${surface}.reviewStatus`);
  assertNonEmpty(output.closeoutState, `${fixtureId}.oldRuntimeOutputs.${surface}.closeoutState`);
  assertNonEmpty(output.queue, `${fixtureId}.oldRuntimeOutputs.${surface}.queue`);
  assertNonEmptyArray(output.phases, `${fixtureId}.oldRuntimeOutputs.${surface}.phases`);
  assertNonEmptyArray(output.artifacts, `${fixtureId}.oldRuntimeOutputs.${surface}.artifacts`);
  if (!output.materials) throw new Error(`${fixtureId}.oldRuntimeOutputs.${surface}.materials is required`);
  if (!output.readiness) throw new Error(`${fixtureId}.oldRuntimeOutputs.${surface}.readiness is required`);
  if (!output.archiveEligibility) throw new Error(`${fixtureId}.oldRuntimeOutputs.${surface}.archiveEligibility is required`);
  if (!output.deleteEligibility) throw new Error(`${fixtureId}.oldRuntimeOutputs.${surface}.deleteEligibility is required`);
  if (!output.agentCanSetHumanConfirmed) throw new Error(`${fixtureId}.oldRuntimeOutputs.${surface}.agentCanSetHumanConfirmed is required`);
}

function validateMismatchRecord(fixtureId: string, mismatch: TaskKernelOracleMismatchRecord): void {
  assertEqual(mismatch.fixtureId, fixtureId, `${fixtureId}.allowedMismatches.fixtureId`);
  validateResolvedFields(`${fixtureId}.${mismatch.field}`, mismatch);
}

function validateResolvedFields(label: string, record: {
  field: string;
  surfaces: readonly TaskKernelOracleParitySurface[];
  classification: Exclude<TaskKernelOracleDiffClassification, "aligned">;
  fieldClassification: ExpectedFieldClassification["classification"];
  selectedBehavior: string;
  owner: string;
  followUp: string;
  expiry: "kernel-cutover";
  policyRef: "divergence-resolution-policy.md";
  reason: string;
}): void {
  assertNonEmpty(record.field, `${label}.field`);
  assertNonEmptyArray(record.surfaces, `${label}.surfaces`);
  assertNonEmpty(record.classification, `${label}.classification`);
  assertNonEmpty(record.fieldClassification, `${label}.fieldClassification`);
  assertNonEmpty(record.selectedBehavior, `${label}.selectedBehavior`);
  assertNonEmpty(record.owner, `${label}.owner`);
  assertNonEmpty(record.followUp, `${label}.followUp`);
  assertEqual(record.expiry, "kernel-cutover", `${label}.expiry`);
  assertEqual(record.policyRef, "divergence-resolution-policy.md", `${label}.policyRef`);
  assertNonEmpty(record.reason, `${label}.reason`);
}

function fieldClassificationForFixtureField(fixture: TaskKernelExpectedRecord, field: string): ExpectedFieldClassification["classification"] {
  return fixture.compatibility.noDataLossFields.find((candidate) => candidate.field === field)?.classification || "domain field";
}

function assertExactIds(actual: readonly string[], expected: readonly string[], label: string): void {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    throw new Error(`${label} ids must match ART-008 exactly. expected=${sortedExpected.join(",")} actual=${sortedActual.join(",")}`);
  }
}

function assertNonEmpty(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} is required`);
}

function assertNonEmptyArray(value: readonly unknown[], label: string): void {
  if (!Array.isArray(value) || value.length === 0) throw new Error(`${label} is required`);
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new Error(`${label} must be ${expected}`);
}
