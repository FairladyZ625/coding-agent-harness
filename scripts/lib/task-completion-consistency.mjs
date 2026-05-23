export function validateTaskCompletionConsistency(tasks) {
  const failures = [];
  const warnings = [];
  for (const task of tasks) {
    if (task.state !== "done") continue;
    const incompletePhases = (task.phases || []).filter(
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
