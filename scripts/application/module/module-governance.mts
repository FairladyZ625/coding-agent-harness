import {
  assertTransactionSucceeded,
  createGovernanceHarnessTransaction,
} from "../../lib/harness-transaction.mjs";

type GovernanceChange = {
  destination: string;
  action: string;
  surface: string;
};

type ModuleGovernanceTarget = {
  projectRoot: string;
};

export function moduleGovernanceRelativePaths(changes: GovernanceChange[]): string[] {
  return changes.map((change) => change.destination).filter(Boolean);
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
  const allowedRelativePaths = moduleGovernanceRelativePaths(changes);
  const transaction = createGovernanceHarnessTransaction(target);
  const plan = transaction.plan({
    operation,
    dryRun,
    allowedPaths: allowedRelativePaths,
    generatedSurfaces: changes.map((change) => ({ surface: change.surface, paths: [change.destination] })),
    commit: {
      message,
      allowDirtyWorktree: true,
      allowDirtyWriteScope,
    },
  });
  const result = transaction.apply(plan);
  assertTransactionSucceeded(result);
  return result.commit;
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
): TResult & { governance: { commit: ReturnType<typeof commitModuleGovernance> } } {
  const allowedRelativePaths = moduleGovernanceRelativePaths(plannedChanges);
  if (dryRun) {
    const result = run();
    return {
      ...result,
      governance: {
        commit: {
          committed: false,
          reason: "dry-run",
          allowedPaths: allowedRelativePaths,
        },
      },
    };
  }
  let operationResult: TResult | null = null;
  const transaction = createGovernanceHarnessTransaction(target);
  const plan = transaction.plan({
    operation,
    allowedPaths: allowedRelativePaths,
    generatedSurfaces: plannedChanges.map((change) => ({ surface: change.surface, paths: [change.destination] })),
    commit: {
      message,
      allowDirtyWorktree: true,
      allowDirtyWriteScope,
    },
  });
  const result = transaction.apply({
    ...plan,
    changeSet: {
      ...plan.changeSet,
      apply() {
        operationResult = run();
        return {
          allowedPaths: moduleGovernanceRelativePaths(operationResult.changes),
          generatedSurfaces: operationResult.changes.map((change) => ({ surface: change.surface, paths: [change.destination] })),
        };
      },
    },
  });
  assertTransactionSucceeded(result);
  const finalOperationResult = operationResult as TResult | null;
  if (!finalOperationResult) throw new Error(`Module governance transaction did not produce changes: ${operation}`);
  return { ...finalOperationResult, governance: { commit: result.commit } };
}
