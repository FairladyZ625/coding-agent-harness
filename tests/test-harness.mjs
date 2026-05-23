#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assert,
  assertGraphIntegrity,
  commandExists,
  expectJson,
  expectPass,
  expectTtyJson,
  packageVersion,
  run,
  tmpRoot,
  todayLocal,
} from "./helpers/harness-test-utils.mjs";

const { taskMigrationClassification, requiresCanonicalVisualMap } = await import("../scripts/lib/harness-core.mjs");


assert(taskMigrationClassification("unknown", "legacy-only") === "unknown-needs-human", "unknown legacy-only task should require human classification");
assert(taskMigrationClassification("done", "not-needed") === "historical-no-map-needed", "done task with not-needed visual map should not require migration action");
assert(taskMigrationClassification("active", "present") === "active", "active task with canonical visual map should remain active");
assert(taskMigrationClassification("reopened", "missing") === "active", "reopened task should be treated as active migration work");
assert(
  requiresCanonicalVisualMap({ migrationClassification: "historical-no-map-needed" }) === false,
  "historical-no-map-needed should not generate a canonical visual map action",
);
const exampleStatus = expectJson(["status", "--json", "examples/minimal-project"]);
assert(exampleStatus.project.name === "minimal-project", "example status project name mismatch");
assert(Array.isArray(exampleStatus.tasks), "example status missing tasks array");
assert(exampleStatus.tasks[0].state === "in_progress", "task state was not normalized");
assert(Array.isArray(exampleStatus.tasks[0].phases[0].requiredEvidence), "requiredEvidence must be an array");
assert(exampleStatus.capabilities.some((capability) => capability.name === "core"), "example status missing core capability");

const dryRunTarget = path.join(tmpRoot, "dry-run-target");
fs.mkdirSync(dryRunTarget);
const dryRun = expectJson(["init", "--dry-run", "--locale", "zh-CN", "--capabilities", "core,dashboard", dryRunTarget]);
assert(dryRun.dryRun === true, "init dry-run did not report dryRun true");
assert(dryRun.locale === "zh-CN", "init dry-run did not preserve zh-CN locale");
assert(dryRun.nextCommands?.some((command) => command.includes("coding-agent-harness dev")), "init output should recommend harness dev as the next human dashboard command");
assert(
  dryRun.changes.filter((change) => change.destination.startsWith("docs/11-REFERENCE/")).every((change) => change.destination === "docs/11-REFERENCE/external-source-intake-standard.md"),
  "init scaffold should only copy the external source intake standard as a core reference",
);
assert(
  dryRun.changes.some((change) => change.source === "templates-zh-CN/planning/task_plan.md"),
  "init zh-CN dry-run should use localized task_plan template when available",
);
assert(!fs.existsSync(path.join(dryRunTarget, "AGENTS.md")), "init dry-run mutated target");

const nonInteractiveDefaultTarget = path.join(tmpRoot, "non-interactive-default-target");
fs.mkdirSync(nonInteractiveDefaultTarget);
const nonInteractiveDefault = expectJson(["init", "--dry-run", "--capabilities", "core", nonInteractiveDefaultTarget]);
assert(nonInteractiveDefault.locale === "en-US", "non-interactive init without --locale should default to en-US");

if (commandExists("expect")) {
  const interactiveZhTarget = path.join(tmpRoot, "interactive-zh-target");
  fs.mkdirSync(interactiveZhTarget);
  const interactiveZh = expectTtyJson(["init", "--dry-run", "--capabilities", "core,dashboard", interactiveZhTarget], { input: "1\n", timeout: 5000 });
  assert(interactiveZh.locale === "zh-CN", "interactive init option 1 should select zh-CN");
  assert(
    interactiveZh.changes.some((change) => change.source === "templates-zh-CN/planning/task_plan.md"),
    "interactive zh-CN init should use localized templates",
  );

  const ttyExplicitTarget = path.join(tmpRoot, "tty-explicit-target");
  fs.mkdirSync(ttyExplicitTarget);
  const ttyExplicit = expectTtyJson(["init", "--dry-run", "--locale", "en-US", "--capabilities", "core", ttyExplicitTarget], { timeout: 5000 });
  assert(ttyExplicit.locale === "en-US", "explicit --locale should win in TTY init");
} else {
  console.log("Skipping TTY init tests: expect command is unavailable");
}

const zhInitTarget = path.join(tmpRoot, "zh-init-target");
fs.mkdirSync(zhInitTarget);
const zhInit = expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", zhInitTarget]);
assert(zhInit.report?.locale === "zh-CN", "init output should include install report locale");
assert(zhInit.report?.capabilities?.some((capability) => capability.name === "core" && capability.default === true), "install report should explain core as default");
assert(zhInit.report?.capabilities?.some((capability) => capability.name === "dashboard" && capability.selected === true), "install report should mark selected capabilities");
assert(zhInit.report?.agentInstructions?.some((item) => item.includes("--locale")), "install report should remind agents to pass --locale explicitly");
assert(zhInit.nextCommands?.some((command) => command.includes("coding-agent-harness dev")), "init should print a dev workbench next command");
const zhRegistry = JSON.parse(fs.readFileSync(path.join(zhInitTarget, ".harness-capabilities.json"), "utf8"));
assert(zhRegistry.locale === "zh-CN", "init should persist zh-CN locale");
assert(fs.readFileSync(path.join(zhInitTarget, "AGENTS.md"), "utf8").includes("项目概况"), "zh-CN init should write Chinese AGENTS.md");
assert(fs.existsSync(path.join(zhInitTarget, "docs/11-REFERENCE/external-source-intake-standard.md")), "zh-CN init should create external source intake standard");
assert(
  fs.readFileSync(path.join(zhInitTarget, "docs/04-DEVELOPMENT/external-source-packs/README.md"), "utf8").includes("外部资料包索引"),
  "zh-CN init should create localized external source pack registry",
);
const zhReviewTemplate = fs.readFileSync(path.join(zhInitTarget, "docs/09-PLANNING/TASKS/_task-template/review.md"), "utf8");
assert(zhReviewTemplate.includes("| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |"), "zh-CN review template should preserve checker table headers");
const zhInitCheck = expectJson(["status", "--json", zhInitTarget]);
assert(zhInitCheck.checkState.status === "pass", "core+dashboard init should pass status check without safe-adoption");
assert(zhInitCheck.checkState.warnings === 0, "core+dashboard init should not warn about safe-adoption orphan artifacts");
const zhDashboardDir = path.join(tmpRoot, "zh-dashboard");
expectPass(["dashboard", "--out-dir", zhDashboardDir, zhInitTarget]);
const zhDashboardIndex = fs.readFileSync(path.join(zhDashboardDir, "index.html"), "utf8");
const zhDashboardApp = fs.readFileSync(path.join(zhDashboardDir, "assets/app.js"), "utf8");
const zhDashboardI18n = fs.readFileSync(path.join(zhDashboardDir, "assets/i18n.js"), "utf8");
assert(zhDashboardIndex.includes("Harness 控制台"), "zh-CN dashboard should use localized index template");
assert(zhDashboardApp.includes("projectCockpit"), "zh-CN dashboard should render through localized labels");
assert(zhDashboardI18n.includes("控制台"), "zh-CN dashboard should include localized app labels");
assert(zhDashboardApp.includes("data-language-toggle"), "dashboard should expose runtime language toggle");
assert(zhDashboardIndex.includes("__HARNESS_LOCALE__"), "dashboard should bootstrap locale explicitly");

const packageScriptTarget = path.join(tmpRoot, "package-script-target");
fs.mkdirSync(packageScriptTarget);
fs.writeFileSync(path.join(packageScriptTarget, "package.json"), JSON.stringify({ scripts: { test: "node --version" } }, null, 2));
const packageScriptInit = expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", "--add-npm-scripts", packageScriptTarget]);
assert(packageScriptInit.changes.some((change) => change.destination === "package.json" && change.action === "update-scripts"), "init --add-npm-scripts should report package.json script update");
const packageScripts = JSON.parse(fs.readFileSync(path.join(packageScriptTarget, "package.json"), "utf8")).scripts;
assert(packageScripts.test === "node --version", "init --add-npm-scripts should preserve existing scripts");
assert(packageScripts["harness:dev"] === "coding-agent-harness dev .", "init --add-npm-scripts should add harness:dev");
assert(packageScripts["harness:dashboard"] === "coding-agent-harness dashboard --out-dir tmp/harness-dashboard .", "init --add-npm-scripts should add static dashboard script");
const noPackageScriptTarget = path.join(tmpRoot, "no-package-script-target");
fs.mkdirSync(noPackageScriptTarget);
const noPackageScripts = run(["init", "--dry-run", "--locale", "en-US", "--capabilities", "core", "--add-npm-scripts", noPackageScriptTarget]);
assert(noPackageScripts.status !== 0, "init --add-npm-scripts should require an existing package.json");

const enRunTarget = path.join(tmpRoot, "en-run-target");
fs.mkdirSync(enRunTarget);
const enRun = expectJson(["init", "--dry-run", "--locale", "en-US", "--capabilities", "core", enRunTarget]);
assert(enRun.locale === "en-US", "init dry-run did not preserve en-US locale");
assert(
  enRun.changes.some((change) => change.source === "templates/planning/task_plan.md"),
  "init en-US dry-run should use default English task_plan template",
);
const enInitTarget = path.join(tmpRoot, "en-init-target");
fs.mkdirSync(enInitTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", enInitTarget]);
assert(
  fs.readFileSync(path.join(enInitTarget, "docs/11-REFERENCE/external-source-intake-standard.md"), "utf8").includes("External Source Intake Standard"),
  "en-US init should create English external source intake standard",
);
assert(
  fs.readFileSync(path.join(enInitTarget, "docs/04-DEVELOPMENT/external-source-packs/README.md"), "utf8").includes("External Source Packs"),
  "en-US init should create English external source pack registry",
);
const enInitStatus = expectJson(["status", "--json", enInitTarget]);
assert(enInitStatus.checkState.status === "pass", "en-US core+dashboard init should pass status check");
assert(enInitStatus.checkState.warnings === 0, "en-US core+dashboard init should not warn about safe-adoption");

const capTarget = path.join(tmpRoot, "cap-target");
fs.mkdirSync(capTarget);
expectPass(["add-capability", "dashboard", capTarget]);
const registry = JSON.parse(fs.readFileSync(path.join(capTarget, ".harness-capabilities.json"), "utf8"));
assert(registry.locale === "en-US", "add-capability registry missing default locale");
assert(registry.capabilities.some((capability) => capability.name === "dashboard"), "add-capability missing dashboard");
assert(registry.capabilities.some((capability) => capability.name === "core"), "add-capability missing dependency core");
const addReport = expectJson(["add-capability", "dashboard", "--dry-run", capTarget]);
assert(addReport.report?.capabilities?.some((capability) => capability.name === "dashboard"), "add-capability output should include install report");

const userInstallHome = path.join(tmpRoot, "user-install-home");
const userInstallDryRun = expectJson(["install-user", "--agent", "codex", "--home", userInstallHome, "--dry-run"]);
assert(userInstallDryRun.operation === "install-user", "install-user dry-run should report operation");
assert(userInstallDryRun.targets?.[0]?.agent === "codex", "install-user dry-run should target codex");
assert(userInstallDryRun.targets?.[0]?.changes?.some((change) => change.destination.endsWith("SKILL.md") && change.action === "would-create"), "install-user dry-run should plan SKILL.md");
assert(!fs.existsSync(path.join(userInstallHome, ".codex")), "install-user dry-run should not mutate home");
const userInstall = expectJson(["install-user", "--agent", "codex", "--home", userInstallHome, "--yes"]);
const codexSkillRoot = path.join(userInstallHome, ".codex/skills/coding-agent-harness");
assert(userInstall.status === "installed", "install-user should install skill");
assert(fs.existsSync(path.join(codexSkillRoot, "SKILL.md")), "install-user should copy SKILL.md");
assert(fs.existsSync(path.join(codexSkillRoot, "templates-zh-CN/AGENTS.md.template")), "install-user should copy Chinese templates");
assert(fs.existsSync(path.join(codexSkillRoot, "scripts/harness.mjs")), "install-user should copy CLI scripts");
assert(fs.existsSync(path.join(codexSkillRoot, "docs-release/guides/agent-installation.md")), "install-user should copy agent guide");
const userInstallAgain = expectJson(["install-user", "--agent", "codex", "--home", userInstallHome, "--yes"]);
assert(userInstallAgain.targets?.[0]?.changes?.some((change) => change.action === "skip-existing"), "install-user should not overwrite existing files by default");
const userDoctor = expectJson(["doctor-user", "--agent", "codex", "--home", userInstallHome]);
assert(userDoctor.status === "pass", "doctor-user should pass for installed codex skill");
assert(userDoctor.targets?.[0]?.version === packageVersion, "doctor-user should report installed package version");
const missingDoctor = run(["doctor-user", "--agent", "gemini", "--home", userInstallHome]);
assert(missingDoctor.status !== 0, "doctor-user should fail for missing agent install");

const zhCapTarget = path.join(tmpRoot, "zh-cap-target");
fs.mkdirSync(zhCapTarget);
expectPass(["add-capability", "dashboard", "--locale", "zh-CN", zhCapTarget]);
const zhCapRegistry = JSON.parse(fs.readFileSync(path.join(zhCapTarget, ".harness-capabilities.json"), "utf8"));
assert(zhCapRegistry.locale === "zh-CN", "add-capability should support zh-CN locale for legacy targets");
assert(fs.readFileSync(path.join(zhCapTarget, "AGENTS.md"), "utf8").includes("项目概况"), "zh-CN add-capability should write Chinese templates");

const mismatch = run(["init", "--capabilities", "core,module-parallel", capTarget]);
assert(mismatch.status !== 0, "init with mismatched existing capabilities should fail");

const invalidReviewTarget = path.join(tmpRoot, "invalid-review");
fs.mkdirSync(path.join(invalidReviewTarget, "docs/09-PLANNING/TASKS/bad"), { recursive: true });
fs.writeFileSync(
  path.join(invalidReviewTarget, ".harness-capabilities.json"),
  JSON.stringify({ version: 1, locale: "en-US", capabilities: [{ name: "core", state: "configured" }, { name: "adversarial-review", state: "configured" }] }, null, 2),
);
fs.writeFileSync(path.join(invalidReviewTarget, "docs/09-PLANNING/TASKS/bad/task_plan.md"), "# Bad\n");
fs.writeFileSync(
  path.join(invalidReviewTarget, "docs/09-PLANNING/TASKS/bad/review.md"),
  "# Review\n\n## Findings\n\n| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| R-001 | P1 | Missing sections | none | fix | no | mitigated | no | next |\n",
);
const invalidReview = run(["check", "--profile", "target-project", invalidReviewTarget]);
assert(invalidReview.status !== 0, "declared review missing required sections should fail");

const invalidVerifierTarget = path.join(tmpRoot, "invalid-verifier");
fs.mkdirSync(path.join(invalidVerifierTarget, "docs/09-PLANNING/TASKS/bad"), { recursive: true });
fs.writeFileSync(
  path.join(invalidVerifierTarget, ".harness-capabilities.json"),
  JSON.stringify({ version: 1, locale: "en-US", capabilities: [{ name: "core", state: "configured" }, { name: "adversarial-review", state: "configured" }] }, null, 2),
);
fs.writeFileSync(path.join(invalidVerifierTarget, "docs/09-PLANNING/TASKS/bad/task_plan.md"), "# Bad\n");
fs.writeFileSync(
  path.join(invalidVerifierTarget, "docs/09-PLANNING/TASKS/bad/review.md"),
  "# Review\n\n## Reviewer Identity\n\n| Reviewer | Type | Scope |\n| --- | --- | --- |\n| v1 | verifier | task |\n\n## Confidence Challenge\n\nVerifier reviewed this.\n\n## Evidence Checked\n\n| Evidence ID | Type | Path | Summary |\n| --- | --- | --- | --- |\n| E-001 | review | TARGET:docs/09-PLANNING/TASKS/bad/task_plan.md | checked |\n\n## Findings\n\n| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| R-001 | P3 | Missing verifier schema | E-001 | fix | no | mitigated | no | next |\n\n## Final Confidence Basis\n\nexternal verifier reviewed this.\n",
);
const invalidVerifier = run(["check", "--profile", "target-project", invalidVerifierTarget]);
assert(invalidVerifier.status !== 0, "verifier review without template_id/verdict should fail");

const legacyContractTarget = path.join(tmpRoot, "legacy-contract");
fs.mkdirSync(path.join(legacyContractTarget, "docs/09-PLANNING/TASKS/old"), { recursive: true });
fs.writeFileSync(path.join(legacyContractTarget, "AGENTS.md"), "# AGENTS\n");
fs.writeFileSync(path.join(legacyContractTarget, "docs/09-PLANNING/TASKS/old/task_plan.md"), "# Old\n");
fs.writeFileSync(path.join(legacyContractTarget, "docs/09-PLANNING/TASKS/old/progress.md"), "# Progress\n\n## Status\n\nplanned\n");
const legacyLoose = run(["check", "--profile", "target-project", legacyContractTarget]);
assert(legacyLoose.status === 0, "legacy contract gaps should be advisory without strict");
const legacyStrict = run(["check", "--profile", "target-project", "--strict", legacyContractTarget]);
assert(legacyStrict.status !== 0, "strict legacy contract gaps should fail");

const invalidTaskStateTarget = path.join(tmpRoot, "invalid-task-state");
fs.mkdirSync(path.join(invalidTaskStateTarget, "docs/09-PLANNING/TASKS/bad-state"), { recursive: true });
fs.writeFileSync(path.join(invalidTaskStateTarget, "AGENTS.md"), "# AGENTS\n");
fs.writeFileSync(
  path.join(invalidTaskStateTarget, ".harness-capabilities.json"),
  JSON.stringify({ version: 1, locale: "en-US", capabilities: [{ name: "core", state: "configured" }] }, null, 2),
);
fs.writeFileSync(path.join(invalidTaskStateTarget, "docs/09-PLANNING/TASKS/bad-state/task_plan.md"), "# Bad State\n");
fs.writeFileSync(path.join(invalidTaskStateTarget, "docs/09-PLANNING/TASKS/bad-state/progress.md"), "# Progress\n\n## Status\n\nin progresss\n");
const invalidTaskState = run(["check", "--profile", "target-project", invalidTaskStateTarget]);
assert(invalidTaskState.status !== 0, "invalid explicit task state should fail for declared v1 targets");
assert(invalidTaskState.stderr.includes("invalid task state"), "invalid task state failure should be explicit");
fs.writeFileSync(path.join(invalidTaskStateTarget, "docs/09-PLANNING/TASKS/bad-state/progress.md"), "# Progress\n\n## Status\n\nunknown\n");
const explicitUnknownTaskState = run(["check", "--profile", "target-project", invalidTaskStateTarget]);
assert(explicitUnknownTaskState.status !== 0, "explicit unknown task state should fail for declared v1 targets");
assert(explicitUnknownTaskState.stderr.includes("invalid task state"), "explicit unknown state failure should be explicit");

const mingjingDocs = "/Users/lizeyu/Projects/mingjing-app/docs";
if (fs.existsSync(mingjingDocs)) {
  const mingjingRepo = path.dirname(mingjingDocs);
  const before = spawnSync("git", ["-C", mingjingRepo, "status", "--short", "--", "docs"], { encoding: "utf8" }).stdout;
  const mingjing = run(["status", "--json", mingjingDocs]);
  assert(mingjing.status === 0, "mingjing legacy status should be a safe-adoption warning, not a failure");
  const status = JSON.parse(mingjing.stdout);
  assert(status.project.docsOnly === true, "mingjing docs target was not detected as docsOnly");
  assert(status.mode === "legacy-compat", "mingjing docs should be legacy-compat without capability registry");
  assert(status.checkState.status === "warn", "mingjing legacy status should warn");
  expectPass(["check", "--profile", "target-project", mingjingDocs]);
  const strictStatus = run(["status", "--json", "--strict", mingjingDocs]);
  const strictCheck = run(["check", "--profile", "target-project", "--strict", mingjingDocs]);
  assert(strictStatus.status !== 0, "mingjing strict status should fail on legacy checker failures");
  assert(strictCheck.status !== 0, "mingjing strict check should fail on legacy checker failures");
  const mingjingDashboard = path.join(tmpRoot, "mingjing-dashboard.html");
  expectPass(["dashboard", "--out", mingjingDashboard, mingjingDocs]);
  assert(fs.existsSync(mingjingDashboard), "mingjing dashboard file was not created");
  const mingjingDashboardDir = path.join(tmpRoot, "mingjing-dashboard-folder");
  expectPass(["dashboard", "--out-dir", mingjingDashboardDir, mingjingDocs]);
  assert(fs.existsSync(path.join(mingjingDashboardDir, "index.html")), "mingjing dashboard folder index was not created");
  for (const generated of ["data/status.json", "data/tables.json", "data/documents.json", "data/graph.json", "data/adoption.json", "assets/dashboard-data.js"]) {
    const content = fs.readFileSync(path.join(mingjingDashboardDir, generated), "utf8");
    assert(!content.includes("/Users/lizeyu"), `mingjing ${generated} leaked local user path`);
    assert(!content.includes("file://"), `mingjing ${generated} leaked file URL`);
  }
  const mingjingDocuments = JSON.parse(fs.readFileSync(path.join(mingjingDashboardDir, "data/documents.json"), "utf8"));
  const mingjingTables = JSON.parse(fs.readFileSync(path.join(mingjingDashboardDir, "data/tables.json"), "utf8"));
  assert(!JSON.stringify(mingjingDocuments.documents.map((doc) => doc.path)).includes("_task-template"), "mingjing documents included task template paths");
  assert(!JSON.stringify(mingjingTables.tables.map((table) => table.source)).includes("_task-template"), "mingjing tables included task template sources");
  const mingjingGraph = JSON.parse(fs.readFileSync(path.join(mingjingDashboardDir, "data/graph.json"), "utf8"));
  assert(mingjingGraph.nodes.some((node) => node.type === "module"), "mingjing graph missing module nodes");
  assert(mingjingGraph.edges.length > 0, "mingjing graph missing dependency edges");
  assertGraphIntegrity(mingjingGraph, "mingjing graph");
  const after = spawnSync("git", ["-C", mingjingRepo, "status", "--short", "--", "docs"], { encoding: "utf8" }).stdout;
  assert(before === after, "mingjing docs changed during status/check/dashboard smoke");
}

console.log("Harness core tests passed");
