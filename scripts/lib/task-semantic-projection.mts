type TaskBudget = "simple" | "standard" | "complex";

type QueueReason = {
  code?: string;
  queue?: string;
  message?: string;
  severity?: string;
};

type TaskSemanticProjectionInput = {
  [key: string]: unknown;
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
  swimlaneStage: string;
  swimlane: DashboardTaskSwimlaneView;
  materials: DashboardTaskMaterialsView;
  needsEvidence: boolean;
  reasonCode: string;
  reasonMessage: string;
};

export type DashboardTaskSwimlaneView = {
  visible: boolean;
  rowKey: string;
  rowLabelKey: string;
  columnKey: string;
  columnLabelKey: string;
  tone: string;
  sortKey: string;
};

export type DashboardTaskMaterialsView = {
  briefReady: boolean;
  visualMapReady: boolean;
  evidenceReady: boolean;
  blockingReasonCodes: string[];
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
  reasonSummaries: QueueReason[];
};

export type TaskSemanticProjection = {
  taskLifecycleProjection: TaskLifecycleProjection;
  dashboardTaskView: DashboardTaskView;
  reviewWorkbenchQueueView: ReviewWorkbenchQueueView;
};

const swimlaneColumnLabelKeys: Record<string, string> = {
  active: "active",
  "missing-materials": "queueMissingMaterials",
  blocked: "queueBlocked",
  review: "queueReview",
  lessons: "queueLessons",
  confirmed: "state_confirmed",
  "confirmed-finalization-pending": "state_confirmed-finalization-pending",
  finalized: "state_finalized",
  "soft-deleted-superseded": "queueSoftDeletedSuperseded",
};

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
  const reason = firstQueueReason(task);
  const visible = taskVisibleInSwimlane(task, lifecycle, reviewWorkbenchQueueView);
  const materials = buildDashboardTaskMaterialsView(task, needsEvidence);
  const swimlane = buildDashboardTaskSwimlaneView(task, visible, reviewWorkbenchQueueView);
  return {
    visibleInSwimlane: visible,
    swimlaneStage: swimlane.columnKey,
    swimlane,
    materials,
    needsEvidence,
    reasonCode: reason.code || reason.queue || (needsEvidence ? "needs-evidence" : lifecycle.reviewQueueState === "ready-to-confirm" ? "ready-to-confirm" : lifecycle.closeoutStatus === "missing" ? "needs-closeout" : ""),
    reasonMessage: reason.message || "",
  };
}

function buildDashboardTaskMaterialsView(task: TaskSemanticProjectionInput, needsEvidence = taskNeedsEvidence(task)): DashboardTaskMaterialsView {
  const visualMapStatus = stringValue(task.visualMapStatus, "present");
  const briefSource = stringValue(task.briefSource, "standalone");
  const briefReady = !briefSource || briefSource === "standalone";
  const visualMapReady = !["missing", "legacy-only"].includes(visualMapStatus);
  const phaseEvidenceReady = !(task.phases || []).some((phase) => ["missing", "partial"].includes(stringValue(phase.evidenceStatus, "")));
  return {
    briefReady,
    visualMapReady,
    evidenceReady: !needsEvidence && phaseEvidenceReady,
    blockingReasonCodes: (task.queueReasons || []).map((reason) => stringValue(reason.code || reason.queue, "")).filter(Boolean),
  };
}

function buildDashboardTaskSwimlaneView(
  task: TaskSemanticProjectionInput,
  visible: boolean,
  reviewWorkbenchQueueView: ReviewWorkbenchQueueView,
): DashboardTaskSwimlaneView {
  const taskRecord = task as Record<string, unknown>;
  const rowKey = stringValue(taskRecord.module || taskRecord.inferredModule, "legacy-unclassified");
  const columnKey = reviewWorkbenchQueueView.primaryQueue || "active";
  return {
    visible,
    rowKey,
    rowLabelKey: rowKey === "base" ? "baseModule" : rowKey === "legacy-unclassified" ? "unclassifiedModule" : "",
    columnKey,
    columnLabelKey: swimlaneColumnLabelKeys[columnKey] || `state_${columnKey}`,
    tone: swimlaneTone(columnKey),
    sortKey: stringValue(taskRecord.shortId || taskRecord.id || taskRecord.path || taskRecord.title, ""),
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
  const reasonSummaries = normalizedQueueReasons(task);
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
    reasonCodes: reasonSummaries.map((reason) => stringValue(reason.code || reason.queue, "")).filter(Boolean),
    reasonSummaries,
  };
}

function normalizedTaskQueues(task: TaskSemanticProjectionInput): string[] {
  const queues = Array.isArray(task.taskQueues) ? task.taskQueues.map((queue) => stringValue(queue, "")).filter(Boolean) : [];
  return queues.length ? [...new Set(queues)] : ["active"];
}

function normalizedQueueReasons(task: TaskSemanticProjectionInput): QueueReason[] {
  if (!Array.isArray(task.queueReasons)) return [];
  return task.queueReasons
    .filter((reason) => reason && typeof reason === "object")
    .map((reason) => ({
      code: stringValue(reason.code, ""),
      queue: stringValue(reason.queue, ""),
      message: stringValue(reason.message, ""),
      severity: stringValue(reason.severity, ""),
    }))
    .filter((reason) => reason.code || reason.queue || reason.message || reason.severity);
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
    || ["confirmed", "blocked-open-findings"].includes(lifecycle.reviewStatus);
}

function taskNeedsEvidence(task: TaskSemanticProjectionInput): boolean {
  if (["missing", "legacy-only"].includes(stringValue(task.visualMapStatus, ""))) return true;
  if (task.briefSource && task.briefSource !== "standalone") return true;
  return (task.phases || []).some((phase) => ["missing", "partial"].includes(stringValue(phase.evidenceStatus, "")));
}

function swimlaneTone(columnKey: string): string {
  if (["blocked"].includes(columnKey)) return "fail";
  if (["missing-materials", "active"].includes(columnKey)) return "warn";
  if (["review", "lessons", "confirmed", "confirmed-finalization-pending", "finalized"].includes(columnKey)) return "pass";
  return "muted";
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
