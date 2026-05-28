// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { datePrefix, lessonCandidatesFile, normalizeTarget, readFileSafe, slug, toPosix, } from "./core-shared.mjs";
import { collectTasks, parseLessonCandidateStatus, } from "./task-scanner.mjs";
import { beginGovernanceSync, commitGovernanceSync, releaseGovernanceSync, } from "./governance-sync.mjs";
export function promoteLessonCandidate(targetInput, taskId, candidateId, { dryRun = false, apply = false } = {}) {
    const target = normalizeTarget(targetInput);
    const normalizedRef = slug(taskId);
    const matchesBareSlug = (item) => {
        if (!datePrefix.test(normalizedRef)) {
            const shortBase = datePrefix.test(item.shortId) ? item.shortId.replace(datePrefix, "") : item.shortId;
            if (shortBase === normalizedRef)
                return true;
        }
        return false;
    };
    const candidates = collectTasks(target).filter((item) => item.id === taskId || item.shortId === taskId || item.id.endsWith(`/${taskId}`) || matchesBareSlug(item));
    if (candidates.length > 1) {
        const options = candidates.map((item) => `- ${item.id}`).join("\n");
        throw new Error(`Ambiguous task reference: ${taskId}\n${options}`);
    }
    const task = candidates[0];
    if (!task)
        throw new Error(`Task not found: ${taskId}`);
    if (!candidateId)
        throw new Error("Missing lesson candidate id");
    const taskDir = path.join(target.projectRoot, task.path.replace(/^TARGET:/, ""));
    const candidatePath = path.join(taskDir, lessonCandidatesFile);
    const candidateContent = readFileSafe(candidatePath);
    const parsed = parseLessonCandidateStatus(candidateContent);
    const row = parsed.rows.find((item) => item.id.toLowerCase() === candidateId.toLowerCase());
    if (!row)
        throw new Error(`Lesson candidate not found: ${candidateId}`);
    if (!["needs-promotion", "promoted"].includes(row.status)) {
        throw new Error(`Lesson candidate must be needs-promotion before promotion; current status is ${row.status}`);
    }
    const lessonId = lessonIdFromCandidate(row.id);
    const title = row.title || lessonId;
    const detailRoot = target.harness.version === 2
        ? toPosix(path.relative(target.projectRoot, path.join(target.harness.governanceRoot, "lessons")))
        : "docs/01-GOVERNANCE/lessons";
    const detailRelative = `${detailRoot}/${lessonId}-${slug(title)}.md`;
    const detailPath = path.join(target.projectRoot, detailRelative);
    const changes = [];
    if (!fs.existsSync(detailPath))
        changes.push({ action: dryRun ? "would-create" : "create", path: `TARGET:${detailRelative}` });
    if (row.status !== "promoted" || parsed.status !== "promoted")
        changes.push({ action: dryRun ? "would-update" : "update", path: task.lessonCandidatePath || `TARGET:${toPosix(path.relative(target.projectRoot, candidatePath))}` });
    const effectiveDryRun = dryRun || !apply;
    if (effectiveDryRun) {
        return {
            dryRun: true,
            applyRequired: true,
            taskId: task.id,
            candidateId: row.id,
            lessonId,
            detailDoc: `TARGET:${detailRelative}`,
            changes: changes.map((change) => ({ ...change, action: change.action.replace(/^(create|append|update)$/, "would-$1") })),
            nextCommand: `harness lesson-promote ${task.shortId} ${row.id} --apply`,
        };
    }
    const governanceContext = beginGovernanceSync(target, { operation: `lesson-promote ${task.id} ${row.id}` });
    try {
        fs.mkdirSync(path.dirname(detailPath), { recursive: true });
        if (!fs.existsSync(detailPath))
            fs.writeFileSync(detailPath, renderLessonDetail({ lessonId, candidate: row, task, detailRelative }));
        fs.writeFileSync(candidatePath, markCandidatePromoted(candidateContent, row.id, lessonId));
        const commit = commitGovernanceSync(governanceContext, [
            detailRelative,
            toPosix(path.relative(target.projectRoot, candidatePath)),
        ], { message: `chore(harness): promote lesson ${row.id}` });
        return { dryRun: false, taskId: task.id, candidateId: row.id, lessonId, detailDoc: `TARGET:${detailRelative}`, changes, governance: { commit } };
    }
    finally {
        releaseGovernanceSync(governanceContext);
    }
}
function lessonIdFromCandidate(candidateId) {
    const match = String(candidateId || "").match(/^LC-(\d{4})(\d{2})(\d{2})-(\d+)$/i);
    if (!match)
        return `L-${slug(candidateId)}`;
    return `L-${match[1]}-${match[2]}-${match[3]}-${match[4].padStart(3, "0")}`;
}
function renderLessonDetail({ lessonId, candidate, task }) {
    return [
        `# ${lessonId} - ${candidate.title || "Lesson Candidate"}`,
        "",
        "## Source",
        "",
        `- Task: ${task.id}`,
        `- Candidate: ${candidate.id}`,
        `- Promotion target: ${candidate.promotionTarget || "not specified"}`,
        "",
        "## Summary",
        "",
        candidate.title || "Promoted lesson candidate.",
        "",
        "## Why It Matters",
        "",
        candidate.reviewDecision || "Human review marked this candidate for governance promotion.",
        "",
        "## Status",
        "",
        "- State: pending governance integration",
        "",
    ].join("\n");
}
function markCandidatePromoted(content, candidateId, lessonId) {
    const lines = String(content || "").split(/\r?\n/);
    const headerIndex = lines.findIndex((line) => /^\|\s*ID\s*\|/.test(line));
    if (headerIndex >= 0) {
        const header = splitSimpleRow(lines[headerIndex]);
        const statusIndex = header.findIndex((cell) => /^(Row Status|行状态|Status|状态)$/i.test(cell));
        const decisionIndex = header.findIndex((cell) => /^(Review Decision|审查决定)$/i.test(cell));
        for (let index = headerIndex + 2; index < lines.length && lines[index].trim().startsWith("|"); index += 1) {
            const cells = splitSimpleRow(lines[index]);
            if ((cells[0] || "").toLowerCase() !== candidateId.toLowerCase())
                continue;
            if (statusIndex >= 0)
                cells[statusIndex] = "promoted";
            if (decisionIndex >= 0 && !cells[decisionIndex].includes(lessonId))
                cells[decisionIndex] = `${cells[decisionIndex]} promoted:${lessonId}`.trim();
            lines[index] = `| ${cells.map(escapeCell).join(" | ")} |`;
        }
    }
    return `${lines.join("\n")
        .replace("| Task-level status | needs-promotion |", "| Task-level status | promoted |")
        .replace("| Promotion state | not-promoted |", "| Promotion state | promoted |")
        .replace("| Closeout token | pending |", `| Closeout token | checked-created:${lessonId} |`)
        .replace(/\| Closeout token \| queued-promotion:[^|]+ \|/, `| Closeout token | checked-created:${lessonId} |`)
        .trimEnd()}\n`;
}
function splitSimpleRow(line) {
    return String(line || "").replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
}
function escapeCell(value) {
    return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}
