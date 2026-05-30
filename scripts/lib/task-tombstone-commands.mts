import fs from "node:fs";
import path from "node:path";
import {
  normalizeTarget,
  nowTimestamp,
  readFileSafe,
  toPosix,
  datePrefix,
} from "./core-shared.mjs";
import { removeHeadingSectionOutsideFences } from "./markdown-utils.mjs";
import { collectTasks } from "./task-scanner.mjs";
import { resolveTaskDirectory } from "./task-lifecycle.mjs";
import { taskIdFromDirectory } from "./harness-paths.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";
import { assessArchiveEligibility, normalizeArchiveActor } from "./task-archive-eligibility.mjs";
import { normalizeReviewBoolean } from "./task-review-model.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  releaseGovernanceSync,
} from "./governance-sync.mjs";

type TombstoneTarget = ReturnType<typeof normalizeTarget>;
type ResolvedTombstoneTarget = TombstoneTarget & { harness: ResolvedHarnessPaths };
type TombstoneTask = ReturnType<typeof collectTasks>[number];
type GovernanceContext = ReturnType<typeof beginGovernanceSync>;
type TombstoneOptions = {
  reason?: string;
  deletedBy?: string;
  confirm?: string;
  allowOpenFindings?: boolean;
};
type SupersedeOptions = TombstoneOptions & {
  by?: string;
};
type ArchiveOptions = TombstoneOptions & {
  archivedBy?: string;
  archiveFields?: Record<string, unknown>;
};
type TombstoneFields = Record<string, unknown>;

export function supersedeTask(targetInput: string, oldRef: string, { by = "", reason = "", deletedBy = "", confirm = "", allowOpenFindings = false }: SupersedeOptions = {}) {
  if (!by) throw new Error("task-supersede requires --by <new-task-id>");
  const target = normalizeTarget(targetInput);
  const oldTask = resolveTask(target, oldRef);
  const newTask = resolveTask(target, by);
  assertSoftDeleteEligible(oldTask, { reason, deletedBy, confirm, allowOpenFindings, action: "task-supersede" });
  const governanceContext = beginGovernanceSync(target, { operation: `task-supersede ${oldTask.id}` });
  try {
    writeTombstone(target, oldTask, {
      State: "superseded",
      "Superseded By": newTask.id,
      Reason: reason || "superseded",
      Operator: normalizeTombstoneActor(deletedBy) || "coordinator",
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

export function softDeleteTask(targetInput: string, taskRef: string, options: TombstoneOptions = {}) {
  return deleteTask(targetInput, taskRef, { ...options, hard: false });
}

export function deleteTask(targetInput: string, taskRef: string, { hard = false, reason = "", deletedBy = "", confirm = "", allowOpenFindings = false }: TombstoneOptions & { hard?: boolean } = {}) {
  const target = normalizeTarget(targetInput);
  const task = resolveTask(target, taskRef);
  if (!hard) {
    assertSoftDeleteEligible(task, { reason, deletedBy, confirm, allowOpenFindings, action: "task-delete" });
    return writeDeletionState(target, task, "soft-deleted", reason || "soft-delete", "task-delete --soft", {
      Operator: normalizeTombstoneActor(deletedBy) || "coordinator",
    });
  }
  assertHardDeleteEligible(target, task, { reason, deletedBy, confirm });
  const taskDir = path.join(target.projectRoot, task.path.replace(/^TARGET:/, ""));
  const allowedPaths = collectTaskDirectoryFiles(taskDir).map((file) => toPosix(path.relative(target.projectRoot, file)));
  const governanceContext = beginGovernanceSync(target, { operation: `task-delete --hard ${task.id}` });
  try {
    fs.rmSync(taskDir, { recursive: true, force: true });
    const commit = commitGovernanceSync(governanceContext, allowedPaths, {
      message: `chore(harness): hard delete task ${task.id}`,
    });
    return { taskId: task.id, deletionState: "hard-deleted", reason, governance: { commit } };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}

export function archiveTask(targetInput: string, taskRef: string, { reason = "", archivedBy = "", archiveFields = {} }: ArchiveOptions = {}) {
  const target = normalizeTarget(targetInput);
  const task = resolveTask(target, taskRef);
  const archiveAudit = assertArchiveEligible(task, { archivedBy });
  const normalizedArchiveFields = normalizeArchiveFields(archiveFields);
  assertNoReservedArchiveFields(normalizedArchiveFields);
  return writeDeletionState(target, task, "archived", reason || "archive", "task-archive", {
    ...normalizedArchiveFields,
    ...archiveAudit,
  });
}

export function reopenTask(targetInput: string, taskRef: string, { reason = "" }: TombstoneOptions = {}) {
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

function writeDeletionState(target: TombstoneTarget, task: TombstoneTask, deletionState: string, reason: string, action: string, archiveFields: TombstoneFields = {}) {
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

function taskPaths(target: TombstoneTarget, ...tasks: TombstoneTask[]): string[] {
  return [...new Set(tasks.flatMap((task) => [task.taskPlanPath, task.progressPath]).filter(Boolean).map((item) => toPosix(item.replace(/^TARGET:/, ""))))];
}

function contextFor(_target: TombstoneTarget, context: GovernanceContext): GovernanceContext {
  return context;
}

function resolveTask(target: TombstoneTarget, ref: string): TombstoneTask {
  const normalized = String(ref || "").trim();
  const resolvedTarget = target as ResolvedTombstoneTarget;
  const taskDir = resolveTaskDirectory(resolvedTarget, normalized);
  const taskId = taskIdFromDirectory(resolvedTarget.harness, taskDir);
  const task = collectTasks(target).find((candidate) => candidate.id === taskId);
  if (task) return task;
  throw new Error(`Task not found: ${ref}`);
}

function assertArchiveEligible(task: TombstoneTask, { archivedBy = "" }: { archivedBy?: string } = {}): Record<string, string> {
  const result = assessArchiveEligibility(task, { archivedBy, now: nowTimestamp() });
  if (!result.eligible) throw new Error(result.reason);
  return result.auditFields;
}

function writeTombstone(target: TombstoneTarget, task: TombstoneTask, fields: TombstoneFields): void {
  const taskPlanPath = path.join(target.projectRoot, task.taskPlanPath.replace(/^TARGET:/, ""));
  const content = removeHeadingSectionOutsideFences(readFileSafe(taskPlanPath), /^##\s*(?:Task Tombstone|任务墓碑)\s*$/i);
  const block = ["", "## Task Tombstone", "", "| Field | Value |", "| --- | --- |", ...Object.entries(fields).map(([key, value]) => `| ${key} | ${escapeCell(value)} |`), ""].join("\n");
  fs.writeFileSync(taskPlanPath, `${content.trimEnd()}\n${block}`);
}

function assertSoftDeleteEligible(task: TombstoneTask, { reason = "", deletedBy = "", confirm = "", allowOpenFindings = false, action = "task-delete" }: TombstoneOptions & { action?: string } = {}): void {
  const risky = isRiskyMutationTask(task);
  const hasOpenFindings = !isDraftState(task.state) && hasOpenBlockingFindings(task);
  if (!risky && !hasOpenFindings) return;
  const missing: string[] = [];
  if (!String(reason || "").trim()) missing.push("--reason");
  if (!normalizeTombstoneActor(deletedBy)) missing.push("--deleted-by");
  if (String(confirm || "").trim() !== task.id) missing.push(`--confirm ${task.id}`);
  if (hasOpenFindings && !allowOpenFindings) missing.push("--allow-open-findings");
  if (missing.length) {
    throw new Error(`${action} would hide a risky task; required: ${missing.join(", ")}`);
  }
}

export function assertHardDeleteEligible(target: TombstoneTarget, task: TombstoneTask, { reason = "", deletedBy = "", confirm = "" }: TombstoneOptions = {}): void {
  const missing: string[] = [];
  if (!String(reason || "").trim()) missing.push("--reason");
  if (!normalizeTombstoneActor(deletedBy)) missing.push("--deleted-by");
  if (String(confirm || "").trim() !== task.id) missing.push(`--confirm ${task.id}`);
  if (missing.length) throw new Error(`task-delete --hard requires accountable safe draft confirmation: ${missing.join(", ")}`);
  const blockers: string[] = [];
  if (!isDraftState(task.state)) blockers.push(`state:${task.state}`);
  if (task.deletionState !== "active") blockers.push(`deletionState:${task.deletionState}`);
  if (isRiskyMutationTask(task)) blockers.push("task has lifecycle, review, evidence, or closeout history");
  if (!isDraftState(task.state) && hasOpenBlockingFindings(task)) blockers.push("task has open blocking findings");
  const taskDir = path.join(target.projectRoot, task.path.replace(/^TARGET:/, ""));
  const disallowedFiles = collectTaskDirectoryFiles(taskDir).filter((file) => !isSafeDraftFile(taskDir, file));
  if (disallowedFiles.length) blockers.push(`non-scaffold files: ${disallowedFiles.map((file) => toPosix(path.relative(taskDir, file))).join(", ")}`);
  if (blockers.length) throw new Error(`task-delete --hard only supports safe draft tasks; ${blockers.join("; ")}`);
}

function isRiskyMutationTask(task: TombstoneTask): boolean {
  return !isDraftState(task.state) ||
    Boolean(task.reviewSubmitted) ||
    task.reviewStatus === "confirmed" ||
    Boolean(task.reviewConfirmation?.confirmed) ||
    task.materialsReady === true && !isDraftState(task.state) ||
    (task.evidence || []).length > 0 ||
    (task.taskQueues || []).some((queue) => ["blocked", "review", "confirmed", "finalized", "lessons"].includes(queue));
}

function isDraftState(state: unknown): boolean {
  const normalized = String(state || "").trim().toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
  return ["planned", "not_started"].includes(normalized);
}

function hasOpenBlockingFindings(task: TombstoneTask): boolean {
  return (task.risks || []).some((risk) => normalizeReviewBoolean(risk.open) !== "no" && (normalizeReviewBoolean(risk.blocksRelease) === "yes" || ["P0", "P1", "P2"].includes(String(risk.severity))));
}

function normalizeTombstoneActor(value: unknown): string {
  return normalizeArchiveActor(value);
}

function collectTaskDirectoryFiles(taskDir: string): string[] {
  if (!fs.existsSync(taskDir)) return [];
  const files: string[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  visit(taskDir);
  return files.sort();
}

function isSafeDraftFile(taskDir: string, file: string): boolean {
  const relative = toPosix(path.relative(taskDir, file));
  return [
    "INDEX.md",
    "brief.md",
    "execution_strategy.md",
    "findings.md",
    "lesson_candidates.md",
    "progress.md",
    "review.md",
    "task_plan.md",
    "visual_map.md",
    "walkthrough.md",
    "long-running-task-contract.md",
  ].includes(relative) || /^artifacts\/INDEX\.md$/.test(relative) || /^references\/INDEX\.md$/.test(relative);
}

function appendSupersedes(target: TombstoneTarget, task: TombstoneTask, oldId: string): void {
  const taskPlanPath = path.join(target.projectRoot, task.taskPlanPath.replace(/^TARGET:/, ""));
  const content = readFileSafe(taskPlanPath);
  if (/^Supersedes\s*[:：]/im.test(content)) {
    fs.writeFileSync(taskPlanPath, content.replace(/^Supersedes\s*[:：]\s*(.*)$/im, (_m, current) => `Supersedes: ${[current, oldId].filter(Boolean).join(", ")}`));
    return;
  }
  fs.writeFileSync(taskPlanPath, `${content.trimEnd()}\nSupersedes: ${oldId}\n`);
}

function appendProgress(target: TombstoneTarget, task: TombstoneTask, action: string, reason: string): void {
  const progressPath = path.join(target.projectRoot, task.progressPath.replace(/^TARGET:/, ""));
  const relative = toPosix(path.relative(target.projectRoot, progressPath));
  fs.appendFileSync(progressPath, `\n\n## Tombstone Log\n\n- ${nowTimestamp()} ${action}: ${escapeCell(reason)} (${relative})\n`);
}

function escapeCell(value: unknown): string {
  return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}

function normalizeArchiveFields(fields: TombstoneFields): Record<string, string> {
  const entries = Object.entries(fields || {});
  const normalized: Record<string, string> = {};
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

function assertNoReservedArchiveFields(fields: Record<string, string>): void {
  const reserved = new Set([
    "state",
    "reason",
    "operator",
    "timestamp",
    "reopen eligible",
    "archive eligible",
    "archived by",
    "archived at",
    "review confirmed by",
    "review confirmed at",
    "review confirmation id",
    "review commit sha",
  ]);
  const blocked = Object.keys(fields).filter((key) => reserved.has(key.toLowerCase()));
  if (blocked.length) throw new Error(`Reserved archive field cannot be overridden: ${blocked.join(", ")}`);
}
