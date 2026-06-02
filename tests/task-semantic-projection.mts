#!/usr/bin/env node

import { buildTaskSemanticProjection } from "../scripts/lib/task-semantic-projection.mjs";
import { deriveLifecycleState } from "../scripts/lib/task-review-model.mjs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const gitBackedReviewConfirmation = {
  confirmed: true,
  confirmationId: "HRC-202606020900",
  confirmedAt: "2026-06-02 09:00",
  reviewer: "Human Reviewer",
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  gitAudit: { valid: true },
};

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

assert(agentReviewedPlanned.reviewWorkbenchQueueView.humanConfirmable === false, "agent-reviewed evidence alone must not make a task human-confirmable");
assert(agentReviewedPlanned.reviewWorkbenchQueueView.primaryQueue === "planned", "not-started tasks must not be projected as active work");
assert(agentReviewedPlanned.reviewWorkbenchQueueView.inQueue === false, "planned tasks must not enter review workbench queues");
assert(agentReviewedPlanned.dashboardTaskView.swimlane.columnKey === "planned", "agent-reviewed evidence alone must not project a not-started task into the active or review swimlane column");

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
  lifecycleState: "finalized",
  reviewStatus: "confirmed",
  reviewQueueState: "not-in-queue",
  closeoutStatus: "missing",
  budget: "standard",
  completion: 100,
  taskQueues: ["finalized", "lessons"],
  reviewConfirmation: gitBackedReviewConfirmation,
  materialsReady: true,
  reviewSubmitted: true,
  lessonCandidateStatus: "needs-promotion",
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(confirmedLessonWork.reviewWorkbenchQueueView.hasPendingLessonWork === true, "lesson queue should project pending lesson work");
assert(confirmedLessonWork.reviewWorkbenchQueueView.finalized === true, "confirmed tasks with lesson work should still be terminal finalized work");
assert(confirmedLessonWork.reviewWorkbenchQueueView.readyForCloseout === false, "confirmed tasks should not require a separate closeout action");
assert(confirmedLessonWork.dashboardTaskView.swimlane.columnKey === "lessons", "confirmed tasks with lesson work should project into the lessons swimlane column");

const closedHistorical = buildTaskSemanticProjection({
  state: "done",
  lifecycleState: "closed",
  reviewStatus: "required",
  reviewQueueState: "closed-debt",
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
assert(closedHistorical.reviewWorkbenchQueueView.finalized === false, "closed work without Git-backed confirmation must not project finalized review workbench state");
assert(closedHistorical.reviewWorkbenchQueueView.primaryQueue !== "finalized", "closed work with stale raw finalized queue must not remain in the finalized queue");
assert(!closedHistorical.reviewWorkbenchQueueView.queues.includes("finalized"), "stale raw finalized queue must be filtered when human review is not Git-backed confirmed");

const confirmedByAudit = buildTaskSemanticProjection({
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
  reviewConfirmation: gitBackedReviewConfirmation,
  lessonCandidateStatus: "no-candidate-accepted",
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(confirmedByAudit.reviewWorkbenchQueueView.confirmed === true, "native review confirmation audit should project confirmed workbench state");
assert(confirmedByAudit.reviewWorkbenchQueueView.finalized === true, "native review confirmation audit should project terminal finalized state");
assert(confirmedByAudit.reviewWorkbenchQueueView.readyForCloseout === false, "native review confirmation audit should not require a second closeout action");
assert(confirmedByAudit.reviewWorkbenchQueueView.primaryQueue === "finalized", "confirmed no-lesson tasks should not remain in the review or confirmed-finalization-pending queues");
assert(confirmedByAudit.dashboardTaskView.visibleInSwimlane === false, "confirmed no-lesson tasks should leave active swimlane views");

const nakedConfirmedBoolean = buildTaskSemanticProjection({
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
  reviewConfirmation: { confirmed: true },
  lessonCandidateStatus: "no-candidate-accepted",
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(nakedConfirmedBoolean.reviewWorkbenchQueueView.confirmed === false, "bare reviewConfirmation.confirmed must not count as Git-backed confirmation");
assert(nakedConfirmedBoolean.reviewWorkbenchQueueView.finalized === false, "bare reviewConfirmation.confirmed must not finalize active tasks");
assert(nakedConfirmedBoolean.reviewWorkbenchQueueView.primaryQueue === "review", "bare reviewConfirmation.confirmed should leave ready work in the review queue");

const staleRawConfirmedStatus = buildTaskSemanticProjection({
  state: "review",
  lifecycleState: "finalized",
  reviewStatus: "confirmed",
  reviewQueueState: "not-in-queue",
  closeoutStatus: "missing",
  budget: "standard",
  completion: 100,
  taskQueues: ["finalized"],
  materialsReady: true,
  reviewSubmitted: true,
  reviewConfirmation: { confirmed: true },
  lessonCandidateDecisionComplete: true,
  deletionState: "active",
});

assert(staleRawConfirmedStatus.taskLifecycleProjection.reviewStatus !== "confirmed", "projected lifecycle reviewStatus must not preserve raw confirmed status without Git audit");
assert(staleRawConfirmedStatus.reviewWorkbenchQueueView.confirmed === false, "stale raw confirmed status must not project confirmed workbench state");
assert(staleRawConfirmedStatus.reviewWorkbenchQueueView.finalized === false, "stale raw confirmed status must not project finalized workbench state");
assert(!staleRawConfirmedStatus.reviewWorkbenchQueueView.queues.includes("finalized"), "stale raw confirmed status must not keep raw finalized queue");

const archivedConfirmedTombstone = buildTaskSemanticProjection({
  state: "done",
  lifecycleState: "closed",
  reviewStatus: "confirmed",
  reviewQueueState: "not-in-queue",
  closeoutStatus: "closed",
  budget: "standard",
  completion: 100,
  taskQueues: ["soft-deleted-superseded"],
  materialsReady: true,
  reviewSubmitted: true,
  reviewConfirmation: gitBackedReviewConfirmation,
  lessonCandidateDecisionComplete: true,
  deletionState: "archived",
});

assert(archivedConfirmedTombstone.reviewWorkbenchQueueView.primaryQueue === "soft-deleted-superseded", "archived tombstones must stay in archive history queue even when review was confirmed");
assert(archivedConfirmedTombstone.reviewWorkbenchQueueView.finalized === false, "archived tombstones must not project finalized workbench state");
assert(!archivedConfirmedTombstone.reviewWorkbenchQueueView.queues.includes("finalized"), "archived tombstones must not carry finalized queue");

assert(
  deriveLifecycleState({
    state: "review",
    reviewStatus: "confirmed",
    closeoutStatus: "pending",
    budget: "standard",
    lessonCandidates: { status: "no-candidate-accepted" } as never,
    reviewConfirmation: gitBackedReviewConfirmation as never,
  }) === "finalized",
  "confirmed no-lesson tasks should derive a finalized lifecycle even when closeoutStatus is pending",
);
assert(
  deriveLifecycleState({
    state: "review",
    reviewStatus: "confirmed",
    closeoutStatus: "pending",
    budget: "standard",
    lessonCandidates: { status: "needs-promotion" } as never,
    reviewConfirmation: gitBackedReviewConfirmation as never,
  }) === "finalized",
  "confirmed tasks with pending lesson follow-up should still derive finalized lifecycle",
);

console.log("Task semantic projection tests passed");
