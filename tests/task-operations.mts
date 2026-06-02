#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createTaskOperations } from "../scripts/application/task/task-operations.mjs";
import {
  createScannerTaskOperationSubjectReader,
  createScannerTaskTombstoneSubjectReader,
} from "../scripts/adapters/cli/task-operation-subject-reader.mjs";
import { createScannerTaskRepository } from "../scripts/lib/task-repository.mjs";
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

let missingSubjectsError = "";
try {
  createTaskOperations(target);
} catch (error) {
  missingSubjectsError = error instanceof Error ? error.message : String(error);
}
assert(missingSubjectsError.includes("TaskOperations requires a TaskOperationSubjectReader"), "TaskOperations should fail fast instead of creating a scanner-backed repository inside the application module");

const operations = createTaskOperations(target, {
  subjects: createScannerTaskOperationSubjectReader(target),
  tombstoneSubjects: createScannerTaskTombstoneSubjectReader(target),
});

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

const combinedReaderOperations = createTaskOperations(target, { subjects: createScannerTaskRepository(target) });
const combinedReaderComplete = combinedReaderOperations.complete({
  taskId: "demo-task",
  message: "try closeout through legacy combined reader",
});
assertFailure(combinedReaderComplete, "combined TaskRepository readers should remain compatible with TaskOperations construction");
assert(combinedReaderComplete.reason.includes("task-review"), "combined reader closeout rejection should preserve TaskOperations semantics");

const ambiguousTarget = path.join(tmpRoot, "task-operations-ambiguous-target");
fs.cpSync(path.join(repoRoot, "examples/minimal-project"), ambiguousTarget, { recursive: true });
const sourceTaskDir = path.join(ambiguousTarget, "coding-agent-harness/planning/tasks/demo-task");
const moduleTaskDir = path.join(ambiguousTarget, "coding-agent-harness/planning/modules/auth/tasks/demo-task");
fs.mkdirSync(path.dirname(moduleTaskDir), { recursive: true });
fs.cpSync(sourceTaskDir, moduleTaskDir, { recursive: true });
const ambiguousResult = createTaskOperations(ambiguousTarget, {
  subjects: createScannerTaskOperationSubjectReader(ambiguousTarget),
  tombstoneSubjects: createScannerTaskTombstoneSubjectReader(ambiguousTarget),
}).complete({
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
  subjects: {
    getOperationSubject: () => ({
      id: "projection-queue-task",
      budget: "standard",
      lessonCandidateStatus: "no-candidate-accepted",
      lessonCandidatePromotionState: "not-promoted",
      queueReasons: [],
      repairPrompt: "",
      blockingReviewRisks: [],
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
    }),
  },
  tombstoneSubjects: { getTombstoneSubject: () => { throw new Error("not used"); } },
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
  subjects: {
    getOperationSubject: () => ({
      id: "projection-first-task",
      budget: "standard",
      lessonCandidateStatus: "no-candidate-accepted",
      lessonCandidatePromotionState: "not-promoted",
      queueReasons: [],
      repairPrompt: "",
      blockingReviewRisks: [],
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
    }),
  },
  tombstoneSubjects: { getTombstoneSubject: () => { throw new Error("not used"); } },
});

const projectionFirstReview = projectionFirstOperations.confirmReview({
  taskId: "projection-first-task",
  confirmText: "projection-first-task",
  reviewer: "Human Reviewer",
});
assertFailure(projectionFirstReview, "TaskOperations should honor semantic projection before raw review fields");
assert(projectionFirstReview.reason.includes("already confirmed"), "projection-confirmed tasks should reject duplicate confirmation");
assert(projectionFirstReview.payload.reviewStatus === "confirmed", "duplicate confirmation payload should come from projection lifecycle status");

const blockingRiskOperations = createTaskOperations(target, {
  subjects: {
    getOperationSubject: () => operationSubjectFixture({
      id: "blocking-risk-task",
      blockingReviewRisks: [{ id: "risk-1", open: "yes", blocksRelease: "yes" }],
    }),
  },
  tombstoneSubjects: { getTombstoneSubject: () => { throw new Error("not used"); } },
});
const blockingRiskComplete = blockingRiskOperations.complete({
  taskId: "blocking-risk-task",
  message: "try closeout with open blocking risk",
});
assertFailure(blockingRiskComplete, "TaskOperations should reject closeout when operation subject exposes blocking review risks");
assert(blockingRiskComplete.reason.includes("risk-1"), "blocking review risk rejection should name the blocking risk id");

const pendingLessonOperations = createTaskOperations(target, {
  subjects: {
    getOperationSubject: () => operationSubjectFixture({
      id: "pending-lesson-task",
      lessonCandidateStatus: "needs-promotion",
      lessonCandidatePromotionState: "queued",
      hasPendingLessonWork: true,
      queues: ["lessons"],
    }),
  },
  tombstoneSubjects: { getTombstoneSubject: () => { throw new Error("not used"); } },
});
const pendingLessonComplete = pendingLessonOperations.complete({
  taskId: "pending-lesson-task",
  message: "try closeout with pending lesson work",
});
assertFailure(pendingLessonComplete, "TaskOperations should reject closeout when projected workbench view has pending lesson work");
assert(pendingLessonComplete.reason.includes("Lesson candidate promotion"), "pending lesson rejection should preserve lesson-work guidance");

console.log("TaskOperations use-case tests passed");

function assertFailure(result: unknown, message: string): asserts result is FailureResult {
  assert(Boolean(result) && typeof result === "object" && (result as { success?: unknown }).success === false, message);
}

function operationSubjectFixture({
  id,
  blockingReviewRisks = [],
  lessonCandidateStatus = "no-candidate-accepted",
  lessonCandidatePromotionState = "not-promoted",
  hasPendingLessonWork = false,
  queues = ["review"],
}: {
  id: string;
  blockingReviewRisks?: Array<{ id?: string; open?: unknown; blocksRelease?: unknown; severity?: unknown }>;
  lessonCandidateStatus?: string;
  lessonCandidatePromotionState?: string;
  hasPendingLessonWork?: boolean;
  queues?: string[];
}) {
  return {
    id,
    budget: "standard",
    lessonCandidateStatus,
    lessonCandidatePromotionState,
    queueReasons: [],
    repairPrompt: "",
    blockingReviewRisks,
    semanticProjection: {
      taskLifecycleProjection: {
        state: "review",
        lifecycleState: "in_review",
        reviewStatus: "confirmed",
        reviewQueueState: "not-in-queue",
        closeoutStatus: "missing",
        taskQueues: queues,
        materialsReady: true,
        reviewSubmitted: true,
        lessonCandidateDecisionComplete: lessonCandidateStatus === "no-candidate-accepted",
        deletionState: "active",
      },
      reviewWorkbenchQueueView: {
        queues,
        primaryQueue: queues[0] || "review",
        inQueue: queues.includes("review"),
        humanConfirmable: false,
        blocked: false,
        needsMaterials: false,
        confirmed: true,
        finalized: false,
        hasPendingLessonWork,
        readyForCloseout: !hasPendingLessonWork,
        reasonCodes: [],
        reasonSummaries: [],
      },
    },
  };
}
