#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
  releaseGovernanceSync,
} from "../../scripts/lib/governance-sync.mjs";

const target = path.join(tmpRoot, "governance-sync-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", target]);
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "test fixture baseline"]);

const created = expectJson(["new-task", "governance-owned", "--title", "Governance Owned", "--locale", "en-US", "--module", "sync", target]);
assert(created.governance?.commit?.committed === true, "new-task should auto-commit governance sync in git targets");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "new-task governance sync should leave git clean");
assert(git(target, ["log", "-1", "--format=%s"]).stdout.trim() === `chore(harness): register task ${created.task.id}`, "new-task commit subject should identify registered task");

const featurePath = path.join(target, "docs/09-PLANNING/Feature-SSoT.md");
const ledgerPath = path.join(target, "docs/Harness-Ledger.md");
const registryPath = path.join(target, "docs/09-PLANNING/Module-Registry.md");
const modulePlanPath = path.join(target, "docs/09-PLANNING/MODULES/sync/module_plan.md");
const moduleVisualPath = path.join(target, "docs/09-PLANNING/MODULES/sync/visual_map.md");
assert(!fs.existsSync(featurePath), "new-task --module should not create Feature SSoT lifecycle projection");
const ledgerContent = fs.readFileSync(ledgerPath, "utf8");
assert(ledgerContent.includes(`docs/09-PLANNING/MODULES/sync/${todayLocal}-governance-owned/task_plan.md`), "new-task should register task in Harness Ledger");
assert(ledgerContent.includes("| module | sync |"), "new-task --module should expose module scope in Harness Ledger");
assert(fs.readFileSync(registryPath, "utf8").includes("docs/09-PLANNING/MODULES/sync/module_plan.md"), "new-task --module should register module registry row");
assert(fs.readFileSync(modulePlanPath, "utf8").includes(`docs/09-PLANNING/MODULES/sync/${todayLocal}-governance-owned/task_plan.md`), "new-task --module should regenerate module plan index");
assert(fs.readFileSync(moduleVisualPath, "utf8").includes(`docs/09-PLANNING/MODULES/sync/${todayLocal}-governance-owned/task_plan.md`), "new-task --module should regenerate module visual map index");

fs.writeFileSync(path.join(target, "UNRELATED.txt"), "dirty\n");
const dirtyResult = expectJson(["new-task", "dirty-allowed", "--title", "Dirty Allowed", target]);
assert(dirtyResult.governance?.commit?.committed === true, "new-task should commit CLI-owned paths even when unrelated dirty files exist");
const dirtyAllowedStatus = git(target, ["status", "--short"]).stdout.trim().split(/\r?\n/).filter(Boolean);
assert(dirtyAllowedStatus.length === 1 && dirtyAllowedStatus[0] === "?? UNRELATED.txt", `new-task should leave unrelated dirty state untouched, got ${dirtyAllowedStatus.join(", ")}`);
const dirtyAllowedCommittedPaths = git(target, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split(/\r?\n/).filter(Boolean);
assert(dirtyAllowedCommittedPaths.every((file) => file.startsWith("docs/") || file.startsWith(".harness/")), "new-task scoped commit should not include unrelated dirty files");
const dirtyStatus = expectJson(["status", "--json", target]);
assert(dirtyStatus.git?.dirty === true, "status should expose dirty git state");
assert(dirtyStatus.git?.blocksCliAutoCommit === true, "dirty status should conservatively report that generic CLI auto-commit is blocked");
assert(
  dirtyStatus.checkState.details.warnings.some((warning) => warning.includes("dirty-state")),
  "status should still warn when dirty state remains after a scoped CLI commit",
);
fs.rmSync(path.join(target, "UNRELATED.txt"));

const overlapPath = path.join(target, "docs/Harness-Ledger.md");
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
const sideEffectAllowed = "docs/09-PLANNING/TASKS/direct-side-effect/task_plan.md";
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
  sideEffectRejected = String(error.message).includes("outside its write scope");
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
const dirtyMutationAllowed = "docs/09-PLANNING/TASKS/direct-dirty-mutation/task_plan.md";
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
  dirtyMutationRejected = String(error.message).includes("outside its write scope");
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
const hookAllowed = "docs/09-PLANNING/TASKS/direct-hook-side-effect/task_plan.md";
const hookContext = beginGovernanceSync(normalizeTarget(hookSideEffectTarget), {
  operation: "hook-side-effect-test",
  allowDirtyWorktree: true,
  allowedRelativePaths: [hookAllowed],
});
let hookSideEffectCommit;
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
const preCommitAllowed = "docs/09-PLANNING/TASKS/direct-pre-commit-stage/task_plan.md";
const preCommitContext = beginGovernanceSync(normalizeTarget(preCommitStageTarget), {
  operation: "pre-commit-stage-test",
  allowDirtyWorktree: true,
  allowedRelativePaths: [preCommitAllowed],
});
let preCommitResult;
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

const lessonTask = expectJson(["new-task", "governance-lesson", "--title", "Governance Lesson", "--locale", "en-US", target]);
const lessonCandidatePath = path.join(target, `docs/09-PLANNING/TASKS/${todayLocal}-governance-lesson/lesson_candidates.md`);
writePromotableCandidate(lessonCandidatePath, "LC-20260521-002", "Promotion commit must be automatic");
git(target, ["add", lessonCandidatePath]);
git(target, ["commit", "-m", "test fixture: queue lesson promotion"]);
const promoted = expectJson(["lesson-promote", "governance-lesson", "LC-20260521-002", "--apply", target]);
assert(promoted.governance?.commit?.committed === true, "lesson-promote --apply should auto-commit governance writes");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "lesson-promote --apply should leave git clean");
assert(
  git(target, ["log", "-1", "--format=%s"]).stdout.trim() === "chore(harness): promote lesson LC-20260521-002",
  "lesson-promote commit subject should identify the promoted candidate",
);
const promotedPaths = git(target, ["show", "--name-only", "--format=", "HEAD"]).stdout.trim().split(/\r?\n/).filter(Boolean).sort();
assert(
  JSON.stringify(promotedPaths) === JSON.stringify([
    "docs/01-GOVERNANCE/lessons/L-2026-05-21-002-promotion-commit-must-be-automatic.md",
    `docs/09-PLANNING/TASKS/${todayLocal}-governance-lesson/lesson_candidates.md`,
  ].sort()),
  "lesson-promote commit should only include the detail doc and source candidate file",
);

const dirtyLessonTask = expectJson(["new-task", "dirty-lesson", "--title", "Dirty Lesson", "--locale", "en-US", target]);
const dirtyLessonCandidatePath = path.join(target, `docs/09-PLANNING/TASKS/${todayLocal}-dirty-lesson/lesson_candidates.md`);
writePromotableCandidate(dirtyLessonCandidatePath, "LC-20260521-003", "Dirty promotion must be refused");
git(target, ["add", dirtyLessonCandidatePath]);
git(target, ["commit", "-m", "test fixture: queue dirty lesson promotion"]);
fs.writeFileSync(path.join(target, "UNRELATED.txt"), "dirty\n");
const dirtyPromote = run(["lesson-promote", "dirty-lesson", "LC-20260521-003", "--apply", target]);
assert(dirtyPromote.status !== 0, "lesson-promote --apply should refuse dirty git targets before writing");
assert(dirtyPromote.stderr.includes("clean Git working tree"), "lesson-promote dirty refusal should explain clean git requirement");
fs.rmSync(path.join(target, "UNRELATED.txt"));

console.log("Governance sync tests passed");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function writePromotableCandidate(candidatePath, candidateId, title) {
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
