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

function dashboardModuleView(module) {
  return module?.dashboardModuleView || module?.moduleProjection || {};
}

function moduleSourceLabel(module) {
  const view = dashboardModuleView(module);
  if (view.sourceLabelKey) return t(view.sourceLabelKey);
  if (module?.key === "base") return t("moduleSourceStructure");
  return t("moduleSourceUnknown");
}

function moduleStatusLabel(module) {
  const view = dashboardModuleView(module);
  if (view.statusLabelKey) {
    const translated = t(view.statusLabelKey);
    if (translated !== view.statusLabelKey) return translated;
  }
  return label(view.statusKey || "unknown");
}

function moduleStatusTag(module) {
  const view = dashboardModuleView(module);
  const tone = view.statusTone || (/blocked/i.test(view.statusKey || "") ? "fail" : /planned|unknown/i.test(view.statusKey || "") ? "warn" : "pass");
  return `<span class="tag ${escapeAttr(tone)}">${escapeHtml(moduleStatusLabel(module))}</span>`;
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
    const module = moduleDefinition(key) || { key, title: key, source: "inferred", dashboardModuleView: { sourceLabelKey: "moduleSourceInferred", statusLabelKey: "state_unknown", statusKey: "unknown", statusTone: "warn" } };
    const chips = [
      `${t("columnState")}: ${moduleStatusLabel(module)}`,
      module.owner ? `${t("moduleOwner")}: ${module.owner}` : "",
      module.currentStep ? `${t("moduleCurrentStep")}: ${module.currentStep}` : "",
      module.dependsOn?.length ? `${t("moduleDependsOn")}: ${module.dependsOn.join(", ")}` : "",
      module.scope?.length ? `${t("moduleScope")}: ${module.scope.join(", ")}` : "",
    ].filter(Boolean);
    return {
      eyebrow: moduleSourceLabel(module),
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
    active: tasks.filter((task) => ["active", "missing-materials", "blocked", "review", "lessons", "confirmed", "confirmed-finalization-pending"].includes(taskStateValue(task))).length,
    review: tasks.filter((task) => taskStateValue(task) === "review").length,
    blocked: tasks.filter((task) => taskStateValue(task) === "blocked").length,
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
    counts: { ...emptyUiModuleCounts(), ...(dashboardModuleView(module).counts || {}) },
    tasks: [],
    __countsAuthoritative: !!dashboardModuleView(module).counts,
  }]));
  for (const task of normalCycleTasks()) {
    const key = taskModuleKey(task);
    if (key === "legacy-unclassified") continue;
    if (!moduleMap.has(key)) {
      moduleMap.set(key, {
        key,
        title: taskModuleDisplayLabel(key),
        source: key === "base" ? "structure" : "inferred",
        dashboardModuleView: {
          key,
          title: taskModuleDisplayLabel(key),
          sourceKind: key === "base" ? "structure" : "inferred",
          sourceLabelKey: key === "base" ? "moduleSourceStructure" : "moduleSourceInferred",
          statusKey: "unknown",
          statusLabelKey: "state_unknown",
          statusTone: "warn",
          counts: emptyUiModuleCounts(),
        },
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
  const stateValue = taskStateValue(task);
  if (!module.tasks.some((item) => item.id === task.id)) module.tasks.push(task);
  if (module.__countsAuthoritative) return;
  module.counts.total = (module.counts.total || 0) + 1;
  if (["active", "missing-materials", "blocked", "review", "lessons", "confirmed", "confirmed-finalization-pending"].includes(stateValue)) {
    module.counts.active = (module.counts.active || 0) + 1;
  }
  if (stateValue !== "active") module.counts[stateValue] = (module.counts[stateValue] || 0) + 1;
  if (uiDashboardTaskHasRisk(task)) {
    module.counts.risk = (module.counts.risk || 0) + 1;
  }
  if (taskMaterialsView(task).briefReady === false) {
    module.counts.missingDocs = (module.counts.missingDocs || 0) + 1;
  }
}

function uiDashboardTaskHasRisk(task) {
  const reviewView = taskReviewProjection(task);
  if (reviewView.blocked === true || reviewView.needsMaterials === true) return true;
  if (Array.isArray(reviewView.reasonCodes) && reviewView.reasonCodes.length > 0) return true;
  if (taskStateValue(task) === "blocked") return true;
  const materials = taskMaterialsView(task);
  if (materials.evidenceReady === false) return true;
  return false;
}

function moduleRunStrip(modules, unclassified) {
  const active = modules.filter((module) => Number(module.counts?.active || 0) > 0).length;
  const risk = modules.reduce((sum, module) => sum + Number(module.counts?.risk || 0), 0);
  const registered = modules.filter((module) => dashboardModuleView(module).sourceKind === "registry").length;
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
      <small>${escapeHtml(module.key)} · ${escapeHtml(moduleSourceLabel(module))}</small>
    </span>
    <span class="module-list-counts">
      <b>${Number(counts.active || 0)}</b>
      ${moduleStatusTag(module)}
    </span>
  </a>`;
}

function moduleDetail(module) {
  const tasks = normalCycleTasks().filter((task) => taskModuleKey(task) === module.key);
  const activeTasks = tasks.filter((task) => isActiveTaskState(taskStateValue(task)));
  const riskTasks = tasks.filter(uiDashboardTaskHasRisk);
  const brief = findDocument(module.briefPath || `TARGET:coding-agent-harness/planning/modules/${module.key}/brief.md`);
  const plan = findDocument(module.modulePlanPath || "");
  return `<div class="module-detail-stack">
    <header class="module-detail-header">
      <div>
        <p class="eyebrow">${escapeHtml(module.key === "base" ? t("baseModuleEyebrow") : moduleSourceLabel(module))}</p>
        <h2>${escapeHtml(module.key === "base" ? t("baseModule") : module.title || module.key)}</h2>
        <p class="subtle">${escapeHtml(module.key)}${module.currentStep ? ` · ${escapeHtml(module.currentStep)}` : ""}</p>
      </div>
      ${moduleStatusTag(module)}
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
  const stateValue = taskStateValue(task);
  const dotClass = /fail|blocked|open/i.test(stateValue) ? "state-fail" : /warn|advice|planned|missing|unknown/i.test(stateValue) ? "state-warn" : "state-pass";
  const lifecycle = taskLifecycleDisplay(task);
  return `<a class="module-task-row" href="#/tasks/${encodeURIComponent(task.id)}" data-open-drawer="${escapeAttr(task.id)}">
    <div class="module-task-left">
      <i class="module-task-dot ${dotClass}" title="${escapeAttr(stateValue)}"></i>
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
