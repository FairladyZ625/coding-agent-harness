import fs from "node:fs";
import path from "node:path";
import {
  allowedTaskStates,
  allowedTaskBudgets,
  visualMapFile,
  legacyVisualRoadmapFile,
  lessonCandidatesFile,
  longRunningTaskContractFile,
  taskContractMarker,
  toPosix,
  readFileSafe,
  walkFiles,
  titleFromMarkdown,
} from "./core-shared.mjs";
import {
  tableAfterHeading,
  firstColumn,
  splitList,
  splitDependencies,
  getColumn,
} from "./markdown-utils.mjs";

export const allowedLessonCandidateTaskStatuses = new Set([
  "missing",
  "pending-review",
  "no-candidate-accepted",
  "needs-promotion",
  "promoted",
  "rejected",
]);

export const allowedLessonCandidateRowStatuses = new Set([
  "ready-for-review",
  "needs-promotion",
  "promoted",
  "rejected",
]);

export const reviewCompleteLessonCandidateStatuses = new Set([
  "no-candidate-accepted",
  "needs-promotion",
  "promoted",
  "rejected",
]);

export function parseTaskState(progressContent) {
  return parseTaskStateInfo(progressContent).state;
}

export function parseTaskBudget(taskPlanContent) {
  const match =
    String(taskPlanContent || "").match(/^Selected budget\s*[:：]\s*([^\n]+)/im) ||
    String(taskPlanContent || "").match(/^选择预算\s*[:：]\s*([^\n]+)/im);
  if (!match) return "standard";
  const raw = match[1].replace(/`/g, "").trim().toLowerCase();
  const normalized = raw.replaceAll("_", "-").replace(/\s+/g, "-");
  if (allowedTaskBudgets.has(normalized)) return normalized;
  if (["long-running", "longrunning", "module-parallel"].includes(normalized)) return "complex";
  return "standard";
}

export function parseTaskContractInfo(taskPlanContent) {
  const content = String(taskPlanContent || "");
  const explicit =
    content.match(/^Task Contract\s*[:：]\s*`?([^`\n]+)`?\s*$/im) ||
    content.match(/^任务合同\s*[:：]\s*`?([^`\n]+)`?\s*$/im);
  const version = explicit ? explicit[1].trim() : "";
  return {
    version,
    generated: version === "harness-task/v1" || content.includes(taskContractMarker),
  };
}

export function parseTaskStateInfo(progressContent) {
  const match = progressContent.match(/^##\s*(?:Current Status|Status|状态)\s*[:：]?\s*(?:\n\s*)?([^\n]+)/im);
  if (!match) return inferLegacyTaskState(progressContent);
  const raw = match[1].replace(/`/g, "").trim();
  if (!raw || raw.includes("|") || /^[-*]\s+/.test(raw)) return inferLegacyTaskState(progressContent);
  const aliases = new Map([
    ["进行中", "in_progress"],
    ["已完成", "done"],
    ["未开始", "not_started"],
    ["计划中", "planned"],
    ["审查中", "review"],
    ["已阻塞", "blocked"],
    ["pending", "planned"],
  ]);
  const normalized = aliases.get(raw) || raw.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  return allowedTaskStates.has(normalized)
    ? { state: normalized, source: "explicit", raw }
    : { state: "unknown", source: "invalid", raw };
}

function inferLegacyTaskState(progressContent) {
  const { header, rows } = tableAfterHeading(progressContent, /^(Status|状态)$/i);
  const statusIndex = firstColumn(header, ["Status", "状态"]);
  if (statusIndex < 0 || rows.length === 0) return { state: "unknown", source: "missing", raw: "" };
  const states = rows.map((row) => normalizeLegacyState(row[statusIndex])).filter(Boolean);
  if (states.includes("blocked")) return { state: "blocked", source: "legacy-table", raw: "blocked" };
  if (states.includes("in_progress")) return { state: "in_progress", source: "legacy-table", raw: "in_progress" };
  if (states.includes("review")) return { state: "review", source: "legacy-table", raw: "review" };
  if (states.length > 0 && states.every((state) => state === "done")) return { state: "done", source: "legacy-table", raw: "done" };
  if (states.some((state) => ["planned", "not_started"].includes(state))) return { state: "planned", source: "legacy-table", raw: "planned" };
  return { state: "unknown", source: "missing", raw: "" };
}

function normalizeLegacyState(value) {
  const raw = String(value || "").replace(/`/g, "").trim().toLowerCase();
  if (!raw || /^(none|n\/a|na|-|—|–|无)$/.test(raw)) return "";
  if (/block|阻塞|blocked/.test(raw)) return "blocked";
  if (/in[-_\s]?progress|doing|active|进行中|当前|working/.test(raw)) return "in_progress";
  if (/review|审查|审核|验证中/.test(raw)) return "review";
  if (/done|complete|completed|merged|closed|完成|已完成/.test(raw)) return "done";
  if (/pending|planned|todo|not[-_\s]?started|未开始|计划/.test(raw)) return "planned";
  return "";
}

export function parsePhases(taskPlanContent) {
  const { header, rows } = tableAfterHeading(taskPlanContent, /^Phase ID$/i);
  if (rows.length === 0) return [];
  const indexes = {
    id: firstColumn(header, ["Phase ID", "阶段 ID"]),
    dependsOn: firstColumn(header, ["Depends On", "依赖"]),
    state: firstColumn(header, ["State", "状态"]),
    completion: firstColumn(header, ["Completion", "完成度"]),
    output: firstColumn(header, ["Output", "产出"]),
    requiredEvidence: firstColumn(header, ["Required Evidence", "必要证据"]),
    evidenceStatus: firstColumn(header, ["Evidence Status", "证据状态"]),
    blockingRisk: firstColumn(header, ["Blocking Risk", "阻塞风险"]),
    owner: firstColumn(header, ["Owner / Handoff", "负责人 / 交接"]),
  };
  return rows.map((row) => ({
    id: row[indexes.id] || "",
    dependsOn: splitDependencies(row[indexes.dependsOn] || ""),
    state: row[indexes.state] || "planned",
    completion: Number.parseInt(String(row[indexes.completion] || "0").replace("%", ""), 10) || 0,
    output: row[indexes.output] || "",
    requiredEvidence: splitList(row[indexes.requiredEvidence] || ""),
    evidenceStatus: row[indexes.evidenceStatus] || "missing",
    blockingRisk: row[indexes.blockingRisk] || "",
    owner: row[indexes.owner] || "",
  }));
}

export function readTaskContractFile(taskDir, fileName, legacyContent = "") {
  const filePath = path.join(taskDir, fileName);
  const content = readFileSafe(filePath);
  if (content.trim()) return { path: filePath, content, source: "standalone" };
  return { path: filePath, content: legacyContent, source: legacyContent.trim() ? "legacy" : "missing" };
}

export function readVisualMapContractFile(taskDir, legacyContent = "") {
  const canonicalPath = path.join(taskDir, visualMapFile);
  const canonical = readFileSafe(canonicalPath);
  if (canonical.trim()) return { path: canonicalPath, content: canonical, source: "canonical", status: "present" };
  const legacyPath = path.join(taskDir, legacyVisualRoadmapFile);
  const legacy = readFileSafe(legacyPath);
  if (legacy.trim()) return { path: legacyPath, content: legacy, source: "legacy", status: "legacy-only" };
  return {
    path: canonicalPath,
    content: legacyContent,
    source: legacyContent.trim() ? "legacy" : "missing",
    status: legacyContent.trim() ? "legacy-only" : "missing",
  };
}

export function isActiveTaskState(state) {
  return ["active", "planned", "not_started", "in_progress", "review", "blocked", "reopened", "current-evidence"].includes(state);
}

export function listTaskPlanPaths(target) {
  const taskRoots = [
    path.join(target.docsRoot, "09-PLANNING/TASKS"),
    path.join(target.docsRoot, "09-PLANNING/MODULES"),
  ];
  return taskRoots
    .flatMap(walkFiles)
    .filter((file) => file.endsWith("task_plan.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`));
}

export function taskIdForDirectory(target, taskDir) {
  return toPosix(path.relative(path.join(target.docsRoot, "09-PLANNING"), taskDir));
}

export function inferTaskClassification({ id, title, relative, explicitModule, legacyCandidate = false }) {
  if (explicitModule) {
    return {
      module: explicitModule,
      source: "explicit",
      bucket: "module",
    };
  }
  const text = `${id} ${title} ${relative}`.toLowerCase();
  const rules = [
    ["dashboard", /dashboard|visibility|cockpit|console|ui|frontend|view|页面|看板|驾驶舱/],
    ["migration", /migration|migrate|adoption|legacy|safe-adoption|迁移|历史|兼容/],
    ["task-lifecycle", /task|phase|lifecycle|planning|计划|任务|阶段/],
    ["review-quality", /review|finding|evidence|qa|test|regression|审查|证据|回归|测试/],
    ["release-docs", /docs-release|readme|guide|install|playbook|文档|安装|指南/],
    ["repo-governance", /git|ci|source-package|private|boundary|repo|branch|pr|仓库|边界/],
    ["automation-cli", /cli|command|script|harness\.mjs|自动化|命令/],
  ];
  const match = rules.find(([, pattern]) => pattern.test(text));
  return {
    module: match ? match[0] : legacyCandidate ? "legacy-unclassified" : "unclassified",
    source: match ? "inferred" : "fallback",
    bucket: legacyCandidate ? "legacy" : "current",
  };
}

export function assessBriefQuality(content, { source = "missing" } = {}) {
  const text = String(content || "").trim();
  const issues = [];
  if (source !== "standalone") issues.push("missing-standalone-brief");
  if (text.length < 120) issues.push("too-short");
  if (!/^##\s+/m.test(text)) issues.push("missing-sections");
  if (/\[(?:outcome|scope|risk|evidence|next|目标|范围|风险|证据|下一步)[^\]]*\]/i.test(text)) issues.push("unfilled-placeholder");
  return { status: issues.length ? "fail" : "pass", issues };
}

export function explicitVisualMapStatus(briefContent) {
  const match = String(briefContent || "").match(/^Visual Map Status:\s*(present|not-needed|missing|legacy-only)\s*$/im);
  return match ? match[1] : "";
}

export function taskMigrationClassification(state, visualMapStatus) {
  if (state === "unknown") return "unknown-needs-human";
  if (isActiveTaskState(state)) return "active";
  if (visualMapStatus === "present" || visualMapStatus === "legacy-only") return "historical-with-diagram";
  return "historical-no-map-needed";
}

export function requiresCanonicalVisualMap(task) {
  return ["active", "reopened", "current-evidence", "historical-with-diagram"].includes(task.migrationClassification);
}

export function taskCutoverCounters(tasks) {
  const legacyVisualOnlyCount = tasks.filter((task) => task.visualMapStatus === "legacy-only").length;
  const unknownClassificationCount = tasks.filter((task) => task.migrationClassification === "unknown-needs-human").length;
  const weakBriefCount = tasks.filter((task) => task.briefQuality?.status !== "pass").length;
  const visualMapRequiredCount = tasks.filter(requiresCanonicalVisualMap).length;
  const missingCanonicalVisualMapCount = tasks.filter((task) => requiresCanonicalVisualMap(task) && task.visualMapSource !== "canonical").length;
  return {
    legacyVisualOnlyCount,
    unknownClassificationCount,
    weakBriefCount,
    visualMapRequiredCount,
    missingCanonicalVisualMapCount,
  };
}

export function collectTasks(target) {
  return listTaskPlanPaths(target).map((taskPlanPath) => {
    const taskDir = path.dirname(taskPlanPath);
    const taskPlan = readFileSafe(taskPlanPath);
    const brief = readTaskContractFile(taskDir, "brief.md", "");
    const executionStrategyPath = path.join(taskDir, "execution_strategy.md");
    const progressPath = path.join(taskDir, "progress.md");
    const reviewPath = path.join(taskDir, "review.md");
    const findingsPath = path.join(taskDir, "findings.md");
    const lessonCandidatesPath = path.join(taskDir, lessonCandidatesFile);
    const longRunningContractPath = path.join(taskDir, longRunningTaskContractFile);
    const visualMap = readVisualMapContractFile(taskDir, taskPlan);
    const progress = readFileSafe(progressPath);
    const review = readFileSafe(reviewPath);
    const lessonCandidates = parseLessonCandidateStatus(readFileSafe(lessonCandidatesPath));
    const phases = parsePhases(visualMap.content);
    const completion =
      phases.length > 0
        ? Math.round(
            phases.filter((phase) => phase.state !== "skipped").reduce((sum, phase) => sum + phase.completion, 0) /
              Math.max(1, phases.filter((phase) => phase.state !== "skipped").length),
          )
        : 0;
    const relative = toPosix(path.relative(target.projectRoot, taskDir));
    const id = taskIdForDirectory(target, taskDir);
    const title = titleFromMarkdown(brief.content || taskPlan, path.basename(taskDir));
    const stateInfo = parseTaskStateInfo(progress);
    const budget = parseTaskBudget(taskPlan);
    const taskContract = parseTaskContractInfo(taskPlan);
    const explicitModule = id.startsWith("MODULES/") ? id.split("/")[1] : null;
    const legacyCandidate = brief.source !== "standalone" || visualMap.status === "legacy-only" || !fs.existsSync(executionStrategyPath);
    const classification = inferTaskClassification({ id, title, relative, explicitModule, legacyCandidate });
    const briefVisualStatus = explicitVisualMapStatus(brief.content);
    const visualMapStatus = briefVisualStatus === "not-needed" && visualMap.status === "missing" ? "not-needed" : visualMap.status;
    const risks = collectReviewRisks(review);
    const reviewConfirmation = parseReviewConfirmation(review);
    const reviewStatus = taskReviewStatus({ reviewContent: review, risks, confirmation: reviewConfirmation });
    const closeoutInfo = taskCloseoutInfo(target, taskPlanPath);
    const lifecycleState = deriveLifecycleState({ state: stateInfo.state, reviewStatus, closeoutStatus: closeoutInfo.status });
    const stateConflicts = collectStateConflicts({ state: stateInfo.state, reviewStatus, closeoutStatus: closeoutInfo.status, lifecycleState });
    return {
      id,
      shortId: path.basename(taskDir),
      title,
      path: `TARGET:${relative}`,
      taskPlanPath: `TARGET:${toPosix(path.relative(target.projectRoot, taskPlanPath))}`,
      executionStrategyPath: `TARGET:${toPosix(path.relative(target.projectRoot, executionStrategyPath))}`,
      progressPath: `TARGET:${toPosix(path.relative(target.projectRoot, progressPath))}`,
      reviewPath: `TARGET:${toPosix(path.relative(target.projectRoot, reviewPath))}`,
      findingsPath: `TARGET:${toPosix(path.relative(target.projectRoot, findingsPath))}`,
      module: explicitModule,
      inferredModule: classification.module,
      classificationSource: classification.source,
      classificationBucket: classification.bucket,
      briefSource: brief.source,
      briefPath: `TARGET:${toPosix(path.relative(target.projectRoot, brief.path))}`,
      visualMapSource: visualMap.source,
      visualMapStatus,
      visualMapPath: `TARGET:${toPosix(path.relative(target.projectRoot, visualMap.path))}`,
      legacyVisualRoadmapPresent: fs.existsSync(path.join(taskDir, legacyVisualRoadmapFile)),
      briefQuality: assessBriefQuality(brief.content, { source: brief.source }),
      migrationClassification: taskMigrationClassification(stateInfo.state, visualMapStatus),
      roadmapSource: visualMap.source,
      state: stateInfo.state,
      budget,
      taskContractVersion: taskContract.version,
      taskContractGenerated: taskContract.generated,
      stateSource: stateInfo.source,
      stateRaw: stateInfo.raw,
      lifecycleState,
      reviewStatus,
      reviewConfirmation,
      closeoutStatus: closeoutInfo.status,
      walkthroughPath: closeoutInfo.walkthroughPath ? `TARGET:${closeoutInfo.walkthroughPath}` : "",
      lessonCandidatePath: fs.existsSync(lessonCandidatesPath)
        ? `TARGET:${toPosix(path.relative(target.projectRoot, lessonCandidatesPath))}`
        : "",
      lessonCandidateStatus: lessonCandidates.status,
      lessonCandidateReviewDecision: lessonCandidates.reviewDecision,
      lessonCandidatePromotionState: lessonCandidates.promotionState,
      lessonCandidateCloseoutToken: lessonCandidates.closeoutToken,
      lessonCandidateRowCount: lessonCandidates.rows.length,
      lessonCandidateOpenCount: lessonCandidates.openCount,
      lessonCandidateIssues: lessonCandidates.issues,
      lessonCandidateDecisionComplete: isLessonCandidateDecisionComplete(lessonCandidates),
      longRunningContractPath: fs.existsSync(longRunningContractPath)
        ? `TARGET:${toPosix(path.relative(target.projectRoot, longRunningContractPath))}`
        : "",
      longRunningContractStatus: fs.existsSync(longRunningContractPath) ? "present" : "missing",
      stateConflicts,
      completion,
      phases,
      risks,
      evidence: collectEvidence(progress),
      handoffs: collectHandoffs(progress, title),
      dependencies: [],
    };
  });
}

export function parseLessonCandidateStatus(content) {
  const text = String(content || "");
  if (!text.trim()) {
    return emptyLessonCandidateStatus("missing", ["missing-candidate-file"]);
  }

  const fields = lessonCandidateFields(text);
  const declaredStatus = normalizeLessonCandidateStatus(fields.get("task-level status") || "pending-review");
  const reviewDecision = normalizeCandidateField(fields.get("review decision") || "pending-human-review");
  const promotionState = normalizeCandidateField(fields.get("promotion state") || "not-promoted");
  const closeoutToken = String(fields.get("closeout token") || "pending").trim();
  const rows = lessonCandidateRows(text);
  const issues = [];

  if (!allowedLessonCandidateTaskStatuses.has(declaredStatus)) {
    issues.push(`invalid-task-status:${declaredStatus}`);
  }
  for (const row of rows) {
    if (!allowedLessonCandidateRowStatuses.has(row.status)) issues.push(`invalid-row-status:${row.id || "missing-id"}:${row.status}`);
  }

  const aggregateStatus = aggregateLessonCandidateStatus(rows, declaredStatus);
  if (declaredStatus !== aggregateStatus && declaredStatus !== "missing") {
    issues.push(`status-aggregate-mismatch:${declaredStatus}->${aggregateStatus}`);
  }
  if (aggregateStatus === "no-candidate-accepted" && !noCandidateReason(text)) {
    issues.push("missing-no-candidate-reason");
  }

  return {
    status: aggregateStatus,
    declaredStatus,
    schemaVersion: fields.get("schema version") || "",
    reviewDecision,
    promotionState,
    closeoutToken,
    rows,
    openCount: rows.filter((row) => ["ready-for-review", "needs-promotion"].includes(row.status)).length,
    issues,
  };
}

export function isLessonCandidateDecisionComplete(candidateStatus) {
  if (!candidateStatus || candidateStatus.issues?.length) return false;
  return reviewCompleteLessonCandidateStatuses.has(candidateStatus.status);
}

function emptyLessonCandidateStatus(status, issues = []) {
  return {
    status,
    declaredStatus: status,
    schemaVersion: "",
    reviewDecision: "",
    promotionState: "",
    closeoutToken: "",
    rows: [],
    openCount: 0,
    issues,
  };
}

function lessonCandidateFields(content) {
  const { header, rows } = tableAfterHeading(content, /^Field$/i);
  const fieldIndex = firstColumn(header, ["Field", "字段"]);
  const valueIndex = firstColumn(header, ["Value", "值"]);
  const fields = new Map();
  if (fieldIndex < 0 || valueIndex < 0) return fields;
  for (const row of rows) {
    const key = String(row[fieldIndex] || "").trim().toLowerCase();
    if (key) fields.set(key, String(row[valueIndex] || "").trim());
  }
  return fields;
}

function lessonCandidateRows(content) {
  const { header, rows } = tableAfterHeading(content, /^ID$/i);
  const idIndex = firstColumn(header, ["ID", "候选 ID"]);
  const statusIndex = firstColumn(header, ["Row Status", "行状态", "Status", "状态"]);
  const titleIndex = firstColumn(header, ["Title", "标题"]);
  const decisionIndex = firstColumn(header, ["Review Decision", "审查决定"]);
  const targetIndex = firstColumn(header, ["Promotion Target", "沉淀目标"]);
  if (idIndex < 0 || statusIndex < 0) return [];
  return rows
    .filter((row) => /^LC-[A-Za-z0-9-]+$/i.test(row[idIndex] || ""))
    .map((row) => ({
      id: row[idIndex] || "",
      status: normalizeLessonCandidateStatus(row[statusIndex] || ""),
      title: row[titleIndex] || "",
      reviewDecision: row[decisionIndex] || "",
      promotionTarget: row[targetIndex] || "",
    }));
}

function normalizeLessonCandidateStatus(value) {
  return String(value || "")
    .replace(/`/g, "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, "-");
}

function normalizeCandidateField(value) {
  return String(value || "").replace(/`/g, "").trim().toLowerCase().replaceAll("_", "-").replace(/\s+/g, "-");
}

function aggregateLessonCandidateStatus(rows, declaredStatus) {
  if (rows.length === 0) return declaredStatus === "no-candidate-accepted" ? "no-candidate-accepted" : declaredStatus;
  const statuses = rows.map((row) => row.status);
  if (statuses.includes("ready-for-review")) return "pending-review";
  if (statuses.includes("needs-promotion")) return "needs-promotion";
  if (statuses.every((status) => status === "promoted")) return "promoted";
  if (statuses.every((status) => status === "rejected")) return "rejected";
  if (statuses.every((status) => ["promoted", "rejected"].includes(status))) return "promoted";
  return declaredStatus;
}

function noCandidateReason(content) {
  const lines = String(content || "").split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s*No-Candidate Reason\s*$/i.test(line.trim()));
  if (start < 0) return "";
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break;
    body.push(line);
  }
  return body.join("\n").replace(/`/g, "").trim();
}


function taskCloseoutInfo(target, taskPlanPath) {
  const closeout = readFileSafe(path.join(target.docsRoot, "10-WALKTHROUGH/Closeout-SSoT.md"));
  if (!closeout.trim()) return { status: "missing", walkthroughPath: "" };
  const docsRelative = `docs/${toPosix(path.relative(target.docsRoot, taskPlanPath))}`;
  const projectRelative = toPosix(path.relative(target.projectRoot, taskPlanPath));
  const line = closeout
    .split(/\r?\n/)
    .find((entry) => entry.includes(docsRelative) || entry.includes(projectRelative));
  if (!line) return { status: "missing", walkthroughPath: "" };
  const walkthroughPath = extractWalkthroughPath(target, line);
  const status = /\b(closed|complete|completed|done|skipped-with-reason|skipped|已关闭|已完成|跳过)\b/i.test(line) ? "closed" : "pending";
  return { status, walkthroughPath };
}

function extractWalkthroughPath(target, closeoutLine) {
  const matches = [...String(closeoutLine || "").matchAll(/`?((?:docs\/)?10-WALKTHROUGH\/[^`|\s]+\.md)`?/g)];
  const match = matches.find((entry) => !entry[1].endsWith("Closeout-SSoT.md") && !entry[1].includes("/_"));
  if (!match) return "";
  const projectRelative = match[1].startsWith("docs/") ? match[1] : `docs/${match[1]}`;
  if (!fs.existsSync(path.join(target.projectRoot, projectRelative))) return "";
  return projectRelative;
}

export function parseReviewConfirmation(reviewContent) {
  const match = String(reviewContent || "").match(/^##\s*(?:Human Review Confirmation|人工审查确认)\s*$([\s\S]*?)(?=^##\s+|\s*$)/im);
  if (!match) return null;
  const block = match[1] || "";
  const timeMatch = block.match(/\|\s*(\d{4}-\d{2}-\d{2}[^|]*)\|/);
  const reviewerMatch = block.match(/Reviewer\s*[:：]\s*([^\n]+)/i) || block.match(/审查人\s*[:：]\s*([^\n]+)/);
  return {
    confirmed: true,
    confirmedAt: timeMatch ? timeMatch[1].trim() : "",
    reviewer: reviewerMatch ? reviewerMatch[1].trim() : "",
  };
}

export function taskReviewStatus({ reviewContent = "", risks = [], confirmation = null } = {}) {
  if (risks.some(isBlockingReviewRisk)) return "blocked-open-findings";
  if (confirmation?.confirmed) return "confirmed";
  if (!String(reviewContent || "").trim()) return "missing";
  if (/Verdict\s*[:：]\s*yes/i.test(reviewContent) || /本轮已检查|未发现阻塞目标的重要发现/.test(reviewContent)) return "reviewed-unconfirmed";
  return "required";
}

export function isBlockingReviewRisk(risk) {
  return /^P[0-2]$/i.test(risk?.severity || "") && (risk.open || risk.blocksRelease);
}

export function deriveLifecycleState({ state = "unknown", reviewStatus = "missing", closeoutStatus = "missing" } = {}) {
  if (closeoutStatus === "closed") return "closed";
  if (state === "blocked") return "blocked";
  if (reviewStatus === "blocked-open-findings") return "review-blocked";
  if (state === "done") return "closing";
  if (state === "review") return "in_review";
  if (state === "in_progress") return "active";
  if (["planned", "not_started"].includes(state)) return "ready";
  return "unknown";
}

function collectStateConflicts({ state, reviewStatus, closeoutStatus, lifecycleState }) {
  const conflicts = [];
  if (state === "done" && closeoutStatus !== "closed") {
    conflicts.push({
      code: "done-without-closeout",
      severity: "warn",
      message: "Task state is done, but closeout is still missing or pending.",
    });
  }
  if (reviewStatus === "blocked-open-findings") {
    conflicts.push({
      code: "review-blocked-open-findings",
      severity: "block",
      message: "Open P0-P2 review findings block human review confirmation.",
    });
  }
  if (lifecycleState === "closed" && reviewStatus === "blocked-open-findings") {
    conflicts.push({
      code: "closed-with-blocking-review",
      severity: "block",
      message: "Closeout is closed while review findings still block release.",
    });
  }
  return conflicts;
}

function collectHandoffs(progressContent, taskId) {
  if (!/Coordinator Handoff/i.test(progressContent) || !/pending-coordinator-pass/i.test(progressContent)) return [];
  return [{ id: `H-${taskId}`, from: "worker", to: "coordinator", state: "pending", summary: "Coordinator handoff pending" }];
}

export function collectReviewRisks(reviewContent) {
  const { header, rows } = tableAfterHeading(reviewContent, /^ID$/i);
  const severityIndex = getColumn(header, "Severity");
  const findingIndex = getColumn(header, "Finding");
  const openIndex = getColumn(header, "Open");
  const blocksIndex = getColumn(header, "Blocks Release");
  if (severityIndex < 0 || findingIndex < 0) return [];
  return rows
    .filter((row) => /^P[0-3]$/i.test(row[severityIndex] || ""))
    .map((row) => ({
      id: row[0],
      severity: row[severityIndex],
      open: /^yes$/i.test(row[openIndex] || "no"),
      blocksRelease: /^yes$/i.test(row[blocksIndex] || "no"),
      summary: row[findingIndex],
    }));
}

function collectEvidence(progressContent) {
  const matches = [...progressContent.matchAll(/\b(command|diff|fixture|screenshot|review|report):((?:PUBLIC|PRIVATE|TARGET|EXTERNAL|URL):[^:\s|]+):([^\n|]+)/g)];
  return matches.map((match, index) => ({
    id: `E-${String(index + 1).padStart(3, "0")}`,
    type: match[1],
    path: match[2],
    status: "present",
    summary: match[3].trim(),
  }));
}
