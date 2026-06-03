import { buildTaskSemanticProjection } from "./task-semantic-projection.mjs";
import type {
  TaskLocation,
  TaskOperationBlockingRisk,
  TaskOperationSemanticProjection,
  TaskOperationSubject,
  TaskTombstonePolicyFacts,
  TaskTombstoneSubject,
} from "../../lib/types/task-repository.js";

type TaskSubjectBudget = "simple" | "standard" | "complex";
type TaskSubjectQueueReason = {
  code?: string;
  queue?: string;
  message?: string;
  severity?: string;
};

export type TaskSubjectRecord = {
  id?: string;
  budget?: TaskSubjectBudget;
  lessonCandidateStatus?: string;
  lessonCandidatePromotionState?: string;
  repairPrompt?: string;
  queueReasons?: TaskSubjectQueueReason[];
  risks?: Array<{ id?: string; open?: unknown; blocksRelease?: unknown; severity?: unknown }>;
  state?: string;
  closeoutStatus?: string;
  reviewSubmitted?: boolean;
  reviewStatus?: string;
  reviewConfirmation?: Record<string, unknown> | null;
  materialsReady?: boolean;
  evidence?: unknown[];
  taskQueues?: string[];
  deletionState?: string;
  semanticProjection?: Partial<TaskOperationSemanticProjection>;
  taskLifecycleProjection?: TaskOperationSemanticProjection["taskLifecycleProjection"];
  reviewWorkbenchQueueView?: TaskOperationSemanticProjection["reviewWorkbenchQueueView"];
};

export function buildTaskOperationSubject(task: TaskSubjectRecord): TaskOperationSubject {
  return {
    id: String(task.id || ""),
    budget: String(task.budget || ""),
    lessonCandidateStatus: String(task.lessonCandidateStatus || ""),
    lessonCandidatePromotionState: String(task.lessonCandidatePromotionState || ""),
    repairPrompt: String(task.repairPrompt || ""),
    queueReasons: Array.isArray(task.queueReasons) ? task.queueReasons : [],
    blockingReviewRisks: taskOperationBlockingReviewRisks(task),
    semanticProjection: taskOperationSemanticProjection(task),
  };
}

export function buildTaskTombstoneSubject(
  task: TaskSubjectRecord,
  { location, paths }: { location: TaskLocation; paths: TaskTombstoneSubject["paths"] },
): TaskTombstoneSubject {
  return {
    id: String(task.id || location.id),
    location,
    paths,
    policy: taskTombstonePolicyFacts(task),
  };
}

function taskTombstonePolicyFacts(task: TaskSubjectRecord): TaskTombstonePolicyFacts {
  return {
    state: task.state,
    budget: task.budget,
    closeoutStatus: task.closeoutStatus,
    reviewSubmitted: task.reviewSubmitted,
    reviewStatus: task.reviewStatus,
    reviewConfirmation: normalizeReviewConfirmation(task.reviewConfirmation),
    materialsReady: task.materialsReady,
    evidence: task.evidence,
    taskQueues: task.taskQueues,
    risks: task.risks,
    deletionState: task.deletionState,
  };
}

function taskOperationSemanticProjection(task: TaskSubjectRecord): TaskOperationSemanticProjection {
  const semanticProjection = task.semanticProjection;
  const taskLifecycleProjection = semanticProjection?.taskLifecycleProjection || task.taskLifecycleProjection;
  const reviewWorkbenchQueueView = semanticProjection?.reviewWorkbenchQueueView || task.reviewWorkbenchQueueView;
  if (taskLifecycleProjection && reviewWorkbenchQueueView) return { taskLifecycleProjection, reviewWorkbenchQueueView };
  const projection = buildTaskSemanticProjection(task);
  return {
    taskLifecycleProjection: projection.taskLifecycleProjection,
    reviewWorkbenchQueueView: projection.reviewWorkbenchQueueView,
  };
}

function taskOperationBlockingReviewRisks(task: TaskSubjectRecord): TaskOperationBlockingRisk[] {
  const risks = Array.isArray(task.risks) ? task.risks : [];
  return risks.filter((risk) => taskReviewBoolean(risk.open) !== "no" && (taskReviewBoolean(risk.blocksRelease) === "yes" || ["P0", "P1", "P2"].includes(String(risk.severity))));
}

function normalizeReviewConfirmation(value: unknown): TaskTombstonePolicyFacts["reviewConfirmation"] {
  if (!value || typeof value !== "object") return null;
  return value as TaskTombstonePolicyFacts["reviewConfirmation"];
}

function taskReviewBoolean(value: unknown): "yes" | "no" | "" {
  if (value === true) return "yes";
  if (value === false) return "no";
  const normalized = String(value || "").trim().toLowerCase();
  if (["yes", "y", "true", "open"].includes(normalized)) return "yes";
  if (["no", "n", "false", "closed"].includes(normalized)) return "no";
  return "";
}
