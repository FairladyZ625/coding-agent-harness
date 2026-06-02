function taskVisibilityScopes(task) {
  const direct = Array.isArray(task?.visibilityScopes) ? task.visibilityScopes : null;
  const nested = Array.isArray(task?.semanticProjection?.visibility?.scopes) ? task.semanticProjection.visibility.scopes : null;
  return direct || nested || [];
}

function taskInVisibilityScope(task, scope) {
  const scopes = taskVisibilityScopes(task);
  if (scopes.length) return scopes.includes(scope);
  const archiveState = String(task?.archiveMetadata?.state || "").toLowerCase();
  const deletionState = String(task?.deletionState || "active").toLowerCase();
  const hidden = task?.hiddenByDefault === true;
  if (scope === "all") return true;
  if (scope === "active-cycle" || scope === "task-index-default") return deletionState === "active" && !hidden;
  if (scope === "archive-history") return deletionState === "archived" || archiveState === "archived";
  if (scope === "tombstone-history") return deletionState !== "active" || hidden;
  if (scope === "review-workbench") return (deletionState === "active" && !hidden) || deletionState !== "active" || hidden;
  return false;
}
