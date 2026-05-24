import {
  confirmTaskReview,
  createTask,
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
    const shouldDeriveTaskId = fromSession && args.length === 0;
    const taskId = shouldDeriveTaskId ? "harness-v1-migration" : args.shift();
    if (!taskId) {
      console.error("Missing task id");
      process.exit(2);
    }
    try {
      console.log(JSON.stringify(createTask(targetArg(), taskId, { title, locale, dryRun, moduleKey, budget, longRunning, preset, fromSession }), null, 2));
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
      console.error(error.message);
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
    const result = listLifecycleTasks(targetArg(), { state, moduleKey });
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
            ? archiveTask(targetArg(), taskId, { reason })
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
