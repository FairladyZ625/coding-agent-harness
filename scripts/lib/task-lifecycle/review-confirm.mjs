import fs from "node:fs";
import path from "node:path";
import {
  lessonCandidatesFile,
  nowTimestamp,
  readFileSafe,
} from "../core-shared.mjs";
import {
  collectReviewRisks,
  isBlockingReviewRisk,
  isLessonCandidateDecisionComplete,
  parseLessonCandidateStatus,
  parseTaskBudget,
  taskIdForDirectory,
} from "../task-scanner.mjs";
import { commitReviewConfirmationGate, prepareReviewConfirmGitGate } from "../review-confirm-git-gate.mjs";
import { validateHumanReviewConfirmation } from "./review-gates.mjs";
import { appendProgressLog, markdownCell } from "./text-utils.mjs";

export function confirmTaskReview({ target, taskDir, findTaskByDirectory }, { reviewer = "Human Reviewer", message = "", confirmText = "", evidence = "" } = {}) {
  assertTaskDirectoryInsidePlanning(target, taskDir);
  const canonicalTaskId = taskIdForDirectory(target, taskDir);
  const shortId = path.basename(taskDir);
  if (confirmText && ![shortId, canonicalTaskId].includes(confirmText)) {
    throw new Error(`Review confirmation text must match task id: ${shortId}`);
  }
  if (!confirmText) throw new Error(`Missing review confirmation text: ${shortId}`);

  const reviewPath = path.join(taskDir, "review.md");
  const progressPath = path.join(taskDir, "progress.md");
  const reviewContent = readFileSafe(reviewPath);
  const budget = parseTaskBudget(readFileSafe(path.join(taskDir, "task_plan.md")));
  const candidateStatus = parseLessonCandidateStatus(readFileSafe(path.join(taskDir, lessonCandidatesFile)));
  const blockingRisks = collectReviewRisks(reviewContent).filter(isBlockingReviewRisk);
  if (blockingRisks.length > 0) {
    const ids = blockingRisks.map((risk) => risk.id || risk.severity).join(", ");
    throw new Error(`Open blocking review findings must be closed before confirmation: ${ids}`);
  }
  validateHumanReviewConfirmation({
    task: findTaskByDirectory(target, taskDir),
    budget,
  });
  if (budget !== "simple" && !isLessonCandidateDecisionComplete(candidateStatus)) {
    throw new Error(`Human review confirmation requires lesson candidate decision complete; current status is ${candidateStatus.status}.`);
  }
  const gitGate = prepareReviewConfirmGitGate(target.projectRoot, [reviewPath, progressPath]);

  const timestamp = nowTimestamp();
  const confirmationId = `HRC-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const safeReviewer = markdownCell(reviewer || "Human Reviewer");
  const safeReviewerEmail = markdownCell(process.env.GIT_AUTHOR_EMAIL || process.env.GIT_COMMITTER_EMAIL || "reviewer@example.invalid");
  const safeMessage = markdownCell(message || "Human review confirmed");
  const safeEvidence = markdownCell(evidence || `TARGET:docs/09-PLANNING/${canonicalTaskId}/review.md`);
  const renderConfirmationBlock = ({ commitSha = "pending", auditStatus = "commit-pending" } = {}) =>
    `## Human Review Confirmation\n\n| Field | Value |\n| --- | --- |\n| Confirmation ID | ${confirmationId} |\n| Confirmed At | ${timestamp} |\n| Reviewer | ${safeReviewer} |\n| Reviewer Email | ${safeReviewerEmail} |\n| Task Key | ${canonicalTaskId} |\n| Confirm Text | ${markdownCell(confirmText)} |\n| Evidence Checked | ${safeEvidence} |\n| Commit SHA | ${markdownCell(commitSha)} |\n| Audit Status | ${markdownCell(auditStatus)} |\n| Message | ${safeMessage} |\n`;
  const confirmationBlock = renderConfirmationBlock();
  const nextReview = replaceReviewConfirmation(reviewContent, confirmationBlock);
  fs.writeFileSync(reviewPath, nextReview.endsWith("\n") ? nextReview : `${nextReview}\n`);
  let progressContent = readFileSafe(progressPath);
  progressContent = appendProgressLog(progressContent, {
    event: "review-confirm",
    message: message || `Human review confirmed by ${reviewer}`,
    evidence: evidence || `TARGET:docs/09-PLANNING/${canonicalTaskId}/review.md`,
    actor: reviewer || "Human Reviewer",
  });
  fs.writeFileSync(progressPath, progressContent.endsWith("\n") ? progressContent : `${progressContent}\n`);
  const audit = commitReviewConfirmationGate(gitGate, {
    taskId: canonicalTaskId,
    reviewPath,
    message: message || `Human review confirmed by ${reviewer}`,
    writeFinalAudit(commitSha) {
      const currentReview = readFileSafe(reviewPath);
      const finalReview = replaceReviewConfirmation(currentReview, renderConfirmationBlock({ commitSha, auditStatus: "committed" }));
      fs.writeFileSync(reviewPath, finalReview.endsWith("\n") ? finalReview : `${finalReview}\n`);
    },
  });
  return {
    event: "review-confirm",
    task: findTaskByDirectory(target, taskDir) || { id: canonicalTaskId, reviewStatus: "confirmed" },
    audit,
  };
}

function assertTaskDirectoryInsidePlanning(target, taskDir) {
  const realTaskDir = fs.realpathSync(taskDir);
  const allowedRoots = [
    path.join(target.docsRoot, "09-PLANNING/TASKS"),
    path.join(target.docsRoot, "09-PLANNING/MODULES"),
  ].filter(fs.existsSync).map((root) => fs.realpathSync(root));
  if (!allowedRoots.some((root) => realTaskDir === root || realTaskDir.startsWith(`${root}${path.sep}`))) {
    throw new Error(`Task directory outside planning root: ${taskIdForDirectory(target, taskDir)}`);
  }
}

function replaceReviewConfirmation(content, block) {
  const trimmed = String(content || "").trimEnd();
  if (/^##\s*(?:Human Review Confirmation|人工审查确认)\s*$/im.test(trimmed)) {
    return trimmed.replace(/^##\s*(?:Human Review Confirmation|人工审查确认)\s*$[\s\S]*?(?=^##\s+|(?![\s\S]))/im, `${block.trimEnd()}\n\n`);
  }
  return `${trimmed}\n\n${block.trimEnd()}\n`;
}
