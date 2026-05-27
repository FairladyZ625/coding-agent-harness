#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  assert,
  expectJson,
  expectPass,
  run,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";
import { taskScannerVersion } from "../scripts/lib/task-review-model.mjs";
import { normalizeTarget } from "../scripts/lib/core-shared.mjs";
import { dashboardWatchRoots } from "../scripts/lib/harness-paths.mjs";

const target = path.join(tmpRoot, "directory-structure-v2-target");
const taskId = "2026-05-27-v2-only-task";
const taskDir = path.join(target, "coding-agent-harness/planning/tasks", taskId);

fs.mkdirSync(taskDir, { recursive: true });
fs.mkdirSync(path.join(target, "coding-agent-harness/governance/generated"), { recursive: true });
fs.writeFileSync(
  path.join(target, "coding-agent-harness/harness.yaml"),
  [
    "version: 2",
    "locale: en-US",
    "capabilities:",
    "  - core",
    "  - dashboard",
    "structure:",
    "  harnessRoot: coding-agent-harness",
    "  planningRoot: coding-agent-harness/planning",
    "  tasksRoot: coding-agent-harness/planning/tasks",
    "  modulesRoot: coding-agent-harness/planning/modules",
    "  governanceRoot: coding-agent-harness/governance",
    "  generatedRoot: coding-agent-harness/governance/generated",
    "  walkthrough: task-local",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(taskDir, "INDEX.md"),
  [
    "# V2 Only Task",
    "",
    "Task Contract: harness-task/v1",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Task ID | \`${taskId}\` |`,
    "| Budget | `complex` |",
    "| Walkthrough Path | `walkthrough.md` |",
    "",
    "## Task Audit Metadata",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Created By | historical-backfill |",
    "| Created At | 2026-05-27 |",
    "| Command Shape | v2 fixture |",
    "| Budget | standard |",
    "| Template Source | tests/directory-structure-v2.mjs |",
    "| Task Creator | test |",
    "| Task Creator Source | git-unavailable |",
    "| Human Review Status | not-confirmed |",
    "| Confirmation ID | n/a |",
    "| Confirmed At | n/a |",
    "| Reviewer | n/a |",
    "| Reviewer Email | n/a |",
    "| Confirm Text | n/a |",
    "| Evidence Checked | n/a |",
    "| Review Commit SHA | n/a |",
    "| Audit Source | native-index |",
    "| Audit Status | created |",
    "| Exception Reason | n/a |",
    "| Message | n/a |",
    "| Migration Status | native |",
    "| Migrated From | n/a |",
    "| Legacy Extra Fields | {} |",
    "| Migration Notes | n/a |",
    "",
  ].join("\n"),
);
fs.writeFileSync(path.join(taskDir, "brief.md"), "# V2 Only Task Brief\n\n## Goal\n\nProve v2 native task discovery without legacy docs roots. This brief is intentionally long enough to satisfy the material scanner and ensure the fixture tests path behavior rather than weak brief heuristics.\n");
fs.writeFileSync(path.join(taskDir, "task_plan.md"), "# V2 Only Task\n\nTask Contract: harness-task/v1\n\nSelected budget: standard\n\n## Goal\n\nExercise v2 task discovery.\n");
fs.writeFileSync(path.join(taskDir, "progress.md"), "# Progress\n\n## Status\n\ndone\n");
fs.writeFileSync(path.join(taskDir, "execution_strategy.md"), "# Execution Strategy\n\nCoordinator-owned v2 fixture.\n");
fs.writeFileSync(path.join(taskDir, "findings.md"), "# Findings\n\nNo findings.\n");
fs.writeFileSync(
  path.join(taskDir, "visual_map.md"),
  [
    "# Visual Map",
    "",
    "Visual Map Contract: v1.0",
    "",
    "## 阶段表（Phase Table，表头供 checker 解析）",
    "",
    "| Phase ID | Kind | Depends On | State | Completion | Output | Required Evidence | Exit Command | Actor | Evidence Status | Blocking Risk | Owner / Handoff |",
    "| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
    "| V2-01 | execution | none | done | 100 | v2 fixture | command | n/a | agent | present | none | coordinator |",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(taskDir, "review.md"),
  [
    "# Review",
    "",
    "## Agent Review Submission",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Submission ID | test-v2-submission |",
    "| Submitted At | 2026-05-27 |",
    "| Submitted By | test |",
    `| Task Key | TASKS/${taskId} |`,
    "| Materials Checklist Hash | test |",
    "| Evidence Summary | v2 fixture |",
    "| Open Findings Count | 0 |",
    `| Scanner Version | ${taskScannerVersion} |`,
    "",
    "## Reviewer Identity",
    "",
    "| Reviewer | Type | Scope |",
    "| --- | --- | --- |",
    "| fixture | agent | task |",
    "",
    "## Confidence Challenge",
    "",
    "Fixture review validates v2 task discovery paths.",
    "",
    "## Evidence Checked",
    "",
    "| Evidence ID | Type | Path | Summary |",
    "| --- | --- | --- | --- |",
    "| E-001 | fixture | TARGET:task_plan.md | v2 task plan exists |",
    "",
    "## 重要发现（Material Findings，表头供 checker 解析）",
    "",
    "| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    "",
    "## Final Confidence Basis",
    "",
    "The fixture is complete enough for path discovery regression coverage.",
    "",
  ].join("\n"),
);
fs.writeFileSync(
  path.join(taskDir, "lesson_candidates.md"),
  [
    "# Lesson Candidates",
    "",
    "| Field | Value |",
    "| --- | --- |",
    "| Task-level Status | no-candidate-accepted |",
    "| Review Decision | checked-none |",
    "| Promotion State | not-promoted |",
    "| Closeout Token | checked-none: v2 fixture has no reusable lesson |",
    "",
    "## No-Candidate Reason",
    "",
    "This fixture is only for v2 structure discovery.",
    "",
  ].join("\n"),
);
fs.writeFileSync(path.join(taskDir, "walkthrough.md"), "# Walkthrough\n\nTask-local v2 walkthrough evidence.\n");

assert(!fs.existsSync(path.join(target, "docs/09-PLANNING")), "fixture must not contain legacy planning root");
assert(!fs.existsSync(path.join(target, "docs/10-WALKTHROUGH")), "fixture must not contain legacy walkthrough root");
assert(!fs.existsSync(path.join(target, "docs/Harness-Ledger.md")), "fixture must not contain legacy ledger");

const status = expectJson(["status", "--json", target]);
assert(status.schemaVersion === 2, "status should preserve schemaVersion 2");
assert(status.tasks.length === 1, `v2-only status should discover one task, got ${status.tasks.length}`);
assert(status.tasks[0].id === `TASKS/${taskId}`, `v2 task id mismatch: ${status.tasks[0].id}`);
assert(status.tasks[0].path === `TARGET:coding-agent-harness/planning/tasks/${taskId}`, `v2 task path mismatch: ${status.tasks[0].path}`);
assert(status.tasks[0].walkthroughPath === `TARGET:coding-agent-harness/planning/tasks/${taskId}/walkthrough.md`, "status should expose task-local walkthrough");
assert(!JSON.stringify(status).includes("docs/09-PLANNING"), "v2 status should not expose legacy active task paths");
const docsAliasStatus = expectJson(["status", "--json", path.join(target, "docs")]);
assert(docsAliasStatus.mode === "v2-manifest", "v2 target/docs alias should resolve to the sibling project manifest");
assert(docsAliasStatus.tasks[0].path === `TARGET:coding-agent-harness/planning/tasks/${taskId}`, "v2 target/docs alias should preserve v2 task paths");

const taskList = expectJson(["task-list", "--json", target]);
assert(taskList.tasks.length === 1, "task-list should discover v2-only task");

const taskIndex = expectJson(["task-index", "--json", target]);
assert(taskIndex.tasks.length === 1, "task-index should discover v2-only task");
assert(taskIndex.tasks[0].currentPath === `TARGET:coding-agent-harness/planning/tasks/${taskId}`, "task-index should expose v2 task path");

const dashboardDir = path.join(tmpRoot, "directory-structure-v2-dashboard");
expectPass(["dashboard", "--out-dir", dashboardDir, target]);
const dashboardAliasDir = path.join(tmpRoot, "directory-structure-v2-dashboard-docs-alias");
expectPass(["dashboard", "--out-dir", dashboardAliasDir, path.join(target, "docs")]);
const dashboardStatus = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/status.json"), "utf8"));
const dashboardDocuments = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/documents.json"), "utf8"));
assert(dashboardStatus.tasks.length === 1, "dashboard status should include v2-only task");
assert(dashboardDocuments.documents.some((doc) => doc.path === `TARGET:coding-agent-harness/planning/tasks/${taskId}/walkthrough.md`), "dashboard documents should include task-local walkthrough");

fs.mkdirSync(path.join(target, "docs/10-WALKTHROUGH"), { recursive: true });
fs.writeFileSync(
  path.join(target, "docs/10-WALKTHROUGH/Closeout-SSoT.md"),
  `| id | task | walkthrough | status |\n| --- | --- | --- | --- |\n| HL-1 | coding-agent-harness/planning/tasks/${taskId}/task_plan.md | docs/10-WALKTHROUGH/legacy.md | closed |\n`,
);
fs.rmSync(path.join(taskDir, "walkthrough.md"), { force: true });
const legacyCloseoutIgnored = expectJson(["status", "--json", target]);
const legacyCloseoutTask = legacyCloseoutIgnored.tasks.find((task) => task.id === `TASKS/${taskId}`);
assert(legacyCloseoutTask.walkthroughPath === "", "v2 status should not read legacy Closeout SSoT walkthrough paths");
assert(legacyCloseoutTask.closeoutStatus !== "closed", "v2 status should not close tasks from legacy Closeout SSoT rows");

const invalidContextTarget = path.join(tmpRoot, "directory-structure-v2-context-validation");
expectPass(["init", "--locale", "en-US", "--capabilities", "core", invalidContextTarget]);
fs.writeFileSync(path.join(invalidContextTarget, "coding-agent-harness/context/architecture/service-catalog.md"), "# Service Catalog\n\n| Service / Component |\n| --- |\n| api |\n");
const invalidContextStatus = run(["status", "--json", invalidContextTarget]);
assert(invalidContextStatus.status !== 0, "v2 status should fail when context docs violate the contract");
const invalidContext = JSON.parse(invalidContextStatus.stdout);
assert(
  invalidContext.checkState.details.failures.some((failure) => failure.includes("coding-agent-harness/context/architecture/service-catalog.md missing Context Doc Type")),
  "v2 context validation should scan manifest-resolved context roots",
);

const invalidCapabilityTarget = path.join(tmpRoot, "directory-structure-v2-capability-validation");
expectPass(["init", "--locale", "en-US", "--capabilities", "core,module-parallel", invalidCapabilityTarget]);
fs.rmSync(path.join(invalidCapabilityTarget, "coding-agent-harness/planning/modules/Module-Registry.md"), { force: true });
const invalidCapabilityStatus = run(["status", "--json", invalidCapabilityTarget]);
assert(invalidCapabilityStatus.status !== 0, "v2 status should fail when manifest-declared capability artifacts are missing");
const invalidCapability = JSON.parse(invalidCapabilityStatus.stdout);
assert(
  invalidCapability.checkState.details.failures.some((failure) => failure.includes("capability module-parallel missing required artifact: coding-agent-harness/planning/modules/Module-Registry.md")),
  "v2 capability validation should check manifest-declared artifacts against v2 paths",
);

const customRootTarget = path.join(tmpRoot, "directory-structure-v2-custom-roots");
fs.mkdirSync(path.join(customRootTarget, "coding-agent-harness"), { recursive: true });
fs.mkdirSync(path.join(customRootTarget, "custom-planning/generated"), { recursive: true });
fs.mkdirSync(path.join(customRootTarget, "custom-modules/alpha"), { recursive: true });
fs.mkdirSync(path.join(customRootTarget, "custom-generated"), { recursive: true });
fs.mkdirSync(path.join(customRootTarget, "custom-governance/lessons"), { recursive: true });
fs.mkdirSync(path.join(customRootTarget, "custom-governance/regression"), { recursive: true });
fs.writeFileSync(
  path.join(customRootTarget, "coding-agent-harness/harness.yaml"),
  [
    "version: 2",
    "locale: en-US",
    "capabilities:",
    "  - core",
    "  - module-parallel",
    "structure:",
    "  harnessRoot: coding-agent-harness",
    "  planningRoot: custom-planning",
    "  tasksRoot: custom-planning/tasks",
    "  modulesRoot: custom-modules",
    "  governanceRoot: custom-governance",
    "  generatedRoot: custom-generated",
    "  regressionRoot: custom-governance/regression",
    "",
  ].join("\n"),
);
fs.writeFileSync(path.join(customRootTarget, "custom-modules/Module-Registry.md"), "# Module Registry\n\n| Key | Name | Status | Current Step |\n| --- | --- | --- | --- |\n| alpha | Alpha | active | A1 |\n");
fs.writeFileSync(path.join(customRootTarget, "custom-modules/alpha/brief.md"), "# Alpha Brief\n\nCustom module root brief.\n");
fs.writeFileSync(path.join(customRootTarget, "custom-modules/alpha/module_plan.md"), "# Alpha Plan\n\n| Step ID | Name | Status | Depends On |\n| --- | --- | --- | --- |\n| A1 | Start | active | none |\n");
fs.writeFileSync(path.join(customRootTarget, "custom-planning/generated/task-index.md"), "# Task Index\n\nGenerated custom planning index.\n");
fs.writeFileSync(path.join(customRootTarget, "custom-generated/Harness-Ledger.md"), "# Harness Ledger\n");
fs.writeFileSync(path.join(customRootTarget, "custom-generated/Closeout-Index.md"), "# Closeout Index\n");
fs.writeFileSync(path.join(customRootTarget, "custom-governance/lessons/L-test.md"), "# Lesson\n\nCustom lesson root.\n");
fs.writeFileSync(path.join(customRootTarget, "custom-governance/regression/Regression-SSoT.md"), "# Regression SSoT\n");
fs.writeFileSync(path.join(customRootTarget, "custom-governance/regression/Cadence-Ledger.md"), "# Cadence Ledger\n");
const customDashboardDir = path.join(tmpRoot, "directory-structure-v2-custom-dashboard");
expectPass(["dashboard", "--out-dir", customDashboardDir, customRootTarget]);
const customDocuments = JSON.parse(fs.readFileSync(path.join(customDashboardDir, "data/documents.json"), "utf8"));
const customGraph = JSON.parse(fs.readFileSync(path.join(customDashboardDir, "data/graph.json"), "utf8"));
assert(customDocuments.documents.some((doc) => doc.path === "TARGET:custom-modules/alpha/brief.md"), "dashboard should collect custom modulesRoot briefs");
assert(customDocuments.documents.some((doc) => doc.path === "TARGET:custom-planning/generated/task-index.md"), "dashboard should collect custom planning generated indexes");
assert(customDocuments.documents.some((doc) => doc.path === "TARGET:custom-governance/lessons/L-test.md"), "dashboard should collect custom governance lessons");
const alphaModule = customGraph.nodes.find((node) => node.id === "module:alpha");
assert(alphaModule?.briefPath === "TARGET:custom-modules/alpha/brief.md", "dashboard graph should expose custom module brief paths");
const customRoots = dashboardWatchRoots(normalizeTarget(customRootTarget).harness).map((root) => path.relative(customRootTarget, root).split(path.sep).join("/"));
assert(customRoots.includes("custom-modules"), "dashboard watch roots should include manifest custom modulesRoot");
assert(customRoots.includes("custom-generated"), "dashboard watch roots should include manifest custom generatedRoot");

const pathEscapeTarget = path.join(tmpRoot, "directory-structure-v2-path-escape");
fs.mkdirSync(path.join(pathEscapeTarget, "coding-agent-harness"), { recursive: true });
fs.writeFileSync(
  path.join(pathEscapeTarget, "coding-agent-harness/harness.yaml"),
  [
    "version: 2",
    "locale: en-US",
    "capabilities:",
    "  - core",
    "structure:",
    "  harnessRoot: coding-agent-harness",
    "  planningRoot: ../../outside-planning",
    "  tasksRoot: ../../outside-planning/tasks",
    "  modulesRoot: coding-agent-harness/planning/modules",
    "  governanceRoot: coding-agent-harness/governance",
    "  generatedRoot: ../../outside-generated",
    "",
  ].join("\n"),
);
const pathEscapeStatus = run(["status", "--json", pathEscapeTarget]);
assert(pathEscapeStatus.status !== 0, "v2 status should reject manifest roots outside the project");
assert(
  (pathEscapeStatus.stderr || pathEscapeStatus.stdout).includes("escapes project root"),
  "v2 manifest path rejection should explain the escaped root",
);
const pathEscapeGovernance = run(["governance", "rebuild", "--dry-run", pathEscapeTarget]);
assert(pathEscapeGovernance.status !== 0, "governance rebuild should not report outside-project generated destinations");

console.log("Directory structure v2 tests passed");
