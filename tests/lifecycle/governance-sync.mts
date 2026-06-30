#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import {
  assert,
  expectJson,
  run,
  tmpRoot,
  todayLocal,
} from "../helpers/harness-test-utils.mjs";
import { normalizeTarget } from "../../scripts/lib/core-shared.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  moduleGeneratedIndexSurfaces,
  releaseGovernanceSync,
} from "../../scripts/lib/governance-sync.mjs";

type GovernanceCommit = { committed?: boolean };
type HarnessTask = { id: string; shortId?: string; path?: string };
type NewTaskResponse = {
  task: HarnessTask;
  governance?: { commit?: GovernanceCommit };
};
type StatusResponse = {
  git?: { dirty?: boolean; blocksCliAutoCommit?: boolean };
  checkState: { details: { warnings: string[] } };
};
type LessonPromoteResponse = {
  governance?: { commit?: GovernanceCommit };
};

const target = path.join(tmpRoot, "governance-sync-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", target]);
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "test fixture baseline"]);

expectJson(["module", "register", "sync", "--title", "Sync", "--prefix", "SYNC", "--scope", "src/sync/**", target]);
const modulePlanPath = path.join(target, "coding-agent-harness/planning/modules/sync/module_plan.md");
fs.writeFileSync(
  modulePlanPath,
  `# Sync Module Plan\n\n## Steps\n\n| Step ID | Name | Status | Task Plan | Depends On |\n| --- | --- | --- | --- | --- |\n| SYNC-01 | Manual module milestone | planned | none | none |\n| SYNC-02 | Manual dependent milestone | planned | none | SYNC-01 |\n`,
);
git(target, ["add", path.relative(target, modulePlanPath).replaceAll(path.sep, "/")]);
git(target, ["commit", "-m", "test fixture manual module plan rows"]);
const created = expectJson<NewTaskResponse>(["new-task", "governance-owned", "--title", "Governance Owned", "--locale", "en-US", "--module", "sync", target]);
assert(created.governance?.commit?.committed === true, "new-task should auto-commit governance sync in git targets");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "new-task governance sync should leave git clean");
assert(git(target, ["log", "-1", "--format=%s"]).stdout.trim() === `chore(harness): register task ${created.task.id}`, "new-task commit subject should identify registered task");

const ownedTaskPlan = `coding-agent-harness/planning/modules/sync/tasks/${todayLocal}-governance-owned/task_plan.md`;
const featurePath = path.join(target, "coding-agent-harness/planning/Feature-SSoT.md");
const ledgerPath = path.join(target, "coding-agent-harness/governance/generated/Harness-Ledger.md");
const registryPath = path.join(target, "coding-agent-harness/planning/modules/Module-Registry.md");
assert(!fs.existsSync(featurePath), "new-task --module should not create Feature SSoT lifecycle projection");
const ledgerContent = fs.readFileSync(ledgerPath, "utf8");
assert(ledgerContent.includes(ownedTaskPlan), "new-task should register task in Harness Ledger");
assert(ledgerContent.includes("| module | sync |"), "new-task --module should expose module scope in Harness Ledger");
assert(fs.readFileSync(registryPath, "utf8").includes("coding-agent-harness/planning/modules/sync/module_plan.md"), "new-task --module should refresh the YAML-backed module registry view");
assert(fs.readFileSync(modulePlanPath, "utf8").includes(ownedTaskPlan), "new-task --module should regenerate module plan index");
assert(fs.readFileSync(modulePlanPath, "utf8").includes("| SYNC-01 | Manual module milestone | planned | none | none |"), "new-task --module should preserve manual module plan rows");
assert(fs.readFileSync(modulePlanPath, "utf8").includes("| SYNC-02 | Manual dependent milestone | planned | none | SYNC-01 |"), "new-task --module should preserve manual module dependencies");
assert(!fs.existsSync(path.join(target, "coding-agent-harness/planning/modules/sync/visual_map.md")), "new-task --module should not create a module-root visual map index");
const defaultModuleSurfaces = moduleGeneratedIndexSurfaces(normalizeTarget(target));
const syncModuleSurface = defaultModuleSurfaces.find((surface) => surface.relative === "coding-agent-harness/planning/modules/sync/module_plan.md");
assert(syncModuleSurface, "module generated index default path should materialize module surfaces");
assert(syncModuleSurface.content.includes(ownedTaskPlan), "module generated index default path should read task governance projections");
const softDeleted = expectJson<NewTaskResponse>(["new-task", "governance-soft-deleted", "--title", "Governance Soft Deleted", "--locale", "en-US", "--module", "sync", target]);
expectJson(["task-delete", softDeleted.task.id, "--soft", "--reason", "projection reader active-only fixture", target]);
const softDeletedTaskPlan = `coding-agent-harness/planning/modules/sync/tasks/${todayLocal}-governance-soft-deleted/task_plan.md`;
const activeOnlySurfaces = moduleGeneratedIndexSurfaces(normalizeTarget(target));
const activeOnlySyncSurface = activeOnlySurfaces.find((surface) => surface.relative === "coding-agent-harness/planning/modules/sync/module_plan.md");
assert(activeOnlySyncSurface, "module generated index default path should keep active module surfaces after tombstones exist");
assert(!activeOnlySyncSurface.content.includes(softDeletedTaskPlan), "module generated index default path should preserve scanner active-only archive semantics");
assert(!activeOnlySyncSurface.content.includes("Governance Soft Deleted"), "module generated index default path should not render archived task titles");
assert(!activeOnlySyncSurface.content.includes("governance-soft-deleted"), "module generated index default path should not render archived task ids or archive paths");
expectJson(["task-reopen", softDeleted.task.id, "--reason", "restore active-only fixture", target]);

fs.writeFileSync(
  modulePlanPath,
  `# Sync Module Plan\n\n## 步骤\n\n| 步骤 ID | 名称 | 状态 | 任务计划 | 依赖 |\n| --- | --- | --- | --- | --- |\n| SYNC-OLD | Old row | planned | old/task_plan.md | none |\n`,
);
git(target, ["add", path.relative(target, modulePlanPath).replaceAll(path.sep, "/")]);
git(target, ["commit", "-m", "test fixture zh module plan header"]);
expectJson(["task-log", created.task.shortId || "governance-owned", "--message", "sync zh module plan header", target]);
const zhModulePlanContent = fs.readFileSync(modulePlanPath, "utf8");
assert((zhModulePlanContent.match(new RegExp(ownedTaskPlan.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length === 1, "governance sync should replace zh module plan table rows instead of appending a duplicate table");
assert(zhModulePlanContent.includes("| SYNC-OLD | Old row | planned | old/task_plan.md | none |"), "governance sync should preserve manual zh module plan rows");

fs.writeFileSync(
  modulePlanPath,
  `# Sync Module Plan\n\n## 步骤\n\n| 步骤 ID | 名称 | 状态 | 任务计划 | 依赖 |\n| --- | --- | --- | --- | --- |\n| SYNC-01 | Manual module milestone | planned | none | none |\n| T-STALE-GENERATED | Stale generated row | reserved | coding-agent-harness/planning/modules/sync/tasks/2000-01-01-stale/task_plan.md | none |\n`,
);
git(target, ["add", path.relative(target, modulePlanPath).replaceAll(path.sep, "/")]);
git(target, ["commit", "-m", "test fixture stale generated module plan row"]);
expectJson(["task-log", created.task.shortId || "governance-owned", "--message", "prune stale generated zh module plan row", target]);
const prunedModulePlanContent = fs.readFileSync(modulePlanPath, "utf8");
assert(prunedModulePlanContent.includes("| SYNC-01 | Manual module milestone | planned | none | none |"), "governance sync should preserve manual rows while pruning stale generated rows");
assert(!prunedModulePlanContent.includes("2000-01-01-stale/task_plan.md"), "governance sync should prune stale generated module plan rows");

fs.writeFileSync(path.join(target, "UNRELATED.txt"), "dirty\n");
const dirtyResult = expectJson<NewTaskResponse>(["new-task", "dirty-allowed", "--title", "Dirty Allowed", target]);
assert(dirtyResult.governance?.commit?.committed === true, "new-task should commit CLI-owned paths even when unrelated dirty files exist");
const dirtyAllowedStatus = git(target, ["status", "--short"]).stdout.trim().split(/\r?\n/).filter(Boolean);
assert(dirtyAllowedStatus.length === 1 && dirtyAllowedStatus[0] === "?? UNRELATED.txt", `new-task should leave unrelated dirty state untouched, got ${dirtyAllowedStatus.join(", ")}`);
const dirtyAllowedCommittedPaths = git(target, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split(/\r?\n/).filter(Boolean);
assert(dirtyAllowedCommittedPaths.every((file) => file.startsWith("coding-agent-harness/") || file.startsWith(".harness/")), "new-task scoped commit should not include unrelated dirty files");
const dirtyStatus = expectJson<StatusResponse>(["status", "--json", target]);
assert(dirtyStatus.git?.dirty === true, "status should expose dirty git state");
assert(dirtyStatus.git?.blocksCliAutoCommit === true, "dirty status should conservatively report that generic CLI auto-commit is blocked");
assert(
  dirtyStatus.checkState.details.warnings.some((warning) => warning.includes("dirty-state")),
  "status should still warn when dirty state remains after a scoped CLI commit",
);
fs.rmSync(path.join(target, "UNRELATED.txt"));

const overlapPath = ledgerPath;
const overlapOriginal = fs.readFileSync(overlapPath, "utf8");
fs.writeFileSync(overlapPath, `${overlapOriginal}\n<!-- user-owned ledger draft -->\n`);
const overlapDirty = run(["new-task", "overlap-dirty", "--title", "Overlap Dirty", target]);
assert(overlapDirty.status !== 0, "new-task should reject dirty files inside its write scope");
assert(`${overlapDirty.stdout}\n${overlapDirty.stderr}`.includes("write scope"), "overlap dirty refusal should explain the write-scope conflict");
fs.writeFileSync(overlapPath, overlapOriginal);

fs.writeFileSync(path.join(target, "STAGED.txt"), "staged outside\n");
git(target, ["add", "STAGED.txt"]);
const externalStaged = run(["new-task", "external-staged", "--title", "External Staged", target]);
assert(externalStaged.status !== 0, "new-task should reject staged files outside its write scope");
assert(`${externalStaged.stdout}\n${externalStaged.stderr}`.includes("staged"), "external staged refusal should explain staged-file ownership");
git(target, ["reset", "--", "STAGED.txt"]);
fs.rmSync(path.join(target, "STAGED.txt"));

const sideEffectTarget = path.join(tmpRoot, "governance-side-effect-target");
fs.mkdirSync(sideEffectTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", sideEffectTarget]);
git(sideEffectTarget, ["init"]);
git(sideEffectTarget, ["config", "user.name", "Harness Test"]);
git(sideEffectTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(sideEffectTarget, ["add", "."]);
git(sideEffectTarget, ["commit", "-m", "test fixture baseline"]);
const sideEffectAllowed = "coding-agent-harness/planning/tasks/direct-side-effect/task_plan.md";
const sideEffectContext = beginGovernanceSync(normalizeTarget(sideEffectTarget), {
  operation: "side-effect-test",
  allowDirtyWorktree: true,
  allowedRelativePaths: [sideEffectAllowed],
});
let sideEffectRejected = false;
try {
  fs.mkdirSync(path.dirname(path.join(sideEffectTarget, sideEffectAllowed)), { recursive: true });
  fs.writeFileSync(path.join(sideEffectTarget, sideEffectAllowed), "# Direct Side Effect\n");
  fs.writeFileSync(path.join(sideEffectTarget, "SIDE_EFFECT.txt"), "unexpected\n");
  commitGovernanceSync(sideEffectContext, [sideEffectAllowed], { message: "side effect fixture" });
} catch (error) {
  sideEffectRejected = errorMessage(error).includes("outside its write scope");
} finally {
  releaseGovernanceSync(sideEffectContext);
}
assert(sideEffectRejected, "governance sync should reject newly produced files outside its write scope");

const dirtyMutationTarget = path.join(tmpRoot, "governance-dirty-mutation-target");
fs.mkdirSync(dirtyMutationTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", dirtyMutationTarget]);
git(dirtyMutationTarget, ["init"]);
git(dirtyMutationTarget, ["config", "user.name", "Harness Test"]);
git(dirtyMutationTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(dirtyMutationTarget, ["add", "."]);
git(dirtyMutationTarget, ["commit", "-m", "test fixture baseline"]);
fs.writeFileSync(path.join(dirtyMutationTarget, "UNRELATED.txt"), "initial dirty\n");
const dirtyMutationAllowed = "coding-agent-harness/planning/tasks/direct-dirty-mutation/task_plan.md";
const dirtyMutationContext = beginGovernanceSync(normalizeTarget(dirtyMutationTarget), {
  operation: "dirty-mutation-test",
  allowDirtyWorktree: true,
  allowedRelativePaths: [dirtyMutationAllowed],
});
let dirtyMutationRejected = false;
try {
  fs.mkdirSync(path.dirname(path.join(dirtyMutationTarget, dirtyMutationAllowed)), { recursive: true });
  fs.writeFileSync(path.join(dirtyMutationTarget, dirtyMutationAllowed), "# Direct Dirty Mutation\n");
  fs.writeFileSync(path.join(dirtyMutationTarget, "UNRELATED.txt"), "mutated dirty\n");
  commitGovernanceSync(dirtyMutationContext, [dirtyMutationAllowed], { message: "dirty mutation fixture" });
} catch (error) {
  dirtyMutationRejected = errorMessage(error).includes("outside its write scope");
} finally {
  releaseGovernanceSync(dirtyMutationContext);
}
assert(dirtyMutationRejected, "governance sync should reject mutations to pre-existing dirty files outside its write scope");

const hookSideEffectTarget = path.join(tmpRoot, "governance-hook-side-effect-target");
fs.mkdirSync(hookSideEffectTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", hookSideEffectTarget]);
git(hookSideEffectTarget, ["init"]);
git(hookSideEffectTarget, ["config", "user.name", "Harness Test"]);
git(hookSideEffectTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(hookSideEffectTarget, ["add", "."]);
git(hookSideEffectTarget, ["commit", "-m", "test fixture baseline"]);
const hookPath = path.join(hookSideEffectTarget, ".git/hooks/post-commit");
fs.writeFileSync(hookPath, "#!/bin/sh\nprintf hook > HOOK_SIDE_EFFECT.txt\n");
fs.chmodSync(hookPath, 0o755);
const hookAllowed = "coding-agent-harness/planning/tasks/direct-hook-side-effect/task_plan.md";
const hookContext = beginGovernanceSync(normalizeTarget(hookSideEffectTarget), {
  operation: "hook-side-effect-test",
  allowDirtyWorktree: true,
  allowedRelativePaths: [hookAllowed],
});
let hookSideEffectCommit: GovernanceCommit | undefined;
try {
  fs.mkdirSync(path.dirname(path.join(hookSideEffectTarget, hookAllowed)), { recursive: true });
  fs.writeFileSync(path.join(hookSideEffectTarget, hookAllowed), "# Direct Hook Side Effect\n");
  hookSideEffectCommit = commitGovernanceSync(hookContext, [hookAllowed], { message: "hook side effect fixture" });
} finally {
  releaseGovernanceSync(hookContext);
}
assert(hookSideEffectCommit?.committed === true, "governance sync should commit allowed files with local commit hooks disabled");
const hookCommittedFiles = git(hookSideEffectTarget, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split(/\r?\n/).filter(Boolean);
assert(hookCommittedFiles.length === 1 && hookCommittedFiles[0] === hookAllowed, "governance sync commit should not include files from local hooks");
assert(!fs.existsSync(path.join(hookSideEffectTarget, "HOOK_SIDE_EFFECT.txt")), "post-commit mutation hook should not run for CLI-owned governance commits");

const preCommitStageTarget = path.join(tmpRoot, "governance-pre-commit-stage-target");
fs.mkdirSync(preCommitStageTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", preCommitStageTarget]);
git(preCommitStageTarget, ["init"]);
git(preCommitStageTarget, ["config", "user.name", "Harness Test"]);
git(preCommitStageTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(preCommitStageTarget, ["add", "."]);
git(preCommitStageTarget, ["commit", "-m", "test fixture baseline"]);
const preCommitHookPath = path.join(preCommitStageTarget, ".git/hooks/pre-commit");
fs.writeFileSync(preCommitHookPath, "#!/bin/sh\nprintf hook > HOOK_STAGED.txt\ngit add HOOK_STAGED.txt\n");
fs.chmodSync(preCommitHookPath, 0o755);
const prepareCommitHookPath = path.join(preCommitStageTarget, ".git/hooks/prepare-commit-msg");
fs.writeFileSync(prepareCommitHookPath, "#!/bin/sh\nprintf hook > HOOK_PREPARED.txt\ngit add HOOK_PREPARED.txt\n");
fs.chmodSync(prepareCommitHookPath, 0o755);
const preCommitAllowed = "coding-agent-harness/planning/tasks/direct-pre-commit-stage/task_plan.md";
const preCommitContext = beginGovernanceSync(normalizeTarget(preCommitStageTarget), {
  operation: "pre-commit-stage-test",
  allowDirtyWorktree: true,
  allowedRelativePaths: [preCommitAllowed],
});
let preCommitResult: GovernanceCommit | undefined;
try {
  fs.mkdirSync(path.dirname(path.join(preCommitStageTarget, preCommitAllowed)), { recursive: true });
  fs.writeFileSync(path.join(preCommitStageTarget, preCommitAllowed), "# Direct Pre Commit Stage\n");
  preCommitResult = commitGovernanceSync(preCommitContext, [preCommitAllowed], { message: "pre commit stage fixture" });
} finally {
  releaseGovernanceSync(preCommitContext);
}
assert(preCommitResult?.committed === true, "governance sync should commit allowed files while bypassing local pre-commit mutation hooks");
const preCommitFiles = git(preCommitStageTarget, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split(/\r?\n/).filter(Boolean);
assert(preCommitFiles.length === 1 && preCommitFiles[0] === preCommitAllowed, "governance sync commit should contain only allowlisted files");
assert(!fs.existsSync(path.join(preCommitStageTarget, "HOOK_STAGED.txt")), "pre-commit mutation hook should not run for CLI-owned governance commits");
assert(!fs.existsSync(path.join(preCommitStageTarget, "HOOK_PREPARED.txt")), "prepare-commit-msg mutation hook should not run for CLI-owned governance commits");

const lockDir = path.join(target, ".harness/locks");
fs.mkdirSync(lockDir, { recursive: true });
fs.writeFileSync(path.join(lockDir, "governance-sync.lock"), "held by test\n");
const lockResult = run(["new-task", "lock-refused", "--title", "Lock Refused", target]);
assert(lockResult.status !== 0, "governance sync should refuse concurrent lock");
assert(lockResult.stderr.includes("lock already exists"), "lock refusal should explain concurrent registry write");
fs.rmSync(path.join(lockDir, "governance-sync.lock"));

fs.writeFileSync(path.join(lockDir, "governance-sync.lock"), JSON.stringify({ pid: 99999999, operation: "stale-test", host: currentHost() }, null, 2));
const staleLockCreated = expectJson<NewTaskResponse>(["new-task", "stale-lock-cleaned", "--title", "Stale Lock Cleaned", "--locale", "en-US", target]);
assert(staleLockCreated.governance?.commit?.committed === true, "dead-pid governance lock should be cleaned and allow sync to begin");
assert(!fs.existsSync(path.join(lockDir, "governance-sync.lock")), "dead-pid governance lock should be removed after successful sync release");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "dead-pid lock retry should leave git clean");

const foreignLockContent = `${JSON.stringify({ pid: 99999999, operation: "foreign-stale-test", host: "other-host.example.invalid" }, null, 2)}\n`;
fs.writeFileSync(path.join(lockDir, "governance-sync.lock"), foreignLockContent);
const foreignLockResult = run(["new-task", "foreign-lock-refused", "--title", "Foreign Lock Refused", target]);
assert(foreignLockResult.status !== 0, "governance sync should refuse dead-pid locks from another host");
assert(fs.readFileSync(path.join(lockDir, "governance-sync.lock"), "utf8") === foreignLockContent, "governance sync must not remove foreign-host locks");
fs.rmSync(path.join(lockDir, "governance-sync.lock"));

const liveLockPath = path.join(lockDir, "governance-sync.lock");
const liveLockContent = `${JSON.stringify({ pid: process.pid, operation: "live-test" }, null, 2)}\n`;
fs.writeFileSync(liveLockPath, liveLockContent);
const liveLockResult = run(["new-task", "live-lock-refused", "--title", "Live Lock Refused", target]);
assert(liveLockResult.status !== 0, "governance sync should refuse a lock owned by a live process");
assert(liveLockResult.stderr.includes("lock already exists"), "live lock refusal should explain concurrent registry write");
assert(fs.readFileSync(liveLockPath, "utf8") === liveLockContent, "governance sync must not remove a live lock");
fs.rmSync(liveLockPath);

const lessonTask = expectJson<NewTaskResponse>(["new-task", "governance-lesson", "--title", "Governance Lesson", "--locale", "en-US", target]);
const lessonCandidatePath = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-governance-lesson/lesson_candidates.md`);
writePromotableCandidate(lessonCandidatePath, "LC-20260521-002", "Promotion commit must be automatic");
git(target, ["add", lessonCandidatePath]);
git(target, ["commit", "-m", "test fixture: queue lesson promotion"]);
const promoted = expectJson<LessonPromoteResponse>(["lesson-promote", "governance-lesson", "LC-20260521-002", "--apply", target]);
assert(promoted.governance?.commit?.committed === true, "lesson-promote --apply should auto-commit governance writes");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "lesson-promote --apply should leave git clean");
assert(
  git(target, ["log", "-1", "--format=%s"]).stdout.trim() === "chore(harness): promote lesson LC-20260521-002",
  "lesson-promote commit subject should identify the promoted candidate",
);
const promotedPaths = git(target, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split(/\r?\n/).filter(Boolean).sort();
assert(
  JSON.stringify(promotedPaths) === JSON.stringify([
    "coding-agent-harness/governance/lessons/L-2026-05-21-002-promotion-commit-must-be-automatic.md",
    `coding-agent-harness/planning/tasks/${todayLocal}-governance-lesson/lesson_candidates.md`,
  ].sort()),
  "lesson-promote commit should only include the detail doc and source candidate file",
);

const dirtyLessonTask = expectJson<NewTaskResponse>(["new-task", "dirty-lesson", "--title", "Dirty Lesson", "--locale", "en-US", target]);
const dirtyLessonCandidatePath = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-dirty-lesson/lesson_candidates.md`);
writePromotableCandidate(dirtyLessonCandidatePath, "LC-20260521-003", "Dirty promotion must be refused");
git(target, ["add", dirtyLessonCandidatePath]);
git(target, ["commit", "-m", "test fixture: queue dirty lesson promotion"]);
fs.writeFileSync(path.join(target, "UNRELATED.txt"), "dirty\n");
const dirtyPromote = run(["lesson-promote", "dirty-lesson", "LC-20260521-003", "--apply", target]);
assert(dirtyPromote.status !== 0, "lesson-promote --apply should refuse dirty git targets before writing");
assert(dirtyPromote.stderr.includes("clean Git working tree"), "lesson-promote dirty refusal should explain clean git requirement");
fs.rmSync(path.join(target, "UNRELATED.txt"));

console.log("Governance sync tests passed");

function git(cwd: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function currentHost(): string {
  return process.env.HOSTNAME || os.hostname() || "";
}

function writePromotableCandidate(candidatePath: string, candidateId: string, title: string): void {
  fs.writeFileSync(
    candidatePath,
    fs.readFileSync(candidatePath, "utf8")
      .replace("| Task-level status | pending-review |", "| Task-level status | needs-promotion |")
      .replace("| Review decision | pending-human-review |", "| Review decision | accepted-for-promotion |")
      .replace("| Promotion state | not-promoted |", "| Promotion state | queued |")
      .replace("| Closeout token | pending |", `| Closeout token | queued-promotion:${candidateId} |`)
      .replace(
        "| --- | --- | --- | --- | --- | --- |",
        `| --- | --- | --- | --- | --- | --- |\n| ${candidateId} | needs-promotion | ${title} | Agents forget proactive commits when contracts are implicit | accepted-for-promotion | references/execution-workflow-standard.md |`,
      ),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
