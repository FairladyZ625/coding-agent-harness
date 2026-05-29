#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import type { HarnessTestLooseJson, HarnessTestLoosePhase } from "../helpers/harness-test-types.js";
import {
  acceptNoLessonCandidate,
  assert,
  cli,
  expectJson,
  expectPass,
  humanControlledTestEnv,
  node,
  repoRoot,
  run,
  tmpRoot,
  todayLocal,
  waitForCondition,
  waitForWorkbench,
} from "../helpers/harness-test-utils.mjs";

const lifecycleTarget = path.join(tmpRoot, "lifecycle-target");
fs.mkdirSync(lifecycleTarget);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", lifecycleTarget]);
const automaticTaskDryRun = expectJson(["new-task", "--title", "Automatic ID Collision Guard", "--dry-run", lifecycleTarget]);
assert(automaticTaskDryRun.task?.shortId?.startsWith(`${todayLocal}-automatic-id-collision-guard-`), "title-only new-task should derive a semantic automatic id");
assert(/[0-9a-f]{8}$/.test(automaticTaskDryRun.task.shortId), "automatic task id should end with an 8-hex random suffix");
assert(automaticTaskDryRun.task.id === `TASKS/${automaticTaskDryRun.task.shortId}`, "automatic task id should be reported as a project task id");
assert(automaticTaskDryRun.task.shortId.length <= `${todayLocal}-`.length + 48 + "-".length + 8, "automatic task id should keep the random suffix visible after slug truncation");
assert(!fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${automaticTaskDryRun.task.shortId}`)), "automatic dry-run should not mutate target");
const firstAutomaticTask = expectJson(["new-task", "--title", "Automatic ID Collision Guard", lifecycleTarget]);
const secondAutomaticTask = expectJson(["new-task", "--title", "Automatic ID Collision Guard", lifecycleTarget]);
assert(firstAutomaticTask.task.shortId !== secondAutomaticTask.task.shortId, "same-title automatic tasks should not collide");
for (const task of [firstAutomaticTask, secondAutomaticTask]) {
  assert(task.task.shortId.startsWith(`${todayLocal}-automatic-id-collision-guard-`), "created automatic task should use title slug");
  assert(/[0-9a-f]{8}$/.test(task.task.shortId), "created automatic task should include random suffix");
  assert(
    fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${task.task.shortId}/brief.md`)),
    "created automatic task should write files under the target project",
  );
}
const firstAutomaticIndex = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${firstAutomaticTask.task.shortId}/INDEX.md`), "utf8");
assert(firstAutomaticIndex.includes("harness new-task --budget standard"), "automatic task audit command should preserve title-only command shape");
assert(!firstAutomaticIndex.includes(`harness new-task ${firstAutomaticTask.task.shortId}`), "automatic task audit command should not pretend the generated id was explicit input");
const explicitDocsId = expectJson(["new-task", "docs", "--title", "Bare Docs Explicit ID", "--dry-run", lifecycleTarget]);
assert(explicitDocsId.task?.shortId === `${todayLocal}-docs`, "bare explicit task ids should stay explicit even if they look like local directories");
const hiddenManifestWorkspace = path.join(tmpRoot, "hidden-manifest-workspace");
const hiddenManifestRoot = path.join(hiddenManifestWorkspace, ".harness-private", "coding-agent-harness");
fs.mkdirSync(hiddenManifestRoot, { recursive: true });
fs.writeFileSync(path.join(hiddenManifestRoot, "harness.yaml"), `version: 2
locale: zh-CN
capabilities:
  - core
structure:
  harnessRoot: coding-agent-harness
  planningRoot: coding-agent-harness/planning
  tasksRoot: coding-agent-harness/planning/tasks
  modulesRoot: coding-agent-harness/planning/modules
  externalRoot: coding-agent-harness/planning/external
  governanceRoot: coding-agent-harness/governance
  generatedRoot: coding-agent-harness/governance/generated
`);
const hiddenTargetAutomatic = expectJson(["new-task", "--title", "Hidden Target Automatic"], { cwd: hiddenManifestWorkspace });
assert(hiddenTargetAutomatic.task?.shortId.startsWith(`${todayLocal}-hidden-target-automatic-`), "implicit new-task should derive an automatic id from the title, not from a discovered harness directory");
assert(
  fs.existsSync(path.join(hiddenManifestWorkspace, ".harness-private", "coding-agent-harness/planning/tasks", hiddenTargetAutomatic.task.shortId, "brief.md")),
  "implicit new-task should write task files under the discovered hidden harness target",
);
assert(!fs.existsSync(path.join(hiddenManifestWorkspace, "coding-agent-harness")), "implicit new-task should not recreate a default harness root when a hidden manifest is present");
const lifecycleDryRun = expectJson(["new-task", "phase-2-lifecycle", "--title", "阶段二任务生命周期", "--locale", "zh-CN", "--dry-run", lifecycleTarget]);
assert(lifecycleDryRun.dryRun === true, "new-task dry-run should report dryRun true");
assert(
  lifecycleDryRun.changes.some((change) => change.destination.endsWith("brief.md") && change.action === "would-create"),
  "new-task dry-run should plan brief.md",
);
assert(
  lifecycleDryRun.changes.some((change) => change.destination.endsWith("INDEX.md") && change.action === "would-create"),
  "new-task dry-run should plan a root task INDEX.md",
);
assert(!fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle`)), "new-task dry-run should not mutate target");
const lifecycleCreate = expectJson(["new-task", "phase-2-lifecycle", "--title", "阶段二任务生命周期", "--locale", "zh-CN", lifecycleTarget]);
assert(lifecycleCreate.task?.shortId === `${todayLocal}-phase-2-lifecycle`, "new-task should report normalized short task id");
assert(lifecycleCreate.task?.id === `TASKS/${todayLocal}-phase-2-lifecycle`, "new-task should report relative task id");
for (const required of ["INDEX.md", "brief.md", "task_plan.md", "execution_strategy.md", "visual_map.md", "findings.md", "lesson_candidates.md", "progress.md", "review.md"]) {
  assert(
    fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle`, required)),
    `new-task should create ${required}`,
  );
}
const lifecycleIndex = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/INDEX.md`), "utf8");
assert(lifecycleIndex.includes("阶段二任务生命周期"), "root task index should render the task title");
assert(lifecycleIndex.includes("task_plan.md") && lifecycleIndex.includes("visual_map.md"), "root task index should link core contract files");
assert(lifecycleIndex.includes("Preset") || lifecycleIndex.includes("预设"), "root task index should reserve a system-rendered preset summary area");
assert(
  fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/brief.md`), "utf8").includes("阶段二任务生命周期"),
  "new-task should render the requested title into brief.md",
);
assert(
  fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/task_plan.md`), "utf8").includes("Task Contract: harness-task/v1"),
  "new-task should render the durable task contract marker",
);
const lifecycleTaskPlan = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/task_plan.md`), "utf8");
assert(!lifecycleTaskPlan.includes("| Budget | Use When |"), "task_plan.md should not repeat the budget matrix");
assert(!lifecycleTaskPlan.includes("Do not hand-copy this template"), "task_plan.md should not carry scaffold usage warnings");
assert(!lifecycleTaskPlan.includes("| Contract File | Purpose |"), "task_plan.md should not repeat generic contract-file purpose tables");
assert(!lifecycleTaskPlan.includes("Scaffold Provenance"), "new-task should not render scaffold provenance into task_plan.md");
const lifecycleBrief = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/brief.md`), "utf8");
assert(!lifecycleBrief.includes("## Scaffold Provenance"), "new-task should not render scaffold provenance into brief.md");
assert(lifecycleIndex.includes("## 任务审计元数据"), "new-task should render task audit metadata into INDEX.md");
assert(lifecycleIndex.includes("| Created By | harness new-task |"), "new-task should record CLI scaffold provenance in INDEX.md");
assert(lifecycleIndex.includes(`| Created At | ${todayLocal} |`), "new-task should record the scaffold date in INDEX.md");
assert(lifecycleIndex.includes("| Budget | standard |"), "new-task should record the selected budget in INDEX.md");
assert(lifecycleIndex.includes("harness new-task"), "new-task should record the command shape in INDEX.md");
assert(lifecycleIndex.includes("| Human Review Status | not-confirmed |"), "new-task should initialize human review status in INDEX.md");
const lifecycleVisualMap = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/visual_map.md`), "utf8");
assert(lifecycleVisualMap.includes("| Phase ID | Kind | Depends On | State | Completion |"), "new-task should render phase kind columns");
assert(lifecycleVisualMap.includes("Exit Command"), "new-task should render phase exit commands");
assert(lifecycleVisualMap.includes("Actor"), "new-task should render phase actors");
assert(!lifecycleVisualMap.includes("<task-id>"), "new-task should not leave task-id placeholders in exit commands");
assert(lifecycleVisualMap.includes(`harness task-review ${todayLocal}-phase-2-lifecycle`), "standard task visual map should render a concrete review command");
const duplicateLifecycle = run(["new-task", `${todayLocal}-phase-2-lifecycle`, "--title", "duplicate", lifecycleTarget]);
assert(duplicateLifecycle.status !== 0, "new-task should refuse to overwrite an existing task directory");
const simpleLifecycle = expectJson(["new-task", "simple-lifecycle", "--budget", "simple", "--title", "简单任务", "--locale", "zh-CN", lifecycleTarget]);
assert(simpleLifecycle.task?.budget === "simple", "new-task --budget simple should report simple budget");
for (const required of ["INDEX.md", "brief.md", "task_plan.md", "visual_map.md", "progress.md"]) {
  assert(
    fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-simple-lifecycle`, required)),
    `simple task should create ${required}`,
  );
}
for (const omitted of ["execution_strategy.md", "findings.md", "review.md", "lesson_candidates.md"]) {
  assert(
    !fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-simple-lifecycle`, omitted)),
    `simple task should not create ${omitted}`,
  );
}
const simpleTaskPlan = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-simple-lifecycle/task_plan.md`), "utf8");
assert(/Selected budget\s*:\s*simple/i.test(simpleTaskPlan) || /选择预算\s*[:：]\s*simple/i.test(simpleTaskPlan), "simple task should persist selected budget");
const simpleVisualMap = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-simple-lifecycle/visual_map.md`), "utf8");
assert(!simpleVisualMap.includes("<task-id>"), "simple visual map should not leave task-id placeholders in exit commands");
assert(simpleVisualMap.includes(`harness task-complete ${todayLocal}-simple-lifecycle`), "simple visual map should route the gate to task-complete");
assert(!simpleVisualMap.includes("task-review"), "simple visual map should not route through agent review submission");
assert(!simpleVisualMap.includes("review-confirm"), "simple visual map should not route through human review confirmation");
const budgetContractTarget = path.join(tmpRoot, "budget-contract-target");
fs.mkdirSync(budgetContractTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", budgetContractTarget]);
expectJson(["new-task", "budget-simple", "--budget", "simple", "--title", "Budget Simple", budgetContractTarget]);
expectJson(["new-task", "budget-standard", "--title", "Budget Standard", budgetContractTarget]);
expectJson(["new-task", "budget-complex", "--budget", "complex", "--title", "Budget Complex", budgetContractTarget]);
fs.rmSync(path.join(budgetContractTarget, `coding-agent-harness/planning/tasks/${todayLocal}-budget-simple/brief.md`));
fs.rmSync(path.join(budgetContractTarget, `coding-agent-harness/planning/tasks/${todayLocal}-budget-standard/INDEX.md`));
fs.rmSync(path.join(budgetContractTarget, `coding-agent-harness/planning/tasks/${todayLocal}-budget-standard/review.md`));
fs.rmSync(path.join(budgetContractTarget, `coding-agent-harness/planning/tasks/${todayLocal}-budget-complex/references/INDEX.md`));
const budgetContractCheck = run(["check", "--profile", "target-project", budgetContractTarget]);
const budgetContractOutput = `${budgetContractCheck.stdout}\n${budgetContractCheck.stderr}`;
assert(budgetContractCheck.status !== 0, "check should fail when CLI-generated task budget files are missing");
assert(budgetContractOutput.includes(`${todayLocal}-budget-simple missing brief.md`), "check should require brief.md for simple tasks");
assert(budgetContractOutput.includes(`${todayLocal}-budget-standard missing INDEX.md`), "check should require root INDEX.md for standard tasks");
assert(budgetContractOutput.includes(`${todayLocal}-budget-standard missing review.md`), "check should require review.md for standard tasks");
assert(budgetContractOutput.includes(`${todayLocal}-budget-complex missing references/INDEX.md`), "check should require optional indexes for complex tasks");
const auditContractTarget = path.join(tmpRoot, "audit-contract-target");
fs.mkdirSync(auditContractTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", auditContractTarget]);
expectJson(["new-task", "audit-required", "--title", "Audit Required", auditContractTarget]);
const auditIndexPath = path.join(auditContractTarget, `coding-agent-harness/planning/tasks/${todayLocal}-audit-required/INDEX.md`);
const auditBriefPath = path.join(auditContractTarget, `coding-agent-harness/planning/tasks/${todayLocal}-audit-required/brief.md`);
const auditIndex = fs.readFileSync(auditIndexPath, "utf8");
fs.writeFileSync(auditIndexPath, auditIndex.replace(/\n## Task Audit Metadata\n[\s\S]*?(?=\n## Core Contract Files)/, "\n"));
const missingAuditCheck = run(["check", "--profile", "target-project", auditContractTarget]);
const missingAuditOutput = `${missingAuditCheck.stdout}\n${missingAuditCheck.stderr}`;
assert(missingAuditCheck.status !== 0, "check should fail when required Task Audit Metadata is missing");
assert(missingAuditOutput.includes("missing Task Audit Metadata"), "missing task audit failure should explain the missing section");
assert(missingAuditOutput.includes(`${todayLocal}-audit-required/INDEX.md`), "missing task audit failure should route to INDEX.md");
fs.writeFileSync(auditIndexPath, auditIndex);
fs.appendFileSync(
  auditBriefPath,
  `\n## Scaffold Provenance\n\n| Field | Value |\n| --- | --- |\n| Created By | manual-exception |\n| Command Shape | n/a |\n| Created At | ${todayLocal} |\n| Budget | standard |\n| Template Source | legacy fixture |\n| Exception Reason | legacy |\n`,
);
const legacyAuditCheck = run(["check", "--profile", "target-project", auditContractTarget]);
const legacyAuditOutput = `${legacyAuditCheck.stdout}\n${legacyAuditCheck.stderr}`;
assert(legacyAuditCheck.status !== 0, "check should fail when a legacy Scaffold Provenance block remains");
assert(legacyAuditOutput.includes("legacy Scaffold Provenance must be migrated to INDEX.md"), "legacy scaffold failure should explain migration action");
assert(legacyAuditOutput.includes(`${todayLocal}-audit-required/brief.md`), "legacy scaffold failure should route to brief.md");
const longRunningLifecycle = expectJson(["new-task", "long-running-lifecycle", "--long-running", "--title", "长程任务", "--locale", "zh-CN", lifecycleTarget]);
assert(longRunningLifecycle.task?.longRunning === true, "new-task --long-running should report longRunning true");
assert(
  fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-long-running-lifecycle/long-running-task-contract.md`)),
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
assert(legacyPresetDryRun.task?.shortId?.startsWith(`${todayLocal}-harness-v1-migration-`), "new-task legacy-migration dry-run should derive an automatic preset id");
assert(/[0-9a-f]{8}$/.test(legacyPresetDryRun.task.shortId), "preset automatic task id should include a random suffix");
assert(!fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${legacyPresetDryRun.task.shortId}`)), "legacy-migration dry-run should not mutate target");
const legacyPresetDryRunWithTarget = expectJson(["new-task", "--budget", "complex", "--preset", "legacy-migration", "--from-session", legacyPresetSessionPath, "--dry-run", lifecycleTarget]);
assert(legacyPresetDryRunWithTarget.task?.shortId?.startsWith(`${todayLocal}-harness-v1-migration-`), "new-task --from-session with explicit target should derive an automatic preset id");
const legacyPresetDryRunWithExplicitId = expectJson(["new-task", "explicit-harness-migration", "--budget", "complex", "--preset", "legacy-migration", "--from-session", legacyPresetSessionPath, "--dry-run"]);
assert(legacyPresetDryRunWithExplicitId.task?.id === `TASKS/${todayLocal}-explicit-harness-migration`, "new-task --from-session with an explicit task id should keep that id and derive the target from the session");
const legacyPresetInspect = expectJson(["preset", "inspect", "legacy-migration", "--json", lifecycleTarget]);
assert(legacyPresetInspect.id === "legacy-migration", "preset inspect should load legacy-migration from presets/<id>/preset.yaml");
assert(legacyPresetInspect.version === 2, "legacy-migration preset package should report version 2");
assert(legacyPresetInspect.compatibleBudgets?.includes("complex"), "legacy-migration preset should declare complex budget compatibility");
assert(legacyPresetInspect.audit?.manifestRequired === true, "preset package should require manifest audit evidence");
assert(legacyPresetInspect.writeScopes?.some((scope) => scope.path === "{{paths.tasksRoot}}/**"), "preset package should declare structure-aware task write scope");
assert(legacyPresetInspect.workbench?.migrationQueueSchema === "workbench/migration-queue.schema.json", "legacy-migration preset should declare a workbench migration queue schema");
const legacyPresetCheck = expectJson(["preset", "check", "legacy-migration", "--json", lifecycleTarget]);
assert(legacyPresetCheck.status === "pass", "preset check legacy-migration should pass");
assert(legacyPresetCheck.entrypoints?.newTask?.type === "template", "preset check should validate the newTask entrypoint manifest");
const legacyPresetTask = expectJson(["new-task", "--budget", "complex", "--preset", "legacy-migration", "--from-session", legacyPresetSessionPath]);
assert(legacyPresetTask.task?.shortId?.startsWith(`${todayLocal}-harness-v1-migration-`), "legacy-migration preset should derive an automatic default task id");
assert(/[0-9a-f]{8}$/.test(legacyPresetTask.task.shortId), "legacy-migration default task id should include a random suffix");
assert(legacyPresetTask.task?.kind === "project-migration", "legacy-migration preset should report project-migration kind");
assert(legacyPresetTask.task?.preset === "legacy-migration", "legacy-migration preset should report preset");
assert(legacyPresetTask.task?.presetVersion === "2", "legacy-migration preset should use version from preset.yaml");
assert(legacyPresetTask.task?.presetAudit?.manifestPath.endsWith(".coding-agent-harness/presets/legacy-migration/preset.yaml"), "legacy-migration preset should report seeded project manifest audit path");
assert(legacyPresetTask.task?.evidenceBundle, "legacy-migration preset should report evidence bundle");
const legacyPresetTaskDir = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${legacyPresetTask.task.shortId}`);
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
assert(legacyPresetAudit.manifestPath.endsWith(".coding-agent-harness/presets/legacy-migration/preset.yaml"), "preset audit should record the seeded project manifest path");
assert(legacyPresetAudit.entrypoints.newTask.type === "template", "preset audit should record audited newTask entrypoint");
assert(legacyPresetAudit.writeScopes.length > 0, "preset audit should record allowed write scopes");
const legacyMigrationLedger = JSON.parse(fs.readFileSync(path.join(lifecycleTarget, legacyPresetTask.task.evidenceBundle, "migration-ledger.json"), "utf8")) as {
  phases: Array<{ automationAllowed?: boolean; evidenceLedgerRequired?: boolean; id: string }>;
  staticDashboardRole: string;
  workbenchRole: string;
};
assert(legacyMigrationLedger.phases.some((phase) => phase.id === "mechanical-scaffold" && phase.automationAllowed === true), "migration ledger should allow mechanical scaffold automation");
assert(legacyMigrationLedger.phases.some((phase) => phase.id === "semantic-reconstruction" && phase.evidenceLedgerRequired === true && phase.automationAllowed === false), "migration ledger should block scaffold-only semantic reconstruction");
assert(legacyMigrationLedger.workbenchRole === "human-confirmation-control-plane", "migration ledger should mark workbench as human confirmation control plane");
assert(legacyMigrationLedger.staticDashboardRole === "evidence-snapshot", "migration ledger should mark static dashboard as evidence snapshot");
const legacyPresetStatus = expectJson(["status", "--json", lifecycleTarget]);
const legacyPresetStatusTask = legacyPresetStatus.tasks.find((task) => task.id === legacyPresetTask.task.id);
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
const promotableCandidatePath = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-long-running-lifecycle/lesson_candidates.md`);
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
const promoteDefault = expectJson(["lesson-promote", "long-running-lifecycle", "LC-20260521-001", lifecycleTarget]);
assert(promoteDefault.dryRun === true && promoteDefault.applyRequired === true, "lesson-promote without --apply should not write lesson detail docs");
const promotedLessonDetailPath = path.join(lifecycleTarget, "coding-agent-harness/governance/lessons/L-2026-05-21-001-commit-contract-must-be-explicit.md");
assert(!fs.existsSync(promotedLessonDetailPath), "lesson-promote default should not create a detail document");
const promoteRun = expectJson(["lesson-promote", "long-running-lifecycle", "LC-20260521-001", "--apply", lifecycleTarget]);
assert(promoteRun.lessonId === "L-2026-05-21-001", "lesson-promote should return the created lesson id");
assert(
  fs.existsSync(promotedLessonDetailPath),
  "lesson-promote should create a detail document",
);
assert(
  !fs.existsSync(path.join(lifecycleTarget, "docs/01-GOVERNANCE/Lessons-SSoT.md")),
  "lesson-promote should not create or append a global Lessons table",
);
assert(fs.readFileSync(promotableCandidatePath, "utf8").includes("| LC-20260521-001 | promoted |"), "lesson-promote should mark the candidate row promoted");
const promoteAgain = expectJson(["lesson-promote", "long-running-lifecycle", "LC-20260521-001", "--apply", lifecycleTarget]);
assert(promoteAgain.changes.length === 0, "lesson-promote should be idempotent after promotion");
expectPass(["check", "--profile", "target-project", lifecycleTarget]);
const simpleStart = expectJson(["task-start", "simple-lifecycle", "--message", "开始简单任务", lifecycleTarget]);
assert(simpleStart.task?.phases?.some((phase) => phase.id === "INIT-01" && phase.state === "done" && phase.completion === 100), "task-start should mark the init phase complete");
expectJson(["task-phase", "simple-lifecycle", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
const simpleComplete = expectJson(["task-complete", "simple-lifecycle", "--message", "简单任务完成", lifecycleTarget]);
assert(simpleComplete.task?.state === "done", "simple task should be able to complete without review");
assert(simpleComplete.task?.phases?.some((phase) => phase.id === "GATE-01" && phase.state === "done" && phase.completion === 100), "task-complete should mark the simple gate phase complete");
assert(simpleComplete.task?.lifecycleState === "closed", "completed simple task should be closed without separate closeout SSoT");
assert(simpleComplete.task?.taskQueues?.includes("finalized"), "completed simple task should enter the finalized queue");
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
const lifecyclePhase = expectJson(["task-phase", "phase-2-lifecycle", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
assert(lifecyclePhase.task?.phases?.some((phase) => phase.id === "EXEC-01" && phase.state === "done" && phase.completion === 100), "task-phase should update visual map row");
assert(
  fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/visual_map.md`), "utf8").includes("Visual Map Contract: v1.0"),
  "new-task should render canonical visual map contract",
);
expectJson(["task-phase", "phase-2-lifecycle", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
const missingPhase = run(["task-phase", "phase-2-lifecycle", "NO_SUCH_PHASE", "--state", "done", lifecycleTarget]);
assert(missingPhase.status !== 0, "task-phase should fail for unknown phase id");
assert(missingPhase.stderr.includes("Phase not found"), "task-phase unknown phase should explain missing phase");
const directComplete = run(["task-complete", "phase-2-lifecycle", "--message", "跳过审查完成", lifecycleTarget]);
assert(directComplete.status !== 0, "standard task-complete should require review state");
assert(directComplete.stderr.includes("task-review"), "standard task-complete failure should tell the user to run task-review first");
expectJson(["task-start", "phase-2-lifecycle", "--message", "恢复执行生命周期切片", lifecycleTarget]);
const lifecycleReview = expectJson(["task-review", "phase-2-lifecycle", "--message", "进入执行审查", lifecycleTarget]);
assert(lifecycleReview.task?.state === "review", "task-review should report review state");
assert(lifecycleReview.task?.phases?.some((phase) => phase.id === "GATE-01" && phase.state === "done" && phase.completion === 100), "task-review should mark the agent review gate complete");
assert(lifecycleReview.task?.lessonCandidateDecisionComplete === true, "task-review should auto-record no-candidate lesson decisions for empty candidate tables");
assert(!lifecycleReview.task?.materialIssues?.some((issue) => issue.code === "missing-lesson-decision"), "task-review should not leave empty lesson candidates as missing material");
assert(lifecycleReview.task?.taskQueues?.includes("review"), "reviewed tasks with task-local walkthrough should enter the review queue");
const lifecycleReviewPath = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/review.md`);
fs.writeFileSync(
  lifecycleReviewPath,
  fs.readFileSync(lifecycleReviewPath, "utf8").replace(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| RR-001 | P1 | Human review is still pending | TARGET:coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/progress.md | confirm in dashboard | yes | open | yes | dashboard |`,
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
  fs.readFileSync(lifecycleReviewPath, "utf8").replace(`| RR-001 | P1 | Human review is still pending | TARGET:coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/progress.md | confirm in dashboard | yes | open | yes | dashboard |`, `| RR-001 | P1 | Human review is closed | TARGET:coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/progress.md | confirmed in dashboard | no | closed | no | none |`),
);
const unconfirmedComplete = run(["task-complete", "phase-2-lifecycle", "--message", "未确认审查完成", lifecycleTarget]);
assert(unconfirmedComplete.status !== 0, "task-complete should require human review confirmation");
assert(unconfirmedComplete.stderr.includes("review-confirm"), "unconfirmed review failure should tell the user to run review-confirm");
const lifecycleWalkthrough = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/walkthrough.md`);
const lifecycleWalkthroughContent = fs.readFileSync(lifecycleWalkthrough, "utf8");
fs.rmSync(lifecycleWalkthrough);
const missingWalkthroughConfirm = run(["review-confirm", `TASKS/${todayLocal}-phase-2-lifecycle`, "--reviewer", "Human Reviewer", "--message", "walkthrough reviewed", "--confirm", `${todayLocal}-phase-2-lifecycle`, lifecycleTarget]);
assert(missingWalkthroughConfirm.status !== 0, "review-confirm should require a walkthrough before human confirmation");
assert(missingWalkthroughConfirm.stderr.includes("walkthrough"), "missing walkthrough confirmation failure should explain the walkthrough requirement");
fs.writeFileSync(lifecycleWalkthrough, `${lifecycleWalkthroughContent.trimEnd()}\n\n## Summary\n\nHuman-readable walkthrough for review before completion.\n`);
acceptNoLessonCandidate(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle`));
expectJson(["new-task", "review-template-placeholder", "--title", "Review template placeholder", "--locale", "en-US", lifecycleTarget]);
const preCompleteStatus = expectJson(["status", "--json", lifecycleTarget]);
const preCompleteTask = preCompleteStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-phase-2-lifecycle`);
assert(preCompleteTask?.walkthroughPath?.endsWith(`coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/walkthrough.md`), "status should expose task-local walkthrough before human review confirmation");
assert(preCompleteTask?.reviewStatus === "agent-reviewed", "status should classify agent-written review evidence separately from human confirmation");
const reviewTemplateTask = preCompleteStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-review-template-placeholder`);
assert(reviewTemplateTask?.reviewStatus === "required", "review template placeholder Verdict: yes / no should not count as a completed review");
commitFixtureBaseline(lifecycleTarget, "before phase lifecycle review confirmation");
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
assert(lifecycleTask?.lifecycleState === "closed", "done v2 task should close through task-local walkthrough");
assert(lifecycleTask?.evidence?.some((item) => item.summary.includes("passed")), "status should collect task-log evidence");
const confirmedStatus = expectJson(["status", "--json", lifecycleTarget]);
const confirmedTask = confirmedStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-phase-2-lifecycle`);
assert(confirmedTask?.reviewStatus === "confirmed", "status should expose confirmed review status");
assert(confirmedTask?.closeoutStatus === "closed", "status should read task-local walkthrough closeout after task-complete");
const lifecycleConfirmedIndex = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/INDEX.md`), "utf8");
assert(lifecycleConfirmedIndex.includes("| Human Review Status | confirmed |"), "review-confirm should write human review confirmation fields to INDEX.md");
assert(!fs.readFileSync(lifecycleReviewPath, "utf8").includes("Human Review Confirmation"), "review-confirm should not write a human review confirmation block to review.md");

const staleCompletionTarget = path.join(tmpRoot, "stale-completion-target");
fs.mkdirSync(staleCompletionTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", staleCompletionTarget]);
expectJson(["new-task", "stale-phase-closeout", "--title", "Stale phase closeout", "--locale", "en-US", staleCompletionTarget]);
const staleTaskDir = path.join(staleCompletionTarget, `coding-agent-harness/planning/tasks/${todayLocal}-stale-phase-closeout`);
fs.writeFileSync(path.join(staleTaskDir, "progress.md"), "# Progress\n\n## Status\n\ndone\n");
const staleWalkthrough = path.join(staleTaskDir, "walkthrough.md");
fs.writeFileSync(staleWalkthrough, "# Walkthrough: Stale phase closeout\n\nCloseout Status: closed\n\n## Summary\n\nClosed while the phase table is stale.\n");
const staleCompletionCheck = run(["check", "--profile", "target-project", staleCompletionTarget]);
assert(staleCompletionCheck.status !== 0, "closed done tasks should fail when Visual Map phases are incomplete");
assert(
  staleCompletionCheck.stderr.includes("done task has incomplete Visual Map phases"),
  "stale phase closeout failure should explain the inconsistent Visual Map phases",
);

const phaseKindTarget = path.join(tmpRoot, "phase-kind-target");
fs.mkdirSync(phaseKindTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", phaseKindTarget]);
expectJson(["new-task", "phase-kind-closeout", "--budget", "simple", "--title", "Phase Kind Closeout", "--locale", "en-US", phaseKindTarget]);
const phaseKindDir = path.join(phaseKindTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-kind-closeout`);
fs.writeFileSync(
  path.join(phaseKindDir, "visual_map.md"),
  `# Phase Kind Closeout - Visual Map

Visual Map Contract: v1.0

## Phase Table

| Phase ID | Kind | Depends On | State | Completion | Output | Required Evidence | Exit Command | Actor | Evidence Status | Blocking Risk | Owner / Handoff |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| INIT-01 | init | none | done | 100 | Scope ready | task_plan.md | harness task-start TASK | agent | present | none | coordinator |
| EXEC-01 | execution | INIT-01 | done | 100 | Implementation done | diff | harness task-phase TASK EXEC-01 --state done --completion 100 --evidence present | agent | present | none | coordinator |
| GATE-01 | gate | EXEC-01 | planned | 0 | Human review pending | review.md | harness review-confirm TASK --confirm TASK | human | missing | agent must not confirm | human |
`,
);
fs.writeFileSync(path.join(phaseKindDir, "progress.md"), "# Progress\n\n## Status\n\ndone\n");
const phaseKindStatus = expectJson(["status", "--json", phaseKindTarget]);
const phaseKindTask = phaseKindStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-phase-kind-closeout`);
assert(phaseKindTask?.completion === 100, "status should compute completion from execution phases only");
assert(phaseKindTask?.phases?.some((phase) => phase.id === "GATE-01" && phase.kind === "gate" && phase.actor === "human"), "status should expose gate phase kind and actor");

const phaseKindReviewTarget = path.join(tmpRoot, "phase-kind-review-target");
fs.mkdirSync(phaseKindReviewTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", phaseKindReviewTarget]);
expectJson(["new-task", "review-gate-kind", "--title", "Review Gate Kind", "--locale", "en-US", phaseKindReviewTarget]);
expectJson(["task-start", "review-gate-kind", "--message", "begin", phaseKindReviewTarget]);
expectJson(["task-phase", "review-gate-kind", "GATE-01", "--state", "done", "--completion", "100", "--evidence", "present", phaseKindReviewTarget]);
const gateOnlyReview = run(["task-review", "review-gate-kind", "--message", "gate only", phaseKindReviewTarget]);
assert(gateOnlyReview.status !== 0, "task-review should not accept gate-only phase progress");
assert(gateOnlyReview.stderr.includes("execution phase progress"), "task-review gate-only failure should name execution phase progress");
expectJson(["task-phase", "review-gate-kind", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", phaseKindReviewTarget]);
const executionReview = expectJson(["task-review", "review-gate-kind", "--message", "execution ready", phaseKindReviewTarget]);
assert(executionReview.task?.state === "review", "task-review should accept execution phase progress");

const phaseNoExecutionTarget = path.join(tmpRoot, "phase-no-execution-target");
fs.mkdirSync(phaseNoExecutionTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", phaseNoExecutionTarget]);
expectJson(["new-task", "no-execution-kind", "--title", "No Execution Kind", "--locale", "en-US", phaseNoExecutionTarget]);
const phaseNoExecutionDir = path.join(phaseNoExecutionTarget, `coding-agent-harness/planning/tasks/${todayLocal}-no-execution-kind`);
fs.writeFileSync(
  path.join(phaseNoExecutionDir, "visual_map.md"),
  `# No Execution Kind - Visual Map

Visual Map Contract: v1.0

## Phase Table

| Phase ID | Kind | Depends On | State | Completion | Output | Required Evidence | Exit Command | Actor | Evidence Status | Blocking Risk | Owner / Handoff |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| INIT-01 | init | none | done | 100 | Scope ready | task_plan.md | harness task-start TASK | agent | present | none | coordinator |
| GATE-01 | gate | INIT-01 | planned | 0 | Review pending | review.md | harness task-review TASK --message summary | agent | missing | none | coordinator |
`,
);
const noExecutionCheck = run(["check", "--profile", "target-project", phaseNoExecutionTarget]);
assert(noExecutionCheck.status !== 0, "checker should reject standard phase maps without execution phases");
assert(noExecutionCheck.stderr.includes("non-skipped execution phase"), "checker failure should explain missing execution phase");
expectJson(["task-start", "no-execution-kind", "--message", "begin", phaseNoExecutionTarget]);
const noExecutionReview = run(["task-review", "no-execution-kind", "--message", "no execution", phaseNoExecutionTarget]);
assert(noExecutionReview.status !== 0, "task-review should reject phase maps without execution phases");
assert(noExecutionReview.stderr.includes("execution phase"), "task-review failure should explain missing execution phase");

const unregisteredModuleCreate = run(["new-task", "unregistered-module", "--module", "auth", "--title", "Unregistered", lifecycleTarget]);
assert(unregisteredModuleCreate.status !== 0, "new-task --module should reject unregistered modules");
assert(unregisteredModuleCreate.stderr.includes("harness module register auth"), "unregistered module error should provide a register hint");
const authRegistration = expectJson(["module", "register", "auth", "--title", "Auth", "--prefix", "AUTH", "--scope", "src/auth/**", "--status", "in-progress", lifecycleTarget]);
assert(authRegistration.moduleKey === "auth", "module register should report the normalized module key");
assert(fs.readFileSync(path.join(lifecycleTarget, "coding-agent-harness/harness.yaml"), "utf8").includes("modules:"), "module register should persist modules in harness.yaml");
for (const required of ["brief.md", "module_plan.md", "execution_strategy.md", "visual_map.md", "session_prompt.md"]) {
  assert(fs.existsSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth", required)), `module register should scaffold ${required}`);
}
assert(fs.readFileSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth/brief.md"), "utf8").includes("Auth"), "module register should render module title into scaffolded brief");
const inlineModuleTask = expectJson(["new-task", "inline-module", "--module", "gui", "--register-module", "--module-title", "GUI", "--module-prefix", "GUI", "--module-scope", "src/gui/**", "--title", "Inline Module", lifecycleTarget]);
assert(inlineModuleTask.task?.id === `MODULES/gui/${todayLocal}-inline-module`, "new-task --register-module should register and create a module task in one command");
assert(fs.readFileSync(path.join(lifecycleTarget, "coding-agent-harness/harness.yaml"), "utf8").includes("gui:"), "new-task --register-module should persist the new module in harness.yaml");
assert(fs.existsSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/gui/session_prompt.md")), "new-task --register-module should scaffold module template files");
fs.rmSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/gui/session_prompt.md"));
const scaffoldRepair = expectJson(["module", "scaffold", "gui", lifecycleTarget]);
assert(scaffoldRepair.changes.some((change) => change.destination.endsWith("planning/modules/gui/session_prompt.md")), "module scaffold should report repaired missing template files");
assert(fs.existsSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/gui/session_prompt.md")), "module scaffold should repair missing registered module template files");
const moduleLifecycle = expectJson(["new-task", "module-lifecycle", "--module", "auth", "--budget", "complex", "--title", "模块生命周期", "--locale", "zh-CN", lifecycleTarget]);
assert(moduleLifecycle.task?.id === `MODULES/auth/${todayLocal}-module-lifecycle`, "new-task --module should create a module task id");
assert(moduleLifecycle.task?.preset === "module", "new-task --module should apply the module preset by default");
assert(moduleLifecycle.task?.kind === "module-task", "new-task --module should use module preset task kind");
assert(moduleLifecycle.task?.presetAudit?.commandWriteScopes?.includes("coding-agent-harness/governance/generated/Harness-Ledger.md"), "module preset audit should distinguish full command writes from preset-owned write scopes");
const modulePresetAuditFile = JSON.parse(fs.readFileSync(path.join(lifecycleTarget, moduleLifecycle.task.evidenceBundle, "preset-audit.json"), "utf8"));
assert(modulePresetAuditFile.commandWriteScopes?.includes("coding-agent-harness/governance/generated/Harness-Ledger.md"), "persisted module preset audit should include command-level governance writes");
assert(modulePresetAuditFile.presetWriteScopes?.includes("coding-agent-harness/planning/**"), "persisted module preset audit should retain preset-owned write scopes");
assert(fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/modules/auth/tasks/${todayLocal}-module-lifecycle/references/INDEX.md`)), "complex module task should create references index");
assert(fs.existsSync(path.join(lifecycleTarget, `coding-agent-harness/planning/modules/auth/tasks/${todayLocal}-module-lifecycle/artifacts/INDEX.md`)), "complex module task should create artifacts index");
assert(fs.existsSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth/brief.md")), "new-task --module should create a module brief when missing");
assert(fs.existsSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth/module_plan.md")), "new-task --module should create a module plan when missing");
assert(fs.existsSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth/execution_strategy.md")), "new-task --module should create module-level execution strategy when missing");
assert(fs.existsSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth/visual_map.md")), "new-task --module should create module-level visual map when missing");
assert(fs.existsSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth/session_prompt.md")), "new-task --module should create a module session prompt when missing");
const moduleLifecyclePlan = fs.readFileSync(path.join(lifecycleTarget, `coding-agent-harness/planning/modules/auth/tasks/${todayLocal}-module-lifecycle/task_plan.md`), "utf8");
assert(moduleLifecyclePlan.includes("Task Preset: module"), "module task plan should persist module preset metadata");
assert(moduleLifecyclePlan.includes("Module Context Entry Points"), "module preset should append module context entry points");
assert(moduleLifecyclePlan.includes("coding-agent-harness/planning/modules/auth/module_plan.md"), "module preset should point agents to the module plan");
fs.writeFileSync(
  path.join(lifecycleTarget, "coding-agent-harness/planning/modules/Module-Registry.md"),
  "# Module Registry\n\n## Active Modules\n\n| ID | Module | Path Scope | Owner | Status | Branch or Worktree | Task Plan | Shared Files | Depends On | Handoff Evidence | Residual | Updated |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| M-AUTH | Auth | src/auth/** | coordinator | reserved | n/a | coding-agent-harness/planning/modules/auth/module_plan.md | none | none | pending | none | 2026-05-19 |\n",
);
fs.writeFileSync(
  path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth/module_plan.md"),
  `# Auth Module Plan\n\n## Steps\n\n| Step ID | Name | Status | Task Plan | Depends On |\n| --- | --- | --- | --- | --- |\n| AUTH-01 | Setup | planned | coding-agent-harness/planning/modules/auth/tasks/${todayLocal}-module-lifecycle/task_plan.md | none |\n`,
);
commitFixtureBaseline(lifecycleTarget, "before module step fixture");
const moduleStep = expectJson(["module-step", "auth", "AUTH-01", "--state", "done", lifecycleTarget]);
assert(moduleStep.moduleKey === "auth" && moduleStep.stepId === "AUTH-01", "module-step should report updated module step");
assert(fs.readFileSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/auth/module_plan.md"), "utf8").includes("| AUTH-01 | Setup | done |"), "module-step should update module_plan status");
assert(fs.readFileSync(path.join(lifecycleTarget, "coding-agent-harness/planning/modules/Module-Registry.md"), "utf8").includes("| M-AUTH | auth | Auth | AUTH | codex/auth | AUTH-01 | completed |"), "module-step should update YAML-backed module registry status/current step when done");
expectJson(["module-step", "auth", "AUTH-01", "--state", "done", lifecycleTarget]);
const missingModuleStep = run(["module-step", "auth", "NO_SUCH_STEP", "--state", "done", lifecycleTarget]);
assert(missingModuleStep.status !== 0, "module-step should fail for unknown step id");
assert(missingModuleStep.stderr.includes("Module step not found"), "module-step unknown step should explain missing step");
expectJson(["task-start", `MODULES/auth/${todayLocal}-module-lifecycle`, "--message", "开始模块任务审查夹具", lifecycleTarget]);
expectJson(["task-phase", `MODULES/auth/${todayLocal}-module-lifecycle`, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
expectJson(["task-review", `MODULES/auth/${todayLocal}-module-lifecycle`, "--message", "模块任务进入审查", lifecycleTarget]);
const moduleTaskDir = path.join(lifecycleTarget, `coding-agent-harness/planning/modules/auth/tasks/${todayLocal}-module-lifecycle`);
const moduleWalkthrough = path.join(moduleTaskDir, "walkthrough.md");
fs.writeFileSync(moduleWalkthrough, `${fs.readFileSync(moduleWalkthrough, "utf8").trimEnd()}\n\n## Summary\n\nHuman-readable module walkthrough for review confirmation.\n`);
acceptNoLessonCandidate(moduleTaskDir);
commitFixtureBaseline(lifecycleTarget, "before module lifecycle review confirmation");
const moduleConfirm = expectJson(["review-confirm", `MODULES/auth/${todayLocal}-module-lifecycle`, "--reviewer", "Human Reviewer", "--confirm", `${todayLocal}-module-lifecycle`, lifecycleTarget]);
assert(moduleConfirm.task?.id === `MODULES/auth/${todayLocal}-module-lifecycle`, "review-confirm should accept full module task ids");
const workbenchReviewTask = expectJson(["new-task", "workbench-review", "--title", "Workbench review gate", "--locale", "zh-CN", lifecycleTarget]);
assert(workbenchReviewTask.task?.id === `TASKS/${todayLocal}-workbench-review`, "new-task should create workbench review gate fixture");
const workbenchReviewProgress = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-workbench-review/progress.md`);
const workbenchClosedReviewTask = expectJson(["new-task", "workbench-closed-review", "--title", "Closed review debt", "--locale", "zh-CN", lifecycleTarget]);
assert(workbenchClosedReviewTask.task?.id === `TASKS/${todayLocal}-workbench-closed-review`, "new-task should create closed review debt fixture");
const workbenchClosedReviewProgress = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-workbench-closed-review/progress.md`);
fs.writeFileSync(
  workbenchClosedReviewProgress,
  fs.readFileSync(workbenchClosedReviewProgress, "utf8").replace(/^## 状态：.*$/m, "## 状态：done"),
);
commitFixtureBaseline(lifecycleTarget, "before workbench closed review phase fixture");
expectJson(["task-phase", "workbench-closed-review", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
const closedReviewWalkthrough = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-workbench-closed-review/walkthrough.md`);
fs.writeFileSync(closedReviewWalkthrough, "# Walkthrough: Closed review debt\n\nCloseout Status: closed\n\n## Summary\n\nHuman-readable closeout walkthrough for dashboard review.\n");
acceptNoLessonCandidate(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-workbench-closed-review`));
const closedReviewStatus = expectJson(["status", "--json", lifecycleTarget]);
const closedReviewTask = closedReviewStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-workbench-closed-review`);
assert(closedReviewTask?.walkthroughPath?.endsWith(`coding-agent-harness/planning/tasks/${todayLocal}-workbench-closed-review/walkthrough.md`), "status should expose task-local walkthrough path");
assert(closedReviewTask?.lifecycleState === "closed-review-pending", "closed tasks without human confirmation should remain visible as review debt");
assert(!closedReviewTask?.taskQueues?.includes("review"), "closed tasks without human confirmation should not enter the canonical review queue");
assert(closedReviewTask?.taskQueues?.includes("missing-materials"), "closed tasks without review submission should enter missing-materials repair routing");
commitFixtureBaseline(lifecycleTarget, "before workbench lesson action fixture");
const workbenchLessonTask = expectJson(["new-task", "workbench-lesson-action", "--title", "Workbench lesson action", "--locale", "en-US", lifecycleTarget]);
const workbenchLessonDir = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-workbench-lesson-action`);
const workbenchLessonCandidatePath = path.join(workbenchLessonDir, "lesson_candidates.md");
fs.mkdirSync(path.join(workbenchLessonDir, "lessons"), { recursive: true });
fs.writeFileSync(
  path.join(workbenchLessonDir, "lessons/LC-WORKBENCH-001.md"),
  [
    "# LC-WORKBENCH-001 - Workbench lesson action",
    "",
    "## Problem / Trigger",
    "",
    "Workbench lesson creation must preserve the source candidate detail before creating a follow-up task.",
    "",
    "## Correct Rule",
    "",
    "The follow-up task reads this task-local detail artifact instead of reconstructing the lesson from the candidate row.",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(workbenchLessonDir, "lessons/LC-WORKBENCH-002.md"),
  [
    "# LC-WORKBENCH-002 - Bulk workbench lesson action",
    "",
    "## Problem / Trigger",
    "",
    "Operators need to create multiple lesson follow-up tasks without clicking each candidate one at a time.",
    "",
    "## Correct Rule",
    "",
    "The bulk action should preserve the same per-candidate prompt and follow-up task behavior as the single action.",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(workbenchLessonDir, "lessons/LC-WORKBENCH-003.md"),
  [
    "# LC-WORKBENCH-003 - Second bulk workbench lesson action",
    "",
    "## Problem / Trigger",
    "",
    "Bulk lesson sedimentation should continue through multiple valid candidates.",
    "",
    "## Correct Rule",
    "",
    "Each candidate should return its own success result and created follow-up task.",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  workbenchLessonCandidatePath,
  fs.readFileSync(workbenchLessonCandidatePath, "utf8")
    .replace(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| LC-WORKBENCH-001 | needs-promotion | A very long dashboard lesson action title that should stay bounded inside queue cards and drawers | process | n/a | lessons/LC-WORKBENCH-001.md | Workbench click path needs product feedback beyond CLI dry-run | Users need the created follow-up task, prompt, and recovery action visible in the Dashboard | pending | task lifecycle review checklist with a deliberately long promotion target | pending | possibly checker or template | pending |\n| LC-WORKBENCH-002 | needs-promotion | Bulk dashboard lesson action | process | n/a | lessons/LC-WORKBENCH-002.md | Bulk lesson creation needs parity with single create | Users need selected candidate creation without repeated clicks | pending | dashboard bulk lesson sedimentation | pending | dashboard workbench | pending |\n| LC-WORKBENCH-003 | ready-for-review | Second bulk dashboard lesson action | process | n/a | lessons/LC-WORKBENCH-003.md | Bulk lesson creation must process more than one candidate | Users need per-item success results | pending | dashboard bulk lesson sedimentation | pending | dashboard workbench | pending |",
    ),
);
commitFixtureBaseline(lifecycleTarget, "before workbench lesson sedimentation fixture");
const workbenchDir = path.join(tmpRoot, "review-workbench");
const workbench = spawn(node, [cli, "dashboard", "--workbench", "--out-dir", workbenchDir, "--host", "127.0.0.1", "--port", "0", lifecycleTarget], {
  cwd: repoRoot,
  env: humanControlledTestEnv(),
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
  assert(dashboardData.includes("LC-WORKBENCH-001"), "dashboard data should include actionable lesson candidates for workbench actions");
  const lessonCreateResponse = await fetch(new URL("api/tasks/lesson-sedimentation", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({ taskId: workbenchLessonTask.task.id, candidateId: "LC-WORKBENCH-001" }),
  });
  const lessonCreateText = await lessonCreateResponse.text();
  assert(lessonCreateResponse.status === 200, `workbench lesson sedimentation should create a follow-up task, got ${lessonCreateResponse.status}: ${lessonCreateText}`);
  const lessonCreatePayload = JSON.parse(lessonCreateText);
  assert(lessonCreatePayload.followUpTask?.id?.includes("LC-WORKBENCH-001".toLowerCase()), "lesson create response should include follow-up task id");
  assert(lessonCreatePayload.prompt?.includes("LC-WORKBENCH-001"), "lesson create response should include copyable prompt");
  assert(fs.existsSync(path.join(lifecycleTarget, lessonCreatePayload.followUpTask.path.replace(/^TARGET:/, ""), "artifacts/lesson-sedimentation-prompt.md")), "lesson create should write the copyable prompt artifact");
  const duplicateLessonResponse = await fetch(new URL("api/tasks/lesson-sedimentation", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({ taskId: workbenchLessonTask.task.id, candidateId: "LC-WORKBENCH-001" }),
  });
  const duplicateLessonPayload = await duplicateLessonResponse.json();
  assert(duplicateLessonResponse.status === 409, "duplicate workbench lesson creation should return a conflict");
  assert(duplicateLessonPayload.code === "lesson-follow-up-exists", "duplicate lesson creation should expose a stable error code");
  assert(Array.isArray(duplicateLessonPayload.recovery) && duplicateLessonPayload.recovery.length > 0, "duplicate lesson creation should include recovery actions");
  assert(duplicateLessonPayload.details?.followUpTask === lessonCreatePayload.followUpTask.id, "duplicate lesson creation should identify the existing follow-up task");
  const bulkLessonResponse = await fetch(new URL("api/tasks/lesson-sedimentation-bulk", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({
      selections: [
        { taskId: workbenchLessonTask.task.id, candidateId: "LC-WORKBENCH-002" },
        { taskId: workbenchLessonTask.task.id, candidateId: "LC-WORKBENCH-003" },
      ],
    }),
  });
  const bulkLessonText = await bulkLessonResponse.text();
  assert(bulkLessonResponse.status === 200, `bulk lesson sedimentation should create an aggregate follow-up task, got ${bulkLessonResponse.status}: ${bulkLessonText}`);
  const bulkLessonPayload = JSON.parse(bulkLessonText) as {
    candidates: number;
    created: number;
    failed: number;
    followUpTask: { id: string; path: string };
    governance?: { commit?: { commitSha?: string } };
    prompt: string;
    results: Array<{ followUpTask?: { id?: string }; ok: boolean }>;
  };
  assert(bulkLessonPayload.created === 1, "bulk lesson sedimentation should create one aggregate follow-up task");
  assert(bulkLessonPayload.candidates === 2, "bulk lesson sedimentation should count aggregated candidates");
  assert(bulkLessonPayload.failed === 0, "bulk lesson sedimentation should not fail valid selected candidates");
  assert(bulkLessonPayload.followUpTask?.id?.includes("lesson-workbench-lesson-action-aggregate"), "bulk lesson sedimentation should return the aggregate follow-up task");
  assert(bulkLessonPayload.results.every((result) => result.ok && result.followUpTask?.id === bulkLessonPayload.followUpTask.id), "bulk lesson sedimentation should point every selected candidate at the aggregate task");
  assert(bulkLessonPayload.prompt.includes("LC-WORKBENCH-002") && bulkLessonPayload.prompt.includes("LC-WORKBENCH-003"), "bulk lesson sedimentation prompt should include every selected candidate");
  const aggregateTaskDir = path.join(lifecycleTarget, bulkLessonPayload.followUpTask.path.replace(/^TARGET:/, ""));
  assert(fs.existsSync(path.join(aggregateTaskDir, "artifacts/lesson-sedimentation-prompt.md")), "aggregate lesson task should write one copyable prompt artifact");
  const updatedLessonCandidates = fs.readFileSync(workbenchLessonCandidatePath, "utf8");
  const updatedLessonRows = updatedLessonCandidates.split(/\r?\n/);
  assert(updatedLessonRows.some((line) => line.includes("| LC-WORKBENCH-002 |") && line.includes(`| ${bulkLessonPayload.followUpTask.id} |`)), "bulk lesson sedimentation should point the first candidate at the aggregate task");
  assert(updatedLessonRows.some((line) => line.includes("| LC-WORKBENCH-003 |") && line.includes(`| ${bulkLessonPayload.followUpTask.id} |`)), "bulk lesson sedimentation should point the second candidate at the aggregate task");
  assert(bulkLessonPayload.governance?.commit?.commitSha, "bulk lesson sedimentation should commit the aggregate task once");
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
  const plannedReviewPayload = await plannedReview.json();
  assert(plannedReviewPayload.reviewQueueState, "workbench non-review rejection should include reviewQueueState");
  assert(Array.isArray(plannedReviewPayload.taskQueues), "workbench non-review rejection should include taskQueues");
  assert(Array.isArray(plannedReviewPayload.queueReasons), "workbench non-review rejection should include queueReasons");
  assert(typeof plannedReviewPayload.repairPrompt === "string", "workbench non-review rejection should include repairPrompt");
  fs.writeFileSync(
    workbenchReviewProgress,
    fs.readFileSync(workbenchReviewProgress, "utf8").replace(/^## 状态：.*$/m, "## 状态：review"),
  );
  const workbenchReviewWalkthrough = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-workbench-review/walkthrough.md`);
  const workbenchReviewWalkthroughContent = fs.readFileSync(workbenchReviewWalkthrough, "utf8");
  fs.rmSync(workbenchReviewWalkthrough);
  const missingWalkthroughResponse = await fetch(new URL("api/tasks/review-complete", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({ taskId: `TASKS/${todayLocal}-workbench-review`, confirmText: `${todayLocal}-workbench-review`, reviewer: "Human Reviewer", message: "confirmed without walkthrough" }),
  });
  const missingWalkthroughText = await missingWalkthroughResponse.text();
  assert(missingWalkthroughResponse.status === 409, `workbench review completion should reject tasks before canonical Review queue entry, got ${missingWalkthroughResponse.status}: ${missingWalkthroughText}`);
  assert(missingWalkthroughText.includes("review queue"), "workbench early confirmation rejection should explain Review queue requirement");
  fs.writeFileSync(workbenchReviewWalkthrough, `${workbenchReviewWalkthroughContent.trimEnd()}\n\n## Summary\n\nHuman-readable walkthrough for dashboard review confirmation.\n`);
  acceptNoLessonCandidate(path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-workbench-review`));
  commitFixtureBaseline(lifecycleTarget, "before workbench review lifecycle fixture");
  expectJson(["task-start", "workbench-review", "--message", "readying workbench review fixture", lifecycleTarget]);
  expectJson(["task-phase", "workbench-review", "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
  expectJson(["task-review", "workbench-review", "--message", "submitted for workbench confirmation", "--evidence", "command:TARGET:workbench-smoke:passed", lifecycleTarget]);
  commitFixtureBaseline(lifecycleTarget, "before workbench review confirmation");
  const bulkReviewA = prepareWorkbenchReviewConfirmationFixture("workbench-bulk-review-a");
  const bulkReviewB = prepareWorkbenchReviewConfirmationFixture("workbench-bulk-review-b");
  const bulkReviewResponse = await fetch(new URL("api/tasks/review-complete-bulk", runtime.url), {
    method: "POST",
    headers: { "content-type": "application/json", "x-harness-csrf": runtime.csrf, origin: runtime.url.replace(/\/$/, "") },
    body: JSON.stringify({
      taskIds: [bulkReviewA.id, bulkReviewB.id],
      reviewer: "Human Reviewer",
      message: "bulk confirmed from workbench",
    }),
  });
  const bulkReviewText = await bulkReviewResponse.text();
  assert(bulkReviewResponse.status === 200, `bulk review completion should pass, got ${bulkReviewResponse.status}: ${bulkReviewText}`);
  const bulkReviewPayload = JSON.parse(bulkReviewText) as {
    confirmed: number;
    failed: number;
    results: Array<{ audit?: { auditCommitSha?: string; commitSha?: string }; ok: boolean }>;
  };
  assert(bulkReviewPayload.confirmed === 2, "bulk review completion should count confirmed tasks");
  assert(bulkReviewPayload.failed === 0, "bulk review completion should not fail valid selected tasks");
  assert(bulkReviewPayload.results.every((result) => result.ok && result.audit?.commitSha), "bulk review completion should return per-task audit commits");
  assert(new Set(bulkReviewPayload.results.map((result) => result.audit?.commitSha)).size === 1, "bulk review completion should use one shared confirmation commit");
  assert(new Set(bulkReviewPayload.results.map((result) => result.audit?.auditCommitSha)).size === 1, "bulk review completion should use one shared audit commit");
  const bulkReviewStatus = expectJson(["status", "--json", lifecycleTarget]);
  assert(bulkReviewStatus.tasks.find((task) => task.id === bulkReviewA.id)?.reviewStatus === "confirmed", "bulk review completion should confirm the first selected task");
  assert(bulkReviewStatus.tasks.find((task) => task.id === bulkReviewB.id)?.reviewStatus === "confirmed", "bulk review completion should confirm the second selected task");
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
  assert([400, 409].includes(closedReviewResponse.status), `workbench review completion should reject closed review debt, got ${closedReviewResponse.status}: ${closedReviewText}`);
} finally {
  workbench.kill("SIGTERM");
}

function commitFixtureBaseline(target: string, message: string): void {
  if (!fs.existsSync(path.join(target, ".git"))) {
    expectFixtureGit(target, ["init"]);
    expectFixtureGit(target, ["config", "user.name", "Harness Test"]);
    expectFixtureGit(target, ["config", "user.email", "harness-test@example.invalid"]);
  }
  expectFixtureGit(target, ["add", "."]);
  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: target, encoding: "utf8" });
  if (diff.status === 0) return;
  expectFixtureGit(target, ["commit", "-m", `test fixture baseline: ${message}`]);
}

function expectFixtureGit(target: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd: target, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function prepareWorkbenchReviewConfirmationFixture(slug: string): { id: string; shortId: string } {
  const created = expectJson(["new-task", slug, "--title", `Bulk review ${slug}`, "--locale", "zh-CN", lifecycleTarget]);
  const taskDir = path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-${slug}`);
  const walkthrough = path.join(taskDir, "walkthrough.md");
  fs.writeFileSync(walkthrough, `${fs.readFileSync(walkthrough, "utf8").trimEnd()}\n\n## Summary\n\nHuman-readable walkthrough for bulk dashboard review confirmation.\n`);
  acceptNoLessonCandidate(taskDir);
  commitFixtureBaseline(lifecycleTarget, `before ${slug} review lifecycle fixture`);
  expectJson(["task-start", slug, "--message", "readying bulk workbench review fixture", lifecycleTarget]);
  expectJson(["task-phase", slug, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
  expectJson(["task-review", slug, "--message", "submitted for bulk workbench confirmation", "--evidence", "command:TARGET:bulk-workbench-smoke:passed", lifecycleTarget]);
  commitFixtureBaseline(lifecycleTarget, `before ${slug} review confirmation`);
  return { id: created.task.id, shortId: created.task.shortId || `${todayLocal}-${slug}` };
}
const devDir = path.join(tmpRoot, "dev-workbench");
const dev = spawn(node, [cli, "dev", "--no-open", "--out-dir", devDir, "--host", "127.0.0.1", "--port", "0", lifecycleTarget], {
  cwd: repoRoot,
  env: humanControlledTestEnv(),
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
    path.join(lifecycleTarget, `coding-agent-harness/planning/tasks/${todayLocal}-phase-2-lifecycle/walkthrough.md`),
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
commitFixtureBaseline(lifecycleTarget, "after dev refresh marker fixture");

const zhRegistryTarget = path.join(tmpRoot, "zh-module-registry-target");
fs.mkdirSync(zhRegistryTarget);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,module-parallel", zhRegistryTarget]);
assert(fs.existsSync(path.join(zhRegistryTarget, "coding-agent-harness/planning/modules/Session-Prompt-Pack.md")), "module-parallel init should create a session prompt pack");
assert(!fs.existsSync(path.join(zhRegistryTarget, "coding-agent-harness/planning/modules/_module-template")), "module-parallel init should not vendor module templates into the target project");
assert(!fs.existsSync(path.join(zhRegistryTarget, "coding-agent-harness/planning/modules/_task-template")), "module-parallel init should not vendor module task templates into the target project");
expectJson(["module", "register", "example", "--title", "示例模块", "--prefix", "EXM", "--scope", "src/example/**", zhRegistryTarget]);
expectJson(["new-task", "zh-task", "--module", "example", "--title", "中文模块任务", "--locale", "zh-CN", zhRegistryTarget]);
fs.mkdirSync(path.join(zhRegistryTarget, "coding-agent-harness/planning/modules/example"), { recursive: true });
fs.writeFileSync(
  path.join(zhRegistryTarget, "coding-agent-harness/planning/modules/example/module_plan.md"),
  `# 示例模块计划\n\n## 步骤\n\n| 步骤 ID | 名称 | 状态 | 任务计划 | 依赖 |\n| --- | --- | --- | --- | --- |\n| EXM-01 | 启动 | planned | coding-agent-harness/planning/modules/example/${todayLocal}-zh-task/task_plan.md | none |\n`,
);
expectJson(["module-step", "example", "EXM-01", "--state", "done", zhRegistryTarget]);
const zhRegistryContent = fs.readFileSync(path.join(zhRegistryTarget, "coding-agent-harness/planning/modules/Module-Registry.md"), "utf8");
assert(zhRegistryContent.includes("| M-EXM | example | 示例模块 | EXM | codex/example | EXM-01 | completed |"), "module-step should update zh-CN module registry status/current step");
const zhGraphDir = path.join(tmpRoot, "zh-module-dashboard");
expectPass(["dashboard", "--out-dir", zhGraphDir, zhRegistryTarget]);
const zhGraph = JSON.parse(fs.readFileSync(path.join(zhGraphDir, "data/graph.json"), "utf8")) as {
  nodes: Array<{ currentStep?: string; id: string; state: string; type: string }>;
};
assert(zhGraph.nodes.some((node) => node.type === "module" && node.id === "module:example" && node.state === "completed" && node.currentStep === "EXM-01"), "zh-CN module registry should populate dashboard graph");
assert(zhGraph.nodes.some((node) => node.type === "step" && node.id === "step:EXM-01" && node.state === "done"), "zh-CN module plan should populate step graph");
const moduleFiltered = expectJson(["task-list", "--json", "--module", "auth", lifecycleTarget]);
assert(moduleFiltered.tasks.length === 1 && moduleFiltered.tasks[0].id === `MODULES/auth/${todayLocal}-module-lifecycle`, "task-list --module should filter module tasks");
const moduleList = expectJson(["module", "list", "--json", lifecycleTarget]);
assert((moduleList.modules as Array<{ key?: string }>).some((module) => module.key === "auth"), "module list should read registered modules from harness.yaml");
expectJson(["module", "register", "empty", "--title", "Empty", "--prefix", "EMP", "--scope", "src/empty/**", lifecycleTarget]);
expectJson(["module", "unregister", "empty", lifecycleTarget]);
assert(!fs.readFileSync(path.join(lifecycleTarget, "coding-agent-harness/harness.yaml"), "utf8").includes("empty:"), "module unregister should remove modules with no task or ledger references");
const blockedUnregister = run(["module", "unregister", "auth", lifecycleTarget]);
assert(blockedUnregister.status !== 0, "module unregister should fail closed when task or ledger references still exist");
assert(blockedUnregister.stderr.includes("references still exist"), "module unregister refusal should explain remaining references");
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
  fs.existsSync(path.join(datePrefixTarget, `coding-agent-harness/planning/tasks/${todayLocal}-my-feature/task_plan.md`)),
  "new-task bare slug should create dated directory",
);

// 2. Already-dated slug should NOT double-prefix
const alreadyDated = expectJson(["new-task", `${todayLocal}-existing-date`, "--title", "Already Dated", datePrefixTarget]);
assert(alreadyDated.task?.shortId === `${todayLocal}-existing-date`, "new-task already-dated slug should not double-prefix");
assert(
  fs.existsSync(path.join(datePrefixTarget, `coding-agent-harness/planning/tasks/${todayLocal}-existing-date/task_plan.md`)),
  "new-task already-dated slug should create directory without double date",
);
assert(
  !fs.existsSync(path.join(datePrefixTarget, `coding-agent-harness/planning/tasks/${todayLocal}-${todayLocal}-existing-date`)),
  "new-task already-dated slug must not create double-dated directory",
);

// 3. Module task also gets date prefix
expectJson(["module", "register", "payments", "--title", "Payments", "--prefix", "PAY", "--scope", "src/payments/**", datePrefixTarget]);
const moduleWithDate = expectJson(["new-task", "module-feat", "--module", "payments", "--title", "Module Feature", datePrefixTarget]);
assert(moduleWithDate.task?.shortId === `${todayLocal}-module-feat`, "new-task --module bare slug should auto-prefix local date");
assert(moduleWithDate.task?.id === `MODULES/payments/${todayLocal}-module-feat`, "new-task --module task id should include date prefix");
assert(
  fs.existsSync(path.join(datePrefixTarget, `coding-agent-harness/planning/modules/payments/tasks/${todayLocal}-module-feat/task_plan.md`)),
  "new-task --module should create dated directory under module",
);

// 4. Bare slug lifecycle resolution: task-start resolves "my-feature" to dated directory
const startByBareSlug = expectJson(["task-start", "my-feature", "--message", "start via bare slug", datePrefixTarget]);
assert(startByBareSlug.task?.id === `TASKS/${todayLocal}-my-feature`, "task-start should resolve bare slug to dated directory");
assert(startByBareSlug.task?.state === "in_progress", "task-start via bare slug should transition to in_progress");

// 5. task-log also resolves bare slug
expectJson(["task-log", "my-feature", "--message", "log via bare slug", "--evidence", "command:TARGET:test:passed", datePrefixTarget]);

// 6. Ambiguous multi-match: create a second dated directory with same bare slug
fs.mkdirSync(path.join(datePrefixTarget, "coding-agent-harness/planning/tasks/2025-01-01-my-feature"), { recursive: true });
fs.writeFileSync(path.join(datePrefixTarget, "coding-agent-harness/planning/tasks/2025-01-01-my-feature/task_plan.md"), "# Old\n");
const ambiguousBareSlug = run(["task-log", "my-feature", "--message", "ambiguous", datePrefixTarget]);
assert(ambiguousBareSlug.status !== 0, "bare slug matching multiple dated directories should fail");
assert(ambiguousBareSlug.stderr.includes("Ambiguous task reference"), "ambiguous bare slug should report ambiguity");
assert(ambiguousBareSlug.stderr.includes(`${todayLocal}-my-feature`) && ambiguousBareSlug.stderr.includes("2025-01-01-my-feature"), "ambiguous error should list both dated candidates");

// 7. Title preservation: title should be the semantic slug, not the date-id
const noTitleCreate = expectJson(["new-task", "auto-title-check", datePrefixTarget]);
assert(noTitleCreate.task?.title === "auto-title-check", "new-task without --title should use semantic slug as display title, not dated id");
assert(noTitleCreate.task?.shortId === `${todayLocal}-auto-title-check`, "new-task without --title should still date-prefix the shortId");

console.log("Task lifecycle tests passed");
