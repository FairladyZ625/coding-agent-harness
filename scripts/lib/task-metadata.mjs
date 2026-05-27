// @ts-nocheck
// Dynamic metadata parsing stays behavior-first until the metadata domain model PR.
import { allowedTaskStates, allowedTaskBudgets, taskContractMarker, } from "./core-shared.mjs";
import { tableAfterHeading, firstColumn } from "./markdown-utils.mjs";
export function parseTaskState(progressContent) {
    return parseTaskStateInfo(progressContent).state;
}
export function parseTaskBudget(taskPlanContent) {
    const match = String(taskPlanContent || "").match(/^Selected budget\s*[:：]\s*([^\n]+)/im) ||
        String(taskPlanContent || "").match(/^选择预算\s*[:：]\s*([^\n]+)/im);
    if (!match)
        return "standard";
    const raw = match[1].replace(/`/g, "").trim().toLowerCase();
    const normalized = raw.replaceAll("_", "-").replace(/\s+/g, "-");
    if (allowedTaskBudgets.has(normalized))
        return normalized;
    if (["long-running", "longrunning", "module-parallel"].includes(normalized))
        return "complex";
    return "standard";
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
export function parseTaskMetadata(taskPlanContent) {
    const content = String(taskPlanContent || "");
    const kind = normalizeMetadataValue(parseMetadataLine(content, ["Task Kind", "任务类型"]), "general");
    const preset = normalizeMetadataValue(parseMetadataLine(content, ["Task Preset", "Preset", "任务预设"]), "none");
    const presetVersion = parseMetadataLine(content, ["Preset Version", "预设版本"]);
    const migrationTargetLevel = normalizeMetadataValue(parseMetadataLine(content, ["Migration Target Level", "Target Level", "迁移目标等级", "目标等级"]), "");
    const migrationAchievedLevel = normalizeMetadataValue(parseMetadataLine(content, ["Migration Achieved Level", "Achieved Level", "迁移实际完成等级", "实际完成等级"]), "");
    const evidenceBundle = parseMetadataLine(content, ["Evidence Bundle", "证据包"]);
    return {
        kind,
        preset,
        presetVersion,
        migrationTargetLevel,
        migrationAchievedLevel,
        evidenceBundle,
    };
}
export function parseTaskContractInfo(taskPlanContent) {
    const content = String(taskPlanContent || "");
    const explicit = content.match(/^Task Contract\s*[:：]\s*`?([^`\n]+)`?\s*$/im) ||
        content.match(/^任务合同\s*[:：]\s*`?([^`\n]+)`?\s*$/im);
    const version = explicit ? explicit[1].trim() : "";
    return {
        version,
        generated: version === "harness-task/v1" || content.includes(taskContractMarker),
    };
}
export function parseTaskStateInfo(progressContent) {
    const match = progressContent.match(/^##\s*(?:Current Status|Status|状态)\s*[:：]?\s*(?:\n\s*)?([^\n]+)/im);
    if (!match)
        return inferLegacyTaskState(progressContent);
    const raw = match[1].replace(/`/g, "").trim();
    if (!raw || raw.includes("|") || /^[-*]\s+/.test(raw))
        return inferLegacyTaskState(progressContent);
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
    if (statusIndex < 0 || rows.length === 0)
        return { state: "unknown", source: "missing", raw: "" };
    const states = rows.map((row) => normalizeLegacyState(row[statusIndex])).filter(Boolean);
    if (states.includes("blocked"))
        return { state: "blocked", source: "legacy-table", raw: "blocked" };
    if (states.includes("in_progress"))
        return { state: "in_progress", source: "legacy-table", raw: "in_progress" };
    if (states.includes("review"))
        return { state: "review", source: "legacy-table", raw: "review" };
    if (states.length > 0 && states.every((state) => state === "done"))
        return { state: "done", source: "legacy-table", raw: "done" };
    if (states.some((state) => ["planned", "not_started"].includes(state)))
        return { state: "planned", source: "legacy-table", raw: "planned" };
    return { state: "unknown", source: "missing", raw: "" };
}
function normalizeLegacyState(value) {
    const raw = String(value || "").replace(/`/g, "").trim().toLowerCase();
    if (!raw || /^(none|n\/a|na|-|—|–|无)$/.test(raw))
        return "";
    if (/block|阻塞|blocked/.test(raw))
        return "blocked";
    if (/in[-_\s]?progress|doing|active|进行中|当前|working/.test(raw))
        return "in_progress";
    if (/review|审查|审核|验证中/.test(raw))
        return "review";
    if (/done|complete|completed|merged|closed|完成|已完成/.test(raw))
        return "done";
    if (/pending|planned|todo|not[-_\s]?started|未开始|计划/.test(raw))
        return "planned";
    return "";
}
