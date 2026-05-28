// @ts-nocheck
// Dynamic review submission rendering stays behavior-first until the metadata domain model PR.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { lessonCandidatesFile, longRunningTaskContractFile, nowTimestamp, readFileSafe, toPosix, visualMapFile, } from "../core-shared.mjs";
import { collectReviewRisks, isBlockingReviewRisk, taskScannerVersion, } from "../task-review-model.mjs";
import { markdownCell } from "./text-utils.mjs";
export function renderAgentReviewSubmission({ target, taskDir, canonicalTaskId, message, evidence }) {
    const timestamp = nowTimestamp();
    const submissionId = `ARS-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`;
    const materialsHash = hashTaskMaterials(taskDir);
    const reviewContent = readFileSafe(path.join(taskDir, "review.md"));
    const openFindings = collectReviewRisks(reviewContent).filter(isBlockingReviewRisk).length;
    const evidenceSummary = evidence || message || "Agent submitted task for human review.";
    return [
        "## Agent Review Submission",
        "",
        "| Field | Value |",
        "| --- | --- |",
        `| Submission ID | ${submissionId} |`,
        `| Submitted At | ${timestamp} |`,
        "| Submitted By | agent |",
        `| Task Key | ${canonicalTaskId} |`,
        `| Materials Checklist Hash | ${materialsHash} |`,
        `| Evidence Summary | ${markdownCell(evidenceSummary)} |`,
        `| Open Findings Count | ${openFindings} |`,
        `| Scanner Version | ${taskScannerVersion} |`,
        `| Target | TARGET:${toPosix(path.relative(target.projectRoot, taskDir))} |`,
        "",
    ].join("\n");
}
export function replaceAgentReviewSubmission(content, block) {
    const trimmed = String(content || "").trimEnd();
    if (/^##\s*(?:Agent Review Submission|Agent 审查提交|Agent 提交审查)\s*$/im.test(trimmed)) {
        return `${trimmed.replace(/^##\s*(?:Agent Review Submission|Agent 审查提交|Agent 提交审查)\s*$[\s\S]*?(?=^##\s+|(?![\s\S]))/im, `${block.trimEnd()}\n\n`)}\n`;
    }
    return `${trimmed}\n\n${block.trimEnd()}\n`;
}
function hashTaskMaterials(taskDir) {
    const hash = crypto.createHash("sha256");
    for (const fileName of ["brief.md", "task_plan.md", visualMapFile, lessonCandidatesFile, "progress.md", "review.md", "findings.md", longRunningTaskContractFile]) {
        const filePath = path.join(taskDir, fileName);
        if (!fs.existsSync(filePath))
            continue;
        hash.update(fileName);
        hash.update("\0");
        hash.update(readFileSafe(filePath));
        hash.update("\0");
    }
    return hash.digest("hex").slice(0, 16);
}
