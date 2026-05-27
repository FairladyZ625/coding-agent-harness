// @ts-nocheck
import path from "node:path";
import { readFileSafe, toPosix, walkFiles, isArchivedHarnessPath, } from "./core-shared.mjs";
import { firstColumn, splitMarkdownRow, } from "./markdown-utils.mjs";
export function validateSubagentAuthorization(target, { strict = true } = {}) {
    const failures = [];
    const warnings = [];
    const report = (message) => {
        if (strict)
            failures.push(message);
        else
            warnings.push(`adoption-needed: ${message}`);
    };
    const strategyPaths = walkFiles(target.docsRoot)
        .filter((file) => file.endsWith("execution_strategy.md"))
        .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
        .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
        .filter((file) => !isArchivedHarnessPath(file));
    for (const strategyPath of strategyPaths) {
        const relative = toPosix(path.relative(target.projectRoot, strategyPath));
        const content = readFileSafe(strategyPath);
        const rows = subagentAuthorizationRows(content);
        for (const row of rows.filter((candidate) => /worker/i.test(candidate.role))) {
            if (!isWorkerAuthorizedStatus(row.status))
                continue;
            const missing = [];
            for (const [label, value] of [
                ["Authorized By", row.authorizedBy],
                ["Authorized At", row.authorizedAt],
                ["Scope", row.scope],
                ["Worktree / Branch", row.worktreeBranch],
            ]) {
                if (!isConcreteAuthorizationValue(value))
                    missing.push(label);
            }
            if (missing.length > 0)
                report(`${relative} worker subagent authorization is incomplete: ${missing.join(", ")}`);
        }
        const delegation = subagentDelegationRows(content).find((row) => /worker/i.test(row.question));
        if (delegation && normalizeDecision(delegation.decision) === "ask-user") {
            const userDecision = userAuthorizationRows(content).reverse().find((row) => /worker/i.test(row.gate) && isResolvedWorkerGateState(row.state));
            if (!userDecision) {
                report(`${relative} worker subagent ask-user decision is unresolved: missing User Authorization Decision`);
            }
            else {
                const missing = missingUserDecisionFields(userDecision);
                if (missing.length > 0)
                    report(`${relative} worker subagent authorization decision is incomplete: ${missing.join(", ")}`);
            }
        }
    }
    return { failures, warnings };
}
function subagentAuthorizationRows(content) {
    const section = markdownSection(content, "Subagent Authorization");
    if (!section)
        return [];
    const lines = section.split(/\r?\n/);
    for (let index = 0; index < lines.length - 1; index += 1) {
        if (!lines[index].trim().startsWith("|"))
            continue;
        const header = splitMarkdownRow(lines[index]);
        const separator = splitMarkdownRow(lines[index + 1]);
        if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell)))
            continue;
        const roleIndex = firstColumn(header, ["Role"]);
        const statusIndex = firstColumn(header, ["Status"]);
        if (roleIndex < 0 || statusIndex < 0)
            continue;
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
function subagentDelegationRows(content) {
    const section = markdownSection(content, "Subagent Delegation Decision");
    if (!section)
        return [];
    return parseFirstTable(section, ["Question", "Decision"]).map((row) => ({
        question: row.Question || "",
        decision: row.Decision || "",
    }));
}
function userAuthorizationRows(content) {
    return parseMatchingTables(content, ["Gate", "State"]).map((row) => ({
        gate: row.Gate || "",
        state: row.State || "",
        decidedBy: row["Decided By"] || "",
        decidedAt: row["Decided At"] || "",
        scope: row.Scope || "",
        worktreeBranch: row["Worktree / Branch"] || row.Worktree || row.Branch || "",
    }));
}
function parseMatchingTables(content, requiredColumns) {
    const lines = String(content || "").split(/\r?\n/);
    const rows = [];
    for (let index = 0; index < lines.length - 1; index += 1) {
        if (!lines[index].trim().startsWith("|"))
            continue;
        const header = splitMarkdownRow(lines[index]);
        const separator = splitMarkdownRow(lines[index + 1]);
        if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell)))
            continue;
        if (requiredColumns.some((column) => firstColumn(header, [column]) < 0))
            continue;
        let rowIndex = index + 2;
        while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
            const row = splitMarkdownRow(lines[rowIndex]);
            if (row.length === header.length)
                rows.push(Object.fromEntries(header.map((column, columnIndex) => [column, row[columnIndex] || ""])));
            rowIndex += 1;
        }
    }
    return rows;
}
function parseFirstTable(content, requiredColumns) {
    const lines = String(content || "").split(/\r?\n/);
    for (let index = 0; index < lines.length - 1; index += 1) {
        if (!lines[index].trim().startsWith("|"))
            continue;
        const header = splitMarkdownRow(lines[index]);
        const separator = splitMarkdownRow(lines[index + 1]);
        if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell)))
            continue;
        if (requiredColumns.some((column) => firstColumn(header, [column]) < 0))
            continue;
        return lines
            .slice(index + 2)
            .filter((line) => line.trim().startsWith("|"))
            .map(splitMarkdownRow)
            .filter((row) => row.length === header.length)
            .map((row) => Object.fromEntries(header.map((column, columnIndex) => [column, row[columnIndex] || ""])));
    }
    return [];
}
function markdownSection(content, heading) {
    const lines = String(content || "").split(/\r?\n/);
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const start = lines.findIndex((line) => new RegExp(`^##\\s+${escaped}\\s*$`, "i").test(line.trim()));
    if (start < 0)
        return "";
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
    if (!raw || /^(not-authorized|unauthorized|pending|no|false|未授权|待授权)$/.test(raw))
        return false;
    return /(^|\b)(authorized|used|active|approved)(\b|$)|已授权|已使用/.test(raw);
}
function normalizeDecision(value) {
    return String(value || "")
        .replace(/`/g, "")
        .trim()
        .toLowerCase()
        .replaceAll("_", "-")
        .replace(/\s+/g, "-");
}
function isResolvedWorkerGateState(value) {
    const raw = normalizeDecision(value);
    return /^(authorized|approved|denied|rejected|not-needed|not-authorized|no|yes|无需|拒绝|已授权)$/.test(raw);
}
function missingUserDecisionFields(row) {
    const state = normalizeDecision(row.state);
    const required = state === "authorized" || state === "approved" || state === "yes" || state === "已授权"
        ? [
            ["Decided By", row.decidedBy],
            ["Decided At", row.decidedAt],
            ["Scope", row.scope],
            ["Worktree / Branch", row.worktreeBranch],
        ]
        : [
            ["Decided By", row.decidedBy],
            ["Decided At", row.decidedAt],
        ];
    return required.filter(([, value]) => !isConcreteAuthorizationValue(value)).map(([label]) => label);
}
