import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  normalizeTarget,
  readFileSafe,
  toPosix,
} from "./core-shared.mjs";
import { createTaskIndexProjectionReader } from "./task-repository.mjs";
import { taskScannerVersion } from "./task-review-model.mjs";
import type { TaskIndexProjection, TaskIndexProjectionReader } from "./task-repository.mjs";

type TaskIndexTarget = ReturnType<typeof normalizeTarget> & {
  projectRoot: string;
  harnessRootRelative: string;
  harness: {
    version: number;
    planningRoot: string;
    generatedRoot: string;
  };
};

type BuildTaskIndexOptions = {
  reader?: TaskIndexProjectionReader;
  tasks?: TaskIndexProjection[];
};

export function buildTaskIndex(targetInput: string | undefined, options: BuildTaskIndexOptions = {}) {
  const target = normalizeTarget(targetInput) as TaskIndexTarget;
  const tasks = options.tasks || options.reader?.listTaskIndexTasks() || createTaskIndexProjectionReader(target, { strictReviewGitAudit: true }).listTaskIndexTasks();
  assertUniqueTaskKeys(tasks);
  return {
    schemaVersion: target.harness.version === 2 ? "task-index/v2" : "task-index/v1",
    scannerVersion: taskScannerVersion,
    sourceRoot: "TARGET:.",
    harnessRoot: `TARGET:${target.harnessRootRelative}`,
    planningRoot: `TARGET:${toPosix(path.relative(target.projectRoot, target.harness.planningRoot))}`,
    generatedRoot: `TARGET:${toPosix(path.relative(target.projectRoot, target.harness.generatedRoot))}`,
    generatedAt: new Date().toISOString(),
    sourceFileHashes: Object.fromEntries(tasks.map((task) => [task.taskKey || task.id, hashTaskSources(target, task)])),
    scope: "all",
    taskScopes: {
      all: tasks.length,
      activeCycle: tasks.filter((task) => taskIndexProjectionHasScope(task, "active-cycle")).length,
      reviewWorkbench: tasks.filter((task) => taskIndexProjectionHasScope(task, "review-workbench")).length,
      archiveHistory: tasks.filter((task) => taskIndexProjectionHasScope(task, "archive-history")).length,
      tombstoneHistory: tasks.filter((task) => taskIndexProjectionHasScope(task, "tombstone-history")).length,
      taskIndexDefault: tasks.filter((task) => taskIndexProjectionHasScope(task, "task-index-default")).length,
    },
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
      kind: task.taskKind || "general",
      preset: task.taskPreset || "none",
      presetVersion: task.presetVersion || "",
      evidenceBundle: task.evidenceBundle || "",
      reviewStatus: task.reviewStatus,
      reviewQueueState: task.reviewQueueState || "",
      reviewSubmitted: task.reviewSubmitted === true,
      reviewPath: task.reviewPath || "",
      closeoutStatus: task.closeoutStatus || "",
      walkthroughPath: task.walkthroughPath || "",
      module: task.module || "",
      namespace: task.namespace || "main",
      taskRootKind: task.taskRootKind || (task.module ? "module-task" : "project-task"),
      packageRole: task.packageRole || "local",
      inferredModule: task.inferredModule || "",
      shortId: task.shortId || "",
      completion: task.completion || 0,
      lessonCandidateStatus: task.lessonCandidateStatus || "",
      lessonCandidateReviewDecision: task.lessonCandidateReviewDecision || "",
      lessonCandidatePromotionState: task.lessonCandidatePromotionState || "",
      lessonCandidateRows: task.lessonCandidateRows || [],
      lessonCandidateIssues: task.lessonCandidateIssues || [],
      risks: task.risks || [],
      residual: residual(task),
      materialsReady: task.materialsReady === true,
      materialIssues: task.materialIssues || [],
      taskQueues: task.taskQueues || [],
      queues: task.taskQueues || [],
      queueReasons: task.queueReasons || [],
      supersedes: task.supersedes || [],
      supersededBy: task.supersededBy || "",
      deletionState: task.deletionState || "active",
      visibilityScopes: task.visibilityScopes || [],
      deleteReason: task.deleteReason || "",
      archiveMetadata: task.archiveMetadata || {},
      hiddenByDefault: task.hiddenByDefault === true,
      repairPrompt: task.repairPrompt || "",
      repairActions: repairActions(task),
      documentRefs: documentRefs(task),
    })),
  };
}

function taskIndexProjectionHasScope(task: TaskIndexProjection, scope: string): boolean {
  return Array.isArray(task.visibilityScopes) && task.visibilityScopes.includes(scope);
}

function documentRefs(task: TaskIndexProjection) {
  return [
    ["index", task.path ? `${task.path}/INDEX.md` : ""],
    ["brief", task.briefPath],
    ["task-plan", task.taskPlanPath],
    ["execution-strategy", task.executionStrategyPath],
    ["visual-map", task.visualMapPath],
    ["progress", task.progressPath],
    ["findings", task.findingsPath],
    ["review", task.reviewPath],
    ["lesson-candidates", task.lessonCandidatePath],
    ["walkthrough", task.walkthroughPath],
  ].filter(([, refPath]) => refPath).map(([kind, refPath]) => ({ kind, path: refPath }));
}

function repairActions(task: TaskIndexProjection) {
  const actions: Array<{ kind: string; code: string; sourcePath: string; message: string }> = [];
  for (const issue of task.materialIssues || []) {
    actions.push({
      kind: "material",
      code: issue.code || "material-issue",
      sourcePath: issue.sourcePath || task.path || "",
      message: issue.message || String(issue),
    });
  }
  for (const reason of task.queueReasons || []) {
    actions.push({
      kind: "queue",
      code: reason.code || "queue-reason",
      sourcePath: reason.sourcePath || task.path || "",
      message: reason.message || String(reason),
    });
  }
  return actions;
}

function residual(task: TaskIndexProjection) {
  if (Array.isArray(task.stateConflicts) && task.stateConflicts.length) return `state-conflicts:${task.stateConflicts.length}`;
  if (Array.isArray(task.materialIssues) && task.materialIssues.length) return `material-issues:${task.materialIssues.length}`;
  if (Array.isArray(task.lessonCandidateIssues) && task.lessonCandidateIssues.length) return `lesson-issues:${task.lessonCandidateIssues.length}`;
  return "none";
}

function assertUniqueTaskKeys(tasks: TaskIndexProjection[]): void {
  const seen = new Map<string, TaskIndexProjection>();
  for (const task of tasks) {
    const taskKey = task.taskKey || task.id;
    if (seen.has(taskKey)) {
      const first = seen.get(taskKey)!;
      throw new Error(`Duplicate task key in task index: ${taskKey} (${first.currentPath || first.path} and ${task.currentPath || task.path})`);
    }
    seen.set(taskKey, task);
  }
}

function hashTaskSources(target: TaskIndexTarget, task: TaskIndexProjection): string {
  const hash = crypto.createHash("sha256");
  const taskRoot = path.join(target.projectRoot, String(task.path || "").replace(/^TARGET:/, ""));
  for (const fileName of ["INDEX.md", "task_plan.md", "brief.md", "visual_map.md", "progress.md", "review.md", "findings.md", "lesson_candidates.md", "walkthrough.md", "long-running-task-contract.md"]) {
    const filePath = path.join(taskRoot, fileName);
    if (!fs.existsSync(filePath)) continue;
    hash.update(toPosix(path.relative(target.projectRoot, filePath)));
    hash.update("\0");
    hash.update(readFileSafe(filePath));
    hash.update("\0");
  }
  return hash.digest("hex");
}
