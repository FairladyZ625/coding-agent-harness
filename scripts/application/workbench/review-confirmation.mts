export type WorkbenchTarget = {
  projectRoot: string;
};

export type WorkbenchReviewSubject = {
  id: string;
  aliases: string[];
  confirmText: string;
  queueReasons?: unknown[];
  repairPrompt?: string;
  semanticProjection?: {
    taskLifecycleProjection?: {
      reviewQueueState?: string;
      reviewStatus?: string;
    };
    reviewWorkbenchQueueView?: {
      confirmed?: boolean;
      humanConfirmable?: boolean;
      queues?: string[];
    };
  };
};

export type WorkbenchBatchResult = {
  taskId: string;
  ok: boolean;
  status: number;
  audit?: {
    allowedPaths?: string[];
    commitSha?: string;
    auditCommitSha?: string;
    auditStatus?: string;
  };
  task?: {
    id: string;
  };
  [key: string]: unknown;
};

export type BulkReviewBlock = {
  status: number;
  reason: string;
  payload: Record<string, unknown>;
};

export function buildWorkbenchTaskCache(subjects: WorkbenchReviewSubject[]): { byId: Map<string, WorkbenchReviewSubject> } {
  const byId = new Map<string, WorkbenchReviewSubject>();
  for (const subject of subjects) {
    for (const id of subject.aliases || []) byId.set(id, subject);
  }
  return { byId };
}

export function bulkReviewConfirmationBlock(subject: WorkbenchReviewSubject): BulkReviewBlock | null {
  const lifecycle = subject.semanticProjection?.taskLifecycleProjection || {};
  const reviewView = subject.semanticProjection?.reviewWorkbenchQueueView || {};
  if (reviewView.confirmed) {
    return { status: 409, reason: "Review is already confirmed.", payload: { reviewStatus: lifecycle.reviewStatus || "confirmed", taskId: subject.id } };
  }
  if (!reviewView.humanConfirmable) {
    return {
      status: 409,
      reason: "Review completion is only available for tasks in the review queue.",
      payload: {
        reviewQueueState: lifecycle.reviewQueueState || "unknown",
        taskQueues: reviewView.queues || [],
        queueReasons: subject.queueReasons || [],
        repairPrompt: subject.repairPrompt || "",
        reviewStatus: lifecycle.reviewStatus || "unknown",
        taskId: subject.id,
      },
    };
  }
  return null;
}

export function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function errorStatus(error: unknown, fallback = 400): number {
  const status = (error as { status?: unknown })?.status;
  return typeof status === "number" ? status : fallback;
}

export function errorPayload(error: unknown): Record<string, unknown> {
  const message = error instanceof Error ? error.message : String(error || "Unknown error");
  const code = (error as { code?: unknown })?.code;
  const details = (error as { details?: unknown })?.details;
  const recovery = (error as { recovery?: unknown })?.recovery;
  return {
    error: message,
    ...(typeof code === "string" ? { code } : {}),
    ...(details && typeof details === "object" ? { details } : {}),
    ...(Array.isArray(recovery) ? { recovery } : {}),
  };
}
