// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import {
  normalizeTarget,
  nowTimestamp,
  readFileSafe,
  toPosix,
  datePrefix,
} from "./core-shared.mjs";
import { isConcreteAuditField } from "./task-audit-metadata.mjs";
import { removeHeadingSectionOutsideFences } from "./markdown-utils.mjs";
import { collectTasks } from "./task-scanner.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  releaseGovernanceSync,
} from "./governance-sync.mjs";

export function supersedeTask(targetInput, oldRef, { by = "", reason = "" } = {}) {
  if (!by) throw new Error("task-supersede requires --by <new-task-id>");
  const target = normalizeTarget(targetInput);
  const oldTask = resolveTask(target, oldRef);
  const newTask = resolveTask(target, by);
  const governanceContext = beginGovernanceSync(target, { operation: `task-supersede ${oldTask.id}` });
  try {
    writeTombstone(target, oldTask, {
      State: "superseded",
      "Superseded By": newTask.id,
      Reason: reason || "superseded",
      Operator: "coordinator",
      Timestamp: nowTimestamp(),
      "Reopen Eligible": "yes",
      "Archive Eligible": "no",
    });
    appendProgress(target, oldTask, `task-supersede: superseded by ${newTask.id}`, reason || "superseded");
    appendSupersedes(target, newTask, oldTask.id);
    const commit = commitGovernanceSync(contextFor(target, governanceContext), taskPaths(target, oldTask, newTask), {
      message: `chore(harness): supersede task ${oldTask.id}`,
    });
    return { taskId: oldTask.id, supersededBy: newTask.id, reason: reason || "superseded", governance: { commit } };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}

export function softDeleteTask(targetInput, taskRef, { reason = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const task = resolveTask(target, taskRef);
  return writeDeletionState(target, task, "soft-deleted", reason || "soft-delete", "task-delete --soft");
}

export function archiveTask(targetInput, taskRef, { reason = "", archivedBy = "", archiveFields = {} } = {}) {
  const target = normalizeTarget(targetInput);
  const task = resolveTask(target, taskRef);
  const archiveAudit = assertArchiveEligible(task, { archivedBy });
  return writeDeletionState(target, task, "archived", reason || "archive", "task-archive", {
    ...archiveAudit,
    ...archiveFields,
  });
}

export function reopenTask(targetInput, taskRef, { reason = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const task = resolveTask(target, taskRef);
  const governanceContext = beginGovernanceSync(target, { operation: `task-reopen ${task.id}` });
  try {
    const taskPlanPath = path.join(target.projectRoot, task.taskPlanPath.replace(/^TARGET:/, ""));
    const content = readFileSafe(taskPlanPath);
    const next = removeHeadingSectionOutsideFences(content, /^##\s*(?:Task Tombstone|任务墓碑)\s*$/i);
    fs.writeFileSync(taskPlanPath, next.endsWith("\n") ? next : `${next}\n`);
    appendProgress(target, task, "task-reopen", reason || "reopened");
    const commit = commitGovernanceSync(governanceContext, taskPaths(target, task), {
      message: `chore(harness): reopen task ${task.id}`,
    });
    return { taskId: task.id, deletionState: "active", reason: reason || "reopened", governance: { commit } };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}

function writeDeletionState(target, task, deletionState, reason, action, archiveFields = {}) {
  const normalizedArchiveFields = normalizeArchiveFields(archiveFields);
  const governanceContext = beginGovernanceSync(target, { operation: `${action} ${task.id}` });
  try {
    writeTombstone(target, task, {
      State: deletionState,
      Reason: reason,
      Operator: "coordinator",
      Timestamp: nowTimestamp(),
      "Reopen Eligible": "yes",
      "Archive Eligible": deletionState === "archived" ? "yes" : "no",
      ...normalizedArchiveFields,
    });
    appendProgress(target, task, action, reason);
    const commit = commitGovernanceSync(governanceContext, taskPaths(target, task), {
      message: `chore(harness): ${action.replace(/\s+/g, " ")} ${task.id}`,
    });
    return { taskId: task.id, deletionState, reason, governance: { commit } };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}

function taskPaths(target, ...tasks) {
  return [...new Set(tasks.flatMap((task) => [task.taskPlanPath, task.progressPath]).filter(Boolean).map((item) => toPosix(item.replace(/^TARGET:/, ""))))];
}

function contextFor(_target, context) {
  return context;
}

function resolveTask(target, ref) {
  const normalized = String(ref || "").trim();
  const matches = collectTasks(target).filter((task) => {
    const bare = datePrefix.test(task.shortId) ? task.shortId.replace(datePrefix, "") : task.shortId;
    return task.id === normalized || task.shortId === normalized || task.id.endsWith(`/${normalized}`) || bare === normalized;
  });
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) throw new Error(`Ambiguous task reference: ${ref}`);
  throw new Error(`Task not found: ${ref}`);
}

function assertArchiveEligible(task, { archivedBy = "" } = {}) {
  if (task.state === "blocked" || (task.taskQueues || []).includes("blocked")) {
    throw new Error("blocked tasks cannot be archived without an explicit human waiver");
  }
  const blockingRisks = (task.risks || []).filter((risk) => risk.open !== "no" && (risk.blocksRelease === "yes" || ["P0", "P1", "P2"].includes(risk.severity)));
  if (blockingRisks.length) throw new Error("tasks with open blocking review findings cannot be archived without an explicit human waiver");
  if (task.materialsReady === false && task.reviewStatus !== "confirmed") {
    throw new Error("tasks with incomplete closeout materials cannot be archived without an explicit human waiver");
  }
  const confirmation = task.reviewConfirmation || {};
  if (confirmation.confirmed !== true) {
    throw new Error("Human review confirmation is required before task archive");
  }
  const missingConfirmationFields = [];
  if (!isConcreteAuditField(confirmation.confirmationId)) missingConfirmationFields.push("Confirmation ID");
  if (!isConcreteAuditField(confirmation.confirmedAt)) missingConfirmationFields.push("Confirmed At");
  if (!isConcreteAuditField(confirmation.reviewer)) missingConfirmationFields.push("Reviewer");
  if (!isConcreteAuditField(confirmation.commitSha)) missingConfirmationFields.push("Review Commit SHA");
  if (missingConfirmationFields.length) {
    throw new Error(`Human review confirmation is not traceable; missing ${missingConfirmationFields.join(", ")}`);
  }
  const actor = normalizeArchiveActor(archivedBy);
  if (!actor) {
    throw new Error("task archive requires --archived-by <name-or-email> for accountability");
  }
  return {
    "Archived By": actor,
    "Archived At": nowTimestamp(),
    "Review Confirmed By": confirmation.reviewer,
    "Review Confirmed At": confirmation.confirmedAt,
    "Review Confirmation ID": confirmation.confirmationId,
    "Review Commit SHA": confirmation.commitSha,
  };
}

function normalizeArchiveActor(value) {
  const actor = String(value || "").replace(/\r?\n/g, " ").trim();
  if (!actor) return "";
  if (/^(coordinator|agent|unknown|n\/a|na|none|pending|todo|tbd)$/i.test(actor)) return "";
  return actor;
}

function writeTombstone(target, task, fields) {
  const taskPlanPath = path.join(target.projectRoot, task.taskPlanPath.replace(/^TARGET:/, ""));
  const content = removeHeadingSectionOutsideFences(readFileSafe(taskPlanPath), /^##\s*(?:Task Tombstone|任务墓碑)\s*$/i);
  const block = ["", "## Task Tombstone", "", "| Field | Value |", "| --- | --- |", ...Object.entries(fields).map(([key, value]) => `| ${key} | ${escapeCell(value)} |`), ""].join("\n");
  fs.writeFileSync(taskPlanPath, `${content.trimEnd()}\n${block}`);
}

function appendSupersedes(target, task, oldId) {
  const taskPlanPath = path.join(target.projectRoot, task.taskPlanPath.replace(/^TARGET:/, ""));
  const content = readFileSafe(taskPlanPath);
  if (/^Supersedes\s*[:：]/im.test(content)) {
    fs.writeFileSync(taskPlanPath, content.replace(/^Supersedes\s*[:：]\s*(.*)$/im, (_m, current) => `Supersedes: ${[current, oldId].filter(Boolean).join(", ")}`));
    return;
  }
  fs.writeFileSync(taskPlanPath, `${content.trimEnd()}\nSupersedes: ${oldId}\n`);
}

function appendProgress(target, task, action, reason) {
  const progressPath = path.join(target.projectRoot, task.progressPath.replace(/^TARGET:/, ""));
  const relative = toPosix(path.relative(target.projectRoot, progressPath));
  fs.appendFileSync(progressPath, `\n\n## Tombstone Log\n\n- ${nowTimestamp()} ${action}: ${escapeCell(reason)} (${relative})\n`);
}

function escapeCell(value) {
  return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}

function normalizeArchiveFields(fields) {
  const entries = Object.entries(fields || {});
  const normalized = {};
  const seen = new Set();
  for (const [rawKey, rawValue] of entries) {
    const key = String(rawKey || "").trim();
    if (!key || /[\r\n|]/.test(key)) throw new Error(`Invalid archive field key: ${key || "<empty>"}`);
    const normalizedKey = key.toLowerCase();
    if (seen.has(normalizedKey)) throw new Error(`Duplicate archive field key: ${key}`);
    seen.add(normalizedKey);
    normalized[key] = String(rawValue || "").replace(/\r?\n/g, " ").trim();
  }
  return normalized;
}
