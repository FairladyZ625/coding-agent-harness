import { readPresetPackage } from "../lib/preset-registry.mjs";
import { promoteLessonCandidate } from "../lib/lesson-maintenance.mjs";
import fs from "node:fs";
import { takeRepeatedOptionsFromArgs } from "../lib/command-registry.mjs";
import { writeCommandResult } from "../lib/command-result.mjs";
import { buildModuleStepCommandResult, buildTaskIndexCommandResult, buildTaskListCommandResult, buildTaskPhaseCommandResult } from "../lib/task-command-results.mjs";
import { unwrapTaskOperation } from "../application/task/task-operations.mjs";
import { createScannerTaskOperations } from "../adapters/cli/task-operations.mjs";

type FlagReader = (name: string, fallback?: boolean) => boolean;
type OptionReader = (name: string, fallback?: string) => string;
type TargetReader = () => string;
type CommandContext = {
  args: string[];
  takeFlag: FlagReader;
  takeOption: OptionReader;
  targetArg: TargetReader;
};
type PresetInput = {
  flag?: string;
  type?: string;
};
type PresetPackageForArgs = {
  source?: string;
  inputs?: Record<string, PresetInput>;
};
type NewTaskParseOptions = {
  preset?: string;
  fromSession?: string;
};
type NewTaskParsedArgs = {
  taskId: string;
  target: string;
  automaticTaskId: boolean;
  presetArgs: string[];
};
type CreateTaskCliOptions = {
  title: string;
  locale: string;
  dryRun: boolean;
  moduleKey: string;
  budget: string;
  longRunning: boolean;
  preset: string;
  fromSession: string;
  presetArgs: string[];
  automaticTaskId: boolean;
  registerModule?: boolean;
  moduleRegistration?: {
    title?: string;
    prefix?: string;
    status?: string;
    branch?: string;
    owner?: string;
    currentStep?: string;
    scope?: string[];
    shared?: string[];
    dependsOn?: string[];
    locale?: string;
  };
};
type BatchTaskListItem = {
  id: string;
  title?: string;
};

function taskOperations(target: string) {
  return createScannerTaskOperations(target);
}

export function runTaskCommand(command: string, { args, takeFlag, takeOption, targetArg }: CommandContext) {
  if (command === "new-task") {
    const dryRun = takeFlag("--dry-run");
    const locale = takeOption("--locale", "");
    const title = takeOption("--title", "");
    const moduleKey = takeOption("--module", "");
    const registerModule = takeFlag("--register-module");
    const moduleRegistration = {
      title: takeOption("--module-title", ""),
      prefix: takeOption("--module-prefix", ""),
      status: takeOption("--module-status", "planned"),
      branch: takeOption("--module-branch", ""),
      owner: takeOption("--module-owner", "coordinator"),
      currentStep: takeOption("--module-current-step", ""),
      locale,
      scope: takeRepeatedOptionsFromArgs(args, "--module-scope"),
      shared: takeRepeatedOptionsFromArgs(args, "--module-shared"),
      dependsOn: takeRepeatedOptionsFromArgs(args, "--module-depends-on"),
    };
    const budget = takeOption("--budget", "standard");
    const preset = takeOption("--preset", "");
    const fromSession = takeOption("--from-session", "");
    const longRunning = takeFlag("--long-running");
    try {
      const parsed = parseNewTaskArgs(args, { preset, fromSession });
      const createOptions = { title, locale, dryRun, moduleKey, budget, longRunning, preset, fromSession, presetArgs: parsed.presetArgs, automaticTaskId: parsed.automaticTaskId, registerModule, moduleRegistration };
      console.log(JSON.stringify(unwrapTaskOperation(taskOperations(parsed.target).create({ taskId: parsed.taskId, ...createOptions })), null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "new-task-batch") {
    const taskList = takeOption("--task-list", "");
    const dryRun = takeFlag("--dry-run");
    const locale = takeOption("--locale", "");
    const title = takeOption("--title", "");
    const moduleKey = takeOption("--module", "");
    const budget = takeOption("--budget", "standard");
    try {
      const tasks = readBatchTaskList(taskList);
      console.log(JSON.stringify(unwrapTaskOperation(taskOperations(targetArg()).createBatch({ tasks, title, locale, dryRun, moduleKey, budget })), null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "task-phase") {
    const state = takeOption("--state", "");
    const completion = takeOption("--completion", "");
    const evidenceStatus = takeOption("--evidence", "");
    const taskId = args.shift();
    const phaseId = args.shift();
    if (!taskId || !phaseId) {
      console.error("Missing task id or phase id");
      process.exit(2);
    }
    try {
      writeCommandResult(buildTaskPhaseCommandResult(targetArg(), taskId, phaseId, { state, completion, evidenceStatus }), { json: true });
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (["task-start", "task-log", "task-block", "task-review", "task-complete"].includes(command)) {
    const message = takeOption("--message", "");
    const evidence = takeOption("--evidence", "");
    const taskId = args.shift();
    if (!taskId) {
      console.error("Missing task id");
      process.exit(2);
    }
    const lifecycleByCommand: Record<string, { event: string; state: string }> = {
      "task-start": { event: "task-start", state: "in_progress" },
      "task-log": { event: "task-log", state: "" },
      "task-block": { event: "task-block", state: "blocked" },
      "task-review": { event: "task-review", state: "review" },
      "task-complete": { event: "task-complete", state: "done" },
    };
    const lifecycle = lifecycleByCommand[command];
    try {
      const operations = taskOperations(targetArg());
      const result =
        command === "task-start"
          ? operations.start({ taskId, message, evidence })
          : command === "task-review"
            ? operations.review({ taskId, message, evidence })
            : command === "task-complete"
              ? operations.complete({ taskId, message, evidence })
              : operations.updateLifecycle({ taskId, ...lifecycle, message, evidence });
      console.log(JSON.stringify(unwrapTaskOperation(result), null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "lesson-promote") {
    const dryRun = takeFlag("--dry-run");
    const apply = takeFlag("--apply");
    const taskId = args.shift();
    const candidateId = args.shift();
    if (!taskId || !candidateId) {
      console.error("Missing task id or candidate id");
      process.exit(2);
    }
    try {
      console.log(JSON.stringify(promoteLessonCandidate(targetArg(), taskId, candidateId, { dryRun, apply }), null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "lesson-sediment") {
    const dryRun = takeFlag("--dry-run");
    const title = takeOption("--title", "");
    const taskId = args.shift();
    const candidateId = args.shift();
    if (!taskId || !candidateId) {
      console.error("Missing task id or candidate id");
      process.exit(2);
    }
    try {
      console.log(JSON.stringify(unwrapTaskOperation(taskOperations(targetArg()).lessonSediment({ taskId, candidateId, dryRun, title })), null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "task-list") {
    const json = takeFlag("--json");
    const state = takeOption("--state", "");
    const moduleKey = takeOption("--module", "");
    const queue = takeOption("--queue", "");
    const preset = takeOption("--preset", "");
    const review = takeOption("--review", "");
    const lesson = takeOption("--lesson", "");
    const search = takeOption("--search", "");
    const missingMaterials = takeFlag("--missing-materials");
    const includeArchived = takeFlag("--include-archived");
    writeCommandResult(buildTaskListCommandResult(targetArg(), { state, moduleKey, queue, preset, review, lesson, search, missingMaterials, includeArchived }), { json });
    return;
  }

  if (command === "task-index") {
    const json = takeFlag("--json");
    writeCommandResult(buildTaskIndexCommandResult(targetArg()), { json });
    return;
  }

  if (command === "task-supersede") {
    const by = takeOption("--by", "");
    const reason = takeOption("--reason", "");
    const deletedBy = takeOption("--deleted-by", "");
    const confirm = takeOption("--confirm", "");
    const allowOpenFindings = takeFlag("--allow-open-findings");
    const taskId = args.shift();
    if (!taskId) {
      console.error("Missing task id");
      process.exit(2);
    }
    try {
      console.log(JSON.stringify(unwrapTaskOperation(taskOperations(targetArg()).supersede({ taskId, by, reason, deletedBy, confirm, allowOpenFindings })), null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "task-archive-batch") {
    const reason = takeOption("--reason", "");
    const archivedBy = takeOption("--archived-by", "");
    const release = takeOption("--release", "");
    const taskListPath = takeOption("--task-list", "");
    const archiveFields = takeRepeatedKeyValueOptions(args, "--archive-field");
    if (!taskListPath) {
      console.error("task-archive-batch requires --task-list <release-closeout-task-list.json>");
      process.exit(2);
    }
    try {
      const taskList = JSON.parse(fs.readFileSync(taskListPath, "utf8")) as { schemaVersion?: string; taskIds?: unknown[]; release?: string };
      if (taskList.schemaVersion !== "release-closeout-task-list/v1") throw new Error("--task-list schemaVersion must be release-closeout-task-list/v1");
      const taskIds = (taskList.taskIds || []).map((taskId) => String(taskId || "").trim()).filter(Boolean);
      if (taskIds.length === 0) throw new Error("--task-list must include at least one task id");
      const result = taskOperations(targetArg()).archiveBatch({
        release: release || String(taskList.release || ""),
        taskIds,
        reason,
        archivedBy,
        archiveFields,
      });
      console.log(JSON.stringify(unwrapTaskOperation(result), null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (["task-delete", "task-archive", "task-reopen"].includes(command)) {
    const soft = takeFlag("--soft");
    const hard = takeFlag("--hard");
    const reason = takeOption("--reason", "");
    const deletedBy = command === "task-delete" ? takeOption("--deleted-by", "") : "";
    const confirm = command === "task-delete" ? takeOption("--confirm", "") : "";
    const allowOpenFindings = command === "task-delete" ? takeFlag("--allow-open-findings") : false;
    const archivedBy = command === "task-archive" ? takeOption("--archived-by", "") : "";
    const archiveFields = command === "task-archive" ? takeRepeatedKeyValueOptions(args, "--archive-field") : {};
    const taskId = args.shift();
    if (!taskId) {
      console.error("Missing task id");
      process.exit(2);
    }
    try {
      if (command === "task-delete" && soft && hard) throw new Error("task-delete accepts only one of --soft or --hard");
      const result =
        command === "task-delete"
          ? taskOperations(targetArg()).delete({ taskId, hard, reason, deletedBy, confirm, allowOpenFindings })
          : command === "task-archive"
            ? taskOperations(targetArg()).archive({ taskId, reason, archivedBy, archiveFields })
            : taskOperations(targetArg()).reopen({ taskId, reason });
      console.log(JSON.stringify(unwrapTaskOperation(result), null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  if (command === "module-step") {
    const state = takeOption("--state", "done");
    const moduleKey = args.shift();
    const stepId = args.shift();
    if (!moduleKey || !stepId) {
      console.error("Missing module key or step id");
      process.exit(2);
    }
    try {
      writeCommandResult(buildModuleStepCommandResult(targetArg(), moduleKey, stepId, { state }), { json: true });
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
    return;
  }

  throw new Error(`Unsupported task command: ${command}`);
}

function parseNewTaskArgs(args: string[], { preset = "", fromSession = "" }: NewTaskParseOptions = {}): NewTaskParsedArgs {
  void fromSession;
  const values = [...args];
  const presetPackage = preset ? readPresetPackageForNewTask(preset, values) : null;
  const parsed = splitPresetArgsAndPositionals(values, presetPackage);
  const resolved = resolveNewTaskPositionals(parsed.positionals);
  return {
    taskId: resolved.taskId,
    target: resolved.target || ".",
    automaticTaskId: !resolved.taskId,
    presetArgs: parsed.presetArgs,
  };
}

function readPresetPackageForNewTask(preset: string, values: string[]): PresetPackageForArgs {
  const candidates = presetDiscoveryTargetCandidates(values);
  let fallbackPackage: PresetPackageForArgs | null = null;
  let lastError: unknown = null;
  for (const targetInput of candidates) {
    try {
      const presetPackage = readPresetPackage(preset, { targetInput });
      if (presetPackage.source === "project") return presetPackage;
      if (!fallbackPackage) fallbackPackage = presetPackage;
    } catch (error) {
      lastError = error;
    }
  }
  if (fallbackPackage) return fallbackPackage;
  throw lastError;
}

function presetDiscoveryTargetCandidates(values: string[]): string[] {
  const candidates: string[] = [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (!value || value.startsWith("-")) continue;
    if (!candidates.includes(value)) candidates.push(value);
  }
  if (!candidates.includes(".")) candidates.push(".");
  return candidates;
}

function splitPresetArgsAndPositionals(values: string[], presetPackage: PresetPackageForArgs | null): { positionals: string[]; presetArgs: string[] } {
  const presetArgs: string[] = [];
  const positionals: string[] = [];
  const declaredFlags = new Map(Object.values(presetPackage?.inputs || {}).filter((input) => input.flag).map((input) => [input.flag, input]));
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const declared = declaredFlags.get(value);
    if (declared) {
      presetArgs.push(value);
      if (declared.type !== "flag" && index + 1 < values.length) {
        presetArgs.push(values[index + 1]);
        index += 1;
      }
    } else if (value.startsWith("-")) {
      presetArgs.push(value);
      if (index + 1 < values.length && !values[index + 1].startsWith("-")) {
        presetArgs.push(values[index + 1]);
        index += 1;
      }
    } else {
      positionals.push(value);
    }
  }
  return {
    positionals,
    presetArgs,
  };
}

function isPathLikePositional(value: string): boolean {
  return value === "." || value === ".." || value.startsWith("/") || value.startsWith("~/") || /^\.[^./\\]/.test(value) || value.includes("/") || value.includes("\\");
}

function resolveNewTaskPositionals(positionals: string[]): { taskId: string; target: string } {
  if (positionals.length === 0) return { taskId: "", target: "" };
  if (positionals.length === 1) {
    const [value] = positionals;
    if (isPathLikePositional(value)) return { taskId: "", target: value };
    return { taskId: value, target: "" };
  }
  if (positionals.length === 2) return { taskId: positionals[0], target: positionals[1] };
  throw new Error(`Too many positional arguments for new-task: ${positionals.join(", ")}`);
}

function formatTaskCommandError(error: unknown): string {
  const recovery = readArrayProperty(error, "recovery");
  const details = readRecordProperty(error, "details");
  const lines = [errorMessage(error)];
  if (recovery.length > 0) {
    lines.push("", "Recovery:");
    for (const item of recovery) lines.push(`- ${String(item)}`);
  }
  const entries = readArrayProperty(details, "entries");
  if (entries.length) {
    lines.push("", "Blocking Git status:");
    for (const entry of entries) {
      const raw = readProperty(entry, "raw");
      const entryPath = readProperty(entry, "path");
      lines.push(`- ${String(raw || entryPath || "")}`);
    }
  }
  const disallowed = readArrayProperty(details, "disallowed");
  if (disallowed.length) {
    lines.push("", "Disallowed paths:");
    for (const item of disallowed) lines.push(`- ${String(item)}`);
  }
  const stderr = readProperty(details, "stderr");
  const stdout = readProperty(details, "stdout");
  if (stderr) lines.push("", String(stderr));
  if (stdout) lines.push("", String(stdout));
  return lines.join("\n");
}

function readBatchTaskList(filePath: string): BatchTaskListItem[] {
  if (!filePath) throw new Error("new-task-batch requires --task-list <json>");
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as unknown;
  const rawTasks = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.tasks)
      ? parsed.tasks
      : null;
  if (!rawTasks) throw new Error("new-task-batch --task-list must be a JSON array or an object with tasks[]");
  return rawTasks.map((item, index) => {
    if (!isRecord(item)) throw new Error(`new-task-batch task at index ${index} must be an object`);
    const id = String(item.id || "").trim();
    if (!id) throw new Error(`new-task-batch task at index ${index} is missing id`);
    return {
      id,
      title: String(item.title || "").trim(),
    };
  });
}

function takeRepeatedKeyValueOptions(args: string[], flag: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (let index = 0; index < args.length;) {
    if (args[index] !== flag) {
      index += 1;
      continue;
    }
    const raw = args[index + 1] || "";
    args.splice(index, 2);
    const separator = raw.indexOf("=");
    if (separator <= 0) throw new Error(`${flag} requires key=value`);
    const key = raw.slice(0, separator).trim();
    const value = raw.slice(separator + 1).trim();
    if (!key || /[\r\n|]/.test(key)) throw new Error(`${flag} has invalid field key: ${key || "<empty>"}`);
    if (Object.prototype.hasOwnProperty.call(fields, key)) throw new Error(`${flag} duplicate field key: ${key}`);
    fields[key] = value;
  }
  return fields;
}

function readArrayProperty(value: unknown, key: string): unknown[] {
  const property = readProperty(value, key);
  return Array.isArray(property) ? property : [];
}

function readRecordProperty(value: unknown, key: string): Record<string, unknown> | null {
  const property = readProperty(value, key);
  return isRecord(property) ? property : null;
}

function readProperty(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
