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
  module: "governance",
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
assert(needsMaterialReview.dashboardTaskView.swimlane.visible === true, "active material review tasks should be visible in the dashboard swimlane projection");
assert(needsMaterialReview.dashboardTaskView.swimlane.rowKey === "governance", "swimlane row should come from task module ownership");
assert(needsMaterialReview.dashboardTaskView.swimlane.columnKey === "missing-materials", "swimlane column should come from the dashboard view projection, not raw lifecycle state");
assert(needsMaterialReview.dashboardTaskView.swimlane.columnLabelKey === "queueMissingMaterials", "swimlane column should expose an i18n label key");
assert(needsMaterialReview.dashboardTaskView.swimlaneStage === "missing-materials", "legacy swimlaneStage should alias the dashboard swimlane column key during migration");
assert(needsMaterialReview.dashboardTaskView.materials.briefReady === true, "standalone or unspecified briefs should be material-ready by default");
assert(needsMaterialReview.dashboardTaskView.materials.visualMapReady === true, "non-missing visual map status should be material-ready");
assert(needsMaterialReview.dashboardTaskView.materials.blockingReasonCodes.includes("missing-lesson-decision"), "material projection should expose blocking reason codes");
assert(needsMaterialReview.reviewWorkbenchQueueView.reasonCodes.includes("missing-lesson-decision"), "review workbench projection should expose queue reason codes");
assert(needsMaterialReview.reviewWorkbenchQueueView.reasonSummaries[0]?.message === "Lesson decision required.", "review workbench projection should expose queue reason summaries for UI display");

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
assert(readyToConfirm.dashboardTaskView.swimlane.columnKey === "review", "ready review tasks should project to the review swimlane column");

const agentReviewedPlanned = buildTaskSemanticProjection({
  state: "not_started",
  lifecycleState: "ready",
  reviewStatus: "agent-reviewed",
  reviewQueueState: "not-in-queue",
  closeoutStatus: "missing",
  budget: "standard",
  completion: 0,
  taskQueues: ["active"],
  materialsReady: true,
  reviewSubmitted: false,
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(agentReviewedPlanned.reviewWorkbenchQueueView.primaryQueue === "active", "agent-reviewed tasks outside the review queue should stay in the active queue");
assert(agentReviewedPlanned.reviewWorkbenchQueueView.humanConfirmable === false, "agent-reviewed evidence alone must not make a task human-confirmable");
assert(agentReviewedPlanned.dashboardTaskView.swimlane.columnKey === "active", "agent-reviewed evidence alone must not project a not-started task into the review swimlane column");

const agentReviewedUnknown = buildTaskSemanticProjection({
  state: "unknown",
  lifecycleState: "unknown",
  reviewStatus: "agent-reviewed",
  reviewQueueState: "not-in-queue",
  closeoutStatus: "missing",
  budget: "standard",
  completion: 0,
  taskQueues: ["active"],
  materialsReady: true,
  reviewSubmitted: false,
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(agentReviewedUnknown.dashboardTaskView.visibleInSwimlane === false, "agent-reviewed evidence alone must not make unknown lifecycle tasks visible in the active swimlane");
assert(agentReviewedUnknown.dashboardTaskView.swimlane.visible === false, "unknown agent-reviewed evidence should be hidden by the swimlane projection");

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
assert(confirmedLessonWork.dashboardTaskView.swimlane.columnKey === "lessons", "confirmed tasks with lesson work should project into the lessons swimlane column");

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
