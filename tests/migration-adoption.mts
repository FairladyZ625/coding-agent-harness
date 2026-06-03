#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assert,
  expectJson,
  expectPass,
  run,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

type DashboardStatusJson = {
  tasks: Array<{ id?: string; path: string }>;
  checkState: { details: { warnings: string[] } };
};

type MigrationRunJson = {
  operation?: string;
  capabilities: Array<{ name?: string }>;
  sessionPath: string;
};

type MigrationVerifyJson = {
  status?: string;
};

const legacyPhaseTableTarget = path.join(tmpRoot, "legacy-phase-table");
fs.mkdirSync(path.join(legacyPhaseTableTarget, "docs/09-PLANNING/TASKS/table-active"), { recursive: true });
fs.writeFileSync(path.join(legacyPhaseTableTarget, "AGENTS.md"), "# Legacy Agents\n");
fs.writeFileSync(path.join(legacyPhaseTableTarget, "docs/09-PLANNING/TASKS/table-active/task_plan.md"), "# Table Active\n");
fs.writeFileSync(
  path.join(legacyPhaseTableTarget, "docs/09-PLANNING/TASKS/table-active/progress.md"),
  "# Progress\n\n## 阶段状态表\n| Phase | Status | Notes |\n| --- | --- | --- |\n| Phase 1 | Done | ok |\n| Phase 2 | In Progress | active |\n| Phase 3 | Pending | next |\n",
);
const legacyPhaseStatus = run(["status", "--json", legacyPhaseTableTarget]);
assert(legacyPhaseStatus.status !== 0, "status should reject active legacy structures before structure migration");
assert(legacyPhaseStatus.stdout.includes("legacy harness structure is migration input only"), "legacy status failure should route to migrate-structure");
const legacyPhaseDashboard = run(["dashboard", "--out-dir", path.join(tmpRoot, "legacy-dashboard"), legacyPhaseTableTarget]);
assert(legacyPhaseDashboard.status !== 0, "dashboard should reject active legacy structures before structure migration");
assert(legacyPhaseDashboard.stderr.includes("dashboard requires v2 harness structure"), "legacy dashboard failure should route to migrate-structure");

const legacyChineseTarget = path.join(tmpRoot, "legacy-chinese");
fs.mkdirSync(path.join(legacyChineseTarget, "docs/09-PLANNING/TASKS/old"), { recursive: true });
fs.writeFileSync(path.join(legacyChineseTarget, "AGENTS.md"), "# 中文项目\n\n这是旧 harness 项目。\n");
fs.writeFileSync(path.join(legacyChineseTarget, "docs/09-PLANNING/TASKS/old/task_plan.md"), "# 旧任务\n");
const legacyChinesePlan = expectJson(["migrate-plan", "--json", legacyChineseTarget]);
assert(legacyChinesePlan.locale === "zh-CN", "migrate-plan should infer zh-CN from Chinese legacy project text");
assert(
  legacyChinesePlan.nextCommands.some((command) => command.includes(legacyChineseTarget)),
  "migrate-plan should keep executable target paths in CLI output",
);
assert(
  legacyChinesePlan.nextCommands.some((command) => command.includes("migrate-structure --plan")) &&
  legacyChinesePlan.nextCommands.some((command) => command.includes("migrate-structure --apply")),
  "migrate-plan should route hard-cutover users to migrate-structure",
);
assert(
  !legacyChinesePlan.nextCommands.some((command) => command.includes("migrate-run")),
  "migrate-plan should not route hard-cutover users to legacy migrate-run as the next command",
);

const migrationTarget = path.join(tmpRoot, "structure-migration");
const legacyTask = path.join(migrationTarget, "docs/09-PLANNING/TASKS/old");
const legacyModuleTask = path.join(migrationTarget, "docs/09-PLANNING/MODULES/auth/TASKS/auth-old");
fs.mkdirSync(legacyTask, { recursive: true });
fs.mkdirSync(legacyModuleTask, { recursive: true });
fs.mkdirSync(path.join(migrationTarget, "docs/09-PLANNING/TASKS/_task-template"), { recursive: true });
fs.mkdirSync(path.join(migrationTarget, "docs/09-PLANNING/MODULES/_task-template"), { recursive: true });
fs.mkdirSync(path.join(migrationTarget, "docs/09-PLANNING/MODULES/_module-template"), { recursive: true });
fs.mkdirSync(path.join(migrationTarget, "docs/10-WALKTHROUGH"), { recursive: true });
fs.mkdirSync(path.join(migrationTarget, "docs/11-REFERENCE"), { recursive: true });
fs.writeFileSync(
  path.join(migrationTarget, ".harness-capabilities.json"),
  JSON.stringify({ version: 1, locale: "zh-CN", capabilities: [{ name: "core", state: "configured" }, { name: "dashboard", state: "configured" }, { name: "safe-adoption", state: "configured" }] }, null, 2),
);
fs.writeFileSync(path.join(migrationTarget, "AGENTS.md"), "# Legacy Agents\n\nDO_NOT_OVERWRITE\n");
fs.writeFileSync(path.join(migrationTarget, "docs/Harness-Ledger.md"), "# Legacy Ledger\n");
fs.writeFileSync(path.join(migrationTarget, "docs/09-PLANNING/Module-Registry.md"), "# Module Registry\n");
fs.writeFileSync(path.join(migrationTarget, "docs/11-REFERENCE/external-source-intake-standard.md"), "# Legacy Standard\n");
fs.writeFileSync(path.join(legacyTask, "task_plan.md"), "# Old Task\n\nTask Contract: harness-task/v1\n\nSelected budget: simple\n");
fs.writeFileSync(path.join(legacyTask, "brief.md"), "# Old Brief\n\nThis legacy task is long enough to act as a migrated v2 fixture and verify path behavior after the one-shot structure migration.\n");
fs.writeFileSync(path.join(legacyTask, "visual_map.md"), "# Visual Map\n\nVisual Map Contract: v1.0\n");
fs.writeFileSync(path.join(legacyTask, "progress.md"), "# Progress\n\n## Status\n\nplanned\n");
fs.writeFileSync(path.join(legacyModuleTask, "task_plan.md"), "# Old Module Task\n\nTask Contract: harness-task/v1\n\nSelected budget: simple\n");
fs.writeFileSync(path.join(legacyModuleTask, "brief.md"), "# Old Module Brief\n\nThis legacy module task verifies uppercase TASKS normalization into the v2 module task directory shape.\n");
fs.writeFileSync(path.join(legacyModuleTask, "progress.md"), "# Progress\n\n## Status\n\nplanned\n");
fs.writeFileSync(path.join(migrationTarget, "docs/09-PLANNING/TASKS/_task-template/task_plan.md"), "# Legacy Task Template\n");
fs.writeFileSync(path.join(migrationTarget, "docs/09-PLANNING/MODULES/_task-template/task_plan.md"), "# Legacy Module Task Template\n");
fs.writeFileSync(path.join(migrationTarget, "docs/09-PLANNING/MODULES/_module-template/module_plan.md"), "# Legacy Module Template\n");

const docsRootPlan = expectJson(["migrate-structure", "--json", "--plan", path.join(migrationTarget, "docs")]);
assert(docsRootPlan.target === migrationTarget, "migrate-structure should accept a legacy docs/ path and resolve the project root");
assert(docsRootPlan.actions.some((action) => action.destination === "coding-agent-harness/planning/tasks"), "structure plan should move legacy tasks to v2 tasks root");
assert(docsRootPlan.capabilities.locale === "zh-CN", "structure plan should preserve legacy registry locale");
assert(docsRootPlan.capabilities.names.includes("dashboard"), "structure plan should preserve declared capabilities");

const conflictTarget = path.join(tmpRoot, "structure-migration-conflict");
fs.mkdirSync(path.join(conflictTarget, "docs/03-ARCHITECTURE"), { recursive: true });
fs.mkdirSync(path.join(conflictTarget, "coding-agent-harness/context/architecture"), { recursive: true });
fs.writeFileSync(path.join(conflictTarget, "docs/03-ARCHITECTURE/README.md"), "# Legacy Architecture\n");
fs.writeFileSync(path.join(conflictTarget, "coding-agent-harness/context/architecture/README.md"), "# Existing V2 Architecture\n");
const conflictApply = run(["migrate-structure", "--json", "--apply", conflictTarget]);
assert(conflictApply.status !== 0, "migrate-structure should fail before applying when v2 destinations would be overwritten");
assert(!fs.existsSync(path.join(conflictTarget, "coding-agent-harness/harness.yaml")), "migrate-structure conflict preflight should not leave a partial manifest");
assert(fs.existsSync(path.join(conflictTarget, "docs/03-ARCHITECTURE/README.md")), "migrate-structure conflict preflight should not move legacy docs");

const moduleConflictTarget = path.join(tmpRoot, "structure-migration-module-conflict");
fs.mkdirSync(path.join(moduleConflictTarget, "docs/09-PLANNING/MODULES/auth/TASKS/dup"), { recursive: true });
fs.mkdirSync(path.join(moduleConflictTarget, "coding-agent-harness/planning/modules/auth/tasks/dup"), { recursive: true });
fs.writeFileSync(path.join(moduleConflictTarget, "docs/09-PLANNING/MODULES/auth/TASKS/dup/task_plan.md"), "# Legacy Dup\n");
fs.writeFileSync(path.join(moduleConflictTarget, "coding-agent-harness/planning/modules/auth/tasks/dup/task_plan.md"), "# Existing V2 Module Dup\n");
const moduleConflictApply = run(["migrate-structure", "--json", "--apply", moduleConflictTarget]);
assert(moduleConflictApply.status !== 0, "migrate-structure should fail before applying when module TASKS normalization would overwrite v2 tasks");
assert(!fs.existsSync(path.join(moduleConflictTarget, "coding-agent-harness/harness.yaml")), "module conflict preflight should not leave a partial manifest");
assert(fs.existsSync(path.join(moduleConflictTarget, "docs/09-PLANNING/MODULES/auth/TASKS/dup/task_plan.md")), "module conflict preflight should not move legacy module TASKS");
assert(fs.existsSync(path.join(moduleConflictTarget, "coding-agent-harness/planning/modules/auth/tasks/dup/task_plan.md")), "module conflict preflight should preserve existing v2 module task");

const applied = expectJson(["migrate-structure", "--json", "--apply", migrationTarget]);
assert(applied.applied === true, "migrate-structure --apply should report applied true");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/harness.yaml")), "structure migration should write v2 manifest");
assert(!fs.existsSync(path.join(migrationTarget, "docs")), "structure migration should remove the active legacy docs root");
assert(!fs.existsSync(path.join(migrationTarget, ".harness-capabilities.json")), "structure migration should remove the active legacy capability registry");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/tasks/old/task_plan.md")), "structure migration should move legacy task plans to v2 tasks root");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/tasks/old/walkthrough.md")), "structure migration should add task-local walkthrough when absent");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/auth/tasks/auth-old/task_plan.md")), "structure migration should normalize legacy module task directories to v2 module tasks");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/auth/tasks/auth-old/walkthrough.md")), "structure migration should add task-local walkthroughs for migrated module tasks");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/auth/tasks/auth-old/visual_map.md")), "structure migration should add canonical visual maps for migrated tasks when absent");
assert(!fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/tasks/_task-template")), "structure migration should remove generated task template directories");
assert(!fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/_task-template")), "structure migration should remove generated module task template directories");
assert(!fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/_module-template")), "structure migration should remove generated module template directories");
assert(
  !fs.readdirSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/auth")).includes("TASKS"),
  "structure migration should remove legacy uppercase module TASKS roots",
);
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/governance/standards/external-source-intake-standard.md")), "structure migration should move reference docs to governance standards");
assert(applied.actionsApplied.some((action) => action.action === "archive-source-root"), "structure migration should archive the old docs root");

const manifest = fs.readFileSync(path.join(migrationTarget, "coding-agent-harness/harness.yaml"), "utf8");
assert(manifest.includes("locale: zh-CN"), "structure migration should persist locale in manifest");
assert(/^\s*-\s*dashboard\s*$/m.test(manifest), "structure migration should persist capabilities in manifest");
assert(/^\s*-\s*safe-adoption\s*$/m.test(manifest), "structure migration should preserve safe-adoption as historical capability metadata");
const archivedBadReview = path.join(migrationTarget, "coding-agent-harness/governance/archive/manual/legacy-task/review.md");
fs.mkdirSync(path.dirname(archivedBadReview), { recursive: true });
fs.writeFileSync(archivedBadReview, "# Archived Review\n\nThis archived review intentionally lacks current review schema sections.\n");

const migratedStatus = expectJson(["status", "--json", migrationTarget]);
assert(migratedStatus.mode === "v2-manifest", "migrated target should run in v2 manifest mode");
assert(migratedStatus.tasks.some((task) => task.path === "TARGET:coding-agent-harness/planning/tasks/old"), "status should discover migrated v2 task");
assert(migratedStatus.tasks.some((task) => task.id === "MODULES/auth/auth-old"), "status should discover migrated v2 module task identity");
assert(!JSON.stringify(migratedStatus).includes("docs/09-PLANNING"), "migrated status should not expose legacy active task paths");
assert(!migratedStatus.checkState.details.warnings.some((warning) => /legacy check failed/i.test(warning)), "v2 migrated safe-adoption target should not run the legacy checker");
assert(!migratedStatus.checkState.details.warnings.some((warning) => warning.includes("Archived Review")), "v2 migrated target should not validate archived review files");
const dashboardDir = path.join(tmpRoot, "structure-migration-dashboard");
expectPass(["dashboard", "--out-dir", dashboardDir, migrationTarget]);
const dashboardStatus = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/status.json"), "utf8")) as DashboardStatusJson;
assert(dashboardStatus.tasks.some((task) => task.path === "TARGET:coding-agent-harness/planning/tasks/old"), "dashboard should display migrated v2 task");
assert(dashboardStatus.tasks.some((task) => task.path === "TARGET:coding-agent-harness/planning/modules/auth/tasks/auth-old"), "dashboard should display migrated v2 module task");
assert(!dashboardStatus.checkState.details.warnings.some((warning) => /legacy check failed/i.test(warning)), "v2 migrated dashboard should not run the legacy checker");

const migrationRunTarget = path.join(tmpRoot, "migration-run-target");
fs.mkdirSync(migrationRunTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", migrationRunTarget]);
git(migrationRunTarget, ["init"]);
git(migrationRunTarget, ["config", "user.name", "Harness Test"]);
git(migrationRunTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(migrationRunTarget, ["add", "."]);
git(migrationRunTarget, ["commit", "-m", "baseline"]);
const migrationRunSessionDir = path.join(tmpRoot, "migration-run-session");
const migrationRun = expectJson<MigrationRunJson>(["migrate-run", "--session-dir", migrationRunSessionDir, "--json", migrationRunTarget]);
assert(migrationRun.operation === "migrate-run", "migrate-run should emit a migration session");
assert(migrationRun.capabilities.some((capability) => capability.name === "safe-adoption"), "migrate-run should add safe-adoption capability");
assert(migrationRun.capabilities.some((capability) => capability.name === "dashboard"), "migrate-run should add dashboard capability");
assert(fs.existsSync(migrationRun.sessionPath), "migrate-run should write session.json evidence");
const migrationVerify = expectJson<MigrationVerifyJson>(["migrate-verify", migrationRun.sessionPath, "--json"]);
assert(migrationVerify.status === "pass", "migrate-verify should accept a real migrate-run session");

const fullCutoverV2Target = path.join(tmpRoot, "full-cutover-v2-target");
fs.mkdirSync(fullCutoverV2Target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard,safe-adoption", fullCutoverV2Target]);
git(fullCutoverV2Target, ["init"]);
git(fullCutoverV2Target, ["config", "user.name", "Harness Test"]);
git(fullCutoverV2Target, ["config", "user.email", "harness-test@example.invalid"]);
git(fullCutoverV2Target, ["add", "."]);
git(fullCutoverV2Target, ["commit", "-m", "baseline"]);
const fullCutoverV2SessionDir = path.join(tmpRoot, "full-cutover-v2-session");
const fullCutoverV2Run = expectJson<MigrationRunJson>(["migrate-run", "--session-dir", fullCutoverV2SessionDir, "--json", fullCutoverV2Target]);
assert(fullCutoverV2Run.operation === "migrate-run", "v2 full cutover fixture should emit a migration session");
const fullCutoverV2Session = JSON.parse(fs.readFileSync(fullCutoverV2Run.sessionPath, "utf8"));
assert(fullCutoverV2Session.plan.mode === "v2-manifest", "full cutover fixture should be backed by a v2 manifest registry");
assert(fullCutoverV2Session.plan.summary.fullCutoverEligible === true, "v2 manifest fixture should be full-cutover eligible");
const fullCutoverV2Verify = expectJson<MigrationVerifyJson>(["migrate-verify", fullCutoverV2Run.sessionPath, "--full-cutover", "--json"]);
assert(fullCutoverV2Verify.status === "pass", "migrate-verify --full-cutover should accept v2 manifest sessions");

const legacyModeSessionPath = path.join(fullCutoverV2SessionDir, "legacy-mode-session.json");
fullCutoverV2Session.plan.mode = "legacy-compat";
fs.writeFileSync(legacyModeSessionPath, `${JSON.stringify(fullCutoverV2Session, null, 2)}\n`);
const legacyModeVerify = run(["migrate-verify", legacyModeSessionPath, "--full-cutover", "--json"]);
assert(legacyModeVerify.status !== 0, "migrate-verify --full-cutover should reject legacy-compat sessions");
assert(
  `${legacyModeVerify.stdout}\n${legacyModeVerify.stderr}`.includes("declared-capability or v2-manifest"),
  "legacy-compat full-cutover failure should explain accepted capability registry modes",
);

const forgedSessionPath = path.join(migrationRunSessionDir, "forged-session.json");
const forgedSession = JSON.parse(fs.readFileSync(migrationRun.sessionPath, "utf8"));
forgedSession.checks.strict.status = "pass";
forgedSession.strictDeferred = null;
fs.writeFileSync(path.join(migrationRunTarget, "BROKEN.md"), "dirty after session\n");
fs.writeFileSync(forgedSessionPath, `${JSON.stringify(forgedSession, null, 2)}\n`);
const forgedVerify = run(["migrate-verify", forgedSessionPath, "--full-cutover", "--json"]);
assert(forgedVerify.status !== 0, "migrate-verify should reject forged strict-pass evidence");
assert(`${forgedVerify.stdout}\n${forgedVerify.stderr}`.includes("dirty") || `${forgedVerify.stdout}\n${forgedVerify.stderr}`.includes("full cutover"), "forged strict-pass failure should be explained by current-state validation");

console.log("Migration adoption tests passed");

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}
