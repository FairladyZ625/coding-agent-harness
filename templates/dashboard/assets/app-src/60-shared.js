function taskDocument(task, fileName) {
  const projected = task?.documentsByKey?.[fileName] || task?.documentProjection?.byKey?.[fileName];
  if (projected) return projected;
  if (fileName === "__walkthrough__") {
    const walkthrough = task?.documentsByKey?.["walkthrough.md"] || task?.documentProjection?.byKey?.["walkthrough.md"];
    if (walkthrough) return walkthrough;
    if (task.walkthroughPath) return findDocument(task.walkthroughPath);
  }
  return findDocument(`${task.path}/${fileName}`);
}

function taskDocumentProjection(task) {
  return task?.documentsByKey || task?.documentProjection?.byKey || {};
}

function findDocument(pathSuffix) {
  return (bundle.documents?.documents || []).find((doc) => doc.path.endsWith(pathSuffix) || doc.path === pathSuffix);
}

function mermaidLabel(id) {
  const node = (bundle.graph?.nodes || []).find((item) => item.id === id);
  return String(node?.label || id).replaceAll('"', "'").slice(0, 48);
}

function mermaidId(value) {
  return `N_${String(value).replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function progressBar(value) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress" role="progressbar" aria-label="${score}%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}"><i style="width:${score}%" aria-hidden="true"></i></div>`;
}

function tag(value) {
  const raw = String(value || "unknown");
  const klass = /fail|blocked|open/i.test(raw) ? "fail" : /warn|advice|planned|missing|unknown/i.test(raw) ? "warn" : /pass|done|present|verified|review|in_progress/i.test(raw) ? "pass" : "";
  return `<span class="tag ${klass}">${escapeHtml(label(raw))}</span>`;
}

function label(value) {
  const key = `state_${value}`;
  const translated = t(key);
  return translated === key ? String(value || "unknown").replaceAll("_", " ") : translated;
}

function list(items = []) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || `<li>${t("none")}</li>`}</ul>`;
}

function emptyState(text) {
  return `<div class="empty">${escapeHtml(text)}</div>`;
}

function projectName() {
  return bundle.status?.project?.name || "Harness";
}

function themeLabel() {
  return state.theme === "dark" ? t("light") : state.theme === "light" ? t("system") : t("dark");
}

function groupBy(items, fn) {
  return items.reduce((acc, item) => {
    const key = fn(item);
    acc[key] ||= [];
    acc[key].push(item);
    return acc;
  }, {});
}

function canUseWorkbenchAction(action) {
  return state.runtime?.mode === "workbench" && (state.runtime?.writableActions || []).includes(action);
}
