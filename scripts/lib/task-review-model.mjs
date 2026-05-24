import fs from "node:fs";
import path from "node:path";
import {
  lessonCandidatesFile,
  longRunningTaskContractFile,
  toPosix,
  visualMapFile,
} from "./core-shared.mjs";
import {
  firstColumn,
  splitList,
  splitMarkdownRow,
  tableAfterHeading,
} from "./markdown-utils.mjs";
import { validateReviewConfirmationGitAudit } from "./review-confirm-git-gate.mjs";
import { isLessonCandidateDecisionComplete } from "./task-lesson-candidates.mjs";

export const taskScannerVersion = "task-scanner/2026-05-23-lifecycle-queues";
export const reviewFindingColumns = {
  severity: ["Severity", "严重级别", "优先级"],
  finding: ["Finding", "发现"],
  open: ["Open", "是否开放"],
  blocksRelease: ["Blocks Release", "是否阻塞发布", "阻塞发布", "阻塞确认"],
  disposition: ["Disposition", "处置", "处理结论"],
  waiverBy: ["Waiver By", "豁免人"],
};

export function normalizeReviewBoolean(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (/^(yes|true|open|是|开放)$/.test(raw)) return "yes";
  if (/^(no|false|closed|fixed|done|否|关闭|已关闭|已修复)$/.test(raw)) return "no";
  return raw;
}

function parseMetadataLine(content, labels) {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = String(content || "").match(new RegExp(`^(?:${escaped})\\s*[:：]\\s*([^\\n]+)`, "im"));
  return match ? match[1].replace(/`/g, "").trim() : "";
}

function normalizeMetadataValue(value, fallback = "") {
  const normalized = String(value || "")
    .replace(/`/g, "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, "-");
  return normalized || fallback;
}

export function parseTaskIdentity(taskPlanContent, fallbackTaskId) {
  const taskKey =
    parseMetadataLine(taskPlanContent, ["Task Key", "任务主键"]) ||
    parseMetadataLine(taskPlanContent, ["Task ID", "任务 ID"]) ||
    fallbackTaskId;
  return {
    taskKey,
    identitySource: taskKey && taskKey !== fallbackTaskId ? "explicit" : "path-derived-legacy",
  };
}

export function parseTaskTombstone(taskPlanContent) {
  const topLevelSupersedes = splitList(parseMetadataLine(taskPlanContent, ["Supersedes", "合并自"]));
  const match = String(taskPlanContent || "").match(/^##\s*(?:Task Tombstone|任务墓碑)\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/im);
  const fields = match ? fieldsFromMarkdownBlock(match[1] || "") : new Map();
  if (fields.size === 0) {
    return {
      deletionState: "active",
      supersededBy: "",
      supersedes: topLevelSupersedes,
      deleteReason: "",
      hiddenByDefault: false,
      reopenEligible: false,
      archiveEligible: false,
      tombstoneSourcePath: "",
    };
  }
  const state = normalizeMetadataValue(fields.get("state") || fields.get("状态") || "soft-deleted", "soft-deleted");
  const deletionState = ["soft-deleted", "superseded", "archived"].includes(state) ? state : "soft-deleted";
  return {
    deletionState,
    supersededBy: fields.get("superseded by") || fields.get("替代任务") || "",
    supersedes: [...new Set([...topLevelSupersedes, ...splitList(fields.get("supersedes") || fields.get("合并自") || "")])],
    deleteReason: fields.get("reason") || fields.get("原因") || "",
    hiddenByDefault: true,
    reopenEligible: parseTombstoneBooleanLike(fields.get("reopen eligible") || fields.get("可重新打开")),
    archiveEligible: parseTombstoneBooleanLike(fields.get("archive eligible") || fields.get("可归档")),
    tombstoneSourcePath: "task_plan.md#Task Tombstone",
  };
}

export function parseAgentReviewSubmission(reviewContent, { taskKey = "" } = {}) {
  const match = String(reviewContent || "").match(/^##\s*(?:Agent Review Submission|Agent 审查提交|Agent 提交审查)\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/im);
  if (!match) return null;
  const fields = fieldsFromMarkdownBlock(match[1] || "");
  const required = [
    "Submission ID",
    "Submitted At",
    "Submitted By",
    "Task Key",
    "Evidence Summary",
    "Open Findings Count",
    "Scanner Version",
  ];
  const missing = required.filter((field) => !isConcreteField(fields.get(field.toLowerCase())));
  const submittedTaskKey = fields.get("task key") || "";
  const taskKeyMismatch = Boolean(taskKey && isConcreteField(submittedTaskKey) && !taskKeysMatch(submittedTaskKey, taskKey));
  return {
    submitted: missing.length === 0 && !taskKeyMismatch,
    missingFields: taskKeyMismatch ? [...missing, "Task Key match"] : missing,
    submissionId: fields.get("submission id") || "",
    submittedAt: fields.get("submitted at") || "",
    submittedBy: fields.get("submitted by") || "",
    taskKey: submittedTaskKey,
    taskKeyMismatch,
    materialsChecklistHash: fields.get("materials checklist hash") || "",
    evidenceSummary: fields.get("evidence summary") || "",
    openFindingsCount: Number.parseInt(fields.get("open findings count") || "0", 10) || 0,
    scannerVersion: fields.get("scanner version") || "",
  };
}

export function assessMaterialsReadiness({ budget, taskDir, brief, visualMap, reviewSubmission, lessonCandidates, phases, longRunningContractPath }) {
  const issues = [];
  const addIssue = (code, message, sourcePath, extra = {}) => {
    issues.push({
      code,
      severity: extra.severity || "P2",
      queue: "missing-materials",
      sourcePath,
      sourceLine: 0,
      owner: extra.owner || "agent",
      message,
      allowedWritePaths: extra.allowedWritePaths || [`${toPosix(path.relative(path.dirname(taskDir), taskDir)) || "."}/**`],
      forbiddenActions: ["human-confirm", "edit-unrelated-task", "fabricate-evidence"],
      validationCommands: ["node scripts/harness.mjs check --profile target-project <target>"],
      confidence: extra.confidence || "exact",
      repairable: true,
    });
  };
  const requiredFiles = ["task_plan.md", "progress.md"];
  if (budget !== "simple") requiredFiles.push("brief.md", visualMapFile, "review.md", lessonCandidatesFile);
  if (budget === "complex" && fs.existsSync(longRunningContractPath)) requiredFiles.push(longRunningTaskContractFile);
  for (const fileName of requiredFiles) {
    if (!fs.existsSync(path.join(taskDir, fileName))) addIssue(`missing-file-${fileName}`, `Required task material is missing: ${fileName}`, `TARGET:${fileName}`);
  }
  if (budget !== "simple") {
    if (brief.source !== "standalone") addIssue("missing-brief", "Standard and complex tasks require standalone brief.md.", "TARGET:brief.md");
    if (visualMap.status === "missing") addIssue("missing-visual-map", "Standard and complex tasks require canonical visual_map.md.", `TARGET:${visualMapFile}`);
    if (!reviewSubmission?.submitted) {
      const message = reviewSubmission?.taskKeyMismatch
        ? "Agent Review Submission Task Key does not match this task."
        : "Agent has not submitted a strict Agent Review Submission packet.";
      addIssue(reviewSubmission?.taskKeyMismatch ? "invalid-review-submission-task-key" : "missing-review-submission", message, "TARGET:review.md");
    }
    if (!isLessonCandidateDecisionComplete(lessonCandidates)) {
      addIssue("missing-lesson-decision", `Lesson candidate decision is not complete: ${lessonCandidates.status}.`, `TARGET:${lessonCandidatesFile}`);
    }
    const actionablePhases = (phases || []).filter((phase) => phase.state !== "skipped");
    const hasPhaseEvidence = actionablePhases.some(
      (phase) =>
        phase.completion > 0 ||
        ["in_progress", "review", "blocked", "done"].includes(String(phase.state || "").toLowerCase()) ||
        ["partial", "present", "waived"].includes(String(phase.evidenceStatus || "").toLowerCase()),
    );
    if (actionablePhases.length > 0 && !hasPhaseEvidence) {
      addIssue("phase-incomplete", "Visual Map has no phase progress or evidence yet.", `TARGET:${visualMapFile}`);
    }
  }
  return { ready: issues.length === 0, issues };
}

export function deriveTaskQueues({ id, title, reviewStatus, reviewSubmission, reviewConfirmation, reviewQueueState, materialIssues, risks, stateConflicts, lessonCandidates, closeoutStatus, tombstone, taskDir, target }) {
  const queueReasons = [];
  const pushReason = (reason) => {
    queueReasons.push({
      severity: "P2",
      queue: "blocked",
      sourcePath: "",
      sourceLine: 0,
      owner: "agent",
      allowedWritePaths: [`${toPosix(path.relative(target.projectRoot, taskDir))}/**`],
      forbiddenActions: ["human-confirm", "edit-unrelated-task", "fabricate-evidence"],
      validationCommands: ["node scripts/harness.mjs check --profile target-project <target>"],
      confidence: "exact",
      repairable: true,
      ...reason,
    });
  };
  for (const issue of materialIssues || []) pushReason(issue);
  for (const risk of (risks || []).filter(isBlockingReviewRisk)) {
    pushReason({
      code: "open-blocking-finding",
      severity: risk.severity || "P1",
      queue: "blocked",
      sourcePath: "TARGET:review.md",
      message: `Open blocking review finding ${risk.id || risk.severity}: ${risk.summary || "Review finding blocks confirmation."}`,
    });
  }
  for (const conflict of stateConflicts || []) {
    if (conflict.severity !== "block") continue;
    pushReason({
      code: conflict.code,
      severity: "P1",
      queue: "blocked",
      sourcePath: "TARGET:progress.md",
      message: conflict.message,
    });
  }
  if (reviewSubmission?.submitted && reviewSubmission.scannerVersion !== taskScannerVersion) {
    pushReason({
      code: "stale-review-submission-scanner",
      severity: "P2",
      queue: "blocked",
      sourcePath: "TARGET:review.md",
      message: "Agent Review Submission was generated by a stale scanner version.",
    });
  }
  const hasLessonWork = lessonCandidates?.status === "needs-promotion" || lessonCandidates?.promotionState === "queued" || lessonCandidates?.openCount > 0;
  const taskQueues = [];
  if (tombstone.deletionState !== "active") {
    taskQueues.push("soft-deleted-superseded");
  } else {
    if ((materialIssues || []).length > 0) taskQueues.push("missing-materials");
    if (queueReasons.some((reason) => reason.queue === "blocked")) taskQueues.push("blocked");
    if (reviewSubmission?.submitted && reviewQueueState === "ready-to-confirm" && !reviewConfirmation?.confirmed && !hasLessonWork && !taskQueues.includes("blocked") && !taskQueues.includes("missing-materials")) {
      taskQueues.push("review");
    }
    if (hasLessonWork) taskQueues.push("lessons");
    if (reviewStatus === "confirmed") taskQueues.push(closeoutStatus === "closed" ? "finalized" : "confirmed");
  }
  if (taskQueues.length === 0) taskQueues.push("active");
  return {
    taskQueues,
    queueReasons,
    repairPrompt: renderRepairPrompt({ id, title, taskDir, target, reasons: queueReasons }),
  };
}

export function parseReviewConfirmation(reviewContent, { taskKey = "", projectRoot = "", taskDir = "", reviewPath = "", progressPath = "" } = {}) {
  const match = String(reviewContent || "").match(/^##\s*(?:Human Review Confirmation|人工审查确认)\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/im);
  if (!match) return null;
  const fields = fieldsFromMarkdownBlock(match[1] || "");
  const required = ["Confirmation ID", "Confirmed At", "Reviewer", "Reviewer Email", "Task Key", "Confirm Text", "Evidence Checked", "Commit SHA", "Audit Status"];
  const missing = required.filter((field) => !isConcreteField(fields.get(field.toLowerCase())));
  const confirmedTaskKey = fields.get("task key") || "";
  const confirmText = fields.get("confirm text") || "";
  const commitSha = fields.get("commit sha") || "";
  const auditStatus = fields.get("audit status") || "";
  const taskKeyMismatch = Boolean(taskKey && isConcreteField(confirmedTaskKey) && !taskKeysMatch(confirmedTaskKey, taskKey));
  const confirmTextMismatch = Boolean(taskKey && isConcreteField(confirmText) && !taskKeysMatch(confirmText, taskKey));
  const commitShaInvalid = Boolean(isConcreteField(commitSha) && !/^[0-9a-f]{7,40}$/i.test(commitSha));
  const auditStatusInvalid = Boolean(isConcreteField(auditStatus) && auditStatus.trim().toLowerCase() !== "committed");
  let gitAudit = null;
  if (missing.length === 0 && !taskKeyMismatch && !confirmTextMismatch && !commitShaInvalid && !auditStatusInvalid) {
    gitAudit = validateReviewConfirmationGitAudit({
      projectRoot,
      taskId: taskKey,
      reviewPath: reviewPath || (taskDir ? path.join(taskDir, "review.md") : ""),
      progressPath: progressPath || (taskDir ? path.join(taskDir, "progress.md") : ""),
      commitSha,
    });
  }
  const gitAuditInvalid = Boolean(gitAudit && !gitAudit.valid);
  const invalidFields = [
    ...(taskKeyMismatch ? ["Task Key match"] : []),
    ...(confirmTextMismatch ? ["Confirm Text match"] : []),
    ...(commitShaInvalid ? ["Commit SHA valid"] : []),
    ...(auditStatusInvalid ? ["Audit Status committed"] : []),
    ...(gitAuditInvalid ? ["Commit SHA git audit"] : []),
  ];
  if (fields.size > 0) {
    return {
      confirmed: missing.length === 0 && invalidFields.length === 0,
      missingFields: [...missing, ...invalidFields],
      confirmationId: fields.get("confirmation id") || "",
      confirmedAt: fields.get("confirmed at") || "",
      reviewer: fields.get("reviewer") || "",
      reviewerEmail: fields.get("reviewer email") || "",
      taskKey: confirmedTaskKey,
      taskKeyMismatch,
      confirmText,
      confirmTextMismatch,
      evidenceChecked: fields.get("evidence checked") || "",
      commitSha,
      commitShaInvalid,
      auditStatus,
      auditStatusInvalid,
      gitAudit,
      gitAuditInvalid,
    };
  }
  return { confirmed: false, missingFields: required };
}

export function taskReviewStatus({ reviewContent = "", risks = [], confirmation = null, submission = null } = {}) {
  if (risks.some(isBlockingReviewRisk)) return "blocked-open-findings";
  if (confirmation?.confirmed) return "confirmed";
  if (!String(reviewContent || "").trim()) return "missing";
  if (submission?.submitted) return "agent-reviewed";
  if (hasAgentReviewSignal(reviewContent)) return "agent-reviewed";
  return "required";
}

function hasAgentReviewSignal(reviewContent) {
  const content = String(reviewContent || "");
  const verdict = content.match(/^\s*[-*]?\s*Verdict\s*[:：]\s*([^\n]+)/im);
  if (verdict) {
    const value = verdict[1].trim().toLowerCase();
    if (/^yes(?:$|[-_\s])/i.test(value) && !/^yes\s*\/\s*no\b/i.test(value)) return true;
  }
  return /本轮已检查|未发现阻塞目标的重要发现/.test(content);
}

export function isBlockingReviewRisk(risk) {
  return /^P[0-2]$/i.test(risk?.severity || "") && (risk.open || risk.blocksRelease);
}

export function deriveLifecycleState({ state = "unknown", reviewStatus = "missing", closeoutStatus = "missing" } = {}) {
  if (reviewStatus === "blocked-open-findings") return "review-blocked";
  if (closeoutStatus === "closed" && reviewStatus !== "confirmed") return "closed-review-pending";
  if (closeoutStatus === "closed") return "closed";
  if (state === "blocked") return "blocked";
  if (state === "done") return "closing";
  if (state === "review") return "in_review";
  if (state === "in_progress") return "active";
  if (["planned", "not_started"].includes(state)) return "ready";
  return "unknown";
}

export function deriveReviewQueueState({ state = "unknown", lifecycleState = "unknown", reviewStatus = "missing", closeoutStatus = "missing", budget = "standard", walkthroughPath = "", lessonCandidateDecisionComplete = false, materialsReady = true, deletionState = "active" } = {}) {
  if (deletionState !== "active") return "not-in-queue";
  if (reviewStatus === "blocked-open-findings") return "blocked";
  if (["not_started", "planned", "in_progress"].includes(state)) return "not-in-queue";
  const reviewSurface =
    state === "review" ||
    state === "done" ||
    ["in_review", "review-blocked", "closing", "closed-review-pending"].includes(lifecycleState) ||
    closeoutStatus === "closed";
  if (!reviewSurface) return "not-in-queue";
  if (reviewStatus === "confirmed") return closeoutStatus === "closed" ? "not-in-queue" : "confirmed";
  if (budget === "simple" && reviewStatus === "missing") return "not-in-queue";
  const missingWalkthrough = budget !== "simple" && !walkthroughPath;
  const missingCandidateDecision = budget !== "simple" && !lessonCandidateDecisionComplete;
  if (!materialsReady || missingWalkthrough || missingCandidateDecision || ["missing", "required"].includes(reviewStatus)) return "needs-material";
  if (closeoutStatus === "closed") return "closed-debt";
  return "ready-to-confirm";
}

export function collectStateConflicts({ state, reviewStatus, closeoutStatus, lifecycleState }) {
  const conflicts = [];
  if (state === "done" && closeoutStatus !== "closed") {
    conflicts.push({ code: "done-without-closeout", severity: "warn", message: "Task state is done, but closeout is still missing or pending." });
  }
  if (closeoutStatus === "closed" && reviewStatus !== "confirmed") {
    conflicts.push({ code: "closed-without-human-review", severity: "warn", message: "Task is closed, but human review confirmation is still missing." });
  }
  if (reviewStatus === "blocked-open-findings") {
    conflicts.push({ code: "review-blocked-open-findings", severity: "block", message: "Open P0-P2 review findings block human review confirmation." });
  }
  if (lifecycleState === "closed" && reviewStatus === "blocked-open-findings") {
    conflicts.push({ code: "closed-with-blocking-review", severity: "block", message: "Closeout is closed while review findings still block release." });
  }
  return conflicts;
}

export function collectReviewRisks(reviewContent) {
  const { header, rows } = tableAfterHeading(reviewContent, /^ID$/i);
  const severityIndex = firstColumn(header, reviewFindingColumns.severity);
  const findingIndex = firstColumn(header, reviewFindingColumns.finding);
  const openIndex = firstColumn(header, reviewFindingColumns.open);
  const blocksIndex = firstColumn(header, reviewFindingColumns.blocksRelease);
  const dispositionIndex = firstColumn(header, reviewFindingColumns.disposition);
  const waiverByIndex = firstColumn(header, reviewFindingColumns.waiverBy);
  if (severityIndex < 0 || findingIndex < 0) return [];
  return rows
    .filter((row) => /^P[0-3]$/i.test(row[severityIndex] || ""))
    .map((row) => {
      const disposition = normalizeMetadataValue(row[dispositionIndex] || "", "");
      const waived = ["waived", "accepted-risk"].includes(disposition) && String(row[waiverByIndex] || "").trim();
      return {
        id: row[0],
        severity: row[severityIndex],
        open: !waived && normalizeReviewBoolean(row[openIndex] || "no") === "yes",
        blocksRelease: !waived && normalizeReviewBoolean(row[blocksIndex] || "no") === "yes",
        disposition,
        waiverBy: row[waiverByIndex] || "",
        summary: row[findingIndex],
      };
    });
}

function renderRepairPrompt({ id, title, taskDir, target, reasons }) {
  const repairable = (reasons || []).filter((reason) => reason.repairable !== false);
  if (repairable.length === 0) return "";
  const relativeTaskDir = toPosix(path.relative(target.projectRoot, taskDir));
  return [
    `Please repair task ${id}: ${title || id}.`,
    "",
    `Task path: ${relativeTaskDir}`,
    "",
    "Detected issues:",
    ...repairable.map((reason) => `- [${reason.queue}/${reason.code}] ${reason.message}`),
    "",
    "Allowed writes:",
    ...[...new Set(repairable.flatMap((reason) => reason.allowedWritePaths || []))].map((item) => `- ${item}`),
    "",
    "Forbidden actions:",
    "- Do not write Human Review Confirmation; only a human can confirm.",
    "- Do not edit unrelated tasks.",
    "- Do not fabricate evidence or mark work complete without running checks.",
    "",
    "Expected output:",
    "- Fix the listed task-local materials or blockers.",
    "- Update progress.md with evidence.",
    "- Re-run the validation commands below.",
    "",
    "Validation commands:",
    ...[...new Set(repairable.flatMap((reason) => reason.validationCommands || []))].map((item) => `- ${item}`),
  ].join("\n");
}

function fieldsFromMarkdownBlock(block) {
  const fields = new Map();
  const tableLines = String(block || "").split(/\r?\n/).filter((line) => line.trim().startsWith("|"));
  for (let index = 0; index < tableLines.length - 1; index += 1) {
    const header = splitMarkdownRow(tableLines[index]);
    const separator = splitMarkdownRow(tableLines[index + 1]);
    if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const fieldIndex = firstColumn(header, ["Field", "字段"]);
    const valueIndex = firstColumn(header, ["Value", "值"]);
    if (fieldIndex < 0 || valueIndex < 0) continue;
    for (const line of tableLines.slice(index + 2)) {
      const row = splitMarkdownRow(line);
      if (row.length !== header.length) break;
      const field = String(row[fieldIndex] || "").trim();
      if (field) fields.set(field.toLowerCase(), String(row[valueIndex] || "").trim());
    }
    break;
  }
  for (const line of String(block || "").split(/\r?\n/)) {
    const match = line.match(/^\s*(?:[-*]\s*)?([^:：|]+?)\s*[:：]\s*(.+?)\s*$/);
    if (match) fields.set(match[1].trim().toLowerCase(), match[2].trim());
  }
  return fields;
}

function isConcreteField(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return !/^\[.*\]$/.test(raw) && !/\{\{[^}]+\}\}/.test(raw);
}

function taskKeysMatch(candidate, expected) {
  const left = String(candidate || "").replace(/`/g, "").trim();
  const right = String(expected || "").replace(/`/g, "").trim();
  return left === right || right.endsWith(`/${left}`);
}

function parseTombstoneBooleanLike(value) {
  return /^(yes|true|open|blocked|是|开放|阻塞|阻塞确认|阻塞发布)$/i.test(String(value || "").trim());
}
