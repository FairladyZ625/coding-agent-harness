#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const packageVersion = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version;
const node = process.execPath;
const cli = path.join(repoRoot, "scripts/harness.mjs");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-v1-"));
const chineseCharacterPattern = /\p{Script=Han}/u;
const brokenMechanicalTemplatePattern = /\bfill in(?:[A-Z]|\w)|(?:[a-z])fill in\b|TODO/;
const staleDispositionPattern = /\b((?:open\s*\/\s*)?fixed\s*\/\s*accepted\s*\/\s*deferred\s*\/\s*n\/a|accepted[- ]residuals?|accepted\s+(?:with|as)\s+residual|accepted\s+by\s+owner|accepted\s+waiver)\b/i;
const sampleOpenFindingPattern = /^\|\s*(?:F|R|SR|V|RR|HL)-\d+\s*\|.*\|\s*(?:open|yes\s*\|\s*open|yes\s*\/\s*no\s*\|\s*open)\s*\|?\s*$/im;
const englishFirstZhHeadingPattern = /^#{1,6}\s+(?:Reviewer Identity|Confidence Challenge|Material Findings|Non-Material Notes|Evidence Checked|Final Confidence Basis|Follow-Up Routing|Phase Graph|Phase Table|Context Packet|Artifact Index|Stop Condition|Pause Conditions|Deliverables|Module Session Prompt|Subagent\s*\/\s*Worker|Coordinator|Worktree|Slice ID|Parent Phase|Inputs|Verifier\b|Harness\b|Closeout\b|Lessons\b)/m;
const zhMechanicalEnglishWorkflowPattern = /^\s*\d+\.\s*(?:implement|run locally|self-review|rerun evidence)\b/im;
const zhMechanicalEvidencePhrasePattern = /\b(?:local smoke|browser or UI inspection|live environment smoke|reviewer findings|PR checks\s*\/\s*workflow run)\b/i;

function run(args, options = {}) {
  const result = spawnSync(node, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectPass(args) {
  const result = run(args);
  assert(result.status === 0, `${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function expectJson(args) {
  const result = expectPass(args);
  return JSON.parse(result.stdout);
}

function commandExists(command) {
  const result = spawnSync(command, ["-v"], { encoding: "utf8" });
  return !result.error && result.status === 0;
}

function runInTty(args, options = {}) {
  const input = options.input || "";
  const timeout = options.timeout;
  const expectLines = [
    `set timeout ${Math.ceil((timeout || 5000) / 1000)}`,
    `spawn ${[node, cli, ...args].map(tclWord).join(" ")}`,
  ];
  if (input) {
    expectLines.push("expect -re {Language \\[1/2}");
    expectLines.push(`send -- ${tclWord(input.replace(/\n/g, "\r"))}`);
  }
  expectLines.push("expect eof");
  expectLines.push("catch wait result");
  expectLines.push("exit [lindex $result 3]");
  return spawnSync("expect", ["-c", expectLines.join("\n")], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout,
  });
}

function expectTtyJson(args, options = {}) {
  const result = runInTty(args, options);
  assert(result.status === 0, `tty ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return parseJsonFromOutput(result.stdout);
}

function parseJsonFromOutput(output) {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  assert(start >= 0 && end > start, `output did not contain JSON\n${output}`);
  return JSON.parse(output.slice(start, end + 1));
}

function tclWord(value) {
  return `{${String(value).replace(/\\/g, "\\\\").replace(/}/g, "\\}")}}`;
}

const skillContent = fs.readFileSync(path.join(repoRoot, "SKILL.md"), "utf8");
assert(!skillContent.includes("Historical 12-Phase Bootstrap"), "SKILL.md should not carry the legacy 12-phase reference body");
assert(
  skillContent.includes("references/legacy-12-phase-bootstrap.md"),
  "SKILL.md should route legacy bootstrap details to the reference document",
);
assert(
  fs.readFileSync(path.join(repoRoot, "references/legacy-12-phase-bootstrap.md"), "utf8").includes("Historical 12-Phase Bootstrap"),
  "legacy 12-phase bootstrap reference should exist",
);

expectPass(["check", "--profile", "source-package", "."]);
if (fs.existsSync(path.join(repoRoot, ".harness-private"))) {
  expectPass(["check", "--profile", "private-harness", ".harness-private"]);
}

const sourceBoundaryTarget = path.join(tmpRoot, "source-boundary-target");
fs.mkdirSync(path.join(sourceBoundaryTarget, "scripts"), { recursive: true });
fs.mkdirSync(path.join(sourceBoundaryTarget, "templates/planning"), { recursive: true });
fs.mkdirSync(path.join(sourceBoundaryTarget, "docs/private"), { recursive: true });
fs.mkdirSync(path.join(sourceBoundaryTarget, ".harness-private"), { recursive: true });
fs.writeFileSync(path.join(sourceBoundaryTarget, "package.json"), "{}\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "scripts/harness.mjs"), "#!/usr/bin/env node\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "scripts/check-harness.mjs"), "#!/usr/bin/env node\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "templates/planning/task_plan.md"), "# Task\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "AGENTS.md"), "# Local only\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "docs/private/plan.md"), "# Private\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, ".harness-private/AGENTS.md"), "# Private harness\n");
spawnSync("git", ["init"], { cwd: sourceBoundaryTarget, encoding: "utf8" });
spawnSync("git", ["add", "-f", "AGENTS.md", "docs/private/plan.md", ".harness-private/AGENTS.md"], { cwd: sourceBoundaryTarget, encoding: "utf8" });
const sourceBoundaryCheck = run(["check", "--profile", "source-package", sourceBoundaryTarget]);
assert(sourceBoundaryCheck.status !== 0, "source-package check should reject staged local-only harness files");
assert(sourceBoundaryCheck.stderr.includes("private local-only file staged: AGENTS.md"), "source-package check should report staged AGENTS.md");
assert(sourceBoundaryCheck.stderr.includes("private local-only file staged: docs/private/plan.md"), "source-package check should report staged docs/");
assert(sourceBoundaryCheck.stderr.includes("private local-only file staged: .harness-private/AGENTS.md"), "source-package check should report staged .harness-private/");

const englishTemplateFiles = relativeFiles(path.join(repoRoot, "templates"));
const chineseTemplateFiles = relativeFiles(path.join(repoRoot, "templates-zh-CN"));
assert(englishTemplateFiles.length > 0, "templates/ should contain English templates");
assert(chineseTemplateFiles.length > 0, "templates-zh-CN/ should contain Chinese templates");
assert(
  JSON.stringify(englishTemplateFiles) === JSON.stringify(chineseTemplateFiles),
  "templates/ and templates-zh-CN/ should expose the same template file set",
);
for (const relativeFile of englishTemplateFiles) {
  const content = fs.readFileSync(path.join(repoRoot, "templates", relativeFile), "utf8");
  assert(!chineseCharacterPattern.test(content), `English template contains Chinese text: ${relativeFile}`);
  assert(!brokenMechanicalTemplatePattern.test(content), `English template contains mechanical placeholder text: ${relativeFile}`);
  assert(!staleDispositionPattern.test(content), `English template contains stale disposition vocabulary: ${relativeFile}`);
  assert(!sampleOpenFindingPattern.test(content), `English template contains a real open sample finding row: ${relativeFile}`);
}
assert(
  fs.readFileSync(path.join(repoRoot, "templates-zh-CN", "AGENTS.md.template"), "utf8").includes("项目概况"),
  "templates-zh-CN should provide Chinese AGENTS.md content",
);
for (const relativeFile of chineseTemplateFiles) {
  const content = fs.readFileSync(path.join(repoRoot, "templates-zh-CN", relativeFile), "utf8");
  assert(!brokenMechanicalTemplatePattern.test(content), `Chinese template contains mechanical placeholder text: ${relativeFile}`);
  assert(!staleDispositionPattern.test(content), `Chinese template contains stale disposition vocabulary: ${relativeFile}`);
  assert(!sampleOpenFindingPattern.test(content), `Chinese template contains a real open sample finding row: ${relativeFile}`);
  assert(!englishFirstZhHeadingPattern.test(content), `Chinese template contains English-first review heading: ${relativeFile}`);
  assert(!zhMechanicalEnglishWorkflowPattern.test(content), `Chinese template contains unlocalized workflow phrase: ${relativeFile}`);
  assert(!zhMechanicalEvidencePhrasePattern.test(content), `Chinese template contains unlocalized evidence phrase: ${relativeFile}`);
}

const exampleStatus = expectJson(["status", "--json", "examples/minimal-project"]);
assert(exampleStatus.project.name === "minimal-project", "example status project name mismatch");
assert(Array.isArray(exampleStatus.tasks), "example status missing tasks array");
assert(exampleStatus.tasks[0].state === "in_progress", "task state was not normalized");
assert(Array.isArray(exampleStatus.tasks[0].phases[0].requiredEvidence), "requiredEvidence must be an array");
assert(exampleStatus.capabilities.some((capability) => capability.name === "core"), "example status missing core capability");

const dashboardPath = path.join(tmpRoot, "dashboard.html");
expectPass(["dashboard", "--out", dashboardPath, "examples/minimal-project"]);
assert(fs.existsSync(dashboardPath), "dashboard file was not created");
const dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
assert(dashboardHtml.includes("Harness Dashboard"), "dashboard HTML missing title");
assert(dashboardHtml.includes("window.__HARNESS_DASHBOARD__"), "dashboard HTML missing inline data bundle");
assert(dashboardHtml.includes("Human Visibility Dashboard"), "dashboard HTML missing v2 visibility copy");
assert(dashboardHtml.includes("#/tasks"), "dashboard HTML missing task index route");

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
const tables = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/tables.json"), "utf8"));
assert(tables.tables.some((table) => table.kind === "harness-ledger"), "documents missing harness ledger table");
assert(JSON.stringify(tables).includes("alpha|beta"), "markdown table parser should preserve escaped pipes");
const graph = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/graph.json"), "utf8"));
assert(graph.edges.length > 0, "graph should include task/phase edges");
assertGraphIntegrity(graph, "example graph");
const dashboardApp = fs.readFileSync(path.join(dashboardDir, "assets/app.js"), "utf8");
const dashboardMarkdown = fs.readFileSync(path.join(dashboardDir, "assets/markdown-reader.js"), "utf8");
const dashboardMermaid = fs.readFileSync(path.join(dashboardDir, "assets/mermaid-renderer.js"), "utf8");
assert(dashboardApp.includes("hashchange"), "dashboard should use hash routing");
assert(dashboardApp.includes("taskDetail("), "dashboard should implement task detail route");
assert(dashboardApp.includes("data-render-toggle"), "dashboard missing render/source toggle");
assert(dashboardApp.includes("data-search"), "dashboard missing task search control");
assert(dashboardApp.includes("taskGroupsPerPage"), "dashboard missing global task group paging");
assert(dashboardApp.includes("taskStatsBar"), "dashboard missing task stats bar");
assert(dashboardApp.includes("task-row-card"), "dashboard missing upgraded task row card");
assert(dashboardApp.includes("fullCutoverEligible"), "dashboard missing full cutover summary field");
assert(dashboardApp.includes("legacyVisualOnlyCount"), "dashboard missing legacy visual-only summary field");
assert(dashboardApp.includes("weakBriefCount"), "dashboard missing weak brief summary field");
assert(dashboardApp.includes("warningQueue()"), "dashboard missing warning queue workbench");
assert(dashboardApp.includes("migrationRunwayBreakdown"), "dashboard missing aggregate migration runway drilldown");
assert(dashboardApp.includes("[\"brief\", \"brief.md\"]"), "dashboard should make brief.md the first task detail tab");
assert(dashboardApp.includes("[\"visualMap\", \"visual_map.md\"]"), "dashboard should expose canonical visual_map.md tab");
assert(dashboardApp.includes("projectMermaid"), "dashboard should render project flow from graph data");
assert(dashboardApp.includes("escapeHtml(projectName())"), "dashboard project title must be escaped");
assert(dashboardMarkdown.includes("rendered-table"), "dashboard missing rendered markdown table support");
assert(dashboardMermaid.includes("mermaid-rendered"), "dashboard missing rendered mermaid output");
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

const dryRunTarget = path.join(tmpRoot, "dry-run-target");
fs.mkdirSync(dryRunTarget);
const dryRun = expectJson(["init", "--dry-run", "--locale", "zh-CN", "--capabilities", "core,dashboard", dryRunTarget]);
assert(dryRun.dryRun === true, "init dry-run did not report dryRun true");
assert(dryRun.locale === "zh-CN", "init dry-run did not preserve zh-CN locale");
assert(!dryRun.changes.some((change) => change.destination.startsWith("docs/11-REFERENCE/")), "init scaffold should not mechanically copy reference standards");
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
const zhRegistry = JSON.parse(fs.readFileSync(path.join(zhInitTarget, ".harness-capabilities.json"), "utf8"));
assert(zhRegistry.locale === "zh-CN", "init should persist zh-CN locale");
assert(fs.readFileSync(path.join(zhInitTarget, "AGENTS.md"), "utf8").includes("项目概况"), "zh-CN init should write Chinese AGENTS.md");
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
const enInitStatus = expectJson(["status", "--json", enInitTarget]);
assert(enInitStatus.checkState.status === "pass", "en-US core+dashboard init should pass status check");
assert(enInitStatus.checkState.warnings === 0, "en-US core+dashboard init should not warn about safe-adoption");

const lifecycleTarget = path.join(tmpRoot, "lifecycle-target");
fs.mkdirSync(lifecycleTarget);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", lifecycleTarget]);
const lifecycleDryRun = expectJson(["new-task", "phase-2-lifecycle", "--title", "阶段二任务生命周期", "--locale", "zh-CN", "--dry-run", lifecycleTarget]);
assert(lifecycleDryRun.dryRun === true, "new-task dry-run should report dryRun true");
assert(
  lifecycleDryRun.changes.some((change) => change.destination.endsWith("brief.md") && change.action === "would-create"),
  "new-task dry-run should plan brief.md",
);
assert(!fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/TASKS/phase-2-lifecycle")), "new-task dry-run should not mutate target");
const lifecycleCreate = expectJson(["new-task", "phase-2-lifecycle", "--title", "阶段二任务生命周期", "--locale", "zh-CN", lifecycleTarget]);
assert(lifecycleCreate.task?.shortId === "phase-2-lifecycle", "new-task should report normalized short task id");
assert(lifecycleCreate.task?.id === "TASKS/phase-2-lifecycle", "new-task should report relative task id");
for (const required of ["brief.md", "task_plan.md", "execution_strategy.md", "visual_map.md", "findings.md", "progress.md", "review.md"]) {
  assert(
    fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/TASKS/phase-2-lifecycle", required)),
    `new-task should create ${required}`,
  );
}
assert(
  fs.readFileSync(path.join(lifecycleTarget, "docs/09-PLANNING/TASKS/phase-2-lifecycle/brief.md"), "utf8").includes("阶段二任务生命周期"),
  "new-task should render the requested title into brief.md",
);
const duplicateLifecycle = run(["new-task", "phase-2-lifecycle", "--title", "duplicate", lifecycleTarget]);
assert(duplicateLifecycle.status !== 0, "new-task should refuse to overwrite an existing task directory");
expectJson(["task-start", "phase-2-lifecycle", "--message", "开始实现生命周期切片", lifecycleTarget]);
expectJson(["task-log", "phase-2-lifecycle", "--message", "补齐 CLI 与模板", "--evidence", "command:TARGET:npm-test:passed", lifecycleTarget]);
const lifecycleBlocked = expectJson(["task-block", "phase-2-lifecycle", "--message", "等待旧项目迁移验证", lifecycleTarget]);
assert(lifecycleBlocked.task?.state === "blocked", "task-block should report blocked state");
const lifecyclePhase = expectJson(["task-phase", "phase-2-lifecycle", "PH-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
assert(lifecyclePhase.task?.phases?.some((phase) => phase.id === "PH-01" && phase.state === "done" && phase.completion === 100), "task-phase should update visual map row");
assert(
  fs.readFileSync(path.join(lifecycleTarget, "docs/09-PLANNING/TASKS/phase-2-lifecycle/visual_map.md"), "utf8").includes("Visual Map Contract: v1.0"),
  "new-task should render canonical visual map contract",
);
expectJson(["task-phase", "phase-2-lifecycle", "PH-01", "--state", "done", "--completion", "100", "--evidence", "present", lifecycleTarget]);
const missingPhase = run(["task-phase", "phase-2-lifecycle", "NO_SUCH_PHASE", "--state", "done", lifecycleTarget]);
assert(missingPhase.status !== 0, "task-phase should fail for unknown phase id");
assert(missingPhase.stderr.includes("Phase not found"), "task-phase unknown phase should explain missing phase");
const lifecycleComplete = expectJson(["task-complete", "phase-2-lifecycle", "--message", "生命周期闭环完成", lifecycleTarget]);
assert(lifecycleComplete.task?.state === "done", "task-complete should report done state");
const lifecycleTasks = expectJson(["task-list", "--json", lifecycleTarget]);
assert(lifecycleTasks.tasks.some((task) => task.id === "TASKS/phase-2-lifecycle" && task.state === "done"), "task-list should include completed task");
const doneLifecycleTasks = expectJson(["task-list", "--json", "--state", "done", lifecycleTarget]);
assert(doneLifecycleTasks.tasks.every((task) => task.state === "done"), "task-list --state should filter states");
const lifecycleStatus = expectJson(["status", "--json", lifecycleTarget]);
assert(lifecycleStatus.schemaVersion === 2, "status should expose dashboard schemaVersion 2");
const lifecycleTask = lifecycleStatus.tasks.find((task) => task.id === "TASKS/phase-2-lifecycle");
assert(lifecycleTask?.briefSource === "standalone", "status should expose standalone task brief");
assert(lifecycleTask?.briefPath?.endsWith("/brief.md"), "status should expose the task brief path");
assert(lifecycleTask?.classificationBucket === "current", "new v1 tasks should not be classified as legacy");
assert(lifecycleStatus.summary?.briefCoverage?.missing === 0, "status should expose explicit brief coverage summary");
assert(lifecycleTask?.state === "done", "status should read lifecycle task state from progress.md");
assert(lifecycleTask?.evidence?.some((item) => item.summary.includes("passed")), "status should collect task-log evidence");
const moduleLifecycle = expectJson(["new-task", "module-lifecycle", "--module", "auth", "--budget", "complex", "--title", "模块生命周期", "--locale", "zh-CN", lifecycleTarget]);
assert(moduleLifecycle.task?.id === "MODULES/auth/module-lifecycle", "new-task --module should create a module task id");
assert(fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/module-lifecycle/references/INDEX.md")), "complex module task should create references index");
assert(fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/module-lifecycle/artifacts/INDEX.md")), "complex module task should create artifacts index");
assert(fs.existsSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/brief.md")), "new-task --module should create a module brief when missing");
fs.writeFileSync(
  path.join(lifecycleTarget, "docs/09-PLANNING/Module-Registry.md"),
  "# Module Registry\n\n## Active Modules\n\n| ID | Module | Path Scope | Owner | Status | Branch or Worktree | Task Plan | Shared Files | Depends On | Handoff Evidence | Residual | Updated |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| M-AUTH | Auth | src/auth/** | coordinator | reserved | n/a | docs/09-PLANNING/MODULES/auth/module_plan.md | none | none | pending | none | 2026-05-19 |\n",
);
fs.writeFileSync(
  path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/module_plan.md"),
  "# Auth Module Plan\n\n## Steps\n\n| Step ID | Name | Status | Task Plan | Depends On |\n| --- | --- | --- | --- | --- |\n| AUTH-01 | Setup | planned | docs/09-PLANNING/MODULES/auth/module-lifecycle/task_plan.md | none |\n",
);
const moduleStep = expectJson(["module-step", "auth", "AUTH-01", "--state", "done", lifecycleTarget]);
assert(moduleStep.moduleKey === "auth" && moduleStep.stepId === "AUTH-01", "module-step should report updated module step");
assert(fs.readFileSync(path.join(lifecycleTarget, "docs/09-PLANNING/MODULES/auth/module_plan.md"), "utf8").includes("| AUTH-01 | Setup | done |"), "module-step should update module_plan status");
assert(fs.readFileSync(path.join(lifecycleTarget, "docs/09-PLANNING/Module-Registry.md"), "utf8").includes("| M-AUTH | Auth | src/auth/** | coordinator | merged |"), "module-step should update module registry status when done");
expectJson(["module-step", "auth", "AUTH-01", "--state", "done", lifecycleTarget]);
const missingModuleStep = run(["module-step", "auth", "NO_SUCH_STEP", "--state", "done", lifecycleTarget]);
assert(missingModuleStep.status !== 0, "module-step should fail for unknown step id");
assert(missingModuleStep.stderr.includes("Module step not found"), "module-step unknown step should explain missing step");

const zhRegistryTarget = path.join(tmpRoot, "zh-module-registry-target");
fs.mkdirSync(zhRegistryTarget);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,module-parallel", zhRegistryTarget]);
expectJson(["new-task", "zh-task", "--module", "example", "--title", "中文模块任务", "--locale", "zh-CN", zhRegistryTarget]);
fs.mkdirSync(path.join(zhRegistryTarget, "docs/09-PLANNING/MODULES/example"), { recursive: true });
fs.writeFileSync(
  path.join(zhRegistryTarget, "docs/09-PLANNING/MODULES/example/module_plan.md"),
  "# 示例模块计划\n\n## 步骤\n\n| 步骤 ID | 名称 | 状态 | 任务计划 | 依赖 |\n| --- | --- | --- | --- | --- |\n| EXM-01 | 启动 | planned | docs/09-PLANNING/MODULES/example/zh-task/task_plan.md | none |\n",
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
assert(moduleFiltered.tasks.length === 1 && moduleFiltered.tasks[0].id === "MODULES/auth/module-lifecycle", "task-list --module should filter module tasks");
expectJson(["new-task", "module-lifecycle", "--title", "同名根任务", "--locale", "zh-CN", lifecycleTarget]);
const ambiguousTask = run(["task-start", "module-lifecycle", "--message", "ambiguous", lifecycleTarget]);
assert(ambiguousTask.status !== 0, "ambiguous task short name should fail");
assert(ambiguousTask.stderr.includes("Ambiguous task reference"), "ambiguous task error should explain ambiguity");
assert(ambiguousTask.stderr.includes("TASKS/module-lifecycle") && ambiguousTask.stderr.includes("MODULES/auth/module-lifecycle"), "ambiguous task error should list candidate task paths");

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

console.log("Harness v1 tests passed");

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

function relativeFiles(root) {
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else {
        results.push(toPosix(path.relative(root, full)));
      }
    }
  }
  walk(root);
  return results.sort();
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}
