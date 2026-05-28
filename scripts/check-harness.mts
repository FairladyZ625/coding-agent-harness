#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { checkModuleParallelStructure } from "./lib/check-module-parallel.mjs";

const targetRoot = path.resolve(process.argv[2] || process.cwd());
const requireGlobalModuleSync = process.env.HARNESS_REQUIRE_GLOBAL_MODULE_SYNC === "1";

const requiredFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  "docs/Harness-Ledger.md",
  "docs/11-REFERENCE/testing-standard.md",
  "docs/11-REFERENCE/execution-workflow-standard.md",
  "docs/11-REFERENCE/repo-governance-standard.md",
  "docs/11-REFERENCE/ci-cd-standard.md",
  "docs/11-REFERENCE/long-running-task-standard.md",
  "docs/11-REFERENCE/adversarial-review-standard.md",
  "docs/11-REFERENCE/review-routing-standard.md",
  "docs/11-REFERENCE/docs-library-standard.md",
  "docs/11-REFERENCE/harness-ledger-standard.md",
  "docs/10-WALKTHROUGH/_walkthrough-template.md",
  "docs/10-WALKTHROUGH/Closeout-SSoT.md",
  "docs/05-TEST-QA/Regression-SSoT.md",
  "docs/05-TEST-QA/Cadence-Ledger.md",
];

const legacyPlanningFiles = [
  "docs/09-PLANNING/TASKS/_task-template/task_plan.md",
  "docs/09-PLANNING/TASKS/_task-template/findings.md",
  "docs/09-PLANNING/TASKS/_task-template/progress.md",
  "docs/09-PLANNING/TASKS/_task-template/review.md",
  "docs/09-PLANNING/TASKS/_task-template/long-running-task-contract.md",
];

const agAgentsRefs = [
  "repo-governance-standard.md",
  "ci-cd-standard.md",
  "execution-workflow-standard.md",
  "adversarial-review-standard.md",
  "review-routing-standard.md",
  "walkthrough-standard.md",
  "harness-ledger-standard.md",
  "Closeout-SSoT.md",
];

const forbiddenTemplatePatterns = [
  /\[如有[^\]]*\]/,
  /\[[^\]]*(根据项目|框架名|目标覆盖率|列出关键|示例)[^\]]*\]/,
  /\[TODO\]/i,
  /\bTODO\b/,
  /\bTBD\b/i,
  /\[command\]/,
  /\[workflow path\]/,
  /\[owner\/repo or URL\]/,
];

const statusWords = ["designed", "implemented", "verified", "blocked-with-owner"];
const closedLedgerStatuses = new Set(["closed", "closed-with-residual", "closed-local-only"]);
const allowedWalkthroughSkip =
  /walkthrough skipped-with-reason:\s*(docs-only|no-runtime|superseded|historical-backfill|owner-deferred)/i;
const lessonsCreatedPattern = /checked-created:\s*(L-\d{4}-\d{2}-\d{2}-\d{3}|L-\d+)/i;
const lessonsNonePattern = /checked-none:\s*\S+/i;
const lessonsCandidatePattern = /checked-candidate:\s*(LC-[A-Za-z0-9-]+)/i;
const lessonsQueuedPromotionPattern = /queued-promotion:\s*(LC-[A-Za-z0-9-]+)/i;

type MarkdownRow = string[];
type ContentTerm = string | RegExp;

const failures: string[] = [];
const warnings: string[] = [];

function rel(file: string): string {
  return file.split(path.sep).join("/");
}

function filePath(relativePath: string): string {
  return path.join(targetRoot, relativePath);
}

function exists(relativePath: string): boolean {
  return fs.existsSync(filePath(relativePath));
}

function read(relativePath: string): string {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function fail(message: string) {
  failures.push(message);
}

function warn(message: string) {
  warnings.push(message);
}

function requireFile(relativePath: string): boolean {
  if (!exists(relativePath)) {
    fail(`missing required file: ${relativePath}`);
    return false;
  }
  return true;
}

function checkRequiredFiles() {
  for (const requiredFile of requiredFiles) {
    requireFile(requiredFile);
  }
}

function checkPlanningStructure() {
  if (exists("docs/09-PLANNING/Module-Registry.md")) {
    checkModuleParallelStructure({
      exists,
      fail,
      filePath,
      markdownTable,
      read,
      rel,
      requireFile,
      requireGlobalModuleSync,
      targetRoot,
      warn,
    });
    return;
  }
  for (const legacyFile of legacyPlanningFiles) {
    requireFile(legacyFile);
  }
}

function checkAgentsIndex() {
  if (!exists("AGENTS.md")) return;
  const content = read("AGENTS.md");
  for (const ref of agAgentsRefs) {
    if (!content.includes(ref)) {
      fail(`AGENTS.md does not route to ${ref}`);
    }
  }
  if (exists("docs/11-REFERENCE/delivery-operating-model-standard.md") && !content.includes("delivery-operating-model-standard.md")) {
    fail("AGENTS.md does not route to delivery-operating-model-standard.md");
  }
  if (exists("docs/09-PLANNING/Module-Registry.md")) {
    for (const ref of ["Module-Registry.md", "Session-Prompt-Pack.md"]) {
      if (!content.includes(ref)) {
        fail(`AGENTS.md does not route to ${ref}`);
      }
    }
    if (!/Subagent|worker/i.test(content) || !/worktree/i.test(content) || !/commit SHA|commit/i.test(content)) {
      fail("AGENTS.md does not define subagent worker worktree/commit handoff rule");
    }
  }
}

function checkNoGenericPlaceholders(relativePath: string, { allowTemplates = false }: { allowTemplates?: boolean } = {}) {
  if (!exists(relativePath)) return;
  const content = read(relativePath);
  if (allowTemplates) return;
  for (const pattern of forbiddenTemplatePatterns) {
    if (pattern.test(content)) {
      fail(`${relativePath} still contains generic placeholder matching ${pattern}`);
    }
  }
}

function checkGovernanceContent() {
  const governancePath = "docs/11-REFERENCE/repo-governance-standard.md";
  if (!exists(governancePath)) return;
  const content = read(governancePath);
  const requiredTerms = [
    ["Repo Platform Profile", "仓库平台画像"],
    ["Branch Model", "分支模型"],
    ["PR Policy", "PR 规则"],
    ["Required Checks", "必要检查"],
    ["Branch Protection", "分支保护"],
    ["Worktree Concurrency", "Worktree 并发"],
  ];
  for (const terms of requiredTerms) {
    if (!contentIncludesAny(content, terms)) fail(`${governancePath} missing section: ${terms[0]}`);
  }
  if (!statusWords.some((status) => content.includes(status))) {
    fail(`${governancePath} does not use evidence status model`);
  }
  checkNoGenericPlaceholders(governancePath);
}

function checkCiCdContent() {
  const ciPath = "docs/11-REFERENCE/ci-cd-standard.md";
  if (!exists(ciPath)) return;
  const content = read(ciPath);
  const requiredTerms = [
    ["CI Profile", "CI 画像"],
    ["Workflow", "工作流"],
    ["Required Checks", "必要检查"],
    ["Evidence Status", "证据状态"],
  ];
  for (const terms of requiredTerms) {
    if (!contentIncludesAny(content, terms)) fail(`${ciPath} missing section: ${terms[0]}`);
  }
  if (!statusWords.some((status) => content.includes(status))) {
    fail(`${ciPath} does not use evidence status model`);
  }
  checkNoGenericPlaceholders(ciPath);
}

function checkDeliveryOperatingModelContent() {
  const deliveryPath = "docs/11-REFERENCE/delivery-operating-model-standard.md";
  if (!exists(deliveryPath)) return;
  const content = read(deliveryPath);
  const normalized = content.toLowerCase();
  const requiredTerms = [
    ["operating model profile", "运行模型"],
    ["work decomposition rule", "工作拆分规则"],
    ["agent visibility", "agent 可见性"],
    ["integration owner", "集成 owner"],
    ["delivery ssot", "交付 ssot"],
  ];
  for (const terms of requiredTerms) {
    if (!contentIncludesAny(normalized, terms.map((term) => term.toLowerCase()))) fail(`${deliveryPath} missing section: ${terms[0]}`);
  }
  if (!/solo-orchestrator|team-feature-lead|split-repo-contract|program-multi-repo|waterfall-stage-gate|kanban-continuous/.test(content)) {
    fail(`${deliveryPath} does not define a recognized operating model`);
  }
  checkNoGenericPlaceholders(deliveryPath);
}

function checkPrTemplateOrResidual() {
  const templateCandidates = [
    ".github/pull_request_template.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".gitlab/merge_request_templates/default.md",
  ];
  if (templateCandidates.some((candidate) => exists(candidate))) return;
  if (exists("docs/11-REFERENCE/repo-governance-standard.md")) {
    const content = read("docs/11-REFERENCE/repo-governance-standard.md");
    if (/PR template/i.test(content) && /blocked-with-owner|manual setup residual|manual-setup-residual/i.test(content)) {
      warn("PR template missing, but repo governance records residual");
      return;
    }
  }
  fail("missing PR template or explicit blocked-with-owner residual");
}

function checkWorkflowOrResidual() {
  const workflowDir = filePath(".github/workflows");
  const hasGitHubWorkflow =
    fs.existsSync(workflowDir) &&
    fs.readdirSync(workflowDir).some((name) => /\.(ya?ml)$/i.test(name));
  if (hasGitHubWorkflow) return;
  if (exists("docs/11-REFERENCE/ci-cd-standard.md")) {
    const content = read("docs/11-REFERENCE/ci-cd-standard.md");
    if (/blocked-with-owner|unsupported checks|residual/i.test(content)) {
      warn("CI workflow missing, but CI/CD standard records residual");
      return;
    }
  }
  fail("missing CI workflow or explicit blocked-with-owner residual");
}

function checkReviewTemplate() {
  const reviewPath = "docs/09-PLANNING/TASKS/_task-template/review.md";
  if (!exists(reviewPath)) return;
  const content = read(reviewPath);
  if (!contentIncludesAny(content, ["Confidence Challenge", "信心挑战"])) {
    fail(`${reviewPath} missing Confidence Challenge`);
  }
  if (/\|\s*R-001\s*\|\s*P[01]\s*\|.*\|\s*open\s*\|/i.test(content)) {
    fail(`${reviewPath} ships with an open P0/P1 example finding`);
  }
}

function checkHarnessLedger() {
  if (!exists("docs/Harness-Ledger.md")) return;
  const content = read("docs/Harness-Ledger.md");
  if (!/Repo Governance|CI\/CD|ci-cd|repo-governance/i.test(content)) {
    fail("docs/Harness-Ledger.md does not mention repo governance / CI-CD update status");
  }
}

function markdownTableRows(content: string, idPattern: RegExp): MarkdownRow[] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length > 0 && idPattern.test(cells[0] || ""));
}

function markdownTable(content: string): MarkdownRow[] {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function findHeaderIndex(rows: MarkdownRow[], pattern: RegExp): number {
  return rows.findIndex((cells) => cells.some((cell) => pattern.test(cell)));
}

function contentIncludesAny(content: string, terms: readonly ContentTerm[]): boolean {
  return terms.some((term) => (term instanceof RegExp ? term.test(content) : content.includes(term)));
}

function columnIndexAny(header: MarkdownRow, patterns: readonly RegExp[]): number {
  return header.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)));
}

function checkDuplicateIds(rows: MarkdownRow[], sourcePath: string) {
  const seen = new Set();
  for (const cells of rows) {
    const id = cells[0];
    if (seen.has(id)) {
      fail(`${sourcePath} contains duplicate closeout id: ${id}`);
    }
    seen.add(id);
  }
}

function checkCloseoutSsot() {
  const closeoutPath = "docs/10-WALKTHROUGH/Closeout-SSoT.md";
  if (!exists(closeoutPath)) return;

  const closeoutContent = read(closeoutPath);
  for (const terms of [["Walkthrough"], ["Lessons Check", "Lessons 检查"], ["Closeout Status", "收口状态"]]) {
    if (!contentIncludesAny(closeoutContent, terms)) {
      fail(`${closeoutPath} missing required closeout column or section: ${terms[0]}`);
    }
  }
  checkNoGenericPlaceholders(closeoutPath);

  const closeoutTable = markdownTable(closeoutContent);
  const closeoutHeaderIndex = findHeaderIndex(closeoutTable, /^Harness ID$/i);
  const closeoutHeader = closeoutHeaderIndex >= 0 ? closeoutTable[closeoutHeaderIndex] : [];
  const lessonsColumn = columnIndexAny(closeoutHeader, [/^Lessons Check$/i, /^Lessons 检查$/i, /^Lessons 检查\s*\/\s*Lessons Check$/i]);
  if (lessonsColumn < 0) {
    fail(`${closeoutPath} missing Lessons Check column`);
  }

  if (!exists("docs/Harness-Ledger.md")) return;
  const ledgerContent = read("docs/Harness-Ledger.md");
  const lessonIds = collectLessonIds();
  const lessonCandidateIds = collectLessonCandidateIds();
  const ledgerTable = markdownTable(ledgerContent);
  const ledgerHeaderIndex = findHeaderIndex(ledgerTable, /^ID$/i);
  const ledgerHeader = ledgerHeaderIndex >= 0 ? ledgerTable[ledgerHeaderIndex] : [];
  const ledgerLessonsColumn = columnIndexAny(ledgerHeader, [/^Lessons Check$/i, /^Lessons 检查$/i, /^Lessons 检查\s*\/\s*Lessons Check$/i]);
  if (ledgerLessonsColumn < 0) {
    fail("docs/Harness-Ledger.md missing Lessons Check column");
  }
  const ledgerRows = markdownTableRows(ledgerContent, /^H-\d+/i);
  const closeoutTableRows = markdownTableRows(closeoutContent, /^H-\d+/i);
  checkDuplicateIds(ledgerRows, "docs/Harness-Ledger.md");
  checkDuplicateIds(closeoutTableRows, closeoutPath);
  const closeoutRows = new Map(closeoutTableRows.map((cells) => [cells[0], cells]));

  for (const cells of ledgerRows) {
    const id = cells[0];
    const status = (cells[cells.length - 1] || "").toLowerCase();
    if (!closedLedgerStatuses.has(status)) continue;

    const closeout = closeoutRows.get(id);
    if (!closeout) {
      fail(`${closeoutPath} missing row for closed Harness Ledger item ${id}`);
      continue;
    }

    const joined = closeout.join(" ");
    const hasWalkthrough = /docs\/10-WALKTHROUGH\/[^|\s]+\.md/.test(joined);
    const hasAllowedSkip = allowedWalkthroughSkip.test(joined);
    if (!hasWalkthrough && !hasAllowedSkip) {
      fail(`${closeoutPath} row ${id} needs walkthrough path or allowed skipped-with-reason`);
    }

    if (lessonsColumn >= 0) {
      const lessonsCheck = closeout[lessonsColumn] || "";
      const createdMatch = lessonsCheck.match(lessonsCreatedPattern);
      const candidateMatch = lessonsCheck.match(lessonsCandidatePattern) || lessonsCheck.match(lessonsQueuedPromotionPattern);
      if (!createdMatch && !candidateMatch && !lessonsNonePattern.test(lessonsCheck)) {
        fail(`${closeoutPath} row ${id} needs Lessons Check value: checked-created:<lesson-id>, checked-candidate:<candidate-id>, queued-promotion:<candidate-id>, or checked-none:<reason>`);
      } else if (createdMatch && !lessonIds.has(createdMatch[1])) {
        fail(`${closeoutPath} row ${id} references missing lesson detail doc id: ${createdMatch[1]}`);
      } else if (candidateMatch && !lessonCandidateIds.has(candidateMatch[1])) {
        fail(`${closeoutPath} row ${id} references missing lesson candidate id: ${candidateMatch[1]}`);
      }
    }

    if (ledgerLessonsColumn >= 0) {
      const ledgerLessonsCheck = cells[ledgerLessonsColumn] || "";
      const ledgerCreatedMatch = ledgerLessonsCheck.match(lessonsCreatedPattern);
      const ledgerCandidateMatch = ledgerLessonsCheck.match(lessonsCandidatePattern) || ledgerLessonsCheck.match(lessonsQueuedPromotionPattern);
      if (!ledgerCreatedMatch && !ledgerCandidateMatch && !lessonsNonePattern.test(ledgerLessonsCheck)) {
        fail(`docs/Harness-Ledger.md row ${id} needs Lessons Check value: checked-created:<lesson-id>, checked-candidate:<candidate-id>, queued-promotion:<candidate-id>, or checked-none:<reason>`);
      } else if (ledgerCreatedMatch && !lessonIds.has(ledgerCreatedMatch[1])) {
        fail(`docs/Harness-Ledger.md row ${id} references missing lesson detail doc id: ${ledgerCreatedMatch[1]}`);
      } else if (ledgerCandidateMatch && !lessonCandidateIds.has(ledgerCandidateMatch[1])) {
        fail(`docs/Harness-Ledger.md row ${id} references missing lesson candidate id: ${ledgerCandidateMatch[1]}`);
      }
    }
  }
}

function collectLessonIds(): Set<string> {
  const root = filePath("docs/01-GOVERNANCE/lessons");
  const ids = new Set<string>();
  if (!fs.existsSync(root)) return ids;
  for (const entry of fs.readdirSync(root)) {
    if (!entry.endsWith(".md")) continue;
    const full = path.join(root, entry);
    if (!fs.statSync(full).isFile()) continue;
    const content = fs.readFileSync(full, "utf8");
    const pathMatch = entry.match(/(L-\d{4}(?:-\d{2}-\d{2})?-\d+)/i);
    const titleMatch = content.match(/#\s*(L-\d{4}(?:-\d{2}-\d{2})?-\d+)/i);
    const id = titleMatch?.[1] || pathMatch?.[1];
    if (id) ids.add(id);
  }
  return ids;
}

function collectLessonCandidateIds(): Set<string> {
  const root = filePath("docs/09-PLANNING");
  const ids = new Set<string>();
  if (!fs.existsSync(root)) return ids;
  function visit(dir: string) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (entry === "_archive") continue;
        visit(full);
        continue;
      }
      if (entry !== "lesson_candidates.md") continue;
      const content = fs.readFileSync(full, "utf8");
      for (const match of content.matchAll(/\|\s*(LC-[A-Za-z0-9-]+)\s*\|/g)) {
        ids.add(match[1]);
      }
    }
  }
  visit(root);
  return ids;
}

function checkLessonDetailDocs() {
  const root = filePath("docs/01-GOVERNANCE/lessons");
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root)) {
    if (!entry.endsWith(".md")) continue;
    const relativePath = `docs/01-GOVERNANCE/lessons/${entry}`;
    const content = read(relativePath);
    const id = entry.match(/(L-\d{4}(?:-\d{2}-\d{2})?-\d+)/i)?.[1];
    if (id && !content.includes(id)) {
      fail(`${relativePath} does not include lesson id ${id}`);
    }
  }
}

function checkWalkthroughTemplate() {
  const walkthroughTemplate = "docs/10-WALKTHROUGH/_walkthrough-template.md";
  if (!exists(walkthroughTemplate)) return;
  const content = read(walkthroughTemplate);
  if (!contentIncludesAny(content, ["Lessons Reflection", "Lessons 回看"])) {
    fail(`${walkthroughTemplate} missing Lessons Reflection section`);
  }
}

function checkReferencePlaceholders() {
  const refDir = filePath("docs/11-REFERENCE");
  if (!fs.existsSync(refDir)) return;
  for (const entry of fs.readdirSync(refDir)) {
    const full = path.join(refDir, entry);
    if (!fs.statSync(full).isFile() || !entry.endsWith(".md")) continue;
    checkNoGenericPlaceholders(rel(path.relative(targetRoot, full)));
  }
}

function main() {
  if (!fs.existsSync(targetRoot)) {
    console.error(`Target path does not exist: ${targetRoot}`);
    process.exit(2);
  }

  checkRequiredFiles();
  checkPlanningStructure();
  checkAgentsIndex();
  checkGovernanceContent();
  checkCiCdContent();
  checkDeliveryOperatingModelContent();
  checkPrTemplateOrResidual();
  checkWorkflowOrResidual();
  checkReviewTemplate();
  checkHarnessLedger();
  checkCloseoutSsot();
  checkLessonDetailDocs();
  checkWalkthroughTemplate();
  checkReferencePlaceholders();

  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) console.log(`- ${warning}`);
  }

  if (failures.length > 0) {
    console.error("Harness check failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Harness check passed: ${targetRoot}`);
}

main();
