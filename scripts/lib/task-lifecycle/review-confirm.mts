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
  collectReviewRisks,
  isBlockingReviewRisk,
  isLessonCandidateDecisionComplete,
  parseLessonCandidateStatus,
  parseTaskBudget,
  taskIdForDirectory,
} from "../task-scanner.mjs";
import { commitReviewConfirmationGate, prepareReviewConfirmGitGate } from "../review-confirm-git-gate.mjs";
import { validateHumanReviewConfirmation } from "./review-gates.mjs";
import { markdownCell } from "./text-utils.mjs";
import type { TaskScannerTarget } from "../types/task-scanner.js";

type ReviewConfirmationTarget = TaskScannerTarget & {
  locale?: string;
  harness?: {
    taskRoots?: string[];
  } & Record<string, unknown>;
};

type ReviewTask = {
  id?: string;
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

const agentRuntimeEnvPatterns = [
  /^CODEX(?:_|$)/,
  /^CLAUDE_CODE(?:_|$)/,
  /^CURSOR_AGENT(?:_|$)/,
  /^AIDER(?:_|$)/,
];

export function confirmTaskReview(
  { target, taskDir, findTaskByDirectory }: ReviewConfirmationContext,
  { reviewer = "Human Reviewer", message = "", confirmText = "", evidence = "", deferCommit = false }: ConfirmTaskReviewOptions = {},
) {
  assertHumanControlledRuntime();
  assertTaskDirectoryInsidePlanning(target, taskDir);
  const canonicalTaskId = taskIdForDirectory(target, taskDir);
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
    return {
      event: "review-confirm",
      task: findTaskByDirectory(target, taskDir) || { id: canonicalTaskId, reviewStatus: "confirmed" },
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
  return {
    event: "review-confirm",
    task: findTaskByDirectory(target, taskDir) || { id: canonicalTaskId, reviewStatus: "confirmed" },
    audit,
  };
}

export function finalizeDeferredTaskReviewConfirmation(
  { target, taskDir, findTaskByDirectory }: ReviewConfirmationContext,
  { commitSha = "" }: { commitSha?: string } = {},
) {
  assertTaskDirectoryInsidePlanning(target, taskDir);
  if (!commitSha) throw new Error("Missing deferred review confirmation commit SHA");
  const canonicalTaskId = taskIdForDirectory(target, taskDir);
  const indexPath = path.join(taskDir, "INDEX.md");
  const indexContent = readFileSafe(indexPath);
  const existingAudit = taskAuditFieldsFromIndex(indexContent);
  const finalIndex = replaceTaskAuditMetadata(indexContent, {
    ...existingAudit,
    "Review Commit SHA": commitSha,
    "Audit Status": "committed",
  }, { locale: target.locale });
  fs.writeFileSync(indexPath, ensureTrailingNewline(finalIndex));
  return {
    event: "review-confirm-audit",
    task: findTaskByDirectory(target, taskDir) || { id: canonicalTaskId, reviewStatus: "confirmed" },
    indexPath,
  };
}

function assertHumanControlledRuntime() {
  const actor = String(process.env.HARNESS_ACTOR || "").trim().toLowerCase();
  if (actor && actor !== "human") {
    throw new Error(`Human review confirmation must be performed by a human-controlled runtime; HARNESS_ACTOR is ${actor}.`);
  }
  const detected = Object.keys(process.env)
    .filter((key) => agentRuntimeEnvPatterns.some((pattern) => pattern.test(key)))
    .sort();
  if (detected.length > 0) {
    throw new Error(`Human review confirmation must be performed by a human-controlled runtime; detected agent runtime env: ${detected.join(", ")}.`);
  }
}

function assertTaskDirectoryInsidePlanning(target: ReviewConfirmationTarget, taskDir: string) {
  const realTaskDir = fs.realpathSync(taskDir);
  const allowedRoots = (target.harness?.taskRoots || [])
    .filter(fs.existsSync)
    .map((root) => fs.realpathSync(root));
  if (!allowedRoots.some((root) => realTaskDir === root || realTaskDir.startsWith(`${root}${path.sep}`))) {
    throw new Error(`Task directory outside planning root: ${taskIdForDirectory(target, taskDir)}`);
  }
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
