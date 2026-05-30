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

type TaskIndexTarget = ReturnType<typeof normalizeTarget> & {
  projectRoot: string;
  harnessRootRelative: string;
  harness: {
    version: number;
    planningRoot: string;
    generatedRoot: string;
  };
};

type TaskIndexTask = {
  aliases?: string[];
  archiveMetadata?: Record<string, unknown>;
  briefPath?: string;
  closeoutStatus?: string;
  completion?: number;
  currentPath?: string;
  deletionState?: string;
  deleteReason?: string;
  evidenceBundle?: string;
  executionStrategyPath?: string;
  findingsPath?: string;
  hiddenByDefault?: boolean;
  id: string;
  identitySource?: string;
  inferredModule?: string;
  lessonCandidateIssues?: unknown[];
  lessonCandidatePath?: string;
  lessonCandidateRows?: unknown[];
  lessonCandidateStatus?: string;
  lifecycleState?: string;
  materialIssues?: TaskIndexIssue[];
  materialsReady?: boolean;
  module?: string;
  namespace?: string;
  originalPath?: string;
  packageRole?: string;
  path?: string;
  presetVersion?: string;
  progressPath?: string;
  queueReasons?: TaskIndexIssue[];
  repairPrompt?: string;
  reviewPath?: string;
  reviewStatus?: string;
  reviewSubmitted?: boolean;
  risks?: unknown[];
  shortId?: string;
  state?: string;
  stateConflicts?: unknown[];
  supersededBy?: string;
  supersedes?: unknown[];
  taskKind?: string;
  taskKey?: string;
  taskPlanPath?: string;
  taskPreset?: string;
  taskQueues?: unknown[];
  taskRootKind?: string;
  title?: string;
  visualMapPath?: string;
  walkthroughPath?: string;
};

type TaskIndexIssue = {
  code?: string;
  message?: string;
  sourcePath?: string;
};

const collectTasksForIndex = collectTasks as (target: TaskIndexTarget) => TaskIndexTask[];

export function buildTaskIndex(targetInput: string | undefined) {
  const target = normalizeTarget(targetInput) as TaskIndexTarget;
  const tasks = collectTasksForIndex(target);
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
      deleteReason: task.deleteReason || "",
      archiveMetadata: task.archiveMetadata || {},
      hiddenByDefault: task.hiddenByDefault === true,
      repairPrompt: task.repairPrompt || "",
      repairActions: repairActions(task),
      documentRefs: documentRefs(task),
    })),
  };
}

function documentRefs(task: TaskIndexTask) {
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

function repairActions(task: TaskIndexTask) {
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

function residual(task: TaskIndexTask) {
  if (Array.isArray(task.stateConflicts) && task.stateConflicts.length) return `state-conflicts:${task.stateConflicts.length}`;
  if (Array.isArray(task.materialIssues) && task.materialIssues.length) return `material-issues:${task.materialIssues.length}`;
  if (Array.isArray(task.lessonCandidateIssues) && task.lessonCandidateIssues.length) return `lesson-issues:${task.lessonCandidateIssues.length}`;
  return "none";
}

function assertUniqueTaskKeys(tasks: TaskIndexTask[]): void {
  const seen = new Map<string, TaskIndexTask>();
  for (const task of tasks) {
    const taskKey = task.taskKey || task.id;
    if (seen.has(taskKey)) {
      const first = seen.get(taskKey)!;
      throw new Error(`Duplicate task key in task index: ${taskKey} (${first.currentPath || first.path} and ${task.currentPath || task.path})`);
    }
    seen.set(taskKey, task);
  }
}

function hashTaskSources(target: TaskIndexTarget, task: TaskIndexTask): string {
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
