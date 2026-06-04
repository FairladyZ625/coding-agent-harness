import path from "node:path";
import { buildTaskOperationSubject, buildTaskTombstoneSubject } from "../../domain/task/task-subjects.mjs";
import { normalizeTarget } from "../../lib/core-shared.mjs";
import { collectTasks } from "../../lib/task-scanner.mjs";
import type { TaskLocation, TaskOperationSubjectReader, TaskRef, TaskTombstoneSubject, TombstoneSubjectReader } from "../../lib/types/task-repository.js";
import type { TaskScannerTarget } from "../../lib/types/task-scanner.js";
import type { TaskSubjectRecord } from "../../domain/task/task-subjects.mjs";

type ScannerSubjectSourceOptions = {
  strictReviewGitAudit?: boolean;
};

export type ScannerTaskSubject = {
  record: TaskSubjectRecord;
  location: TaskLocation;
  paths: TaskTombstoneSubject["paths"];
};

export type ScannerTaskSubjectSource = {
  get(ref: TaskRef): ScannerTaskSubject;
};

type ScannerTaskRecord = ReturnType<typeof collectTasks>[number];

export function createScannerTaskSubjectSource(targetInput: TaskScannerTarget | string | undefined = ".", options: ScannerSubjectSourceOptions = {}): ScannerTaskSubjectSource {
  const target = normalizeScannerSubjectTarget(targetInput);
  return {
    get(ref: TaskRef) {
      const record = readScannerSubjectTask(target, ref, options);
      return scannerTaskSubject(target, record);
    },
  };
}

export function createScannerTaskOperationSubjectReader(targetInput: TaskScannerTarget | string | undefined = ".", options: ScannerSubjectSourceOptions = {}): TaskOperationSubjectReader {
  const source = createScannerTaskSubjectSource(targetInput, options);
  return {
    getOperationSubject(ref: TaskRef) {
      return buildTaskOperationSubject(source.get(ref).record);
    },
  };
}

export function createScannerTaskTombstoneSubjectReader(targetInput: TaskScannerTarget | string | undefined = ".", options: ScannerSubjectSourceOptions = {}): TombstoneSubjectReader {
  const source = createScannerTaskSubjectSource(targetInput, options);
  return {
    getTombstoneSubject(ref: TaskRef) {
      const subject = source.get(ref);
      return buildTaskTombstoneSubject(subject.record, {
        location: subject.location,
        paths: subject.paths,
      });
    },
  };
}

function normalizeScannerSubjectTarget(targetInput: TaskScannerTarget | string | undefined): TaskScannerTarget {
  if (targetInput && typeof targetInput === "object" && "projectRoot" in targetInput) return targetInput;
  return normalizeTarget(typeof targetInput === "string" ? targetInput : ".") as TaskScannerTarget;
}

function readScannerSubjectTask(target: TaskScannerTarget, ref: TaskRef, options: ScannerSubjectSourceOptions): ScannerTaskRecord {
  const tasks = collectTasks(target, { includeArchived: true, strictReviewGitAudit: options.strictReviewGitAudit === true });
  const matches = tasks.filter((task) => scannerTaskMatchesRef(target, task, ref));
  if (matches.length === 1) return matches[0] as ScannerTaskRecord;
  const raw = ref.id || ref.path || "";
  if (matches.length > 1) {
    const options = matches.map((task) => `- ${task.id}`).join("\n");
    throw new Error(`Ambiguous task reference: ${raw}\n${options}`);
  }
  throw new Error(`Task not found: ${raw}`);
}

function scannerTaskMatchesRef(target: TaskScannerTarget, task: ScannerTaskRecord, ref: TaskRef): boolean {
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

function normalizeScannerTaskToken(value: string): string {
  return normalizeRawTaskRef(value).trim().toLowerCase().replaceAll(" ", "-");
}

function addTaskReferenceToken(tokens: Set<string>, value: string): void {
  const normalized = normalizeScannerTaskToken(value);
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

function scannerTaskSubject(target: TaskScannerTarget, record: ScannerTaskRecord): ScannerTaskSubject {
  const directory = taskDirectoryFromScannerTask(target, record);
  const taskPlanPath = taskPlanPathFromScannerTask(target, record, directory);
  const progressPath = absoluteTargetPath(target, String(record.progressPath || path.join(directory, "progress.md")));
  return {
    record,
    location: {
      id: record.id,
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
