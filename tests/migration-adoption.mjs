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

const legacyPhaseTableTarget = path.join(tmpRoot, "legacy-phase-table");
fs.mkdirSync(path.join(legacyPhaseTableTarget, "docs/09-PLANNING/TASKS/table-active"), { recursive: true });
fs.writeFileSync(path.join(legacyPhaseTableTarget, "AGENTS.md"), "# Legacy Agents\n");
fs.writeFileSync(path.join(legacyPhaseTableTarget, "docs/09-PLANNING/TASKS/table-active/task_plan.md"), "# Table Active\n");
fs.writeFileSync(
  path.join(legacyPhaseTableTarget, "docs/09-PLANNING/TASKS/table-active/progress.md"),
  "# Progress\n\n## 阶段状态表\n| Phase | Status | Notes |\n| --- | --- | --- |\n| Phase 1 | Done | ok |\n| Phase 2 | In Progress | active |\n| Phase 3 | Pending | next |\n",
);
const legacyPhaseStatus = expectJson(["status", "--json", legacyPhaseTableTarget]);
assert(legacyPhaseStatus.tasks[0].state === "in_progress", "Agora-style legacy phase table should infer active task state");

const legacyChineseTarget = path.join(tmpRoot, "legacy-chinese");
fs.mkdirSync(path.join(legacyChineseTarget, "docs/09-PLANNING/TASKS/old"), { recursive: true });
fs.writeFileSync(path.join(legacyChineseTarget, "AGENTS.md"), "# 中文项目\n\n这是旧 harness 项目。\n");
fs.writeFileSync(path.join(legacyChineseTarget, "docs/09-PLANNING/TASKS/old/task_plan.md"), "# 旧任务\n");
const legacyChinesePlan = expectJson(["migrate-plan", "--json", legacyChineseTarget]);
assert(legacyChinesePlan.locale === "zh-CN", "migrate-plan should infer zh-CN from Chinese legacy project text");
assert(
  legacyChinesePlan.nextCommands.some((command) => command.includes("migrate-run --locale zh-CN")),
  "migrate-plan should recommend zh-CN migration run for Chinese legacy projects",
);
assert(
  legacyChinesePlan.nextCommands.some((command) => command.includes(legacyChineseTarget)),
  "migrate-plan should keep executable target paths in CLI output",
);

const legacyAdoptionTarget = path.join(tmpRoot, "legacy-adoption");
fs.mkdirSync(path.join(legacyAdoptionTarget, "docs/09-PLANNING/TASKS/old"), { recursive: true });
const legacyAgents = "# Legacy Agents\n\nLEGACY_DO_NOT_OVERWRITE\n";
const legacyClaude = "# Legacy Claude\n\nLEGACY_CLAUDE_DO_NOT_OVERWRITE\n";
const legacyLedger = "# Legacy Ledger\n\nLEGACY_LEDGER_DO_NOT_OVERWRITE\n";
const legacyTaskPlan = "# Legacy Task\n\nLEGACY_TASK_DO_NOT_OVERWRITE\n";
fs.writeFileSync(path.join(legacyAdoptionTarget, "AGENTS.md"), legacyAgents);
fs.writeFileSync(path.join(legacyAdoptionTarget, "CLAUDE.md"), legacyClaude);
fs.mkdirSync(path.join(legacyAdoptionTarget, "docs"), { recursive: true });
fs.writeFileSync(path.join(legacyAdoptionTarget, "docs/Harness-Ledger.md"), legacyLedger);
fs.writeFileSync(path.join(legacyAdoptionTarget, "docs/09-PLANNING/TASKS/old/task_plan.md"), legacyTaskPlan);
fs.writeFileSync(path.join(legacyAdoptionTarget, "docs/09-PLANNING/TASKS/old/progress.md"), "# Progress\n\n## Status\n\nplanned\n");
const legacyAdoption = expectJson(["add-capability", "safe-adoption", "--locale", "zh-CN", legacyAdoptionTarget]);
assert(legacyAdoption.report?.operation === "add-capability", "safe-adoption output should include add-capability report");
assert(
  legacyAdoption.report?.capabilities?.some((capability) => capability.name === "safe-adoption" && capability.selected === true),
  "safe-adoption report should mark safe-adoption selected",
);
assert(
  legacyAdoption.report?.skipped?.includes("AGENTS.md") &&
    legacyAdoption.report?.skipped?.includes("CLAUDE.md") &&
    legacyAdoption.report?.skipped?.includes("docs/Harness-Ledger.md"),
  "safe-adoption report should show skipped legacy files",
);
const legacyAdoptionRegistry = JSON.parse(fs.readFileSync(path.join(legacyAdoptionTarget, ".harness-capabilities.json"), "utf8"));
assert(legacyAdoptionRegistry.locale === "zh-CN", "safe-adoption should persist requested locale");
assert(legacyAdoptionRegistry.capabilities.some((capability) => capability.name === "core"), "safe-adoption should include core dependency");
assert(legacyAdoptionRegistry.capabilities.some((capability) => capability.name === "safe-adoption"), "safe-adoption registry missing capability");
assert(fs.readFileSync(path.join(legacyAdoptionTarget, "AGENTS.md"), "utf8") === legacyAgents, "safe-adoption should not overwrite legacy AGENTS.md");
assert(fs.readFileSync(path.join(legacyAdoptionTarget, "CLAUDE.md"), "utf8") === legacyClaude, "safe-adoption should not overwrite legacy CLAUDE.md");
assert(fs.readFileSync(path.join(legacyAdoptionTarget, "docs/Harness-Ledger.md"), "utf8") === legacyLedger, "safe-adoption should not overwrite legacy ledger");
assert(fs.readFileSync(path.join(legacyAdoptionTarget, "docs/09-PLANNING/TASKS/old/task_plan.md"), "utf8") === legacyTaskPlan, "safe-adoption should not overwrite old task plans");
assert(
  fs.readFileSync(path.join(legacyAdoptionTarget, "docs/09-PLANNING/TASKS/_task-template/review.md"), "utf8").includes("审查者身份"),
  "safe-adoption should add missing localized v1 templates",
);
const adoptedStatus = expectJson(["status", "--json", legacyAdoptionTarget]);
assert(adoptedStatus.checkState.status === "warn", "safe-adoption should warn on historical contract gaps without failing");
assert(
  adoptedStatus.checkState.details.warnings.some((warning) => warning.includes("adoption-needed")),
  "safe-adoption warnings should be routed as adoption-needed",
);
assert(adoptedStatus.tasks[0].inferredModule, "legacy task status should expose inferred module classification");
assert(adoptedStatus.tasks[0].classificationBucket, "legacy task status should expose classification bucket");
const legacyAdoptionDashboard = path.join(tmpRoot, "legacy-adoption-dashboard");
expectPass(["dashboard", "--out-dir", legacyAdoptionDashboard, legacyAdoptionTarget]);
const legacyAdoptionWarnings = JSON.parse(fs.readFileSync(path.join(legacyAdoptionDashboard, "data/adoption.json"), "utf8"));
const firstAdoptionWarning = legacyAdoptionWarnings.warnings?.[0];
assert(firstAdoptionWarning?.type, "adoption warning should expose stable type");
assert(firstAdoptionWarning?.scope, "adoption warning should expose scope");
assert(firstAdoptionWarning?.priority, "adoption warning should expose priority");
assert(firstAdoptionWarning?.phase, "adoption warning should expose migration phase");
assert(firstAdoptionWarning?.fixability, "adoption warning should expose fixability");
assert(firstAdoptionWarning?.status, "adoption warning should expose queue status");
assert(firstAdoptionWarning?.confidence, "adoption warning should expose confidence");
assert(Array.isArray(firstAdoptionWarning?.affectedPaths), "adoption warning should expose affectedPaths array");
assert(firstAdoptionWarning?.affected && firstAdoptionWarning?.requiredAction, "adoption warning should preserve affected and requiredAction fields");
const migrationPlan = expectJson(["migrate-plan", "--json", "--limit", "5", legacyAdoptionTarget]);
assert(migrationPlan.operation === "migrate-plan", "migrate-plan should report its operation");
assert(migrationPlan.compatibility?.preserves?.some((item) => item.includes("AGENTS.md")), "migrate-plan should state preservation rules");
assert(migrationPlan.phases?.some((phase) => phase.id === "MP-03"), "migrate-plan should include active task migration phase");
assert(migrationPlan.summary?.missingExecutionStrategy >= 1, "migrate-plan should count missing execution strategies");
assert(migrationPlan.summary?.missingVisualMap >= 1, "migrate-plan should count missing canonical visual maps");
assert(migrationPlan.summary?.visualMapActions >= 1, "migrate-plan should expose visual map action count");
assert(migrationPlan.summary?.legacyVisualOnly >= 1, "migrate-plan should expose legacy visual-only count");
assert(migrationPlan.summary?.weakBrief >= 1, "migrate-plan should expose weak brief count");
assert(migrationPlan.summary?.missingCanonicalVisualMap >= 1, "migrate-plan should expose missing canonical visual map count");
assert(migrationPlan.summary?.fullCutoverEligible === false, "legacy migrate-plan should not be full-cutover eligible");
assert(migrationPlan.taskActions?.some((action) => action.taskId === "old" && action.files.includes("execution_strategy.md")), "migrate-plan should include task-level file actions");
assert(migrationPlan.taskActions?.some((action) => action.taskId === "old" && action.files.includes("visual_map.md")), "migrate-plan should include canonical visual map action");
assert(migrationPlan.taskActions?.some((action) => action.taskId === "old" && action.files.includes("brief.md")), "migrate-plan should include active brief migration action");
assert(migrationPlan.visualMapActions?.some((action) => action.taskId === "old"), "migrate-plan should expose visual map actions separately");
assert(migrationPlan.legacyVisualOnlyTasks?.some((action) => action.taskId === "old"), "migrate-plan should expose legacy visual-only tasks separately");
assert(migrationPlan.weakBriefTasks?.some((action) => action.taskId === "old"), "migrate-plan should expose weak brief tasks separately");
assert(migrationPlan.taskActions?.some((action) => action.commands.some((command) => command.includes("_task-template/brief.md"))), "migrate-plan should emit a command per active task file");
assert(migrationPlan.nextCommands?.some((command) => command.includes("migrate-run")), "migrate-plan should include migrate-run command");
assert(migrationPlan.nextCommands?.some((command) => command.includes("migrate-verify --full-cutover")), "migrate-plan should include full-cutover verify command");
const migrationPlanText = expectPass(["migrate-plan", "--limit", "3", legacyAdoptionTarget]).stdout;
assert(migrationPlanText.includes("Migration Plan"), "migrate-plan text output should have a readable heading");
assert(migrationPlanText.includes("legacy residuals:"), "migrate-plan text output should show residual counts");
assert(migrationPlanText.includes("full cutover eligible:"), "migrate-plan text output should show full cutover eligibility");
const adoptedStrict = run(["status", "--json", "--strict", legacyAdoptionTarget]);
assert(adoptedStrict.status !== 0, "safe-adoption strict status should still fail on historical contract gaps");

const migrationRunTarget = path.join(tmpRoot, "migration-run");
fs.mkdirSync(path.join(migrationRunTarget, "docs/09-PLANNING/TASKS/old"), { recursive: true });
fs.writeFileSync(path.join(migrationRunTarget, "AGENTS.md"), "# 旧项目 Agents\n\nLegacy English notes are still present.\n");
fs.writeFileSync(path.join(migrationRunTarget, "docs/09-PLANNING/TASKS/old/task_plan.md"), "# Old Task\n\nThis active task predates v1.\n");
fs.writeFileSync(path.join(migrationRunTarget, "docs/09-PLANNING/TASKS/old/progress.md"), "# Progress\n\n## Status\n\nplanned\n");
spawnSync("git", ["init"], { cwd: migrationRunTarget, encoding: "utf8" });
spawnSync("git", ["add", "."], { cwd: migrationRunTarget, encoding: "utf8" });
spawnSync("git", ["-c", "user.name=Harness Test", "-c", "user.email=harness@example.test", "commit", "-m", "legacy baseline"], {
  cwd: migrationRunTarget,
  encoding: "utf8",
});
const migrationSessionDir = path.join(tmpRoot, "migration-session");
const migrationDashboardDir = path.join(tmpRoot, "migration-dashboard");
const migrationRun = expectJson([
  "migrate-run",
  "--locale",
  "zh-CN",
  "--session-dir",
  migrationSessionDir,
  "--out-dir",
  migrationDashboardDir,
  migrationRunTarget,
]);
assert(migrationRun.operation === "migrate-run", "migrate-run should report its operation");
assert(migrationRun.result === "adopted-with-strict-deferred", "legacy migrate-run should keep strict cutover deferred");
assert(migrationRun.checks.normal.status !== "fail", "legacy migrate-run should keep normal check usable");
assert(migrationRun.checks.strict.status === "fail", "legacy migrate-run should record strict failure");
assert(migrationRun.strictDeferred?.owner && migrationRun.strictDeferred?.trigger && migrationRun.strictDeferred?.nextAction, "strict-deferred migration should include owner, trigger, and nextAction");
assert(fs.existsSync(migrationRun.sessionPath), "migrate-run should write session.json");
assert(fs.existsSync(migrationRun.reportPath), "migrate-run should write report.md");
assert(fs.existsSync(path.join(migrationDashboardDir, "index.html")), "migrate-run should generate an HTML dashboard folder");
const migrationRegistry = JSON.parse(fs.readFileSync(path.join(migrationRunTarget, ".harness-capabilities.json"), "utf8"));
assert(migrationRegistry.locale === "zh-CN", "migrate-run should persist selected locale");
assert(migrationRegistry.capabilities.some((capability) => capability.name === "safe-adoption"), "migrate-run should declare safe-adoption");
assert(migrationRegistry.capabilities.some((capability) => capability.name === "dashboard"), "migrate-run should declare dashboard");
assert(!migrationRun.git.after.staged.length, "migrate-run should not stage target files");
assert(
  spawnSync("git", ["-C", migrationRunTarget, "diff", "--cached", "--name-only"], { encoding: "utf8" }).stdout.trim() === "",
  "migrate-run should leave the target git index untouched",
);
const migrationVerify = expectJson(["migrate-verify", "--json", migrationRun.sessionPath]);
assert(migrationVerify.status === "pass", "migrate-verify should pass for migrate-run output");
assert(migrationVerify.dashboard?.indexPath?.endsWith("index.html"), "migrate-verify should preserve HTML dashboard evidence");
const migrationFullCutover = run(["migrate-verify", "--json", "--full-cutover", migrationRun.sessionPath]);
assert(migrationFullCutover.status !== 0, "full cutover verify should reject baseline legacy-only migration output");

const falseSessionPath = path.join(tmpRoot, "false-session.json");
fs.writeFileSync(
  falseSessionPath,
  JSON.stringify(
    {
      ...JSON.parse(fs.readFileSync(migrationRun.sessionPath, "utf8")),
      dashboard: { dir: migrationRunTarget, indexPath: path.join(migrationRunTarget, "docs/Harness-Ledger.md"), kind: "html-folder" },
    },
    null,
    2,
  ),
);
const falseVerify = run(["migrate-verify", "--json", falseSessionPath]);
assert(falseVerify.status !== 0, "migrate-verify should reject non-HTML dashboard evidence");

const mixedLocaleTarget = path.join(tmpRoot, "mixed-locale");
fs.mkdirSync(path.join(mixedLocaleTarget, "docs/09-PLANNING/TASKS/mixed"), { recursive: true });
fs.writeFileSync(path.join(mixedLocaleTarget, "AGENTS.md"), "# 中文入口\n\n这是一个中文项目，迁移时需要选择中文或英文模板。\n");
fs.writeFileSync(
  path.join(mixedLocaleTarget, "docs/09-PLANNING/TASKS/mixed/task_plan.md"),
  "# Legacy task\n\nThis English task plan intentionally contains enough words to make the language decision ambiguous for migration.\n",
);
const mixedLocaleFail = run(["migrate-run", "--plan-only", mixedLocaleTarget]);
assert(mixedLocaleFail.status !== 0, "migrate-run should require --locale for mixed-language targets");
assert(mixedLocaleFail.stderr.includes("--locale zh-CN"), "mixed-language failure should tell agents how to choose locale");
const mixedLocalePlan = expectJson(["migrate-run", "--plan-only", "--locale", "zh-CN", "--session-dir", path.join(tmpRoot, "mixed-locale-session"), mixedLocaleTarget]);
assert(mixedLocalePlan.result === "plan-only", "migrate-run --plan-only should produce a plan-only session");
assert(mixedLocalePlan.localeDecision.selected === "zh-CN", "migrate-run --locale should resolve mixed-language decision");
const planOnlyVerify = run(["migrate-verify", "--json", mixedLocalePlan.sessionPath]);
assert(planOnlyVerify.status !== 0, "migrate-verify should reject plan-only sessions as completion evidence");

const dirtyMigrationTarget = path.join(tmpRoot, "dirty-migration");
fs.mkdirSync(dirtyMigrationTarget);
fs.writeFileSync(path.join(dirtyMigrationTarget, "AGENTS.md"), "# Legacy\n");
spawnSync("git", ["init"], { cwd: dirtyMigrationTarget, encoding: "utf8" });
spawnSync("git", ["add", "."], { cwd: dirtyMigrationTarget, encoding: "utf8" });
spawnSync("git", ["-c", "user.name=Harness Test", "-c", "user.email=harness@example.test", "commit", "-m", "baseline"], {
  cwd: dirtyMigrationTarget,
  encoding: "utf8",
});
fs.writeFileSync(path.join(dirtyMigrationTarget, "unreviewed.txt"), "dirty\n");
const dirtyMigration = run(["migrate-run", "--locale", "en-US", dirtyMigrationTarget]);
assert(dirtyMigration.status !== 0, "migrate-run should stop on dirty git targets by default");
assert(dirtyMigration.stderr.includes("--allow-dirty"), "dirty guard should explain --allow-dirty escape hatch");

const forgedStrictSessionPath = path.join(tmpRoot, "forged-strict-session.json");
const forgedStrictSession = {
  ...JSON.parse(fs.readFileSync(migrationRun.sessionPath, "utf8")),
  result: "complete",
  checks: { ...migrationRun.checks, strict: { status: "pass", failures: 0, warnings: 0 } },
  strictDeferred: null,
};
fs.writeFileSync(forgedStrictSessionPath, `${JSON.stringify(forgedStrictSession, null, 2)}\n`);
const forgedStrictVerify = run(["migrate-verify", "--json", forgedStrictSessionPath]);
assert(forgedStrictVerify.status !== 0, "migrate-verify should rerun strict and reject forged strict pass sessions");

const fakeDashboardDir = path.join(tmpRoot, "fake-dashboard");
const fakeDashboardPath = path.join(fakeDashboardDir, "index.html");
fs.mkdirSync(path.join(fakeDashboardDir, "assets"), { recursive: true });
fs.mkdirSync(path.join(fakeDashboardDir, "data"), { recursive: true });
fs.writeFileSync(fakeDashboardPath, '<html><script src="assets/dashboard-data.js"></script></html>\n');
fs.writeFileSync(path.join(fakeDashboardDir, "assets/dashboard-data.js"), 'window.__HARNESS_DASHBOARD__ = {"status":{"schemaVersion":2,"project":{"name":"WrongProject"},"checkState":{}},"adoption":{"warnings":[]}};\n');
fs.writeFileSync(path.join(fakeDashboardDir, "data/status.json"), "{}\n");
fs.writeFileSync(path.join(fakeDashboardDir, "data/adoption.json"), "{}\n");
const fakeDashboardSessionPath = path.join(tmpRoot, "fake-dashboard-session.json");
const fakeDashboardSession = {
  ...JSON.parse(fs.readFileSync(migrationRun.sessionPath, "utf8")),
  dashboard: { dir: fakeDashboardDir, indexPath: fakeDashboardPath, kind: "html-folder" },
};
fs.writeFileSync(fakeDashboardSessionPath, `${JSON.stringify(fakeDashboardSession, null, 2)}\n`);
const fakeDashboardVerify = run(["migrate-verify", "--json", fakeDashboardSessionPath]);
assert(fakeDashboardVerify.status !== 0, "migrate-verify should reject arbitrary HTML as dashboard evidence");

const missingGitSessionPath = path.join(tmpRoot, "missing-git-session.json");
const missingGitSession = {
  ...JSON.parse(fs.readFileSync(migrationRun.sessionPath, "utf8")),
  git: undefined,
};
fs.writeFileSync(missingGitSessionPath, `${JSON.stringify(missingGitSession, null, 2)}\n`);
const missingGitVerify = run(["migrate-verify", "--json", missingGitSessionPath]);
assert(missingGitVerify.status !== 0, "migrate-verify should require git audit metadata");

const legacyCheckerOnlyTarget = path.join(tmpRoot, "legacy-checker-only");
fs.mkdirSync(legacyCheckerOnlyTarget);
expectPass(["add-capability", "safe-adoption", "--locale", "en-US", legacyCheckerOnlyTarget]);
const legacyCheckerOnly = expectJson(["status", "--json", legacyCheckerOnlyTarget]);
assert(legacyCheckerOnly.checkState.status === "warn", "safe-adoption should surface legacy checker gaps as warnings");
assert(legacyCheckerOnly.checkState.legacy.status === "fail", "safe-adoption should keep legacy checker signal after registry creation");
const legacyCheckerOnlyStrictStatus = run(["status", "--json", "--strict", legacyCheckerOnlyTarget]);
assert(legacyCheckerOnlyStrictStatus.status !== 0, "safe-adoption strict status should fail when legacy checker fails even if v1 validators are clean");
const legacyCheckerOnlyStrictCheck = run(["check", "--profile", "target-project", "--strict", legacyCheckerOnlyTarget]);
assert(legacyCheckerOnlyStrictCheck.status !== 0, "safe-adoption strict check should fail when legacy checker fails even if v1 validators are clean");

console.log("Migration adoption tests passed");
