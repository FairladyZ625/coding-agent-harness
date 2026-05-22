#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

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
  "docs/01-GOVERNANCE/Lessons-SSoT.md",
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
  "Lessons-SSoT.md",
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

const failures = [];
const warnings = [];

function rel(file) {
  return file.split(path.sep).join("/");
}

function filePath(relativePath) {
  return path.join(targetRoot, relativePath);
}

function exists(relativePath) {
  return fs.existsSync(filePath(relativePath));
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), "utf8");
}

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function requireFile(relativePath) {
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
    checkModuleParallelStructure();
    return;
  }
  for (const legacyFile of legacyPlanningFiles) {
    requireFile(legacyFile);
  }
}

function stripMarkdownCode(value) {
  return String(value || "").replace(/`/g, "").trim();
}

function modulePromptBlock(content, key) {
  const heading = `## Module: ${key}`;
  const start = content.indexOf(heading);
  if (start < 0) return "";
  const rest = content.slice(start + heading.length);
  const next = rest.search(/\n## Module: /);
  return next >= 0 ? rest.slice(0, next) : rest;
}

function checkModuleParallelStructure() {
  if (!exists("docs/09-PLANNING/Module-Registry.md")) return;

  requireFile("docs/09-PLANNING/MODULES/Session-Prompt-Pack.md");
  const hasPromptPack = exists("docs/09-PLANNING/MODULES/Session-Prompt-Pack.md");
  for (const templateFile of [
    "docs/09-PLANNING/MODULES/_task-template/task_plan.md",
    "docs/09-PLANNING/MODULES/_task-template/progress.md",
    "docs/09-PLANNING/MODULES/_task-template/findings.md",
    "docs/09-PLANNING/MODULES/_task-template/review.md",
  ]) {
    requireFile(templateFile);
  }

  const registryContent = read("docs/09-PLANNING/Module-Registry.md");
  for (const term of ["PREFIX", "Current Step", "Status", "Write Scope"]) {
    if (!registryContent.includes(term)) {
      fail(`docs/09-PLANNING/Module-Registry.md missing registry column or section: ${term}`);
    }
  }

  const registryRows = markdownTable(registryContent)
    .filter((cells) => cells.length >= 6)
    .filter((cells) => /^(_shared|[a-z][a-z0-9-]*)$/.test(cells[0] || "") && /^[A-Z]{2,5}$/.test(cells[2] || ""));

  if (registryRows.length === 0) {
    fail("docs/09-PLANNING/Module-Registry.md has no active module rows");
  }

  const promptPack = hasPromptPack ? read("docs/09-PLANNING/MODULES/Session-Prompt-Pack.md") : "";
  if (hasPromptPack && !/Subagent Worker Invariant|worker[\s\S]{0,120}worktree[\s\S]{0,120}commit SHA/i.test(promptPack)) {
    fail("docs/09-PLANNING/MODULES/Session-Prompt-Pack.md missing subagent worker worktree/commit handoff rule");
  }
  for (const cells of registryRows) {
    const [key, , prefix, branch, currentStep, status] = cells;
    requireFile(`docs/09-PLANNING/MODULES/${key}/module_plan.md`);
    if (!/^(planned|in-progress|paused|completed)$/.test(status)) {
      fail(`docs/09-PLANNING/Module-Registry.md row ${key} has invalid status: ${status}`);
    }
    if (currentStep !== `${prefix}-00` && !currentStep.startsWith(`${prefix}-`)) {
      fail(`docs/09-PLANNING/Module-Registry.md row ${key} current step does not match prefix ${prefix}: ${currentStep}`);
    }
    const branchName = stripMarkdownCode(branch);
    if (!branchName.startsWith("codex/")) {
      fail(`docs/09-PLANNING/Module-Registry.md row ${key} branch must use codex/ prefix: ${branch}`);
    }

    const block = modulePromptBlock(promptPack, key);
    if (!block) {
      if (!exists(`docs/09-PLANNING/MODULES/${key}/session_prompt.md`)) {
        fail(`missing module session prompt for ${key}`);
      }
      continue;
    }
    for (const term of [
      "Current Step",
      branchName,
      "Preflight:",
      "Before code edits:",
      "Write scope:",
      "Forbidden without coordination:",
      "Shared Coordination:",
      "Verification:",
      "Closeout:",
      "Stop conditions:",
    ]) {
      if (!block.includes(term)) {
        fail(`module session prompt for ${key} missing required term: ${term}`);
      }
    }
  }
  checkModuleTaskSsotIndex(registryRows);
}

function checkModuleTaskSsotIndex(registryRows) {
  const registryByModule = new Map(registryRows.map((cells) => [cells[0], cells]));
  const ledgerContent = exists("docs/Harness-Ledger.md") ? read("docs/Harness-Ledger.md") : "";
  const taskPlans = listModuleTaskPlans();

  for (const taskPlanPath of taskPlans) {
    const parsed = parseModuleTaskPath(taskPlanPath);
    if (!parsed) continue;
    const { moduleKey, taskDir } = parsed;
    const modulePlanPath = `docs/09-PLANNING/MODULES/${moduleKey}/module_plan.md`;
    if (!exists(modulePlanPath)) continue;

    const taskPlan = read(taskPlanPath);
    const taskProgress = readTaskProgress(taskPlanPath);
    const taskProgressStatus = readTaskProgressStatus(taskPlanPath);
    const taskIsActive = isActiveModuleTaskStatus(taskProgressStatus);
    const stepId = extractStepId(taskPlan, taskDir);
    if (!stepId) {
      if (taskIsActive) {
        fail(`${taskPlanPath} does not expose a Step ID and task directory does not start with <PREFIX-NN>`);
      }
      continue;
    }

    const modulePlan = read(modulePlanPath);
    const moduleRelativeTaskPlan = `TASKS/${taskDir}/task_plan.md`;
    if (!modulePlan.includes(stepId) || !modulePlan.includes(moduleRelativeTaskPlan)) {
      fail(`${modulePlanPath} does not index ${stepId} task plan ${moduleRelativeTaskPlan}`);
    }

    if (!taskIsActive) continue;

    const registryRow = registryByModule.get(moduleKey);
    const reviewPath = taskPlanPath.replace(/task_plan\.md$/, "review.md");
    const registrySynced = Boolean(registryRow && registryRow[4] === stepId);
    const ledgerSynced = ledgerContent.includes(taskPlanPath) && (!exists(reviewPath) || ledgerContent.includes(reviewPath));
    if (registrySynced && ledgerSynced) continue;

    if (requireGlobalModuleSync) {
      if (!registryRow) {
        fail(`docs/09-PLANNING/Module-Registry.md does not include active module ${moduleKey} for ${taskPlanPath}`);
      } else if (registryRow[4] !== stepId) {
        fail(`docs/09-PLANNING/Module-Registry.md row ${moduleKey} current step is ${registryRow[4]}, but active task is ${stepId}`);
      }
      if (!ledgerContent.includes(taskPlanPath)) {
        fail(`docs/Harness-Ledger.md does not index active module task plan ${taskPlanPath}`);
      }
      if (exists(reviewPath) && !ledgerContent.includes(reviewPath)) {
        fail(`docs/Harness-Ledger.md does not index active module review ${reviewPath}`);
      }
      continue;
    }

    if (hasPendingCoordinatorHandoff(taskPlan, taskProgress)) {
      warn(`${taskPlanPath} has pending coordinator handoff; run coordinator pass before final integration or set HARNESS_REQUIRE_GLOBAL_MODULE_SYNC=1 for strict gate`);
      continue;
    }
    fail(`${taskPlanPath} is active but is neither globally synced nor marked with Coordinator Handoff: pending-coordinator-pass`);
  }
}

function listModuleTaskPlans() {
  const modulesRoot = filePath("docs/09-PLANNING/MODULES");
  if (!fs.existsSync(modulesRoot)) return [];
  const results = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const relativePath = rel(path.relative(targetRoot, full));
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if (relativePath.includes("/_archive/") || relativePath.endsWith("/_task-template")) continue;
        walk(full);
      } else if (/\/TASKS\/[^/]+\/task_plan\.md$/.test(relativePath)) {
        results.push(relativePath);
      }
    }
  }
  walk(modulesRoot);
  return results;
}

function parseModuleTaskPath(taskPlanPath) {
  const match = taskPlanPath.match(/^docs\/09-PLANNING\/MODULES\/([^/]+)\/TASKS\/([^/]+)\/task_plan\.md$/);
  if (!match) return null;
  return { moduleKey: match[1], taskDir: match[2] };
}

function extractStepId(taskPlanContent, taskDir) {
  const fromPlan = taskPlanContent.match(/^- Step ID:\s*`?([A-Z]{2,5}-\d{2})`?/m);
  if (fromPlan) return fromPlan[1];
  const fromModuleSection = taskPlanContent.match(/^- Step:\s*`?([A-Z]{2,5}-\d{2})`?/m);
  if (fromModuleSection) return fromModuleSection[1];
  const fromDir = taskDir.match(/^([A-Z]{2,5}-\d{2})-/);
  return fromDir ? fromDir[1] : "";
}

function readTaskProgress(taskPlanPath) {
  const progressPath = taskPlanPath.replace(/task_plan\.md$/, "progress.md");
  return exists(progressPath) ? read(progressPath) : "";
}

function readTaskProgressStatus(taskPlanPath) {
  const progress = readTaskProgress(taskPlanPath);
  if (!progress) return "";
  const match = progress.match(/^##\s*(?:Status|状态)\s*[:：]?\s*(?:\n\s*)?([^\n]+)/im);
  return match ? normalizeModuleTaskStatus(stripMarkdownCode(match[1])) : "";
}

function normalizeModuleTaskStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  const aliases = new Map([
    ["未开始", "not-started"],
    ["未启动", "not-started"],
    ["进行中", "in-progress"],
    ["开发中", "in-progress"],
    ["规划审查", "planning-review"],
    ["已完成", "completed"],
    ["完成", "completed"],
    ["已关闭", "closed"],
    ["关闭", "closed"],
    ["已阻塞", "blocked"],
    ["阻塞", "blocked"],
  ]);
  return aliases.get(value) || value;
}

function isActiveModuleTaskStatus(status) {
  if (!status) return false;
  return !new Set([
    "not-started",
    "blocked-not-started",
    "complete",
    "completed",
    "closed",
    "closed-with-residual",
    "closed-local-only",
    "superseded",
  ]).has(status);
}

function hasPendingCoordinatorHandoff(taskPlanContent, progressContent) {
  const combined = `${taskPlanContent}\n${progressContent}`;
  return /Coordinator Handoff/i.test(combined) && /pending-coordinator-pass/i.test(combined);
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

function checkNoGenericPlaceholders(relativePath, { allowTemplates = false } = {}) {
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

function markdownTableRows(content, idPattern) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => cells.length > 0 && idPattern.test(cells[0] || ""));
}

function markdownTable(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function findHeaderIndex(rows, pattern) {
  return rows.findIndex((cells) => cells.some((cell) => pattern.test(cell)));
}

function columnIndex(header, pattern) {
  return header.findIndex((cell) => pattern.test(cell));
}

function contentIncludesAny(content, terms) {
  return terms.some((term) => (term instanceof RegExp ? term.test(content) : content.includes(term)));
}

function columnIndexAny(header, patterns) {
  return header.findIndex((cell) => patterns.some((pattern) => pattern.test(cell)));
}

function checkDuplicateIds(rows, sourcePath) {
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
        fail(`${closeoutPath} row ${id} references missing Lessons SSoT id: ${createdMatch[1]}`);
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
        fail(`docs/Harness-Ledger.md row ${id} references missing Lessons SSoT id: ${ledgerCreatedMatch[1]}`);
      } else if (ledgerCandidateMatch && !lessonCandidateIds.has(ledgerCandidateMatch[1])) {
        fail(`docs/Harness-Ledger.md row ${id} references missing lesson candidate id: ${ledgerCandidateMatch[1]}`);
      }
    }
  }
}

function collectLessonIds() {
  const lessonsPath = "docs/01-GOVERNANCE/Lessons-SSoT.md";
  if (!exists(lessonsPath)) return new Set();
  const table = markdownTable(read(lessonsPath));
  const headerIndex = findHeaderIndex(table, /^ID$/i);
  const header = headerIndex >= 0 ? table[headerIndex] : [];
  const idColumn = columnIndex(header, /^ID$/i);
  if (idColumn < 0) return new Set();
  return new Set(
    table
      .map((cells) => cells[idColumn] || "")
      .filter((id) => /^L-\d{4}(-\d{2}-\d{2})?-\d+/i.test(id)),
  );
}

function collectLessonCandidateIds() {
  const root = filePath("docs/09-PLANNING");
  const ids = new Set();
  if (!fs.existsSync(root)) return ids;
  function visit(dir) {
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

function checkLessonsSsot() {
  const lessonsPath = "docs/01-GOVERNANCE/Lessons-SSoT.md";
  if (!exists(lessonsPath)) return;

  const content = read(lessonsPath);
  if (!contentIncludesAny(content, [/Detail Doc/i, "详情文档"])) {
    fail(`${lessonsPath} missing Detail Doc column`);
  }

  const table = markdownTable(content);
  const headerIndex = findHeaderIndex(table, /^ID$/i);
  const header = headerIndex >= 0 ? table[headerIndex] : [];
  const detailColumn = columnIndexAny(header, [/^(Detail Doc|Detail)$/i, /^详情文档$/i, /^详情文档\s*\/\s*Detail Doc$/i]);
  const idColumn = columnIndex(header, /^ID$/i);
  const statusColumn = columnIndexAny(header, [/^Status$/i, /^状态$/i, /^状态\s*\/\s*Status$/i]);
  if (idColumn < 0) fail(`${lessonsPath} missing ID column`);
  if (detailColumn < 0) fail(`${lessonsPath} missing Detail Doc column`);
  if (statusColumn < 0) fail(`${lessonsPath} missing Status column`);
  if (idColumn < 0 || detailColumn < 0 || statusColumn < 0) return;

  const lessonRows = table.filter((cells) => /^L-\d{4}(-\d{2}-\d{2})?-\d+/i.test(cells[idColumn] || ""));
  for (const cells of lessonRows) {
    const id = cells[idColumn] || "";
    const status = cells[statusColumn] || "";
    const detail = cells[detailColumn] || "";
    if (!/pending|approved|merged|rejected|superseded|🟡|🟢|✅|❌|🔀/i.test(status)) {
      fail(`${lessonsPath} row ${id} has unrecognized status: ${status}`);
    }
    const detailMatch = detail.match(/docs\/01-GOVERNANCE\/lessons\/[^|\s`]+\.md/);
    if (!detailMatch) {
      fail(`${lessonsPath} row ${id} Detail Doc must point to docs/01-GOVERNANCE/lessons/*.md`);
      continue;
    }
    const detailPath = detailMatch[0];
    if (!exists(detailPath)) {
      fail(`${lessonsPath} row ${id} Detail Doc missing file: ${detailPath}`);
      continue;
    }
    const detailContent = read(detailPath);
    if (!detailContent.includes(id)) {
      fail(`${detailPath} does not include lesson id ${id}`);
    }
    for (const requiredTerm of ["背景", "冲突声明"]) {
      if (!detailContent.includes(requiredTerm)) {
        fail(`${detailPath} missing required lesson section: ${requiredTerm}`);
      }
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
  checkLessonsSsot();
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
