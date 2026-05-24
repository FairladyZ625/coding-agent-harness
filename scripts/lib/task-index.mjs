import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  normalizeTarget,
  readFileSafe,
  toPosix,
} from "./core-shared.mjs";
import { collectTasks } from "./task-scanner.mjs";
import { taskScannerVersion } from "./task-review-model.mjs";

export function buildTaskIndex(targetInput) {
  const target = normalizeTarget(targetInput);
  const tasks = collectTasks(target);
  assertUniqueTaskKeys(tasks);
  return {
    schemaVersion: "task-index/v1",
    scannerVersion: taskScannerVersion,
    sourceRoot: "TARGET:.",
    generatedAt: new Date().toISOString(),
    sourceFileHashes: Object.fromEntries(tasks.map((task) => [task.taskKey || task.id, hashTaskSources(target, task)])),
    tasks: tasks.map((task) => ({
      taskKey: task.taskKey || task.id,
      id: task.id,
      title: task.title,
      currentPath: task.currentPath || task.path,
      originalPath: task.originalPath || task.path,
      aliases: task.aliases || [],
      identitySource: task.identitySource || "path-derived-legacy",
      state: task.state,
      lifecycleState: task.lifecycleState,
      reviewStatus: task.reviewStatus,
      reviewSubmitted: task.reviewSubmitted === true,
      reviewPath: task.reviewPath || "",
      closeoutStatus: task.closeoutStatus || "",
      walkthroughPath: task.walkthroughPath || "",
      module: task.module || "",
      inferredModule: task.inferredModule || "",
      completion: task.completion || 0,
      lessonCandidateStatus: task.lessonCandidateStatus || "",
      lessonCandidateRows: task.lessonCandidateRows || [],
      lessonCandidateIssues: task.lessonCandidateIssues || [],
      risks: task.risks || [],
      residual: residual(task),
      materialsReady: task.materialsReady === true,
      materialIssues: task.materialIssues || [],
      queues: task.taskQueues || [],
      queueReasons: task.queueReasons || [],
      supersedes: task.supersedes || [],
      supersededBy: task.supersededBy || "",
      deletionState: task.deletionState || "active",
      hiddenByDefault: task.hiddenByDefault === true,
      repairPrompt: task.repairPrompt || "",
    })),
  };
}

function residual(task) {
  if (Array.isArray(task.stateConflicts) && task.stateConflicts.length) return `state-conflicts:${task.stateConflicts.length}`;
  if (Array.isArray(task.materialIssues) && task.materialIssues.length) return `material-issues:${task.materialIssues.length}`;
  if (Array.isArray(task.lessonCandidateIssues) && task.lessonCandidateIssues.length) return `lesson-issues:${task.lessonCandidateIssues.length}`;
  return "none";
}

function assertUniqueTaskKeys(tasks) {
  const seen = new Map();
  for (const task of tasks) {
    const taskKey = task.taskKey || task.id;
    if (seen.has(taskKey)) {
      const first = seen.get(taskKey);
      throw new Error(`Duplicate task key in task index: ${taskKey} (${first.currentPath || first.path} and ${task.currentPath || task.path})`);
    }
    seen.set(taskKey, task);
  }
}

function hashTaskSources(target, task) {
  const hash = crypto.createHash("sha256");
  const taskRoot = path.join(target.projectRoot, String(task.path || "").replace(/^TARGET:/, ""));
  for (const fileName of ["task_plan.md", "brief.md", "visual_map.md", "progress.md", "review.md", "findings.md", "lesson_candidates.md", "long-running-task-contract.md"]) {
    const filePath = path.join(taskRoot, fileName);
    if (!fs.existsSync(filePath)) continue;
    hash.update(toPosix(path.relative(target.projectRoot, filePath)));
    hash.update("\0");
    hash.update(readFileSafe(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}
