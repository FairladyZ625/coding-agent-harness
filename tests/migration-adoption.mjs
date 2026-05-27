#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  assert,
  expectJson,
  expectPass,
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
assert(legacyPhaseStatus.tasks[0].state === "in_progress", "legacy phase table should infer active task state before structure migration");

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

const migrationTarget = path.join(tmpRoot, "structure-migration");
const legacyTask = path.join(migrationTarget, "docs/09-PLANNING/TASKS/old");
const legacyModuleTask = path.join(migrationTarget, "docs/09-PLANNING/MODULES/auth/TASKS/auth-old");
fs.mkdirSync(legacyTask, { recursive: true });
fs.mkdirSync(legacyModuleTask, { recursive: true });
fs.mkdirSync(path.join(migrationTarget, "docs/10-WALKTHROUGH"), { recursive: true });
fs.mkdirSync(path.join(migrationTarget, "docs/11-REFERENCE"), { recursive: true });
fs.writeFileSync(
  path.join(migrationTarget, ".harness-capabilities.json"),
  JSON.stringify({ version: 1, locale: "zh-CN", capabilities: [{ name: "core", state: "configured" }, { name: "dashboard", state: "configured" }] }, null, 2),
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

const docsRootPlan = expectJson(["migrate-structure", "--json", "--plan", path.join(migrationTarget, "docs")]);
assert(docsRootPlan.target === migrationTarget, "migrate-structure should accept a legacy docs/ path and resolve the project root");
assert(docsRootPlan.actions.some((action) => action.destination === "coding-agent-harness/planning/tasks"), "structure plan should move legacy tasks to v2 tasks root");
assert(docsRootPlan.capabilities.locale === "zh-CN", "structure plan should preserve legacy registry locale");
assert(docsRootPlan.capabilities.names.includes("dashboard"), "structure plan should preserve declared capabilities");

const applied = expectJson(["migrate-structure", "--json", "--apply", migrationTarget]);
assert(applied.applied === true, "migrate-structure --apply should report applied true");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/harness.yaml")), "structure migration should write v2 manifest");
assert(!fs.existsSync(path.join(migrationTarget, "docs")), "structure migration should remove the active legacy docs root");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/tasks/old/task_plan.md")), "structure migration should move legacy task plans to v2 tasks root");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/tasks/old/walkthrough.md")), "structure migration should add task-local walkthrough when absent");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/auth/tasks/auth-old/task_plan.md")), "structure migration should normalize legacy module task directories to v2 module tasks");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/auth/tasks/auth-old/walkthrough.md")), "structure migration should add task-local walkthroughs for migrated module tasks");
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/auth/tasks/auth-old/visual_map.md")), "structure migration should add canonical visual maps for migrated tasks when absent");
assert(
  !fs.readdirSync(path.join(migrationTarget, "coding-agent-harness/planning/modules/auth")).includes("TASKS"),
  "structure migration should remove legacy uppercase module TASKS roots",
);
assert(fs.existsSync(path.join(migrationTarget, "coding-agent-harness/governance/standards/external-source-intake-standard.md")), "structure migration should move reference docs to governance standards");
assert(applied.actionsApplied.some((action) => action.action === "archive-source-root"), "structure migration should archive the old docs root");

const manifest = fs.readFileSync(path.join(migrationTarget, "coding-agent-harness/harness.yaml"), "utf8");
assert(manifest.includes("locale: zh-CN"), "structure migration should persist locale in manifest");
assert(/^\s*-\s*dashboard\s*$/m.test(manifest), "structure migration should persist capabilities in manifest");

const migratedStatus = expectJson(["status", "--json", migrationTarget]);
assert(migratedStatus.mode === "v2-manifest", "migrated target should run in v2 manifest mode");
assert(migratedStatus.tasks.some((task) => task.path === "TARGET:coding-agent-harness/planning/tasks/old"), "status should discover migrated v2 task");
assert(migratedStatus.tasks.some((task) => task.id === "MODULES/auth/auth-old"), "status should discover migrated v2 module task identity");
assert(!JSON.stringify(migratedStatus).includes("docs/09-PLANNING"), "migrated status should not expose legacy active task paths");
const dashboardDir = path.join(tmpRoot, "structure-migration-dashboard");
expectPass(["dashboard", "--out-dir", dashboardDir, migrationTarget]);
const dashboardStatus = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/status.json"), "utf8"));
assert(dashboardStatus.tasks.some((task) => task.path === "TARGET:coding-agent-harness/planning/tasks/old"), "dashboard should display migrated v2 task");
assert(dashboardStatus.tasks.some((task) => task.path === "TARGET:coding-agent-harness/planning/modules/auth/tasks/auth-old"), "dashboard should display migrated v2 module task");

console.log("Migration adoption tests passed");
