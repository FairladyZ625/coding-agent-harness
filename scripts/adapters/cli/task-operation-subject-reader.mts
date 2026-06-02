import path from "node:path";
import { normalizeTarget } from "../../lib/core-shared.mjs";
import { collectTasks } from "../../lib/task-scanner.mjs";
import type {
  TaskOperationBlockingRisk,
  TaskOperationSemanticProjection,
  TaskOperationSubject,
  TaskOperationSubjectReader,
  TaskRef,
  TaskTombstonePolicyFacts,
  TaskTombstoneSubject,
  TombstoneSubjectReader,
} from "../../lib/types/task-repository.js";
import type { TaskScannerTarget } from "../../lib/types/task-scanner.js";

export function createScannerTaskOperationSubjectReader(targetInput: TaskScannerTarget | string | undefined = "."): TaskOperationSubjectReader {
  const target = normalizeOperationSubjectTarget(targetInput);
  return {
    getOperationSubject(ref: TaskRef) {
      return operationSubjectFromScannerTask(readOperationSubjectTask(target, ref));
    },
  };
}

export function createScannerTaskTombstoneSubjectReader(targetInput: TaskScannerTarget | string | undefined = "."): TombstoneSubjectReader {
  const target = normalizeOperationSubjectTarget(targetInput);
  return {
    getTombstoneSubject(ref: TaskRef) {
      return tombstoneSubjectFromScannerTask(target, readOperationSubjectTask(target, ref));
    },
  };
}

type ScannerTaskRecord = ReturnType<typeof collectTasks>[number];

function normalizeOperationSubjectTarget(targetInput: TaskScannerTarget | string | undefined): TaskScannerTarget {
  if (targetInput && typeof targetInput === "object" && "projectRoot" in targetInput) return targetInput;
  return normalizeTarget(typeof targetInput === "string" ? targetInput : ".") as TaskScannerTarget;
}

function readOperationSubjectTask(target: TaskScannerTarget, ref: TaskRef): ScannerTaskRecord {
  const tasks = collectTasks(target, { includeArchived: true });
  const matches = tasks.filter((task) => operationTaskMatchesRef(target, task, ref));
  if (matches.length === 1) return matches[0] as ScannerTaskRecord;
  const raw = ref.id || ref.path || "";
  if (matches.length > 1) {
    const options = matches.map((task) => `- ${task.id}`).join("\n");
    throw new Error(`Ambiguous task reference: ${raw}\n${options}`);
  }
  throw new Error(`Task not found: ${raw}`);
}

function operationTaskMatchesRef(target: TaskScannerTarget, task: ScannerTaskRecord, ref: TaskRef): boolean {
  const requested = taskReferenceTokens(target, String(ref.id || ref.path || ""));
  if (requested.size === 0) return false;
  const available = scannerTaskReferenceTokens(target, task);
  return [...requested].some((token) => available.has(token));
}

function scannerTaskReferenceTokens(target: TaskScannerTarget, task: ScannerTaskRecord): Set<string> {
  const tokens = new Set<string>();
  for (const value of [
    task.id,
    task.taskKey,
    task.shortId,
    task.path,
    task.currentPath,
    task.originalPath,
    task.taskPlanPath,
  ]) {
    addTaskReferenceTokens(tokens, target, String(value || ""));
  }
  return tokens;
}

function taskReferenceTokens(target: TaskScannerTarget, rawRef: string): Set<string> {
  const tokens = new Set<string>();
  addTaskReferenceTokens(tokens, target, rawRef);
  return tokens;
}

function addTaskReferenceTokens(tokens: Set<string>, target: TaskScannerTarget, rawRef: string): void {
  const raw = String(rawRef || "").trim();
  if (!raw) return;
  const normalizedRaw = normalizeRawTaskRef(raw);
  addTaskReferenceToken(tokens, raw);
  addTaskReferenceToken(tokens, normalizedRaw);

  const absolute = absoluteTargetPath(target, raw);
  const relative = path.relative(target.projectRoot, absolute).split(path.sep).join("/");
  if (relative && !relative.startsWith("..")) {
    addTaskReferenceToken(tokens, relative);
    addTaskReferenceToken(tokens, normalizeRawTaskRef(relative));
    const directory = path.basename(relative) === "task_plan.md" ? path.dirname(relative) : relative;
    addTaskReferenceToken(tokens, directory);
    addTaskReferenceToken(tokens, normalizeRawTaskRef(directory));
  }
}

function normalizeOperationTaskToken(value: string): string {
  return normalizeRawTaskRef(value).trim().toLowerCase().replaceAll(" ", "-");
}

function addTaskReferenceToken(tokens: Set<string>, value: string): void {
  const normalized = normalizeOperationTaskToken(value);
  if (!normalized) return;
  tokens.add(normalized);
  const tail = normalized.split("/").at(-1) || normalized;
  tokens.add(tail);
  tokens.add(stripDatePrefix(tail));
  if (path.basename(normalized) === "task_plan.md") {
    const directory = path.dirname(normalized);
    tokens.add(directory);
    const directoryTail = directory.split("/").at(-1) || directory;
    tokens.add(directoryTail);
    tokens.add(stripDatePrefix(directoryTail));
  }
}

function stripDatePrefix(value: string): string {
  return value.replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function normalizeRawTaskRef(rawRef: string): string {
  return String(rawRef || "")
    .replace(/^TARGET:/, "")
    .replace(/^coding-agent-harness\/planning\//, "")
    .replace(/^planning\//, "")
    .replace(/^docs\/09-PLANNING\//, "")
    .replace(/^\/+/, "");
}

function operationSubjectFromScannerTask(task: ScannerTaskRecord): TaskOperationSubject {
  return {
    id: task.id,
    budget: String(task.budget || ""),
    lessonCandidateStatus: String(task.lessonCandidateStatus || ""),
    lessonCandidatePromotionState: String(task.lessonCandidatePromotionState || ""),
    repairPrompt: String(task.repairPrompt || ""),
    queueReasons: Array.isArray(task.queueReasons) ? task.queueReasons : [],
    blockingReviewRisks: operationBlockingReviewRisks(task),
    semanticProjection: operationSemanticProjectionFromScannerTask(task),
  };
}

function tombstoneSubjectFromScannerTask(target: TaskScannerTarget, task: ScannerTaskRecord): TaskTombstoneSubject {
  const directory = taskDirectoryFromScannerTask(target, task);
  const taskPlanPath = taskPlanPathFromScannerTask(target, task, directory);
  const progressPath = absoluteTargetPath(target, String(task.progressPath || path.join(directory, "progress.md")));
  return {
    id: task.id,
    location: {
      id: task.id,
      directory,
      taskPlanPath,
    },
    paths: {
      directory,
      taskPlanPath,
      progressPath,
      relativeDirectory: path.relative(target.projectRoot, directory).split(path.sep).join("/"),
      relativeTaskPlanPath: path.relative(target.projectRoot, taskPlanPath).split(path.sep).join("/"),
      relativeProgressPath: path.relative(target.projectRoot, progressPath).split(path.sep).join("/"),
    },
    policy: {
      state: task.state,
      budget: task.budget,
      closeoutStatus: task.closeoutStatus,
      reviewSubmitted: task.reviewSubmitted,
      reviewStatus: task.reviewStatus,
      reviewConfirmation: normalizeReviewConfirmation(task.reviewConfirmation),
      materialsReady: task.materialsReady,
      evidence: task.evidence,
      taskQueues: task.taskQueues,
      risks: task.risks,
      deletionState: task.deletionState,
    },
  };
}

function taskDirectoryFromScannerTask(target: TaskScannerTarget, task: ScannerTaskRecord): string {
  const raw = String(task.path || task.currentPath || task.taskPlanPath || "");
  const absolute = absoluteTargetPath(target, raw);
  return path.basename(absolute) === "task_plan.md" ? path.dirname(absolute) : absolute;
}

function taskPlanPathFromScannerTask(target: TaskScannerTarget, task: ScannerTaskRecord, directory: string): string {
  const raw = String(task.taskPlanPath || "");
  if (raw) return absoluteTargetPath(target, raw);
  return path.join(directory, "task_plan.md");
}

function absoluteTargetPath(target: TaskScannerTarget, rawPath: string): string {
  const withoutPrefix = rawPath.replace(/^TARGET:/, "");
  return path.isAbsolute(withoutPrefix) ? withoutPrefix : path.join(target.projectRoot, withoutPrefix);
}

function operationSemanticProjectionFromScannerTask(task: ScannerTaskRecord): TaskOperationSemanticProjection {
  const semanticProjection = task.semanticProjection as Partial<TaskOperationSemanticProjection> | undefined;
  const taskLifecycleProjection = semanticProjection?.taskLifecycleProjection || task.taskLifecycleProjection;
  const reviewWorkbenchQueueView = semanticProjection?.reviewWorkbenchQueueView || task.reviewWorkbenchQueueView;
  if (!taskLifecycleProjection || !reviewWorkbenchQueueView) throw new Error(`Task operation subject missing semantic projection: ${task.id}`);
  return { taskLifecycleProjection, reviewWorkbenchQueueView };
}

function normalizeReviewConfirmation(value: unknown): TaskTombstonePolicyFacts["reviewConfirmation"] {
  if (!value || typeof value !== "object") return null;
  return value as TaskTombstonePolicyFacts["reviewConfirmation"];
}

function operationBlockingReviewRisks(task: ScannerTaskRecord): TaskOperationBlockingRisk[] {
  const risks = Array.isArray(task.risks) ? task.risks : [];
  return risks.filter((risk) => operationReviewBoolean(risk.open) !== "no" && (operationReviewBoolean(risk.blocksRelease) === "yes" || ["P0", "P1", "P2"].includes(String(risk.severity))));
}

function operationReviewBoolean(value: unknown): "yes" | "no" | "" {
  if (value === true) return "yes";
  if (value === false) return "no";
  const normalized = String(value || "").trim().toLowerCase();
  if (["yes", "y", "true", "open"].includes(normalized)) return "yes";
  if (["no", "n", "false", "closed"].includes(normalized)) return "no";
  return "";
}
