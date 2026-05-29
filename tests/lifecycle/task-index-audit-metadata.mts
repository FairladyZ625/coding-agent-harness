#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import {
  acceptNoLessonCandidate,
  assert,
  cli,
  expectJson,
  node,
  repoRoot,
  run,
  sanitizeTemplateFixtureMaterials,
  tmpRoot,
  todayLocal,
} from "../helpers/harness-test-utils.mjs";

type HarnessTask = {
  id: string;
  shortId: string;
  path: string;
  reviewPath?: string;
};
type NewTaskResponse = {
  task: HarnessTask;
};
type MigrationPlanResponse = {
  summary?: { legacyAuditBlocks?: number };
  actions?: Array<{ taskId?: string }>;
};
type MigrationApplyResponse = {
  result?: string;
};
type ReviewConfirmPayload = {
  audit: { commitSha: string; auditCommitSha: string };
};
type ConfirmedTask = HarnessTask & {
  taskDir: string;
};

function git(target: string, args: string[]): SpawnSyncReturns<string> {
  return spawnSync("git", args, { cwd: target, encoding: "utf8" });
}

function expectGit(target: string, args: string[]): SpawnSyncReturns<string> {
  const result = git(target, args);
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function read(taskDir: string, file: string): string {
  return fs.readFileSync(path.join(taskDir, file), "utf8");
}

function taskDirFor(target: string, task: HarnessTask): string {
  return path.join(target, String(task.path).replace(/^TARGET:/, ""));
}

function prepareConfirmedTask(target: string, name: string): ConfirmedTask {
  const created = expectJson<NewTaskResponse>(["new-task", name, "--title", name, "--locale", "en-US", target]);
  const taskDir = taskDirFor(target, created.task);
  const walkthroughPath = path.join(taskDir, "walkthrough.md");
  fs.writeFileSync(walkthroughPath, `# Walkthrough: ${name}\n\n## Summary\n\nReview fixture.\n`);
  acceptNoLessonCandidate(taskDir);
  expectJson(["task-start", name, "--message", "start", target]);
  expectJson(["task-phase", name, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
  expectJson(["task-review", name, "--message", "submitted", "--evidence", "command:test", target]);
  sanitizeTemplateFixtureMaterials(taskDir);
  expectGit(target, ["init"]);
  expectGit(target, ["config", "user.name", "Harness Test"]);
  expectGit(target, ["config", "user.email", "harness-test@example.invalid"]);
  expectGit(target, ["add", "."]);
  expectGit(target, ["commit", "-m", "fixture baseline"]);
  return { ...created.task, taskDir };
}

const auditTarget = path.join(tmpRoot, "task-index-audit-target");
fs.mkdirSync(auditTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", auditTarget]);

const created = expectJson<NewTaskResponse>(["new-task", "index-audit-new-task", "--title", "INDEX audit new task", "--locale", "en-US", auditTarget]);
const createdDir = taskDirFor(auditTarget, created.task);
const createdIndex = read(createdDir, "INDEX.md");
const createdBrief = read(createdDir, "brief.md");
const createdReview = read(createdDir, "review.md");
assert(createdIndex.includes("## Task Audit Metadata"), "new-task should write Task Audit Metadata to INDEX.md");
for (const expected of [
  "| Created By | harness new-task |",
  "| Command Shape |",
  `| Created At | ${todayLocal} |`,
  "| Budget | standard |",
  "| Template Source |",
  "| Task Creator |",
  "| Task Creator Source |",
  "| Human Review Status | not-confirmed |",
  "| Audit Status | created |",
]) {
  assert(createdIndex.includes(expected), `INDEX audit metadata should include ${expected}`);
}
assert(!createdBrief.includes("## Scaffold Provenance"), "brief.md should not contain Scaffold Provenance after INDEX cutover");
assert(!createdReview.includes("## Human Review Confirmation"), "review.md should not contain Human Review Confirmation after INDEX cutover");

const confirmTask = prepareConfirmedTask(auditTarget, "index-audit-review-confirm");
const beforeConfirmReview = read(confirmTask.taskDir, "review.md");
const beforeConfirmProgress = read(confirmTask.taskDir, "progress.md");
const confirm = run([
  "review-confirm",
  confirmTask.shortId,
  "--reviewer",
  "Human Reviewer",
  "--message",
  "index audit confirmed",
  "--confirm",
  confirmTask.shortId,
  auditTarget,
]);
assert(confirm.status === 0, `review-confirm should pass\nSTDOUT:\n${confirm.stdout}\nSTDERR:\n${confirm.stderr}`);
const confirmPayload = JSON.parse(confirm.stdout) as ReviewConfirmPayload;
const confirmedIndex = read(confirmTask.taskDir, "INDEX.md");
assert(confirmedIndex.includes("| Human Review Status | confirmed |"), "review-confirm should mark INDEX human review status confirmed");
assert(confirmedIndex.includes(`| Review Commit SHA | ${confirmPayload.audit.commitSha} |`), "review-confirm should write the first confirmation commit SHA to INDEX");
assert(confirmedIndex.includes("| Audit Status | committed |"), "review-confirm should mark INDEX audit status committed");
assert(confirmedIndex.includes("| Confirm Text |"), "review-confirm should write confirmation text to INDEX");
assert(read(confirmTask.taskDir, "review.md") === beforeConfirmReview, "review-confirm should not mutate review.md");
assert(read(confirmTask.taskDir, "progress.md") === beforeConfirmProgress, "review-confirm should not mutate progress.md");
for (const sha of [confirmPayload.audit.commitSha, confirmPayload.audit.auditCommitSha]) {
  const files = expectGit(auditTarget, ["show", "--name-only", "--format=", sha]).stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(files.length === 1 && files[0] === `coding-agent-harness/planning/tasks/${confirmTask.shortId}/INDEX.md`, `review-confirm commit ${sha} should change only task INDEX.md, got ${files.join(", ")}`);
}

const migrationTarget = path.join(tmpRoot, "task-index-audit-migration-target");
fs.mkdirSync(migrationTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", migrationTarget]);
const legacy = expectJson<NewTaskResponse>(["new-task", "legacy-audit", "--title", "Legacy audit", "--locale", "en-US", migrationTarget]);
const legacyDir = taskDirFor(migrationTarget, legacy.task);
const legacyIndexPath = path.join(legacyDir, "INDEX.md");
fs.writeFileSync(legacyIndexPath, fs.readFileSync(legacyIndexPath, "utf8").replace("| Legacy Extra Fields | {} |", '| Legacy Extra Fields | {"Existing":"keep"} |'));
fs.appendFileSync(
  path.join(legacyDir, "brief.md"),
  `\n## Scaffold Provenance\n\n| Field | Value |\n| --- | --- |\n| Created By | manual-exception |\n| Command Shape | n/a |\n| Created At | ${todayLocal} |\n| Budget | standard |\n| Template Source | legacy fixture |\n| Exception Reason | imported from old task |\n`,
);
fs.appendFileSync(
  path.join(legacyDir, "review.md"),
  `\n## Human Review Confirmation\n\n| Field | Value |\n| --- | --- |\n| Confirmation ID | HRC-20260526010101 |\n| Confirmed At | 2026-05-26T01:01:01+08:00 |\n| Reviewer | Legacy Reviewer |\n| Reviewer Email | legacy@example.invalid |\n| Task Key | ${legacy.task.id} |\n| Confirm Text | ${legacy.task.shortId} |\n| Evidence Checked | command:test |\n| Commit SHA | 1234567890abcdef1234567890abcdef12345678 |\n| Audit Status | committed |\n| Message | legacy confirmation |\n| Extra Legacy Field | preserve me |\n`,
);
const migrationPlan = expectJson<MigrationPlanResponse>(["migrate-task-audit-index", "--json", migrationTarget]);
assert(migrationPlan.summary?.legacyAuditBlocks === 2, "migration plan should count legacy audit blocks");
assert(migrationPlan.actions?.some((action) => action.taskId === legacy.task.id), "migration plan should include the legacy task");
const migrationApply = expectJson<MigrationApplyResponse>(["migrate-task-audit-index", "--apply", "--json", migrationTarget]);
assert(migrationApply.result === "applied", "migration apply should report applied");
const migratedIndex = read(legacyDir, "INDEX.md");
assert(migratedIndex.includes("| Created By | manual-exception |"), "migration should move creation audit metadata to INDEX");
assert(migratedIndex.includes("| Human Review Status | confirmed |"), "migration should move review confirmation metadata to INDEX");
assert(migratedIndex.includes("| Audit Source | migrated-legacy-review |"), "migration should mark migrated legacy review source");
assert(migratedIndex.includes('"Existing":"keep"'), "migration should preserve existing Legacy Extra Fields entries");
assert(migratedIndex.includes('"Extra Legacy Field":"preserve me"'), "migration should preserve unknown concrete fields in Legacy Extra Fields");
assert(!read(legacyDir, "brief.md").includes("## Scaffold Provenance"), "migration should remove legacy Scaffold Provenance block");
assert(!read(legacyDir, "review.md").includes("## Human Review Confirmation"), "migration should remove legacy Human Review Confirmation block");

const looseLegacy = expectJson<NewTaskResponse>(["new-task", "legacy-loose-review", "--title", "Legacy loose review", "--locale", "en-US", migrationTarget]);
const looseLegacyDir = taskDirFor(migrationTarget, looseLegacy.task);
fs.appendFileSync(
  path.join(looseLegacyDir, "review.md"),
  `\n## Human Review Confirmation\n\nReviewer: Coordinator adversarial review\n\n| Confirmed At | Reviewer | Message | Evidence |\n| --- | --- | --- | --- |\n| 2026-05-21 02:02 | Coordinator adversarial review | Human review confirmed | ${looseLegacy.task.reviewPath} |\n`,
);
const pendingLegacy = expectJson<NewTaskResponse>(["new-task", "legacy-pending-review", "--title", "Legacy pending review", "--locale", "en-US", migrationTarget]);
const pendingLegacyDir = taskDirFor(migrationTarget, pendingLegacy.task);
fs.appendFileSync(
  path.join(pendingLegacyDir, "review.md"),
  `\n## Human Review Confirmation\n\n| Field | Value |\n| --- | --- |\n| Confirmation ID | pending-human |\n| Confirmed At | pending |\n| Reviewer | pending |\n| Reviewer Email | pending |\n| Task Key | ${pendingLegacy.task.shortId} |\n| Confirm Text | pending |\n| Evidence Checked | pending |\n| Commit SHA | pending |\n| Audit Status | ready-for-pr |\n`,
);
const looseApply = expectJson<MigrationApplyResponse>(["migrate-task-audit-index", "--apply", "--json", migrationTarget]);
assert(looseApply.result === "applied", "loose and pending legacy review migration should apply");
const looseIndex = read(looseLegacyDir, "INDEX.md");
assert(looseIndex.includes("| Human Review Status | confirmed |"), "loose legacy review should remain confirmed after migration");
assert(looseIndex.includes("| Review Commit SHA | legacy-unavailable |"), "loose legacy review should preserve unavailable native audit fields explicitly");
assert(looseIndex.includes("| Audit Source | migrated-legacy-review |"), "loose legacy review should not masquerade as native audit");
assert(!read(looseLegacyDir, "review.md").includes("## Human Review Confirmation"), "loose legacy review block should be removed after migration");
const pendingIndex = read(pendingLegacyDir, "INDEX.md");
assert(pendingIndex.includes("| Human Review Status | not-confirmed |"), "pending-human legacy review placeholder should migrate as not-confirmed");
assert(!read(pendingLegacyDir, "review.md").includes("## Human Review Confirmation"), "pending legacy review block should be removed after migration");

const malformed = expectJson<NewTaskResponse>(["new-task", "legacy-malformed", "--title", "Legacy malformed", "--locale", "en-US", migrationTarget]);
const malformedDir = taskDirFor(migrationTarget, malformed.task);
fs.appendFileSync(
  path.join(malformedDir, "review.md"),
  `\n## Human Review Confirmation\n\n| Field | Value |\n| --- | --- |\n| Confirmation ID | HRC-20260526020202 |\n| Confirmed At | 2026-05-26T02:02:02+08:00 |\n| Reviewer | Partial Reviewer |\n`,
);
const malformedApply = run(["migrate-task-audit-index", "--apply", "--json", migrationTarget]);
assert(malformedApply.status !== 0, "malformed concrete legacy confirmation should fail loudly");
assert(read(malformedDir, "review.md").includes("## Human Review Confirmation"), "failed migration should leave malformed source block untouched");

const invalidStatusTarget = path.join(tmpRoot, "task-index-audit-invalid-status-target");
fs.mkdirSync(invalidStatusTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", invalidStatusTarget]);
const invalidStatus = expectJson<NewTaskResponse>(["new-task", "legacy-invalid-status", "--title", "Legacy invalid status", "--locale", "en-US", invalidStatusTarget]);
const invalidStatusDir = taskDirFor(invalidStatusTarget, invalidStatus.task);
fs.appendFileSync(
  path.join(invalidStatusDir, "review.md"),
  `\n## Human Review Confirmation\n\n| Field | Value |\n| --- | --- |\n| Confirmation ID | HRC-20260526030303 |\n| Confirmed At | 2026-05-26T03:03:03+08:00 |\n| Reviewer | Invalid Status Reviewer |\n| Reviewer Email | invalid-status@example.invalid |\n| Task Key | ${invalidStatus.task.id} |\n| Confirm Text | ${invalidStatus.task.shortId} |\n| Evidence Checked | command:test |\n| Commit SHA | 1234567890abcdef1234567890abcdef12345678 |\n| Audit Status | ready-for-pr |\n`,
);
const invalidStatusApply = run(["migrate-task-audit-index", "--apply", "--json", invalidStatusTarget]);
assert(invalidStatusApply.status !== 0, "legacy confirmation with non-committed Audit Status should fail loudly");
assert(read(invalidStatusDir, "review.md").includes("## Human Review Confirmation"), "invalid status migration should leave source block untouched");

const invalidIndexTarget = path.join(tmpRoot, "task-index-audit-invalid-index-target");
fs.mkdirSync(invalidIndexTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", invalidIndexTarget]);
const invalidIndex = expectJson<NewTaskResponse>(["new-task", "invalid-index-audit", "--title", "Invalid INDEX audit", "--locale", "en-US", invalidIndexTarget]);
const invalidIndexPath = path.join(taskDirFor(invalidIndexTarget, invalidIndex.task), "INDEX.md");
fs.writeFileSync(
  invalidIndexPath,
  fs.readFileSync(invalidIndexPath, "utf8")
    .replace(`| Created At | ${todayLocal} |`, "| Created At | 2026-99-99 |")
    .replace("| Budget | standard |", "| Budget | not-a-budget |")
    .replace("| Audit Status | created |", "| Audit Status | ready-for-pr |"),
);
const invalidIndexCheck = run(["check", "--profile", "target-project", invalidIndexTarget]);
assert(invalidIndexCheck.status !== 0, "invalid Task Audit Metadata values should fail target-project check");
assert(invalidIndexCheck.stderr.includes("invalid Created At"), "invalid Created At should be reported");
assert(invalidIndexCheck.stderr.includes("invalid Budget"), "invalid Budget should be reported");
assert(invalidIndexCheck.stderr.includes("invalid Audit Status"), "invalid Audit Status should be reported");

console.log("Task INDEX audit metadata tests passed");
