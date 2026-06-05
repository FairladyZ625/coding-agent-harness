#!/usr/bin/env node
import assert from "node:assert/strict";
import { Effect } from "effect";

import {
  createTaskKernelHttpAdapter,
  HumanConfirmationRequiredError,
  TASK_COMMAND_SERVICE_ID,
  TASK_QUERY_SERVICE_ID,
  TaskKernelNotImplementedError,
  TaskNotFoundError,
  type ConfirmHumanReviewCommandInput,
  type TaskCommandServiceShape,
  type TaskKernelHttpRequest,
  type TaskQueryServiceShape,
} from "../scripts/kernel/task/index.mjs";
import {
  createHumanReviewConfirmation,
  parseModuleKey,
  parseTaskId,
} from "../scripts/kernel/task/domain/index.mjs";

const moduleKey = parseModuleKey("task-kernel");
const taskId = parseTaskId("2026-06-05-active-standard-task");
const calls: string[] = [];
const confirmationInputs: ConfirmHumanReviewCommandInput[] = [];

const queries: TaskQueryServiceShape = {
  identity: TASK_QUERY_SERVICE_ID,
  listTasks: (input) => {
    calls.push(`list:${input.moduleKey ?? "all"}:${input.queue ?? "all"}:${String(input.includeArchived)}:${String(input.includeDeleted)}`);
    return Effect.succeed({
      tasks: [{
        id: taskId,
        title: "Active standard task",
        moduleKey,
        queue: "active",
        reviewStatus: "agent-reviewed",
      }],
    });
  },
  getTaskDetail: (input) => {
    calls.push(`detail:${input.ref.kind}:${String(input.ref.value)}`);
    return Effect.succeed({
      detail: {
        task: {
          id: taskId,
          title: "Active standard task",
          state: "active",
          lifecycleState: "active",
          reviewStatus: "agent-reviewed",
          closeoutState: "open",
          materials: { kind: "complete", required: [] },
          phases: [],
          artifacts: [],
          relations: [],
        },
        taskPath: "coding-agent-harness/planning/modules/task-kernel/tasks/2026-06-05-active-standard-task",
        projections: [],
      },
    });
  },
  resolveTaskRef: (input) => Effect.succeed({ taskId, taskPath: String(input.ref.value) }),
  getReviewQueue: (input) => {
    calls.push(`review-queue:${input.moduleKey ?? "all"}`);
    return Effect.succeed({
      items: [{
        taskId,
        taskPath: "coding-agent-harness/planning/modules/task-kernel/tasks/2026-06-05-active-standard-task",
        reviewStatus: "agent-reviewed",
        humanConfirmable: true,
      }],
    });
  },
  getMaterialsIssues: (input) => {
    calls.push(`materials:${input.ref ? String(input.ref.value) : input.moduleKey ?? "all"}`);
    return Effect.succeed({ issues: [] });
  },
  getRelationGraph: () => Effect.succeed({ nodes: [], edges: [] }),
  getGateReport: (input) => {
    calls.push(`gates:${input.gateProfile ?? "all"}`);
    return Effect.succeed({ items: [] });
  },
};

const commands: TaskCommandServiceShape = {
  identity: TASK_COMMAND_SERVICE_ID,
  createTask: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "createTask")),
  updateTaskProgress: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "updateTaskProgress")),
  startTask: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "startTask")),
  blockTask: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "blockTask")),
  submitAgentReview: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "submitAgentReview")),
  confirmHumanReview: (input) => {
    confirmationInputs.push(input);
    return Effect.succeed({
      taskId,
      taskPath: "coding-agent-harness/planning/modules/task-kernel/tasks/2026-06-05-active-standard-task",
      evidenceRefs: [input.evidence],
      confirmation: createHumanReviewConfirmation({
        actor: { kind: "human", id: input.humanActorId },
        confirmedAt: new Date("2026-06-05T00:00:00.000Z"),
        evidence: input.evidence,
      }),
    });
  },
  completeTask: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "completeTask")),
  archiveTask: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "archiveTask")),
  deleteTask: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "deleteTask")),
  reopenTask: () => Effect.fail(new TaskKernelNotImplementedError(TASK_COMMAND_SERVICE_ID, "reopenTask")),
};

const adapter = createTaskKernelHttpAdapter({ queries, commands });

const listResponse = await adapter.handle(request({
  method: "GET",
  path: "/api/tasks",
  query: {
    moduleKey: "task-kernel",
    queue: "active",
    includeArchived: "true",
    includeDeleted: "false",
  },
}));
assert.equal(listResponse.status, 200);
assert.equal(listResponse.body.ok, true);
assert.deepEqual(calls.pop(), "list:task-kernel:active:true:false");

const detailResponse = await adapter.handle(request({
  method: "GET",
  path: "/api/tasks/2026-06-05-active-standard-task",
}));
assert.equal(detailResponse.status, 200);
assert.equal(calls.pop(), "detail:task-id:2026-06-05-active-standard-task");

const reviewQueueResponse = await adapter.handle(request({
  method: "GET",
  path: "/api/tasks/review-queue",
  query: { moduleKey: "task-kernel" },
}));
assert.equal(reviewQueueResponse.status, 200);
assert.equal(calls.pop(), "review-queue:task-kernel");

const materialsResponse = await adapter.handle(request({
  method: "GET",
  path: "/api/tasks/materials-issues",
  query: { ref: "2026-06-05-active-standard-task" },
}));
assert.equal(materialsResponse.status, 200);
assert.equal(calls.pop(), "materials:2026-06-05-active-standard-task");

const validationResponse = await adapter.handle(request({
  method: "GET",
  path: "/api/tasks",
  query: { queue: "not-a-queue" },
}));
assert.equal(validationResponse.status, 400);
assert.equal(validationResponse.body.ok, false);
assert.equal(validationResponse.body.error.code, "invalid-body");

const remoteResponse = await adapter.handle({
  ...request({ method: "GET", path: "/api/tasks" }),
  context: { isLocal: false },
});
assert.equal(remoteResponse.status, 403);
assert.equal(remoteResponse.body.ok, false);
assert.equal(remoteResponse.body.error.code, "local-only-required");

const missingQueries: TaskQueryServiceShape = {
  ...queries,
  getTaskDetail: () => Effect.fail(new TaskNotFoundError("missing task")),
};
const missingResponse = await createTaskKernelHttpAdapter({ queries: missingQueries, commands }).handle(request({
  method: "GET",
  path: "/api/tasks/2026-06-05-missing-task",
}));
assert.equal(missingResponse.status, 404);
assert.equal(missingResponse.body.ok, false);
assert.equal(missingResponse.body.error.code, "TaskNotFound");

const agentConfirmResponse = await adapter.handle(request({
  method: "POST",
  path: "/api/tasks/2026-06-05-active-standard-task/confirm",
  body: {
    evidence: "review.md#human-confirmation",
    writeScope: { allowedPaths: ["coding-agent-harness/planning/modules/task-kernel/tasks"] },
  },
}));
assert.equal(agentConfirmResponse.status, 403);
assert.equal(agentConfirmResponse.body.ok, false);
assert.equal(agentConfirmResponse.body.error.code, "HumanConfirmationRequired");
assert.equal(confirmationInputs.length, 0);

const humanConfirmResponse = await adapter.handle(request({
  method: "POST",
  path: "/api/tasks/2026-06-05-active-standard-task/confirm",
  body: {
    evidence: "review.md#human-confirmation",
    writeScope: { allowedPaths: ["coding-agent-harness/planning/modules/task-kernel/tasks"] },
  },
  actor: { kind: "human", id: "reviewer-1" },
}));
assert.equal(humanConfirmResponse.status, 200);
assert.equal(humanConfirmResponse.body.ok, true);
assert.equal(confirmationInputs.length, 1);
assert.equal(confirmationInputs[0]?.humanActorId, "reviewer-1");
assert.equal(confirmationInputs[0]?.writeScope.allowedPaths[0], "coding-agent-harness/planning/modules/task-kernel/tasks");

const unimplementedReviewResponse = await adapter.handle(request({
  method: "POST",
  path: "/api/tasks/2026-06-05-active-standard-task/review",
  body: {
    summary: "Agent review summary",
    writeScope: { allowedPaths: ["coding-agent-harness/planning/modules/task-kernel/tasks"] },
  },
}));
assert.equal(unimplementedReviewResponse.status, 501);
assert.equal(unimplementedReviewResponse.body.ok, false);
assert.equal(unimplementedReviewResponse.body.error.code, "TaskKernelNotImplemented");

const humanRequiredCommands: TaskCommandServiceShape = {
  ...commands,
  confirmHumanReview: () => Effect.fail(new HumanConfirmationRequiredError("human adapter required")),
};
const humanRequiredResponse = await createTaskKernelHttpAdapter({ queries, commands: humanRequiredCommands }).handle(request({
  method: "POST",
  path: "/api/tasks/2026-06-05-active-standard-task/confirm",
  body: {
    evidence: "review.md#human-confirmation",
    writeScope: { allowedPaths: ["coding-agent-harness/planning/modules/task-kernel/tasks"] },
  },
  actor: { kind: "human", id: "reviewer-1" },
}));
assert.equal(humanRequiredResponse.status, 403);
assert.equal(humanRequiredResponse.body.ok, false);
assert.equal(humanRequiredResponse.body.error.code, "HumanConfirmationRequired");

console.log("Task Kernel HTTP adapter tests passed");

function request(input: Readonly<{
  method: "GET" | "POST";
  path: string;
  query?: Readonly<Record<string, unknown>>;
  body?: unknown;
  actor?: TaskKernelHttpRequest["context"]["actor"];
}>): TaskKernelHttpRequest {
  return {
    method: input.method,
    path: input.path,
    query: input.query,
    body: input.body,
    context: {
      isLocal: true,
      csrfVerified: input.method === "POST",
      actor: input.actor ?? { kind: "agent", id: "codex-worker" },
    },
  };
}
