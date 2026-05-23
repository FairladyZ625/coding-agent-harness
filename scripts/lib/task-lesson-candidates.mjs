import {
  tableAfterHeading,
  firstColumn,
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
