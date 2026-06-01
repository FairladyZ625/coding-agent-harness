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
    };
  };
};

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
const ignoredAllowlistTransaction = createGovernanceHarnessTransaction(normalizeTarget(ignoredAllowlistTarget));
const ignoredAllowlistPlan = ignoredAllowlistTransaction.plan({
  operation: "transaction-ignored-empty-allowlist-callback-write",
  commit: { message: "chore(harness): ignored empty allowlist callback fixture" },
  apply() {
    fs.writeFileSync(path.join(ignoredAllowlistTarget, "ignored.txt"), "ignored but undeclared\n");
  },
});
const ignoredAllowlistResult = ignoredAllowlistTransaction.apply(ignoredAllowlistPlan);
assert(ignoredAllowlistResult.success === false, "transactions should reject ignored callback writes outside the allowlist");
assert(ignoredAllowlistResult.error.message.includes("outside the transaction write scope"), "ignored write rejection should explain write scope");

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

console.log("HarnessTransaction tests passed");

function git(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createDirectorySymlink(targetPath: string, linkPath: string): boolean {
  try {
    fs.symlinkSync(targetPath, linkPath, process.platform === "win32" ? "junction" : "dir");
    return true;
  } catch {
    return false;
  }
}
