import path from "node:path";
import {
  readFileSafe,
  toPosix,
  walkFiles,
} from "./core-shared.mjs";
import {
  firstColumn,
  splitMarkdownRow,
} from "./markdown-utils.mjs";

export function validateSubagentAuthorization(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  const strategyPaths = walkFiles(target.docsRoot)
    .filter((file) => file.endsWith("execution_strategy.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`));

  for (const strategyPath of strategyPaths) {
    const relative = toPosix(path.relative(target.projectRoot, strategyPath));
    const rows = subagentAuthorizationRows(readFileSafe(strategyPath));
    for (const row of rows.filter((candidate) => /worker/i.test(candidate.role))) {
      if (!isWorkerAuthorizedStatus(row.status)) continue;
      const missing = [];
      for (const [label, value] of [
        ["Authorized By", row.authorizedBy],
        ["Authorized At", row.authorizedAt],
        ["Scope", row.scope],
        ["Worktree / Branch", row.worktreeBranch],
      ]) {
        if (!isConcreteAuthorizationValue(value)) missing.push(label);
      }
      if (missing.length > 0) report(`${relative} worker subagent authorization is incomplete: ${missing.join(", ")}`);
    }
  }
  return { failures, warnings };
}

function subagentAuthorizationRows(content) {
  const section = markdownSection(content, "Subagent Authorization");
  if (!section) return [];
  const lines = section.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    const header = splitMarkdownRow(lines[index]);
    const separator = splitMarkdownRow(lines[index + 1]);
    if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const roleIndex = firstColumn(header, ["Role"]);
    const statusIndex = firstColumn(header, ["Status"]);
    if (roleIndex < 0 || statusIndex < 0) continue;
    const indexes = {
      role: roleIndex,
      status: statusIndex,
      authorizedBy: firstColumn(header, ["Authorized By"]),
      authorizedAt: firstColumn(header, ["Authorized At"]),
      scope: firstColumn(header, ["Scope"]),
      worktreeBranch: firstColumn(header, ["Worktree / Branch", "Worktree", "Branch"]),
    };
    return lines
      .slice(index + 2)
      .filter((line) => line.trim().startsWith("|"))
      .map(splitMarkdownRow)
      .filter((row) => row.length === header.length)
      .map((row) => Object.fromEntries(Object.entries(indexes).map(([key, column]) => [key, column >= 0 ? row[column] || "" : ""])));
  }
  return [];
}

function markdownSection(content, heading) {
  const lines = String(content || "").split(/\r?\n/);
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = lines.findIndex((line) => new RegExp(`^##\\s+${escaped}\\s*$`, "i").test(line.trim()));
  if (start < 0) return "";
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

function isConcreteAuthorizationValue(value) {
  const raw = String(value || "").replace(/`/g, "").trim();
  return Boolean(raw) && !/^\[.*\]$/.test(raw) && !/^(pending|n\/a|na|none|-|—|–|待授权|待定|无)$/i.test(raw);
}

function isWorkerAuthorizedStatus(value) {
  const raw = String(value || "")
    .replace(/`/g, "")
    .trim()
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/\s+/g, "-");
  if (!raw || /^(not-authorized|unauthorized|pending|no|false|未授权|待授权)$/.test(raw)) return false;
  return /(^|\b)(authorized|used|active|approved)(\b|$)|已授权|已使用/.test(raw);
}
