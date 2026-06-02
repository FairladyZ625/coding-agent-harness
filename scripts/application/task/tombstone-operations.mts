import fs from "node:fs";
import path from "node:path";
import {
  normalizeTarget,
  nowTimestamp,
  readFileSafe,
  toPosix,
  datePrefix,
} from "../../lib/core-shared.mjs";
import { removeHeadingSectionOutsideFences } from "../../lib/markdown-utils.mjs";
import { taskRefPath } from "../../lib/harness-paths.mjs";
import type { ResolvedHarnessPaths } from "../../lib/harness-paths.mjs";
import { assessArchiveEligibility, normalizeArchiveActor } from "../../domain/task/archive-eligibility.mjs";
import {
  hardDeleteLifecycleBlockers,
  hasOpenBlockingTombstoneFindings,
  isDraftTaskState,
  isRiskyTombstoneMutationTask,
} from "../../domain/task/tombstone-policy.mjs";
import { tombstoneStorageRoot } from "../../lib/task-archive-storage.mjs";
import {
  assertTransactionSucceeded,
  createGovernanceHarnessTransaction,
} from "../../lib/harness-transaction.mjs";
import type { TaskTombstoneSubject, TombstoneSubjectReader } from "../../lib/types/task-repository.js";

type TombstoneTarget = ReturnType<typeof normalizeTarget>;
type ResolvedTombstoneTarget = TombstoneTarget & { harness: ResolvedHarnessPaths };
type TombstoneTask = TaskTombstoneSubject;
export type TombstoneOptions = {
  reason?: string;
  deletedBy?: string;
  confirm?: string;
  allowOpenFindings?: boolean;
};
export type SupersedeOptions = TombstoneOptions & {
  by?: string;
};
export type ArchiveOptions = TombstoneOptions & {
  archivedBy?: string;
  archiveFields?: Record<string, unknown>;
};
export type ArchiveBatchOptions = ArchiveOptions & {
  release?: string;
  taskIds?: string[];
};
type TombstoneFields = Record<string, unknown>;

export type TombstoneOperationsOptions = {
  subjects: TombstoneSubjectReader;
};

export type TombstoneOperations = {
  supersede(oldRef: string, options?: SupersedeOptions): ReturnType<typeof supersedeTask>;
  softDelete(taskRef: string, options?: TombstoneOptions): ReturnType<typeof softDeleteTask>;
  delete(taskRef: string, options?: TombstoneOptions & { hard?: boolean }): ReturnType<typeof deleteTask>;
  archive(taskRef: string, options?: ArchiveOptions): ReturnType<typeof archiveTask>;
  archiveBatch(options?: ArchiveBatchOptions): ReturnType<typeof archiveTasks>;
  reopen(taskRef: string, options?: TombstoneOptions): ReturnType<typeof reopenTask>;
};

export function createTombstoneOperations(targetInput: string, { subjects }: TombstoneOperationsOptions): TombstoneOperations {
  const target = normalizeTarget(targetInput);
  return {
    supersede(oldRef, options = {}) {
      return supersedeTask(target, subjects, oldRef, options);
    },
    softDelete(taskRef, options = {}) {
      return softDeleteTask(target, subjects, taskRef, options);
    },
    delete(taskRef, options = {}) {
      return deleteTask(target, subjects, taskRef, options);
    },
    archive(taskRef, options = {}) {
      return archiveTask(target, subjects, taskRef, options);
    },
    archiveBatch(options = {}) {
      return archiveTasks(target, subjects, options);
    },
    reopen(taskRef, options = {}) {
      return reopenTask(target, subjects, taskRef, options);
    },
  };
}

function supersedeTask(target: TombstoneTarget, subjects: TombstoneSubjectReader, oldRef: string, { by = "", reason = "", deletedBy = "", confirm = "", allowOpenFindings = false }: SupersedeOptions = {}) {
  if (!by) throw new Error("task-supersede requires --by <new-task-id>");
  const oldTask = resolveTask(subjects, oldRef);
  const newTask = resolveTask(subjects, by);
  assertSoftDeleteEligible(oldTask, { reason, deletedBy, confirm, allowOpenFindings, action: "task-supersede" });
  const allowedPaths = taskPaths(target, oldTask, newTask);
  const commit = runTombstoneTransaction(target, {
    operation: `task-supersede ${oldTask.id}`,
    allowedPaths,
    message: `chore(harness): supersede task ${oldTask.id}`,
  }, () => {
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
  });
  return { taskId: oldTask.id, supersededBy: newTask.id, reason: reason || "superseded", governance: { commit } };
}

function softDeleteTask(target: TombstoneTarget, subjects: TombstoneSubjectReader, taskRef: string, options: TombstoneOptions = {}) {
  return deleteTask(target, subjects, taskRef, { ...options, hard: false });
}

function deleteTask(target: TombstoneTarget, subjects: TombstoneSubjectReader, taskRef: string, { hard = false, reason = "", deletedBy = "", confirm = "", allowOpenFindings = false }: TombstoneOptions & { hard?: boolean } = {}) {
  const task = resolveTask(subjects, taskRef);
  if (!hard) {
    assertSoftDeleteEligible(task, { reason, deletedBy, confirm, allowOpenFindings, action: "task-delete" });
    return writeDeletionState(target, task, "soft-deleted", reason || "soft-delete", "task-delete --soft", {
      Operator: normalizeTombstoneActor(deletedBy) || "coordinator",
    });
  }
  assertHardDeleteEligible(target, task, { reason, deletedBy, confirm });
  const taskDir = task.paths.directory;
  const allowedPaths = collectTaskDirectoryFiles(taskDir).map((file) => toPosix(path.relative(target.projectRoot, file)));
  const commit = runTombstoneTransaction(target, {
    operation: `task-delete --hard ${task.id}`,
    allowedPaths,
    message: `chore(harness): hard delete task ${task.id}`,
  }, () => {
    fs.rmSync(taskDir, { recursive: true, force: true });
  });
  return { taskId: task.id, deletionState: "hard-deleted", reason, governance: { commit } };
}

function archiveTask(target: TombstoneTarget, subjects: TombstoneSubjectReader, taskRef: string, { reason = "", archivedBy = "", archiveFields = {} }: ArchiveOptions = {}) {
  const task = resolveTask(subjects, taskRef);
  const archiveAudit = assertArchiveEligible(task, { archivedBy });
  const normalizedArchiveFields = normalizeArchiveFields(archiveFields);
  assertNoReservedArchiveFields(normalizedArchiveFields);
  return writeDeletionState(target, task, "archived", reason || "archive", "task-archive", {
    ...normalizedArchiveFields,
    ...archiveAudit,
  });
}

function archiveTasks(target: TombstoneTarget, subjects: TombstoneSubjectReader, { release = "", taskIds = [], reason = "", archivedBy = "", archiveFields = {} }: ArchiveBatchOptions = {}) {
  const normalizedTaskIds = [...new Set((taskIds || []).map((taskId) => String(taskId || "").trim()).filter(Boolean))];
  if (normalizedTaskIds.length === 0) throw new Error("task-archive-batch requires at least one task id");
  const tasks = normalizedTaskIds.map((taskId) => resolveTask(subjects, taskId));
  const archiveAudits = tasks.map((task) => assertArchiveEligible(task, { archivedBy }));
  const normalizedArchiveFields = normalizeArchiveFields(archiveFields);
  assertNoReservedArchiveFields(normalizedArchiveFields);
  const releaseLabel = String(release || "").trim();
  const archiveMoves = tasks.map((task) => tombstoneMovePlan(target, task, { deletionState: "archived", release: releaseLabel }));
  assertTombstoneMoveDestinationsAvailable(archiveMoves);
  const allowedPaths = tombstoneMoveAllowedPaths(target, archiveMoves);
  const operation = `task-archive-batch ${releaseLabel || `${tasks.length} tasks`}`;
  const message = releaseLabel
    ? `chore(harness): archive release ${releaseLabel} tasks`
    : `chore(harness): archive ${tasks.length} tasks`;
  const commit = runTombstoneTransaction(target, {
    operation,
    allowedPaths,
    message,
    allowDirtyWorktree: true,
  }, () => {
    tasks.forEach((task, index) => {
      writeTombstone(target, task, {
        State: "archived",
        Reason: reason || "archive",
        Operator: "coordinator",
        Timestamp: nowTimestamp(),
        "Reopen Eligible": "yes",
        "Archive Eligible": "yes",
        ...normalizedArchiveFields,
        ...archiveAudits[index],
      });
      appendProgress(target, task, "task-archive-batch", reason || "archive");
    });
    archiveMoves.forEach((move) => moveTaskDirectory(move));
  });
  return {
    taskIds: tasks.map((task) => task.id),
    deletionState: "archived",
    reason: reason || "archive",
    release: releaseLabel,
    governance: { commit },
  };
}

function reopenTask(target: TombstoneTarget, subjects: TombstoneSubjectReader, taskRef: string, { reason = "" }: TombstoneOptions = {}) {
  const task = resolveTask(subjects, taskRef);
  const reopenMove = reopenMovePlan(target, task);
  if (reopenMove) assertTombstoneMoveDestinationsAvailable([reopenMove]);
  const allowedPaths = reopenMove ? tombstoneMoveAllowedPaths(target, [reopenMove]) : taskPaths(target, task);
  const commit = runTombstoneTransaction(target, {
    operation: `task-reopen ${task.id}`,
    allowedPaths,
    message: `chore(harness): reopen task ${task.id}`,
    allowDirtyWorktree: Boolean(reopenMove),
  }, () => {
    const taskPlanPath = task.paths.taskPlanPath;
    const content = readFileSafe(taskPlanPath);
    const next = removeHeadingSectionOutsideFences(content, /^##\s*(?:Task Tombstone|任务墓碑)\s*$/i);
    fs.writeFileSync(taskPlanPath, next.endsWith("\n") ? next : `${next}\n`);
    appendProgress(target, task, "task-reopen", reason || "reopened");
    if (reopenMove) moveTaskDirectory(reopenMove);
  });
  return { taskId: task.id, deletionState: "active", reason: reason || "reopened", governance: { commit } };
}

function writeDeletionState(target: TombstoneTarget, task: TombstoneTask, deletionState: string, reason: string, action: string, archiveFields: TombstoneFields = {}) {
  const normalizedArchiveFields = normalizeArchiveFields(archiveFields);
  const tombstoneMove = shouldMoveTombstoneState(deletionState) ? tombstoneMovePlan(target, task, { deletionState, release: "" }) : null;
  if (tombstoneMove) assertTombstoneMoveDestinationsAvailable([tombstoneMove]);
  const allowedPaths = tombstoneMove ? tombstoneMoveAllowedPaths(target, [tombstoneMove]) : taskPaths(target, task);
  const commit = runTombstoneTransaction(target, {
    operation: `${action} ${task.id}`,
    allowedPaths,
    message: `chore(harness): ${action.replace(/\s+/g, " ")} ${task.id}`,
    allowDirtyWorktree: true,
  }, () => {
    writeTombstone(target, task, {
      State: deletionState,
      Reason: reason,
      Operator: "coordinator",
      Timestamp: nowTimestamp(),
      "Reopen Eligible": "yes",
      "Archive Eligible": deletionState === "archived" ? "yes" : "no",
      ...(tombstoneMove ? {
        "Original Path": toPosix(path.relative(target.projectRoot, tombstoneMove.sourceDir)),
        "Storage Path": toPosix(path.relative(target.projectRoot, tombstoneMove.destinationDir)),
      } : {}),
      ...normalizedArchiveFields,
    });
    appendProgress(target, task, action, reason);
    if (tombstoneMove) moveTaskDirectory(tombstoneMove);
  });
  return { taskId: task.id, deletionState, reason, governance: { commit } };
}

function runTombstoneTransaction(target: TombstoneTarget, { operation, allowedPaths, message, allowDirtyWorktree = false }: {
  operation: string;
  allowedPaths: string[];
  message: string;
  allowDirtyWorktree?: boolean;
}, apply: () => void) {
  const transaction = createGovernanceHarnessTransaction(target);
  const plan = transaction.plan({
    operation,
    allowedPaths,
    commit: { message, allowDirtyWorktree },
    apply,
  });
  const result = transaction.apply(plan);
  assertTransactionSucceeded(result);
  return result.commit;
}

function taskPaths(target: TombstoneTarget, ...tasks: TombstoneTask[]): string[] {
  return [...new Set(tasks.flatMap((task) => [task.paths.relativeTaskPlanPath, task.paths.relativeProgressPath]).filter(Boolean))];
}

type ArchiveMovePlan = {
  sourceDir: string;
  destinationDir: string;
  sourceRelativeFiles: string[];
  destinationRelativeFiles: string[];
};

function shouldMoveTombstoneState(deletionState: string): boolean {
  return ["archived", "soft-deleted"].includes(deletionState);
}

function tombstoneMovePlan(target: TombstoneTarget, task: TombstoneTask, { deletionState, release = "" }: { deletionState: string; release?: string }): ArchiveMovePlan {
  const sourceDir = task.paths.directory;
  const taskIdParts = task.id.split("/").filter(Boolean);
  const archiveRoot = tombstoneStorageRoot((target as ResolvedTombstoneTarget).harness, deletionState, release);
  const destinationDir = path.join(archiveRoot, ...taskIdParts);
  const sourceRelativeFiles = collectRelativeFiles(target, sourceDir);
  const destinationRelativeFiles = sourceRelativeFiles.map((sourceRelative) => {
    const absolute = path.join(target.projectRoot, sourceRelative);
    return toPosix(path.relative(target.projectRoot, path.join(destinationDir, path.relative(sourceDir, absolute))));
  });
  return { sourceDir, destinationDir, sourceRelativeFiles, destinationRelativeFiles };
}

function reopenMovePlan(target: TombstoneTarget, task: TombstoneTask): ArchiveMovePlan | null {
  const sourceDir = task.paths.directory;
  const sourceRelative = toPosix(path.relative(target.projectRoot, sourceDir));
  if (!sourceRelative.includes("/governance/archive/")) return null;
  const resolvedTarget = target as ResolvedTombstoneTarget;
  const destinationDir = taskRefPath(resolvedTarget.harness, task.id);
  if (!destinationDir) throw new Error(`Cannot resolve active task path for reopened task: ${task.id}`);
  if (path.resolve(sourceDir) === path.resolve(destinationDir)) return null;
  const sourceRelativeFiles = collectRelativeFiles(target, sourceDir);
  const destinationRelativeFiles = sourceRelativeFiles.map((sourceRelativeFile) => {
    const absolute = path.join(target.projectRoot, sourceRelativeFile);
    return toPosix(path.relative(target.projectRoot, path.join(destinationDir, path.relative(sourceDir, absolute))));
  });
  return { sourceDir, destinationDir, sourceRelativeFiles, destinationRelativeFiles };
}

function tombstoneMoveAllowedPaths(target: TombstoneTarget, moves: ArchiveMovePlan[]): string[] {
  return [...new Set(moves.flatMap((move) => [
    ...move.sourceRelativeFiles,
    ...move.destinationRelativeFiles,
  ]))].sort();
}

function moveTaskDirectory(move: ArchiveMovePlan): void {
  if (!fs.existsSync(move.sourceDir)) return;
  if (fs.existsSync(move.destinationDir)) {
    throw new Error(`Tombstone destination already exists: ${toPosix(move.destinationDir)}`);
  }
  fs.mkdirSync(path.dirname(move.destinationDir), { recursive: true });
  fs.renameSync(move.sourceDir, move.destinationDir);
}

function assertTombstoneMoveDestinationsAvailable(moves: ArchiveMovePlan[]): void {
  for (const move of moves) {
    if (fs.existsSync(move.destinationDir)) {
      throw new Error(`Tombstone destination already exists: ${toPosix(move.destinationDir)}`);
    }
  }
}

function collectRelativeFiles(target: TombstoneTarget, directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const result: string[] = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
      } else if (entry.isFile()) {
        result.push(toPosix(path.relative(target.projectRoot, absolute)));
      }
    }
  }
  return result.sort();
}

function resolveTask(subjects: TombstoneSubjectReader, ref: string): TombstoneTask {
  const normalized = String(ref || "").trim();
  return subjects.getTombstoneSubject({ id: normalized });
}

function assertArchiveEligible(task: TombstoneTask, { archivedBy = "" }: { archivedBy?: string } = {}): Record<string, string> {
  const result = assessArchiveEligibility(task.policy, { archivedBy, now: nowTimestamp() });
  if (!result.eligible) throw new Error(result.reason);
  return result.auditFields;
}

function writeTombstone(target: TombstoneTarget, task: TombstoneTask, fields: TombstoneFields): void {
  const taskPlanPath = task.paths.taskPlanPath;
  const content = removeHeadingSectionOutsideFences(readFileSafe(taskPlanPath), /^##\s*(?:Task Tombstone|任务墓碑)\s*$/i);
  const block = ["", "## Task Tombstone", "", "| Field | Value |", "| --- | --- |", ...Object.entries(fields).map(([key, value]) => `| ${key} | ${escapeCell(value)} |`), ""].join("\n");
  fs.writeFileSync(taskPlanPath, `${content.trimEnd()}\n${block}`);
}

function assertSoftDeleteEligible(task: TombstoneTask, { reason = "", deletedBy = "", confirm = "", allowOpenFindings = false, action = "task-delete" }: TombstoneOptions & { action?: string } = {}): void {
  const risky = isRiskyTombstoneMutationTask(task.policy);
  const hasOpenFindings = !isDraftTaskState(task.policy.state) && hasOpenBlockingTombstoneFindings(task.policy);
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
  const blockers = hardDeleteLifecycleBlockers(task.policy);
  const taskDir = task.paths.directory;
  const disallowedFiles = collectTaskDirectoryFiles(taskDir).filter((file) => !isSafeDraftFile(taskDir, file));
  if (disallowedFiles.length) blockers.push(`non-scaffold files: ${disallowedFiles.map((file) => toPosix(path.relative(taskDir, file))).join(", ")}`);
  if (blockers.length) throw new Error(`task-delete --hard only supports safe draft tasks; ${blockers.join("; ")}`);
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
  const taskPlanPath = task.paths.taskPlanPath;
  const content = readFileSafe(taskPlanPath);
  if (/^Supersedes\s*[:：]/im.test(content)) {
    fs.writeFileSync(taskPlanPath, content.replace(/^Supersedes\s*[:：]\s*(.*)$/im, (_m, current) => `Supersedes: ${[current, oldId].filter(Boolean).join(", ")}`));
    return;
  }
  fs.writeFileSync(taskPlanPath, `${content.trimEnd()}\nSupersedes: ${oldId}\n`);
}

function appendProgress(target: TombstoneTarget, task: TombstoneTask, action: string, reason: string): void {
  const progressPath = task.paths.progressPath;
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
