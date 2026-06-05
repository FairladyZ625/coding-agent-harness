#!/usr/bin/env node
import assert from "node:assert/strict";
import { Effect, Layer } from "effect";

import {
  GIT_UNIT_OF_WORK_PORT_ID,
  GitUnitOfWork,
  HumanReviewPort,
  HUMAN_REVIEW_PORT_ID,
  TASK_PACKAGE_STORE_PORT_ID,
  TaskApplicationServicesLiveLayer,
  TaskCommands,
  TaskKernelNotImplementedError,
  TaskNotFoundError,
  TaskPackageStore,
  TaskQueries,
  type GitUnitOfWorkServiceShape,
  type HumanReviewConfirmationInput,
  type HumanReviewPortServiceShape,
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
  createWriteScope,
  parseModuleKey,
  parseTaskId,
  type Task,
} from "../scripts/kernel/task/domain/index.mjs";

const moduleKey = parseModuleKey("task-kernel");
const activeId = parseTaskId("2026-06-05-active-standard-task");
const missingId = parseTaskId("2026-06-05-missing-materials-task");
const activeRef = createTaskRef({ kind: "task-id", value: activeId });
const missingRef = createTaskRef({ kind: "task-id", value: missingId });
const taskPlanArtifact = createTaskArtifact({ id: "ART-001", title: "Task plan" });
const progressArtifact = createTaskArtifact({ id: "ART-002", title: "Progress notes" });
const missingReviewArtifact = createTaskArtifact({ id: "ART-003", title: "Review notes" });

const activeTask = createTask({
  id: activeId,
  title: "Active standard task",
  state: "active",
  lifecycleState: "active",
  reviewStatus: "agent-reviewed",
  closeoutState: "open",
  materials: { kind: "complete", required: [taskPlanArtifact.id, progressArtifact.id, missingReviewArtifact.id] },
  modulePlacement: {
    moduleKey,
    taskPath: "coding-agent-harness/planning/modules/task-kernel/tasks/2026-06-05-active-standard-task",
  },
  phases: [createTaskPhase({ id: "INIT-01", title: "Prepare application service", order: 0 })],
  artifacts: [taskPlanArtifact, progressArtifact, missingReviewArtifact],
  relations: [createTaskRelation({ type: "depends-on", target: missingRef })],
  auditMetadata: {
    "gate-waiver": "waiver:review-residual",
  },
});

const missingTask = createTask({
  id: missingId,
  title: "Missing materials task",
  state: "planned",
  lifecycleState: "ready",
  reviewStatus: "required",
  closeoutState: "open",
  materials: {
    kind: "missing",
    required: [taskPlanArtifact.id, progressArtifact.id, missingReviewArtifact.id],
    missing: [missingReviewArtifact.id],
  },
  modulePlacement: {
    moduleKey,
    taskPath: "coding-agent-harness/planning/modules/task-kernel/tasks/2026-06-05-missing-materials-task",
  },
  phases: [createTaskPhase({ id: "INIT-01", title: "Prepare task package", order: 0 })],
  artifacts: [taskPlanArtifact, progressArtifact, missingReviewArtifact],
});

const details = new Map<string, TaskPackageStoreDetail>([
  [activeId, detailForTask(activeTask)],
  [missingId, detailForTask(missingTask)],
]);
const humanReviewInputs: HumanReviewConfirmationInput[] = [];
const transactions: string[] = [];

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
  save: (task) => {
    const detail = detailForTask(task);
    details.set(task.id, detail);
    return Effect.succeed(detail);
  },
  archive: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "archive")),
  delete: () => Effect.fail(new TaskKernelNotImplementedError(TASK_PACKAGE_STORE_PORT_ID, "delete")),
};

const humanReview: HumanReviewPortServiceShape = {
  identity: HUMAN_REVIEW_PORT_ID,
  confirm: (input) => {
    humanReviewInputs.push(input);
    return Effect.succeed(createHumanReviewConfirmation({
      actor: { kind: "human", id: input.humanActorId },
      confirmedAt: input.confirmedAt,
      evidence: input.evidence,
    }));
  },
};

const unitOfWork: GitUnitOfWorkServiceShape = {
  identity: GIT_UNIT_OF_WORK_PORT_ID,
  transact: (input, effect) => {
    transactions.push(input.label);
    return Effect.map(effect, (value) => ({
      value,
      evidenceRefs: input.evidenceRefs ?? [],
    }));
  },
};

const TestPortsLayer = Layer.mergeAll(
  Layer.succeed(TaskPackageStore, repository),
  Layer.succeed(HumanReviewPort, humanReview),
  Layer.succeed(GitUnitOfWork, unitOfWork),
);
const TestApplicationLayer = TaskApplicationServicesLiveLayer.pipe(Layer.provide(TestPortsLayer));

const listOutput = await Effect.runPromise(
  TaskQueries.listTasks({ moduleKey }).pipe(Effect.provide(TestApplicationLayer)),
);
assert.deepEqual(listOutput.tasks.map((task) => [task.id, task.moduleKey, task.queue]), [
  [activeId, moduleKey, "active"],
  [missingId, moduleKey, "missing-materials"],
]);

const detailOutput = await Effect.runPromise(
  TaskQueries.getTaskDetail({ ref: activeRef }).pipe(Effect.provide(TestApplicationLayer)),
);
assert.equal(detailOutput.detail.task.title, "Active standard task");
assert.deepEqual(detailOutput.detail.projections.map((projection) => projection.name), ["fixture-projection"]);

const resolved = await Effect.runPromise(
  TaskQueries.resolveTaskRef({ ref: createTaskRef({ kind: "module-path", value: detailOutput.detail.taskPath }) })
    .pipe(Effect.provide(TestApplicationLayer)),
);
assert.equal(resolved.taskId, activeId);
assert.equal(resolved.taskPath, detailOutput.detail.taskPath);

const reviewQueue = await Effect.runPromise(
  TaskQueries.getReviewQueue({ moduleKey }).pipe(Effect.provide(TestApplicationLayer)),
);
assert.deepEqual(reviewQueue.items.map((item) => [item.taskId, item.reviewStatus, item.humanConfirmable]), [
  [activeId, "agent-reviewed", true],
  [missingId, "required", false],
]);

const materialsIssues = await Effect.runPromise(
  TaskQueries.getMaterialsIssues({ moduleKey }).pipe(Effect.provide(TestApplicationLayer)),
);
assert.deepEqual(materialsIssues.issues, [{
  taskId: missingId,
  missingArtifactIds: [missingReviewArtifact.id],
  repairHints: ["Provide required material ART-003 before rerunning task gates."],
}]);

const activeMaterialsIssues = await Effect.runPromise(
  TaskQueries.getMaterialsIssues({ ref: activeRef }).pipe(Effect.provide(TestApplicationLayer)),
);
assert.equal(activeMaterialsIssues.issues.length, 0);

const relationGraph = await Effect.runPromise(
  TaskQueries.getRelationGraph({ root: activeRef }).pipe(Effect.provide(TestApplicationLayer)),
);
assert.deepEqual(relationGraph.nodes.map((node) => [node.taskId, node.title]), [
  [activeId, "Active standard task"],
  [missingId, "Missing materials task"],
]);
assert.equal(relationGraph.edges[0]?.sourceTaskId, activeId);
assert.equal(relationGraph.edges[0]?.relation.type, "depends-on");
assert.equal(relationGraph.edges[0]?.relation.target.value, missingId);

const gateReport = await Effect.runPromise(
  TaskQueries.getGateReport({ moduleKey, gateProfile: "materials-complete" }).pipe(Effect.provide(TestApplicationLayer)),
);
assert.deepEqual(gateReport.items.map((item) => [item.gate, item.passed, item.waiverRefs]), [
  [`${activeId}/materials-complete`, true, ["waiver:review-residual"]],
  [`${missingId}/materials-complete`, false, []],
]);

const writeScope = createWriteScope({ allowedPaths: ["coding-agent-harness/planning/modules/task-kernel/tasks"] });
const unsupportedAgentReview = await captureFailure(
  TaskCommands.submitAgentReview({
    ref: activeRef,
    summary: "Agent review may not fabricate human confirmation.",
    writeScope,
  }).pipe(Effect.provide(TestApplicationLayer)),
);
assert(unsupportedAgentReview instanceof TaskKernelNotImplementedError);
assert.equal(humanReviewInputs.length, 0);

const confirmationOutput = await Effect.runPromise(
  TaskCommands.confirmHumanReview({
    ref: activeRef,
    humanActorId: "reviewer-1",
    evidence: "review.md#human-confirmation",
    writeScope,
  }).pipe(Effect.provide(TestApplicationLayer)),
);
assert.deepEqual(transactions, ["task-kernel.confirm-human-review"]);
assert.equal(humanReviewInputs.length, 1);
assert.equal(humanReviewInputs[0]?.humanActorId, "reviewer-1");
assert.equal(confirmationOutput.taskId, activeId);
assert.equal(confirmationOutput.confirmation.actor.kind, "human");
assert.equal(confirmationOutput.confirmation.evidence, "review.md#human-confirmation");
assert.equal(confirmationOutput.evidenceRefs[0], "review.md#human-confirmation");
assert.equal(details.get(activeId)?.task.reviewStatus, "human-confirmed");
assert.equal(details.get(activeId)?.task.reviewConfirmation?.actor.id, "reviewer-1");

console.log("Task Kernel application service tests passed");

function detailForTask(task: Task): TaskPackageStoreDetail {
  return {
    task,
    taskPath: task.modulePlacement?.taskPath ?? `tasks/${task.id}`,
    projections: [createGeneratedProjection({ name: "fixture-projection", sourceTaskIds: [task.id] })],
  };
}

function resolveDetail(ref: ReturnType<typeof createTaskRef>): TaskPackageStoreDetail | undefined {
  if (ref.kind === "task-id") return details.get(ref.value);
  return [...details.values()].find((detail) => detail.taskPath === ref.value);
}

async function captureFailure<A, E>(effect: Effect.Effect<A, E>): Promise<E> {
  return Effect.runPromise(Effect.flip(effect));
}
