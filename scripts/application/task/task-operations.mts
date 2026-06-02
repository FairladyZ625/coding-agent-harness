import { normalizeTarget } from "../../lib/core-shared.mjs";
import { createTask, confirmTaskReview, updateTaskLifecycle } from "../../lib/task-lifecycle.mjs";
import { createLessonSedimentationTask } from "../../lib/task-lesson-sedimentation.mjs";
import { createTombstoneOperations } from "./tombstone-operations.mjs";
import type { TaskOperationSubject, TaskOperationSubjectReader, TombstoneSubjectReader } from "../../lib/types/task-repository.js";
import type { CreateTaskOptions, LifecycleUpdateOptions, ReviewConfirmOptions } from "../../lib/types/task-lifecycle.js";

type JsonPayload = Record<string, unknown>;
type OperationTask = TaskOperationSubject;

export type OperationSuccess<TData = unknown> = {
  success: true;
  status: 200;
  data: TData;
};

export type OperationFailure = {
  success: false;
  status: number;
  reason: string;
  payload: JsonPayload;
  code?: string;
  details?: unknown;
  recovery?: unknown[];
};

export type OperationResult<TData = unknown> = OperationSuccess<TData> | OperationFailure;

export type TaskOperationsOptions = {
  subjects?: TaskOperationSubjectReader;
  tombstoneSubjects?: TombstoneSubjectReader;
};

export type CreateTaskInput = CreateTaskOptions & {
  taskId: string;
  targetInput?: string;
};

export type LifecycleOperationInput = LifecycleUpdateOptions & {
  taskId: string;
};

export type ReviewOperationInput = ReviewConfirmOptions & {
  taskId: string;
};

export type DeleteTaskInput = {
  taskId: string;
  hard?: boolean;
  reason?: string;
  deletedBy?: string;
  confirm?: string;
  allowOpenFindings?: boolean;
};

export type ArchiveTaskInput = {
  taskId: string;
  reason?: string;
  archivedBy?: string;
  archiveFields?: Record<string, unknown>;
};

export type ArchiveTaskBatchInput = {
  release?: string;
  taskIds?: string[];
  reason?: string;
  archivedBy?: string;
  archiveFields?: Record<string, unknown>;
};

export type SupersedeTaskInput = {
  taskId: string;
  by?: string;
  reason?: string;
  deletedBy?: string;
  confirm?: string;
  allowOpenFindings?: boolean;
};

export type ReopenTaskInput = {
  taskId: string;
  reason?: string;
};

export type LessonSedimentInput = {
  taskId: string;
  candidateId: string;
  dryRun?: boolean;
  title?: string;
  deferCommit?: boolean;
  allowDirtyRelativePaths?: string[];
};

export type TaskOperations = {
  create(input: CreateTaskInput): OperationResult;
  updateLifecycle(input: LifecycleOperationInput): OperationResult;
  start(input: Omit<LifecycleOperationInput, "event" | "state">): OperationResult;
  review(input: Omit<LifecycleOperationInput, "event" | "state">): OperationResult;
  complete(input: Omit<LifecycleOperationInput, "event" | "state">): OperationResult;
  confirmReview(input: ReviewOperationInput): OperationResult;
  delete(input: DeleteTaskInput): OperationResult;
  archive(input: ArchiveTaskInput): OperationResult;
  archiveBatch(input: ArchiveTaskBatchInput): OperationResult;
  supersede(input: SupersedeTaskInput): OperationResult;
  reopen(input: ReopenTaskInput): OperationResult;
  lessonSediment(input: LessonSedimentInput): OperationResult;
};

export class TaskOperationError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  recovery?: unknown[];
  payload: JsonPayload;

  constructor(result: OperationFailure) {
    super(result.reason);
    this.name = "TaskOperationError";
    this.status = result.status;
    this.code = result.code;
    this.details = result.details;
    this.recovery = result.recovery;
    this.payload = result.payload;
  }
}

export function createTaskOperations(targetInput: string = ".", options: TaskOperationsOptions = {}): TaskOperations {
  const rawTargetInput = targetInput || ".";
  const target = normalizeTarget(rawTargetInput);
  const subjects = options.subjects;
  if (!subjects) throw new Error("TaskOperations requires a TaskOperationSubjectReader.");
  const targetRoot = target.projectRoot;
  const tombstoneSubjects = options.tombstoneSubjects || combinedTombstoneSubjectReader(subjects);
  if (!tombstoneSubjects) throw new Error("TaskOperations requires a TombstoneSubjectReader.");
  const tombstones = createTombstoneOperations(targetRoot, { subjects: tombstoneSubjects });

  return {
    create(input) {
      const { taskId, targetInput: createTargetInput, ...createOptions } = input;
      return runOperation(() => createTask(createTargetInput || rawTargetInput, taskId, createOptions));
    },
    updateLifecycle(input) {
      const { taskId, ...lifecycleOptions } = input;
      if (lifecycleOptions.event === "task-complete" || lifecycleOptions.state === "done") {
        return this.complete({ taskId, message: lifecycleOptions.message, evidence: lifecycleOptions.evidence });
      }
      return runOperation(() => updateTaskLifecycle(targetRoot, taskId, lifecycleOptions));
    },
    start(input) {
      return this.updateLifecycle({ ...input, event: "task-start", state: "in_progress" });
    },
    review(input) {
      return this.updateLifecycle({ ...input, event: "task-review", state: "review" });
    },
    complete(input) {
      const task = getOperationTask(subjects, input.taskId);
      if (!task.success) return task;
      const blocked = taskCompleteBlock(task.data);
      if (blocked) return blocked;
      return runOperation(() => updateTaskLifecycle(targetRoot, input.taskId, {
        event: "task-complete",
        state: "done",
        message: input.message,
        evidence: input.evidence,
      }));
    },
    confirmReview(input) {
      const task = getOperationTask(subjects, input.taskId);
      if (!task.success) return task;
      const blocked = reviewConfirmationBlock(task.data);
      if (blocked) return blocked;
      const { taskId, ...reviewOptions } = input;
      return runOperation(() => confirmTaskReview(targetRoot, taskId, reviewOptions));
    },
    delete(input) {
      return runOperation(() => tombstones.delete(input.taskId, {
        hard: input.hard === true,
        reason: input.reason || "",
        deletedBy: input.deletedBy || "",
        confirm: input.confirm || "",
        allowOpenFindings: input.allowOpenFindings === true,
      }));
    },
    archive(input) {
      return runOperation(() => tombstones.archive(input.taskId, {
        reason: input.reason || "",
        archivedBy: input.archivedBy || "",
        archiveFields: input.archiveFields || {},
      }));
    },
    archiveBatch(input) {
      return runOperation(() => tombstones.archiveBatch({
        release: input.release || "",
        taskIds: input.taskIds || [],
        reason: input.reason || "",
        archivedBy: input.archivedBy || "",
        archiveFields: input.archiveFields || {},
      }));
    },
    supersede(input) {
      return runOperation(() => tombstones.supersede(input.taskId, {
        by: input.by || "",
        reason: input.reason || "",
        deletedBy: input.deletedBy || "",
        confirm: input.confirm || "",
        allowOpenFindings: input.allowOpenFindings === true,
      }));
    },
    reopen(input) {
      return runOperation(() => tombstones.reopen(input.taskId, {
        reason: input.reason || "",
      }));
    },
    lessonSediment(input) {
      const task = getOperationTask(subjects, input.taskId);
      if (!task.success) return task;
      if (!String(input.candidateId || "").trim()) return failure("Missing lesson candidate id", { status: 400 });
      return runOperation(() => createLessonSedimentationTask(targetRoot, input.taskId, input.candidateId, {
        dryRun: input.dryRun === true,
        title: input.title || "",
        deferCommit: input.deferCommit === true,
        allowDirtyRelativePaths: input.allowDirtyRelativePaths || [],
      }));
    },
  };
}

function combinedTombstoneSubjectReader(subjects: TaskOperationSubjectReader): TombstoneSubjectReader | null {
  if ("getTombstoneSubject" in subjects && typeof subjects.getTombstoneSubject === "function") return subjects as TaskOperationSubjectReader & TombstoneSubjectReader;
  return null;
}

export function unwrapTaskOperation<TData>(result: OperationResult<TData>): TData {
  if (result.success) return result.data;
  throw new TaskOperationError(result);
}

export function taskOperationFailurePayload(result: OperationFailure): JsonPayload {
  return result.payload;
}

function runOperation<TData>(operation: () => TData): OperationResult<TData> {
  try {
    return { success: true, status: 200, data: operation() };
  } catch (error) {
    return failureFromError(error);
  }
}

function getOperationTask(subjects: TaskOperationSubjectReader, taskId: string): OperationResult<OperationTask> {
  if (!String(taskId || "").trim()) return failure("Missing task id", { status: 400 });
  try {
    return { success: true, status: 200, data: subjects.getOperationSubject({ id: taskId }) };
  } catch (error) {
    const reason = errorMessage(error);
    return failure(reason, { status: reason.startsWith("Task not found") ? 404 : 400 });
  }
}

function reviewConfirmationBlock(task: OperationTask): OperationFailure | null {
  const projection = taskOperationProjection(task);
  const lifecycle = projection.taskLifecycleProjection;
  const reviewView = projection.reviewWorkbenchQueueView;
  if (reviewView.confirmed) {
    return failure("Review is already confirmed.", { status: 409, payload: { reviewStatus: lifecycle.reviewStatus || "confirmed", taskId: task.id || "" } });
  }
  if (!reviewView.humanConfirmable) {
    return failure("Review completion is only available for tasks in the review queue.", {
      status: 409,
      payload: {
        reviewQueueState: lifecycle.reviewQueueState || "unknown",
        taskQueues: reviewView.queues,
        queueReasons: task.queueReasons,
        repairPrompt: task.repairPrompt || "",
        reviewStatus: lifecycle.reviewStatus || "unknown",
        taskId: task.id || "",
      },
    });
  }
  return null;
}

function taskCompleteBlock(task: OperationTask): OperationFailure | null {
  const projection = taskOperationProjection(task);
  const lifecycle = projection.taskLifecycleProjection;
  const reviewView = projection.reviewWorkbenchQueueView;
  const budget = String(task.budget || "");
  const state = lifecycle.state || "unknown";
  if (budget === "simple") return null;
  if (reviewView.hasPendingLessonWork) {
    return closeoutFailure(task, "Lesson candidate promotion or sedimentation work must be resolved before closeout.");
  }
  if (budget !== "simple" && state !== "review") {
    return closeoutFailure(task, `task-complete for ${budget || "standard"} tasks requires current state review. Run task-review first.`);
  }
  const blockingRisks = task.blockingReviewRisks;
  if (blockingRisks.length > 0) {
    const ids = blockingRisks.map((risk) => risk.id || risk.severity || "blocking-risk").join(", ");
    return closeoutFailure(task, `Open blocking review findings must be closed before task-complete: ${ids}`);
  }
  if (!reviewView.confirmed) {
    return closeoutFailure(task, "Human review must be confirmed before task-complete. Confirm it from the local Dashboard workbench first.");
  }
  if (lifecycle.closeoutStatus === "closed") {
    return closeoutFailure(task, "Task closeout is already closed.");
  }
  const lessonStatus = String(task.lessonCandidateStatus || "");
  if (budget !== "simple" && !["no-candidate-accepted", "promoted", "rejected"].includes(lessonStatus)) {
    return closeoutFailure(task, `Lesson candidate decision must be complete before task-complete; current status is ${lessonStatus || "missing"}.`);
  }
  return null;
}

function closeoutFailure(task: OperationTask, reason: string): OperationFailure {
  const projection = taskOperationProjection(task);
  const lifecycle = projection.taskLifecycleProjection;
  return failure(reason, {
    status: 409,
    payload: {
      closeoutStatus: lifecycle.closeoutStatus || "unknown",
      lifecycleState: lifecycle.lifecycleState || "unknown",
      reviewStatus: lifecycle.reviewStatus || "unknown",
      taskQueues: projection.reviewWorkbenchQueueView.queues,
      lessonCandidateStatus: task.lessonCandidateStatus || "unknown",
      lessonCandidatePromotionState: task.lessonCandidatePromotionState || "unknown",
      taskId: task.id || "",
    },
  });
}

function failureFromError(error: unknown): OperationFailure {
  const source = isRecord(error) ? error : {};
  return failure(errorMessage(error), {
    status: typeof source.status === "number" ? source.status : 400,
    code: typeof source.code === "string" ? source.code : undefined,
    details: source.details,
    recovery: Array.isArray(source.recovery) ? source.recovery : undefined,
  });
}

function failure(reason: string, { status = 400, code, details, recovery, payload = {} }: {
  status?: number;
  code?: string;
  details?: unknown;
  recovery?: unknown[];
  payload?: JsonPayload;
} = {}): OperationFailure {
  const nextPayload: JsonPayload = { error: reason, ...payload };
  if (code) nextPayload.code = code;
  if (details) nextPayload.details = details;
  if (recovery && recovery.length > 0) nextPayload.recovery = recovery;
  return { success: false, status, reason, payload: nextPayload, code, details, recovery };
}

function taskQueues(task: OperationTask): string[] {
  return taskOperationProjection(task).reviewWorkbenchQueueView.queues;
}

function taskOperationProjection(task: OperationTask): OperationTask["semanticProjection"] {
  return task.semanticProjection;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
