import { implementationPhases } from "./phase-kind.mjs";

export function validateTaskCompletionConsistency(tasks) {
  const failures = [];
  const warnings = [];
  for (const task of tasks) {
    if (task.state !== "done") continue;
    const phases = task.phases || [];
    const executionPhases = implementationPhases(phases);
    if (phases.length > 0 && executionPhases.length === 0) {
      const message = `${task.visualMapPath} done task has no non-skipped Visual Map execution phase`;
      if (task.closeoutStatus === "closed") failures.push(message);
      else warnings.push(message);
      continue;
    }
    const incompletePhases = executionPhases.filter(
      (phase) => phase.state !== "skipped" && (phase.state !== "done" || phase.completion !== 100),
    );
    if (incompletePhases.length === 0) continue;
    const phaseList = incompletePhases.map((phase) => `${phase.id}:${phase.state}:${phase.completion}%`).join(", ");
    const message = `${task.visualMapPath} done task has incomplete Visual Map phases: ${phaseList}`;
    if (task.closeoutStatus === "closed") failures.push(message);
    else warnings.push(message);
  }
  return { failures, warnings };
}
