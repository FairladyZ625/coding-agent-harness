#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const node = process.execPath;
const cli = path.join(repoRoot, "scripts/harness.mjs");
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
]) {
  assert(fs.existsSync(path.join(dashboardDir, required)), `dashboard folder missing ${required}`);
}
const folderIndex = fs.readFileSync(path.join(dashboardDir, "index.html"), "utf8");
assert(folderIndex.includes("dashboard-data.js"), "dashboard folder index missing embedded data script");
assert(folderIndex.includes("rel=\"icon\""), "dashboard index should suppress favicon request");
const folderStatus = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/status.json"), "utf8"));
assert(folderStatus.tasks[0].visualMapSource === "canonical", "folder status should use canonical visual_map.md");
assert(folderStatus.tasks[0].roadmapSource === "canonical", "folder status should preserve roadmapSource compatibility as canonical");
assert(folderStatus.schemaVersion === 2, "dashboard folder status should expose schemaVersion 2");
assert(folderStatus.summary.fullCutoverEligible === true, "minimal project should expose fullCutoverEligible=true");
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
assertGraphIntegrity(graph, "example graph");
const dashboardApp = fs.readFileSync(path.join(dashboardDir, "assets/app.js"), "utf8");
const dashboardCss = fs.readFileSync(path.join(dashboardDir, "assets/app.css"), "utf8");
const dashboardMarkdown = fs.readFileSync(path.join(dashboardDir, "assets/markdown-reader.js"), "utf8");
const dashboardMermaid = fs.readFileSync(path.join(dashboardDir, "assets/mermaid-renderer.js"), "utf8");
assert(dashboardApp.includes("hashchange"), "dashboard should use hash routing");
assert(dashboardApp.includes("taskDetail("), "dashboard should implement task detail route");
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
const unsafeDocsOut = run(["dashboard", "--out-dir", "examples/minimal-project/docs", "examples/minimal-project"]);
assert(unsafeDocsOut.status !== 0, "dashboard --out-dir target docs should be refused");
const unsafeDocsChildOut = run(["dashboard", "--out-dir", "examples/minimal-project/docs/generated-dashboard", "examples/minimal-project"]);
assert(unsafeDocsChildOut.status !== 0, "dashboard --out-dir inside target docs should be refused");
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
const helpOutput = expectPass(["help"]).stdout;
assert(helpOutput.includes("harness dev"), "help should advertise harness dev as the daily dynamic workbench entry");

const rootDashboardPath = path.join(repoRoot, "harness-dashboard.html");
assert(!fs.existsSync(rootDashboardPath), "source package root must not contain tracked generated harness-dashboard.html");
const defaultDashboard = expectPass(["dashboard", "examples/minimal-project"]).stdout.trim();
const expectedDefaultDashboard = path.join(repoRoot, "tmp/harness-dashboard.html");
assert(defaultDashboard === expectedDefaultDashboard, "dashboard default output should be tmp/harness-dashboard.html");
assert(fs.existsSync(expectedDefaultDashboard), "dashboard default output file was not created under tmp/");
assert(!fs.existsSync(rootDashboardPath), "dashboard default generation must not recreate root harness-dashboard.html");

const redactionTarget = path.join(tmpRoot, "redaction-target");
fs.mkdirSync(path.join(redactionTarget, "docs/09-PLANNING/TASKS/path-check"), { recursive: true });
fs.writeFileSync(path.join(redactionTarget, "AGENTS.md"), "# AGENTS\n");
fs.writeFileSync(path.join(redactionTarget, "docs/09-PLANNING/TASKS/path-check/task_plan.md"), "# Path Check\n");
fs.writeFileSync(
  path.join(redactionTarget, "docs/09-PLANNING/TASKS/path-check/progress.md"),
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

function assertGraphIntegrity(graph, label) {
  const nodes = new Set((graph.nodes || []).map((node) => node.id));
  for (const edge of graph.edges || []) {
    assert(nodes.has(edge.from), `${label} has dangling edge source ${edge.from}`);
    assert(nodes.has(edge.to), `${label} has dangling edge target ${edge.to}`);
  }
}

console.log("Dashboard generation tests passed");
