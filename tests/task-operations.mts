#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createTaskOperations } from "../scripts/application/task/task-operations.mjs";
import {
  assert,
  repoRoot,
  run,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

type FailureResult = {
  success: false;
  status: number;
  reason: string;
  payload: Record<string, unknown>;
};

const target = path.join(tmpRoot, "task-operations-target");
fs.cpSync(path.join(repoRoot, "examples/minimal-project"), target, { recursive: true });

const operations = createTaskOperations(target);

const reviewResult = operations.confirmReview({
  taskId: "demo-task",
  confirmText: "demo-task",
  reviewer: "Human Reviewer",
});
assertFailure(reviewResult, "planned review confirmation should be rejected by TaskOperations");
assert(reviewResult.status === 409, "review confirmation outside the review queue should be a conflict");
assert(reviewResult.reason.includes("review queue"), "review confirmation rejection should explain the review queue gate");
assert(reviewResult.payload.reviewQueueState === "not-in-queue", "review rejection payload should include reviewQueueState");
assert(Array.isArray(reviewResult.payload.taskQueues), "review rejection payload should include taskQueues");

const completeResult = operations.complete({
  taskId: "demo-task",
  message: "try closeout from TaskOperations",
});
assertFailure(completeResult, "standard closeout before review should be rejected by TaskOperations");
assert(completeResult.status === 409, "closeout before review should be a conflict");
assert(completeResult.reason.includes("task-review"), "closeout rejection should preserve the CLI task-review guidance");
assert(completeResult.payload.lifecycleState === "active", "closeout rejection payload should include lifecycleState");

const cliComplete = run(["task-complete", "demo-task", "--message", "try closeout from CLI", target]);
assert(cliComplete.status !== 0, "CLI task-complete should reject the same closeout precondition");
assert(cliComplete.stderr.includes(completeResult.reason), "CLI task-complete should surface the TaskOperations closeout reason");

const ambiguousTarget = path.join(tmpRoot, "task-operations-ambiguous-target");
fs.cpSync(path.join(repoRoot, "examples/minimal-project"), ambiguousTarget, { recursive: true });
const sourceTaskDir = path.join(ambiguousTarget, "coding-agent-harness/planning/tasks/demo-task");
const moduleTaskDir = path.join(ambiguousTarget, "coding-agent-harness/planning/modules/auth/tasks/demo-task");
fs.mkdirSync(path.dirname(moduleTaskDir), { recursive: true });
fs.cpSync(sourceTaskDir, moduleTaskDir, { recursive: true });
const ambiguousResult = createTaskOperations(ambiguousTarget).complete({
  taskId: "demo-task",
  message: "try ambiguous closeout",
});
assertFailure(ambiguousResult, "ambiguous task references should be rejected");
assert(ambiguousResult.status === 400, "ambiguous task references should be a bad request, not a not-found");
assert(ambiguousResult.reason.includes("Ambiguous task reference"), "ambiguous task references should preserve the repository diagnostic");
assert(ambiguousResult.payload.error === ambiguousResult.reason, "ambiguous payload should expose the full diagnostic");
assert(String(ambiguousResult.payload.error).includes("TASKS/demo-task"), "ambiguous payload should list the task candidate");
assert(String(ambiguousResult.payload.error).includes("MODULES/auth/demo-task"), "ambiguous payload should list the module candidate");

const projectionQueueOperations = createTaskOperations(target, {
  repository: {
    list: () => [],
    resolve: () => { throw new Error("not used"); },
    readMaterials: () => { throw new Error("not used"); },
    getTombstoneSubject: () => { throw new Error("not used"); },
    get: () => ({
      id: "projection-queue-task",
      taskKey: "projection-queue-task",
      state: "not_started",
      lifecycleState: "ready",
      reviewStatus: "agent-reviewed",
      reviewQueueState: "ready-to-confirm",
      taskQueues: ["review"],
      semanticProjection: {
        taskLifecycleProjection: {
          state: "not_started",
          lifecycleState: "ready",
          reviewStatus: "agent-reviewed",
          reviewQueueState: "not-in-queue",
          closeoutStatus: "missing",
          taskQueues: ["planned"],
          materialsReady: true,
          reviewSubmitted: false,
          lessonCandidateDecisionComplete: true,
          deletionState: "active",
        },
        dashboardTaskView: {
          visibleInSwimlane: true,
          swimlaneStage: "planned",
          swimlane: {
            visible: true,
            rowKey: "architecture",
            rowLabelKey: "",
            columnKey: "planned",
            columnLabelKey: "planned",
            tone: "muted",
            sortKey: "projection-queue-task",
          },
          materials: {
            briefReady: true,
            visualMapReady: true,
            evidenceReady: true,
            blockingReasonCodes: [],
          },
          needsEvidence: false,
          reasonCode: "",
          reasonMessage: "",
        },
        reviewWorkbenchQueueView: {
          queues: ["planned"],
          primaryQueue: "planned",
          inQueue: false,
          humanConfirmable: false,
          blocked: false,
          needsMaterials: false,
          confirmed: false,
          finalized: false,
          hasPendingLessonWork: false,
          readyForCloseout: false,
          reasonCodes: [],
          reasonSummaries: [],
        },
      },
    }) as never,
  },
});

const projectionQueueReview = projectionQueueOperations.confirmReview({
  taskId: "projection-queue-task",
  confirmText: "projection-queue-task",
  reviewer: "Human Reviewer",
});
assertFailure(projectionQueueReview, "TaskOperations should reject according to semantic projection queue view");
assert(Array.isArray(projectionQueueReview.payload.taskQueues), "projection queue rejection should include taskQueues");
assert((projectionQueueReview.payload.taskQueues as unknown[]).includes("planned"), "TaskOperations should expose projected task queues, not stale raw review queues");

const projectionFirstOperations = createTaskOperations(target, {
  repository: {
    list: () => [],
    resolve: () => { throw new Error("not used"); },
    readMaterials: () => { throw new Error("not used"); },
    getTombstoneSubject: () => { throw new Error("not used"); },
    get: () => ({
      id: "projection-first-task",
      taskKey: "projection-first-task",
      state: "review",
      lifecycleState: "in_review",
      reviewStatus: "agent-reviewed",
      reviewQueueState: "ready-to-confirm",
      closeoutStatus: "missing",
      taskQueues: ["review"],
      reviewConfirmation: { confirmed: false },
      semanticProjection: {
        taskLifecycleProjection: {
          state: "review",
          lifecycleState: "finalized",
          reviewStatus: "confirmed",
          reviewQueueState: "not-in-queue",
          closeoutStatus: "missing",
          taskQueues: ["finalized"],
          materialsReady: true,
          reviewSubmitted: true,
          lessonCandidateDecisionComplete: true,
          deletionState: "active",
        },
        dashboardTaskView: {
          visibleInSwimlane: false,
          swimlaneStage: "finalized",
          swimlane: {
            visible: false,
            rowKey: "architecture",
            rowLabelKey: "",
            columnKey: "finalized",
            columnLabelKey: "state_finalized",
            tone: "pass",
            sortKey: "projection-first-task",
          },
          materials: {
            briefReady: true,
            visualMapReady: true,
            evidenceReady: true,
            blockingReasonCodes: [],
          },
          needsEvidence: false,
          reasonCode: "",
          reasonMessage: "",
        },
        reviewWorkbenchQueueView: {
          queues: ["finalized"],
          primaryQueue: "finalized",
          inQueue: true,
          humanConfirmable: false,
          blocked: false,
          needsMaterials: false,
          confirmed: true,
          finalized: true,
          hasPendingLessonWork: false,
          readyForCloseout: false,
          reasonCodes: [],
          reasonSummaries: [],
        },
      },
    }) as never,
  },
});

const projectionFirstReview = projectionFirstOperations.confirmReview({
  taskId: "projection-first-task",
  confirmText: "projection-first-task",
  reviewer: "Human Reviewer",
});
assertFailure(projectionFirstReview, "TaskOperations should honor semantic projection before raw review fields");
assert(projectionFirstReview.reason.includes("already confirmed"), "projection-confirmed tasks should reject duplicate confirmation");
assert(projectionFirstReview.payload.reviewStatus === "confirmed", "duplicate confirmation payload should come from projection lifecycle status");

console.log("TaskOperations use-case tests passed");

function assertFailure(result: unknown, message: string): asserts result is FailureResult {
  assert(Boolean(result) && typeof result === "object" && (result as { success?: unknown }).success === false, message);
}
