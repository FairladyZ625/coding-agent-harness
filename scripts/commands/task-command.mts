// @ts-nocheck
import {
  confirmTaskReview,
  createTask,
  readPresetPackage,
  buildTaskIndex,
  createLessonSedimentationTask,
  archiveTask,
  listLifecycleTasks,
  promoteLessonCandidate,
  reopenTask,
  softDeleteTask,
  supersedeTask,
  updateModuleStep,
  updateTaskPhase,
  updateTaskLifecycle,
} from "../lib/harness-core.mjs";

export function runTaskCommand(command, { args, takeFlag, takeOption, targetArg }) {
  if (command === "new-task") {
    const dryRun = takeFlag("--dry-run");
    const locale = takeOption("--locale", "");
    const title = takeOption("--title", "");
    const moduleKey = takeOption("--module", "");
    const budget = takeOption("--budget", "standard");
    const preset = takeOption("--preset", "");
    const fromSession = takeOption("--from-session", "");
    const longRunning = takeFlag("--long-running");
    try {
      const parsed = parseNewTaskArgs(args, { preset, fromSession });
      console.log(JSON.stringify(createTask(parsed.target, parsed.taskId, { title, locale, dryRun, moduleKey, budget, longRunning, preset, fromSession, presetArgs: parsed.presetArgs, automaticTaskId: parsed.automaticTaskId }), null, 2));
    } catch (error) {
      console.error(error.message);
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
      console.log(JSON.stringify(updateTaskPhase(targetArg(), taskId, phaseId, { state, completion, evidenceStatus }), null, 2));
    } catch (error) {
      console.error(error.message);
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
    const lifecycle = {
      "task-start": { event: "task-start", state: "in_progress" },
      "task-log": { event: "task-log", state: "" },
      "task-block": { event: "task-block", state: "blocked" },
      "task-review": { event: "task-review", state: "review" },
      "task-complete": { event: "task-complete", state: "done" },
    }[command];
    try {
      console.log(JSON.stringify(updateTaskLifecycle(targetArg(), taskId, { ...lifecycle, message, evidence }), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    return;
  }

  if (command === "review-confirm") {
    const reviewer = takeOption("--reviewer", "Human Reviewer");
    const message = takeOption("--message", "");
    const evidence = takeOption("--evidence", "");
    const confirmText = takeOption("--confirm", "");
    const taskId = args.shift();
    if (!taskId) {
      console.error("Missing task id");
      process.exit(2);
    }
    try {
      console.log(JSON.stringify(confirmTaskReview(targetArg(), taskId, { reviewer, message, evidence, confirmText }), null, 2));
    } catch (error) {
      console.error(formatTaskCommandError(error));
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
      console.error(error.message);
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
      console.log(JSON.stringify(createLessonSedimentationTask(targetArg(), taskId, candidateId, { dryRun, title }), null, 2));
    } catch (error) {
      console.error(error.message);
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
    const result = listLifecycleTasks(targetArg(), { state, moduleKey, queue, preset, review, lesson, search, missingMaterials, includeArchived });
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const task of result.tasks) {
        console.log(`${task.id}\t${task.state}\t${task.completion}%\t${task.title}`);
      }
    }
    return;
  }

  if (command === "task-index") {
    const json = takeFlag("--json");
    const result = buildTaskIndex(targetArg());
    if (json) console.log(JSON.stringify(result, null, 2));
    else console.log(`${result.tasks.length} tasks indexed (${result.schemaVersion})`);
    return;
  }

  if (command === "task-supersede") {
    const by = takeOption("--by", "");
    const reason = takeOption("--reason", "");
    const taskId = args.shift();
    if (!taskId) {
      console.error("Missing task id");
      process.exit(2);
    }
    try {
      console.log(JSON.stringify(supersedeTask(targetArg(), taskId, { by, reason }), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    return;
  }

  if (["task-delete", "task-archive", "task-reopen"].includes(command)) {
    const soft = takeFlag("--soft");
    const reason = takeOption("--reason", "");
    const archivedBy = command === "task-archive" ? takeOption("--archived-by", "") : "";
    const archiveFields = command === "task-archive" ? takeRepeatedKeyValueOptions(args, "--archive-field") : {};
    const taskId = args.shift();
    if (!taskId) {
      console.error("Missing task id");
      process.exit(2);
    }
    try {
      if (command === "task-delete" && !soft) throw new Error("task-delete only supports --soft; hard delete is intentionally disabled.");
      const result =
        command === "task-delete"
          ? softDeleteTask(targetArg(), taskId, { reason })
          : command === "task-archive"
            ? archiveTask(targetArg(), taskId, { reason, archivedBy, archiveFields })
            : reopenTask(targetArg(), taskId, { reason });
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(error.message);
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
      console.log(JSON.stringify(updateModuleStep(targetArg(), moduleKey, stepId, { state }), null, 2));
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
    return;
  }

  throw new Error(`Unsupported task command: ${command}`);
}

function parseNewTaskArgs(args, { preset = "" } = {}) {
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

function readPresetPackageForNewTask(preset, values) {
  const candidates = presetDiscoveryTargetCandidates(values);
  let fallbackPackage = null;
  let lastError = null;
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

function presetDiscoveryTargetCandidates(values) {
  const candidates = [];
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (!value || value.startsWith("-")) continue;
    if (!candidates.includes(value)) candidates.push(value);
  }
  if (!candidates.includes(".")) candidates.push(".");
  return candidates;
}

function splitPresetArgsAndPositionals(values, presetPackage) {
  const presetArgs = [];
  const positionals = [];
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

function isPathLikePositional(value) {
  return value === "." || value === ".." || value.startsWith("/") || value.startsWith("~/") || /^\.[^./\\]/.test(value) || value.includes("/") || value.includes("\\");
}

function resolveNewTaskPositionals(positionals) {
  if (positionals.length === 0) return { taskId: "", target: "" };
  if (positionals.length === 1) {
    const [value] = positionals;
    if (isPathLikePositional(value)) return { taskId: "", target: value };
    return { taskId: value, target: "" };
  }
  if (positionals.length === 2) return { taskId: positionals[0], target: positionals[1] };
  throw new Error(`Too many positional arguments for new-task: ${positionals.join(", ")}`);
}

function formatTaskCommandError(error) {
  const lines = [error.message];
  if (Array.isArray(error.recovery) && error.recovery.length > 0) {
    lines.push("", "Recovery:");
    for (const item of error.recovery) lines.push(`- ${item}`);
  }
  if (error.details?.entries?.length) {
    lines.push("", "Blocking Git status:");
    for (const entry of error.details.entries) lines.push(`- ${entry.raw || entry.path}`);
  }
  if (error.details?.disallowed?.length) {
    lines.push("", "Disallowed paths:");
    for (const item of error.details.disallowed) lines.push(`- ${item}`);
  }
  if (error.details?.stderr) lines.push("", error.details.stderr);
  if (error.details?.stdout) lines.push("", error.details.stdout);
  return lines.join("\n");
}

function takeRepeatedKeyValueOptions(args, flag) {
  const fields = {};
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
