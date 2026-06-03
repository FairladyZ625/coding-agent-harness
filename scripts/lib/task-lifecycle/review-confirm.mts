// Dynamic review confirmation flow stays behavior-first until the metadata domain model PR.

import fs from "node:fs";
import path from "node:path";
import {
  lessonCandidatesFile,
  nowTimestamp,
  readFileSafe,
  toPosix,
} from "../core-shared.mjs";
import {
  parseTaskAuditMetadata,
  readGitIdentity,
  replaceTaskAuditMetadata,
  taskAuditFieldOrder,
} from "../task-audit-metadata.mjs";
import {
  parseTaskBudget,
} from "../task-metadata.mjs";
import {
  collectReviewRisks,
  isBlockingReviewRisk,
} from "../task-review-model.mjs";
import {
  isLessonCandidateDecisionComplete,
  parseLessonCandidateStatus,
} from "../task-lesson-candidates.mjs";
import {
  resolveHarnessPaths,
  taskIdFromDirectory,
} from "../harness-paths.mjs";
import { commitReviewConfirmationGate, prepareReviewConfirmGitGate } from "../review-confirm-git-gate.mjs";
import { validateHumanReviewConfirmation } from "./review-gates.mjs";
import { markdownCell } from "./text-utils.mjs";
import type { ResolvedHarnessPaths } from "../harness-paths.mjs";

type ReviewConfirmationTarget = {
  projectRoot: string;
  docsRoot?: string;
  locale?: string;
  harness?: ResolvedHarnessPaths & {
    taskRoots?: string[];
  } & Record<string, unknown>;
  [key: string]: unknown;
};

type ReviewTask = {
  id?: string;
  shortId?: string;
  title?: string;
  path?: string;
  reviewStatus?: string;
  walkthroughPath?: string;
  reviewQueueState?: string;
  state?: string;
  taskQueues?: string[];
  lessonCandidateDecisionComplete?: boolean;
  lessonCandidateStatus?: string;
};

type ReviewConfirmationContext = {
  target: ReviewConfirmationTarget;
  taskDir: string;
  findTaskByDirectory: (target: ReviewConfirmationTarget, taskDir: string) => ReviewTask | undefined;
};

type ConfirmTaskReviewOptions = {
  reviewer?: string;
  message?: string;
  confirmText?: string;
  evidence?: string;
  deferCommit?: boolean;
};

type AuditFields = Record<string, string>;

export function confirmTaskReview(
  { target, taskDir, findTaskByDirectory }: ReviewConfirmationContext,
  { reviewer = "Human Reviewer", message = "", confirmText = "", evidence = "", deferCommit = false }: ConfirmTaskReviewOptions = {},
) {
  assertTaskDirectoryInsidePlanning(target, taskDir);
  const canonicalTaskId = reviewConfirmationTaskId(target, taskDir);
  const shortId = path.basename(taskDir);
  if (confirmText && ![shortId, canonicalTaskId].includes(confirmText)) {
    throw new Error(`Review confirmation text must match task id: ${shortId}`);
  }
  if (!confirmText) throw new Error(`Missing review confirmation text: ${shortId}`);

  const reviewPath = path.join(taskDir, "review.md");
  const indexPath = path.join(taskDir, "INDEX.md");
  const reviewContent = readFileSafe(reviewPath);
  const indexContent = readFileSafe(indexPath);
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
  const gitGate = prepareReviewConfirmGitGate(target.projectRoot, [indexPath]);

  const timestamp = nowTimestamp();
  const confirmationId = `HRC-${timestamp.replace(/[^0-9]/g, "").slice(0, 14)}`;
  const identity = readGitIdentity(target.projectRoot);
  const baseAuditFields = taskAuditFieldsFromIndex(indexContent);
  const buildAuditFields = ({ commitSha = "pending", auditStatus = "commit-pending" }: { commitSha?: string; auditStatus?: string } = {}): AuditFields => ({
    ...baseAuditFields,
    "Human Review Status": "confirmed",
    "Confirmation ID": confirmationId,
    "Confirmed At": timestamp,
    "Reviewer": reviewer || identity.name || "Human Reviewer",
    "Reviewer Email": identity.email || "n/a",
    "Confirm Text": markdownCell(confirmText),
    "Evidence Checked": evidence || `TARGET:${toPosix(path.relative(target.projectRoot, reviewPath))}`,
    "Review Commit SHA": commitSha,
    "Audit Source": "native-index",
    "Audit Status": auditStatus,
    "Message": message || "Human review confirmed",
    "Migration Status": baseAuditFields["Migration Status"] || "native",
  });
  fs.writeFileSync(indexPath, ensureTrailingNewline(replaceTaskAuditMetadata(indexContent, buildAuditFields(), { locale: target.locale })));
  if (deferCommit) {
    const task = reviewConfirmationResultTask(target, taskDir, canonicalTaskId, findTaskByDirectory(target, taskDir));
    return {
      event: "review-confirm",
      task,
      audit: {
        commitSha: "pending",
        auditCommitSha: "",
        auditStatus: "deferred",
        allowedPaths: gitGate.allowedPaths,
        message: message || `Human review confirmed by ${reviewer}`,
      },
    };
  }
  const audit = commitReviewConfirmationGate(gitGate, {
    taskId: canonicalTaskId,
    reviewPath: indexPath,
    message: message || `Human review confirmed by ${reviewer}`,
    writeFinalAudit(commitSha) {
      const currentIndex = readFileSafe(indexPath);
      const finalIndex = replaceTaskAuditMetadata(currentIndex, buildAuditFields({ commitSha, auditStatus: "committed" }), { locale: target.locale });
      fs.writeFileSync(indexPath, ensureTrailingNewline(finalIndex));
    },
  });
  const task = reviewConfirmationResultTask(target, taskDir, canonicalTaskId, findTaskByDirectory(target, taskDir));
  return {
    event: "review-confirm",
    task,
    audit,
  };
}

export function finalizeDeferredTaskReviewConfirmation(
  { target, taskDir, findTaskByDirectory }: ReviewConfirmationContext,
  { commitSha = "" }: { commitSha?: string } = {},
) {
  assertTaskDirectoryInsidePlanning(target, taskDir);
  if (!commitSha) throw new Error("Missing deferred review confirmation commit SHA");
  const canonicalTaskId = reviewConfirmationTaskId(target, taskDir);
  const indexPath = path.join(taskDir, "INDEX.md");
  const indexContent = readFileSafe(indexPath);
  const existingAudit = taskAuditFieldsFromIndex(indexContent);
  const finalIndex = replaceTaskAuditMetadata(indexContent, {
    ...existingAudit,
    "Review Commit SHA": commitSha,
    "Audit Status": "committed",
  }, { locale: target.locale });
  fs.writeFileSync(indexPath, ensureTrailingNewline(finalIndex));
  const task = reviewConfirmationResultTask(target, taskDir, canonicalTaskId, findTaskByDirectory(target, taskDir));
  return {
    event: "review-confirm-audit",
    task,
    indexPath,
  };
}

function reviewConfirmationResultTask(target: ReviewConfirmationTarget, taskDir: string, canonicalTaskId: string, task?: ReviewTask): ReviewTask {
  const shortId = path.basename(taskDir);
  return {
    id: task?.id || canonicalTaskId,
    shortId: task?.shortId || shortId,
    title: task?.title || task?.id || canonicalTaskId,
    path: task?.path || `TARGET:${toPosix(path.relative(target.projectRoot, taskDir))}`,
    ...task,
    reviewStatus: task?.reviewStatus || "confirmed",
  };
}

function assertTaskDirectoryInsidePlanning(target: ReviewConfirmationTarget, taskDir: string) {
  const realTaskDir = fs.realpathSync(taskDir);
  const allowedRoots = (target.harness?.taskRoots || [])
    .filter(fs.existsSync)
    .map((root) => fs.realpathSync(root));
  if (!allowedRoots.some((root) => realTaskDir === root || realTaskDir.startsWith(`${root}${path.sep}`))) {
    throw new Error(`Task directory outside planning root: ${reviewConfirmationTaskId(target, taskDir)}`);
  }
}

function reviewConfirmationTaskId(target: ReviewConfirmationTarget, taskDir: string): string {
  return taskIdFromDirectory(target.harness || resolveHarnessPaths(target), taskDir);
}

function taskAuditFieldsFromIndex(content: string): AuditFields {
  const audit = parseTaskAuditMetadata(content, { required: true });
  const fields: AuditFields = {};
  for (const field of taskAuditFieldOrder) fields[field] = audit.fields.get(field.toLowerCase()) || "n/a";
  return fields;
}

function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
