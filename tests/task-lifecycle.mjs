#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  acceptNoLessonCandidate,
  assert,
  cli,
  expectJson,
  expectPass,
  node,
  repoRoot,
  run,
  tmpRoot,
  todayLocal,
  waitForCondition,
  waitForWorkbench,
} from "./helpers/harness-test-utils.mjs";

const lifecycleTarget = path.join(tmpRoot, "lifecycle-target");
fs.mkdirSync(lifecycleTarget);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", lifecycleTarget]);
const lifecycleDryRun = expectJson(["new-task", "phase-2-lifecycle", "--title", "阶段二任务生命周期", "--locale", "zh-CN", "--dry-run", lifecycleTarget]);
assert(lifecycleDryRun.dryRun === true, "new-task dry-run should report dryRun true");
assert(
  lifecycleDryRun.changes.some((change) => change.destination.endsWith("brief.md") && change.action === "would-create"),
  "new-task dry-run should plan brief.md",
);
assert(!fs.existsSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle`)), "new-task dry-run should not mutate target");
const lifecycleCreate = expectJson(["new-task", "phase-2-lifecycle", "--title", "阶段二任务生命周期", "--locale", "zh-CN", lifecycleTarget]);
assert(lifecycleCreate.task?.shortId === `${todayLocal}-phase-2-lifecycle`, "new-task should report normalized short task id");
assert(lifecycleCreate.task?.id === `TASKS/${todayLocal}-phase-2-lifecycle`, "new-task should report relative task id");
for (const required of ["brief.md", "task_plan.md", "execution_strategy.md", "visual_map.md", "findings.md", "lesson_candidates.md", "progress.md", "review.md"]) {
  assert(
    fs.existsSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle`, required)),
    `new-task should create ${required}`,
  );
}
assert(
  fs.readFileSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/brief.md`), "utf8").includes("阶段二任务生命周期"),
  "new-task should render the requested title into brief.md",
);
assert(
  fs.readFileSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/task_plan.md`), "utf8").includes("Task Contract: harness-task/v1"),
  "new-task should render the durable task contract marker",
);
const duplicateLifecycle = run(["new-task", `${todayLocal}-phase-2-lifecycle`, "--title", "duplicate", lifecycleTarget]);
assert(duplicateLifecycle.status !== 0, "new-task should refuse to overwrite an existing task directory");
const simpleLifecycle = expectJson(["new-task", "simple-lifecycle", "--budget", "simple", "--title", "简单任务", "--locale", "zh-CN", lifecycleTarget]);
assert(simpleLifecycle.task?.budget === "simple", "new-task --budget simple should report simple budget");
for (const required of ["brief.md", "task_plan.md", "visual_map.md", "progress.md"]) {
  assert(
    fs.existsSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-simple-lifecycle`, required)),
    `simple task should create ${required}`,
  );
}
for (const omitted of ["execution_strategy.md", "findings.md", "review.md", "lesson_candidates.md"]) {
  assert(
    !fs.existsSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-simple-lifecycle`, omitted)),
    `simple task should not create ${omitted}`,
  );
}
const simpleTaskPlan = fs.readFileSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-simple-lifecycle/task_plan.md`), "utf8");
assert(/Selected budget\s*:\s*simple/i.test(simpleTaskPlan) || /选择预算\s*[:：]\s*simple/i.test(simpleTaskPlan), "simple task should persist selected budget");
const longRunningLifecycle = expectJson(["new-task", "long-running-lifecycle", "--long-running", "--title", "长程任务", "--locale", "zh-CN", lifecycleTarget]);
assert(longRunningLifecycle.task?.longRunning === true, "new-task --long-running should report longRunning true");
assert(
  fs.existsSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-long-running-lifecycle/long-running-task-contract.md`)),
  "new-task --long-running should create long-running-task-contract.md",
);
const legacyPresetSessionDir = path.join(tmpRoot, "legacy-preset-session");
fs.mkdirSync(path.join(legacyPresetSessionDir, "dashboard"), { recursive: true });
fs.writeFileSync(path.join(legacyPresetSessionDir, "dashboard/index.html"), "<html>legacy migration dashboard</html>\n");
fs.writeFileSync(path.join(legacyPresetSessionDir, "migrate-plan.json"), JSON.stringify({ operation: "migrate-plan", summary: { warnings: 2, legacyResiduals: 1 } }, null, 2));
const legacyPresetSessionPath = path.join(legacyPresetSessionDir, "session.json");
fs.writeFileSync(
  legacyPresetSessionPath,
  JSON.stringify(
    {
      operation: "migrate-run",
      schemaVersion: 1,
      generatedAt: "2026-05-22T00:00:00.000Z",
      result: "adopted-with-strict-deferred",
      target: lifecycleTarget,
      sessionDir: legacyPresetSessionDir,
      planOnly: false,
      dashboard: { dir: path.join(legacyPresetSessionDir, "dashboard"), indexPath: path.join(legacyPresetSessionDir, "dashboard/index.html"), kind: "html-folder" },
      plan: {
        mode: "legacy-compat",
        summary: {
          warnings: 2,
          visualMapActions: 0,
          legacyVisualOnly: 0,
          unknownClassification: 0,
          weakBrief: 0,
          missingCanonicalVisualMap: 0,
          taskActions: 0,
          reviewSchemaGaps: 0,
          legacyReferenceGaps: 0,
          legacyResiduals: 1,
          fullCutoverEligible: false,
          recommendedCapabilities: ["safe-adoption"],
        },
      },
      checks: {
        normal: { status: "warn", failures: 0, warnings: 2, failureDetails: [], warningDetails: ["legacy residual"] },
        strict: { status: "fail", failures: 1, warnings: 2, failureDetails: ["strict residual"], warningDetails: [] },
      },
      strictDeferred: {
        owner: "migration-owner",
        trigger: "strict-cutover",
        nextAction: "Assign real owner before full cutover.",
        reason: "Historical residual remains.",
        failureCount: 1,
        failures: ["strict residual"],
      },
      git: {
        before: { inGit: false, branch: "", entries: [], staged: [], dirty: false },
        after: { inGit: false, branch: "", entries: [], staged: [], dirty: false },
      },
    },
    null,
    2,
  ),
);
const legacyPresetDryRun = expectJson(["new-task", "--budget", "complex", "--preset", "legacy-migration", "--from-session", legacyPresetSessionPath, "--dry-run"]);
assert(legacyPresetDryRun.task?.preset === "legacy-migration", "new-task legacy-migration dry-run should report preset");
assert(!fs.existsSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-harness-v1-migration`)), "legacy-migration dry-run should not mutate target");
const legacyPresetInspect = expectJson(["preset", "inspect", "legacy-migration", "--json"]);
assert(legacyPresetInspect.id === "legacy-migration", "preset inspect should load legacy-migration from presets/<id>/preset.yaml");
assert(legacyPresetInspect.version === 2, "legacy-migration preset package should report version 2");
assert(legacyPresetInspect.compatibleBudgets?.includes("complex"), "legacy-migration preset should declare complex budget compatibility");
assert(legacyPresetInspect.audit?.manifestRequired === true, "preset package should require manifest audit evidence");
assert(legacyPresetInspect.writeScopes?.some((scope) => scope.path === "docs/09-PLANNING/TASKS/**"), "preset package should declare task write scope");
assert(legacyPresetInspect.workbench?.migrationQueueSchema === "workbench/migration-queue.schema.json", "legacy-migration preset should declare a workbench migration queue schema");
const legacyPresetCheck = expectJson(["preset", "check", "legacy-migration", "--json"]);
assert(legacyPresetCheck.status === "pass", "preset check legacy-migration should pass");
assert(legacyPresetCheck.entrypoints?.newTask?.type === "template", "preset check should validate the newTask entrypoint manifest");
const legacyPresetTask = expectJson(["new-task", "--budget", "complex", "--preset", "legacy-migration", "--from-session", legacyPresetSessionPath]);
assert(legacyPresetTask.task?.id === `TASKS/${todayLocal}-harness-v1-migration`, "legacy-migration preset should derive a default task id");
assert(legacyPresetTask.task?.kind === "project-migration", "legacy-migration preset should report project-migration kind");
assert(legacyPresetTask.task?.preset === "legacy-migration", "legacy-migration preset should report preset");
assert(legacyPresetTask.task?.presetVersion === "2", "legacy-migration preset should use version from preset.yaml");
assert(legacyPresetTask.task?.presetAudit?.manifestPath === "presets/legacy-migration/preset.yaml", "legacy-migration preset should report manifest audit path");
assert(legacyPresetTask.task?.evidenceBundle, "legacy-migration preset should report evidence bundle");
const legacyPresetTaskDir = path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-harness-v1-migration`);
const legacyPresetTaskPlan = fs.readFileSync(path.join(legacyPresetTaskDir, "task_plan.md"), "utf8");
assert(legacyPresetTaskPlan.includes("Task Preset: legacy-migration"), "legacy-migration task plan should persist preset metadata");
assert(legacyPresetTaskPlan.includes("Migration Achieved Level: migration-deferred"), "strict-deferred session should start as migration-deferred");
for (const required of ["session.json", "migrate-plan.json", "normal-check.json", "strict-check.json", "migrate-verify.json", "dashboard.hash.txt", "target-git-status.txt", "target-commit.txt", "harness-version.txt", "generated-at.txt"]) {
  assert(
    fs.existsSync(path.join(lifecycleTarget, legacyPresetTask.task.evidenceBundle, required)),
    `legacy-migration preset should copy evidence file ${required}`,
  );
}
for (const required of ["preset-manifest.json", "preset-audit.json", "write-scope.json", "migration-ledger.json"]) {
  assert(
    fs.existsSync(path.join(lifecycleTarget, legacyPresetTask.task.evidenceBundle, required)),
    `legacy-migration preset should write audit evidence file ${required}`,
  );
}
const legacyPresetAudit = JSON.parse(fs.readFileSync(path.join(lifecycleTarget, legacyPresetTask.task.evidenceBundle, "preset-audit.json"), "utf8"));
assert(legacyPresetAudit.manifestPath === "presets/legacy-migration/preset.yaml", "preset audit should record the manifest path");
assert(legacyPresetAudit.entrypoints.newTask.type === "template", "preset audit should record audited newTask entrypoint");
assert(legacyPresetAudit.writeScopes.includes("docs/09-PLANNING/TASKS/**"), "preset audit should record allowed write scopes");
const legacyMigrationLedger = JSON.parse(fs.readFileSync(path.join(lifecycleTarget, legacyPresetTask.task.evidenceBundle, "migration-ledger.json"), "utf8"));
assert(legacyMigrationLedger.phases.some((phase) => phase.id === "mechanical-scaffold" && phase.automationAllowed === true), "migration ledger should allow mechanical scaffold automation");
assert(legacyMigrationLedger.phases.some((phase) => phase.id === "semantic-reconstruction" && phase.evidenceLedgerRequired === true && phase.automationAllowed === false), "migration ledger should block scaffold-only semantic reconstruction");
assert(legacyMigrationLedger.workbenchRole === "human-confirmation-control-plane", "migration ledger should mark workbench as human confirmation control plane");
assert(legacyMigrationLedger.staticDashboardRole === "evidence-snapshot", "migration ledger should mark static dashboard as evidence snapshot");
const legacyPresetStatus = expectJson(["status", "--json", lifecycleTarget]);
const legacyPresetStatusTask = legacyPresetStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-harness-v1-migration`);
assert(legacyPresetStatusTask?.taskKind === "project-migration", "status should expose taskKind");
assert(legacyPresetStatusTask?.taskPreset === "legacy-migration", "status should expose taskPreset");
assert(legacyPresetStatusTask?.migrationSnapshot?.strictDeferred === true, "status should expose migration snapshot strictDeferred");
const legacyPresetDashboardDir = path.join(tmpRoot, "legacy-preset-dashboard");
expectPass(["dashboard", "--out-dir", legacyPresetDashboardDir, lifecycleTarget]);
const legacyPresetDashboardData = fs.readFileSync(path.join(legacyPresetDashboardDir, "assets/dashboard-data.js"), "utf8");
assert(legacyPresetDashboardData.includes("migrationSnapshot"), "dashboard bundle should expose migrationSnapshot");
fs.writeFileSync(
  path.join(legacyPresetTaskDir, "task_plan.md"),
  legacyPresetTaskPlan.replace("Migration Achieved Level: migration-deferred", "Migration Achieved Level: migration-full-cutover"),
);
const falseFullCutoverCheck = run(["check", "--profile", "target-project", lifecycleTarget]);
assert(falseFullCutoverCheck.status !== 0, "check should reject migration-full-cutover when evidence still has residuals");
assert(falseFullCutoverCheck.stderr.includes("migration-full-cutover"), "full-cutover preset failure should explain achieved level");
fs.writeFileSync(path.join(legacyPresetTaskDir, "task_plan.md"), legacyPresetTaskPlan);
const promotableCandidatePath = path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-long-running-lifecycle/lesson_candidates.md`);
fs.writeFileSync(
  promotableCandidatePath,
  fs.readFileSync(promotableCandidatePath, "utf8")
    .replace("| Task-level status | pending-review |", "| Task-level status | needs-promotion |")
    .replace("| Review decision | pending-human-review |", "| Review decision | accepted-for-promotion |")
    .replace("| Promotion state | not-promoted |", "| Promotion state | queued |")
    .replace("| Closeout token | pending |", "| Closeout token | queued-promotion:LC-20260521-001 |")
    .replace(
      "| --- | --- | --- | --- | --- | --- |",
      "| --- | --- | --- | --- | --- | --- |\n| LC-20260521-001 | needs-promotion | Commit contract must be explicit | Agents forget proactive commits when contracts are implicit | accepted-for-promotion | references/execution-workflow-standard.md |",
    ),
);
const promoteDryRun = expectJson(["lesson-promote", "long-running-lifecycle", "LC-20260521-001", "--dry-run", lifecycleTarget]);
assert(promoteDryRun.dryRun === true && promoteDryRun.lessonId === "L-2026-05-21-001", "lesson-promote --dry-run should derive the lesson id");
const promoteRun = expectJson(["lesson-promote", "long-running-lifecycle", "LC-20260521-001", lifecycleTarget]);
assert(promoteRun.lessonId === "L-2026-05-21-001", "lesson-promote should return the created lesson id");
assert(
  fs.existsSync(path.join(lifecycleTarget, "docs/01-GOVERNANCE/lessons/L-2026-05-21-001-commit-contract-must-be-explicit.md")),
  "lesson-promote should create a detail document",
);
assert(
  fs.readFileSync(path.join(lifecycleTarget, "docs/01-GOVERNANCE/Lessons-SSoT.md"), "utf8").includes("L-2026-05-21-001"),
  "lesson-promote should append Lessons SSoT",
);
assert(fs.readFileSync(promotableCandidatePath, "utf8").includes("| LC-20260521-001 | promoted |"), "lesson-promote should mark the candidate row promoted");
const promoteAgain = expectJson(["lesson-promote", "long-running-lifecycle", "LC-20260521-001", lifecycleTarget]);
assert(promoteAgain.changes.length === 0, "lesson-promote should be idempotent after promotion");
expectPass(["check", "--profile", "target-project", lifecycleTarget]);
expectJson(["task-start", "simple-lifecycle", "--message", "开始简单任务", lifecycleTarget]);
const simpleComplete = expectJson(["task-complete", "simple-lifecycle", "--message", "简单任务完成", lifecycleTarget]);
assert(simpleComplete.task?.state === "done", "simple task should be able to complete without review");
const earlyReview = run(["task-review", "review-too-early", lifecycleTarget]);
assert(earlyReview.status !== 0, "task-review should reject unknown tasks");
const tooEarlyTask = expectJson(["new-task", "review-too-early", "--title", "Too early review", "--locale", "zh-CN", lifecycleTarget]);
assert(tooEarlyTask.task?.id === `TASKS/${todayLocal}-review-too-early`, "new-task should create review-too-early fixture");
const tooEarlyReview = run(["task-review", "review-too-early", "--message", "too early", lifecycleTarget]);
assert(tooEarlyReview.status !== 0, "task-review should reject tasks that are not in_progress");
assert(tooEarlyReview.stderr.includes("in_progress"), "task-review invalid transition should explain required state");
expectJson(["task-start", "phase-2-lifecycle", "--message", "开始实现生命周期切片", lifecycleTarget]);
expectJson(["task-log", "phase-2-lifecycle", "--message", "补齐 CLI 与模板", "--evidence", "command:TARGET:npm-test:passed", lifecycleTarget]);
const noPhaseProgressReview = run(["task-review", "phase-2-lifecycle", "--message", "阶段表尚未更新", lifecycleTarget]);
assert(noPhaseProgressReview.status !== 0, "task-review should reject standard tasks whose visual map has no recorded phase progress");
assert(
  noPhaseProgressReview.stderr.includes("task-phase"),
  "task-review phase-progress failure should tell the agent to run task-phase",
);
const lifecycleBlocked = expectJson(["task-block", "phase-2-lifecycle", "--message", "等待旧项目迁移验证", lifecycleTarget]);
assert(lifecycleBlocked.task?.state === "blocked", "task-block should report blocked state");
const lifecyclePhase = expectJson(["task-phase", "phase-2-lifecycle", "PH-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
assert(lifecyclePhase.task?.phases?.some((phase) => phase.id === "PH-01" && phase.state === "done" && phase.completion === 100), "task-phase should update visual map row");
assert(
  fs.readFileSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/visual_map.md`), "utf8").includes("Visual Map Contract: v1.0"),
  "new-task should render canonical visual map contract",
);
expectJson(["task-phase", "phase-2-lifecycle", "PH-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
const missingPhase = run(["task-phase", "phase-2-lifecycle", "NO_SUCH_PHASE", "--state", "done", lifecycleTarget]);
assert(missingPhase.status !== 0, "task-phase should fail for unknown phase id");
assert(missingPhase.stderr.includes("Phase not found"), "task-phase unknown phase should explain missing phase");
const directComplete = run(["task-complete", "phase-2-lifecycle", "--message", "跳过审查完成", lifecycleTarget]);
assert(directComplete.status !== 0, "standard task-complete should require review state");
assert(directComplete.stderr.includes("task-review"), "standard task-complete failure should tell the user to run task-review first");
expectJson(["task-start", "phase-2-lifecycle", "--message", "恢复执行生命周期切片", lifecycleTarget]);
const lifecycleReview = expectJson(["task-review", "phase-2-lifecycle", "--message", "进入执行审查", lifecycleTarget]);
assert(lifecycleReview.task?.state === "review", "task-review should report review state");
const lifecycleReviewPath = path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/review.md`);
fs.writeFileSync(
  lifecycleReviewPath,
  fs.readFileSync(lifecycleReviewPath, "utf8").replace(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| RR-001 | P1 | Human review is still pending | TARGET:docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/progress.md | confirm in dashboard | yes | open | yes | dashboard |`,
  ),
);
const blockedComplete = run(["task-complete", "phase-2-lifecycle", "--message", "带阻塞审查项完成", lifecycleTarget]);
assert(blockedComplete.status !== 0, "task-complete should reject open blocking review findings");
assert(blockedComplete.stderr.includes("Open blocking review findings"), "task-complete blocked review failure should explain open findings");
const blockedConfirm = run(["review-confirm", `TASKS/${todayLocal}-phase-2-lifecycle`, "--reviewer", "Human Reviewer", "--confirm", `${todayLocal}-phase-2-lifecycle`, lifecycleTarget]);
assert(blockedConfirm.status !== 0, "review-confirm should reject tasks with open blocking review findings");
assert(blockedConfirm.stderr.includes("Open blocking review findings"), "review-confirm blocked failure should explain open findings");
fs.writeFileSync(
  lifecycleReviewPath,
  fs.readFileSync(lifecycleReviewPath, "utf8").replace(`| RR-001 | P1 | Human review is still pending | TARGET:docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/progress.md | confirm in dashboard | yes | open | yes | dashboard |`, `| RR-001 | P1 | Human review is closed | TARGET:docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/progress.md | confirmed in dashboard | no | closed | no | none |`),
);
const unconfirmedComplete = run(["task-complete", "phase-2-lifecycle", "--message", "未确认审查完成", lifecycleTarget]);
assert(unconfirmedComplete.status !== 0, "task-complete should require human review confirmation");
assert(unconfirmedComplete.stderr.includes("review-confirm"), "unconfirmed review failure should tell the user to run review-confirm");
const missingWalkthroughConfirm = run(["review-confirm", `TASKS/${todayLocal}-phase-2-lifecycle`, "--reviewer", "Human Reviewer", "--message", "walkthrough reviewed", "--confirm", `${todayLocal}-phase-2-lifecycle`, lifecycleTarget]);
assert(missingWalkthroughConfirm.status !== 0, "review-confirm should require a walkthrough before human confirmation");
assert(missingWalkthroughConfirm.stderr.includes("walkthrough"), "missing walkthrough confirmation failure should explain the walkthrough requirement");
const lifecycleWalkthrough = path.join(lifecycleTarget, `docs/10-WALKTHROUGH/${todayLocal}-phase-2-lifecycle-walkthrough.md`);
fs.writeFileSync(
  lifecycleWalkthrough,
  "# Walkthrough: Phase 2 lifecycle\n\n## Summary\n\nHuman-readable walkthrough for review before completion.\n",
);
fs.appendFileSync(
  path.join(lifecycleTarget, "docs/10-WALKTHROUGH/Closeout-SSoT.md"),
  `\n| CL-PHASE-2-LIFECYCLE | 2026-05-21 | Phase 2 lifecycle | \`docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/task_plan.md\` | \`docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/review.md\` | \`docs/10-WALKTHROUGH/${todayLocal}-phase-2-lifecycle-walkthrough.md\` | pending human review | none | checked-none | pending |\n`,
);
acceptNoLessonCandidate(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle`));
expectJson(["new-task", "review-template-placeholder", "--title", "Review template placeholder", "--locale", "en-US", lifecycleTarget]);
const preCompleteStatus = expectJson(["status", "--json", lifecycleTarget]);
const preCompleteTask = preCompleteStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-phase-2-lifecycle`);
assert(preCompleteTask?.walkthroughPath?.endsWith(`docs/10-WALKTHROUGH/${todayLocal}-phase-2-lifecycle-walkthrough.md`), "status should expose walkthrough before human review confirmation");
assert(preCompleteTask?.reviewStatus === "agent-reviewed", "status should classify agent-written review evidence separately from human confirmation");
const reviewTemplateTask = preCompleteStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-review-template-placeholder`);
assert(reviewTemplateTask?.reviewStatus === "required", "review template placeholder Verdict: yes / no should not count as a completed review");
const preCompleteConfirm = expectJson(["review-confirm", `TASKS/${todayLocal}-phase-2-lifecycle`, "--reviewer", "Human Reviewer", "--message", "walkthrough reviewed", "--confirm", `${todayLocal}-phase-2-lifecycle`, lifecycleTarget]);
assert(preCompleteConfirm.task?.reviewStatus === "confirmed", "review-confirm should confirm review before task-complete");
const lifecycleComplete = expectJson(["task-complete", "phase-2-lifecycle", "--message", "生命周期闭环完成", lifecycleTarget]);
assert(lifecycleComplete.task?.state === "done", "task-complete should report done state");
const lifecycleTasks = expectJson(["task-list", "--json", lifecycleTarget]);
assert(lifecycleTasks.tasks.some((task) => task.id === `TASKS/${todayLocal}-phase-2-lifecycle` && task.state === "done"), "task-list should include completed task");
assert(lifecycleTasks.tasks.some((task) => task.id === `TASKS/${todayLocal}-simple-lifecycle` && task.budget === "simple"), "task-list should expose parsed task budget");
const doneLifecycleTasks = expectJson(["task-list", "--json", "--state", "done", lifecycleTarget]);
assert(doneLifecycleTasks.tasks.every((task) => task.state === "done"), "task-list --state should filter states");
const lifecycleStatus = expectJson(["status", "--json", lifecycleTarget]);
assert(lifecycleStatus.schemaVersion === 2, "status should expose dashboard schemaVersion 2");
const lifecycleTask = lifecycleStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-phase-2-lifecycle`);
assert(lifecycleTask?.briefSource === "standalone", "status should expose standalone task brief");
assert(lifecycleTask?.briefPath?.endsWith("/brief.md"), "status should expose the task brief path");
assert(lifecycleTask?.classificationBucket === "current", "new v1 tasks should not be classified as legacy");
assert(lifecycleStatus.summary?.briefCoverage?.missing === 0, "status should expose explicit brief coverage summary");
assert(lifecycleTask?.state === "done", "status should read lifecycle task state from progress.md");
assert(lifecycleTask?.lifecycleState === "closing", "done task with pending closeout should remain in closing lifecycle state");
assert(lifecycleTask?.evidence?.some((item) => item.summary.includes("passed")), "status should collect task-log evidence");
const confirmedStatus = expectJson(["status", "--json", lifecycleTarget]);
const confirmedTask = confirmedStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-phase-2-lifecycle`);
assert(confirmedTask?.reviewStatus === "confirmed", "status should expose confirmed review status");
assert(confirmedTask?.closeoutStatus === "pending", "status should keep pending closeout separate from review confirmation");
assert(fs.readFileSync(lifecycleReviewPath, "utf8").includes("Human Review Confirmation"), "review-confirm should write a human review confirmation block");
assert(fs.readFileSync(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/progress.md`), "utf8").includes("review-confirm"), "review-confirm should append a progress log entry");

const staleCompletionTarget = path.join(tmpRoot, "stale-completion-target");
fs.mkdirSync(staleCompletionTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", staleCompletionTarget]);
expectJson(["new-task", "stale-phase-closeout", "--title", "Stale phase closeout", "--locale", "en-US", staleCompletionTarget]);
const staleTaskDir = path.join(staleCompletionTarget, `docs/09-PLANNING/TASKS/${todayLocal}-stale-phase-closeout`);
fs.writeFileSync(path.join(staleTaskDir, "progress.md"), "# Progress\n\n## Status\n\ndone\n");
const staleWalkthrough = path.join(staleCompletionTarget, "docs/10-WALKTHROUGH/stale-phase-closeout.md");
fs.writeFileSync(staleWalkthrough, "# Walkthrough: Stale phase closeout\n\n## Summary\n\nClosed while the phase table is stale.\n");
fs.appendFileSync(
  path.join(staleCompletionTarget, "docs/10-WALKTHROUGH/Closeout-SSoT.md"),
  `\n| CL-STALE-PHASE | 2026-05-23 | Stale phase closeout | \`docs/09-PLANNING/TASKS/${todayLocal}-stale-phase-closeout/task_plan.md\` | \`docs/09-PLANNING/TASKS/${todayLocal}-stale-phase-closeout/review.md\` | \`docs/10-WALKTHROUGH/stale-phase-closeout.md\` | closeout complete | none | checked-none | closed |\n`,
);
const staleCompletionCheck = run(["check", "--profile", "target-project", staleCompletionTarget]);
assert(staleCompletionCheck.status !== 0, "closed done tasks should fail when Visual Map phases are incomplete");
assert(
  staleCompletionCheck.stderr.includes("done task has incomplete Visual Map phases"),
  "stale phase closeout failure should explain the inconsistent Visual Map phases",
);

const moduleLifecycle = expectJson(["new-task", "module-lifecycle", "--module", "auth", "--budget", "complex", "--title", "模块生命周期", "--locale", "zh-CN", lifecycleTarget]);
assert(moduleLifecycle.task?.id === `MODULES/auth/${todayLocal}-module-lifecycle`, "new-task --module should create a module task id");
assert(fs.existsSync(path.join(lifecycleTarget, `docs/09-PLANNING/MODULES/auth/${todayLocal}-module-lifecycle/references/INDEX.md`)), "complex module task should create references index");
assert(fs.existsSync(path.join(lifecycleTarget, `docs/09-PLANNING/MODULES/auth/${todayLocal}-module-lifecycle/artifacts/INDEX.md`)), "complex module task should create artifacts index");
assert(fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/brief.md")), "new-task --module should create a module brief when missing");
assert(fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/module_plan.md")), "new-task --module should create a module plan when missing");
assert(fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/execution_strategy.md")), "new-task --module should create module-level execution strategy when missing");
assert(fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/visual_map.md")), "new-task --module should create module-level visual map when missing");
assert(fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/session_prompt.md")), "new-task --module should create a module session prompt when missing");
fs.writeFileSync(
  path.join(lifecycleTarget, "docs/09-PLANNING/Module-Registry.md"),
  "# Module Registry\n\n## Active Modules\n\n| ID | Module | Path Scope | Owner | Status | Branch or Worktree | Task Plan | Shared Files | Depends On | Handoff Evidence | Residual | Updated |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| M-AUTH | Auth | src/auth/** | coordinator | reserved | n/a | docs/09-PLANNING/MODULES/auth/module_plan.md | none | none | pending | none | 2026-05-19 |\n",
);
fs.writeFileSync(
  path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/module_plan.md"),
  `# Auth Module Plan\n\n## Steps\n\n| Step ID | Name | Status | Task Plan | Depends On |\n| --- | --- | --- | --- | --- |\n| AUTH-01 | Setup | planned | docs/09-PLANNING/MODULES/auth/${todayLocal}-module-lifecycle/task_plan.md | none |\n`,
);
const moduleStep = expectJson(["module-step", "auth", "AUTH-01", "--state", "done", lifecycleTarget]);
assert(moduleStep.moduleKey === "auth" && moduleStep.stepId === "AUTH-01", "module-step should report updated module step");
assert(fs.readFileSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/module_plan.md"), "utf8").includes("| AUTH-01 | Setup | done |"), "module-step should update module_plan status");
assert(fs.readFileSync(path.join(lifecycleTarget, "docs/09-PLANNING/Module-Registry.md"), "utf8").includes("| M-AUTH | Auth | src/auth/** | coordinator | merged |"), "module-step should update module registry status when done");
expectJson(["module-step", "auth", "AUTH-01", "--state", "done", lifecycleTarget]);
const missingModuleStep = run(["module-step", "auth", "NO_SUCH_STEP", "--state", "done", lifecycleTarget]);
assert(missingModuleStep.status !== 0, "module-step should fail for unknown step id");
assert(missingModuleStep.stderr.includes("Module step not found"), "module-step unknown step should explain missing step");
expectJson(["task-start", `MODULES/auth/${todayLocal}-module-lifecycle`, "--message", "开始模块任务审查夹具", lifecycleTarget]);
expectJson(["task-phase", `MODULES/auth/${todayLocal}-module-lifecycle`, "PH-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
expectJson(["task-review", `MODULES/auth/${todayLocal}-module-lifecycle`, "--message", "模块任务进入审查", lifecycleTarget]);
const moduleWalkthrough = path.join(lifecycleTarget, `docs/10-WALKTHROUGH/${todayLocal}-module-lifecycle-walkthrough.md`);
fs.writeFileSync(
  moduleWalkthrough,
  "# Walkthrough: Module lifecycle\n\n## Summary\n\nHuman-readable module walkthrough for review confirmation.\n",
);
fs.appendFileSync(
  path.join(lifecycleTarget, "docs/10-WALKTHROUGH/Closeout-SSoT.md"),
  `\n| CL-MODULE-LIFECYCLE | 2026-05-21 | Module lifecycle | \`docs/09-PLANNING/MODULES/auth/${todayLocal}-module-lifecycle/task_plan.md\` | \`docs/09-PLANNING/MODULES/auth/${todayLocal}-module-lifecycle/review.md\` | \`docs/10-WALKTHROUGH/${todayLocal}-module-lifecycle-walkthrough.md\` | pending human review | none | checked-none | pending |\n`,
);
acceptNoLessonCandidate(path.join(lifecycleTarget, `docs/09-PLANNING/MODULES/auth/${todayLocal}-module-lifecycle`));
const moduleConfirm = expectJson(["review-confirm", `MODULES/auth/${todayLocal}-module-lifecycle`, "--reviewer", "Human Reviewer", "--confirm", `${todayLocal}-module-lifecycle`, lifecycleTarget]);
assert(moduleConfirm.task?.id === `MODULES/auth/${todayLocal}-module-lifecycle`, "review-confirm should accept full module task ids");
const workbenchReviewTask = expectJson(["new-task", "workbench-review", "--title", "Workbench review gate", "--locale", "zh-CN", lifecycleTarget]);
assert(workbenchReviewTask.task?.id === `TASKS/${todayLocal}-workbench-review`, "new-task should create workbench review gate fixture");
const workbenchReviewProgress = path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-workbench-review/progress.md`);
const workbenchClosedReviewTask = expectJson(["new-task", "workbench-closed-review", "--title", "Closed review debt", "--locale", "zh-CN", lifecycleTarget]);
assert(workbenchClosedReviewTask.task?.id === `TASKS/${todayLocal}-workbench-closed-review`, "new-task should create closed review debt fixture");
const workbenchClosedReviewProgress = path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-workbench-closed-review/progress.md`);
fs.writeFileSync(
  workbenchClosedReviewProgress,
  fs.readFileSync(workbenchClosedReviewProgress, "utf8").replace(/^## 状态：.*$/m, "## 状态：done"),
);
expectJson(["task-phase", "workbench-closed-review", "PH-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
const closedReviewWalkthrough = path.join(lifecycleTarget, "docs/10-WALKTHROUGH/workbench-closed-walkthrough.md");
fs.writeFileSync(
  closedReviewWalkthrough,
  "# Walkthrough: Closed review debt\n\n## Summary\n\nHuman-readable closeout walkthrough for dashboard review.\n",
);
fs.appendFileSync(
  path.join(lifecycleTarget, "docs/10-WALKTHROUGH/Closeout-SSoT.md"),
  `\n| CL-WORKBENCH-CLOSED | 2026-05-21 | Closed review debt | \`docs/09-PLANNING/TASKS/${todayLocal}-workbench-closed-review/task_plan.md\` | \`docs/09-PLANNING/TASKS/${todayLocal}-workbench-closed-review/review.md\` | \`docs/10-WALKTHROUGH/workbench-closed-walkthrough.md\` | test evidence | none | checked-none | closed |\n`,
);
acceptNoLessonCandidate(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-workbench-closed-review`));
const closedReviewStatus = expectJson(["status", "--json", lifecycleTarget]);
const closedReviewTask = closedReviewStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-workbench-closed-review`);
assert(closedReviewTask?.walkthroughPath?.endsWith("docs/10-WALKTHROUGH/workbench-closed-walkthrough.md"), "status should expose task walkthrough path from Closeout SSoT");
assert(closedReviewTask?.lifecycleState === "closed-review-pending", "closed tasks without human confirmation should remain visible as review debt");
assert(closedReviewTask?.reviewQueueState === "closed-debt", "closed tasks without human confirmation should enter the review queue as closed debt");
const workbenchDir = path.join(tmpRoot, "review-workbench");
const workbench = spawn(node, [cli, "dashboard", "--workbench", "--out-dir", workbenchDir, "--host", "127.0.0.1", "--port", "0", lifecycleTarget], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"],
});
const runtime = await waitForWorkbench(workbench);
try {
  const runtimeResponse = await fetch(new URL("api/runtime", runtime.url));
  assert(runtimeResponse.status === 200, "workbench should expose runtime metadata");
  const runtimePayload = await runtimeResponse.json();
  assert(runtimePayload.mode === "workbench" && runtimePayload.csrfToken === runtime.csrf, "workbench runtime should expose mode and csrf token");
  const dashboardData = fs.readFileSync(path.join(workbenchDir, "assets/dashboard-data.js"), "utf8");
  assert(dashboardData.includes("Walkthrough: Closed review debt"), "dashboard data should include closeout walkthrough documents");
  const badOrigin = await fetch(new URL("api/tasks/review-complete", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: "http://127.0.0.1:9" },
    body: JSON.stringify({ taskId: `MODULES/auth/${todayLocal}-module-lifecycle`, confirmText: `${todayLocal}-module-lifecycle`, reviewer: "Human Reviewer" }),
  });
  assert(badOrigin.status === 403, "workbench should reject mismatched origins");
  const badTask = await fetch(new URL("api/tasks/review-complete", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({ taskId: "../bad", confirmText: "bad", reviewer: "Human Reviewer" }),
  });
  assert(badTask.status === 404, "workbench should reject unknown task ids");
  const plannedReview = await fetch(new URL("api/tasks/review-complete", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({ taskId: `TASKS/${todayLocal}-workbench-review`, confirmText: `${todayLocal}-workbench-review`, reviewer: "Human Reviewer" }),
  });
  assert(plannedReview.status === 409, "workbench review completion should reject tasks outside the review queue");
  fs.writeFileSync(
    workbenchReviewProgress,
    fs.readFileSync(workbenchReviewProgress, "utf8").replace(/^## 状态：.*$/m, "## 状态：review"),
  );
  const missingWalkthroughResponse = await fetch(new URL("api/tasks/review-complete", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({ taskId: `TASKS/${todayLocal}-workbench-review`, confirmText: `${todayLocal}-workbench-review`, reviewer: "Human Reviewer", message: "confirmed without walkthrough" }),
  });
  const missingWalkthroughText = await missingWalkthroughResponse.text();
  assert(missingWalkthroughResponse.status === 400, `workbench review completion should require walkthrough, got ${missingWalkthroughResponse.status}: ${missingWalkthroughText}`);
  assert(missingWalkthroughText.includes("walkthrough"), "workbench missing walkthrough rejection should explain walkthrough requirement");
  const workbenchReviewWalkthrough = path.join(lifecycleTarget, "docs/10-WALKTHROUGH/workbench-review-walkthrough.md");
  fs.writeFileSync(
    workbenchReviewWalkthrough,
    "# Walkthrough: Workbench review gate\n\n## Summary\n\nHuman-readable walkthrough for dashboard review confirmation.\n",
  );
  fs.appendFileSync(
    path.join(lifecycleTarget, "docs/10-WALKTHROUGH/Closeout-SSoT.md"),
    `\n| CL-WORKBENCH-REVIEW | 2026-05-21 | Workbench review gate | \`docs/09-PLANNING/TASKS/${todayLocal}-workbench-review/task_plan.md\` | \`docs/09-PLANNING/TASKS/${todayLocal}-workbench-review/review.md\` | \`docs/10-WALKTHROUGH/workbench-review-walkthrough.md\` | pending human review | none | checked-none | pending |\n`,
  );
  acceptNoLessonCandidate(path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-workbench-review`));
  const okResponse = await fetch(new URL("api/tasks/review-complete", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({ taskId: `TASKS/${todayLocal}-workbench-review`, confirmText: `${todayLocal}-workbench-review`, reviewer: "Human Reviewer", message: "confirmed from workbench" }),
  });
  const okText = await okResponse.text();
  assert(okResponse.status === 200, `workbench review completion should pass, got ${okResponse.status}: ${okText}`);
  const okPayload = JSON.parse(okText);
  assert(okPayload.task?.reviewStatus === "confirmed", "workbench review completion should return confirmed task status");
  const closedReviewResponse = await fetch(new URL("api/tasks/review-complete", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({ taskId: `TASKS/${todayLocal}-workbench-closed-review`, confirmText: `${todayLocal}-workbench-closed-review`, reviewer: "Human Reviewer", message: "closed debt confirmed from workbench" }),
  });
  const closedReviewText = await closedReviewResponse.text();
  assert(closedReviewResponse.status === 200, `workbench review completion should allow closed review debt confirmation, got ${closedReviewResponse.status}: ${closedReviewText}`);
  const closedReviewPayload = JSON.parse(closedReviewText);
  assert(closedReviewPayload.task?.reviewStatus === "confirmed", "closed review debt confirmation should return confirmed review status");
} finally {
  workbench.kill("SIGTERM");
}
const devDir = path.join(tmpRoot, "dev-workbench");
const dev = spawn(node, [cli, "dev", "--no-open", "--out-dir", devDir, "--host", "127.0.0.1", "--port", "0", lifecycleTarget], {
  cwd: repoRoot,
  stdio: ["ignore", "pipe", "pipe"],
});
const devRuntime = await waitForWorkbench(dev);
try {
  assert(devRuntime.stdout.includes("outDir="), "harness dev should print the generated outDir");
  const initialRuntime = await (await fetch(new URL("api/runtime", devRuntime.url))).json();
  assert(initialRuntime.mode === "workbench" && initialRuntime.autoRefresh === true, "harness dev should start auto-refreshing workbench runtime");
  assert(fs.readFileSync(path.join(devDir, "index.html"), "utf8").includes("__HARNESS_WORKBENCH__ = true"), "harness dev should enable workbench runtime in generated index");
  const marker = `dev-refresh-${Date.now()}`;
  fs.appendFileSync(
    path.join(lifecycleTarget, `docs/09-PLANNING/TASKS/${todayLocal}-phase-2-lifecycle/progress.md`),
    `\n\n## Dev Refresh Marker\n\n${marker}\n`,
  );
  await waitForCondition(async () => {
    const runtimePayload = await (await fetch(new URL("api/runtime", devRuntime.url))).json();
    if (runtimePayload.snapshotVersion === initialRuntime.snapshotVersion) return false;
    const dashboardData = fs.readFileSync(path.join(devDir, "assets/dashboard-data.js"), "utf8");
    return dashboardData.includes(marker) ? runtimePayload : false;
  }, "harness dev should regenerate dashboard data after docs changes");
} finally {
  dev.kill("SIGTERM");
}

const zhRegistryTarget = path.join(tmpRoot, "zh-module-registry-target");
fs.mkdirSync(zhRegistryTarget);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,module-parallel", zhRegistryTarget]);
assert(fs.existsSync(path.join(zhRegistryTarget, "docs/09-PLANNING/MODULES/Session-Prompt-Pack.md")), "module-parallel init should create a session prompt pack");
assert(fs.existsSync(path.join(zhRegistryTarget, "docs/09-PLANNING/MODULES/_module-template/module_plan.md")), "module-parallel init should create a module plan template");
assert(fs.existsSync(path.join(zhRegistryTarget, "docs/09-PLANNING/MODULES/_module-template/session_prompt.md")), "module-parallel init should create a module session prompt template");
assert(fs.existsSync(path.join(zhRegistryTarget, "docs/09-PLANNING/MODULES/_task-template/review.md")), "module-parallel init should create complete module task templates");
expectJson(["new-task", "zh-task", "--module", "example", "--title", "中文模块任务", "--locale", "zh-CN", zhRegistryTarget]);
fs.mkdirSync(path.join(zhRegistryTarget, "docs/09-PLANNING/MODULES/example"), { recursive: true });
fs.writeFileSync(
  path.join(zhRegistryTarget, "docs/09-PLANNING/MODULES/example/module_plan.md"),
  `# 示例模块计划\n\n## 步骤\n\n| 步骤 ID | 名称 | 状态 | 任务计划 | 依赖 |\n| --- | --- | --- | --- | --- |\n| EXM-01 | 启动 | planned | docs/09-PLANNING/MODULES/example/${todayLocal}-zh-task/task_plan.md | none |\n`,
);
expectJson(["module-step", "example", "EXM-01", "--state", "done", zhRegistryTarget]);
const zhRegistryContent = fs.readFileSync(path.join(zhRegistryTarget, "docs/09-PLANNING/Module-Registry.md"), "utf8");
assert(zhRegistryContent.includes("| example | 示例模块 | EXM | `codex/example` | EXM-01 | completed |"), "module-step should update zh-CN module registry status/current step");
const zhGraphDir = path.join(tmpRoot, "zh-module-dashboard");
expectPass(["dashboard", "--out-dir", zhGraphDir, zhRegistryTarget]);
const zhGraph = JSON.parse(fs.readFileSync(path.join(zhGraphDir, "data/graph.json"), "utf8"));
assert(zhGraph.nodes.some((node) => node.type === "module" && node.id === "module:example" && node.state === "completed" && node.currentStep === "EXM-01"), "zh-CN module registry should populate dashboard graph");
assert(zhGraph.nodes.some((node) => node.type === "step" && node.id === "step:EXM-01" && node.state === "done"), "zh-CN module plan should populate step graph");
const moduleFiltered = expectJson(["task-list", "--json", "--module", "auth", lifecycleTarget]);
assert(moduleFiltered.tasks.length === 1 && moduleFiltered.tasks[0].id === `MODULES/auth/${todayLocal}-module-lifecycle`, "task-list --module should filter module tasks");
expectJson(["new-task", "module-lifecycle", "--title", "同名根任务", "--locale", "zh-CN", lifecycleTarget]);
const ambiguousTask = run(["task-start", "module-lifecycle", "--message", "ambiguous", lifecycleTarget]);
assert(ambiguousTask.status !== 0, "ambiguous task short name should fail");
assert(ambiguousTask.stderr.includes("Ambiguous task reference"), "ambiguous task error should explain ambiguity");
assert(ambiguousTask.stderr.includes(`TASKS/${todayLocal}-module-lifecycle`) && ambiguousTask.stderr.includes(`MODULES/auth/${todayLocal}-module-lifecycle`), "ambiguous task error should list candidate task paths");

// --- Date prefix auto-generation tests ---
const datePrefixTarget = path.join(tmpRoot, "date-prefix-target");
fs.mkdirSync(datePrefixTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", datePrefixTarget]);

// 1. Bare slug gets auto-prefixed with local date
const datePrefixCreate = expectJson(["new-task", "my-feature", "--title", "My Feature", datePrefixTarget]);
assert(datePrefixCreate.task?.shortId === `${todayLocal}-my-feature`, "new-task bare slug should auto-prefix local date");
assert(datePrefixCreate.task?.id === `TASKS/${todayLocal}-my-feature`, "new-task bare slug task id should include date prefix");
assert(datePrefixCreate.task?.title === "My Feature", "new-task should use explicit title, not dated id");
assert(
  fs.existsSync(path.join(datePrefixTarget, `docs/09-PLANNING/TASKS/${todayLocal}-my-feature/task_plan.md`)),
  "new-task bare slug should create dated directory",
);

// 2. Already-dated slug should NOT double-prefix
const alreadyDated = expectJson(["new-task", `${todayLocal}-existing-date`, "--title", "Already Dated", datePrefixTarget]);
assert(alreadyDated.task?.shortId === `${todayLocal}-existing-date`, "new-task already-dated slug should not double-prefix");
assert(
  fs.existsSync(path.join(datePrefixTarget, `docs/09-PLANNING/TASKS/${todayLocal}-existing-date/task_plan.md`)),
  "new-task already-dated slug should create directory without double date",
);
assert(
  !fs.existsSync(path.join(datePrefixTarget, `docs/09-PLANNING/TASKS/${todayLocal}-${todayLocal}-existing-date`)),
  "new-task already-dated slug must not create double-dated directory",
);

// 3. Module task also gets date prefix
const moduleWithDate = expectJson(["new-task", "module-feat", "--module", "payments", "--title", "Module Feature", datePrefixTarget]);
assert(moduleWithDate.task?.shortId === `${todayLocal}-module-feat`, "new-task --module bare slug should auto-prefix local date");
assert(moduleWithDate.task?.id === `MODULES/payments/${todayLocal}-module-feat`, "new-task --module task id should include date prefix");
assert(
  fs.existsSync(path.join(datePrefixTarget, `docs/09-PLANNING/MODULES/payments/${todayLocal}-module-feat/task_plan.md`)),
  "new-task --module should create dated directory under module",
);

// 4. Bare slug lifecycle resolution: task-start resolves "my-feature" to dated directory
const startByBareSlug = expectJson(["task-start", "my-feature", "--message", "start via bare slug", datePrefixTarget]);
assert(startByBareSlug.task?.id === `TASKS/${todayLocal}-my-feature`, "task-start should resolve bare slug to dated directory");
assert(startByBareSlug.task?.state === "in_progress", "task-start via bare slug should transition to in_progress");

// 5. task-log also resolves bare slug
expectJson(["task-log", "my-feature", "--message", "log via bare slug", "--evidence", "command:TARGET:test:passed", datePrefixTarget]);

// 6. Ambiguous multi-match: create a second dated directory with same bare slug
fs.mkdirSync(path.join(datePrefixTarget, "docs/09-PLANNING/TASKS/2025-01-01-my-feature"), { recursive: true });
fs.writeFileSync(path.join(datePrefixTarget, "docs/09-PLANNING/TASKS/2025-01-01-my-feature/task_plan.md"), "# Old\n");
const ambiguousBareSlug = run(["task-log", "my-feature", "--message", "ambiguous", datePrefixTarget]);
assert(ambiguousBareSlug.status !== 0, "bare slug matching multiple dated directories should fail");
assert(ambiguousBareSlug.stderr.includes("Ambiguous task reference"), "ambiguous bare slug should report ambiguity");
assert(ambiguousBareSlug.stderr.includes(`${todayLocal}-my-feature`) && ambiguousBareSlug.stderr.includes("2025-01-01-my-feature"), "ambiguous error should list both dated candidates");

// 7. Title preservation: title should be the semantic slug, not the date-id
const noTitleCreate = expectJson(["new-task", "auto-title-check", datePrefixTarget]);
assert(noTitleCreate.task?.title === "auto-title-check", "new-task without --title should use semantic slug as display title, not dated id");
assert(noTitleCreate.task?.shortId === `${todayLocal}-auto-title-check`, "new-task without --title should still date-prefix the shortId");

console.log("Task lifecycle tests passed");
