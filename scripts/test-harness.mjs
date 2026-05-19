#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
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

expectPass(["check", "--profile", "source-package", "."]);
if (fs.existsSync(path.join(repoRoot, ".harness-private"))) {
  expectPass(["check", "--profile", "private-harness", ".harness-private"]);
}

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
assert(dashboardHtml.includes("Evidence"), "dashboard HTML missing evidence section");
assert(dashboardHtml.includes("Recent Activity"), "dashboard HTML missing recent activity section");

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
assert(folderStatus.tasks[0].roadmapSource === "standalone", "folder status should use standalone visual_roadmap.md");
const documents = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/documents.json"), "utf8"));
assert(documents.documents.some((doc) => doc.path.endsWith("execution_strategy.md")), "documents missing execution strategy");
assert(documents.documents.some((doc) => doc.path.endsWith("visual_roadmap.md")), "documents missing visual roadmap");
const tables = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/tables.json"), "utf8"));
assert(tables.tables.some((table) => table.kind === "harness-ledger"), "documents missing harness ledger table");
assert(JSON.stringify(tables).includes("alpha|beta"), "markdown table parser should preserve escaped pipes");
const graph = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/graph.json"), "utf8"));
assert(graph.edges.length > 0, "graph should include task/phase edges");
assertGraphIntegrity(graph, "example graph");
const dashboardApp = fs.readFileSync(path.join(dashboardDir, "assets/app.js"), "utf8");
const dashboardMarkdown = fs.readFileSync(path.join(dashboardDir, "assets/markdown-reader.js"), "utf8");
const dashboardMermaid = fs.readFileSync(path.join(dashboardDir, "assets/mermaid-renderer.js"), "utf8");
assert(dashboardApp.includes("data-render-mode"), "dashboard missing render/source toggle");
assert(dashboardApp.includes("escapeHtml(pageTitle())"), "dashboard page title must be escaped");
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

const zhInitTarget = path.join(tmpRoot, "zh-init-target");
fs.mkdirSync(zhInitTarget);
expectPass(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", zhInitTarget]);
const zhRegistry = JSON.parse(fs.readFileSync(path.join(zhInitTarget, ".harness-capabilities.json"), "utf8"));
assert(zhRegistry.locale === "zh-CN", "init should persist zh-CN locale");
assert(fs.readFileSync(path.join(zhInitTarget, "AGENTS.md"), "utf8").includes("项目概况"), "zh-CN init should write Chinese AGENTS.md");
const zhReviewTemplate = fs.readFileSync(path.join(zhInitTarget, "docs/09-PLANNING/TASKS/_task-template/review.md"), "utf8");
assert(zhReviewTemplate.includes("| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |"), "zh-CN review template should preserve checker table headers");
const zhDashboardDir = path.join(tmpRoot, "zh-dashboard");
expectPass(["dashboard", "--out-dir", zhDashboardDir, zhInitTarget]);
const zhDashboardIndex = fs.readFileSync(path.join(zhDashboardDir, "index.html"), "utf8");
const zhDashboardApp = fs.readFileSync(path.join(zhDashboardDir, "assets/app.js"), "utf8");
assert(zhDashboardIndex.includes("Harness 控制台"), "zh-CN dashboard should use localized index template");
assert(zhDashboardApp.includes("项目驾驶舱"), "zh-CN dashboard should use localized app template");

const enRunTarget = path.join(tmpRoot, "en-run-target");
fs.mkdirSync(enRunTarget);
const enRun = expectJson(["init", "--dry-run", "--locale", "en-US", "--capabilities", "core", enRunTarget]);
assert(enRun.locale === "en-US", "init dry-run did not preserve en-US locale");
assert(
  enRun.changes.some((change) => change.source === "templates/planning/task_plan.md"),
  "init en-US dry-run should use default English task_plan template",
);

const capTarget = path.join(tmpRoot, "cap-target");
fs.mkdirSync(capTarget);
expectPass(["add-capability", "dashboard", capTarget]);
const registry = JSON.parse(fs.readFileSync(path.join(capTarget, ".harness-capabilities.json"), "utf8"));
assert(registry.locale === "en-US", "add-capability registry missing default locale");
assert(registry.capabilities.some((capability) => capability.name === "dashboard"), "add-capability missing dashboard");
assert(registry.capabilities.some((capability) => capability.name === "core"), "add-capability missing dependency core");

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
