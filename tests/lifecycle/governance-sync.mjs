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
const dirtyResult = run(["new-task", "dirty-refused", "--title", "Dirty Refused", target]);
assert(dirtyResult.status !== 0, "governance sync should refuse unrelated dirty files before writing");
assert(dirtyResult.stderr.includes("clean Git working tree"), "dirty refusal should explain clean git requirement");
const dirtyStatus = expectJson(["status", "--json", target]);
assert(dirtyStatus.git?.dirty === true, "status should expose dirty git state");
assert(
  dirtyStatus.checkState.details.warnings.some((warning) => warning.includes("dirty-state")),
  "status should warn when dirty state blocks CLI-owned auto-commit",
);
fs.rmSync(path.join(target, "UNRELATED.txt"));

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
