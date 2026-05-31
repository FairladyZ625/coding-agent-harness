import {
  beginGovernanceSync,
  commitGovernanceSync,
  governanceRelativePaths,
  releaseGovernanceSync,
} from "../../lib/governance-sync.mjs";

type GovernanceChange = {
  destination: string;
  action: string;
  surface: string;
};

type ModuleGovernanceTarget = {
  projectRoot: string;
};

export function moduleGovernanceRelativePaths(changes: GovernanceChange[]): string[] {
  return governanceRelativePaths(changes);
}

export function commitModuleGovernance(
  target: ModuleGovernanceTarget,
  changes: GovernanceChange[],
  {
    operation,
    dryRun,
    message,
    allowDirtyWriteScope = false,
  }: { operation: string; dryRun: boolean; message: string; allowDirtyWriteScope?: boolean },
) {
  const allowedRelativePaths = governanceRelativePaths(changes);
  const context = beginGovernanceSync(target, {
    operation,
    dryRun,
    allowDirtyWorktree: true,
    allowedRelativePaths,
    allowDirtyWriteScope,
  });
  try {
    return commitGovernanceSync(context, allowedRelativePaths, { message });
  } finally {
    releaseGovernanceSync(context);
  }
}

export function runModuleGovernanceTransaction<TResult extends { changes: GovernanceChange[] }>(
  target: ModuleGovernanceTarget,
  plannedChanges: GovernanceChange[],
  {
    operation,
    dryRun,
    message,
    allowDirtyWriteScope = false,
    run,
  }: {
    operation: string;
    dryRun: boolean;
    message: string;
    allowDirtyWriteScope?: boolean;
    run: () => TResult;
  },
): TResult & { governance: { commit: ReturnType<typeof commitGovernanceSync> } } {
  const context = beginGovernanceSync(target, {
    operation,
    dryRun,
    allowDirtyWorktree: true,
    allowedRelativePaths: governanceRelativePaths(plannedChanges),
    allowDirtyWriteScope,
  });
  try {
    const result = run();
    const commit = commitGovernanceSync(context, governanceRelativePaths(result.changes), { message });
    return { ...result, governance: { commit } };
  } finally {
    releaseGovernanceSync(context);
  }
}
