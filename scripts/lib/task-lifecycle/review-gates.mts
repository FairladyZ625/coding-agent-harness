// Dynamic review gate modeling stays behavior-first until the metadata domain model PR.

import fs from "node:fs";
import path from "node:path";
import {
  lessonCandidatesFile,
} from "../core-shared.mjs";
import {
  isLessonCandidateDecisionComplete,
  parseLessonCandidateStatus,
} from "../task-lesson-candidates.mjs";
import {
  collectReviewRisks,
  isBlockingReviewRisk,
  parseReviewConfirmation,
} from "../task-review-model.mjs";
import { parseTaskAuditMetadata } from "../task-audit-metadata.mjs";
import {
  parsePhases,
  readVisualMapContractFile,
} from "../task-visual-map-contract.mjs";
import {
  implementationPhases,
  phaseHasRecordedProgress,
} from "../phase-kind.mjs";
import type { TaskBudget } from "../task-metadata.mjs";

type LifecycleEvent = "task-start" | "task-review" | "task-complete";

type ReviewGateTask = {
  walkthroughPath?: string;
  reviewQueueState?: string;
  state?: string;
  taskQueues?: string[];
  lessonCandidateDecisionComplete?: boolean;
  lessonCandidateStatus?: string;
};

export function validateLifecycleTransition({
  event,
  currentState,
  budget,
  reviewContent = "",
  indexContent = "",
  reviewTaskKey = "",
  projectRoot = "",
  taskDir = "",
}: {
  event: LifecycleEvent;
  currentState?: string;
  budget: TaskBudget;
  reviewContent?: string;
  indexContent?: string;
  reviewTaskKey?: string;
  projectRoot?: string;
  taskDir?: string;
}) {
  if (event === "task-review" && currentState !== "in_progress") {
    throw new Error(`task-review requires current state in_progress; current state is ${currentState || "unknown"}`);
  }
  if (event === "task-complete" && budget !== "simple" && currentState !== "review") {
    throw new Error(`task-complete for ${budget} tasks requires current state review. Run task-review first.`);
  }
  if (event === "task-complete" && budget !== "simple") {
    const blockingRisks = collectReviewRisks(reviewContent).filter(isBlockingReviewRisk);
    if (blockingRisks.length > 0) {
      const ids = blockingRisks.map((risk) => risk.id || risk.severity).join(", ");
      throw new Error(`Open blocking review findings must be closed before task-complete: ${ids}`);
    }
    if (!parseReviewConfirmation(reviewContent, { taskKey: reviewTaskKey, taskAudit: parseTaskAuditMetadata(indexContent), projectRoot, taskDir, indexPath: path.join(taskDir, "INDEX.md"), strictGitAudit: true })?.confirmed) {
      throw new Error("Human review must be confirmed before task-complete. Confirm it from the local Dashboard workbench first.");
    }
    const lessonCandidateStatus = parseLessonCandidateStatus(fs.existsSync(path.join(taskDir, lessonCandidatesFile)) ? fs.readFileSync(path.join(taskDir, lessonCandidatesFile), "utf8") : "");
    if (!isLessonCandidateDecisionComplete(lessonCandidateStatus)) {
      throw new Error(`Lesson candidate decision must be complete before task-complete; current status is ${lessonCandidateStatus.status}.`);
    }
    const hasLessonWork = lessonCandidateStatus.status === "needs-promotion" || lessonCandidateStatus.promotionState === "queued" || lessonCandidateStatus.openCount > 0;
    if (hasLessonWork) {
      throw new Error("Lesson candidate promotion or sedimentation work must be resolved before task-complete.");
    }
  }
}

export function validateReviewEntryGate(taskDir: string, budget: TaskBudget) {
  if (budget === "simple") return;
  const candidatePath = path.join(taskDir, lessonCandidatesFile);
  if (!fs.existsSync(candidatePath)) {
    throw new Error(`task-review requires ${lessonCandidatesFile} before entering human review.`);
  }
  const phases = parsePhases(readVisualMapContractFile(taskDir).content);
  const actionablePhases = implementationPhases(phases);
  if (phases.length > 0 && actionablePhases.length === 0) {
    throw new Error("task-review requires at least one non-skipped Visual Map execution phase.");
  }
  const hasRecordedPhaseProgress = actionablePhases.some(phaseHasRecordedProgress);
  if (actionablePhases.length > 0 && !hasRecordedPhaseProgress) {
    throw new Error("task-review requires at least one Visual Map execution phase progress update. Run task-phase before entering human review.");
  }
}

export function validateHumanReviewConfirmation({ task, budget }: { task?: ReviewGateTask; budget: TaskBudget }) {
  if (budget === "simple") return;
  if (!task?.walkthroughPath) {
    throw new Error("Human review confirmation requires task-local walkthrough.md before Dashboard confirmation.");
  }
  const queueState = task?.reviewQueueState || "not-in-queue";
  if (queueState !== "ready-to-confirm") {
    const state = task?.state || "unknown";
    throw new Error(`Human review confirmation requires canonical ready-to-confirm review queue; current state is ${state}, review queue is ${queueState}.`);
  }
  if (!Array.isArray(task?.taskQueues) || !task.taskQueues.includes("review")) {
    const queues = Array.isArray(task?.taskQueues) ? task.taskQueues.join(", ") : "none";
    throw new Error(`Human review confirmation requires the task to be in the Review queue; current queues: ${queues || "none"}.`);
  }
  if (!task?.lessonCandidateDecisionComplete) {
    const status = task?.lessonCandidateStatus || "missing";
    throw new Error(`Human review confirmation requires lesson candidate decision complete; current status is ${status}.`);
  }
}
