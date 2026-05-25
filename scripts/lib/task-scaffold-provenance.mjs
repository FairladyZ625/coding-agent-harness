import path from "node:path";
import { allowedTaskBudgets, toPosix } from "./core-shared.mjs";
import { firstColumn, markdownTableRows } from "./markdown-utils.mjs";

function normalizeMetadataValue(value, fallback = "") {
  const normalized = String(value || "")
    .replace(/`/g, "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, "-");
  return normalized || fallback;
}

function isConcreteScaffoldField(value) {
  const raw = String(value || "").replace(/`/g, "").trim();
  return Boolean(raw) && !/^(n\/a|na|none|pending|todo|tbd|\[.*\]|-|—|–|不适用|无|待定)$/i.test(raw);
}

function stripFencedCodeBlocks(content) {
  return String(content || "").replace(/^```[\s\S]*?^```[^\n]*$/gm, "");
}

function nonTableLines(content) {
  return String(content || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("|"));
}

function isValidIsoDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseScaffoldProvenance(contentSource, { required = false } = {}) {
  const content = stripFencedCodeBlocks(contentSource);
  const markerRequired =
    /^Scaffold Provenance\s*[:：]\s*(required|yes|true|必需|必须|required)\s*$/im.test(content) ||
    /^脚手架来源\s*[:：]\s*(required|yes|true|必需|必须|required)\s*$/im.test(content);
  const blockMatch = content.match(/^##\s*(?:Scaffold Provenance|脚手架来源)\s*$([\s\S]*?)(?=^##\s+|(?![\s\S]))/im);
  const tableRows = blockMatch ? markdownTableRows(blockMatch[1] || "") : [];
  const header = tableRows[0] || [];
  const bodyRows = tableRows.slice(1).filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)));
  const fieldIndex = firstColumn(header, ["Field", "字段"]);
  const valueIndex = firstColumn(header, ["Value", "值"]);
  const fields = new Map();
  if (fieldIndex >= 0 && valueIndex >= 0) {
    for (const row of bodyRows) {
      const key = String(row[fieldIndex] || "").replace(/`/g, "").trim().toLowerCase();
      if (key) fields.set(key, String(row[valueIndex] || "").replace(/`/g, "").trim());
    }
  }
  const createdByRaw = fields.get("created by") || fields.get("创建方式") || "";
  const createdBy = normalizeMetadataValue(createdByRaw, "");
  const budgetRaw = fields.get("budget") || fields.get("预算") || "";
  const provenance = {
    required: Boolean(required || markerRequired),
    present: fields.size > 0,
    fields,
    createdBy,
    createdByRaw,
    command: fields.get("command") || fields.get("command shape") || fields.get("命令") || "",
    createdAt: fields.get("created at") || fields.get("创建时间") || "",
    budget: normalizeMetadataValue(budgetRaw, ""),
    templateSource: fields.get("template source") || fields.get("模板来源") || "",
    exceptionReason: fields.get("exception reason") || fields.get("例外原因") || "",
    issues: [],
  };
  if (provenance.required && !provenance.present) provenance.issues.push({ code: "missing-scaffold-provenance", message: "missing Scaffold Provenance section" });
  if (!provenance.present) return { ...provenance, summary: scaffoldProvenanceSummary(provenance) };
  if (!["harness-new-task", "historical-backfill", "manual-exception"].includes(provenance.createdBy)) {
    provenance.issues.push({ code: "invalid-scaffold-created-by", message: `invalid Scaffold Provenance Created By: ${createdByRaw || "(missing)"}` });
  }
  if (provenance.createdBy === "harness-new-task" && !isConcreteScaffoldField(provenance.command)) {
    provenance.issues.push({ code: "missing-scaffold-command", message: "Scaffold Provenance harness new-task requires Command" });
  }
  if (provenance.createdBy === "manual-exception" && !isConcreteScaffoldField(provenance.exceptionReason)) {
    provenance.issues.push({ code: "missing-scaffold-exception-reason", message: "Scaffold Provenance manual-exception requires Exception Reason" });
  }
  if (isConcreteScaffoldField(provenance.createdAt) && !isValidIsoDate(provenance.createdAt)) {
    provenance.issues.push({ code: "invalid-scaffold-created-at", message: `invalid Scaffold Provenance Created At: ${provenance.createdAt}` });
  }
  if (nonTableLines(blockMatch[1]).length > 0) {
    provenance.issues.push({ code: "scaffold-provenance-non-table-content", message: "Scaffold Provenance must contain only the machine-readable table" });
  }
  if (blockMatch && content.slice(blockMatch.index + blockMatch[0].length).trim()) {
    provenance.issues.push({ code: "scaffold-provenance-not-at-end", message: "Scaffold Provenance must be the final brief section" });
  }
  if (provenance.budget && !allowedTaskBudgets.has(provenance.budget)) {
    provenance.issues.push({ code: "invalid-scaffold-budget", message: `invalid Scaffold Provenance Budget: ${budgetRaw}` });
  }
  if (!isConcreteScaffoldField(provenance.templateSource)) {
    provenance.issues.push({ code: "missing-scaffold-template-source", message: "Scaffold Provenance requires Template Source" });
  }
  return { ...provenance, summary: scaffoldProvenanceSummary(provenance) };
}

export function scaffoldProvenanceMaterialIssues(target, taskDir, provenance) {
  const relativeBriefPath = `${toPosix(path.relative(target.projectRoot, taskDir))}/brief.md`;
  return provenance.issues.map((issue) => ({
    code: issue.code,
    severity: "P1",
    queue: "missing-materials",
    sourcePath: `TARGET:${relativeBriefPath}`,
    sourceLine: 0,
    owner: "agent",
    message: issue.message,
    allowedWritePaths: [relativeBriefPath],
    forbiddenActions: ["human-confirm", "edit-unrelated-task", "fabricate-evidence"],
    validationCommands: ["node scripts/harness.mjs check --profile target-project <target>"],
    confidence: "exact",
    repairable: true,
  }));
}

function scaffoldProvenanceSummary(provenance) {
  return {
    required: provenance.required,
    present: provenance.present,
    createdBy: provenance.createdBy,
    command: provenance.command,
    createdAt: provenance.createdAt,
    budget: provenance.budget,
    templateSource: provenance.templateSource,
    exceptionReason: provenance.exceptionReason,
    issues: provenance.issues,
  };
}
