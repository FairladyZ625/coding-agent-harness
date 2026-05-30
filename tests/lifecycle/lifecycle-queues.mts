#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { confirmTaskReview } from "../../scripts/lib/task-lifecycle.mjs";
import { parseReviewConfirmation } from "../../scripts/lib/task-review-model.mjs";
import type { HarnessTestLooseJson } from "../helpers/harness-test-types.js";
import {
  acceptNoLessonCandidate,
  assert,
  expectJson,
  expectPass,
  run,
  sanitizeTemplateFixtureMaterials,
  tmpRoot,
  todayLocal,
} from "../helpers/harness-test-utils.mjs";

const parserTaskKey = `TASKS/${todayLocal}-parser-confirmation`;

function runReviewConfirm(taskId: string, confirmText: string, message = "review confirmed"): SpawnSyncReturns<string> {
  try {
    const payload = confirmTaskReview(target, taskId, {
      reviewer: "Human Reviewer",
      message,
      confirmText,
    });
    return { status: 0, stdout: `${JSON.stringify(payload)}\n`, stderr: "" } as SpawnSyncReturns<string>;
  } catch (error) {
    return { status: 1, stdout: "", stderr: `${error instanceof Error ? error.message : String(error || "unknown error")}\n` } as SpawnSyncReturns<string>;
  }
}

function expectReviewConfirmJson(taskId: string, confirmText: string, message = "review confirmed"): HarnessTestLooseJson {
  const result = runReviewConfirm(taskId, confirmText, message);
  assert(result.status === 0, `review confirmation failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return JSON.parse(result.stdout) as HarnessTestLooseJson;
}

const writeOnlyParsed = parseReviewConfirmation(
  [
    "## Human Review Confirmation",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Confirmation ID | HRC-20260523000200 |",
    "| Confirmed At | 2026-05-23T00:02:00+08:00 |",
    "| Reviewer | Human Reviewer |",
    "| Reviewer Email | reviewer@example.test |",
    `| Task Key | ${parserTaskKey} |`,
    `| Confirm Text | ${todayLocal}-parser-confirmation |`,
    "| Evidence Checked | command:TARGET:npm-test:passed |",
    "| Commit SHA | pending |",
    "| Audit Status | write-only |",
    "",
  ].join("\n"),
  { taskKey: parserTaskKey },
);
assert(writeOnlyParsed === null, "hard cutover parser must not read legacy Human Review Confirmation blocks from review.md");

const mismatchedConfirmTextParsed = parseReviewConfirmation(
  [
    "## Human Review Confirmation",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Confirmation ID | HRC-20260523000300 |",
    "| Confirmed At | 2026-05-23T00:03:00+08:00 |",
    "| Reviewer | Human Reviewer |",
    "| Reviewer Email | reviewer@example.test |",
    `| Task Key | ${parserTaskKey} |`,
    "| Confirm Text | wrong-task |",
    "| Evidence Checked | command:TARGET:npm-test:passed |",
    "| Commit SHA | 0123456789abcdef0123456789abcdef01234567 |",
    "| Audit Status | committed |",
    "",
  ].join("\n"),
  { taskKey: parserTaskKey },
);
assert(mismatchedConfirmTextParsed === null, "hard cutover parser must not validate legacy Human Review Confirmation blocks from review.md");

const fakeCommittedParsed = parseReviewConfirmation(
  [
    "## Human Review Confirmation",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Confirmation ID | HRC-20260523000400 |",
    "| Confirmed At | 2026-05-23T00:04:00+08:00 |",
    "| Reviewer | Human Reviewer |",
    "| Reviewer Email | reviewer@example.test |",
    `| Task Key | ${parserTaskKey} |`,
    `| Confirm Text | ${todayLocal}-parser-confirmation |`,
    "| Evidence Checked | command:TARGET:npm-test:passed |",
    "| Commit SHA | deadbeefdeadbeefdeadbeefdeadbeefdeadbeef |",
    "| Audit Status | committed |",
    "",
  ].join("\n"),
  { taskKey: parserTaskKey },
);
assert(fakeCommittedParsed === null, "hard cutover parser must not fallback to legacy review.md confirmation data");

const target = path.join(tmpRoot, "lifecycle-queues-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", target]);

const authAudit = expectJson(["new-task", "subagent-auth-audit", "--title", "Subagent Auth Audit", "--locale", "en-US", target]);
const authAuditDir = taskDirectory(authAudit);
const authStrategyPath = path.join(authAuditDir, "execution_strategy.md");
let authStrategy = fs.readFileSync(authStrategyPath, "utf8");
assert(authStrategy.includes("## Subagent Authorization"), "execution strategy should record subagent authorization state");
assert(authStrategy.includes("reviewer subagent | allowed by default | read-only"), "reviewer subagent should be allowed by default for read-only review");
assert(authStrategy.includes("worker subagent | not authorized"), "worker subagent should start unauthorized");
assert(authStrategy.includes("## Subagent Delegation Decision"), "execution strategy should prompt an explicit subagent delegation decision");
assert(authStrategy.includes("Would a worker subagent materially help?"), "execution strategy should prompt the coordinator to consider worker subagent use");
assert(authStrategy.includes("even if the user never mentions subagents"), "execution strategy should not depend on the user knowing about subagents");
assert(authStrategy.includes("This task is suitable for a worker subagent"), "execution strategy should include a direct worker authorization request");
assert(authStrategy.includes("It is fine to say \"subagent\" or \"worker\" to the user"), "execution strategy should allow user-facing subagent wording");
assert(authStrategy.includes("immediately ask for the independent execution helper authorization"), "execution strategy should not indefinitely defer worker authorization when slices are clear");
fs.writeFileSync(authStrategyPath, authStrategy.replace("worker subagent | not authorized", "worker subagent | authorized"));
const incompleteAuthCheck = run(["check", "--profile", "target-project", target]);
assert(incompleteAuthCheck.status !== 0, "check should reject authorized worker subagents without authorization details");
assert(incompleteAuthCheck.stderr.includes("worker subagent authorization is incomplete"), "worker authorization audit should explain missing fields");
authStrategy = fs.readFileSync(authStrategyPath, "utf8").replace("worker subagent | authorized", "worker subagent | not authorized");
fs.writeFileSync(authStrategyPath, authStrategy);

const created = expectJson([
  "new-task",
  "queue-ready",
  "--title",
  "Queue Ready",
  "--locale",
  "en-US",
  "--long-running",
  target,
]);
const taskId = created.task.id;
const taskDir = taskDirectory(created);
const reviewPath = path.join(taskDir, "review.md");
const progressPath = path.join(taskDir, "progress.md");
const lessonPath = path.join(taskDir, "lesson_candidates.md");

let missingStatus = expectJson(["status", "--json", target]);
let missingTask = missingStatus.tasks.find((task) => task.id === taskId);
assert(!missingTask.taskQueues.includes("missing-materials"), "planned complex task should not enter missing-materials before review is requested");
assert(missingTask.reviewQueueState === "not-in-queue", "planned complex task should stay outside the review queue");
assert(!missingTask.queueReasons.some((reason) => reason.code === "missing-review-submission"), "planned task should not demand review submission before review is requested");
assert(!missingTask.repairPrompt.includes("Do not write Human Review Confirmation"), "planned task should not receive a review repair prompt");

expectJson(["task-start", "queue-ready", "--message", "implementation started", target]);
const activeStatus = expectJson(["status", "--json", target]);
const activeTask = activeStatus.tasks.find((task) => task.id === taskId);
assert(!activeTask.taskQueues.includes("missing-materials"), "in-progress complex task should not enter missing-materials before review is requested");
assert(activeTask.reviewQueueState === "not-in-queue", "in-progress complex task should stay outside the review queue");

expectJson(["task-phase", "queue-ready", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
acceptNoLessonCandidate(taskDir);
expectJson(["task-review", "queue-ready", "--message", "ready for human review", "--evidence", "command:TARGET:npm-test:passed", target]);
sanitizeTemplateFixtureMaterials(taskDir);

const afterSubmitReview = fs.readFileSync(reviewPath, "utf8");
assert(afterSubmitReview.includes("## Agent Review Submission"), "task-review should write strict Agent Review Submission block");
assert(afterSubmitReview.includes("| Task Key |"), "Agent Review Submission should include Task Key");
assert(!afterSubmitReview.includes("| Confirmation ID | HRC-"), "task-review must not write a completed Human Review Confirmation block");

fs.appendFileSync(path.join(taskDir, "walkthrough.md"), "\n## Evidence\n\nEvidence reviewed.\n");

let readyStatus = expectJson(["status", "--json", target]);
let readyTask = readyStatus.tasks.find((task) => task.id === taskId);
assert(readyTask.reviewSubmitted === true, "status should expose strict reviewSubmitted");
assert(readyTask.materialsReady === true, "submitted task with required materials should be materialsReady");
assert(readyTask.taskQueues.includes("review"), "ready submitted task should enter canonical review queue");
assert(readyTask.reviewQueueState === "ready-to-confirm", "compat reviewQueueState should remain ready-to-confirm");

fs.writeFileSync(
  reviewPath,
  afterSubmitReview
    .replace(`| Task Key | ${taskId} |`, "| Task Key | TASKS/2026-05-23-copied-review-packet |")
    .replace(/(\| Materials Checklist Hash \| )[^|]+(\|)/, "$1[placeholder hash] $2"),
);
const mismatchedSubmissionStatus = expectJson(["status", "--json", target]);
const mismatchedSubmissionTask = mismatchedSubmissionStatus.tasks.find((task) => task.id === taskId);
assert(!mismatchedSubmissionTask.taskQueues.includes("review"), "copied Agent Review Submission with another Task Key must not enter review queue");
assert(mismatchedSubmissionTask.queueReasons.some((reason) => reason.code === "invalid-review-submission-task-key"), "Task Key mismatch should be explained as invalid review submission");

fs.writeFileSync(
  reviewPath,
  `${afterSubmitReview}\n\n## Human Review Confirmation\n\nReviewer: Missing Fields\n\n`,
);
let looseConfirmStatusResult = run(["status", "--json", target]);
assert(looseConfirmStatusResult.status !== 0, "legacy Human Review Confirmation should fail hard cutover status");
let looseConfirmStatus = JSON.parse(looseConfirmStatusResult.stdout) as HarnessTestLooseJson;
let looseConfirmTask = looseConfirmStatus.tasks.find((task) => task.id === taskId);
assert(looseConfirmTask.reviewStatus !== "confirmed", "heading-only Human Review Confirmation must not count as confirmed");
assert(looseConfirmTask.materialIssues.some((issue) => issue.code === "legacy-human-review-confirmation"), "legacy Human Review Confirmation should be reported as a migration action");

fs.writeFileSync(
  reviewPath,
  replaceHumanConfirmationSection(afterSubmitReview, [
    "## Human Review Confirmation",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Confirmation ID | HRC-20260523000100 |",
    "| Confirmed At | 2026-05-23T00:01:00+08:00 |",
    "| Reviewer | Human Reviewer |",
    "| Reviewer Email | reviewer@example.test |",
    "| Task Key | TASKS/2026-05-23-other-task |",
    "| Confirm Text | 2026-05-23-other-task |",
    "| Evidence Checked | command:TARGET:npm-test:passed |",
    "| Commit SHA | pending |",
    "| Audit Status | write-only |",
    "",
  ].join("\n")),
);
let mismatchedConfirmStatusResult = run(["status", "--json", target]);
assert(mismatchedConfirmStatusResult.status !== 0, "legacy Human Review Confirmation with mismatched data should fail hard cutover status");
let mismatchedConfirmStatus = JSON.parse(mismatchedConfirmStatusResult.stdout) as HarnessTestLooseJson;
let mismatchedConfirmTask = mismatchedConfirmStatus.tasks.find((task) => task.id === taskId);
assert(mismatchedConfirmTask.reviewStatus !== "confirmed", "Human Review Confirmation with another Task Key must not count as confirmed");
assert(mismatchedConfirmTask.materialIssues.some((issue) => issue.code === "legacy-human-review-confirmation"), "legacy Human Review Confirmation mismatch should route to migration");

fs.writeFileSync(
  reviewPath,
  afterSubmitReview
    .replace(
      "| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |",
      "| ID | 严重级别 | 发现 | 已检查证据 | Required Action | 是否开放 | 处置 | 是否阻塞发布 | Follow-up |",
    )
    .replace(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| R-中文 | P1 | 仍有阻塞 | TARGET:coding-agent-harness/planning/tasks/x/review.md | 修复后再确认 | 是 | open | 是 | agent |",
    ),
);
const blockedStatusResult = run(["status", "--json", target]);
assert(blockedStatusResult.stdout.trim().startsWith("{"), "blocked status should still emit JSON");
const blockedStatus = JSON.parse(blockedStatusResult.stdout) as HarnessTestLooseJson;
const blockedTask = blockedStatus.tasks.find((task) => task.id === taskId);
assert(blockedTask.taskQueues.includes("blocked"), "Chinese open/blocking finding should enter blocked queue");
const blockedConfirm = runReviewConfirm(taskId, `${todayLocal}-queue-ready`);
assert(blockedConfirm.status !== 0, "review-confirm should reject blocked queue tasks");
assert(blockedConfirm.stderr.includes("blocking review findings"), "blocked confirmation failure should explain finding blocker");

fs.writeFileSync(reviewPath, afterSubmitReview);
commitFixtureBaseline(target, "before queue review confirmation");
const confirmed = expectReviewConfirmJson(taskId, `${todayLocal}-queue-ready`, "review packet checked");
assert(confirmed.task.reviewStatus === "confirmed", "review-confirm should produce confirmed status");
const confirmationIndex = fs.readFileSync(path.join(taskDir, "INDEX.md"), "utf8");
assert(confirmationIndex.includes("| Confirmation ID |"), "INDEX Human Review fields should include strict confirmation fields");
assert(confirmationIndex.includes("| Audit Status | committed |"), "INDEX Human Review fields should include audit status");
assert(!fs.readFileSync(reviewPath, "utf8").includes("## Human Review Confirmation"), "review-confirm should not write Human Review Confirmation to review.md");
const confirmedReadyStatus = expectJson(["status", "--json", target]);
const confirmedReadyTask = confirmedReadyStatus.tasks.find((task) => task.id === taskId);
assert(confirmedReadyTask.reviewStatus === "confirmed", "confirmed review should stay visible as confirmed status");
assert(confirmedReadyTask.lifecycleState === "confirmed-finalization-pending", "confirmed review without lesson debt should be ready for closeout, not in_review");
assert(confirmedReadyTask.taskQueues.includes("confirmed-finalization-pending"), "confirmed review without lesson debt should enter the closeout-ready queue");
assert(!confirmedReadyTask.taskQueues.includes("review"), "confirmed review should not stay in the Review queue");

const lessonTask = expectJson(["new-task", "queue-lesson", "--title", "Queue Lesson", "--locale", "en-US", "--long-running", target]);
const lessonDir = taskDirectory(lessonTask);
expectJson(["task-start", "queue-lesson", "--message", "implementation started", target]);
expectJson(["task-phase", "queue-lesson", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
fs.writeFileSync(
  path.join(lessonDir, "lesson_candidates.md"),
  [
    "# Queue Lesson - Lesson Candidates",
    "",
    "## Candidate Status",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Schema version | lesson-candidate-v1 |",
    "| Task-level status | needs-promotion |",
    "| Review decision | approved-for-sedimentation |",
    "| Promotion state | queued |",
    "| Closeout token | pending |",
    "",
    "## Candidates",
    "",
    "| ID | Row Status | Title | Review Decision | Promotion Target | Follow-up Task |",
    "| --- | --- | --- | --- | --- | --- |",
    "| LC-QUEUE-LESSON | needs-promotion | Preserve queue lifecycle lesson | approved | lesson detail docs | pending |",
    "",
  ].join("\n"),
);
const invalidLessonStatus = expectJson(["status", "--json", target]);
const invalidLessonTask = invalidLessonStatus.tasks.find((task) => task.id === lessonTask.task.id);
assert(invalidLessonTask.lessonCandidateIssues.includes("missing-column:Scope"), "needs-promotion lesson rows should require Scope column");
assert(invalidLessonTask.lessonCandidateIssues.includes("missing-column:Boundary Reason"), "needs-promotion lesson rows should require Boundary Reason column");
assert(invalidLessonTask.lessonCandidateIssues.some((issue) => issue.includes("missing-row-field:LC-QUEUE-LESSON:Conflict Check")), "needs-promotion lesson rows should require conflict check value");
assert(invalidLessonTask.lessonCandidateIssues.includes("missing-column:Detail Artifact"), "needs-promotion lesson rows should require Detail Artifact column");

fs.writeFileSync(
  path.join(lessonDir, "lesson_candidates.md"),
  [
    "# Queue Lesson - Lesson Candidates",
    "",
    "## Candidate Status",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Schema version | lesson-candidate-v1 |",
    "| Task-level status | needs-promotion |",
    "| Review decision | approved-for-sedimentation |",
    "| Promotion state | queued |",
    "| Closeout token | pending |",
    "",
    "## Candidates",
    "",
    "| ID | Row Status | Title | Scope | Module Key | Detail Artifact | Boundary Reason | Why It Might Matter | Review Decision | Promotion Target | Conflict Check | Required Standard Update | Follow-up Task |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "| LC-QUEUE-LESSON | needs-promotion | Preserve queue lifecycle lesson | global | n/a | lessons/LC-QUEUE-LESSON.md | Queue model affects all harness users | Prevents Review queue from absorbing lesson work | approved | lesson detail docs | no matching lesson found | task-state-machine docs | pending |",
    "",
  ].join("\n"),
);
const missingDetailArtifactStatus = expectJson(["status", "--json", target]);
const missingDetailArtifactTask = missingDetailArtifactStatus.tasks.find((task) => task.id === lessonTask.task.id);
assert(
  missingDetailArtifactTask.lessonCandidateIssues.includes("missing-detail-artifact:LC-QUEUE-LESSON:lessons/LC-QUEUE-LESSON.md"),
  "needs-promotion lesson rows should require the task-local detail artifact file to exist",
);

fs.mkdirSync(path.join(lessonDir, "lessons"), { recursive: true });
fs.writeFileSync(
  path.join(lessonDir, "lessons/LC-QUEUE-LESSON.md"),
  [
    "# LC-QUEUE-LESSON - Preserve queue lifecycle lesson",
    "",
    "## Problem / Trigger",
    "",
    "The Lessons queue needs a durable detail artifact written while the source task context is still fresh.",
    "",
    "## Correct Rule",
    "",
    "Sedimentation follow-up work reviews this artifact instead of reconstructing the lesson from a brief row.",
    "",
  ].join("\n"),
);
commitFixtureBaseline(target, "before queue lesson review");
expectJson(["task-review", "queue-lesson", "--message", "ready except lesson promotion", "--evidence", "command:TARGET:npm-test:passed", target]);
fs.appendFileSync(path.join(lessonDir, "walkthrough.md"), "\n## Evidence\n\nEvidence reviewed.\n");
sanitizeTemplateFixtureMaterials(lessonDir);
const lessonStatus = expectJson(["status", "--json", target]);
const lessonStatusTask = lessonStatus.tasks.find((task) => task.id === lessonTask.task.id);
assert(lessonStatusTask.taskQueues.includes("lessons"), "needs-promotion lesson work should enter Lessons queue");
assert(!lessonStatusTask.taskQueues.includes("review"), "needs-promotion lesson work should not enter Review queue");
assert(lessonStatusTask.lessonCandidateRows[0].scope === "global", "lesson candidate parser should expose scope");
assert(lessonStatusTask.lessonCandidateRows[0].boundaryReason.includes("Queue model"), "lesson candidate parser should expose boundary reason");
assert(lessonStatusTask.lessonCandidateRows[0].detailArtifact === "lessons/LC-QUEUE-LESSON.md", "lesson candidate parser should expose detail artifact");
assert(lessonStatusTask.lessonCandidateRows[0].conflictCheck.includes("no matching"), "lesson candidate parser should expose conflict check");
assert(lessonStatusTask.lessonCandidateRows[0].followUpTask === "pending", "lesson candidate parser should expose follow-up task");
const lessonSedimentDryRun = expectJson(["lesson-sediment", lessonTask.task.id, "LC-QUEUE-LESSON", "--dry-run", target]);
assert(lessonSedimentDryRun.dryRun === true, "lesson-sediment --dry-run should not mutate files");
assert(lessonSedimentDryRun.prompt.includes("Source candidate: LC-QUEUE-LESSON"), "lesson-sediment should produce copyable prompt");
assert(lessonSedimentDryRun.prompt.includes("Detail artifact: TARGET:coding-agent-harness/planning/tasks"), "lesson-sediment prompt should link task-local lesson detail artifact");
const lessonSedimentationPreset = expectJson(["preset", "inspect", "lesson-sedimentation", "--json"]);
assert(lessonSedimentationPreset.id === "lesson-sedimentation", "lesson-sedimentation preset should be inspectable");
assert(expectJson(["preset", "check", "lesson-sedimentation", "--json"]).status === "pass", "lesson-sedimentation preset check should pass");
commitFixtureBaseline(target, "before lesson sediment follow-up task");
const lessonSediment = expectJson(["lesson-sediment", lessonTask.task.id, "LC-QUEUE-LESSON", target]);
assert(lessonSediment.preset === "lesson-sedimentation", "lesson-sediment should report preset");
assert(lessonSediment.followUpTask.id.startsWith("TASKS/"), "lesson-sediment should create a follow-up task");
assert(fs.existsSync(path.join(target, lessonSediment.followUpTask.path.replace(/^TARGET:/, ""), "artifacts/lesson-sedimentation-prompt.md")), "lesson-sediment should write prompt artifact");
const followUpBrief = fs.readFileSync(path.join(target, lessonSediment.followUpTask.path.replace(/^TARGET:/, ""), "brief.md"), "utf8");
assert(followUpBrief.includes("## 创建日期"), "lesson-sediment should create follow-up tasks using the target registry locale");
const followUpTaskPlan = fs.readFileSync(path.join(target, lessonSediment.followUpTask.path.replace(/^TARGET:/, ""), "task_plan.md"), "utf8");
assert(followUpTaskPlan.includes(`| Source Lesson Candidates | TARGET:coding-agent-harness/planning/tasks/${todayLocal}-queue-lesson/lesson_candidates.md |`), "lesson-sediment context should link the source lesson_candidates.md file");
assert(followUpTaskPlan.includes(`| Source Lesson Detail | TARGET:coding-agent-harness/planning/tasks/${todayLocal}-queue-lesson/lessons/LC-QUEUE-LESSON.md |`), "lesson-sediment context should link the source detail artifact");
assert(followUpTaskPlan.includes("The Lessons queue needs a durable detail artifact"), "lesson-sediment context should summarize the source detail artifact");
assert(followUpTaskPlan.includes("| Original Candidate Row |"), "lesson-sediment context should preserve the original candidate row");
assert(followUpTaskPlan.includes("Review Summary"), "lesson-sediment context should include source review summary");
assert(followUpTaskPlan.includes("Findings Summary"), "lesson-sediment context should include source findings summary");
const lessonCandidatesAfterSediment = fs.readFileSync(path.join(lessonDir, "lesson_candidates.md"), "utf8");
assert(lessonCandidatesAfterSediment.includes(lessonSediment.followUpTask.id), "lesson-sediment should record follow-up task id on source candidate");
const lessonConfirm = runReviewConfirm(lessonTask.task.id, `${todayLocal}-queue-lesson`);
assert(lessonConfirm.status !== 0, "review-confirm should reject tasks that are only in Lessons queue");
assert(lessonConfirm.stderr.includes("Review queue"), "Lessons queue confirmation failure should mention Review queue gate");

const confirmedLessonRouting = expectJson(["new-task", "queue-confirmed-lesson-routing", "--title", "Queue Confirmed Lesson Routing", "--locale", "en-US", "--long-running", target]);
const confirmedLessonRoutingDir = taskDirectory(confirmedLessonRouting);
expectJson(["task-start", "queue-confirmed-lesson-routing", "--message", "implementation started", target]);
expectJson(["task-phase", "queue-confirmed-lesson-routing", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
writeLessonRoutingCandidate(confirmedLessonRoutingDir, {
  taskStatus: "needs-promotion",
  rowStatus: "needs-promotion",
  promotionState: "queued",
  closeoutToken: "pending",
});
commitFixtureBaseline(target, "before confirmed lesson routing review");
expectJson(["task-review", "queue-confirmed-lesson-routing", "--message", "ready except lesson promotion", "--evidence", "command:TARGET:npm-test:passed", target]);
fs.appendFileSync(path.join(confirmedLessonRoutingDir, "walkthrough.md"), "\n## Evidence\n\nEvidence reviewed.\n");
sanitizeTemplateFixtureMaterials(confirmedLessonRoutingDir);
  writeNativeReviewConfirmation(target, confirmedLessonRoutingDir, confirmedLessonRouting.task.id, `${todayLocal}-queue-confirmed-lesson-routing`);
const confirmedLessonRoutingStatus = expectJson(["status", "--json", target]);
const confirmedLessonRoutingTask = confirmedLessonRoutingStatus.tasks.find((task) => task.id === confirmedLessonRouting.task.id);
assert(confirmedLessonRoutingTask.reviewStatus === "confirmed", "git-audited native confirmation should mark the routing fixture as human-confirmed");
assert(confirmedLessonRoutingTask.lifecycleState === "lesson-finalization-pending", "confirmed review with accepted lesson debt should wait for Lesson sedimentation");
assert(confirmedLessonRoutingTask.taskQueues.includes("lessons"), "confirmed review with accepted lesson debt should remain in Lessons queue");
assert(!confirmedLessonRoutingTask.taskQueues.includes("confirmed-finalization-pending"), "confirmed review with lesson debt should not be directly closeout-ready");

writeLessonRoutingCandidate(confirmedLessonRoutingDir, {
  taskStatus: "promoted",
  rowStatus: "promoted",
  promotionState: "promoted",
  closeoutToken: "promoted:LC-CONFIRMED-ROUTING",
});
const promotedLessonRoutingStatus = expectJson(["status", "--json", target]);
const promotedLessonRoutingTask = promotedLessonRoutingStatus.tasks.find((task) => task.id === confirmedLessonRouting.task.id);
assert(promotedLessonRoutingTask.lifecycleState === "confirmed-finalization-pending", "promoted lessons should make confirmed tasks closeout-ready");
assert(!promotedLessonRoutingTask.taskQueues.includes("lessons"), "promoted lessons should leave the Lessons queue");
assert(promotedLessonRoutingTask.taskQueues.includes("confirmed-finalization-pending"), "promoted lessons should enter the closeout-ready queue");

writeLessonRoutingCandidate(confirmedLessonRoutingDir, {
  taskStatus: "rejected",
  rowStatus: "rejected",
  promotionState: "not-promoted",
  closeoutToken: "rejected:LC-CONFIRMED-ROUTING",
});
const rejectedLessonRoutingStatus = expectJson(["status", "--json", target]);
const rejectedLessonRoutingTask = rejectedLessonRoutingStatus.tasks.find((task) => task.id === confirmedLessonRouting.task.id);
assert(rejectedLessonRoutingTask.lifecycleState === "confirmed-finalization-pending", "rejected lessons should make confirmed tasks closeout-ready");
assert(!rejectedLessonRoutingTask.taskQueues.includes("lessons"), "rejected lessons should leave the Lessons queue");
assert(rejectedLessonRoutingTask.taskQueues.includes("confirmed-finalization-pending"), "rejected lessons should enter the closeout-ready queue");

fs.appendFileSync(path.join(confirmedLessonRoutingDir, "walkthrough.md"), "\nCloseout Status: closed\n");
const closedLessonRoutingStatus = expectJson(["status", "--json", target]);
const closedLessonRoutingTask = closedLessonRoutingStatus.tasks.find((task) => task.id === confirmedLessonRouting.task.id);
assert(closedLessonRoutingTask.lifecycleState === "closed", "task-complete closeout should mark confirmed tasks closed");
assert(closedLessonRoutingTask.taskQueues.includes("finalized"), "closed confirmed tasks should enter the finalized queue");

const superseded = expectJson(["new-task", "queue-superseded", "--title", "Queue Superseded", "--locale", "en-US", target]);
const supersededDir = taskDirectory(superseded);
fs.appendFileSync(
  path.join(supersededDir, "task_plan.md"),
  [
    "",
    "## Task Tombstone",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| State | superseded |",
    `| Superseded By | ${taskId} |`,
    "| Reason | merged-duplicate-scope |",
    "| Operator | coordinator |",
    "| Timestamp | 2026-05-23T16:00:00+08:00 |",
    "| Reopen Eligible | yes |",
    "| Archive Eligible | no |",
    "",
  ].join("\n"),
);
const supersededStatus = expectJson(["status", "--json", target]);
const supersededTask = supersededStatus.tasks.find((task) => task.id === superseded.task.id);
assert(supersededTask.deletionState === "superseded", "tombstone should set deletionState superseded");
assert(supersededTask.hiddenByDefault === true, "superseded task should be hidden by default");
assert(supersededTask.taskQueues.includes("soft-deleted-superseded"), "superseded task should enter soft-deleted/superseded queue");
commitFixtureBaseline(target, "before queue delete fixture");

const deleteFixture = expectJson(["new-task", "queue-delete", "--title", "Queue Delete", "--locale", "en-US", target]);
expectJson(["task-delete", "queue-delete", "--reason", "wrong duplicate", target]);
let deleteStatus = expectJson(["status", "--json", target]);
assert(deleteStatus.tasks.find((task) => task.id === deleteFixture.task.id).deletionState === "soft-deleted", "task-delete should default to soft-delete tombstone");
expectJson(["task-reopen", "queue-delete", "--reason", "restore fixture", target]);
deleteStatus = expectJson(["status", "--json", target]);
assert(deleteStatus.tasks.find((task) => task.id === deleteFixture.task.id).deletionState === "active", "task-reopen should remove tombstone");

const riskyDelete = expectJson(["new-task", "queue-risky-delete", "--title", "Queue Risky Delete", "--locale", "en-US", target]);
expectJson(["task-start", "queue-risky-delete", "--message", "implementation started", target]);
const riskyDeleteWithoutAudit = run(["task-delete", "queue-risky-delete", "--reason", "duplicate", target]);
assert(riskyDeleteWithoutAudit.status !== 0, "soft deleting an in-progress task should require accountable confirmation");
assert(`${riskyDeleteWithoutAudit.stdout}\n${riskyDeleteWithoutAudit.stderr}`.includes("--confirm"), "risky soft delete failure should mention canonical confirmation");
expectJson(["task-delete", "queue-risky-delete", "--reason", "duplicate", "--deleted-by", "Task Owner <owner@example.invalid>", "--confirm", riskyDelete.task.id, target]);
deleteStatus = expectJson(["status", "--json", target]);
assert(deleteStatus.tasks.find((task) => task.id === riskyDelete.task.id).deletionState === "soft-deleted", "confirmed risky soft delete should write tombstone");

const hardDraft = expectJson(["new-task", "queue-hard-draft", "--title", "Queue Hard Draft", "--locale", "en-US", target]);
const hardDraftDir = taskDirectory(hardDraft);
expectJson(["task-delete", "queue-hard-draft", "--hard", "--confirm", hardDraft.task.id, "--reason", "created by mistake", "--deleted-by", "Task Owner <owner@example.invalid>", target]);
assert(!fs.existsSync(hardDraftDir), "hard delete should physically remove a safe draft task directory");
const unknownHardDraft = expectJson(["new-task", "queue-hard-unknown", "--title", "Queue Hard Unknown", "--locale", "en-US", target]);
const unknownHardDraftDir = taskDirectory(unknownHardDraft);
fs.writeFileSync(path.join(unknownHardDraftDir, "progress.md"), "# Queue Hard Unknown - Progress\n\n## Current Status\n\nunknown\n");
commitFixtureBaseline(target, "before unknown hard delete fixture");
const unknownHardDelete = run(["task-delete", "queue-hard-unknown", "--hard", "--confirm", unknownHardDraft.task.id, "--reason", "unknown migrated state", "--deleted-by", "Task Owner <owner@example.invalid>", target]);
assert(unknownHardDelete.status !== 0, "hard delete should reject unknown-state tasks even when their files look scaffold-only");
assert(`${unknownHardDelete.stdout}\n${unknownHardDelete.stderr}`.includes("state:unknown"), "unknown hard delete failure should name the unknown state");
fs.writeFileSync(path.join(unknownHardDraftDir, "progress.md"), "# Queue Hard Unknown - Progress\n\n## Current Status\n\nplanned\n");
commitFixtureBaseline(target, "restore unknown hard delete fixture");
const unsafeHardDelete = run(["task-delete", riskyDelete.task.id, "--hard", "--confirm", riskyDelete.task.id, "--reason", "try hard delete", "--deleted-by", "Task Owner <owner@example.invalid>", target]);
assert(unsafeHardDelete.status !== 0, "hard delete should reject tasks that already have lifecycle or tombstone history");
assert(`${unsafeHardDelete.stdout}\n${unsafeHardDelete.stderr}`.includes("safe draft"), "unsafe hard delete failure should explain the safe draft boundary");

const oldSupersede = expectJson(["new-task", "queue-old", "--title", "Queue Old", "--locale", "en-US", target]);
const newSupersede = expectJson(["new-task", "queue-new", "--title", "Queue New", "--locale", "en-US", target]);
expectJson(["task-supersede", "queue-old", "--by", "queue-new", "--reason", "merged duplicate", target]);
const commandSupersedeStatus = expectJson(["status", "--json", target]);
assert(commandSupersedeStatus.tasks.find((task) => task.id === oldSupersede.task.id).supersededBy === newSupersede.task.id, "task-supersede should record supersededBy");
assert(commandSupersedeStatus.tasks.find((task) => task.id === newSupersede.task.id).supersedes.includes(oldSupersede.task.id), "task-supersede should expose reverse supersedes edge on replacement task");
const riskyOldSupersede = expectJson(["new-task", "queue-risky-old", "--title", "Queue Risky Old", "--locale", "en-US", target]);
const riskyNewSupersede = expectJson(["new-task", "queue-risky-new", "--title", "Queue Risky New", "--locale", "en-US", target]);
expectJson(["task-start", "queue-risky-old", "--message", "implementation started", target]);
const riskySupersedeWithoutAudit = run(["task-supersede", "queue-risky-old", "--by", "queue-risky-new", "--reason", "merged duplicate", target]);
assert(riskySupersedeWithoutAudit.status !== 0, "superseding an in-progress task should require accountable confirmation");
expectJson(["task-supersede", "queue-risky-old", "--by", "queue-risky-new", "--reason", "merged duplicate", "--deleted-by", "Task Owner <owner@example.invalid>", "--confirm", riskyOldSupersede.task.id, target]);
const riskyOldPlan = fs.readFileSync(path.join(taskDirectory(riskyOldSupersede), "task_plan.md"), "utf8");
assert(riskyOldPlan.includes("| Operator | Task Owner <owner@example.invalid> |"), "confirmed risky supersede should record the accountable operator");
assert(expectJson(["status", "--json", target]).tasks.find((task) => task.id === riskyNewSupersede.task.id).supersedes.includes(riskyOldSupersede.task.id), "confirmed risky supersede should preserve the reverse supersedes edge");

const tombstoneExample = expectJson(["new-task", "queue-tombstone-example", "--title", "Queue Tombstone Example", "--locale", "en-US", target]);
const tombstoneExampleDir = taskDirectory(tombstoneExample);
fs.appendFileSync(
  path.join(tombstoneExampleDir, "task_plan.md"),
  [
    "",
    "### Tombstone schema example",
    "",
    "```markdown",
    "Supersedes: TASKS/fenced-example",
    "",
    "## Task Tombstone",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| State | superseded |",
    "| Superseded By | TASKS/example |",
    "| Reason | example-only |",
    "```",
    "",
  ].join("\n"),
);
let tombstoneExampleStatus = expectJson(["status", "--json", target]);
assert(tombstoneExampleStatus.tasks.find((task) => task.id === tombstoneExample.task.id).deletionState === "active", "fenced tombstone examples should not set deletionState");
commitFixtureBaseline(target, "before tombstone example command fixture");
expectJson(["task-delete", "queue-tombstone-example", "--soft", "--reason", "fixture delete", target]);
expectJson(["task-reopen", "queue-tombstone-example", "--reason", "fixture reopen", target]);
tombstoneExampleStatus = expectJson(["status", "--json", target]);
const reopenedTombstoneExample = tombstoneExampleStatus.tasks.find((task) => task.id === tombstoneExample.task.id);
assert(reopenedTombstoneExample.deletionState === "active", "task-reopen should remove real tombstone while preserving fenced examples");
assert(!reopenedTombstoneExample.supersedes.includes("TASKS/fenced-example"), "fenced supersedes examples should not create task relation edges");
assert(fs.readFileSync(path.join(tombstoneExampleDir, "task_plan.md"), "utf8").includes("```markdown\nSupersedes: TASKS/fenced-example"), "task-reopen should preserve fenced tombstone example text");

const taskIndex = expectJson(["task-index", "--json", target]);
const indexedReady = taskIndex.tasks.find((task) => task.taskKey === taskId);
assert(taskIndex.schemaVersion === "task-index/v2", "task-index should expose generated index schema");
assert(taskIndex.scannerVersion, "task-index should record scanner version");
assert(taskIndex.sourceFileHashes[taskId], "task-index should hash source task files");
assert(indexedReady.queues.includes("confirmed"), "task-index should include normalized queues");
assert(taskIndex.tasks.find((task) => task.taskKey === superseded.task.id).deletionState === "superseded", "task-index should include tombstone state");
assert(taskIndex.tasks.find((task) => task.taskKey === superseded.task.id).deleteReason === "merged-duplicate-scope", "task-index should expose tombstone reason for low-entropy disposition semantics");
assert(!taskIndex.tasks.some((task) => task.id.includes("/artifacts/") || task.id.includes("/references/")), "task-index must not treat nested artifact/reference task_plan.md files as tasks");

const nestedPlanCarrier = expectJson(["new-task", "queue-nested-plan-carrier", "--title", "Queue Nested Plan Carrier", "--locale", "en-US", target]);
const nestedPlanCarrierDir = taskDirectory(nestedPlanCarrier);
for (const nestedRelative of [
  "artifacts/copied-task/task_plan.md",
  "references/copied-task/task_plan.md",
]) {
  const nestedPath = path.join(nestedPlanCarrierDir, nestedRelative);
  fs.mkdirSync(path.dirname(nestedPath), { recursive: true });
  fs.writeFileSync(nestedPath, "# Nested copied task\n\nTask Contract: harness-task/v1\n");
}
const generatedNestedPlan = path.join(target, "coding-agent-harness/governance/generated/copied-task/task_plan.md");
fs.mkdirSync(path.dirname(generatedNestedPlan), { recursive: true });
fs.writeFileSync(generatedNestedPlan, "# Generated copied task\n\nTask Contract: harness-task/v1\n");
const nestedPlanIndex = expectJson(["task-index", "--json", target]);
assert(!nestedPlanIndex.tasks.some((task) => task.id.includes("copied-task")), "scanner should exclude nested artifacts, references, and generated task_plan.md files");

const invalidTombstone = expectJson(["new-task", "queue-invalid-tombstone", "--title", "Queue Invalid Tombstone", "--locale", "en-US", target]);
const invalidTombstoneDir = taskDirectory(invalidTombstone);
fs.appendFileSync(
  path.join(invalidTombstoneDir, "task_plan.md"),
  [
    "",
    "## Task Tombstone",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| State | archive |",
    "| Reason | typo fixture |",
    "",
  ].join("\n"),
);
const invalidTombstoneIndex = run(["task-index", "--json", target]);
assert(invalidTombstoneIndex.status !== 0, "unknown tombstone state should fail structurally instead of hiding the task");
assert(`${invalidTombstoneIndex.stdout}\n${invalidTombstoneIndex.stderr}`.includes("Invalid tombstone state"), "unknown tombstone failure should identify the invalid state");
fs.writeFileSync(
  path.join(invalidTombstoneDir, "task_plan.md"),
  fs.readFileSync(path.join(invalidTombstoneDir, "task_plan.md"), "utf8").replace(/\n## Task Tombstone\n[\s\S]*$/, "\n"),
);

expectPass(["check", "--profile", "target-project", target]);

const duplicateA = expectJson(["new-task", "queue-duplicate-a", "--title", "Queue Duplicate A", "--locale", "en-US", target]);
const duplicateB = expectJson(["new-task", "queue-duplicate-b", "--title", "Queue Duplicate B", "--locale", "en-US", target]);
for (const duplicate of [duplicateA, duplicateB]) {
  const duplicateDir = taskDirectory(duplicate);
  fs.appendFileSync(path.join(duplicateDir, "task_plan.md"), "\nTask Key: TASKS/duplicate-task-key\n");
}
const duplicateIndex = run(["task-index", "--json", target]);
assert(duplicateIndex.status !== 0, "task-index should reject duplicate explicit Task Key values");
assert(duplicateIndex.stderr.includes("Duplicate task key"), "duplicate task key failure should explain collision");
console.log("Lifecycle queue tests passed");

function replaceHumanConfirmationSection(content: string, replacement: string): string {
  const source = String(content || "").trimEnd();
  const pattern = /^##\s*(?:Human Review Confirmation|人工审查确认)\s*$[\s\S]*?(?=^##\s+|(?![\s\S]))/im;
  if (pattern.test(source)) return `${source.replace(pattern, replacement.trimEnd())}\n`;
  return `${source}\n\n${replacement.trimEnd()}\n`;
}

function taskDirectory(result: HarnessTestLooseJson): string {
  return path.join(target, result.task.path.replace(/^TARGET:/, ""));
}

function writeMigratedReviewConfirmation(taskDir: string, taskId: string, confirmText: string): void {
  const indexPath = path.join(taskDir, "INDEX.md");
  const indexContent = fs.readFileSync(indexPath, "utf8");
  const confirmationRows = [
    ["Human Review Status", "confirmed"],
    ["Confirmation ID", "HRC-20260523000200"],
    ["Confirmed At", "2026-05-23T00:02:00+08:00"],
    ["Reviewer", "Human Reviewer"],
    ["Reviewer Email", "reviewer@example.test"],
    ["Task Key", taskId],
    ["Confirm Text", confirmText],
    ["Evidence Checked", "command:TARGET:npm-test:passed"],
    ["Review Commit SHA", "0000000000000000000000000000000000000000"],
    ["Audit Source", "migrated-legacy-review"],
    ["Audit Status", "committed"],
  ];
  let updated = indexContent;
  for (const [field, value] of confirmationRows) {
    const rowPattern = new RegExp(`^\\| ${escapeRegExp(field)} \\|[^\\n]*\\|$`, "m");
    if (rowPattern.test(updated)) {
      updated = updated.replace(rowPattern, `| ${field} | ${value} |`);
    } else {
      updated = `${updated.trimEnd()}\n| ${field} | ${value} |\n`;
    }
  }
  fs.writeFileSync(indexPath, updated.endsWith("\n") ? updated : `${updated}\n`);
}

function writeNativeReviewConfirmation(targetRoot: string, taskDir: string, taskId: string, confirmText: string): void {
  const indexPath = path.join(taskDir, "INDEX.md");
  writeReviewConfirmationRows(indexPath, taskId, confirmText, "pending", "native-index");
  expectFixtureGit(targetRoot, ["add", "--", path.relative(targetRoot, indexPath)]);
  expectFixtureGit(targetRoot, ["commit", "-m", `chore: confirm review ${taskId.replace(/[^A-Za-z0-9._/-]+/g, "-")}`]);
  const commitSha = expectFixtureGit(targetRoot, ["rev-parse", "HEAD"]).stdout.trim();
  writeReviewConfirmationRows(indexPath, taskId, confirmText, commitSha, "native-index");
  expectFixtureGit(targetRoot, ["add", "--", path.relative(targetRoot, indexPath)]);
  expectFixtureGit(targetRoot, ["commit", "-m", `chore: record review confirmation audit ${taskId.replace(/[^A-Za-z0-9._/-]+/g, "-")}`]);
}

function writeReviewConfirmationRows(indexPath: string, taskId: string, confirmText: string, commitSha: string, auditSource: string): void {
  const indexContent = fs.readFileSync(indexPath, "utf8");
  const confirmationRows = [
    ["Human Review Status", "confirmed"],
    ["Confirmation ID", "HRC-20260523000200"],
    ["Confirmed At", "2026-05-23T00:02:00+08:00"],
    ["Reviewer", "Human Reviewer"],
    ["Reviewer Email", "reviewer@example.test"],
    ["Task Key", taskId],
    ["Confirm Text", confirmText],
    ["Evidence Checked", "command:TARGET:npm-test:passed"],
    ["Review Commit SHA", commitSha],
    ["Audit Source", auditSource],
    ["Audit Status", "committed"],
  ];
  let updated = indexContent;
  for (const [field, value] of confirmationRows) {
    const rowPattern = new RegExp(`^\\| ${escapeRegExp(field)} \\|[^\\n]*\\|$`, "m");
    if (rowPattern.test(updated)) {
      updated = updated.replace(rowPattern, `| ${field} | ${value} |`);
    } else {
      updated = `${updated.trimEnd()}\n| ${field} | ${value} |\n`;
    }
  }
  fs.writeFileSync(indexPath, updated.endsWith("\n") ? updated : `${updated}\n`);
}

function writeLessonRoutingCandidate(
  taskDir: string,
  {
    taskStatus,
    rowStatus,
    promotionState,
    closeoutToken,
  }: {
    taskStatus: string;
    rowStatus: string;
    promotionState: string;
    closeoutToken: string;
  },
): void {
  const detailDir = path.join(taskDir, "lessons");
  fs.mkdirSync(detailDir, { recursive: true });
  fs.writeFileSync(
    path.join(detailDir, "LC-CONFIRMED-ROUTING.md"),
    [
      "# LC-CONFIRMED-ROUTING - Confirmed review routing",
      "",
      "## Problem / Trigger",
      "",
      "Human-confirmed tasks must not remain in the Review lane after the review decision is final.",
      "",
      "## Correct Rule",
      "",
      "Lesson work blocks closeout only while the accepted candidate is still awaiting promotion or follow-up routing.",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(taskDir, "lesson_candidates.md"),
    [
      "# Queue Confirmed Lesson Routing - Lesson Candidates",
      "",
      "## Candidate Status",
      "",
      "| Field | Value |",
      "| --- | --- |",
      "| Schema version | lesson-candidate-v1 |",
      `| Task-level status | ${taskStatus} |`,
      "| Review decision | approved-for-sedimentation |",
      `| Promotion state | ${promotionState} |`,
      `| Closeout token | ${closeoutToken} |`,
      "",
      "## Candidates",
      "",
      "| ID | Row Status | Title | Scope | Module Key | Detail Artifact | Boundary Reason | Why It Might Matter | Review Decision | Promotion Target | Conflict Check | Required Standard Update | Follow-up Task |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      `| LC-CONFIRMED-ROUTING | ${rowStatus} | Confirmed review routing | global | n/a | lessons/LC-CONFIRMED-ROUTING.md | Lifecycle model affects every queue surface | Prevents confirmed tasks from staying in review forever | approved | lifecycle standard | no matching lesson found | task-state-machine docs | ${rowStatus === "needs-promotion" ? "pending" : "n/a"} |`,
      "",
    ].join("\n"),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function commitFixtureBaseline(targetRoot: string, message: string): void {
  if (!fs.existsSync(path.join(targetRoot, ".git"))) {
    expectFixtureGit(targetRoot, ["init"]);
    expectFixtureGit(targetRoot, ["config", "user.name", "Harness Test"]);
    expectFixtureGit(targetRoot, ["config", "user.email", "harness-test@example.invalid"]);
  }
  expectFixtureGit(targetRoot, ["add", "."]);
  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: targetRoot, encoding: "utf8" });
  if (diff.status === 0) return;
  expectFixtureGit(targetRoot, ["commit", "-m", `test fixture baseline: ${message}`]);
}

function expectFixtureGit(targetRoot: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd: targetRoot, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}
