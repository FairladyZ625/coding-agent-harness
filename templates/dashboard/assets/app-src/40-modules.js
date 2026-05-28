function modulesView(moduleId = "") {
  const graph = bundle.graph || { nodes: [], edges: [] };
  const explicitModules = (graph.nodes || []).filter((node) => node.type === "module");
  const moduleMap = new Map(explicitModules.map((module) => [module.id.replace(/^module:/, ""), module]));
  for (const task of normalCycleTasks()) {
    const key = taskModuleKey(task);
    if (!moduleMap.has(key)) moduleMap.set(key, { id: `module:${key}`, type: "module", label: key, state: task.classificationSource || "inferred" });
  }
  const modules = [...moduleMap.values()];
  return `<main class="stack">
    <section class="module-grid">
      ${modules.map((module) => moduleCard(module)).join("") || emptyState(t("noModules"))}
    </section>
  </main>`;
}

function moduleTaskRow(task) {
  const dotClass = /fail|blocked|open/i.test(task.state) ? "state-fail" : /warn|advice|planned|missing|unknown/i.test(task.state) ? "state-warn" : "state-pass";
  return `<a class="module-task-row" href="#/tasks/${encodeURIComponent(task.id)}" data-open-drawer="${escapeAttr(task.id)}">
    <div class="module-task-left">
      <i class="module-task-dot ${dotClass}" title="${escapeAttr(task.state)}"></i>
      <span class="module-task-title">${escapeHtml(task.title)}</span>
    </div>
    <span class="module-task-pct">${task.completion}%</span>
  </a>`;
}

function moduleCard(module) {
  const moduleKey = module.id.replace(/^module:/, "");
  const tasks = normalCycleTasks().filter((task) => taskModuleKey(task) === moduleKey);

  // Inline Pagination
  state.modulePages = state.modulePages || {};
  const currentPage = state.modulePages[moduleKey] || 1;
  const pageCount = Math.ceil(tasks.length / 8) || 1;
  const visibleTasks = tasks.slice((currentPage - 1) * 8, currentPage * 8);

  const brief = findDocument(module.briefPath || `TARGET:coding-agent-harness/planning/modules/${moduleKey}/brief.md`);

  let pagerHtml = "";
  if (tasks.length > 8) {
    pagerHtml = `<div class="module-pager">
      <button ${currentPage <= 1 ? "disabled" : ""} onclick="window.setModulePage('${escapeAttr(moduleKey)}', ${currentPage - 1})">${t("prevPage")}</button>
      <span>${currentPage} / ${pageCount}</span>
      <button ${currentPage >= pageCount ? "disabled" : ""} onclick="window.setModulePage('${escapeAttr(moduleKey)}', ${currentPage + 1})">${t("nextPage")}</button>
    </div>`;
  }

  return `<article class="module-card">
    <div class="card-head"><h2>${escapeHtml(module.label || moduleKey)}</h2>${tag(module.state || "unknown")}</div>
    <div class="markdown">${brief ? window.HarnessMarkdown.render(brief.content, "rendered") : `<p>${t("moduleBriefMissing")}</p>`}</div>
    <h3>${t("moduleTasks")} · ${tasks.length}</h3>
    <div class="module-task-list">
      ${visibleTasks.map(moduleTaskRow).join("") || `<p>${t("noModuleTasks")}</p>`}
    </div>
    ${pagerHtml}
  </article>`;
}
