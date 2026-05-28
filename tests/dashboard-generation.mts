#!/usr/bin/env node
// @ts-nocheck

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { spawn, spawnSync } from "node:child_process";
import { buildDashboardBundle } from "../scripts/lib/dashboard-data.mjs";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const node = process.execPath;
const cli = path.join(repoRoot, "dist/harness.mjs");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dashboard-generation-"));

function run(args, options = {}) {
  return spawnSync(node, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectPass(args) {
  const result = run(args);
  assert(result.status === 0, `${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

const dashboardPath = path.join(tmpRoot, "dashboard.html");
expectPass(["dashboard", "--out", dashboardPath, "examples/minimal-project"]);
assert(fs.existsSync(dashboardPath), "dashboard file was not created");
const dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
assert(dashboardHtml.includes("Harness Dashboard"), "dashboard HTML missing title");
assert(dashboardHtml.includes("window.__HARNESS_DASHBOARD__"), "dashboard HTML missing inline data bundle");
assert(dashboardHtml.includes("Human Visibility Dashboard"), "dashboard HTML missing v2 visibility copy");
assert(dashboardHtml.includes("#/tasks"), "dashboard HTML missing task index route");
assert(dashboardHtml.includes("#/review"), "dashboard HTML missing review queue route");
assert(dashboardHtml.includes("#/presets"), "dashboard HTML missing preset catalog route");
assert(dashboardHtml.includes("function reviewQueue()"), "dashboard HTML missing review queue page implementation");

const dashboardDir = path.join(tmpRoot, "dashboard-folder");
expectPass(["dashboard", "--out-dir", dashboardDir, "examples/minimal-project"]);
for (const required of [
  "index.html",
  "assets/app.css",
  "assets/app.js",
  "assets/i18n.js",
  "assets/markdown-reader.js",
  "assets/mermaid-renderer.js",
  "assets/dashboard-data.js",
  "data/status.json",
  "data/tables.json",
  "data/documents.json",
  "data/graph.json",
  "data/adoption.json",
  "data/presetCatalog.json",
]) {
  assert(fs.existsSync(path.join(dashboardDir, required)), `dashboard folder missing ${required}`);
}
const folderIndex = fs.readFileSync(path.join(dashboardDir, "index.html"), "utf8");
assert(folderIndex.includes("dashboard-data.js"), "dashboard folder index missing embedded data script");
assert(folderIndex.includes("rel=\"icon\""), "dashboard index should suppress favicon request");
const folderApp = fs.readFileSync(path.join(dashboardDir, "assets/app.js"), "utf8");
assert(folderApp.includes("snapshotNotValidated"), "dashboard data-only UI should label status as snapshot-only");
const folderStatus = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/status.json"), "utf8"));
assert(folderStatus.tasks[0].visualMapSource === "canonical", "folder status should use canonical visual_map.md");
assert(folderStatus.tasks[0].roadmapSource === "canonical", "folder status should preserve roadmapSource compatibility as canonical");
assert(folderStatus.schemaVersion === 2, "dashboard folder status should expose schemaVersion 2");
assert(folderStatus.summary.fullCutoverEligible === false, "dashboard data-only status should not claim validated fullCutoverEligible=true");
assert(folderStatus.summary.legacyVisualOnlyCount === 0, "minimal project should expose zero legacy visual-only tasks");
assert(folderStatus.summary.weakBriefCount === 0, "minimal project should expose zero weak briefs");
assert(folderStatus.summary.unknownClassificationCount === 0, "minimal project should expose zero unknown migration classifications");
assert(folderStatus.summary.missingCanonicalVisualMapCount === 0, "minimal project should expose zero missing canonical visual maps");
const documents = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/documents.json"), "utf8"));
assert(documents.documents.some((doc) => doc.path.endsWith("/brief.md")), "documents should include task briefs");
assert(documents.documents.some((doc) => doc.path.endsWith("/task_plan.md")), "documents should include task plan fallback");
assert(documents.documents.some((doc) => doc.path.endsWith("execution_strategy.md")), "documents missing execution strategy");
assert(documents.documents.some((doc) => doc.path.endsWith("visual_map.md")), "documents missing visual map");
assert(documents.documents.some((doc) => doc.path.endsWith("lesson_candidates.md")), "documents missing lesson candidates");
const tables = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/tables.json"), "utf8"));
assert(tables.tables.some((table) => table.kind === "harness-ledger"), "documents missing harness ledger table");
assert(JSON.stringify(tables).includes("alpha|beta"), "markdown table parser should preserve escaped pipes");
const graph = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/graph.json"), "utf8"));
assert(graph.edges.length > 0, "graph should include task/phase edges");
assert(graph.nodes.some((node) => node.type === "phase" && node.kind), "phase graph nodes should expose phase kind");
assertGraphIntegrity(graph, "example graph");
const presetCatalogPath = path.join(dashboardDir, "data/presetCatalog.json");
assert(fs.existsSync(presetCatalogPath), "dashboard folder should write presetCatalog.json");
const presetCatalog = JSON.parse(fs.readFileSync(presetCatalogPath, "utf8"));
assert(presetCatalog.summary.total >= 1, "preset catalog should summarize available presets");
assert(Array.isArray(presetCatalog.roots) && presetCatalog.roots.some((root) => root.source === "builtin"), "preset catalog should include builtin root");
assert(presetCatalog.presets.some((preset) => preset.id === "legacy-migration" && ["user", "builtin"].includes(preset.source)), "preset catalog should include discoverable bundled presets");
assert(presetCatalog.presets.every((preset) => preset.id && preset.version && preset.source && preset.purpose && Array.isArray(preset.compatibleBudgets) && preset.manifestPath), "preset catalog presets should expose stable summary fields");
const dashboardApp = fs.readFileSync(path.join(dashboardDir, "assets/app.js"), "utf8");
const dashboardCss = fs.readFileSync(path.join(dashboardDir, "assets/app.css"), "utf8");
const dashboardI18n = fs.readFileSync(path.join(dashboardDir, "assets/i18n.js"), "utf8");
const dashboardMarkdown = fs.readFileSync(path.join(dashboardDir, "assets/markdown-reader.js"), "utf8");
const dashboardMermaid = fs.readFileSync(path.join(dashboardDir, "assets/mermaid-renderer.js"), "utf8");
assert(dashboardApp.includes("hashchange"), "dashboard should use hash routing");
assert(dashboardApp.includes("taskDetail("), "dashboard should implement task detail route");
assert(dashboardApp.includes("phase-kind-group"), "dashboard should group phase timeline by kind");
assert(dashboardApp.includes("phase-exit-command"), "dashboard should render phase exit commands");
assert(dashboardApp.includes("Other / Invalid"), "dashboard should keep invalid or future phase kinds visible");
assert(dashboardApp.includes("translated === key"), "dashboard state labels should fall back instead of rendering missing i18n keys");
assert(dashboardCss.includes(".phase-step.other"), "dashboard CSS should style unknown phase kinds");
assert(dashboardApp.includes("data-render-toggle"), "dashboard missing render/source toggle");
assert(dashboardApp.includes("data-search"), "dashboard missing task search control");
assert(dashboardApp.includes("taskGroupsPerPage"), "dashboard missing global task group paging");
assert(dashboardApp.includes("taskStatsBar"), "dashboard missing task stats bar");
assert(dashboardApp.includes("task-row-card"), "dashboard missing upgraded task row card");
assert(dashboardApp.includes("taskSortOrder"), "dashboard missing task time sort state");
assert(dashboardApp.includes("data-task-sort-order"), "dashboard missing task time sort controls");
assert(dashboardApp.includes("sortTasksByTime"), "dashboard missing reusable task time sort helper");
assert(dashboardApp.includes("function taskFolderName"), "dashboard missing reusable task folder name helper");
assert(dashboardApp.includes("data-copy-task-folder"), "dashboard copy controls must copy task folder names");
assert(!dashboardApp.includes("task?.title || task?.id || \"\""), "dashboard copy controls must not copy display titles");
assert(dashboardCss.includes("phase-kind-group"), "dashboard CSS should style phase kind groups");
assert(dashboardApp.includes("activeBriefCount"), "dashboard missing active brief count label");
assert(dashboardApp.includes("data-copy-task-name"), "dashboard missing task name copy controls");
assert(dashboardApp.includes("copyTaskNameSuccess"), "dashboard missing task name copy success feedback");
assert(dashboardApp.includes("copyTaskNameFailed"), "dashboard missing task name copy failure feedback");
assert(dashboardApp.includes("review-copy-task-name"), "review workspace missing task name copy control");
assert(dashboardApp.includes("taskCanBeHumanConfirmed("), "dashboard missing canonical human confirmation gate helper");
assert(dashboardApp.includes("task.taskQueues.includes(\"review\")"), "dashboard human confirmation gate must require canonical Review queue membership");
assert(!dashboardApp.includes("activeTasks().slice(0, 8)"), "dashboard should not hard-cap active briefs at 8 items");
assert(dashboardApp.includes("fullCutoverEligible"), "dashboard missing full cutover summary field");
assert(dashboardApp.includes("legacyVisualOnlyCount"), "dashboard missing legacy visual-only summary field");
assert(dashboardApp.includes("weakBriefCount"), "dashboard missing weak brief summary field");
assert(dashboardApp.includes("warningQueue()"), "dashboard missing warning queue workbench");
assert(dashboardApp.includes("function presetsView()"), "dashboard missing preset catalog page implementation");
assert(dashboardApp.includes("data-preset-source-filter"), "dashboard missing preset source filter controls");
assert(dashboardApp.includes("data-preset-install"), "dashboard missing preset install workbench action");
assert(dashboardApp.includes("data-preset-seed"), "dashboard missing preset seed workbench action");
assert(dashboardApp.includes("data-preset-uninstall"), "dashboard missing preset uninstall workbench action");
assert(dashboardApp.includes("data-copy-preset-id"), "dashboard preset cards should expose copy ID controls");
assert(dashboardApp.includes("data-copy-preset-command"), "dashboard preset detail should expose copyable CLI commands");
assert(dashboardApp.includes("presetLayerStackPanel(selected)"), "dashboard preset detail should show same-id layer stack");
assert(dashboardApp.includes("presetSourceRank"), "dashboard preset UI should encode project/user/builtin precedence");
assert(dashboardApp.includes("presetRestoreBundled"), "dashboard preset seed action should use user-facing restore wording");
assert(dashboardApp.includes("syncVisiblePresetSelection(presets)"), "dashboard preset selection should stay constrained to the visible filtered list");
assert(dashboardApp.includes("presetMatchesQuery(selectedPreset)"), "dashboard preset layer selection should clear stale searches when switching layers");
assert(dashboardApp.includes("presetCommandsEffectiveOnly"), "shadowed preset layers should not expose misleading effective-layer CLI commands");
assert(dashboardApp.includes("confirmMatches"), "preset uninstall should be client-gated by selected-id confirmation");
assert(dashboardApp.includes("canUseWorkbenchAction(\"preset-install\")"), "dashboard preset writes must be gated by workbench actions");
assert(dashboardApp.includes("selectedPresetKey"), "dashboard preset selection should use a source-qualified key");
assert(dashboardApp.includes("state.selectedPresetKey = \"\""), "dashboard preset source filters should reset stale selections");
assert(dashboardApp.includes("syncPresetUninstallScope(selected)"), "dashboard preset uninstall scope should follow the selected preset source");
assert(dashboardApp.includes("data-preset-uninstall-scope ${lockedUninstallScope ? \"disabled\" : \"\"}"), "dashboard preset uninstall scope should be locked for project/user selections");
assert(dashboardApp.includes("reviewWorkspace("), "dashboard missing review workspace route implementation");
assert(dashboardApp.includes("reviewQueueState"), "dashboard review queue must use status-level review queue state");
assert(dashboardApp.includes("[\"lessonCandidates\", \"lesson_candidates.md\"]"), "dashboard should expose lesson candidate documents");
assert(dashboardApp.includes("data-copy-lesson-prompt"), "dashboard lessons queue should expose copyable sedimentation prompt");
assert(dashboardApp.includes("data-create-lesson-sedimentation"), "dashboard lessons queue should expose sedimentation task creation action");
assert(dashboardApp.includes("lessonCandidatePanel(task, { context: \"detail\" })"), "task detail should expose lesson sedimentation actions");
assert(dashboardApp.includes("lessonCandidatePanel(task, { context: \"drawer\" })"), "review drawer should expose lesson sedimentation actions");
assert(dashboardApp.includes("lessonSedimentationSuccess"), "dashboard should render post-create follow-up task and prompt actions");
assert(dashboardApp.includes("lessonSedimentationFailure"), "dashboard should render actionable sedimentation failure details");
assert(dashboardApp.includes("lessonCandidateRows"), "dashboard should render parsed lesson candidate row facts");
assert(dashboardApp.includes("candidate.detailArtifact"), "dashboard lesson prompts must include task-local detail artifact paths");
assert(dashboardApp.includes("Use the detail artifact as the lesson body source"), "dashboard lesson prompts must not reconstruct lessons from brief rows");
assert(dashboardApp.includes("lesson-candidate-more"), "dashboard lessons queue should disclose when more actionable candidates are hidden in the bounded card");
assert(dashboardApp.includes("review-doc-scroll"), "review workspace documents should render inside bounded scroll containers");
assert(dashboardApp.includes("sedimentationStatus"), "dashboard state summary should expose sedimentation axis");
assert(dashboardApp.includes("migrationRunwayBreakdown"), "dashboard missing aggregate migration runway drilldown");
assert(dashboardApp.includes("[\"brief\", \"brief.md\"]"), "dashboard should make brief.md the first task detail tab");
assert(dashboardApp.includes("[\"visualMap\", \"visual_map.md\"]"), "dashboard should expose canonical visual_map.md tab");
assert(dashboardApp.includes("projectMermaid"), "dashboard should render project flow from graph data");
assert(dashboardApp.includes("escapeHtml(projectName())"), "dashboard project title must be escaped");
assert(dashboardCss.includes(".brief-scroll"), "dashboard missing scrollable active brief container styles");
assert(dashboardMarkdown.includes("rendered-table"), "dashboard missing rendered markdown table support");
assert(dashboardMermaid.includes("mermaid-rendered"), "dashboard missing rendered mermaid output");
assert(dashboardCss.includes(".runtime-banner"), "dashboard missing static read-only banner styling");
assert(dashboardCss.includes(".preset-workspace"), "dashboard missing preset management workspace layout");
assert(dashboardCss.includes(".preset-catalog-list"), "dashboard missing preset collection list layout");
assert(dashboardCss.includes(".preset-detail-list"), "dashboard missing preset detail typography grid");
assert(dashboardCss.includes(".preset-layer-row"), "dashboard missing same-id preset layer stack styles");
assert(dashboardCss.includes(".preset-action-panel"), "dashboard missing preset action panel styling");
assert(dashboardCss.includes(".preset-manifest-path"), "dashboard preset paths should have bounded wrapping styles");
assert(dashboardCss.includes("@media (max-width: 1400px)"), "preset workspace should fold before narrow desktop layouts crush the action column");
assert(dashboardCss.includes("max-height: min(68vh, 620px)"), "dashboard missing mermaid viewport containment");
assert(dashboardCss.includes(".review-workspace-grid"), "dashboard missing review workspace layout");
assert(dashboardCss.includes(".review-queue-toolbar input,"), "review queue controls should use scoped dashboard input styling");
assert(dashboardCss.includes(".lesson-candidate-panel"), "lesson candidate actions should render inside a bounded panel");
assert(dashboardCss.includes("max-height: clamp(190px, 32vh, 320px)"), "lesson candidate panels should bound long candidate lists");
assert(dashboardCss.includes(".workbench-action-result"), "workbench lesson action feedback should be styled as a bounded result panel");
assert(dashboardCss.includes(".drawer-task-summary"), "task drawer should use a styled summary panel instead of inline styles");
assert(dashboardCss.includes("repeat(auto-fit, minmax(min(100%, 360px), 1fr))"), "review queue cards should adapt to the available main-column width");
assert(dashboardCss.includes("max-height: clamp(520px, 68vh, 680px)"), "review queue cards should cap height and scroll internally");
assert(dashboardCss.includes("@media (min-width: 1280px)"), "dashboard desktop sidebar should wait for wider viewports");
assert(dashboardCss.includes("grid-template-columns: minmax(0, 1fr) minmax(300px, 360px)"), "overview sidebar should not overtake the main column");
assert(dashboardCss.includes(".review-actions .copy-task-name.review-copy-task-name"), "review copy control should have scoped styles");
assert(dashboardCss.includes(".review-workspace-main,"), "review workspace columns must be shrinkable");
assert(dashboardCss.includes(".review-doc-panel"), "review document panels must be width-contained");
assert(dashboardCss.includes(".review-doc-scroll"), "review document panels must have bounded scroll containers");
assert(dashboardCss.includes("max-height: min(58vh, 560px)"), "review document panels must cap height for long docs and tables");
assert(dashboardCss.includes("overflow: hidden;"), "document panels must prevent long review content from widening the page");
assert(dashboardCss.includes("max-width: 100%;"), "markdown and review panels must cap rendered content width");
assert(dashboardCss.includes("transform: translateX(105%)"), "closed task drawer must not widen the page");
for (const generated of ["data/status.json", "data/tables.json", "data/documents.json", "data/graph.json", "data/adoption.json", "assets/dashboard-data.js"]) {
  const content = fs.readFileSync(path.join(dashboardDir, generated), "utf8");
  assert(!content.includes(repoRoot), `${generated} leaked absolute repo path`);
  assert(!content.includes("file://"), `${generated} leaked file URL`);
  assert(!hasLocalAbsolutePath(content), `${generated} leaked local absolute path`);
}
assert(!JSON.stringify(documents.documents.map((doc) => doc.path)).includes("_task-template"), "documents included task template paths");

const unsafeOut = run(["dashboard", "--out-dir", ".", "examples/minimal-project"]);
assert(unsafeOut.status !== 0, "dashboard --out-dir . should be refused");
const unsafeHarnessOut = run(["dashboard", "--out-dir", "examples/minimal-project/coding-agent-harness", "examples/minimal-project"]);
assert(unsafeHarnessOut.status !== 0, "dashboard --out-dir target harness root should be refused");
const unsafeHarnessChildOut = run(["dashboard", "--out-dir", "examples/minimal-project/coding-agent-harness/generated-dashboard", "examples/minimal-project"]);
assert(unsafeHarnessChildOut.status !== 0, "dashboard --out-dir inside target harness root should be refused");
const staticWorkbenchFlagDir = path.join(tmpRoot, "static-workbench-flag");
expectPass(["dashboard", "--out-dir", staticWorkbenchFlagDir, "examples/minimal-project"]);
assert(
  fs.readFileSync(path.join(staticWorkbenchFlagDir, "index.html"), "utf8").includes("__HARNESS_WORKBENCH__ = false"),
  "static dashboard folder should not enable workbench runtime",
);
assert(
  fs.readFileSync(path.join(staticWorkbenchFlagDir, "assets/app.js"), "utf8").includes("staticReadOnly"),
  "static dashboard app should render a visible read-only runtime boundary",
);
const dataOnlyStatusBundle = {
  status: {
    checkState: { status: "pass", validationMode: "data-only", failures: 0, warnings: 0 },
    tasks: [],
    summary: {},
  },
};
const staticStatusStrip = renderStatusStripForRuntime(dataOnlyStatusBundle, { locale: "zh", workbench: false });
assert(staticStatusStrip.includes("快照状态"), "static data-only dashboard should keep the snapshot status label");
const workbenchStatusStrip = renderStatusStripForRuntime(dataOnlyStatusBundle, { locale: "zh", workbench: true });
assert(!workbenchStatusStrip.includes("快照状态"), "harness dev workbench should not label its primary status as a snapshot");
assert(!workbenchStatusStrip.includes("这里只是快照"), "harness dev workbench should not show static snapshot-only guidance");
assert(workbenchStatusStrip.includes("发布状态"), "harness dev workbench should show the normal readiness status label");
const presetCatalogTarget = path.join(tmpRoot, "preset-catalog-target");
const presetCatalogHome = path.join(tmpRoot, "preset-catalog-home");
fs.cpSync(path.join(repoRoot, "examples/minimal-project"), presetCatalogTarget, { recursive: true });
writePresetPackage(path.join(presetCatalogTarget, ".coding-agent-harness/presets/project-catalog"), {
  id: "project-catalog",
  purpose: "Project catalog preset",
  kind: "project-catalog-task",
});
writePresetPackage(path.join(presetCatalogHome, ".coding-agent-harness/presets/user-catalog"), {
  id: "user-catalog",
  purpose: "User catalog preset",
  kind: "user-catalog-task",
});
writePresetPackage(path.join(presetCatalogHome, ".coding-agent-harness/presets/module"), {
  id: "module",
  purpose: "User shadow for bundled module preset",
  kind: "user-module-shadow-task",
});
const presetCatalogDir = path.join(tmpRoot, "preset-catalog-dashboard");
expectPass(["dashboard", "--out-dir", presetCatalogDir, presetCatalogTarget], {
  env: { ...process.env, HOME: presetCatalogHome },
});
const layeredCatalog = JSON.parse(fs.readFileSync(path.join(presetCatalogDir, "data/presetCatalog.json"), "utf8"));
assert(layeredCatalog.summary.project >= 1, "preset catalog should count project presets");
assert(layeredCatalog.roots.some((root) => root.source === "builtin"), "preset catalog should keep builtin root visible even when user presets shadow bundled ids");
assert(layeredCatalog.presets.some((preset) => preset.id === "project-catalog" && preset.source === "project"), "preset catalog should include project presets");
assert(layeredCatalog.presets.some((preset) => preset.id === "legacy-migration" && ["user", "builtin"].includes(preset.source)), "preset catalog should include discoverable bundled preset ids");
assert(layeredCatalog.presets.some((preset) => preset.id === "module" && preset.source === "user" && preset.effective === true), "preset catalog should show the effective user shadow for a bundled preset id");
assert(layeredCatalog.presets.some((preset) => preset.id === "module" && preset.source === "builtin" && preset.effective === false), "preset catalog should still show shadowed builtin presets");
assert(new Set(layeredCatalog.presets.map((preset) => preset.key)).size === layeredCatalog.presets.length, "preset catalog keys should uniquely identify source/id layers");
assert(layeredCatalog.presets.find((preset) => preset.id === "project-catalog")?.taskKind === "project-catalog-task", "preset catalog should expose task kind");
assert(layeredCatalog.presets.find((preset) => preset.id === "project-catalog")?.inputCount === 0, "preset catalog should expose input count");
assert(layeredCatalog.presets.find((preset) => preset.id === "project-catalog")?.referenceCount === 0, "preset catalog should expose reference count");
assert(layeredCatalog.presets.find((preset) => preset.id === "project-catalog")?.artifactCount === 0, "preset catalog should expose artifact count");
const isolatedHomeCatalog = buildDashboardBundle(presetCatalogTarget, { home: presetCatalogHome }).presetCatalog;
assert(isolatedHomeCatalog.summary.user >= 1, "preset catalog should count user presets when a home override is supplied");
assert(isolatedHomeCatalog.summary.builtin >= 1, "preset catalog should count builtin presets when user ids do not shadow them");
assert(isolatedHomeCatalog.presets.some((preset) => preset.id === "user-catalog" && preset.source === "user"), "preset catalog should include user presets");
assert(isolatedHomeCatalog.presets.some((preset) => preset.id === "legacy-migration" && preset.source === "builtin" && preset.effective === true), "preset catalog should include effective builtin fallback presets with isolated home");
assert(isolatedHomeCatalog.presets.some((preset) => preset.id === "module" && preset.source === "builtin" && preset.effective === false), "preset catalog should include shadowed builtin layers with isolated home");
const helpOutput = expectPass(["help"]).stdout;
assert(helpOutput.includes("harness dev"), "help should advertise harness dev as the daily dynamic workbench entry");

const devRecoveryTarget = path.join(tmpRoot, "dev-recovery-target");
fs.cpSync(path.join(repoRoot, "examples/minimal-project"), devRecoveryTarget, { recursive: true });
const devRecoveryOutDir = defaultDevOutDir(devRecoveryTarget);
fs.rmSync(devRecoveryOutDir, { recursive: true, force: true });
writeStaleDashboardLikeDirectory(devRecoveryOutDir);
await expectDevStarts(["dev", "--no-open", "--port", "0", devRecoveryTarget]);
assert(fs.existsSync(path.join(devRecoveryOutDir, ".harness-dashboard")), "harness dev should recover stale generated dashboard temp dirs by rewriting the marker");

fs.rmSync(devRecoveryOutDir, { recursive: true, force: true });
writePartialGeneratedDashboardDirectory(devRecoveryOutDir);
await expectDevStarts(["dev", "--no-open", "--port", "0", devRecoveryTarget]);
assert(fs.existsSync(path.join(devRecoveryOutDir, ".harness-dashboard")), "harness dev should recover interrupted generated dashboard temp dirs by README signature");

const explicitStaleOutDir = path.join(tmpRoot, "explicit-stale-dashboard");
writeStaleDashboardLikeDirectory(explicitStaleOutDir);
const explicitStaleDev = run(["dev", "--no-open", "--out-dir", explicitStaleOutDir, devRecoveryTarget], { timeout: 4000 });
assert(explicitStaleDev.status !== 0, "harness dev --out-dir should not recover unmarked directories implicitly");
assert(explicitStaleDev.stderr.includes("Refusing to overwrite non-dashboard directory"), "explicit stale dev output should explain the refusal");

const rootDashboardPath = path.join(repoRoot, "harness-dashboard.html");
assert(!fs.existsSync(rootDashboardPath), "source package root must not contain tracked generated harness-dashboard.html");
const defaultDashboard = expectPass(["dashboard", "examples/minimal-project"]).stdout.trim();
const expectedDefaultDashboard = path.join(repoRoot, "tmp/harness-dashboard.html");
assert(defaultDashboard === expectedDefaultDashboard, "dashboard default output should be tmp/harness-dashboard.html");
assert(fs.existsSync(expectedDefaultDashboard), "dashboard default output file was not created under tmp/");
assert(!fs.existsSync(rootDashboardPath), "dashboard default generation must not recreate root harness-dashboard.html");

const redactionTarget = path.join(tmpRoot, "redaction-target");
fs.mkdirSync(path.join(redactionTarget, "coding-agent-harness/planning/tasks/path-check"), { recursive: true });
fs.writeFileSync(path.join(redactionTarget, "AGENTS.md"), "# AGENTS\n");
fs.writeFileSync(
  path.join(redactionTarget, "coding-agent-harness/harness.yaml"),
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
    "",
  ].join("\n"),
);
fs.writeFileSync(path.join(redactionTarget, "coding-agent-harness/planning/tasks/path-check/task_plan.md"), "# Path Check\n");
fs.writeFileSync(
  path.join(redactionTarget, "coding-agent-harness/planning/tasks/path-check/progress.md"),
  "# Progress\n\n## Status\n\nin_progress\n\ncommand:TARGET:logs/check.txt: touched /tmp/secret and C:\\Users\\name\\secret\n",
);
const redactionDir = path.join(tmpRoot, "redaction-dashboard");
expectPass(["dashboard", "--out-dir", redactionDir, redactionTarget]);
const redactionData = fs.readFileSync(path.join(redactionDir, "assets/dashboard-data.js"), "utf8");
assert(redactionData.includes("LOCAL_PATH_REDACTED"), "dashboard data should include redacted local paths");
assert(!hasLocalAbsolutePath(redactionData), "dashboard data leaked generic local path");

function hasLocalAbsolutePath(content) {
  return /(?:^|[\s"'(])(?:\/Users\/|\/Volumes\/|\/tmp\/|\/private\/tmp\/|\/var\/folders\/|\/home\/|[A-Za-z]:\\)/.test(content);
}

function defaultDevOutDir(targetInput) {
  const target = path.resolve(targetInput || ".");
  const name = path.basename(target) || "project";
  const hash = Buffer.from(target).toString("hex").slice(0, 16);
  return path.join(os.tmpdir(), "coding-agent-harness-dev", `${name}-${hash}`);
}

function writeStaleDashboardLikeDirectory(outDir) {
  fs.mkdirSync(path.join(outDir, "assets"), { recursive: true });
  fs.mkdirSync(path.join(outDir, "data"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), "<!doctype html><title>stale</title>\n");
  fs.writeFileSync(path.join(outDir, "README.md"), "# stale dashboard\n");
  fs.writeFileSync(path.join(outDir, "assets/app.js"), "window.__STALE__ = true;\n");
  fs.writeFileSync(path.join(outDir, "assets/dashboard-data.js"), "window.__HARNESS_DASHBOARD__ = {};\n");
  fs.writeFileSync(path.join(outDir, "data/status.json"), "{}\n");
}

function writePartialGeneratedDashboardDirectory(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "README.md"),
    "# Harness Dashboard\n\nThis is a read-only static snapshot generated by `harness dashboard --out-dir`.\n",
  );
}

function renderStatusStripForRuntime(bundle, { locale = "zh", workbench = false } = {}) {
  const element = {
    innerHTML: "",
    dataset: {},
    querySelectorAll() {
      return [];
    },
    addEventListener() {},
    classList: { add() {}, remove() {}, toggle() {} },
  };
  const context = {
    window: {
      __HARNESS_DASHBOARD__: bundle,
      __HARNESS_LOCALE__: locale,
      __HARNESS_WORKBENCH__: workbench,
      addEventListener() {},
      location: { protocol: "http:" },
      matchMedia() {
        return { matches: false, addEventListener() {} };
      },
    },
    localStorage: { getItem() { return null; }, setItem() {} },
    navigator: { language: locale === "zh" ? "zh-CN" : "en-US" },
    document: {
      documentElement: { dataset: {} },
      getElementById() {
        return element;
      },
      querySelectorAll() {
        return [];
      },
      body: element,
      addEventListener() {},
    },
    setInterval() {},
    clearInterval() {},
    fetch() {
      return Promise.resolve({ ok: false });
    },
    console,
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(`${dashboardI18n}\n${dashboardApp}`, context);
  return context.statusStrip();
}

function writePresetPackage(directory, { id, purpose, kind }) {
  fs.mkdirSync(path.join(directory, "templates"), { recursive: true });
  fs.writeFileSync(path.join(directory, "templates/task_plan.append.md"), `## ${id}\n\nPreset: {{title}}\n`);
  fs.writeFileSync(
    path.join(directory, "preset.yaml"),
    `id: ${id}
version: 1
purpose: ${purpose}
compatibleBudgets: [standard, complex]
localeSupport: [en-US, zh-CN]
task:
  kind: ${kind}
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
templateValues:
  title:
    from: task.title
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
`,
  );
}

function expectDevStarts(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(node, [cli, ...args], { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`${args.join(" ")} did not start\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    }, 8000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      if (!stdout.includes("harness dev:")) return;
      clearTimeout(timer);
      child.kill("SIGTERM");
      resolve({ stdout, stderr });
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("exit", (code, signal) => {
      if (signal === "SIGTERM") return;
      clearTimeout(timer);
      reject(new Error(`${args.join(" ")} exited before starting (${code})\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });
}

function assertGraphIntegrity(graph, label) {
  const nodes = new Set((graph.nodes || []).map((node) => node.id));
  for (const edge of graph.edges || []) {
    assert(nodes.has(edge.from), `${label} has dangling edge source ${edge.from}`);
    assert(nodes.has(edge.to), `${label} has dangling edge target ${edge.to}`);
  }
}

console.log("Dashboard generation tests passed");
