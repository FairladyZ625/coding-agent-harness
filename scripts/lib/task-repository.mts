import fs from "node:fs";
import path from "node:path";
import {
  datePrefix,
  lessonCandidatesFile,
  longRunningTaskContractFile,
  normalizeTarget,
  normalizeTaskId,
  readFileSafe,
  visualMapFile,
} from "./core-shared.mjs";
import {
  resolveHarnessPaths,
  taskIdFromDirectory,
  taskRefPath,
} from "./harness-paths.mjs";
import {
  collectTasks,
  listTaskPlanPaths,
  readTaskContractFile,
  readVisualMapContractFile,
} from "./task-scanner.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";
import type { CollectTasksOptions, TaskContractFile, TaskScannerTarget, VisualMapContractFile } from "./types/task-scanner.js";

export {
  isActiveTaskState,
  parsePhases,
  taskCutoverCounters,
} from "./task-scanner.mjs";
export {
  parseTaskBudget,
  parseTaskContractInfo,
  parseTaskState,
} from "./task-metadata.mjs";
export { readVisualMapContractFile } from "./task-scanner.mjs";

export type TaskRecord = ReturnType<typeof collectTasks>[number];

export type TaskRef = {
  id?: string;
  path?: string;
};

export type TaskQuery = {
  state?: string;
  module?: string;
  queue?: string;
  preset?: string;
  review?: string;
  lesson?: string;
  includeArchived?: boolean;
  search?: string;
  missingMaterials?: boolean;
  requireGeneratedScaffoldProvenance?: boolean;
  closeoutContent?: string;
};

export type TaskLocation = {
  id: string;
  directory: string;
  taskPlanPath: string;
};

export type TaskMaterial = {
  path: string;
  content: string;
  source: "standalone" | "legacy" | "missing";
};

export type TaskMaterials = {
  location: TaskLocation;
  index: TaskMaterial;
  brief: TaskContractFile;
  taskPlan: TaskMaterial;
  executionStrategy: TaskMaterial;
  visualMap: VisualMapContractFile;
  progress: TaskMaterial;
  findings: TaskMaterial;
  review: TaskMaterial;
  lessonCandidates: TaskMaterial;
  longRunningContract: TaskMaterial;
  walkthrough: TaskMaterial;
};

export type TaskRepository = {
  list(query?: TaskQuery): TaskRecord[];
  get(ref: TaskRef): TaskRecord;
  resolve(ref: TaskRef): TaskLocation;
  readMaterials(ref: TaskRef): TaskMaterials;
};

type ScannerRepositoryOptions = Pick<CollectTasksOptions, "requireGeneratedScaffoldProvenance" | "closeoutContent">;

export function createScannerTaskRepository(targetInput: TaskScannerTarget | string | undefined = ".", defaults: ScannerRepositoryOptions = {}): TaskRepository {
  const target = normalizeRepositoryTarget(targetInput);
  return {
    list(query: TaskQuery = {}) {
      const tasks = collectTasks(target, {
        requireGeneratedScaffoldProvenance: query.requireGeneratedScaffoldProvenance ?? defaults.requireGeneratedScaffoldProvenance,
        closeoutContent: query.closeoutContent ?? defaults.closeoutContent,
      });
      return applyTaskQuery(tasks, query);
    },
    get(ref: TaskRef) {
      const location = resolveRepositoryTaskLocation(target, ref);
      const task = collectTasks(target, {
        requireGeneratedScaffoldProvenance: defaults.requireGeneratedScaffoldProvenance,
        closeoutContent: defaults.closeoutContent,
      }).find((candidate) => candidate.id === location.id);
      if (!task) throw new Error(`Task not found: ${ref.id || ref.path || ""}`);
      return task;
    },
    resolve(ref: TaskRef) {
      return resolveRepositoryTaskLocation(target, ref);
    },
    readMaterials(ref: TaskRef) {
      const location = resolveRepositoryTaskLocation(target, ref);
      const taskDir = location.directory;
      const taskPlanContent = readFileSafe(location.taskPlanPath);
      return {
        location,
        index: readMaterialFile(path.join(taskDir, "INDEX.md")),
        brief: readTaskContractFile(taskDir, "brief.md", ""),
        taskPlan: materialFromContent(location.taskPlanPath, taskPlanContent),
        executionStrategy: readMaterialFile(path.join(taskDir, "execution_strategy.md")),
        visualMap: readVisualMapContractFile(taskDir, taskPlanContent),
        progress: readMaterialFile(path.join(taskDir, "progress.md")),
        findings: readMaterialFile(path.join(taskDir, "findings.md")),
        review: readMaterialFile(path.join(taskDir, "review.md")),
        lessonCandidates: readMaterialFile(path.join(taskDir, lessonCandidatesFile)),
        longRunningContract: readMaterialFile(path.join(taskDir, longRunningTaskContractFile)),
        walkthrough: readMaterialFile(path.join(taskDir, "walkthrough.md")),
      };
    },
  };
}

export function taskPlanPathFromRecord(target: { projectRoot: string }, task: { taskPlanPath?: string; path?: string }): string {
  const raw = String(task.taskPlanPath || "");
  if (raw) return absoluteTargetPath(target, raw);
  const taskDir = absoluteTargetPath(target, String(task.path || ""));
  return path.join(taskDir, "task_plan.md");
}

function normalizeRepositoryTarget(targetInput: TaskScannerTarget | string | undefined): TaskScannerTarget {
  if (targetInput && typeof targetInput === "object" && "projectRoot" in targetInput) return targetInput;
  return normalizeTarget(typeof targetInput === "string" ? targetInput : ".") as TaskScannerTarget;
}

function applyTaskQuery(tasks: TaskRecord[], query: TaskQuery): TaskRecord[] {
  let result = [...tasks];
  if (query.includeArchived === false) {
    result = result.filter((task) => task.deletionState === "active" && task.hiddenByDefault !== true);
  }
  if (query.state) result = result.filter((task) => task.state === String(query.state).toLowerCase().replaceAll("-", "_"));
  if (query.module) result = result.filter((task) => task.module === query.module);
  if (query.queue) {
    const normalizedQueue = queryToken(query.queue);
    result = result.filter((task) => (task.taskQueues || []).map(queryToken).includes(normalizedQueue));
  }
  if (query.preset) result = result.filter((task) => queryToken(task.taskPreset || "none") === queryToken(query.preset));
  if (query.review) result = result.filter((task) => queryToken(task.reviewStatus || "") === queryToken(query.review));
  if (query.lesson) {
    const needle = queryToken(query.lesson);
    result = result.filter((task) => [task.lessonCandidateStatus, task.lessonCandidateReviewDecision, task.lessonCandidatePromotionState].some((value) => queryToken(value) === needle));
  }
  if (query.missingMaterials) result = result.filter((task) => !task.materialsReady);
  if (query.search) {
    const needle = String(query.search).toLowerCase();
    result = result.filter((task) => [
      task.id,
      task.taskKey,
      task.shortId,
      task.title,
      task.currentPath,
      task.taskPlanPath,
      task.module,
      task.inferredModule,
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }
  return result;
}

function resolveRepositoryTaskLocation(target: TaskScannerTarget, ref: TaskRef): TaskLocation {
  const harnessPaths = (target.harness || resolveHarnessPaths(target)) as ResolvedHarnessPaths;
  const pathLocation = ref.path ? resolvePathRef(target, harnessPaths, ref.path) : null;
  if (pathLocation) return pathLocation;
  const raw = normalizeRawTaskRef(ref.id || ref.path || "");
  if (!raw) throw new Error("Missing task id");
  const direct = taskRefPath(harnessPaths, raw);
  if (direct && fs.existsSync(path.join(direct, "task_plan.md"))) return taskLocationFromDirectory(harnessPaths, direct);
  const normalized = normalizeTaskId(raw);
  const candidates = taskDirectories(target).filter((taskDir) => {
    const id = taskIdFromDirectory(harnessPaths, taskDir);
    const dirName = path.basename(taskDir);
    return id === raw || id.endsWith(`/${raw}`) || dirName === normalized;
  });
  if (candidates.length === 1) return taskLocationFromDirectory(harnessPaths, candidates[0]);
  if (candidates.length > 1) {
    const options = candidates.map((taskDir) => `- ${taskIdFromDirectory(harnessPaths, taskDir)}`).join("\n");
    throw new Error(`Ambiguous task reference: ${ref.id || ref.path}\n${options}`);
  }
  if (!datePrefix.test(normalized)) {
    const datedCandidates = taskDirectories(target).filter((taskDir) => {
      const dirName = path.basename(taskDir);
      return datePrefix.test(dirName) && dirName.replace(datePrefix, "") === normalized;
    });
    if (datedCandidates.length === 1) return taskLocationFromDirectory(harnessPaths, datedCandidates[0]);
    if (datedCandidates.length > 1) {
      const options = datedCandidates.map((taskDir) => `- ${taskIdFromDirectory(harnessPaths, taskDir)}`).join("\n");
      throw new Error(`Ambiguous task reference: ${ref.id || ref.path}\n${options}`);
    }
  }
  const legacy = path.join(harnessPaths.tasksRoot, normalized);
  if (fs.existsSync(path.join(legacy, "task_plan.md"))) return taskLocationFromDirectory(harnessPaths, legacy);
  throw new Error(`Task not found: ${ref.id || ref.path}`);
}

function resolvePathRef(target: TaskScannerTarget, harnessPaths: ResolvedHarnessPaths, rawPath: string): TaskLocation | null {
  const absolute = absoluteTargetPath(target, rawPath);
  const taskPlanPath = path.basename(absolute) === "task_plan.md" ? absolute : path.join(absolute, "task_plan.md");
  if (!fs.existsSync(taskPlanPath)) return null;
  return taskLocationFromDirectory(harnessPaths, path.dirname(taskPlanPath));
}

function absoluteTargetPath(target: { projectRoot: string }, rawPath: string): string {
  const withoutPrefix = String(rawPath || "").replace(/^TARGET:/, "");
  if (path.isAbsolute(withoutPrefix)) return withoutPrefix;
  const normalized = withoutPrefix.replace(/^\/+/, "");
  if (!normalized) return "";
  return path.join(target.projectRoot, normalized);
}

function normalizeRawTaskRef(rawRef: string): string {
  return String(rawRef || "")
    .replace(/^TARGET:/, "")
    .replace(/^coding-agent-harness\/planning\//, "")
    .replace(/^planning\//, "")
    .replace(new RegExp(`^${legacyPlanningPrefix()}\\/`), "")
    .replace(/^\/+/, "");
}

function legacyPlanningPrefix(): string {
  return "docs\\/09-PLANNING";
}

function taskDirectories(target: TaskScannerTarget): string[] {
  return listTaskPlanPaths(target).map((taskPlanPath) => path.dirname(taskPlanPath));
}

function taskLocationFromDirectory(harnessPaths: ResolvedHarnessPaths, directory: string): TaskLocation {
  return {
    id: taskIdFromDirectory(harnessPaths, directory),
    directory,
    taskPlanPath: path.join(directory, "task_plan.md"),
  };
}

function readMaterialFile(filePath: string): TaskMaterial {
  return materialFromContent(filePath, readFileSafe(filePath));
}

function materialFromContent(filePath: string, content: string): TaskMaterial {
  return {
    path: filePath,
    content,
    source: content.trim() ? "standalone" : "missing",
  };
}

function queryToken(value: unknown): string {
  return String(value || "").trim().toLowerCase().replaceAll("_", "-");
}
