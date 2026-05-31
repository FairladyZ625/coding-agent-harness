import {
  beginGovernanceSync,
  commitGovernanceSync,
  releaseGovernanceSync,
} from "../../lib/governance-sync.mjs";
import { finalizeDeferredTaskReviewConfirmation } from "../../lib/task-lifecycle.mjs";

type WorkbenchTarget = {
  projectRoot: string;
};

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

function uniqueValues(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
