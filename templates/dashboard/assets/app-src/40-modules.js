function dashboardModules() {
  const structured = Array.isArray(bundle.modules) ? bundle.modules : [];
  if (structured.length > 0) return structured;
  const graphModules = (bundle.graph?.nodes || []).filter((node) => node.type === "module").map((node) => ({
    key: String(node.id || "").replace(/^module:/, ""),
    title: node.label,
    status: node.state,
    currentStep: node.currentStep,
    source: "graph",
    briefPath: node.briefPath,
    modulePlanPath: node.modulePlanPath,
  })).filter((module) => module.key);
  return graphModules;
}

function moduleDefinition(key) {
  return dashboardModules().find((module) => module.key === key) || null;
}

function taskModuleLabel(task) {
  const key = taskModuleKey(task);
  if (key === "base" || key === "legacy-unclassified") return taskModuleDisplayLabel(key);
  return moduleDefinition(key)?.title || key;
}

function taskGroupContext(group, tasks) {
  if (group.startsWith("module:")) {
    const key = group.slice("module:".length);
    const counts = moduleCountsForTasks(tasks);
    if (key === "base") {
      return {
        eyebrow: t("baseModuleEyebrow"),
        title: t("baseModule"),
        summary: `${tasks.length} ${t("tasks")} · ${counts.active} ${t("active")} · ${counts.review} ${t("statReview")} · ${counts.blocked} ${t("statBlocked")}`,
        chips: [`${tasks.length} ${t("tasks")}`, `${counts.risk} ${t("moduleRisks")}`],
      };
    }
    if (key === "legacy-unclassified") {
      return {
        eyebrow: t("unclassifiedWarning"),
        title: t("unclassifiedModule"),
        summary: t("unclassifiedSummary").replace("{count}", String(tasks.length)),
        chips: [`${tasks.length} ${t("tasks")}`, `${counts.risk} ${t("moduleRisks")}`],
      };
    }
    const module = moduleDefinition(key) || { key, title: key, source: "inferred" };
    const chips = [
      module.status ? `${t("columnState")}: ${label(module.status)}` : "",
      module.owner ? `${t("moduleOwner")}: ${module.owner}` : "",
      module.currentStep ? `${t("moduleCurrentStep")}: ${module.currentStep}` : "",
      module.dependsOn?.length ? `${t("moduleDependsOn")}: ${module.dependsOn.join(", ")}` : "",
      module.scope?.length ? `${t("moduleScope")}: ${module.scope.join(", ")}` : "",
    ].filter(Boolean);
    return {
      eyebrow: module.source === "registry" ? t("registeredModule") : t("inferredModule"),
      title: module.title || key,
      summary: `${tasks.length} ${t("tasks")} · ${counts.active} ${t("active")} · ${counts.review} ${t("statReview")} · ${counts.blocked} ${t("statBlocked")}`,
      chips,
    };
  }
  return {
    eyebrow: t("groupBy"),
    title: taskGroupLabel(group),
    summary: `${tasks.length} ${t("tasks")}`,
    chips: [],
  };
}

function moduleCountsForTasks(tasks) {
  return {
    active: tasks.filter((task) => ["in_progress", "review", "blocked", "planned", "not_started"].includes(task.state)).length,
    review: tasks.filter((task) => task.state === "review").length,
    blocked: tasks.filter((task) => task.state === "blocked").length,
    risk: tasks.filter(uiDashboardTaskHasRisk).length,
  };
}

function modulesView(moduleId = "") {
  const modules = modulesWithTaskFallback();
  const selectedKey = moduleId || state.selectedModuleKey || modules[0]?.key || "";
  state.selectedModuleKey = selectedKey;
  const selected = modules.find((module) => module.key === selectedKey) || modules[0] || null;
  const unclassified = normalCycleTasks().filter((task) => taskModuleKey(task) === "legacy-unclassified");
  return `<main class="stack module-console">
    ${moduleRunStrip(modules, unclassified)}
    <section class="module-console-grid">
      <nav class="module-list-panel" aria-label="${escapeAttr(t("moduleView"))}">
        ${modules.map((module) => moduleListItem(module, selected?.key === module.key)).join("") || emptyState(t("noModules"))}
      </nav>
      <article class="module-detail-panel">
        ${selected ? moduleDetail(selected) : emptyState(t("noModules"))}
      </article>
    </section>
    ${unclassified.length ? moduleUnclassifiedPanel(unclassified) : ""}
  </main>`;
}

function modulesWithTaskFallback() {
  const moduleMap = new Map(dashboardModules().map((module) => [module.key, {
    ...module,
    counts: emptyUiModuleCounts(),
    tasks: [],
  }]));
  for (const task of normalCycleTasks()) {
    const key = taskModuleKey(task);
    if (key === "legacy-unclassified") continue;
    if (!moduleMap.has(key)) {
      moduleMap.set(key, {
        key,
        title: taskModuleDisplayLabel(key),
        source: key === "base" ? "structure" : "inferred",
        status: task.classificationSource || "inferred",
        counts: emptyUiModuleCounts(),
        tasks: [],
      });
    }
    const module = moduleMap.get(key);
    accumulateUiModuleTask(module, task);
  }
  return [...moduleMap.values()].sort((left, right) => {
    const leftActive = Number(left.counts?.active || 0);
    const rightActive = Number(right.counts?.active || 0);
    if (leftActive !== rightActive) return rightActive - leftActive;
    return left.key.localeCompare(right.key);
  });
}

function emptyUiModuleCounts() {
  return { total: 0, active: 0, review: 0, blocked: 0, risk: 0, missingDocs: 0 };
}

function accumulateUiModuleTask(module, task) {
  if (!module || !task) return;
  const stateValue = String(task.state || "unknown");
  if (!module.tasks.some((item) => item.id === task.id)) module.tasks.push(task);
  module.counts.total = (module.counts.total || 0) + 1;
  if (["in_progress", "review", "blocked", "planned", "not_started"].includes(stateValue)) {
    module.counts.active = (module.counts.active || 0) + 1;
  }
  if (stateValue !== "active") module.counts[stateValue] = (module.counts[stateValue] || 0) + 1;
  if (uiDashboardTaskHasRisk(task)) {
    module.counts.risk = (module.counts.risk || 0) + 1;
  }
  if (task.briefSource && task.briefSource !== "standalone") {
    module.counts.missingDocs = (module.counts.missingDocs || 0) + 1;
  }
}

function uiDashboardTaskHasRisk(task) {
  if (task.state === "blocked") return true;
  if (String(task.reviewStatus || "").includes("blocked")) return true;
  if (Array.isArray(task.materialIssues) && task.materialIssues.length > 0) return true;
  if (Array.isArray(task.queueReasons) && task.queueReasons.length > 0) return true;
  if (String(task.visualMapStatus || "") === "missing") return true;
  return false;
}

function moduleRunStrip(modules, unclassified) {
  const active = modules.filter((module) => Number(module.counts?.active || 0) > 0).length;
  const risk = modules.reduce((sum, module) => sum + Number(module.counts?.risk || 0), 0);
  const registered = modules.filter((module) => module.source === "registry").length;
  return `<section class="module-run-strip">
    ${metric(t("moduleRegistered"), registered)}
    ${metric(t("moduleActive"), active)}
    ${metric(t("moduleRisks"), risk)}
    ${metric(t("moduleUnclassified"), unclassified.length)}
  </section>`;
}

function moduleListItem(module, active) {
  const counts = module.counts || emptyUiModuleCounts();
  return `<a class="module-list-item ${active ? "active" : ""}" href="#/modules/${encodeURIComponent(module.key)}" data-module-select="${escapeAttr(module.key)}">
    <span>
      <strong>${escapeHtml(module.key === "base" ? t("baseModule") : module.title || module.key)}</strong>
      <small>${escapeHtml(module.key)} · ${escapeHtml(module.source || "registry")}</small>
    </span>
    <span class="module-list-counts">
      <b>${Number(counts.active || 0)}</b>
      ${tag(module.status || "planned")}
    </span>
  </a>`;
}

function moduleDetail(module) {
  const tasks = normalCycleTasks().filter((task) => taskModuleKey(task) === module.key);
  const activeTasks = tasks.filter((task) => ["in_progress", "review", "blocked", "planned", "not_started"].includes(task.state));
  const riskTasks = tasks.filter((task) => task.state === "blocked" || String(task.reviewStatus || "").includes("blocked") || String(task.visualMapStatus || "") === "missing");
  const brief = findDocument(module.briefPath || `TARGET:coding-agent-harness/planning/modules/${module.key}/brief.md`);
  const plan = findDocument(module.modulePlanPath || "");
  return `<div class="module-detail-stack">
    <header class="module-detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(module.key === "base" ? t("baseModuleEyebrow") : module.source === "registry" ? t("registeredModule") : t("inferredModule"))}</p>
        <h2>${escapeHtml(module.key === "base" ? t("baseModule") : module.title || module.key)}</h2>
        <p class="subtle">${escapeHtml(module.key)}${module.currentStep ? ` · ${escapeHtml(module.currentStep)}` : ""}</p>
      </div>
      ${tag(module.status || "planned")}
    </header>
    <div class="module-chip-row">
      ${module.owner ? `<span class="module-chip">${t("moduleOwner")}: ${escapeHtml(module.owner)}</span>` : ""}
      ${module.branch ? `<span class="module-chip">${t("moduleBranch")}: ${escapeHtml(module.branch)}</span>` : ""}
      ${module.dependsOn?.length ? `<span class="module-chip">${t("moduleDependsOn")}: ${escapeHtml(module.dependsOn.join(", "))}</span>` : ""}
    </div>
    <section class="module-boundary-grid">
      ${moduleBoundaryBlock(t("moduleScope"), module.scope)}
      ${moduleBoundaryBlock(t("moduleShared"), module.shared)}
      ${moduleBoundaryBlock(t("moduleDependsOn"), module.dependsOn)}
    </section>
    <section class="module-work-panel">
      <div class="section-head">
        <div>
          <h3>${t("moduleCurrentWork")}</h3>
          <p class="subtle">${activeTasks.length} ${t("active")} · ${riskTasks.length} ${t("moduleRisks")}</p>
        </div>
        <a href="#/tasks">${t("openTaskIndex")}</a>
      </div>
      <div class="module-task-list">
        ${activeTasks.slice(0, 10).map(moduleTaskRow).join("") || `<p>${t("noModuleTasks")}</p>`}
      </div>
    </section>
    ${riskTasks.length ? `<section class="module-risk-panel">
      <h3>${t("moduleRiskPanel")}</h3>
      <div class="module-task-list">${riskTasks.slice(0, 8).map(moduleTaskRow).join("")}</div>
    </section>` : ""}
    <section class="module-doc-panel">
      <h3>${t("sourceDocuments")}</h3>
      <div class="module-doc-links">
        ${moduleDocLink(t("brief"), module.briefPath, brief)}
        ${moduleDocLink(t("taskPlan"), module.modulePlanPath, plan)}
      </div>
      <div class="markdown module-doc-preview">${brief ? window.HarnessMarkdown.render(brief.content, "rendered") : `<p>${t("moduleBriefMissing")}</p>`}</div>
    </section>
  </div>`;
}

function moduleBoundaryBlock(title, values) {
  const items = Array.isArray(values) && values.length ? values : [t("none")];
  return `<div class="module-boundary-block">
    <strong>${escapeHtml(title)}</strong>
    ${items.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
  </div>`;
}

function moduleDocLink(labelText, pathValue, document) {
  if (!pathValue && !document) return `<span class="module-doc-link missing">${escapeHtml(labelText)} · ${t("documentMissing")}</span>`;
  return `<span class="module-doc-link">${escapeHtml(labelText)} · ${escapeHtml(pathValue || document.path || t("ready"))}</span>`;
}

function moduleTaskRow(task) {
  const dotClass = /fail|blocked|open/i.test(task.state) ? "state-fail" : /warn|advice|planned|missing|unknown/i.test(task.state) ? "state-warn" : "state-pass";
  const lifecycle = [task.lifecycleState, task.reviewStatus, task.closeoutStatus].filter(Boolean).map((item) => label(item)).join(" · ");
  return `<a class="module-task-row" href="#/tasks/${encodeURIComponent(task.id)}" data-open-drawer="${escapeAttr(task.id)}">
    <div class="module-task-left">
      <i class="module-task-dot ${dotClass}" title="${escapeAttr(task.state)}"></i>
      <span class="module-task-title">${escapeHtml(task.title || task.id)}</span>
      ${lifecycle ? `<small>${escapeHtml(lifecycle)}</small>` : ""}
    </div>
    <span class="module-task-pct">${clampCompletion(task.completion)}%</span>
  </a>`;
}

function moduleUnclassifiedPanel(tasks) {
  return `<section class="module-unclassified-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("unclassifiedWarning")}</p>
        <h2>${t("unclassifiedModule")}</h2>
        <p class="subtle">${t("unclassifiedSummary").replace("{count}", String(tasks.length))}</p>
      </div>
      <a href="#/tasks">${t("openTaskIndex")}</a>
    </div>
    <div class="module-task-list">${tasks.slice(0, 12).map(moduleTaskRow).join("")}</div>
  </section>`;
}
