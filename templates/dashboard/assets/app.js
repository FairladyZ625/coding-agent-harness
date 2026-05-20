const bundle = window.__HARNESS_DASHBOARD__ || {};
const locale = Object.keys(window.HarnessI18n || { en: {} })[0] || "en";
const labels = window.HarnessI18n?.[locale] || {};

const state = {
  query: "",
  taskState: "all",
  taskGroupMode: "migration",
  taskPageByGroup: {},
  taskGroupPage: 1,
  warningFilter: "all",
  warningPage: 1,
  renderMode: "rendered",
  theme: localStorage.getItem("harness.theme") || "system",
};

const taskPageSize = 25;
const taskGroupsPerPage = 8;
const warningPageSize = 18;

const taskDocTabs = [
  ["brief", "brief.md"],
  ["taskPlan", "task_plan.md"],
  ["strategy", "execution_strategy.md"],
  ["roadmap", "visual_roadmap.md"],
  ["progress", "progress.md"],
  ["review", "review.md"],
  ["findings", "findings.md"],
  ["references", "references/INDEX.md"],
  ["artifacts", "artifacts/INDEX.md"],
];

function t(key) {
  return labels[key] || key;
}

function app() {
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme === "system" ? systemTheme : state.theme;
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  const root = document.getElementById("app");
  root.innerHTML = shell();
  bind();
}

function shell() {
  return `<div class="visibility-shell">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t("eyebrow")}</p>
        <h1>${escapeHtml(projectName())} ${t("projectCockpit")}</h1>
        <p class="hero-sub">${t("dashboardPromise")}</p>
      </div>
      <div class="hero-actions">
        ${routeLink("#/", t("overview"), "overview")}
        ${routeLink("#/tasks", t("taskIndex"), "tasks")}
        ${routeLink("#/modules", t("moduleView"), "modules")}
        <button data-theme-toggle>${themeLabel()}</button>
      </div>
    </header>
    ${renderRoute()}
  </div>`;
}

function renderRoute() {
  const route = currentRoute();
  if (route.name === "task") return taskDetail(route);
  if (route.name === "modules") return modulesView(route.id);
  if (route.name === "tasks") return taskIndex();
  return overview();
}

function currentRoute() {
  const hash = window.location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "tasks" && parts[1]) return { name: "task", id: parts[1], doc: parts[2] === "docs" ? parts[3] || "" : "" };
  if (parts[0] === "modules") return { name: "modules", id: parts[1] || "" };
  if (parts[0] === "tasks") return { name: "tasks" };
  return { name: "overview" };
}

function routeLink(hash, text, routeName) {
  const active = currentRoute().name === routeName;
  return `<a class="${active ? "active" : ""}" href="${hash}">${escapeHtml(text)}</a>`;
}

function overview() {
  return `<main class="stack">
    ${statusStrip()}
    ${flowPanel()}
    ${migrationPanel()}
    ${activeTaskBriefs()}
    ${lessonPanel()}
    ${healthPanel()}
  </main>`;
}

function statusStrip() {
  const status = bundle.status?.checkState?.status || "unknown";
  const failures = bundle.status?.checkState?.failures || 0;
  const warnings = bundle.status?.checkState?.warnings || 0;
  const tasks = bundle.status?.tasks || [];
  const withBrief = tasks.filter((task) => task.briefSource === "standalone").length;
  return `<section class="status-strip">
    <div class="status-primary ${status}">
      <span>${t("readiness")}</span>
      <strong>${label(status)}</strong>
      <p>${nextActionText()}</p>
    </div>
    ${metric(t("tasks"), tasks.length)}
    ${metric(t("briefCoverage"), `${withBrief}/${tasks.length}`)}
    ${metric(t("blockers"), failures)}
    ${metric(t("advice"), warnings)}
  </section>`;
}

function metric(labelText, value) {
  return `<div class="metric"><span>${escapeHtml(labelText)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function nextActionText() {
  const failures = bundle.status?.checkState?.failures || 0;
  if (failures > 0) return t("resolveBlockers");
  const missingBriefs = (bundle.status?.tasks || []).filter((task) => task.briefSource !== "standalone").length;
  if (missingBriefs > 0) return `${missingBriefs} ${t("missingBriefs")}`;
  const warnings = bundle.status?.checkState?.warnings || 0;
  if (warnings > 0) return t("reviewAdvice");
  return t("noBlockers");
}

function flowPanel() {
  const mermaid = projectMermaid();
  return `<section class="flow-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("firstLook")}</p>
        <h2>${t("projectFlow")}</h2>
      </div>
      <span class="subtle">${graphSummary()}</span>
    </div>
    <div class="flow-canvas">${mermaid ? window.HarnessMermaid.render(mermaid) : emptyState(t("noFlow"))}</div>
    ${usesAggregateFlow() ? migrationRunwayBreakdown() : ""}
  </section>`;
}

function projectMermaid() {
  if (usesAggregateFlow()) return migrationAggregateMermaid();
  const graph = bundle.graph || { nodes: [], edges: [] };
  const preferredTypes = graph.nodes?.some((node) => node.type === "module") ? ["module", "step"] : ["task", "phase"];
  const nodes = (graph.nodes || [])
    .filter((node) => preferredTypes.includes(node.type))
    .filter((node) => node.type !== "phase" || ["in_progress", "review", "blocked", "done"].includes(node.state))
    .slice(0, 28);
  if (nodes.length < 2) return mermaidFromBriefs();
  const nodeIds = new Set(nodes.map((node) => node.id));
  const lines = ["flowchart LR"];
  let edgeCount = 0;
  for (const edge of graph.edges || []) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    lines.push(`  ${mermaidId(edge.from)}["${mermaidLabel(edge.from)}"] --> ${mermaidId(edge.to)}["${mermaidLabel(edge.to)}"]`);
    edgeCount += 1;
    if (edgeCount >= 34) break;
  }
  if (edgeCount === 0) {
    for (let index = 1; index < nodes.length; index += 1) {
      lines.push(`  ${mermaidId(nodes[index - 1].id)}["${mermaidLabel(nodes[index - 1].id)}"] --> ${mermaidId(nodes[index].id)}["${mermaidLabel(nodes[index].id)}"]`);
    }
  }
  return lines.join("\n");
}

function usesAggregateFlow() {
  const graph = bundle.graph || { nodes: [], edges: [] };
  const taskCount = (bundle.status?.tasks || []).length;
  const taskNodes = (graph.nodes || []).filter((node) => node.type === "task").length;
  const usefulEdges = (graph.edges || []).filter((edge) => ["depends_on", "current_step"].includes(edge.type)).length;
  return taskCount > 80 || taskNodes > 80 || ((graph.nodes || []).length > 80 && usefulEdges < 6);
}

function migrationAggregateMermaid() {
  const tasks = bundle.status?.tasks || [];
  const warnings = warningQueue();
  const activeContracts = warnings.filter((warning) => warning.phase === "active-task-contracts").length;
  const moduleCount = new Set(tasks.map(taskModuleKey)).size;
  const reviewWarnings = warnings.filter((warning) => ["review-evidence", "strict-cutover"].includes(warning.phase)).length;
  const lines = [
    "flowchart LR",
    `  baseline["${t("runwayBaseline")}\\n${tasks.length} ${t("tasks")}"] --> triage["${t("runwayTriage")}\\n${warnings.length} ${t("warnings")}"]`,
    `  triage --> contracts["${t("runwayContracts")}\\n${activeContracts} ${t("items")}"]`,
    `  contracts --> modules["${t("runwayModules")}\\n${moduleCount} ${t("groups")}"]`,
    `  modules --> cutover["${t("runwayCutover")}\\n${reviewWarnings} ${t("items")}"]`,
  ];
  return lines.join("\n");
}

function migrationRunwayBreakdown() {
  const tasks = bundle.status?.tasks || [];
  const warnings = warningQueue();
  const phases = [
    ["baseline", t("runwayBaseline"), tasks.length, t("tasks"), "#/tasks"],
    ["triage", t("runwayTriage"), warnings.length, t("warnings"), "#/"],
    ["active-task-contracts", t("runwayContracts"), warnings.filter((warning) => warning.phase === "active-task-contracts").length, t("items"), "#/"],
    ["module-classification", t("runwayModules"), new Set(tasks.map(taskModuleKey)).size, t("groups"), "#/tasks"],
    ["strict-cutover", t("runwayCutover"), warnings.filter((warning) => warning.phase === "strict-cutover").length, t("items"), "#/"],
  ];
  return `<div class="runway-breakdown">
    ${phases.map(([phase, title, count, unit, href]) => `<a href="${href}" data-runway-phase="${escapeAttr(phase)}"><strong>${escapeHtml(title)}</strong><span>${count} ${escapeHtml(unit)}</span></a>`).join("")}
  </div>`;
}

function mermaidFromBriefs() {
  const brief = activeTasks().map((task) => taskDocument(task, "brief.md")).find((doc) => doc?.content?.includes("```mermaid"));
  const match = brief?.content.match(/```mermaid\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : "";
}

function graphSummary() {
  const graph = bundle.graph || { nodes: [], edges: [] };
  if (usesAggregateFlow()) return `${t("aggregateMigrationView")} · ${(bundle.status?.tasks || []).length} ${t("tasks")}`;
  return `${graph.nodes?.length || 0} ${t("nodes")} · ${graph.edges?.length || 0} ${t("edges")}`;
}

function activeTaskBriefs() {
  const tasks = activeTasks().slice(0, 8);
  return `<section class="task-briefs">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("currentWork")}</p>
        <h2>${t("activeBriefs")}</h2>
      </div>
      <a href="#/tasks">${t("openTaskIndex")}</a>
    </div>
    <div class="brief-grid">${tasks.map((task) => taskBriefCard(task, { compact: false })).join("") || emptyState(t("noActiveTasks"))}</div>
  </section>`;
}

function activeTasks() {
  const tasks = bundle.status?.tasks || [];
  const active = tasks.filter((task) => ["in_progress", "review", "blocked", "planned", "not_started"].includes(task.state));
  if (active.length > 0) return active;
  return tasks.filter((task) => task.briefSource === "standalone").slice(0, 6);
}

function taskBriefCard(task, { compact = true } = {}) {
  const doc = taskDocument(task, "brief.md");
  return `<article class="brief-card ${compact ? "compact" : ""}">
    <div class="card-head">
      <div>
        <a href="#/tasks/${encodeURIComponent(task.id)}">${escapeHtml(task.title)}</a>
        <p>${escapeHtml(task.id)}</p>
      </div>
      ${tag(task.state)}
    </div>
    ${progressBar(task.completion)}
    <div class="brief-content">${doc ? window.HarnessMarkdown.render(doc.content, "rendered") : generatedBrief(task)}</div>
  </article>`;
}

function generatedBrief(task) {
  const phaseText = (task.phases || []).slice(0, 6).map((phase) => `<li><strong>${escapeHtml(phase.id)}</strong> ${escapeHtml(phase.output || phase.state)} · ${phase.completion}%</li>`).join("");
  return `<div class="missing-brief">
    <strong>${t("visibilityBriefMissing")}</strong>
    <p>${t("missingBriefExplain")}</p>
    <ul>${phaseText || `<li>${t("noPhaseData")}</li>`}</ul>
  </div>`;
}

function taskIndex() {
  const tasks = filteredTasks();
  const groups = taskGroups(tasks);
  const orderedGroups = orderedTaskGroups(groups);
  const groupPageCount = Math.max(1, Math.ceil(orderedGroups.length / taskGroupsPerPage));
  const groupPage = Math.min(Math.max(1, Number(state.taskGroupPage) || 1), groupPageCount);
  const visibleGroups = orderedGroups.slice((groupPage - 1) * taskGroupsPerPage, groupPage * taskGroupsPerPage);
  return `<main class="stack">
    <section class="index-toolbar">
      <input data-search value="${escapeAttr(state.query)}" placeholder="${t("searchPlaceholder")}" aria-label="${t("searchTasks")}">
      <select data-state-filter aria-label="${t("stateFilter")}">
        ${["all", "in_progress", "review", "blocked", "planned", "done", "unknown"].map((value) => `<option value="${value}" ${state.taskState === value ? "selected" : ""}>${label(value)}</option>`).join("")}
      </select>
      <select data-group-mode aria-label="${t("groupBy")}">
        ${["migration", "module", "month", "state"].map((value) => `<option value="${value}" ${state.taskGroupMode === value ? "selected" : ""}>${t(`group_${value}`)}</option>`).join("")}
      </select>
      <span>${tasks.length} / ${(bundle.status?.tasks || []).length}</span>
    </section>
    <section class="group-pager">
      <span>${t("showingGroups")} ${visibleGroups.length ? (groupPage - 1) * taskGroupsPerPage + 1 : 0}-${Math.min(groupPage * taskGroupsPerPage, orderedGroups.length)} / ${orderedGroups.length}</span>
      ${pager("task-groups", groupPage, groupPageCount)}
    </section>
    ${visibleGroups.map(([group, groupTasks]) => taskGroup(group, groupTasks)).join("")}
  </main>`;
}

function orderedTaskGroups(groups) {
  const rank = (group) => {
    if (group.startsWith("module:")) return 2;
    if (group.startsWith("state:")) return 2;
    if (group.startsWith("month:")) return 2;
    if (group === "active") return 0;
    if (group === "brief-ready") return 1;
    if (group.startsWith("legacy:")) return 2;
    if (group === "unknown") return 3;
    return 4;
  };
  return Object.entries(groups).sort(([left], [right]) => rank(left) - rank(right) || left.localeCompare(right));
}

function taskGroups(tasks) {
  if (state.taskGroupMode === "module") {
    return groupBy(tasks, (task) => `module:${taskModuleKey(task)}`);
  }
  if (state.taskGroupMode === "month") {
    return groupBy(tasks, (task) => {
      const match = task.shortId?.match(/^(\d{4}-\d{2})/);
      return match ? `month:${match[1]}` : "month:unknown";
    });
  }
  if (state.taskGroupMode === "state") {
    return groupBy(tasks, (task) => `state:${task.state || "unknown"}`);
  }
  return groupBy(tasks, (task) => {
    if (["in_progress", "review", "blocked", "planned", "not_started"].includes(task.state)) return "active";
    if (task.briefSource === "standalone") return "brief-ready";
    const match = task.shortId?.match(/^(\d{4}-\d{2})/);
    return match ? `legacy:${match[1]}` : task.state || "unknown";
  });
}

function taskGroup(group, tasks) {
  const pageCount = Math.max(1, Math.ceil(tasks.length / taskPageSize));
  const page = Math.min(Math.max(1, Number(state.taskPageByGroup[group]) || 1), pageCount);
  const start = (page - 1) * taskPageSize;
  const visibleTasks = tasks.slice(start, start + taskPageSize);
  return `<section class="task-group">
      <div class="section-head">
        <div>
          <h2>${taskGroupLabel(group)}</h2>
          <p class="subtle">${t("showing")} ${Math.min(start + 1, tasks.length)}-${Math.min(start + visibleTasks.length, tasks.length)} / ${tasks.length}</p>
        </div>
        ${pager("task", page, pageCount, group)}
      </div>
      <div class="task-list">
        <div class="task-row task-row-head"><span>${t("columnTask")}</span><span>${t("columnState")}</span><span>${t("columnCompletion")}</span><span>${t("columnBrief")}</span></div>
        ${visibleTasks.map(taskRow).join("")}
      </div>
    </section>`;
}

function taskGroupLabel(group) {
  if (group === "active") return t("activeCurrent");
  if (group === "brief-ready") return t("briefReadyGroup");
  if (group.startsWith("legacy:")) return `${t("legacyMonth")} ${group.slice("legacy:".length)}`;
  if (group.startsWith("module:")) return `${t("inferredModule")} · ${group.slice("module:".length)}`;
  if (group.startsWith("month:")) return `${t("legacyMonth")} ${group.slice("month:".length)}`;
  if (group.startsWith("state:")) return `${t("columnState")} · ${label(group.slice("state:".length))}`;
  return label(group);
}

function filteredTasks() {
  const query = state.query.trim().toLowerCase();
  return (bundle.status?.tasks || []).filter((task) => {
    const stateMatch = state.taskState === "all" || task.state === state.taskState;
    if (!stateMatch) return false;
    if (!query) return true;
    return [task.id, task.shortId, task.title, task.module, task.inferredModule, task.classificationSource, task.classificationBucket, task.state].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function taskModuleKey(task) {
  return task.module || task.inferredModule || "legacy-unclassified";
}

function taskRow(task) {
  return `<a class="task-row" href="#/tasks/${encodeURIComponent(task.id)}">
    <span data-label="${escapeAttr(t("columnTask"))}"><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.id)} · ${escapeHtml(taskModuleKey(task))}</small></span>
    <span data-label="${escapeAttr(t("columnState"))}">${tag(task.state)}</span>
    <span data-label="${escapeAttr(t("columnCompletion"))}">${task.completion}%</span>
    <span data-label="${escapeAttr(t("columnBrief"))}">${escapeHtml(task.briefSource === "standalone" ? t("briefReady") : t("briefMissing"))}</span>
  </a>`;
}

function taskDetail(route) {
  const taskId = route.id;
  const task = (bundle.status?.tasks || []).find((item) => item.id === taskId);
  if (!task) return `<main>${emptyState(t("taskNotFound"))}</main>`;
  return `<main class="task-detail">
    <nav class="crumbs"><a href="#/tasks">${t("taskIndex")}</a><span>/</span><span>${escapeHtml(task.id)}</span></nav>
    <section class="detail-hero">
      <div>
        <p class="eyebrow">${t("taskVisibility")}</p>
        <h2>${escapeHtml(task.title)}</h2>
        <p>${escapeHtml(task.path)}</p>
      </div>
      <div class="detail-score">${task.completion}%</div>
    </section>
    ${phaseTimeline(task)}
    <section class="detail-grid">
      <article class="detail-main">
        ${taskDocSection(task, "brief.md", t("brief"), true)}
        ${!taskDocument(task, "brief.md") ? taskDocSection(task, "task_plan.md", t("taskPlan"), false) : ""}
        ${taskDocSection(task, "execution_strategy.md", t("strategy"), false)}
        ${taskDocSection(task, "visual_roadmap.md", t("roadmap"), false)}
        ${selectedSourceDocument(task, route.doc)}
      </article>
      <aside class="detail-side">
        ${openFindings(task)}
        ${evidenceList(task)}
        ${documentTabs(task)}
      </aside>
    </section>
  </main>`;
}

function phaseTimeline(task) {
  return `<section class="phase-timeline">
    <h2>${t("phaseTimeline")}</h2>
    ${(task.phases || []).map((phase) => `<div class="phase-step ${phase.state}">
      <strong>${escapeHtml(phase.id)}</strong>
      <span>${phase.completion}%</span>
      <p>${escapeHtml(phase.output || phase.blockingRisk || phase.state)}</p>
      ${progressBar(phase.completion)}
    </div>`).join("") || emptyState(t("noPhaseData"))}
  </section>`;
}

function taskDocSection(task, fileName, title, required) {
  const doc = taskDocument(task, fileName);
  if (!doc && !required) return "";
  return `<section class="doc-section">
    <div class="section-head"><h2>${escapeHtml(title)}</h2>${doc ? `<button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button>` : ""}</div>
    <div class="markdown">${doc ? window.HarnessMarkdown.render(doc.content, state.renderMode) : generatedBrief(task)}</div>
  </section>`;
}

function documentTabs(task) {
  const docs = taskDocTabs
    .map(([tab, file]) => [tab, taskDocument(task, file)])
    .filter(([, doc]) => doc);
  return `<section class="side-panel">
    <h3>${t("sourceDocuments")}</h3>
    ${docs.map(([tab, doc]) => `<a href="#/tasks/${encodeURIComponent(task.id)}/docs/${encodeURIComponent(tab)}" title="${escapeAttr(doc.path)}">${escapeHtml(t(tab))}</a>`).join("") || `<p>${t("noDocuments")}</p>`}
  </section>`;
}

function selectedSourceDocument(task, tab) {
  if (!tab) return "";
  const match = taskDocTabs.find(([key]) => key === tab);
  if (!match) return "";
  const doc = taskDocument(task, match[1]);
  if (!doc) return "";
  return `<section class="doc-section selected-source">
    <div class="section-head"><h2>${t("selectedSource")} · ${t(match[0])}</h2><button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button></div>
    <div class="markdown">${window.HarnessMarkdown.render(doc.content, state.renderMode)}</div>
  </section>`;
}

function openFindings(task) {
  const risks = task.risks || [];
  return `<section class="side-panel">
    <h3>${t("openFindings")}</h3>
    ${risks.map((risk) => `<div class="finding ${risk.open || risk.blocksRelease ? "open" : ""}"><strong>${escapeHtml(risk.severity)}</strong><span>${escapeHtml(risk.summary)}</span></div>`).join("") || `<p>${t("noOpenFindings")}</p>`}
  </section>`;
}

function evidenceList(task) {
  const evidence = task.evidence || [];
  return `<section class="side-panel">
    <h3>${t("evidence")}</h3>
    ${evidence.map((item) => `<p><strong>${escapeHtml(item.type || "evidence")}</strong> ${escapeHtml(item.summary || "")}</p>`).join("") || `<p>${t("noEvidence")}</p>`}
  </section>`;
}

function modulesView(moduleId = "") {
  const graph = bundle.graph || { nodes: [], edges: [] };
  const explicitModules = (graph.nodes || []).filter((node) => node.type === "module");
  const moduleMap = new Map(explicitModules.map((module) => [module.id.replace(/^module:/, ""), module]));
  for (const task of bundle.status?.tasks || []) {
    const key = taskModuleKey(task);
    if (!moduleMap.has(key)) moduleMap.set(key, { id: `module:${key}`, type: "module", label: key, state: task.classificationSource || "inferred" });
  }
  const modules = [...moduleMap.values()];
  return `<main class="stack">
    ${flowPanel()}
    <section class="module-grid">
      ${modules.map((module) => moduleCard(module)).join("") || emptyState(t("noModules"))}
    </section>
  </main>`;
}

function moduleCard(module) {
  const moduleKey = module.id.replace(/^module:/, "");
  const tasks = (bundle.status?.tasks || []).filter((task) => taskModuleKey(task) === moduleKey);
  const visibleTasks = tasks.slice(0, taskPageSize);
  const brief = findDocument(`TARGET:docs/09-PLANNING/MODULES/${moduleKey}/brief.md`);
  return `<article class="module-card">
    <div class="card-head"><h2>${escapeHtml(module.label || moduleKey)}</h2>${tag(module.state || "unknown")}</div>
    <div class="markdown">${brief ? window.HarnessMarkdown.render(brief.content, "rendered") : `<p>${t("moduleBriefMissing")}</p>`}</div>
    <h3>${t("moduleTasks")} · ${tasks.length}</h3>
    ${visibleTasks.map(taskRow).join("") || `<p>${t("noModuleTasks")}</p>`}
    ${tasks.length > visibleTasks.length ? `<a class="module-more" href="#/tasks" data-runway-phase="module-classification">${t("openTaskIndex")} · ${tasks.length - visibleTasks.length}</a>` : ""}
  </article>`;
}

function migrationPanel() {
  const advice = warningQueue();
  const missingBriefs = advice.filter((warning) => warning.type === "missing-brief").length;
  if (advice.length === 0 && missingBriefs === 0) return "";
  const groups = groupBy(advice, (item) => item.category || "Advice");
  const filters = ["all", ...Object.keys(groups).sort(), ...new Set(advice.map((item) => item.type).filter(Boolean)), "active-task-contracts", "strict-cutover"];
  const filtered = state.warningFilter === "all" ? advice : advice.filter((item) => (item.category || "Advice") === state.warningFilter || item.phase === state.warningFilter || item.type === state.warningFilter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / warningPageSize));
  const page = Math.min(Math.max(1, Number(state.warningPage) || 1), pageCount);
  const visible = filtered.slice((page - 1) * warningPageSize, page * warningPageSize);
  return `<section class="migration-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("migration")}</p>
        <h2>${t("migrationWorkbench")}</h2>
      </div>
      <span>${advice.length} ${t("advice")} · ${missingBriefs} ${t("briefMissing")}</span>
    </div>
    <div class="migration-grid">
      ${Object.entries(groups).slice(0, 6).map(([category, items]) => `<button data-warning-filter="${escapeAttr(category)}" class="${state.warningFilter === category ? "active" : ""}"><strong>${escapeHtml(category)}</strong><p>${items.length} ${t("items")}</p></button>`).join("")}
      ${missingBriefs > 0 ? `<div><strong>${t("visibilityLayer")}</strong><p>${missingBriefs} ${t("missingBriefs")}</p></div>` : ""}
    </div>
    <div class="warning-workbench">
      <div class="warning-toolbar">
        <select data-warning-filter-select aria-label="${t("warningFilter")}">
          ${filters.map((filter) => `<option value="${escapeAttr(filter)}" ${state.warningFilter === filter ? "selected" : ""}>${filter === "all" ? t("allWarnings") : escapeHtml(filter)}</option>`).join("")}
        </select>
        <span>${t("showing")} ${visible.length ? (page - 1) * warningPageSize + 1 : 0}-${Math.min(page * warningPageSize, filtered.length)} / ${filtered.length}</span>
        ${pager("warning", page, pageCount)}
      </div>
      <div class="warning-list">
        ${visible.map(warningRow).join("") || emptyState(t("noWarnings"))}
      </div>
    </div>
  </section>`;
}

function warningRow(warning) {
  const affected = warning.affectedPaths?.length ? warning.affectedPaths.join(", ") : warning.affected;
  return `<article class="warning-row">
    <div>
      <strong>${escapeHtml(warning.id)} · ${escapeHtml(warning.title)}</strong>
      <p>${escapeHtml(affected || "project")}</p>
    </div>
    <span>${tag(warning.priority || warning.severity)}</span>
    <span>${escapeHtml(warning.status || "open")}</span>
    <span>${escapeHtml(warning.fixability || "manual")}</span>
    <span>${escapeHtml(warning.phase || "triage")}</span>
    <p>${escapeHtml(warning.requiredAction || warning.detail || "")} · ${t("confidence")}: ${escapeHtml(warning.confidence || "medium")}</p>
  </article>`;
}

function warningQueue() {
  const adoptionWarnings = (bundle.adoption?.warnings || []).map((warning) => ({ ...warning }));
  const existingBriefPaths = new Set(adoptionWarnings.filter((warning) => warning.type === "missing-brief").map((warning) => warning.affected));
  const briefWarnings = (bundle.status?.tasks || [])
    .filter((task) => task.briefSource !== "standalone")
    .filter((task) => !existingBriefPaths.has(task.path))
    .map((task, index) => ({
      id: `VB-${String(index + 1).padStart(3, "0")}`,
      category: "Visibility Layer",
      type: "missing-brief",
      scope: "task",
      priority: ["in_progress", "review", "blocked", "planned", "not_started"].includes(task.state) ? "P2" : "P3",
      phase: "active-task-contracts",
      fixability: "guided",
      status: "open",
      confidence: task.state === "unknown" ? "medium" : "high",
      severity: "advice",
      title: t("visibilityBriefMissing"),
      affected: task.path,
      affectedPaths: [task.path],
      requiredAction: t("addVisibilityBrief"),
      detail: `${task.id} ${task.title}`,
    }));
  return [...adoptionWarnings, ...briefWarnings].sort(warningSort);
}

function warningSort(left, right) {
  const priorityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const fixRank = { template: 0, guided: 1, "human-evidence": 2, decision: 3, manual: 4 };
  return (priorityRank[left.priority] ?? 9) - (priorityRank[right.priority] ?? 9)
    || (fixRank[left.fixability] ?? 9) - (fixRank[right.fixability] ?? 9)
    || String(left.phase || "").localeCompare(String(right.phase || ""))
    || String(left.id || "").localeCompare(String(right.id || ""));
}

function pager(kind, page, pageCount, group = "") {
  if (pageCount <= 1) return `<span class="pager muted">${page}/${pageCount}</span>`;
  const groupAttr = group ? ` data-page-group="${escapeAttr(group)}"` : "";
  return `<div class="pager">
    <button data-page-kind="${kind}" data-page="${page - 1}"${groupAttr} ${page <= 1 ? "disabled" : ""}>${t("prevPage")}</button>
    <span>${page}/${pageCount}</span>
    <button data-page-kind="${kind}" data-page="${page + 1}"${groupAttr} ${page >= pageCount ? "disabled" : ""}>${t("nextPage")}</button>
  </div>`;
}

function lessonPanel() {
  const lessons = (bundle.tables?.tables || [])
    .filter((table) => table.kind === "lessons-ssot")
    .flatMap((table) => table.rows)
    .slice(0, 6);
  return `<section class="lesson-panel">
    <div class="section-head"><h2>${t("lessons")}</h2><span>${lessons.length}</span></div>
    ${lessons.map((row) => {
      const cells = row.cells || {};
      return `<div class="lesson"><strong>${escapeHtml(cells.ID || cells.Lesson || cells.Title || t("lesson"))}</strong><p>${escapeHtml(cells.Summary || cells.Pattern || cells.Status || "")}</p></div>`;
    }).join("") || emptyState(t("noLessons"))}
  </section>`;
}

function healthPanel() {
  const details = bundle.status?.checkState?.details || { failures: [], warnings: [] };
  return `<section class="health-panel">
    <div><h2>${t("releaseHealth")}</h2><p>${escapeHtml(bundle.status?.mode || "unknown")} · schema ${escapeHtml(bundle.status?.schemaVersion || "n/a")}</p></div>
    <div class="health-lists">
      <details ${details.failures?.length ? "open" : ""}><summary>${t("failures")} (${details.failures?.length || 0})</summary>${list(details.failures)}</details>
      <details><summary>${t("warnings")} (${details.warnings?.length || 0})</summary>${list(details.warnings?.slice(0, 40))}</details>
    </div>
  </section>`;
}

function taskDocument(task, fileName) {
  return findDocument(`${task.path}/${fileName}`);
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
  return `<div class="progress" aria-label="${score}%"><i style="width:${score}%"></i></div>`;
}

function tag(value) {
  const raw = String(value || "unknown");
  const klass = /fail|blocked|open/i.test(raw) ? "fail" : /warn|advice|planned|missing|unknown/i.test(raw) ? "warn" : /pass|done|present|verified|review|in_progress/i.test(raw) ? "pass" : "";
  return `<span class="tag ${klass}">${escapeHtml(label(raw))}</span>`;
}

function label(value) {
  return t(`state_${value}`) || String(value || "unknown").replaceAll("_", " ");
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

function bind() {
  document.querySelectorAll("[data-search]").forEach((input) => input.addEventListener("input", () => {
    state.query = input.value;
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    app();
  }));
  document.querySelectorAll("[data-state-filter]").forEach((select) => select.addEventListener("change", () => {
    state.taskState = select.value;
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    app();
  }));
  document.querySelectorAll("[data-group-mode]").forEach((select) => select.addEventListener("change", () => {
    state.taskGroupMode = select.value;
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    app();
  }));
  document.querySelectorAll("[data-render-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.renderMode = state.renderMode === "rendered" ? "source" : "rendered";
    app();
  }));
  document.querySelectorAll("[data-warning-filter]").forEach((button) => button.addEventListener("click", () => {
    state.warningFilter = button.dataset.warningFilter || "all";
    state.warningPage = 1;
    app();
  }));
  document.querySelectorAll("[data-warning-filter-select]").forEach((select) => select.addEventListener("change", () => {
    state.warningFilter = select.value;
    state.warningPage = 1;
    app();
  }));
  document.querySelectorAll("[data-page-kind]").forEach((button) => button.addEventListener("click", () => {
    const page = Math.max(1, Number(button.dataset.page) || 1);
    if (button.dataset.pageKind === "warning") state.warningPage = page;
    if (button.dataset.pageKind === "task-groups") state.taskGroupPage = page;
    if (button.dataset.pageKind === "task") state.taskPageByGroup[button.dataset.pageGroup || ""] = page;
    app();
  }));
  document.querySelectorAll("[data-runway-phase]").forEach((link) => link.addEventListener("click", () => {
    const phase = link.dataset.runwayPhase || "all";
    if (phase === "module-classification") state.taskGroupMode = "module";
    if (["triage", "active-task-contracts", "strict-cutover"].includes(phase)) state.warningFilter = phase === "triage" ? "all" : phase;
    state.warningPage = 1;
    state.taskGroupPage = 1;
    if (link.getAttribute("href") === "#/") app();
  }));
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : state.theme === "light" ? "system" : "dark";
    localStorage.setItem("harness.theme", state.theme);
    app();
  }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

window.addEventListener("hashchange", app);
app();
