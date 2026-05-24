import fs from "node:fs";
import path from "node:path";
import {
  lessonCandidatesFile,
} from "../core-shared.mjs";
import {
  collectReviewRisks,
  isBlockingReviewRisk,
  parsePhases,
  parseReviewConfirmation,
  readVisualMapContractFile,
} from "../task-scanner.mjs";

export function validateLifecycleTransition({ event, currentState, budget, reviewContent = "", reviewTaskKey = "", projectRoot = "", taskDir = "" }) {
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
    if (!parseReviewConfirmation(reviewContent, { taskKey: reviewTaskKey, projectRoot, taskDir })?.confirmed) {
      throw new Error("Human review must be confirmed before task-complete. Run review-confirm first.");
    }
  }
}

export function validateReviewEntryGate(taskDir, budget) {
  if (budget === "simple") return;
  const candidatePath = path.join(taskDir, lessonCandidatesFile);
  if (!fs.existsSync(candidatePath)) {
    throw new Error(`task-review requires ${lessonCandidatesFile} before entering human review.`);
  }
  const phases = parsePhases(readVisualMapContractFile(taskDir).content);
  const actionablePhases = phases.filter((phase) => phase.state !== "skipped");
  const hasRecordedPhaseProgress = actionablePhases.some(
    (phase) =>
      phase.completion > 0 ||
      ["in_progress", "review", "blocked", "done"].includes(phase.state) ||
      ["partial", "present", "waived"].includes(phase.evidenceStatus),
  );
  if (actionablePhases.length > 0 && !hasRecordedPhaseProgress) {
    throw new Error("task-review requires at least one Visual Map phase progress update. Run task-phase before entering human review.");
  }
}

export function validateHumanReviewConfirmation({ task, budget }) {
  if (budget === "simple") return;
  if (!task?.walkthroughPath) {
    throw new Error("Human review confirmation requires a walkthrough linked from Closeout SSoT before review-confirm.");
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
