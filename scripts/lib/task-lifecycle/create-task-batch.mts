import fs from "node:fs";
import path from "node:path";
import { datePrefix, localDate, normalizeTarget, normalizeTaskId } from "../core-shared.mjs";
import { beginGovernanceSync, commitGovernanceSync, releaseGovernanceSync } from "../governance-sync.mjs";
import { normalizeHarnessModuleKey } from "../module-registry.mjs";
import type { CreateTaskBatchOptions, CreateTaskOptions, LifecycleChange, LifecycleTarget } from "../types/task-lifecycle.js";

type CreateTaskWriter = (
  targetInput: string,
  taskId: string,
  options?: CreateTaskOptions,
) => {
  task: unknown;
  changes: LifecycleChange[];
  governance: {
    commit: {
      allowedPaths?: string[];
    };
  };
};

function asLifecycleTarget(target: ReturnType<typeof normalizeTarget>): LifecycleTarget {
  return target as LifecycleTarget;
}

function ensureDatePrefix(slug: string): string {
  if (datePrefix.test(slug)) return slug;
  return `${localDate()}-${slug}`;
}

function firstDuplicate(values: string[]): string {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return "";
}

function taskRoot(target: LifecycleTarget, taskId: string, { moduleKey = "" }: { moduleKey?: string } = {}): string {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (moduleKey) {
    const moduleRoot = path.join(target.harness.modulesRoot, normalizeTaskId(moduleKey));
    return target.harness.version === 2
      ? path.join(moduleRoot, "tasks", normalizedTaskId)
      : path.join(moduleRoot, normalizedTaskId);
  }
  return path.join(target.harness.tasksRoot, normalizedTaskId);
}

export function runCreateTaskBatch(
  createTask: CreateTaskWriter,
  targetInput: string,
  { tasks = [], title = "", locale = "en-US", dryRun = false, moduleKey = "", budget = "standard", longRunning = false, preset = "" }: CreateTaskBatchOptions,
) {
  const normalizedTasks = tasks.map((task) => ({
    id: normalizeTaskId(task.id),
    title: String(task.title || "").trim(),
  }));
  if (normalizedTasks.length === 0) throw new Error("new-task-batch requires at least one task in --task-list");
  const missingIdIndex = normalizedTasks.findIndex((task) => !task.id);
  if (missingIdIndex >= 0) throw new Error(`new-task-batch task at index ${missingIdIndex} is missing id`);
  const duplicate = firstDuplicate(normalizedTasks.map((task) => task.id));
  if (duplicate) throw new Error(`new-task-batch task ids must be unique: ${duplicate}`);
  if (preset) throw new Error("new-task-batch currently supports template-based task creation only; omit --preset");
  const target = asLifecycleTarget(normalizeTarget(targetInput));
  const normalizedModuleKey = moduleKey ? normalizeHarnessModuleKey(moduleKey) : "";
  const plannedTaskRoots = normalizedTasks.map((task) => ({
    id: task.id,
    directory: taskRoot(target, ensureDatePrefix(task.id), { moduleKey: normalizedModuleKey }),
  }));
  const duplicateDirectory = firstDuplicate(plannedTaskRoots.map((task) => task.directory));
  if (duplicateDirectory) {
    const ids = plannedTaskRoots.filter((task) => task.directory === duplicateDirectory).map((task) => task.id).join(", ");
    throw new Error(`new-task-batch task ids resolve to the same task directory: ${ids}`);
  }
  const existing = plannedTaskRoots.filter((task) => fs.existsSync(task.directory));
  if (existing.length > 0) throw new Error(`new-task-batch target task already exists: ${existing.map((task) => task.id).join(", ")}`);
  const created: unknown[] = [];
  const changes: LifecycleChange[] = [];
  let allowedRelativePaths: string[] = [];
  for (const item of normalizedTasks) {
    const result = createTask(target.projectRoot, item.id, {
      title: item.title || title,
      locale,
      dryRun,
      moduleKey,
      budget,
      longRunning,
      deferCommit: true,
      allowDirtyRelativePaths: allowedRelativePaths,
    });
    created.push(result.task);
    changes.push(...result.changes);
    allowedRelativePaths = [...new Set([...(result.governance.commit.allowedPaths || []), ...allowedRelativePaths])].sort();
  }
  if (dryRun) {
    return {
      dryRun,
      tasks: created,
      changes,
      governance: { commit: { committed: false, reason: "dry-run", allowedPaths: allowedRelativePaths } },
    };
  }
  const context = beginGovernanceSync(target, {
    operation: `new-task-batch ${normalizedTasks.length} tasks`,
    allowDirtyWorktree: true,
    allowDirtyWriteScope: true,
    allowedRelativePaths,
  });
  try {
    const commit = commitGovernanceSync(context, allowedRelativePaths, {
      message: `chore(harness): register ${normalizedTasks.length} tasks`,
    });
    return {
      dryRun,
      tasks: created,
      changes,
      governance: { commit },
    };
  } finally {
    releaseGovernanceSync(context);
  }
}
