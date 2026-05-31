#!/usr/bin/env node

import { buildTaskSemanticProjection } from "../scripts/lib/task-semantic-projection.mjs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const needsMaterialReview = buildTaskSemanticProjection({
  state: "review",
  lifecycleState: "in_review",
  reviewStatus: "agent-reviewed",
  reviewQueueState: "needs-material",
  closeoutStatus: "missing",
  budget: "standard",
  completion: 100,
  taskQueues: ["missing-materials"],
  queueReasons: [{ code: "missing-lesson-decision", queue: "missing-materials", message: "Lesson decision required." }],
  materialsReady: false,
  reviewSubmitted: true,
  lessonCandidateDecisionComplete: false,
  deletionState: "active",
});

assert(needsMaterialReview.taskLifecycleProjection.reviewQueueState === "needs-material", "projection should preserve scanner review queue state");
assert(needsMaterialReview.reviewWorkbenchQueueView.inQueue === true, "needs-material review tasks should still appear in review workbench queues");
assert(needsMaterialReview.reviewWorkbenchQueueView.needsMaterials === true, "needs-material review tasks should project material debt");
assert(needsMaterialReview.reviewWorkbenchQueueView.primaryQueue === "missing-materials", "material debt should route to the missing-materials queue first");
assert(needsMaterialReview.reviewWorkbenchQueueView.humanConfirmable === false, "needs-material review tasks must not be human-confirmable");
assert(needsMaterialReview.reviewWorkbenchQueueView.queues.includes("review") === false, "needs-material review tasks must not be inferred into the review queue");
assert(needsMaterialReview.dashboardTaskView.swimlaneStage === "review", "state=review remains a review-stage dashboard card, not a confirmable queue");

const readyToConfirm = buildTaskSemanticProjection({
  state: "review",
  lifecycleState: "in_review",
  reviewStatus: "agent-reviewed",
  reviewQueueState: "ready-to-confirm",
  closeoutStatus: "missing",
  budget: "standard",
  completion: 100,
  taskQueues: ["review"],
  materialsReady: true,
  reviewSubmitted: true,
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(readyToConfirm.reviewWorkbenchQueueView.primaryQueue === "review", "ready review tasks should route to review queue");
assert(readyToConfirm.reviewWorkbenchQueueView.humanConfirmable === true, "ready review tasks should be human-confirmable");
assert(readyToConfirm.dashboardTaskView.visibleInSwimlane === true, "ready review tasks should stay visible in dashboard swimlane");

const confirmedLessonWork = buildTaskSemanticProjection({
  state: "review",
  lifecycleState: "lesson-finalization-pending",
  reviewStatus: "confirmed",
  reviewQueueState: "confirmed",
  closeoutStatus: "missing",
  budget: "standard",
  completion: 100,
  taskQueues: ["lessons"],
  materialsReady: true,
  reviewSubmitted: true,
  lessonCandidateStatus: "needs-promotion",
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(confirmedLessonWork.reviewWorkbenchQueueView.hasPendingLessonWork === true, "lesson queue should project pending lesson work");
assert(confirmedLessonWork.reviewWorkbenchQueueView.readyForCloseout === false, "pending lesson work blocks closeout readiness");
assert(confirmedLessonWork.dashboardTaskView.swimlaneStage === "closeout", "confirmed tasks with lesson work should project into closeout stage");

const closedHistorical = buildTaskSemanticProjection({
  state: "done",
  lifecycleState: "closed",
  reviewStatus: "confirmed",
  reviewQueueState: "not-in-queue",
  closeoutStatus: "closed",
  budget: "standard",
  completion: 100,
  taskQueues: ["finalized"],
  materialsReady: true,
  reviewSubmitted: true,
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(closedHistorical.dashboardTaskView.visibleInSwimlane === false, "closed historical work should be hidden from active swimlane");
assert(closedHistorical.reviewWorkbenchQueueView.finalized === true, "closed work should project finalized review workbench state");

console.log("Task semantic projection tests passed");
