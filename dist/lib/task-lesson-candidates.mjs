// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { tableAfterHeading, firstColumn, } from "./markdown-utils.mjs";
import { toPosix } from "./core-shared.mjs";
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
    const candidateTable = lessonCandidateRows(text);
    const rows = candidateTable.rows;
    const issues = [];
    if (!allowedLessonCandidateTaskStatuses.has(declaredStatus)) {
        issues.push(`invalid-task-status:${declaredStatus}`);
    }
    for (const row of rows) {
        if (!allowedLessonCandidateRowStatuses.has(row.status))
            issues.push(`invalid-row-status:${row.id || "missing-id"}:${row.status}`);
    }
    const promotionRows = rows.filter((row) => row.status === "needs-promotion");
    if (promotionRows.length > 0) {
        for (const column of candidateTable.missingColumns)
            issues.push(`missing-column:${column}`);
        for (const row of promotionRows) {
            for (const [field, label] of [
                ["scope", "Scope"],
                ["detailArtifact", "Detail Artifact"],
                ["boundaryReason", "Boundary Reason"],
                ["whyItMightMatter", "Why It Might Matter"],
                ["promotionTarget", "Promotion Target"],
                ["conflictCheck", "Conflict Check"],
                ["requiredStandardUpdate", "Required Standard Update"],
                ["followUpTask", "Follow-up Task"],
            ]) {
                if (!String(row[field] || "").trim())
                    issues.push(`missing-row-field:${row.id || "missing-id"}:${label}`);
            }
        }
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
    if (!candidateStatus || candidateStatus.issues?.length)
        return false;
    return reviewCompleteLessonCandidateStatuses.has(candidateStatus.status);
}
export function validateLessonCandidateDetailArtifacts(target, taskDir, candidateStatus) {
    const issues = [];
    const rows = Array.isArray(candidateStatus?.rows) ? candidateStatus.rows : [];
    for (const row of rows.filter((candidate) => candidate.status === "needs-promotion")) {
        const rawPath = String(row.detailArtifact || "").trim();
        if (!rawPath)
            continue;
        const resolved = resolveTaskLocalLessonArtifact(target, taskDir, rawPath);
        if (!resolved || !isInsideDirectory(taskDir, resolved)) {
            issues.push(`invalid-detail-artifact-path:${row.id || "missing-id"}:${rawPath}`);
            continue;
        }
        if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            issues.push(`missing-detail-artifact:${row.id || "missing-id"}:${rawPath}`);
        }
    }
    return issues;
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
    if (fieldIndex < 0 || valueIndex < 0)
        return fields;
    for (const row of rows) {
        const key = String(row[fieldIndex] || "").trim().toLowerCase();
        if (key)
            fields.set(key, String(row[valueIndex] || "").trim());
    }
    return fields;
}
function resolveTaskLocalLessonArtifact(target, taskDir, artifactPath) {
    const raw = String(artifactPath || "").trim();
    if (!raw)
        return "";
    if (/^(?:https?:|file:|[A-Za-z]:\\|\/)/.test(raw))
        return "";
    const relative = raw.startsWith("TARGET:")
        ? raw.replace(/^TARGET:/, "").replace(/^\/+/, "")
        : toPosix(path.join(toPosix(path.relative(target.projectRoot, taskDir)), raw));
    return path.resolve(target.projectRoot, relative);
}
function isInsideDirectory(parent, child) {
    const relative = path.relative(parent, child);
    return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}
function lessonCandidateRows(content) {
    const { header, rows } = tableAfterHeading(content, /^ID$/i);
    const idIndex = firstColumn(header, ["ID", "候选 ID"]);
    const statusIndex = firstColumn(header, ["Row Status", "行状态", "Status", "状态"]);
    const titleIndex = firstColumn(header, ["Title", "标题"]);
    const decisionIndex = firstColumn(header, ["Review Decision", "审查决定"]);
    const targetIndex = firstColumn(header, ["Promotion Target", "沉淀目标"]);
    const scopeIndex = firstColumn(header, ["Scope", "范围"]);
    const boundaryIndex = firstColumn(header, ["Boundary Reason", "边界原因"]);
    const moduleKeyIndex = firstColumn(header, ["Module Key", "模块 Key", "模块"]);
    const detailArtifactIndex = firstColumn(header, ["Detail Artifact", "Lesson Detail", "详情产物", "详情文件"]);
    const whyIndex = firstColumn(header, ["Why It Might Matter", "价值说明", "为什么重要"]);
    const conflictIndex = firstColumn(header, ["Conflict Check", "冲突检查"]);
    const requiredUpdateIndex = firstColumn(header, ["Required Standard Update", "必需标准更新"]);
    const followUpIndex = firstColumn(header, ["Follow-up Task", "Followup Task", "后续任务"]);
    if (idIndex < 0 || statusIndex < 0)
        return { rows: [], missingColumns: [] };
    const requiredColumnSpecs = [
        ["Scope", scopeIndex],
        ["Detail Artifact", detailArtifactIndex],
        ["Boundary Reason", boundaryIndex],
        ["Why It Might Matter", whyIndex],
        ["Promotion Target", targetIndex],
        ["Conflict Check", conflictIndex],
        ["Required Standard Update", requiredUpdateIndex],
        ["Follow-up Task", followUpIndex],
    ];
    const missingColumns = requiredColumnSpecs.filter(([, index]) => index < 0).map(([label]) => label);
    return {
        missingColumns,
        rows: rows
            .filter((row) => /^LC-[A-Za-z0-9-]+$/i.test(row[idIndex] || ""))
            .map((row) => ({
            id: row[idIndex] || "",
            status: normalizeLessonCandidateStatus(row[statusIndex] || ""),
            title: row[titleIndex] || "",
            scope: scopeIndex >= 0 ? row[scopeIndex] || "" : "",
            moduleKey: moduleKeyIndex >= 0 ? row[moduleKeyIndex] || "" : "",
            detailArtifact: detailArtifactIndex >= 0 ? row[detailArtifactIndex] || "" : "",
            boundaryReason: boundaryIndex >= 0 ? row[boundaryIndex] || "" : "",
            whyItMightMatter: whyIndex >= 0 ? row[whyIndex] || "" : "",
            reviewDecision: row[decisionIndex] || "",
            promotionTarget: row[targetIndex] || "",
            conflictCheck: conflictIndex >= 0 ? row[conflictIndex] || "" : "",
            requiredStandardUpdate: requiredUpdateIndex >= 0 ? row[requiredUpdateIndex] || "" : "",
            followUpTask: followUpIndex >= 0 ? row[followUpIndex] || "" : "",
            originalRow: row.map((cell) => String(cell || "").trim()).join(" | "),
        })),
    };
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
    if (rows.length === 0)
        return declaredStatus === "no-candidate-accepted" ? "no-candidate-accepted" : declaredStatus;
    const statuses = rows.map((row) => row.status);
    if (statuses.includes("ready-for-review"))
        return "pending-review";
    if (statuses.includes("needs-promotion"))
        return "needs-promotion";
    if (statuses.every((status) => status === "promoted"))
        return "promoted";
    if (statuses.every((status) => status === "rejected"))
        return "rejected";
    if (statuses.every((status) => ["promoted", "rejected"].includes(status)))
        return "promoted";
    return declaredStatus;
}
function noCandidateReason(content) {
    const lines = String(content || "").split(/\r?\n/);
    const start = lines.findIndex((line) => /^##\s*No-Candidate Reason\s*$/i.test(line.trim()));
    if (start < 0)
        return "";
    const body = [];
    for (const line of lines.slice(start + 1)) {
        if (/^##\s+/.test(line))
            break;
        body.push(line);
    }
    return body.join("\n").replace(/`/g, "").trim();
}
