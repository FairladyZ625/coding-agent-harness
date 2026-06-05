export const taskKernelFixtureSchemaVersion = "task-kernel-fixtures/2026-06-05-tk04a" as const;

export const art008Tk04aGoldenFixtureIds = [
  "active-standard-task",
  "review-ready-task",
  "human-confirmed-task",
  "missing-materials-task",
  "blocked-task",
  "archived-task",
  "soft-deleted-task",
  "relation-parent-child",
  "module-owned-task",
  "multi-module-task",
  "preset-created-task",
] as const;

export const art008DivergenceFixtureIds = [
  "queue-divergence-task",
  "active-predicate-divergence-task",
  "review-boundary-divergence-task",
  "generated-stale-row-task",
] as const;

export type TaskKernelGoldenFixtureId = (typeof art008Tk04aGoldenFixtureIds)[number];
export type TaskKernelDivergenceFixtureId = (typeof art008DivergenceFixtureIds)[number];

export type TaskKernelFieldClassification =
  | "domain field"
  | "generated projection field"
  | "adapter-only display field"
  | "deprecated legacy field";

export type TaskKernelCompatibilityDecision =
  | "compatible"
  | "intentional-break"
  | "tk04b-owned-pending-oracle-comparison";

export type TaskKernelDivergenceClassification =
  | {
      state: "none";
      owner: "TK-04a";
      policyRef: "divergence-resolution-policy.md";
    }
  | {
      state: "tk04b-owned-pending-oracle-comparison";
      owner: "TK-04b";
      policyRef: "divergence-resolution-policy.md";
      requiredDecision: string;
    };

export type TaskKernelExpectedRecord = Readonly<{
  id: TaskKernelGoldenFixtureId;
  schemaVersion: typeof taskKernelFixtureSchemaVersion;
  ownerChildTask: "TK-04a";
  covers: string;
  requiredFor: readonly string[];
  task: ExpectedTaskSnapshot;
  policy: ExpectedPolicySnapshot;
  compatibility: ExpectedCompatibilitySnapshot;
}>;

export type TaskKernelDivergenceSeedRecord = Readonly<{
  id: TaskKernelDivergenceFixtureId;
  schemaVersion: typeof taskKernelFixtureSchemaVersion;
  ownerChildTask: "TK-04b";
  difference: string;
  classification: TaskKernelDivergenceClassification;
}>;

export type ExpectedTaskSnapshot = Readonly<{
  id: string;
  title: string;
  state: "planned" | "active" | "review" | "blocked" | "done" | "archived" | "deleted";
  lifecycleState: "ready" | "active" | "in_review" | "closed-review-pending";
  reviewStatus: "missing" | "required" | "agent-reviewed" | "human-confirmed";
  closeoutState: "not-required" | "open" | "ready-to-close" | "closed";
  materials: ExpectedMaterialsSnapshot;
  phases: readonly ExpectedPhaseSnapshot[];
  artifacts: readonly ExpectedArtifactSnapshot[];
  relations: readonly ExpectedRelationSnapshot[];
  modulePlacement?: ExpectedModulePlacementSnapshot;
  auditMetadata?: Readonly<Record<string, string>>;
  reviewConfirmation?: ExpectedReviewConfirmationSnapshot;
}>;

export type ExpectedMaterialsSnapshot = Readonly<
  | {
      kind: "complete";
      required: readonly string[];
    }
  | {
      kind: "missing";
      required: readonly string[];
      missing: readonly string[];
    }
>;

export type ExpectedPhaseSnapshot = Readonly<{
  id: string;
  title: string;
  order: number;
}>;

export type ExpectedArtifactSnapshot = Readonly<{
  id: string;
  title: string;
}>;

export type ExpectedRelationSnapshot = Readonly<{
  type: "parent" | "child" | "supersedes" | "superseded-by" | "depends-on" | "feeds-gate";
  target: Readonly<{
    kind: "task-id" | "module-path" | "legacy-path";
    value: string;
  }>;
}>;

export type ExpectedModulePlacementSnapshot = Readonly<{
  moduleKey: string;
  taskPath: string;
}>;

export type ExpectedReviewConfirmationSnapshot = Readonly<{
  actor: Readonly<{
    kind: "human";
    id: string;
  }>;
  confirmedAt: string;
  evidence: string;
}>;

export type ExpectedPolicySnapshot = Readonly<{
  queue: "planned" | "active" | "review" | "blocked" | "done" | "archived" | "deleted" | "missing-materials" | "lessons";
  readiness: ExpectedDecisionSnapshot & Readonly<{ ready: boolean }>;
  archiveEligibility: ExpectedDecisionSnapshot;
  deleteEligibility: ExpectedDecisionSnapshot;
  agentCanSetHumanConfirmed: ExpectedDecisionSnapshot;
}>;

export type ExpectedDecisionSnapshot = Readonly<{
  allowed: boolean;
  reasons: readonly string[];
}>;

export type ExpectedCompatibilitySnapshot = Readonly<{
  oldRuntimeOutputs: Readonly<{
    taskListJson: "not-captured-by-tk04a";
    dashboardTaskIndex: "not-captured-by-tk04a";
    moduleOutput: "not-captured-by-tk04a";
  }>;
  newKernelQueryOutput: "expected-task-and-policy-snapshot";
  diffClassification: TaskKernelDivergenceClassification;
  decision: Readonly<{
    kind: TaskKernelCompatibilityDecision;
    owner: "TK-04a" | "TK-04b";
    expiry: "kernel-cutover";
  }>;
  noDataLossFields: readonly ExpectedFieldClassification[];
}>;

export type ExpectedFieldClassification = Readonly<{
  field: string;
  classification: TaskKernelFieldClassification;
  owner: "domain" | "projection" | "adapter" | "legacy-cutover";
  expiry?: "kernel-cutover";
}>;

export function validateTaskKernelFixtureSet(input: {
  fixtures: readonly TaskKernelExpectedRecord[];
  divergenceSeeds: readonly TaskKernelDivergenceSeedRecord[];
}): void {
  assertExactIds(input.fixtures.map((fixture) => fixture.id), [...art008Tk04aGoldenFixtureIds], "TK-04a golden fixture");
  assertExactIds(input.divergenceSeeds.map((fixture) => fixture.id), [...art008DivergenceFixtureIds], "ART-008 divergence fixture");

  for (const fixture of input.fixtures) validateExpectedRecord(fixture);
  for (const fixture of input.divergenceSeeds) validateDivergenceSeed(fixture);
}

export function validateExpectedRecord(fixture: TaskKernelExpectedRecord): void {
  assertEqual(fixture.schemaVersion, taskKernelFixtureSchemaVersion, `${fixture.id}.schemaVersion`);
  assertEqual(fixture.ownerChildTask, "TK-04a", `${fixture.id}.ownerChildTask`);
  assertNonEmpty(fixture.covers, `${fixture.id}.covers`);
  assertNonEmptyArray(fixture.requiredFor, `${fixture.id}.requiredFor`);
  if (!fixture.task) throw new Error(`${fixture.id}.task is required`);
  if (!fixture.policy) throw new Error(`${fixture.id}.policy is required`);
  if (!fixture.compatibility) throw new Error(`${fixture.id}.compatibility is required`);
  validateTaskSnapshot(fixture.id, fixture.task);
  validatePolicySnapshot(fixture.id, fixture.policy);
  validateCompatibilitySnapshot(fixture.id, fixture.task, fixture.policy, fixture.compatibility);
}

export function validateDivergenceSeed(fixture: TaskKernelDivergenceSeedRecord): void {
  assertEqual(fixture.schemaVersion, taskKernelFixtureSchemaVersion, `${fixture.id}.schemaVersion`);
  assertEqual(fixture.ownerChildTask, "TK-04b", `${fixture.id}.ownerChildTask`);
  assertNonEmpty(fixture.difference, `${fixture.id}.difference`);
  validateDivergenceClassification(fixture.id, fixture.classification);
  if (fixture.classification.state !== "tk04b-owned-pending-oracle-comparison") {
    throw new Error(`${fixture.id}.classification must be TK-04b pending until oracle comparison lands`);
  }
}

function validateTaskSnapshot(fixtureId: string, task: ExpectedTaskSnapshot): void {
  assertNonEmpty(task.id, `${fixtureId}.task.id`);
  assertNonEmpty(task.title, `${fixtureId}.task.title`);
  assertNonEmpty(task.state, `${fixtureId}.task.state`);
  assertNonEmpty(task.lifecycleState, `${fixtureId}.task.lifecycleState`);
  assertNonEmpty(task.reviewStatus, `${fixtureId}.task.reviewStatus`);
  assertNonEmpty(task.closeoutState, `${fixtureId}.task.closeoutState`);
  assertNonEmptyArray(task.phases, `${fixtureId}.task.phases`);
  assertNonEmptyArray(task.artifacts, `${fixtureId}.task.artifacts`);
  validateMaterials(fixtureId, task.materials);
  if (task.reviewStatus === "human-confirmed") {
    if (!task.reviewConfirmation) throw new Error(`${fixtureId}.task.reviewConfirmation is required for human-confirmed fixtures`);
    assertEqual(task.reviewConfirmation.actor.kind, "human", `${fixtureId}.task.reviewConfirmation.actor.kind`);
    assertNonEmpty(task.reviewConfirmation.actor.id, `${fixtureId}.task.reviewConfirmation.actor.id`);
    assertNonEmpty(task.reviewConfirmation.confirmedAt, `${fixtureId}.task.reviewConfirmation.confirmedAt`);
    assertNonEmpty(task.reviewConfirmation.evidence, `${fixtureId}.task.reviewConfirmation.evidence`);
  }
  if (task.reviewConfirmation && task.reviewStatus !== "human-confirmed") {
    throw new Error(`${fixtureId}.task.reviewConfirmation may only appear on human-confirmed fixtures`);
  }
  if (task.modulePlacement) {
    assertNonEmpty(task.modulePlacement.moduleKey, `${fixtureId}.task.modulePlacement.moduleKey`);
    assertNonEmpty(task.modulePlacement.taskPath, `${fixtureId}.task.modulePlacement.taskPath`);
  }
  for (const relation of task.relations) {
    assertNonEmpty(relation.type, `${fixtureId}.task.relations.type`);
    assertNonEmpty(relation.target.kind, `${fixtureId}.task.relations.target.kind`);
    assertNonEmpty(relation.target.value, `${fixtureId}.task.relations.target.value`);
  }
}

function validateMaterials(fixtureId: string, materials: ExpectedMaterialsSnapshot): void {
  assertNonEmpty(materials.kind, `${fixtureId}.task.materials.kind`);
  assertNonEmptyArray(materials.required, `${fixtureId}.task.materials.required`);
  if (materials.kind === "missing") {
    assertNonEmptyArray(materials.missing, `${fixtureId}.task.materials.missing`);
    return;
  }
  if ("missing" in materials) throw new Error(`${fixtureId}.task.materials.missing must not exist for complete materials`);
}

function validatePolicySnapshot(fixtureId: string, policy: ExpectedPolicySnapshot): void {
  assertNonEmpty(policy.queue, `${fixtureId}.policy.queue`);
  validateDecision(fixtureId, "readiness", policy.readiness);
  validateDecision(fixtureId, "archiveEligibility", policy.archiveEligibility);
  validateDecision(fixtureId, "deleteEligibility", policy.deleteEligibility);
  validateDecision(fixtureId, "agentCanSetHumanConfirmed", policy.agentCanSetHumanConfirmed);
  if (typeof policy.readiness.ready !== "boolean") throw new Error(`${fixtureId}.policy.readiness.ready is required`);
}

function validateDecision(fixtureId: string, name: string, decision: ExpectedDecisionSnapshot): void {
  if (typeof decision.allowed !== "boolean") throw new Error(`${fixtureId}.policy.${name}.allowed is required`);
  if (!Array.isArray(decision.reasons)) throw new Error(`${fixtureId}.policy.${name}.reasons is required`);
}

function validateCompatibilitySnapshot(
  fixtureId: string,
  task: ExpectedTaskSnapshot,
  policy: ExpectedPolicySnapshot,
  compatibility: ExpectedCompatibilitySnapshot,
): void {
  assertEqual(compatibility.oldRuntimeOutputs.taskListJson, "not-captured-by-tk04a", `${fixtureId}.compatibility.oldRuntimeOutputs.taskListJson`);
  assertEqual(
    compatibility.oldRuntimeOutputs.dashboardTaskIndex,
    "not-captured-by-tk04a",
    `${fixtureId}.compatibility.oldRuntimeOutputs.dashboardTaskIndex`,
  );
  assertEqual(compatibility.oldRuntimeOutputs.moduleOutput, "not-captured-by-tk04a", `${fixtureId}.compatibility.oldRuntimeOutputs.moduleOutput`);
  assertEqual(compatibility.newKernelQueryOutput, "expected-task-and-policy-snapshot", `${fixtureId}.compatibility.newKernelQueryOutput`);
  validateDivergenceClassification(fixtureId, compatibility.diffClassification);
  assertNonEmpty(compatibility.decision.kind, `${fixtureId}.compatibility.decision.kind`);
  assertNonEmpty(compatibility.decision.owner, `${fixtureId}.compatibility.decision.owner`);
  assertEqual(compatibility.decision.expiry, "kernel-cutover", `${fixtureId}.compatibility.decision.expiry`);
  if (compatibility.oldRuntimeOutputs.taskListJson === "not-captured-by-tk04a") {
    if (compatibility.diffClassification.state !== "tk04b-owned-pending-oracle-comparison") {
      throw new Error(`${fixtureId}.compatibility.diffClassification must stay TK-04b-owned while old runtime output is not captured`);
    }
    assertEqual(compatibility.decision.kind, "tk04b-owned-pending-oracle-comparison", `${fixtureId}.compatibility.decision.kind`);
    assertEqual(compatibility.decision.owner, "TK-04b", `${fixtureId}.compatibility.decision.owner`);
  }
  assertNonEmptyArray(compatibility.noDataLossFields, `${fixtureId}.compatibility.noDataLossFields`);
  const coveredFields = new Set(compatibility.noDataLossFields.map((field) => field.field));
  for (const field of compatibility.noDataLossFields) {
    assertNonEmpty(field.field, `${fixtureId}.compatibility.noDataLossFields.field`);
    assertNonEmpty(field.classification, `${fixtureId}.compatibility.noDataLossFields.classification`);
    assertNonEmpty(field.owner, `${fixtureId}.compatibility.noDataLossFields.owner`);
    if (field.classification === "deprecated legacy field") {
      if (!field.expiry) throw new Error(`${fixtureId}.compatibility.noDataLossFields.expiry is required`);
      assertEqual(field.expiry, "kernel-cutover", `${fixtureId}.compatibility.noDataLossFields.expiry`);
    }
  }
  for (const requiredField of requiredNoDataLossFields(task, policy)) {
    if (!coveredFields.has(requiredField)) {
      throw new Error(`${fixtureId}.compatibility.noDataLossFields is missing ${requiredField}`);
    }
  }
}

function requiredNoDataLossFields(task: ExpectedTaskSnapshot, policy: ExpectedPolicySnapshot): string[] {
  const fields = new Set<string>([
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
  ]);
  if (task.modulePlacement) fields.add("modulePlacement");
  if (task.auditMetadata) {
    fields.add("auditMetadata");
    for (const key of Object.keys(task.auditMetadata)) fields.add(`auditMetadata.${key}`);
  }
  if (task.reviewConfirmation) {
    fields.add("reviewConfirmation");
    fields.add("reviewConfirmation.actor");
    fields.add("reviewConfirmation.confirmedAt");
    fields.add("reviewConfirmation.evidence");
  }
  if (policy.agentCanSetHumanConfirmed) fields.add("agentCanSetHumanConfirmed");
  return [...fields].sort();
}

function validateDivergenceClassification(fixtureId: string, classification: TaskKernelDivergenceClassification): void {
  if (!classification) throw new Error(`${fixtureId}.compatibility.diffClassification is required`);
  assertNonEmpty(classification.state, `${fixtureId}.compatibility.diffClassification.state`);
  assertNonEmpty(classification.owner, `${fixtureId}.compatibility.diffClassification.owner`);
  assertEqual(classification.policyRef, "divergence-resolution-policy.md", `${fixtureId}.compatibility.diffClassification.policyRef`);
  if (classification.state === "tk04b-owned-pending-oracle-comparison") {
    assertNonEmpty(classification.requiredDecision, `${fixtureId}.compatibility.diffClassification.requiredDecision`);
  }
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
