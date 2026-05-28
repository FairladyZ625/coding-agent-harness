// @ts-nocheck
// Dynamic audit metadata parsing stays behavior-first until the metadata domain model PR.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { toPosix } from "./core-shared.mjs";
import { firstColumn, markdownTableRows } from "./markdown-utils.mjs";

export const taskAuditHeadingPattern = /^##\s*(?:Task Audit Metadata|任务审计元数据)\s*$/im;
export const scaffoldProvenanceHeadingPattern = /^##\s*(?:Scaffold Provenance|脚手架来源)\s*$/im;
export const humanReviewConfirmationHeadingPattern = /^##\s*(?:Human Review Confirmation|人工审查确认)\s*$/im;

export const taskAuditFieldOrder = [
  "Created By",
  "Created At",
  "Command Shape",
  "Budget",
  "Template Source",
  "Task Creator",
  "Task Creator Source",
  "Human Review Status",
  "Confirmation ID",
  "Confirmed At",
  "Reviewer",
  "Reviewer Email",
  "Confirm Text",
  "Evidence Checked",
  "Review Commit SHA",
  "Audit Source",
  "Audit Status",
  "Exception Reason",
  "Message",
  "Migration Status",
  "Migrated From",
  "Legacy Extra Fields",
  "Migration Notes",
];

export function readGitIdentity(projectRoot) {
  const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: projectRoot, encoding: "utf8" });
  if (gitRoot.status !== 0) {
    return { name: "n/a", email: "n/a", display: "n/a", source: "git-unavailable" };
  }
  const name = spawnSync("git", ["config", "--get", "user.name"], { cwd: projectRoot, encoding: "utf8" }).stdout.trim();
  const email = spawnSync("git", ["config", "--get", "user.email"], { cwd: projectRoot, encoding: "utf8" }).stdout.trim();
  if (!name && !email) return { name: "n/a", email: "n/a", display: "n/a", source: "git-config-missing" };
  const display = name && email ? `${name} <${email}>` : name || email;
  return { name: name || "n/a", email: email || "n/a", display, source: "git-config" };
}

export function buildCreationTaskAudit(scaffoldProvenance, { projectRoot }) {
  const creator = readGitIdentity(projectRoot);
  return {
    "Created By": scaffoldProvenance.createdBy || "harness new-task",
    "Created At": scaffoldProvenance.createdAt || "",
    "Command Shape": scaffoldProvenance.command || "",
    "Budget": scaffoldProvenance.budget || "",
    "Template Source": scaffoldProvenance.templateSource || "",
    "Task Creator": creator.display,
    "Task Creator Source": creator.source,
    "Human Review Status": "not-confirmed",
    "Confirmation ID": "n/a",
    "Confirmed At": "n/a",
    "Reviewer": "n/a",
    "Reviewer Email": "n/a",
    "Confirm Text": "n/a",
    "Evidence Checked": "n/a",
    "Review Commit SHA": "n/a",
    "Audit Source": "native-index",
    "Audit Status": "created",
    "Exception Reason": scaffoldProvenance.exceptionReason || "n/a",
    "Message": "n/a",
    "Migration Status": "native",
    "Migrated From": "n/a",
    "Legacy Extra Fields": "{}",
    "Migration Notes": "n/a",
  };
}

export function taskAuditTemplateValues(fields = {}) {
  const values = {};
  for (const field of taskAuditFieldOrder) {
    const key = `TASK_AUDIT_${field.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
    values[key] = markdownCell(fields[field] || "n/a");
  }
  return values;
}

export function renderTaskAuditMetadata(fields = {}, { locale = "en-US" } = {}) {
  const heading = locale === "zh-CN" ? "## 任务审计元数据" : "## Task Audit Metadata";
  const rows = taskAuditFieldOrder.map((field) => `| ${field} | ${markdownCell(fields[field] ?? "n/a")} |`);
  return `${heading}\n\n| Field | Value |\n| --- | --- |\n${rows.join("\n")}\n`;
}

export function replaceTaskAuditMetadata(content, fields, options = {}) {
  const rendered = renderTaskAuditMetadata(fields, options).trimEnd();
  const text = String(content || "").trimEnd();
  const match = findHeadingBlock(text, taskAuditHeadingPattern);
  if (match) return `${text.slice(0, match.start)}${rendered}\n${text.slice(match.end).replace(/^\n+/, "\n")}`;
  const identityMatch = findHeadingBlock(text, /^##\s*(?:Task Identity|任务身份)\s*$/im);
  if (identityMatch) {
    return `${text.slice(0, identityMatch.end).trimEnd()}\n\n${rendered}\n\n${text.slice(identityMatch.end).trimStart()}`;
  }
  return `${text}\n\n${rendered}\n`;
}

export function parseTaskAuditMetadata(content, { required = false } = {}) {
  const block = extractTaskAuditBlock(content);
  const fields = block ? fieldsFromMarkdownBlock(block.body) : new Map();
  const issues = [];
  if (required && fields.size === 0) issues.push({ code: "missing-task-audit-metadata", message: "missing Task Audit Metadata section" });
  if (fields.size > 0) {
    for (const field of ["Created By", "Created At", "Budget", "Template Source", "Task Creator Source", "Human Review Status", "Audit Status"]) {
      if (!isConcreteAuditField(fields.get(field.toLowerCase()))) issues.push({ code: `missing-task-audit-${slugField(field)}`, message: `Task Audit Metadata missing ${field}` });
    }
    const createdBy = normalizeToken(fields.get("created by"));
    const createdAt = fields.get("created at") || "";
    const budget = normalizeToken(fields.get("budget"));
    const creatorSource = normalizeToken(fields.get("task creator source"));
    const reviewStatus = normalizeToken(fields.get("human review status"));
    const auditStatus = normalizeToken(fields.get("audit status"));
    if (isConcreteAuditField(fields.get("created by")) && !["harness-new-task", "manual-exception", "historical-backfill"].includes(createdBy)) {
      issues.push({ code: "invalid-task-audit-created-by", message: `Task Audit Metadata invalid Created By: ${fields.get("created by")}` });
    }
    if (createdBy === "manual-exception" && !isConcreteAuditField(fields.get("exception reason"))) {
      issues.push({ code: "missing-task-audit-exception-reason", message: "Task Audit Metadata manual-exception requires Exception Reason" });
    }
    if (isConcreteAuditField(createdAt) && normalizeToken(createdAt) !== "legacy-unavailable" && !isValidDateOnly(createdAt)) {
      issues.push({ code: "invalid-task-audit-created-at", message: `Task Audit Metadata invalid Created At: ${createdAt}` });
    }
    if (isConcreteAuditField(fields.get("budget")) && !["simple", "standard", "complex", "legacy-unavailable"].includes(budget)) {
      issues.push({ code: "invalid-task-audit-budget", message: `Task Audit Metadata invalid Budget: ${fields.get("budget")}` });
    }
    if (isConcreteAuditField(fields.get("task creator source")) && !["git-config", "git-config-missing", "git-unavailable", "legacy-unavailable"].includes(creatorSource)) {
      issues.push({ code: "invalid-task-audit-task-creator-source", message: `Task Audit Metadata invalid Task Creator Source: ${fields.get("task creator source")}` });
    }
    if (isConcreteAuditField(fields.get("human review status")) && !["not-confirmed", "confirmed"].includes(reviewStatus)) {
      issues.push({ code: "invalid-task-audit-human-review-status", message: `Task Audit Metadata invalid Human Review Status: ${fields.get("human review status")}` });
    }
    if (isConcreteAuditField(fields.get("audit status")) && !["created", "committed", "migrated"].includes(auditStatus)) {
      issues.push({ code: "invalid-task-audit-audit-status", message: `Task Audit Metadata invalid Audit Status: ${fields.get("audit status")}` });
    }
    if (reviewStatus === "confirmed") {
      for (const field of ["Confirmation ID", "Confirmed At", "Reviewer", "Reviewer Email", "Confirm Text", "Evidence Checked", "Review Commit SHA"]) {
        if (!isConcreteAuditField(fields.get(field.toLowerCase()))) issues.push({ code: `missing-task-audit-${slugField(field)}`, message: `Task Audit Metadata confirmed review missing ${field}` });
      }
    }
  }
  return {
    present: fields.size > 0,
    fields,
    issues,
    summary: taskAuditSummary(fields, issues),
  };
}

export function legacyAuditIssues(target, taskDir, { briefContent = "", reviewContent = "" } = {}) {
  const issues = [];
  const relativeDir = toPosix(path.relative(target.projectRoot, taskDir));
  if (scaffoldProvenanceHeadingPattern.test(briefContent)) {
    issues.push(legacyIssue(`${relativeDir}/brief.md`, "legacy-scaffold-provenance", "legacy Scaffold Provenance must be migrated to INDEX.md"));
  }
  if (humanReviewConfirmationHeadingPattern.test(reviewContent)) {
    issues.push(legacyIssue(`${relativeDir}/review.md`, "legacy-human-review-confirmation", "legacy Human Review Confirmation must be migrated to INDEX.md"));
  }
  return issues;
}

export function taskAuditMaterialIssues(target, taskDir, audit) {
  const relativeIndexPath = `${toPosix(path.relative(target.projectRoot, taskDir))}/INDEX.md`;
  return (audit.issues || []).map((issue) => ({
    code: issue.code,
    severity: "P1",
    queue: "missing-materials",
    sourcePath: `TARGET:${relativeIndexPath}`,
    sourceLine: 0,
    owner: "agent",
    message: issue.message,
    allowedWritePaths: [relativeIndexPath],
    forbiddenActions: ["human-confirm", "edit-unrelated-task", "fabricate-evidence"],
    validationCommands: ["node dist/harness.mjs check --profile target-project <target>"],
    confidence: "exact",
    repairable: true,
  }));
}

export function scaffoldProvenanceSummaryFromTaskAudit(audit) {
  const fields = audit?.fields || new Map();
  return {
    required: true,
    present: Boolean(audit?.present),
    createdBy: normalizeToken(fields.get("created by")),
    command: fields.get("command shape") || "",
    createdAt: fields.get("created at") || "",
    budget: normalizeToken(fields.get("budget")),
    templateSource: fields.get("template source") || "",
    exceptionReason: fields.get("exception reason") || "",
    issues: audit?.issues || [],
  };
}

export function reviewConfirmationFromTaskAudit(audit, { taskKey = "" } = {}) {
  const fields = audit?.fields || new Map();
  if (!audit?.present) return null;
  const status = normalizeToken(fields.get("human review status"));
  if (status !== "confirmed") return { confirmed: false, missingFields: [] };
  const required = ["Confirmation ID", "Confirmed At", "Reviewer", "Reviewer Email", "Confirm Text", "Evidence Checked", "Review Commit SHA", "Audit Status"];
  const missing = required.filter((field) => !isConcreteAuditField(fields.get(field.toLowerCase())));
  const confirmText = fields.get("confirm text") || "";
  const commitSha = fields.get("review commit sha") || "";
  const auditStatus = fields.get("audit status") || "";
  const auditSource = fields.get("audit source") || "";
  const migratedLegacy = auditSource === "migrated-legacy-review";
  const confirmTextMismatch = Boolean(!migratedLegacy && taskKey && isConcreteAuditField(confirmText) && !taskKeysMatch(confirmText, taskKey));
  const commitShaInvalid = Boolean(!migratedLegacy && isConcreteAuditField(commitSha) && !/^[0-9a-f]{7,40}$/i.test(commitSha));
  const auditStatusInvalid = Boolean(isConcreteAuditField(auditStatus) && auditStatus.trim().toLowerCase() !== "committed");
  const invalidFields = [
    ...(confirmTextMismatch ? ["Confirm Text match"] : []),
    ...(commitShaInvalid ? ["Review Commit SHA valid"] : []),
    ...(auditStatusInvalid ? ["Audit Status committed"] : []),
  ];
  return {
    confirmed: missing.length === 0 && invalidFields.length === 0,
    missingFields: [...missing, ...invalidFields],
    confirmationId: fields.get("confirmation id") || "",
    confirmedAt: fields.get("confirmed at") || "",
    reviewer: fields.get("reviewer") || "",
    reviewerEmail: fields.get("reviewer email") || "",
    taskKey,
    taskKeyMismatch: false,
    confirmText,
    confirmTextMismatch,
    evidenceChecked: fields.get("evidence checked") || "",
    commitSha,
    commitShaInvalid,
    auditStatus,
    auditStatusInvalid,
    auditSource,
    migratedFrom: fields.get("migrated from") || "",
    gitAudit: migratedLegacy ? { valid: true, migrated: true } : null,
    gitAuditInvalid: false,
  };
}

export function stripLegacyAuditBlocks(content) {
  return stripHeadingBlock(stripHeadingBlock(content, scaffoldProvenanceHeadingPattern), humanReviewConfirmationHeadingPattern);
}

export function extractLegacyBlock(content, pattern) {
  const block = findHeadingBlock(content, pattern);
  if (!block) return null;
  return {
    ...block,
    body: String(content || "").slice(block.headingEnd, block.end),
    raw: String(content || "").slice(block.start, block.end),
  };
}

export function fieldsFromMarkdownBlock(block) {
  const fields = new Map();
  const tableRows = markdownTableRows(block);
  const header = tableRows[0] || [];
  const fieldIndex = firstColumn(header, ["Field", "字段"]);
  const valueIndex = firstColumn(header, ["Value", "值"]);
  if (fieldIndex >= 0 && valueIndex >= 0) {
    for (const row of tableRows.slice(1).filter((candidate) => !candidate.every((cell) => /^:?-{3,}:?$/.test(cell)))) {
      const key = String(row[fieldIndex] || "").replace(/`/g, "").trim();
      if (key) fields.set(key.toLowerCase(), String(row[valueIndex] || "").replace(/`/g, "").trim());
    }
  }
  for (const line of String(block || "").split(/\r?\n/)) {
    if (line.trim().startsWith("|")) continue;
    const match = line.match(/^\s*(?:[-*]\s*)?([^:：|]+?)\s*[:：]\s*(.+?)\s*$/);
    if (match) fields.set(match[1].trim().toLowerCase(), match[2].trim());
  }
  return fields;
}

export function isConcreteAuditField(value) {
  const raw = String(value || "").replace(/`/g, "").trim();
  return Boolean(raw) && !/^(n\/a|na|none|pending(?:[-_ ].*)?|todo|tbd|\[.*\]|-|—|–|不适用|无|待定|\{\})$/i.test(raw) && !/\{\{[^}]+\}\}/.test(raw);
}

export function legacyExtraFieldsJson(entries) {
  const extra = {};
  for (const [field, value] of entries) {
    if (!field || !isConcreteAuditField(value)) continue;
    extra[field] = value;
  }
  return JSON.stringify(extra);
}

function extractTaskAuditBlock(content) {
  const block = findHeadingBlock(content, taskAuditHeadingPattern);
  if (!block) return null;
  return { ...block, body: String(content || "").slice(block.headingEnd, block.end) };
}

function findHeadingBlock(content, pattern) {
  const text = String(content || "");
  const match = text.match(pattern);
  if (!match || match.index === undefined) return null;
  const headingEnd = text.indexOf("\n", match.index);
  const bodyStart = headingEnd < 0 ? text.length : headingEnd + 1;
  const next = text.slice(bodyStart).search(/^##\s+/m);
  const end = next < 0 ? text.length : bodyStart + next;
  return { start: match.index, headingEnd: bodyStart, end };
}

function stripHeadingBlock(content, pattern) {
  const text = String(content || "");
  const block = findHeadingBlock(text, pattern);
  if (!block) return text;
  return `${text.slice(0, block.start).trimEnd()}\n\n${text.slice(block.end).trimStart()}`.replace(/\n{3,}/g, "\n\n");
}

function taskAuditSummary(fields, issues) {
  return {
    present: fields.size > 0,
    createdBy: normalizeToken(fields.get("created by")),
    command: fields.get("command shape") || "",
    createdAt: fields.get("created at") || "",
    budget: normalizeToken(fields.get("budget")),
    templateSource: fields.get("template source") || "",
    taskCreator: fields.get("task creator") || "",
    taskCreatorSource: fields.get("task creator source") || "",
    humanReviewStatus: normalizeToken(fields.get("human review status")),
    confirmationId: fields.get("confirmation id") || "",
    confirmedAt: fields.get("confirmed at") || "",
    reviewer: fields.get("reviewer") || "",
    reviewerEmail: fields.get("reviewer email") || "",
    confirmText: fields.get("confirm text") || "",
    evidenceChecked: fields.get("evidence checked") || "",
    reviewCommitSha: fields.get("review commit sha") || "",
    auditSource: fields.get("audit source") || "",
    auditStatus: normalizeToken(fields.get("audit status")),
    exceptionReason: fields.get("exception reason") || "",
    message: fields.get("message") || "",
    migrationStatus: normalizeToken(fields.get("migration status")),
    migratedFrom: fields.get("migrated from") || "",
    legacyExtraFields: fields.get("legacy extra fields") || "{}",
    migrationNotes: fields.get("migration notes") || "",
    issues,
  };
}

function legacyIssue(relativePath, code, message) {
  return {
    code,
    severity: "P1",
    queue: "missing-materials",
    sourcePath: `TARGET:${relativePath}`,
    sourceLine: 0,
    owner: "agent",
    message,
    allowedWritePaths: [relativePath],
    forbiddenActions: ["human-confirm", "edit-unrelated-task", "fabricate-evidence"],
    validationCommands: ["node dist/harness.mjs migrate-task-audit-index --apply <target>"],
    confidence: "exact",
    repairable: true,
  };
}

function markdownCell(value) {
  return String(value ?? "").replace(/\r?\n/g, "<br>").replace(/\|/g, "\\|");
}

function normalizeToken(value) {
  return String(value || "").replace(/`/g, "").trim().toLowerCase().replaceAll("_", "-").replace(/\s+/g, "-");
}

function slugField(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function taskKeysMatch(candidate, expected) {
  const left = String(candidate || "").replace(/`/g, "").trim();
  const right = String(expected || "").replace(/`/g, "").trim();
  return left === right || right.endsWith(`/${left}`);
}

function isValidDateOnly(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw;
}
