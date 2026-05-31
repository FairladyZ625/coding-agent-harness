type TaskBudget = "simple" | "standard" | "complex";

type QueueReason = {
  code?: string;
  queue?: string;
  message?: string;
  severity?: string;
};

type TaskSemanticProjectionInput = {
  state?: string;
  lifecycleState?: string;
  reviewStatus?: string;
  reviewQueueState?: string;
  closeoutStatus?: string;
  budget?: TaskBudget;
  completion?: number;
  visualMapStatus?: string;
  briefSource?: string;
  phases?: Array<{ evidenceStatus?: string }>;
  taskQueues?: string[];
  queueReasons?: QueueReason[];
  materialsReady?: boolean;
  reviewSubmitted?: boolean;
  lessonCandidateStatus?: string;
  lessonCandidatePromotionState?: string;
  lessonCandidateDecisionComplete?: boolean;
  lessonCandidateRows?: Array<Record<string, unknown>>;
  walkthroughPath?: string;
  risks?: Array<{ severity?: string; open?: boolean; blocksRelease?: boolean }>;
  deletionState?: string;
};

export type TaskLifecycleProjection = {
  state: string;
  lifecycleState: string;
  reviewStatus: string;
  reviewQueueState: string;
  closeoutStatus: string;
  taskQueues: string[];
  materialsReady: boolean;
  reviewSubmitted: boolean;
  lessonCandidateDecisionComplete: boolean;
  deletionState: string;
};

export type DashboardTaskView = {
  visibleInSwimlane: boolean;
  swimlaneStage: "planned" | "in_progress" | "evidence" | "review" | "confirmed" | "closeout" | "blocked";
  needsEvidence: boolean;
  reasonCode: string;
  reasonMessage: string;
};

export type ReviewWorkbenchQueueView = {
  queues: string[];
  primaryQueue: string;
  inQueue: boolean;
  humanConfirmable: boolean;
  blocked: boolean;
  needsMaterials: boolean;
  confirmed: boolean;
  finalized: boolean;
  hasPendingLessonWork: boolean;
  readyForCloseout: boolean;
  reasonCodes: string[];
};

export type TaskSemanticProjection = {
  taskLifecycleProjection: TaskLifecycleProjection;
  dashboardTaskView: DashboardTaskView;
  reviewWorkbenchQueueView: ReviewWorkbenchQueueView;
};

const swimlaneStages = new Set(["planned", "in_progress", "evidence", "review", "confirmed", "closeout", "blocked"]);

export function buildTaskSemanticProjection(task: TaskSemanticProjectionInput): TaskSemanticProjection {
  const taskQueues = normalizedTaskQueues(task);
  const lifecycle = buildTaskLifecycleProjection(task, taskQueues);
  const reviewWorkbenchQueueView = buildReviewWorkbenchQueueView(task, lifecycle, taskQueues);
  const dashboardTaskView = buildDashboardTaskView(task, lifecycle, reviewWorkbenchQueueView);
  return {
    taskLifecycleProjection: lifecycle,
    dashboardTaskView,
    reviewWorkbenchQueueView,
  };
}

export function attachTaskSemanticProjection<T extends TaskSemanticProjectionInput>(task: T): T & TaskSemanticProjection & { semanticProjection: TaskSemanticProjection } {
  const semanticProjection = buildTaskSemanticProjection(task);
  return {
    ...task,
    semanticProjection,
    ...semanticProjection,
  };
}

export function buildTaskLifecycleProjection(task: TaskSemanticProjectionInput, taskQueues = normalizedTaskQueues(task)): TaskLifecycleProjection {
  return {
    state: stringValue(task.state, "unknown"),
    lifecycleState: stringValue(task.lifecycleState, "unknown"),
    reviewStatus: stringValue(task.reviewStatus, "missing"),
    reviewQueueState: stringValue(task.reviewQueueState, "not-in-queue"),
    closeoutStatus: stringValue(task.closeoutStatus, "missing"),
    taskQueues,
    materialsReady: task.materialsReady === true,
    reviewSubmitted: task.reviewSubmitted === true,
    lessonCandidateDecisionComplete: task.lessonCandidateDecisionComplete === true,
    deletionState: stringValue(task.deletionState, "active"),
  };
}

export function buildDashboardTaskView(
  task: TaskSemanticProjectionInput,
  lifecycle = buildTaskLifecycleProjection(task),
  reviewWorkbenchQueueView = buildReviewWorkbenchQueueView(task, lifecycle, lifecycle.taskQueues),
): DashboardTaskView {
  const needsEvidence = taskNeedsEvidence(task);
  const stage = taskSwimlaneStage(task, lifecycle, reviewWorkbenchQueueView, needsEvidence);
  const reason = firstQueueReason(task);
  return {
    visibleInSwimlane: taskVisibleInSwimlane(task, lifecycle, reviewWorkbenchQueueView),
    swimlaneStage: swimlaneStages.has(stage) ? stage as DashboardTaskView["swimlaneStage"] : "planned",
    needsEvidence,
    reasonCode: reason.code || reason.queue || (needsEvidence ? "needs-evidence" : lifecycle.reviewQueueState === "ready-to-confirm" ? "ready-to-confirm" : lifecycle.closeoutStatus === "missing" ? "needs-closeout" : ""),
    reasonMessage: reason.message || "",
  };
}

export function buildReviewWorkbenchQueueView(
  task: TaskSemanticProjectionInput,
  lifecycle = buildTaskLifecycleProjection(task),
  taskQueues = normalizedTaskQueues(task),
): ReviewWorkbenchQueueView {
  const hasPendingLessonWork = taskHasPendingLessonWork(task, taskQueues);
  const humanConfirmable = lifecycle.reviewQueueState === "ready-to-confirm" && taskQueues.includes("review");
  const readyForCloseout = lifecycle.reviewStatus === "confirmed" && lifecycle.closeoutStatus !== "closed" && !hasPendingLessonWork && ["no-candidate-accepted", "promoted", "rejected"].includes(stringValue(task.lessonCandidateStatus, ""));
  const primaryQueue = primaryReviewQueue(taskQueues);
  return {
    queues: taskQueues,
    primaryQueue,
    inQueue: lifecycle.reviewQueueState !== "not-in-queue" || taskQueues.some((queue) => queue !== "active"),
    humanConfirmable,
    blocked: lifecycle.reviewStatus === "blocked-open-findings" || taskQueues.includes("blocked") || blockingRiskCount(task) > 0,
    needsMaterials: lifecycle.reviewQueueState === "needs-material" || taskQueues.includes("missing-materials"),
    confirmed: lifecycle.reviewStatus === "confirmed" || taskQueues.includes("confirmed"),
    finalized: lifecycle.closeoutStatus === "closed" || taskQueues.includes("finalized"),
    hasPendingLessonWork,
    readyForCloseout,
    reasonCodes: (task.queueReasons || []).map((reason) => stringValue(reason.code || reason.queue, "")).filter(Boolean),
  };
}

function normalizedTaskQueues(task: TaskSemanticProjectionInput): string[] {
  const queues = Array.isArray(task.taskQueues) ? task.taskQueues.map((queue) => stringValue(queue, "")).filter(Boolean) : [];
  return queues.length ? [...new Set(queues)] : ["active"];
}

function primaryReviewQueue(queues: string[]): string {
  const order = ["blocked", "missing-materials", "review", "lessons", "confirmed", "confirmed-finalization-pending", "finalized", "soft-deleted-superseded", "active"];
  return order.find((queue) => queues.includes(queue)) || queues[0] || "active";
}

function taskVisibleInSwimlane(task: TaskSemanticProjectionInput, lifecycle: TaskLifecycleProjection, reviewView: ReviewWorkbenchQueueView): boolean {
  if (lifecycle.deletionState !== "active") return false;
  if (["done", "closed", "finalized"].includes(lifecycle.state)) return false;
  if (["closed", "finalized"].includes(lifecycle.closeoutStatus)) return false;
  if (clampCompletion(task.completion) >= 100 && !["review", "blocked", "reopened", "current-evidence"].includes(lifecycle.state)) return false;
  return ["active", "planned", "not_started", "in_progress", "review", "blocked", "reopened", "current-evidence"].includes(lifecycle.state)
    || reviewView.inQueue
    || ["agent-reviewed", "confirmed", "blocked-open-findings"].includes(lifecycle.reviewStatus);
}

function taskSwimlaneStage(task: TaskSemanticProjectionInput, lifecycle: TaskLifecycleProjection, reviewView: ReviewWorkbenchQueueView, needsEvidence: boolean): string {
  if (lifecycle.state === "blocked" || reviewView.blocked || lifecycle.reviewQueueState.includes("blocked")) return "blocked";
  if (reviewView.hasPendingLessonWork && lifecycle.reviewStatus === "confirmed") return "closeout";
  if (reviewView.readyForCloseout || (lifecycle.reviewStatus === "confirmed" && ["missing", "pending", "required", "closing"].includes(lifecycle.closeoutStatus))) return "closeout";
  if (lifecycle.reviewStatus === "confirmed") return "confirmed";
  if (lifecycle.state === "review" || lifecycle.reviewQueueState === "ready-to-confirm" || lifecycle.taskQueues.includes("review") || ["agent-reviewed", "in_review"].includes(lifecycle.reviewStatus)) return "review";
  if (["planned", "not_started"].includes(lifecycle.state)) return "planned";
  if (needsEvidence) return "evidence";
  if (["active", "in_progress", "reopened", "current-evidence"].includes(lifecycle.state)) return "in_progress";
  return "planned";
}

function taskNeedsEvidence(task: TaskSemanticProjectionInput): boolean {
  if (["missing", "legacy-only"].includes(stringValue(task.visualMapStatus, ""))) return true;
  if (task.briefSource && task.briefSource !== "standalone") return true;
  return (task.phases || []).some((phase) => ["missing", "partial"].includes(stringValue(phase.evidenceStatus, "")));
}

function taskHasPendingLessonWork(task: TaskSemanticProjectionInput, taskQueues: string[]): boolean {
  const candidates = Array.isArray(task.lessonCandidateRows) ? task.lessonCandidateRows : [];
  return taskQueues.includes("lessons")
    || task.lessonCandidateStatus === "needs-promotion"
    || task.lessonCandidatePromotionState === "queued"
    || candidates.some((candidate) => ["ready-for-review", "needs-promotion"].includes(stringValue(candidate.status, "")));
}

function firstQueueReason(task: TaskSemanticProjectionInput): QueueReason {
  const reasons = Array.isArray(task.queueReasons) ? task.queueReasons.filter(Boolean) : [];
  return reasons[0] || {};
}

function blockingRiskCount(task: TaskSemanticProjectionInput): number {
  return (task.risks || []).filter((risk) => /^P[0-2]$/i.test(risk.severity || "") && (risk.open || risk.blocksRelease)).length;
}

function clampCompletion(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(100, number));
}

function stringValue(value: unknown, fallback: string): string {
  const text = String(value || "").trim();
  return text || fallback;
}
