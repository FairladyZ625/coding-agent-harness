import { buildTaskIndex } from "./task-index.mjs";
import { listLifecycleTasks, updateModuleStep, updateTaskPhase } from "./task-lifecycle.mjs";
import type { CommandResult } from "./command-result.mjs";
import type { LifecycleTask, ListLifecycleTasksOptions, ModuleStepOptions, PhaseUpdateOptions } from "./types/task-lifecycle.js";

type TaskIndexCommandPayload = ReturnType<typeof buildTaskIndex>;
type TaskListCommandPayload = ReturnType<typeof listLifecycleTasks>;
type TaskPhaseCommandPayload = ReturnType<typeof updateTaskPhase>;
type ModuleStepCommandPayload = ReturnType<typeof updateModuleStep>;

export function buildTaskListCommandResult(targetInput: string, options: ListLifecycleTasksOptions): CommandResult<TaskListCommandPayload> {
  const payload = listLifecycleTasks(targetInput, options);
  return {
    payload,
    textLines: payload.tasks.map(formatTaskListRow),
  };
}

export function buildTaskIndexCommandResult(targetInput: string): CommandResult<TaskIndexCommandPayload> {
  const payload = buildTaskIndex(targetInput);
  return {
    payload,
    textLines: [`${payload.tasks.length} tasks indexed (${payload.schemaVersion})`],
  };
}

export function buildTaskPhaseCommandResult(targetInput: string, taskId: string, phaseId: string, options: PhaseUpdateOptions): CommandResult<TaskPhaseCommandPayload> {
  const payload = updateTaskPhase(targetInput, taskId, phaseId, options);
  return {
    payload,
    textLines: [`Updated phase ${phaseId} for ${taskId}`],
  };
}

export function buildModuleStepCommandResult(targetInput: string, moduleKey: string, stepId: string, options: ModuleStepOptions): CommandResult<ModuleStepCommandPayload> {
  const payload = updateModuleStep(targetInput, moduleKey, stepId, options);
  return {
    payload,
    textLines: [`Updated module step ${moduleKey}/${stepId}`],
  };
}

function formatTaskListRow(task: LifecycleTask): string {
  return `${task.id}\t${task.state || "unknown"}\t${task.completion || 0}%\t${task.title || ""}`;
}
