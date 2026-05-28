// Dynamic review queue modeling stays behavior-first until the metadata domain model PR.

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
  stripFencedCodeBlocks,
  tableAfterHeading,
} from "./markdown-utils.mjs";
import {
  implementationPhases,
  phaseHasRecordedProgress,
} from "./phase-kind.mjs";
import type { PhaseProgress } from "./phase-kind.mjs";
import { validateReviewConfirmationGitAudit } from "./review-confirm-git-gate.mjs";
import { isLessonCandidateDecisionComplete } from "./task-lesson-candidates.mjs";
import { reviewConfirmationFromTaskAudit } from "./task-audit-metadata.mjs";

type StringMap = Map<string, string>;

type HarnessTarget = {
  projectRoot: string;
  harness?: {
    closeoutIndexPath?: string;
  };
};

type TaskIdentity = {
  taskKey: string;
  identitySource: "explicit" | "path-derived-legacy";
};

type TaskTombstone = {
  deletionState: string;
  supersededBy: string;
  supersedes: string[];
  deleteReason: string;
  archiveMetadata: Record<string, string>;
  hiddenByDefault: boolean;
  reopenEligible: boolean;
  archiveEligible: boolean;
  tombstoneSourcePath: string;
};

type ReviewSubmission = {
  submitted: boolean;
  missingFields: string[];
  submissionId: string;
  submittedAt: string;
  submittedBy: string;
  taskKey: string;
  taskKeyMismatch: boolean;
  materialsChecklistHash: string;
  evidenceSummary: string;
  openFindingsCount: number;
  scannerVersion: string;
};

type ReviewConfirmation = {
  confirmed: boolean;
  missingFields: string[];
  auditSource?: string;
  commitSha?: string;
  gitAudit?: unknown;
  gitAuditInvalid?: boolean;
};

type MaterialIssue = {
  code: string;
  severity: string;
  queue: string;
  sourcePath: string;
  sourceLine: number;
  owner: string;
  message: string;
  allowedWritePaths: string[];
  forbiddenActions: string[];
  validationCommands: string[];
  confidence: string;
  repairable: boolean;
};

type MaterialIssueExtra = Partial<Pick<MaterialIssue, "severity" | "owner" | "allowedWritePaths" | "confidence">>;

type LessonCandidates = {
  status?: string;
  promotionState?: string;
  openCount?: number;
};

type TaskBudget = "simple" | "standard" | "complex";

type TaskMaterialContent = {
  source?: string;
  status?: string;
};

type ReviewRisk = {
  id?: string;
  severity?: string;
  open: boolean;
  blocksRelease: boolean;
  disposition?: string;
  waiverBy?: string;
  summary?: string;
};

type StateConflict = {
  code: string;
  severity: string;
  message: string;
};

type QueueReason = MaterialIssue & Record<string, unknown>;

type TaskAudit = unknown;

export const taskScannerVersion = "task-scanner/2026-05-25-phase-kind";
export const reviewFindingColumns = {
  severity: ["Severity", "严重级别", "优先级"],
  finding: ["Finding", "发现"],
  open: ["Open", "是否开放"],
  blocksRelease: ["Blocks Release", "是否阻塞发布", "阻塞发布", "阻塞确认"],
  disposition: ["Disposition", "处置", "处理结论"],
  waiverBy: ["Waiver By", "豁免人"],
};

export function normalizeReviewBoolean(value: unknown): string {
  const raw = String(value || "").trim().toLowerCase();
  if (/^(yes|true|open|是|开放)$/.test(raw)) return "yes";
  if (/^(no|false|closed|fixed|done|否|关闭|已关闭|已修复)$/.test(raw)) return "no";
  return raw;
}

function parseMetadataLine(content: unknown, labels: string[]): string {
  const escaped = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = String(content || "").match(new RegExp(`^(?:${escaped})\\s*[:：]\\s*([^\\n]+)`, "im"));
  return match ? match[1].replace(/`/g, "").trim() : "";
}

function normalizeMetadataValue(value: unknown, fallback = ""): string {
  const normalized = String(value || "")
    .replace(/`/g, "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, "-");
  return normalized || fallback;
}

export function parseTaskIdentity(taskPlanContent: unknown, fallbackTaskId: string): TaskIdentity {
  const taskKey =
    parseMetadataLine(taskPlanContent, ["Task Key", "任务主键"]) ||
    parseMetadataLine(taskPlanContent, ["Task ID", "任务 ID"]) ||
    fallbackTaskId;
  return {
    taskKey,
    identitySource: taskKey && taskKey !== fallbackTaskId ? "explicit" : "path-derived-legacy",
  };
}

export function parseTaskTombstone(taskPlanContent: unknown): TaskTombstone {
  const scanContent = stripFencedCodeBlocks(String(taskPlanContent || ""));
  const topLevelSupersedes = splitList(parseMetadataLine(scanContent, ["Supersedes", "合并自"]));
  const match = String(scanContent || "").match(/^##\s*(?:Task Tombstone|任务墓碑)\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/im);
  const fields = match ? fieldsFromMarkdownBlock(match[1] || "") : new Map();
  if (fields.size === 0) {
    return {
      deletionState: "active",
      supersededBy: "",
      supersedes: topLevelSupersedes,
      deleteReason: "",
      archiveMetadata: {},
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
    archiveMetadata: Object.fromEntries([...fields.entries()].filter(([key]) => !["state", "状态", "superseded by", "替代任务", "supersedes", "合并自", "reason", "原因", "reopen eligible", "可重新打开", "archive eligible", "可归档"].includes(key))),
    hiddenByDefault: true,
    reopenEligible: parseTombstoneBooleanLike(fields.get("reopen eligible") || fields.get("可重新打开")),
    archiveEligible: parseTombstoneBooleanLike(fields.get("archive eligible") || fields.get("可归档")),
    tombstoneSourcePath: "task_plan.md#Task Tombstone",
  };
}

export function parseAgentReviewSubmission(reviewContent: unknown, { taskKey = "" }: { taskKey?: string } = {}): ReviewSubmission | null {
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

export function assessMaterialsReadiness({
  budget,
  taskDir,
  brief,
  visualMap,
  reviewSubmission,
  lessonCandidates,
  phases,
  longRunningContractPath,
  reviewSurfaceRequired = true,
}: {
  budget: TaskBudget;
  taskDir: string;
  brief: TaskMaterialContent;
  visualMap: TaskMaterialContent;
  reviewSubmission: ReviewSubmission | null;
  lessonCandidates: LessonCandidates;
  phases: PhaseProgress[];
  longRunningContractPath: string;
  reviewSurfaceRequired?: boolean;
}): { ready: boolean; issues: MaterialIssue[] } {
  const issues: MaterialIssue[] = [];
  const addIssue = (code: string, message: string, sourcePath: string, extra: MaterialIssueExtra = {}) => {
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
      validationCommands: ["node dist/harness.mjs check --profile target-project <target>"],
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
  }
  if (budget !== "simple" && reviewSurfaceRequired) {
    if (!reviewSubmission?.submitted) {
      const message = reviewSubmission?.taskKeyMismatch
        ? "Agent Review Submission Task Key does not match this task."
        : "Agent has not submitted a strict Agent Review Submission packet.";
      addIssue(reviewSubmission?.taskKeyMismatch ? "invalid-review-submission-task-key" : "missing-review-submission", message, "TARGET:review.md");
    }
    if (!isLessonCandidateDecisionComplete(lessonCandidates)) {
      addIssue("missing-lesson-decision", `Lesson candidate decision is not complete: ${lessonCandidates.status}.`, `TARGET:${lessonCandidatesFile}`);
    }
    const actionablePhases = implementationPhases(phases || []);
    const hasPhaseEvidence = actionablePhases.some(phaseHasRecordedProgress);
    if ((phases || []).length > 0 && actionablePhases.length === 0) {
      addIssue("missing-execution-phase", "Visual Map has no non-skipped execution phase.", `TARGET:${visualMapFile}`);
    } else if (actionablePhases.length > 0 && !hasPhaseEvidence) {
      addIssue("phase-incomplete", "Visual Map has no execution phase progress or evidence yet.", `TARGET:${visualMapFile}`);
    }
  }
  return { ready: issues.length === 0, issues };
}

export function requiresReviewMaterials({ state = "unknown", lifecycleState = "unknown", closeoutStatus = "missing" }: { state?: string; lifecycleState?: string; closeoutStatus?: string } = {}): boolean {
  return (
    state === "review" ||
    state === "done" ||
    ["in_review", "review-blocked", "closing", "closed-review-pending"].includes(lifecycleState) ||
    closeoutStatus === "closed"
  );
}

export function deriveTaskQueues({
  id,
  title,
  state,
  budget,
  reviewStatus,
  reviewSubmission,
  reviewConfirmation,
  reviewQueueState,
  materialIssues,
  risks,
  stateConflicts,
  lessonCandidates,
  closeoutStatus,
  tombstone,
  taskDir,
  target,
}: {
  id: string;
  title?: string;
  state: string;
  budget: TaskBudget;
  reviewStatus: string;
  reviewSubmission: ReviewSubmission | null;
  reviewConfirmation: ReviewConfirmation | null;
  reviewQueueState: string;
  materialIssues: MaterialIssue[];
  risks: ReviewRisk[];
  stateConflicts: StateConflict[];
  lessonCandidates: LessonCandidates;
  closeoutStatus: string;
  tombstone: Pick<TaskTombstone, "deletionState">;
  taskDir: string;
  target: HarnessTarget;
}): { taskQueues: string[]; queueReasons: QueueReason[]; repairPrompt: string } {
  const queueReasons: QueueReason[] = [];
  const pushReason = (reason: Partial<QueueReason> & { code: string; message: string }) => {
    queueReasons.push({
      severity: "P2",
      queue: "blocked",
      sourcePath: "",
      sourceLine: 0,
      owner: "agent",
      allowedWritePaths: [`${toPosix(path.relative(target.projectRoot, taskDir))}/**`],
      forbiddenActions: ["human-confirm", "edit-unrelated-task", "fabricate-evidence"],
      validationCommands: ["node dist/harness.mjs check --profile target-project <target>"],
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
  if (budget !== "simple" && reviewSubmission?.submitted && reviewQueueState === "needs-material" && !queueReasons.some((reason) => reason.queue === "missing-materials")) {
    pushReason({
      code: "review-closeout-materials-incomplete",
      queue: "missing-materials",
      sourcePath: closeoutMaterialSourcePath(target, taskDir),
      message: "Agent review was submitted, but closeout materials are not ready for human confirmation.",
    });
  }
  const hasLessonWork = lessonCandidates?.status === "needs-promotion" || lessonCandidates?.promotionState === "queued" || (lessonCandidates?.openCount ?? 0) > 0;
  const taskQueues: string[] = [];
  if (tombstone.deletionState !== "active") {
    taskQueues.push("soft-deleted-superseded");
  } else {
    if ((materialIssues || []).length > 0 || queueReasons.some((reason) => reason.queue === "missing-materials")) taskQueues.push("missing-materials");
    if (queueReasons.some((reason) => reason.queue === "blocked")) taskQueues.push("blocked");
    if (reviewSubmission?.submitted && reviewQueueState === "ready-to-confirm" && !reviewConfirmation?.confirmed && !hasLessonWork && !taskQueues.includes("blocked") && !taskQueues.includes("missing-materials")) {
      taskQueues.push("review");
    }
    if (hasLessonWork) taskQueues.push("lessons");
    if (budget === "simple" && state === "done" && closeoutStatus === "closed") taskQueues.push("finalized");
    if (reviewStatus === "confirmed") taskQueues.push(closeoutStatus === "closed" ? "finalized" : "confirmed");
  }
  if (taskQueues.length === 0) taskQueues.push("active");
  return {
    taskQueues,
    queueReasons,
    repairPrompt: renderRepairPrompt({ id, title, taskDir, target, reasons: queueReasons }),
  };
}

function closeoutMaterialSourcePath(target: HarnessTarget, taskDir: string): string {
  const localWalkthrough = path.join(taskDir, "walkthrough.md");
  if (fs.existsSync(localWalkthrough)) return "TARGET:walkthrough.md";
  const closeoutIndexPath = target.harness?.closeoutIndexPath;
  if (closeoutIndexPath) return `TARGET:${toPosix(path.relative(target.projectRoot, closeoutIndexPath))}`;
  return "TARGET:closeout-materials";
}

export function parseReviewConfirmation(
  reviewContent: unknown,
  { taskKey = "", taskAudit = null, projectRoot = "", taskDir = "", indexPath = "", reviewPath = "", progressPath = "" }: {
    taskKey?: string;
    taskAudit?: TaskAudit | null;
    projectRoot?: string;
    taskDir?: string;
    indexPath?: string;
    reviewPath?: string;
    progressPath?: string;
  } = {},
): ReviewConfirmation | null {
  if (taskAudit) {
    const confirmation = reviewConfirmationFromTaskAudit(taskAudit, { taskKey });
    if (
      confirmation?.confirmed &&
      confirmation.auditSource !== "migrated-legacy-review" &&
      projectRoot &&
      (indexPath || taskDir) &&
      confirmation.commitSha
    ) {
      const gitAudit = validateReviewConfirmationGitAudit({
        projectRoot,
        taskId: taskKey,
        reviewPath: indexPath || path.join(taskDir, "INDEX.md"),
        progressPath: "",
        commitSha: confirmation.commitSha,
      });
      return {
        ...confirmation,
        confirmed: confirmation.confirmed && gitAudit.valid,
        missingFields: gitAudit.valid ? confirmation.missingFields : [...confirmation.missingFields, "Review Commit SHA git audit"],
        gitAudit,
        gitAuditInvalid: !gitAudit.valid,
      };
    }
    return confirmation;
  }
  return null;
}

export function taskReviewStatus({ reviewContent = "", risks = [], confirmation = null, submission = null }: { reviewContent?: unknown; risks?: ReviewRisk[]; confirmation?: ReviewConfirmation | null; submission?: ReviewSubmission | null } = {}): string {
  if (risks.some(isBlockingReviewRisk)) return "blocked-open-findings";
  if (confirmation?.confirmed) return "confirmed";
  if (!String(reviewContent || "").trim()) return "missing";
  if (submission?.submitted) return "agent-reviewed";
  if (hasAgentReviewSignal(reviewContent)) return "agent-reviewed";
  return "required";
}

function hasAgentReviewSignal(reviewContent: unknown): boolean {
  const content = String(reviewContent || "");
  const verdict = content.match(/^\s*[-*]?\s*Verdict\s*[:：]\s*([^\n]+)/im);
  if (verdict) {
    const value = verdict[1].trim().toLowerCase();
    if (/^yes(?:$|[-_\s])/i.test(value) && !/^yes\s*\/\s*no\b/i.test(value)) return true;
  }
  return /本轮已检查|未发现阻塞目标的重要发现/.test(content);
}

export function isBlockingReviewRisk(risk: Partial<ReviewRisk> | null | undefined): boolean {
  return /^P[0-2]$/i.test(risk?.severity || "") && Boolean(risk?.open || risk?.blocksRelease);
}

export function deriveLifecycleState({ state = "unknown", reviewStatus = "missing", closeoutStatus = "missing", budget = "standard" }: { state?: string; reviewStatus?: string; closeoutStatus?: string; budget?: TaskBudget } = {}): string {
  if (reviewStatus === "blocked-open-findings") return "review-blocked";
  if (budget === "simple" && closeoutStatus === "closed") return "closed";
  if (closeoutStatus === "closed" && reviewStatus !== "confirmed") return "closed-review-pending";
  if (closeoutStatus === "closed") return "closed";
  if (state === "blocked") return "blocked";
  if (state === "done") return "closing";
  if (state === "review") return "in_review";
  if (state === "in_progress") return "active";
  if (["planned", "not_started"].includes(state)) return "ready";
  return "unknown";
}

export function deriveReviewQueueState({ state = "unknown", lifecycleState = "unknown", reviewStatus = "missing", closeoutStatus = "missing", budget = "standard", walkthroughPath = "", lessonCandidateDecisionComplete = false, materialsReady = true, deletionState = "active" }: { state?: string; lifecycleState?: string; reviewStatus?: string; closeoutStatus?: string; budget?: TaskBudget; walkthroughPath?: string; lessonCandidateDecisionComplete?: boolean; materialsReady?: boolean; deletionState?: string } = {}): string {
  if (deletionState !== "active") return "not-in-queue";
  if (reviewStatus === "blocked-open-findings") return "blocked";
  if (["not_started", "planned", "in_progress"].includes(state)) return "not-in-queue";
  const reviewSurface = requiresReviewMaterials({ state, lifecycleState, closeoutStatus });
  if (!reviewSurface) return "not-in-queue";
  if (reviewStatus === "confirmed") return closeoutStatus === "closed" ? "not-in-queue" : "confirmed";
  if (budget === "simple" && reviewStatus === "missing") return "not-in-queue";
  const missingWalkthrough = budget !== "simple" && !walkthroughPath;
  const missingCandidateDecision = budget !== "simple" && !lessonCandidateDecisionComplete;
  if (!materialsReady || missingWalkthrough || missingCandidateDecision || ["missing", "required"].includes(reviewStatus)) return "needs-material";
  if (closeoutStatus === "closed") return "closed-debt";
  return "ready-to-confirm";
}

export function collectStateConflicts({ state, reviewStatus, closeoutStatus, lifecycleState, budget = "standard" }: { state: string; reviewStatus: string; closeoutStatus: string; lifecycleState: string; budget?: TaskBudget }): StateConflict[] {
  const conflicts: StateConflict[] = [];
  if (state === "done" && closeoutStatus !== "closed") {
    conflicts.push({ code: "done-without-closeout", severity: "warn", message: "Task state is done, but closeout is still missing or pending." });
  }
  if (closeoutStatus === "closed" && reviewStatus !== "confirmed" && budget !== "simple") {
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

export function collectReviewRisks(reviewContent: string): ReviewRisk[] {
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

function renderRepairPrompt({ id, title, taskDir, target, reasons }: { id: string; title?: string; taskDir: string; target: HarnessTarget; reasons: QueueReason[] }): string {
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

function fieldsFromMarkdownBlock(block: unknown): StringMap {
  const fields: StringMap = new Map();
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

function isConcreteField(value: unknown): boolean {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return !/^\[.*\]$/.test(raw) && !/\{\{[^}]+\}\}/.test(raw);
}

function taskKeysMatch(candidate: unknown, expected: unknown): boolean {
  const left = String(candidate || "").replace(/`/g, "").trim();
  const right = String(expected || "").replace(/`/g, "").trim();
  return left === right || right.endsWith(`/${left}`);
}

function parseTombstoneBooleanLike(value: unknown): boolean {
  return /^(yes|true|open|blocked|是|开放|阻塞|阻塞确认|阻塞发布)$/i.test(String(value || "").trim());
}
