import {
  buildWorkbenchTaskCache,
  bulkReviewConfirmationBlock,
  errorPayload,
  errorStatus,
  uniqueValues,
} from "../../application/workbench/review-confirmation.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  releaseGovernanceSync,
} from "../../lib/governance-sync.mjs";
import {
  confirmTaskReview,
  finalizeDeferredTaskReviewConfirmation,
} from "../../lib/task-lifecycle.mjs";
import type {
  WorkbenchBatchResult,
  WorkbenchReviewSubject,
  WorkbenchTarget,
} from "../../application/workbench/review-confirmation.mjs";

export function commitWorkbenchBatch(target: WorkbenchTarget, allowedPaths: string[], { operation, message }: { operation: string; message: string }) {
  const paths = uniqueValues(allowedPaths || []);
  const context = beginGovernanceSync(target, {
    operation,
    allowDirtyWorktree: true,
    allowedRelativePaths: paths,
    allowDirtyWriteScope: true,
  });
  try {
    return commitGovernanceSync(context, paths, { message });
  } finally {
    releaseGovernanceSync(context);
  }
}

export function finalizeWorkbenchReviewConfirmation(target: WorkbenchTarget, taskId: string, { commitSha }: { commitSha?: string }) {
  if (!commitSha) return;
  finalizeDeferredTaskReviewConfirmation(target.projectRoot, taskId, { commitSha });
}

export function confirmWorkbenchReviewBatch(
  target: WorkbenchTarget,
  subjects: WorkbenchReviewSubject[],
  taskIds: string[],
  { reviewer = "Human Reviewer", message = "bulk confirmed from dashboard workbench", evidence = "" }: { reviewer?: string; message?: string; evidence?: string } = {},
) {
  const taskCache = buildWorkbenchTaskCache(subjects);
  const results: WorkbenchBatchResult[] = [];
  for (const taskId of taskIds) {
    const subject = taskCache.byId.get(String(taskId || ""));
    const block = subject ? bulkReviewConfirmationBlock(subject) : { status: 404, reason: `Task not found: ${taskId}`, payload: { taskId } };
    if (!subject || block) {
      results.push({ taskId, ok: false, status: block?.status || 404, error: block?.reason || `Task not found: ${taskId}`, payload: block?.payload || { taskId } });
      continue;
    }
    try {
      const payload = confirmTaskReview(target.projectRoot, subject.id, {
        reviewer,
        message,
        evidence,
        confirmText: subject.confirmText || taskId,
        deferCommit: true,
      }) as { audit?: WorkbenchBatchResult["audit"]; task?: { id?: string } };
      results.push({ taskId, ok: true, status: 200, audit: payload.audit, task: { id: payload.task?.id || subject.id || taskId } });
    } catch (error) {
      results.push({ taskId, ok: false, status: errorStatus(error), ...errorPayload(error) });
    }
  }
  const confirmed = results.filter((result) => result.ok).length;
  const failed = results.length - confirmed;
  if (confirmed > 0) {
    const allowedPaths = uniqueValues(results.filter((result) => result.ok).flatMap((result) => result.audit?.allowedPaths || []));
    const confirmCommit = commitWorkbenchBatch(target, allowedPaths, { operation: "review-complete-bulk", message: "chore: confirm selected reviews" });
    for (const result of results.filter((item) => item.ok)) {
      const subject = taskCache.byId.get(result.taskId);
      if (!subject) continue;
      finalizeWorkbenchReviewConfirmation(target, subject.id, { commitSha: confirmCommit.commitSha });
    }
    const auditCommit = commitWorkbenchBatch(target, allowedPaths, { operation: "review-complete-bulk-audit", message: "chore: record selected review confirmation audit" });
    for (const result of results.filter((item) => item.ok)) {
      result.audit = {
        ...result.audit,
        commitSha: confirmCommit.commitSha,
        auditCommitSha: auditCommit.commitSha,
        auditStatus: "committed",
        allowedPaths,
      };
    }
  }
  return { ok: failed === 0, confirmed, failed, results };
}
