#!/usr/bin/env node
import assert from "node:assert/strict";
import { Effect, Layer } from "effect";

import { buildTaskSemanticProjection } from "../scripts/domain/task/task-semantic-projection.mjs";
import {
  TASK_PACKAGE_STORE_PORT_ID,
  TaskKernelNotImplementedError,
  TaskNotFoundError,
  TaskPackageStore,
  TaskQueries,
  TaskQueryServiceLiveLayer,
  type TaskPackageStoreDetail,
  type TaskPackageStoreServiceShape,
} from "../scripts/kernel/task/index.mjs";
import {
  classifyTaskQueue,
  createGeneratedProjection,
  createHumanReviewConfirmation,
  createTask,
  createTaskArtifact,
  createTaskPhase,
  createTaskRef,
  createTaskRelation,
  parseArtifactId,
  parseModuleKey,
  parseTaskId,
  type Task,
  type TaskRef,
} from "../scripts/kernel/task/domain/index.mjs";
import { taskKernelExpectedFixtures } from "./fixtures/task-kernel-fixtures/expected-values.mjs";
import type {
  ExpectedTaskSnapshot,
  TaskKernelExpectedRecord,
} from "./fixtures/task-kernel-fixtures/schema.mjs";

type DashboardGuiParityField =
  | "summary.title"
  | "summary.queue"
  | "summary.reviewStatus"
  | "summary.moduleKey"
  | "reviewWorkbench.humanConfirmable"
  | "reviewWorkbench.needsMaterials"
  | "materials.missingArtifactIds";

type DashboardGuiKernelOutput = Readonly<{
  summary: Readonly<{
    title: string;
    queue: string;
    reviewStatus: string;
    moduleKey?: string;
  }>;
  reviewWorkbench: Readonly<{
    humanConfirmable: boolean;
    needsMaterials: boolean;
  }>;
  materials: Readonly<{
    missingArtifactIds: readonly string[];
  }>;
}>;

type DashboardGuiOldOutput = Readonly<{
  summary: Readonly<{
    title: string;
    queue: string;
    reviewStatus: string;
    moduleKey?: string;
  }>;
  reviewWorkbench: Readonly<{
    humanConfirmable: boolean;
    needsMaterials: boolean;
  }>;
  materials: Readonly<{
    missingArtifactIds: readonly string[];
  }>;
}>;

type DashboardGuiMismatchClassification = Readonly<{
  fixtureId: string;
  field: DashboardGuiParityField;
  classification: "compatibility" | "intentional-divergence" | "adapter-display-only";
  selectedBehavior: "old-dashboard-gui" | "new-task-kernel-query";
  owner: "TK-09";
  expiry: "kernel-cutover";
  policyRef: "divergence-resolution-policy.md";
  reason: string;
}>;

type DashboardGuiObservedDiff = Readonly<{
  fixtureId: string;
  field: DashboardGuiParityField;
  oldValue: unknown;
  newValue: unknown;
  classification: DashboardGuiMismatchClassification;
}>;

const parityFields: readonly DashboardGuiParityField[] = [
  "summary.title",
  "summary.queue",
  "summary.reviewStatus",
  "summary.moduleKey",
  "reviewWorkbench.humanConfirmable",
  "reviewWorkbench.needsMaterials",
  "materials.missingArtifactIds",
];

const expectedObservedDiffKeys: readonly string[] = [
  "human-confirmed-task:summary.queue",
  "human-confirmed-task:summary.reviewStatus",
];

const allowedMismatches: readonly DashboardGuiMismatchClassification[] = [
  {
    fixtureId: "human-confirmed-task",
    field: "summary.queue",
    classification: "adapter-display-only",
    selectedBehavior: "new-task-kernel-query",
    owner: "TK-09",
    expiry: "kernel-cutover",
    policyRef: "divergence-resolution-policy.md",
    reason: "Legacy Dashboard/GUI workbench labels Git-backed done work as finalized, while the Kernel query exposes the domain TaskQueueProjection value done.",
  },
  {
    fixtureId: "human-confirmed-task",
    field: "summary.reviewStatus",
    classification: "adapter-display-only",
    selectedBehavior: "new-task-kernel-query",
    owner: "TK-09",
    expiry: "kernel-cutover",
    policyRef: "divergence-resolution-policy.md",
    reason: "Legacy Dashboard/GUI aliases human-confirmed review evidence to confirmed for display; the Kernel query keeps the domain reviewStatus enum human-confirmed.",
  },
];

const activeDashboardFixtures = taskKernelExpectedFixtures.filter((fixture) =>
  !["archived", "deleted"].includes(fixture.task.state),
);
const details = new Map<string, TaskPackageStoreDetail>(
  activeDashboardFixtures.map((fixture) => [fixture.task.id, detailForFixture(fixture)]),
);

const repository: TaskPackageStoreServiceShape = {
  identity: TASK_PACKAGE_STORE_PORT_ID,
  list: (input) =>
    Effect.succeed(
      [...details.values()]
        .filter((detail) => !input.moduleKey || detail.task.modulePlacement?.moduleKey === input.moduleKey)
        .filter((detail) => !input.queue || classifyTaskQueue({ task: detail.task }) === input.queue)
        .filter((detail) => input.includeArchived !== false || !["archived", "deleted"].includes(detail.task.state))
        .filter((detail) => input.includeDeleted !== false || detail.task.state !== "deleted")
        .map((detail) => ({
          id: detail.task.id,
          title: detail.task.title,
          taskPath: detail.taskPath,
          queue: classifyTaskQueue({ task: detail.task }),
          reviewStatus: detail.task.reviewStatus,
        })),
    ),
  get: (ref) => {
    const detail = resolveDetail(ref);
    return detail ? Effect.succeed(detail) : Effect.fail(new TaskNotFoundError(`Task not found: ${String(ref.value)}`));
  },
  resolve: (ref) => {
    const detail = resolveDetail(ref);
    return detail
      ? Effect.succeed({ taskId: detail.task.id, taskPath: detail.taskPath })
      : Effect.fail(new TaskNotFoundError(`Task not found: ${String(ref.value)}`));
  },
  create: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "create")),
  save: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "save")),
  archive: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "archive")),
  delete: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "delete")),
};

const TestApplicationLayer = TaskQueryServiceLiveLayer.pipe(
  Layer.provide(Layer.succeed(TaskPackageStore, repository)),
);

const [listOutput, reviewQueue, materialsIssues] = await Promise.all([
  Effect.runPromise(TaskQueries.listTasks({ includeArchived: false, includeDeleted: false }).pipe(Effect.provide(TestApplicationLayer))),
  Effect.runPromise(TaskQueries.getReviewQueue({}).pipe(Effect.provide(TestApplicationLayer))),
  Effect.runPromise(TaskQueries.getMaterialsIssues({}).pipe(Effect.provide(TestApplicationLayer))),
]);

const kernelById = new Map(activeDashboardFixtures.map((fixture) => [
  fixture.task.id,
  kernelOutputForFixture(fixture),
]));
const oldById = new Map(activeDashboardFixtures.map((fixture) => [
  fixture.task.id,
  oldDashboardGuiOutputForFixture(fixture),
]));

assert.deepEqual(
  listOutput.tasks.map((task) => task.id).sort(),
  activeDashboardFixtures.map((fixture) => fixture.task.id).sort(),
  "TaskQueries.listTasks should expose the Dashboard/GUI active fixture set without archived/deleted generated truth.",
);
assert.deepEqual(
  reviewQueue.items.filter((item) => item.humanConfirmable).map((item) => item.taskId),
  ["2026-06-05-review-ready-task"],
  "TaskQueries.getReviewQueue should expose only agent-reviewed work as human-confirmable.",
);
assert.deepEqual(
  materialsIssues.issues.map((issue) => [issue.taskId, issue.missingArtifactIds]),
  [["2026-06-05-missing-materials-task", ["ART-002"]]],
  "TaskQueries.getMaterialsIssues should preserve missing material ids for Dashboard/GUI repair prompts.",
);

const observedDiffs = activeDashboardFixtures.flatMap((fixture) =>
  diffDashboardGuiOutputs(fixture, oldById.get(fixture.task.id), kernelById.get(fixture.task.id)),
);

assert.deepEqual(
  observedDiffs.map((diff) => `${diff.fixtureId}:${diff.field}`).sort(),
  [...expectedObservedDiffKeys].sort(),
);
for (const diff of observedDiffs) {
  assert(diff.classification.reason.trim().length > 0, `${diff.fixtureId}.${diff.field} classification reason is required`);
  assert.equal(diff.classification.owner, "TK-09", `${diff.fixtureId}.${diff.field} classification owner is required`);
  assert.equal(diff.classification.expiry, "kernel-cutover", `${diff.fixtureId}.${diff.field} classification expiry is required`);
}

const unclassifiedOld = {
  ...oldById.get("2026-06-05-active-standard-task"),
  summary: {
    ...oldById.get("2026-06-05-active-standard-task")?.summary,
    queue: "legacy-dashboard-only",
  },
} as DashboardGuiOldOutput;
assert.throws(
  () => diffDashboardGuiOutputs(
    activeDashboardFixtures.find((fixture) => fixture.task.id === "2026-06-05-active-standard-task")!,
    unclassifiedOld,
    kernelById.get("2026-06-05-active-standard-task"),
  ),
  /Unclassified Dashboard\/GUI query mismatch: active-standard-task\.summary\.queue/,
);

console.log("Task Kernel Dashboard/GUI query parity tests passed");

function kernelOutputForFixture(fixture: TaskKernelExpectedRecord): DashboardGuiKernelOutput {
  const id = fixture.task.id;
  const summary = listOutput.tasks.find((task) => task.id === id);
  assert(summary, `${id} TaskQueries.listTasks output is required`);
  const reviewItem = reviewQueue.items.find((item) => item.taskId === id);
  const materialIssue = materialsIssues.issues.find((issue) => issue.taskId === id);
  return {
    summary: {
      title: summary.title,
      queue: summary.queue,
      reviewStatus: summary.reviewStatus,
      moduleKey: summary.moduleKey,
    },
    reviewWorkbench: {
      humanConfirmable: reviewItem?.humanConfirmable === true,
      needsMaterials: Boolean(materialIssue),
    },
    materials: {
      missingArtifactIds: materialIssue?.missingArtifactIds ?? [],
    },
  };
}

function oldDashboardGuiOutputForFixture(fixture: TaskKernelExpectedRecord): DashboardGuiOldOutput {
  const semanticProjection = buildTaskSemanticProjection(legacyDashboardTaskInput(fixture));
  return {
    summary: {
      title: fixture.task.title,
      queue: semanticProjection.reviewWorkbenchQueueView.primaryQueue,
      reviewStatus: semanticProjection.taskLifecycleProjection.reviewStatus,
      moduleKey: fixture.task.modulePlacement?.moduleKey,
    },
    reviewWorkbench: {
      humanConfirmable: semanticProjection.reviewWorkbenchQueueView.humanConfirmable,
      needsMaterials: semanticProjection.reviewWorkbenchQueueView.needsMaterials,
    },
    materials: {
      missingArtifactIds: fixture.task.materials.kind === "missing" ? fixture.task.materials.missing : [],
    },
  };
}

function legacyDashboardTaskInput(fixture: TaskKernelExpectedRecord): Record<string, unknown> {
  const queue = fixture.policy.queue;
  return {
    id: fixture.task.id,
    title: fixture.task.title,
    state: legacyDashboardState(fixture.task.state),
    lifecycleState: fixture.task.lifecycleState,
    reviewStatus: fixture.task.reviewStatus,
    reviewQueueState: legacyReviewQueueState(queue),
    closeoutStatus: fixture.task.closeoutState,
    taskQueues: [queue],
    materialsReady: fixture.task.materials.kind === "complete",
    module: fixture.task.modulePlacement?.moduleKey,
    inferredModule: fixture.task.modulePlacement ? undefined : "base",
    deletionState: fixture.task.state === "deleted" ? "deleted" : fixture.task.state === "archived" ? "archived" : "active",
    hiddenByDefault: false,
    reviewSubmitted: fixture.task.reviewStatus === "agent-reviewed" || fixture.task.reviewStatus === "human-confirmed",
    completion: fixture.task.state === "done" ? 100 : 50,
    phases: fixture.task.phases.map(() => ({ evidenceStatus: "present" })),
    visualMapStatus: "present",
    briefSource: "standalone",
    reviewConfirmation: legacyReviewConfirmation(fixture.task),
  };
}

function legacyDashboardState(state: ExpectedTaskSnapshot["state"]): string {
  if (state === "active") return "in_progress";
  return state;
}

function legacyReviewQueueState(queue: string): string {
  if (queue === "missing-materials") return "needs-material";
  if (queue === "review") return "ready-to-confirm";
  return "not-in-queue";
}

function legacyReviewConfirmation(task: ExpectedTaskSnapshot): Record<string, unknown> | null {
  if (!task.reviewConfirmation) return null;
  return {
    confirmed: true,
    confirmationId: `confirm-${task.id}`,
    confirmedAt: task.reviewConfirmation.confirmedAt,
    reviewer: task.reviewConfirmation.actor.id,
    commitSha: "0123456789abcdef0123456789abcdef01234567",
    gitAudit: { valid: true },
  };
}

function diffDashboardGuiOutputs(
  fixture: TaskKernelExpectedRecord,
  oldOutput: DashboardGuiOldOutput | undefined,
  kernelOutput: DashboardGuiKernelOutput | undefined,
): DashboardGuiObservedDiff[] {
  assert(oldOutput, `${fixture.id} old Dashboard/GUI output is required`);
  assert(kernelOutput, `${fixture.id} new Task Kernel query output is required`);
  const diffs: DashboardGuiObservedDiff[] = [];
  for (const field of parityFields) {
    const oldValue = valueAt(oldOutput, field);
    const newValue = valueAt(kernelOutput, field);
    if (stableJson(oldValue) === stableJson(newValue)) continue;
    diffs.push({
      fixtureId: fixture.id,
      field,
      oldValue,
      newValue,
      classification: classifyDashboardGuiMismatch(fixture.id, field, oldValue, newValue),
    });
  }
  return diffs;
}

function classifyDashboardGuiMismatch(
  fixtureId: string,
  field: DashboardGuiParityField,
  oldValue: unknown,
  newValue: unknown,
): DashboardGuiMismatchClassification {
  const fixtureShortId = shortFixtureId(fixtureId);
  const classification = allowedMismatches.find((candidate) => candidate.fixtureId === fixtureShortId && candidate.field === field);
  if (!classification) {
    throw new Error(`Unclassified Dashboard/GUI query mismatch: ${fixtureShortId}.${field} old=${stableJson(oldValue)} new=${stableJson(newValue)}`);
  }
  return classification;
}

function detailForFixture(fixture: TaskKernelExpectedRecord): TaskPackageStoreDetail {
  const task = taskFromExpected(fixture.task);
  return {
    task,
    taskPath: task.modulePlacement?.taskPath ?? `coding-agent-harness/planning/tasks/${task.id}`,
    projections: [createGeneratedProjection({ name: "dashboard-gui-query-parity", sourceTaskIds: [task.id] })],
  };
}

function taskFromExpected(expected: ExpectedTaskSnapshot): Task {
  return createTask({
    id: parseTaskId(expected.id),
    title: expected.title,
    state: expected.state,
    lifecycleState: expected.lifecycleState,
    reviewStatus: expected.reviewStatus,
    closeoutState: expected.closeoutState,
    materials: expected.materials.kind === "complete"
      ? {
          kind: "complete",
          required: expected.materials.required.map(parseArtifactId),
        }
      : {
          kind: "missing",
          required: expected.materials.required.map(parseArtifactId),
          missing: expected.materials.missing.map(parseArtifactId),
        },
    phases: expected.phases.map((phase) => createTaskPhase(phase)),
    artifacts: expected.artifacts.map((artifact) => createTaskArtifact(artifact)),
    relations: expected.relations.map((relation) => createTaskRelation({
      type: relation.type,
      target: createTaskRef(relation.target),
    })),
    modulePlacement: expected.modulePlacement
      ? {
          moduleKey: parseModuleKey(expected.modulePlacement.moduleKey),
          taskPath: expected.modulePlacement.taskPath,
        }
      : undefined,
    auditMetadata: expected.auditMetadata,
    reviewConfirmation: expected.reviewConfirmation
      ? createHumanReviewConfirmation({
          actor: expected.reviewConfirmation.actor,
          confirmedAt: new Date(expected.reviewConfirmation.confirmedAt),
          evidence: expected.reviewConfirmation.evidence,
        })
      : undefined,
  });
}

function resolveDetail(ref: TaskRef): TaskPackageStoreDetail | undefined {
  if (ref.kind === "task-id") return details.get(ref.value);
  return [...details.values()].find((detail) => detail.taskPath === ref.value);
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

function shortFixtureId(taskId: string): string {
  return taskId.replace(/^2026-06-05-/, "");
}
