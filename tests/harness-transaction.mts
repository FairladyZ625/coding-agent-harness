#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { createGovernanceHarnessTransaction, assertTransactionSucceeded } from "../scripts/lib/harness-transaction.mjs";
import { normalizeTarget } from "../scripts/lib/core-shared.mjs";
import {
  assert,
  expectJson,
  run,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

type TransactionCommit = {
  committed?: boolean;
  commitSha?: string;
  allowedPaths?: string[];
};

type NewTaskResponse = {
  task: {
    id: string;
    shortId?: string;
    path?: string;
  };
};

type ModuleStepResponse = {
  governance?: {
    commit?: {
      committed?: boolean;
      allowedPaths?: string[];
    };
  };
};

type LifecycleResponse = ModuleStepResponse;

const target = path.join(tmpRoot, "harness-transaction-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", target]);
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "test fixture baseline"]);

const transaction = createGovernanceHarnessTransaction(normalizeTarget(target));
const changeSet = {
  operation: "transaction-plan-apply",
  writes: [
    {
      path: "coding-agent-harness/planning/tasks/transaction-plan/task_plan.md",
      content: "# Transaction Plan\n",
      action: "create",
    },
    {
      path: "coding-agent-harness/governance/generated/transaction-index.md",
      content: "# Transaction Index\n",
      action: "sync-governance",
      surface: "test-generated-index",
    },
  ],
  generatedSurfaces: [
    {
      surface: "test-generated-index",
      paths: ["coding-agent-harness/governance/generated/transaction-index.md"],
    },
  ],
  commit: {
    message: "chore(harness): apply transaction fixture",
  },
};

const plan = transaction.plan(changeSet);
assert(plan.operation === "transaction-plan-apply", "transaction plan should expose the operation name");
assert(plan.git.inGit === true, "transaction plan should include git inspection");
assert(plan.allowedPaths.includes("coding-agent-harness/planning/tasks/transaction-plan/task_plan.md"), "plan should allow file writes");
assert(plan.allowedPaths.includes("coding-agent-harness/governance/generated/transaction-index.md"), "plan should allow generated surface paths");
assert(plan.generatedSurfaces.includes("test-generated-index"), "plan should summarize generated surfaces");
assert(!fs.existsSync(path.join(target, "coding-agent-harness/planning/tasks/transaction-plan/task_plan.md")), "plan should not write files");

const result = transaction.apply(plan);
assertTransactionSucceeded(result);
const commit = result.commit as TransactionCommit;
assert(commit.committed === true, "transaction apply should auto-commit allowed writes");
assert(commit.allowedPaths?.includes("coding-agent-harness/planning/tasks/transaction-plan/task_plan.md"), "commit summary should include allowed write path");
assert(commit.allowedPaths?.includes("coding-agent-harness/governance/generated/transaction-index.md"), "commit summary should include generated surface path");
assert(/^[0-9a-f]{7,40}$/.test(commit.commitSha || ""), "commit summary should include commit SHA");
assert(fs.readFileSync(path.join(target, "coding-agent-harness/planning/tasks/transaction-plan/task_plan.md"), "utf8") === "# Transaction Plan\n", "transaction apply should write content");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "transaction apply should leave git clean");

const dryRunCallbackTarget = path.join(tmpRoot, "harness-transaction-dry-run-callback-target");
fs.mkdirSync(dryRunCallbackTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", dryRunCallbackTarget]);
git(dryRunCallbackTarget, ["init"]);
git(dryRunCallbackTarget, ["config", "user.name", "Harness Test"]);
git(dryRunCallbackTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(dryRunCallbackTarget, ["add", "."]);
git(dryRunCallbackTarget, ["commit", "-m", "test fixture baseline"]);
const dryRunCallbackTransaction = createGovernanceHarnessTransaction(normalizeTarget(dryRunCallbackTarget));
let dryRunCallbackInvoked = false;
const dryRunCallbackPlan = dryRunCallbackTransaction.plan({
  operation: "transaction-dry-run-callback",
  dryRun: true,
  writes: [{ path: "coding-agent-harness/planning/tasks/dry-run/task_plan.md", content: "# Dry Run\n" }],
  commit: { message: "chore(harness): dry run callback fixture" },
  apply() {
    dryRunCallbackInvoked = true;
    fs.writeFileSync(path.join(dryRunCallbackTarget, "CALLBACK_MUTATION.txt"), "callback mutation\n");
    return { allowedPaths: ["CALLBACK_MUTATION.txt"] };
  },
});
const dryRunCallbackResult = dryRunCallbackTransaction.apply(dryRunCallbackPlan);
assertTransactionSucceeded(dryRunCallbackResult);
assert(dryRunCallbackResult.commit.committed === false && dryRunCallbackResult.commit.reason === "dry-run", "dry-run transactions should report dry-run commit result");
assert(dryRunCallbackInvoked === false, "dry-run transactions should not invoke mutation callbacks");
assert(!fs.existsSync(path.join(dryRunCallbackTarget, "CALLBACK_MUTATION.txt")), "dry-run transaction callback must not mutate files");
assert(!fs.existsSync(path.join(dryRunCallbackTarget, "coding-agent-harness/planning/tasks/dry-run/task_plan.md")), "dry-run declarative writes must not mutate files");
assert(git(dryRunCallbackTarget, ["status", "--short"]).stdout.trim() === "", "dry-run transaction should leave git clean");

fs.writeFileSync(path.join(target, "DIRTY.txt"), "dirty\n");
const dirtyPlan = transaction.plan({
  operation: "transaction-dirty-gate",
  writes: [{ path: "coding-agent-harness/planning/tasks/dirty/task_plan.md", content: "# Dirty\n" }],
  commit: { message: "chore(harness): dirty transaction fixture" },
});
assert(dirtyPlan.conflicts.some((conflict) => conflict.includes("DIRTY.txt")), "dirty plan should summarize git conflicts");
const dirtyResult = transaction.apply(dirtyPlan);
assert(dirtyResult.success === false, "transaction apply should return a failure result for dirty git gates");
assert(dirtyResult.error?.message.includes("clean Git working tree"), "dirty failure should preserve governance-sync error text");
assert(dirtyResult.release.completed === true, "dirty failure should report release completion");
assert(!fs.existsSync(path.join(target, ".harness/locks/governance-sync.lock")), "dirty failure should release the governance sync lock");
fs.rmSync(path.join(target, "DIRTY.txt"));

const failurePlan = transaction.plan({
  operation: "transaction-release-on-failure",
  writes: [{ path: "coding-agent-harness/planning/tasks/release-failure/task_plan.md", content: "# Release Failure\n" }],
  commit: { message: "chore(harness): release failure fixture" },
  apply() {
    throw new Error("planned transaction callback failure");
  },
});
const failureResult = transaction.apply(failurePlan);
assert(failureResult.success === false, "transaction apply should capture callback failures");
assert(failureResult.error?.message === "planned transaction callback failure", "callback failure should keep its message");
assert(failureResult.release.completed === true, "callback failure should release governance sync");
assert(!fs.existsSync(path.join(target, ".harness/locks/governance-sync.lock")), "callback failure should remove the lock file");

for (const invalidPath of ["", "../transaction-outside.txt", "TARGET:../target-outside.txt", path.join(tmpRoot, "absolute-outside.txt")]) {
  let rejected = false;
  try {
    transaction.plan({
      operation: `transaction-invalid-path-${invalidPath || "empty"}`,
      writes: [{ path: invalidPath, content: "outside\n" }],
      commit: { message: "chore(harness): invalid path fixture" },
    });
  } catch (error) {
    rejected = errorMessage(error).includes("inside the transaction target");
  }
  assert(rejected, `transaction plan should reject unsafe path: ${invalidPath || "<empty>"}`);
}
assert(!fs.existsSync(path.join(tmpRoot, "transaction-outside.txt")), "invalid relative paths must not write outside target");
assert(!fs.existsSync(path.join(tmpRoot, "target-outside.txt")), "invalid TARGET paths must not write outside target");
assert(!fs.existsSync(path.join(tmpRoot, "absolute-outside.txt")), "invalid absolute paths must not write outside target");

const symlinkEscapeTarget = path.join(tmpRoot, "harness-transaction-symlink-escape-target");
const symlinkOutside = path.join(tmpRoot, "harness-transaction-symlink-outside");
fs.mkdirSync(symlinkEscapeTarget);
fs.mkdirSync(symlinkOutside);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", symlinkEscapeTarget]);
git(symlinkEscapeTarget, ["init"]);
git(symlinkEscapeTarget, ["config", "user.name", "Harness Test"]);
git(symlinkEscapeTarget, ["config", "user.email", "harness-test@example.invalid"]);
const symlinkPath = path.join(symlinkEscapeTarget, "escape-link");
const symlinkCreated = createDirectorySymlink(symlinkOutside, symlinkPath);
if (symlinkCreated) {
  git(symlinkEscapeTarget, ["add", "."]);
  git(symlinkEscapeTarget, ["commit", "-m", "test fixture baseline"]);
  const symlinkEscapeTransaction = createGovernanceHarnessTransaction(normalizeTarget(symlinkEscapeTarget));
  let symlinkRejected = false;
  try {
    const symlinkEscapePlan = symlinkEscapeTransaction.plan({
      operation: "transaction-symlink-escape",
      writes: [{ path: "escape-link/outside.txt", content: "escaped\n" }],
      commit: {
        message: "chore(harness): symlink escape fixture",
        defer: true,
      },
    });
    const symlinkEscapeResult = symlinkEscapeTransaction.apply(symlinkEscapePlan);
    symlinkRejected = symlinkEscapeResult.success === false && symlinkEscapeResult.error.message.includes("inside the transaction target");
  } catch (error) {
    symlinkRejected = errorMessage(error).includes("inside the transaction target");
  }
  assert(symlinkRejected, "transaction paths should reject symlink escapes outside target");
  assert(!fs.existsSync(path.join(symlinkOutside, "outside.txt")), "symlink escape must not write outside target");
}

const emptyAllowlistTarget = path.join(tmpRoot, "harness-transaction-empty-allowlist-target");
fs.mkdirSync(emptyAllowlistTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", emptyAllowlistTarget]);
git(emptyAllowlistTarget, ["init"]);
git(emptyAllowlistTarget, ["config", "user.name", "Harness Test"]);
git(emptyAllowlistTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(emptyAllowlistTarget, ["add", "."]);
git(emptyAllowlistTarget, ["commit", "-m", "test fixture baseline"]);
const emptyAllowlistTransaction = createGovernanceHarnessTransaction(normalizeTarget(emptyAllowlistTarget));
const emptyAllowlistPlan = emptyAllowlistTransaction.plan({
  operation: "transaction-empty-allowlist-callback-write",
  commit: { message: "chore(harness): empty allowlist callback fixture" },
  apply() {
    fs.writeFileSync(path.join(emptyAllowlistTarget, "UNDECLARED_AUTO.txt"), "undeclared\n");
  },
});
const emptyAllowlistResult = emptyAllowlistTransaction.apply(emptyAllowlistPlan);
assert(emptyAllowlistResult.success === false, "transactions should reject callback writes when the allowlist is empty");
assert(emptyAllowlistResult.error.message.includes("outside the transaction write scope"), "empty allowlist rejection should explain write scope");

const ignoredAllowlistTarget = path.join(tmpRoot, "harness-transaction-ignored-allowlist-target");
fs.mkdirSync(ignoredAllowlistTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", ignoredAllowlistTarget]);
git(ignoredAllowlistTarget, ["init"]);
git(ignoredAllowlistTarget, ["config", "user.name", "Harness Test"]);
git(ignoredAllowlistTarget, ["config", "user.email", "harness-test@example.invalid"]);
fs.writeFileSync(path.join(ignoredAllowlistTarget, ".gitignore"), "ignored.txt\n");
git(ignoredAllowlistTarget, ["add", "."]);
git(ignoredAllowlistTarget, ["commit", "-m", "test fixture baseline"]);
const ignoredStatusTransaction = createGovernanceHarnessTransaction(normalizeTarget(ignoredAllowlistTarget));
const ignoredStatusPlan = ignoredStatusTransaction.plan({
  operation: "transaction-ignored-file-is-not-git-write-scope",
  commit: { message: "chore(harness): ignored empty allowlist callback fixture" },
  apply() {
    fs.writeFileSync(path.join(ignoredAllowlistTarget, "ignored.txt"), "ignored but undeclared\n");
  },
});
const ignoredStatusResult = ignoredStatusTransaction.apply(ignoredStatusPlan);
assertTransactionSucceeded(ignoredStatusResult);
assert(ignoredStatusResult.commit.committed === false, "ignored-only callback writes should not create a Git commit");
assert(git(ignoredAllowlistTarget, ["status", "--short"]).stdout.trim() === "", "ignored-only callback writes should not dirty Git status");
fs.rmSync(path.join(ignoredAllowlistTarget, "ignored.txt"));

const nonGitTarget = path.join(tmpRoot, "harness-transaction-non-git-target");
fs.mkdirSync(nonGitTarget);
const nonGitTransaction = createGovernanceHarnessTransaction(normalizeTarget(nonGitTarget));
const nonGitPlan = nonGitTransaction.plan({
  operation: "transaction-non-git-empty-allowlist-callback-write",
  commit: { message: "chore(harness): non-git empty allowlist callback fixture" },
  apply() {
    fs.writeFileSync(path.join(nonGitTarget, "UNDECLARED_NON_GIT.txt"), "undeclared non-git\n");
  },
});
const nonGitResult = nonGitTransaction.apply(nonGitPlan);
assert(nonGitResult.success === false, "non-git transactions should reject callback writes outside the allowlist");
assert(nonGitResult.error.message.includes("outside the transaction write scope"), "non-git write rejection should explain write scope");

const dirtyCallbackTarget = path.join(tmpRoot, "harness-transaction-dirty-callback-target");
fs.mkdirSync(dirtyCallbackTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", dirtyCallbackTarget]);
git(dirtyCallbackTarget, ["init"]);
git(dirtyCallbackTarget, ["config", "user.name", "Harness Test"]);
git(dirtyCallbackTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(dirtyCallbackTarget, ["add", "."]);
git(dirtyCallbackTarget, ["commit", "-m", "test fixture baseline"]);
fs.writeFileSync(path.join(dirtyCallbackTarget, "DIRTY_SCOPE.txt"), "dirty before\n");
const dirtyCallbackTransaction = createGovernanceHarnessTransaction(normalizeTarget(dirtyCallbackTarget));
const dirtyCallbackPlan = dirtyCallbackTransaction.plan({
  operation: "transaction-dirty-callback-path",
  allowedPaths: ["coding-agent-harness/planning/tasks/predeclared/task_plan.md"],
  commit: {
    message: "chore(harness): dirty callback path fixture",
    allowDirtyWorktree: true,
  },
  apply() {
    fs.writeFileSync(path.join(dirtyCallbackTarget, "DIRTY_SCOPE.txt"), "dirty after\n");
    return { allowedPaths: ["DIRTY_SCOPE.txt"] };
  },
});
const dirtyCallbackHead = git(dirtyCallbackTarget, ["rev-parse", "HEAD"]).stdout.trim();
const dirtyCallbackResult = dirtyCallbackTransaction.apply(dirtyCallbackPlan);
assert(dirtyCallbackResult.success === false, "dirty worktree transactions should reject callback-added allowed paths");
assert(dirtyCallbackResult.error?.message.includes("predeclared"), "dirty callback rejection should explain predeclared paths");
assert(git(dirtyCallbackTarget, ["rev-parse", "HEAD"]).stdout.trim() === dirtyCallbackHead, "dirty callback rejection should not create a commit");

const deferredScopeTarget = path.join(tmpRoot, "harness-transaction-deferred-scope-target");
fs.mkdirSync(deferredScopeTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", deferredScopeTarget]);
git(deferredScopeTarget, ["init"]);
git(deferredScopeTarget, ["config", "user.name", "Harness Test"]);
git(deferredScopeTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(deferredScopeTarget, ["add", "."]);
git(deferredScopeTarget, ["commit", "-m", "test fixture baseline"]);
const deferredScopeTransaction = createGovernanceHarnessTransaction(normalizeTarget(deferredScopeTarget));
const deferredScopePlan = deferredScopeTransaction.plan({
  operation: "transaction-deferred-out-of-scope",
  allowedPaths: ["coding-agent-harness/planning/tasks/deferred/task_plan.md"],
  commit: {
    message: "chore(harness): deferred out-of-scope fixture",
    defer: true,
  },
  apply() {
    fs.writeFileSync(path.join(deferredScopeTarget, "UNDECLARED.txt"), "undeclared\n");
  },
});
const deferredScopeResult = deferredScopeTransaction.apply(deferredScopePlan);
assert(deferredScopeResult.success === false, "deferred transactions should reject out-of-scope callback writes");
assert(deferredScopeResult.error?.message.includes("outside the transaction write scope"), "deferred scope rejection should explain out-of-scope writes");
assert(!fs.existsSync(path.join(deferredScopeTarget, ".harness/locks/governance-sync.lock")), "deferred scope rejection should release governance sync");

const lifecycleTarget = path.join(tmpRoot, "harness-transaction-lifecycle-target");
fs.mkdirSync(lifecycleTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", lifecycleTarget]);
git(lifecycleTarget, ["init"]);
git(lifecycleTarget, ["config", "user.name", "Harness Test"]);
git(lifecycleTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(lifecycleTarget, ["add", "."]);
git(lifecycleTarget, ["commit", "-m", "test fixture baseline"]);
expectJson(["module", "register", "txn", "--title", "Transaction", "--prefix", "TXN", "--scope", "src/txn/**", lifecycleTarget]);
const created = expectJson<NewTaskResponse>(["new-task", "transaction-lifecycle", "--title", "Transaction Lifecycle", "--locale", "en-US", "--module", "txn", lifecycleTarget]);
expectJson(["task-start", created.task.shortId || "transaction-lifecycle", "--message", "start transaction lifecycle", lifecycleTarget]);
expectJson(["task-phase", created.task.shortId || "transaction-lifecycle", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
const reviewResult = expectJson(["task-review", created.task.shortId || "transaction-lifecycle", "--message", "ready for transaction review", lifecycleTarget]);
assert(Boolean(reviewResult), "task-review should return JSON after transaction migration");
const moduleStepResult = expectJson<ModuleStepResponse>(["module-step", "txn", "T-TRANSACTION-LIFECYCLE", "--state", "done", lifecycleTarget]);
assert(moduleStepResult.governance?.commit?.committed === true, "module-step transaction should commit scoped governance changes");
const ledgerPath = path.join(lifecycleTarget, "coding-agent-harness/governance/generated/Harness-Ledger.md");
const modulePlanPath = path.join(lifecycleTarget, "coding-agent-harness/planning/modules/txn/module_plan.md");
assert(fs.readFileSync(ledgerPath, "utf8").includes("Transaction Lifecycle"), "transaction-migrated lifecycle review should sync generated governance ledger");
assert(fs.readFileSync(ledgerPath, "utf8").includes("Module txn step T-TRANSACTION-LIFECYCLE"), "transaction-migrated module-step should sync generated governance ledger");
assert(fs.readFileSync(modulePlanPath, "utf8").includes("transaction-lifecycle"), "transaction-migrated lifecycle review should regenerate module plan index");
assert(git(lifecycleTarget, ["status", "--short"]).stdout.trim() === "", "transaction-migrated lifecycle review should leave git clean");

const dirtyLifecycleTarget = path.join(tmpRoot, "harness-transaction-dirty-lifecycle-target");
fs.mkdirSync(dirtyLifecycleTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", dirtyLifecycleTarget]);
git(dirtyLifecycleTarget, ["init"]);
git(dirtyLifecycleTarget, ["config", "user.name", "Harness Test"]);
git(dirtyLifecycleTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(dirtyLifecycleTarget, ["add", "."]);
git(dirtyLifecycleTarget, ["commit", "-m", "test fixture baseline"]);
expectJson(["module", "register", "dirtytxn", "--title", "Dirty Transaction", "--prefix", "DTX", "--scope", "src/dirty/**", dirtyLifecycleTarget]);

function writeUnrelatedDirty(root: string, name: string): string {
  const relativePath = `${name}.txt`;
  fs.writeFileSync(path.join(root, relativePath), `${name}\n`);
  return relativePath;
}

  function assertLastCommitWithinAllowedPaths(root: string, result: LifecycleResponse, message: string): void {
    const committedPaths = git(root, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split(/\r?\n/).filter(Boolean);
    const allowedPaths = result.governance?.commit?.allowedPaths || [];
    const allowed = new Set(allowedPaths);
    assert(committedPaths.length > 0, `${message}: expected at least one committed path`);
    assert(allowedPaths.length > 0, `${message}: command should declare commit allowed paths`);
    assert(committedPaths.every((file) => allowed.has(file)), `${message}: commit should include only declared allowed paths, got committed=${committedPaths.join(", ")} allowed=${allowedPaths.join(", ")}`);
  }

function assertUnrelatedDirtyRemains(root: string, relativePath: string, message: string): void {
  const status = git(root, ["status", "--short"]).stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(status.includes(`?? ${relativePath}`), `${message}: unrelated dirty file should remain dirty, got ${status.join(", ")}`);
}

  const dirtyStartTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-start", "--title", "Dirty Lifecycle Start", "--locale", "en-US", dirtyLifecycleTarget]);
  const dirtyStartFile = writeUnrelatedDirty(dirtyLifecycleTarget, "UNRELATED_START");
  const dirtyStartResult = expectJson<LifecycleResponse>(["task-start", dirtyStartTask.task.shortId || "dirty-lifecycle-start", "--message", "start with unrelated dirty", dirtyLifecycleTarget]);
  assertLastCommitWithinAllowedPaths(dirtyLifecycleTarget, dirtyStartResult, "task-start with unrelated dirty");
  assertUnrelatedDirtyRemains(dirtyLifecycleTarget, dirtyStartFile, "task-start with unrelated dirty");
  fs.rmSync(path.join(dirtyLifecycleTarget, dirtyStartFile));

const dirtyLogTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-log", "--title", "Dirty Lifecycle Log", "--locale", "en-US", dirtyLifecycleTarget]);
  expectJson(["task-start", dirtyLogTask.task.shortId || "dirty-lifecycle-log", "--message", "clean start before dirty log", dirtyLifecycleTarget]);
  const dirtyLogFile = writeUnrelatedDirty(dirtyLifecycleTarget, "UNRELATED_LOG");
  const dirtyLogResult = expectJson<LifecycleResponse>(["task-log", dirtyLogTask.task.shortId || "dirty-lifecycle-log", "--message", "log with unrelated dirty", "--evidence", "command:TARGET:test:passed", dirtyLifecycleTarget]);
  assertLastCommitWithinAllowedPaths(dirtyLifecycleTarget, dirtyLogResult, "task-log with unrelated dirty");
  assertUnrelatedDirtyRemains(dirtyLifecycleTarget, dirtyLogFile, "task-log with unrelated dirty");
  fs.rmSync(path.join(dirtyLifecycleTarget, dirtyLogFile));

const dirtyBlockTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-block", "--title", "Dirty Lifecycle Block", "--locale", "en-US", dirtyLifecycleTarget]);
  expectJson(["task-start", dirtyBlockTask.task.shortId || "dirty-lifecycle-block", "--message", "clean start before dirty block", dirtyLifecycleTarget]);
  const dirtyBlockFile = writeUnrelatedDirty(dirtyLifecycleTarget, "UNRELATED_BLOCK");
  const dirtyBlockResult = expectJson<LifecycleResponse>(["task-block", dirtyBlockTask.task.shortId || "dirty-lifecycle-block", "--message", "block with unrelated dirty", dirtyLifecycleTarget]);
  assertLastCommitWithinAllowedPaths(dirtyLifecycleTarget, dirtyBlockResult, "task-block with unrelated dirty");
  assertUnrelatedDirtyRemains(dirtyLifecycleTarget, dirtyBlockFile, "task-block with unrelated dirty");
  fs.rmSync(path.join(dirtyLifecycleTarget, dirtyBlockFile));

const dirtyReviewTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-review", "--title", "Dirty Lifecycle Review", "--locale", "en-US", dirtyLifecycleTarget]);
  expectJson(["task-start", dirtyReviewTask.task.shortId || "dirty-lifecycle-review", "--message", "clean start before dirty review", dirtyLifecycleTarget]);
  expectJson(["task-phase", dirtyReviewTask.task.shortId || "dirty-lifecycle-review", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", dirtyLifecycleTarget]);
  const dirtyReviewFile = writeUnrelatedDirty(dirtyLifecycleTarget, "UNRELATED_REVIEW");
  const dirtyReviewResult = expectJson<LifecycleResponse>(["task-review", dirtyReviewTask.task.shortId || "dirty-lifecycle-review", "--message", "review with unrelated dirty", dirtyLifecycleTarget]);
  assertLastCommitWithinAllowedPaths(dirtyLifecycleTarget, dirtyReviewResult, "task-review with unrelated dirty");
  assertUnrelatedDirtyRemains(dirtyLifecycleTarget, dirtyReviewFile, "task-review with unrelated dirty");
  fs.rmSync(path.join(dirtyLifecycleTarget, dirtyReviewFile));

const dirtyCompleteTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-complete", "--title", "Dirty Lifecycle Complete", "--locale", "en-US", "--budget", "simple", dirtyLifecycleTarget]);
  expectJson(["task-start", dirtyCompleteTask.task.shortId || "dirty-lifecycle-complete", "--message", "clean start before dirty complete", dirtyLifecycleTarget]);
  const dirtyCompleteFile = writeUnrelatedDirty(dirtyLifecycleTarget, "UNRELATED_COMPLETE");
  const dirtyCompleteResult = expectJson<LifecycleResponse>(["task-complete", dirtyCompleteTask.task.shortId || "dirty-lifecycle-complete", "--message", "complete with unrelated dirty", dirtyLifecycleTarget]);
  assertLastCommitWithinAllowedPaths(dirtyLifecycleTarget, dirtyCompleteResult, "task-complete with unrelated dirty");
  assertUnrelatedDirtyRemains(dirtyLifecycleTarget, dirtyCompleteFile, "task-complete with unrelated dirty");
  fs.rmSync(path.join(dirtyLifecycleTarget, dirtyCompleteFile));

const dirtyPhaseTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-phase", "--title", "Dirty Lifecycle Phase", "--locale", "en-US", dirtyLifecycleTarget]);
  expectJson(["task-start", dirtyPhaseTask.task.shortId || "dirty-lifecycle-phase", "--message", "clean start before dirty phase", dirtyLifecycleTarget]);
  const dirtyPhaseFile = writeUnrelatedDirty(dirtyLifecycleTarget, "UNRELATED_PHASE");
  const dirtyPhaseResult = expectJson<LifecycleResponse>(["task-phase", dirtyPhaseTask.task.shortId || "dirty-lifecycle-phase", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", dirtyLifecycleTarget]);
  assertLastCommitWithinAllowedPaths(dirtyLifecycleTarget, dirtyPhaseResult, "task-phase with unrelated dirty");
  assertUnrelatedDirtyRemains(dirtyLifecycleTarget, dirtyPhaseFile, "task-phase with unrelated dirty");
  fs.rmSync(path.join(dirtyLifecycleTarget, dirtyPhaseFile));

const dirtyModuleTask = expectJson<NewTaskResponse>(["new-task", "dirty-module-step", "--title", "Dirty Module Step", "--locale", "en-US", "--module", "dirtytxn", dirtyLifecycleTarget]);
assert(Boolean(dirtyModuleTask.task), "dirty module-step fixture should create a module task");
  const dirtyModuleStepId = moduleStepIdForTask(dirtyLifecycleTarget, "dirtytxn", dirtyModuleTask.task.shortId || "dirty-module-step");
  const dirtyModuleFile = writeUnrelatedDirty(dirtyLifecycleTarget, "UNRELATED_MODULE_STEP");
  const dirtyModuleResult = expectJson<LifecycleResponse>(["module-step", "dirtytxn", dirtyModuleStepId, "--state", "done", dirtyLifecycleTarget]);
  assertLastCommitWithinAllowedPaths(dirtyLifecycleTarget, dirtyModuleResult, "module-step with unrelated dirty");
  assertUnrelatedDirtyRemains(dirtyLifecycleTarget, dirtyModuleFile, "module-step with unrelated dirty");
  fs.rmSync(path.join(dirtyLifecycleTarget, dirtyModuleFile));

  const dirtyHarnessTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-harness-dirty", "--title", "Dirty Harness Path", "--locale", "en-US", dirtyLifecycleTarget]);
  const dirtyHarnessRelative = "coding-agent-harness/planning/tasks/UNRELATED_HARNESS_DRAFT.md";
  fs.writeFileSync(path.join(dirtyLifecycleTarget, dirtyHarnessRelative), "# unrelated harness draft\n");
  const dirtyHarnessResult = expectJson<LifecycleResponse>(["task-start", dirtyHarnessTask.task.shortId || "dirty-lifecycle-harness-dirty", "--message", "start with unrelated harness dirty", dirtyLifecycleTarget]);
  assertLastCommitWithinAllowedPaths(dirtyLifecycleTarget, dirtyHarnessResult, "task-start with unrelated dirty harness path");
  assertUnrelatedDirtyRemains(dirtyLifecycleTarget, dirtyHarnessRelative, "task-start with unrelated dirty harness path");
  fs.rmSync(path.join(dirtyLifecycleTarget, dirtyHarnessRelative));

const ownedPhaseTask = expectJson<NewTaskResponse>(["new-task", "dirty-phase-owned", "--title", "Dirty Phase Owned", "--locale", "en-US", dirtyLifecycleTarget]);
expectJson(["task-start", ownedPhaseTask.task.shortId || "dirty-phase-owned", "--message", "clean start before owned dirty phase", dirtyLifecycleTarget]);
const ownedVisualMapPath = path.join(dirtyLifecycleTarget, `coding-agent-harness/planning/tasks/${ownedPhaseTask.task.shortId}/visual_map.md`);
fs.appendFileSync(ownedVisualMapPath, "\n<!-- user-owned visual map draft -->\n");
const ownedDirtyPhase = run(["task-phase", ownedPhaseTask.task.shortId || "dirty-phase-owned", "EXEC-01", "--state", "done", dirtyLifecycleTarget]);
assert(ownedDirtyPhase.status !== 0, "task-phase should reject dirty files inside its visual map write scope");
assert(`${ownedDirtyPhase.stdout}\n${ownedDirtyPhase.stderr}`.includes("write scope"), "owned dirty task-phase refusal should explain the write-scope conflict");
git(dirtyLifecycleTarget, ["checkout", "--", toRelative(ownedVisualMapPath, dirtyLifecycleTarget)]);

const ownedModuleTask = expectJson<NewTaskResponse>(["new-task", "dirty-module-owned", "--title", "Dirty Module Owned", "--locale", "en-US", "--module", "dirtytxn", dirtyLifecycleTarget]);
const ownedModuleStepId = moduleStepIdForTask(dirtyLifecycleTarget, "dirtytxn", ownedModuleTask.task.shortId || "dirty-module-owned");
const ownedModulePlanPath = path.join(dirtyLifecycleTarget, "coding-agent-harness/planning/modules/dirtytxn/module_plan.md");
fs.appendFileSync(ownedModulePlanPath, "\n<!-- user-owned module plan draft -->\n");
const ownedDirtyModule = run(["module-step", "dirtytxn", ownedModuleStepId, "--state", "done", dirtyLifecycleTarget]);
assert(ownedDirtyModule.status !== 0, "module-step should reject dirty files inside its module plan write scope");
assert(`${ownedDirtyModule.stdout}\n${ownedDirtyModule.stderr}`.includes("write scope"), "owned dirty module-step refusal should explain the write-scope conflict");
git(dirtyLifecycleTarget, ["checkout", "--", toRelative(ownedModulePlanPath, dirtyLifecycleTarget)]);

const ownedDirtyTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-owned", "--title", "Dirty Lifecycle Owned", "--locale", "en-US", dirtyLifecycleTarget]);
const ownedProgressPath = path.join(dirtyLifecycleTarget, `coding-agent-harness/planning/tasks/${ownedDirtyTask.task.shortId}/progress.md`);
fs.appendFileSync(ownedProgressPath, "\n<!-- user-owned progress draft -->\n");
const ownedDirtyStart = run(["task-start", ownedDirtyTask.task.shortId || "dirty-lifecycle-owned", "--message", "owned dirty should fail", dirtyLifecycleTarget]);
assert(ownedDirtyStart.status !== 0, "task-start should reject dirty files inside its lifecycle write scope");
assert(`${ownedDirtyStart.stdout}\n${ownedDirtyStart.stderr}`.includes("write scope"), "owned dirty lifecycle refusal should explain the write-scope conflict");
git(dirtyLifecycleTarget, ["checkout", "--", toRelative(ownedProgressPath, dirtyLifecycleTarget)]);

  const stagedOutsideTask = expectJson<NewTaskResponse>(["new-task", "dirty-lifecycle-staged", "--title", "Dirty Lifecycle Staged", "--locale", "en-US", dirtyLifecycleTarget]);
  fs.writeFileSync(path.join(dirtyLifecycleTarget, "coding-agent-harness/planning/tasks/STAGED_OUTSIDE.md"), "staged outside\n");
  git(dirtyLifecycleTarget, ["add", "coding-agent-harness/planning/tasks/STAGED_OUTSIDE.md"]);
  const stagedOutsideStart = run(["task-start", stagedOutsideTask.task.shortId || "dirty-lifecycle-staged", "--message", "staged outside should fail", dirtyLifecycleTarget]);
  assert(stagedOutsideStart.status !== 0, "task-start should reject staged files outside its lifecycle write scope");
  assert(`${stagedOutsideStart.stdout}\n${stagedOutsideStart.stderr}`.includes("staged"), "staged outside lifecycle refusal should explain staged-file ownership");
  git(dirtyLifecycleTarget, ["reset", "--", "coding-agent-harness/planning/tasks/STAGED_OUTSIDE.md"]);
  fs.rmSync(path.join(dirtyLifecycleTarget, "coding-agent-harness/planning/tasks/STAGED_OUTSIDE.md"));

  const stagedOutsidePhaseTask = expectJson<NewTaskResponse>(["new-task", "dirty-phase-staged", "--title", "Dirty Phase Staged", "--locale", "en-US", dirtyLifecycleTarget]);
  expectJson(["task-start", stagedOutsidePhaseTask.task.shortId || "dirty-phase-staged", "--message", "clean start before staged dirty phase", dirtyLifecycleTarget]);
  fs.writeFileSync(path.join(dirtyLifecycleTarget, "STAGED_PHASE_OUTSIDE.txt"), "staged outside phase\n");
  git(dirtyLifecycleTarget, ["add", "STAGED_PHASE_OUTSIDE.txt"]);
  const stagedOutsidePhase = run(["task-phase", stagedOutsidePhaseTask.task.shortId || "dirty-phase-staged", "EXEC-01", "--state", "done", dirtyLifecycleTarget]);
  assert(stagedOutsidePhase.status !== 0, "task-phase should reject staged files outside its visual map write scope");
  assert(`${stagedOutsidePhase.stdout}\n${stagedOutsidePhase.stderr}`.includes("staged"), "staged outside task-phase refusal should explain staged-file ownership");
  git(dirtyLifecycleTarget, ["reset", "--", "STAGED_PHASE_OUTSIDE.txt"]);
  fs.rmSync(path.join(dirtyLifecycleTarget, "STAGED_PHASE_OUTSIDE.txt"));

  const stagedOutsideModuleTask = expectJson<NewTaskResponse>(["new-task", "dirty-module-staged", "--title", "Dirty Module Staged", "--locale", "en-US", "--module", "dirtytxn", dirtyLifecycleTarget]);
  const stagedOutsideModuleStepId = moduleStepIdForTask(dirtyLifecycleTarget, "dirtytxn", stagedOutsideModuleTask.task.shortId || "dirty-module-staged");
  fs.writeFileSync(path.join(dirtyLifecycleTarget, "STAGED_MODULE_OUTSIDE.txt"), "staged outside module\n");
  git(dirtyLifecycleTarget, ["add", "STAGED_MODULE_OUTSIDE.txt"]);
  const stagedOutsideModule = run(["module-step", "dirtytxn", stagedOutsideModuleStepId, "--state", "done", dirtyLifecycleTarget]);
  assert(stagedOutsideModule.status !== 0, "module-step should reject staged files outside its module write scope");
  assert(`${stagedOutsideModule.stdout}\n${stagedOutsideModule.stderr}`.includes("staged"), "staged outside module-step refusal should explain staged-file ownership");
  git(dirtyLifecycleTarget, ["reset", "--", "STAGED_MODULE_OUTSIDE.txt"]);
  fs.rmSync(path.join(dirtyLifecycleTarget, "STAGED_MODULE_OUTSIDE.txt"));

assert(git(dirtyLifecycleTarget, ["status", "--short"]).stdout.trim() === "", "dirty lifecycle transaction fixtures should leave git clean after cleanup");

console.log("HarnessTransaction tests passed");

function git(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toRelative(filePath: string, root: string): string {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function moduleStepIdForTask(root: string, moduleKey: string, taskShortId: string): string {
  const modulePlan = fs.readFileSync(path.join(root, "coding-agent-harness/planning/modules", moduleKey, "module_plan.md"), "utf8");
  for (const line of modulePlan.split(/\r?\n/)) {
    if (!line.includes(taskShortId) || !line.startsWith("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells[0] && cells[0] !== "---") return cells[0];
  }
  throw new Error(`Could not find module step for ${moduleKey}/${taskShortId}`);
}

function createDirectorySymlink(targetPath: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    return false;
  }
}
