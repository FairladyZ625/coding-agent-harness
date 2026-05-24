const bundle = window.__HARNESS_DASHBOARD__ || {};
const defaultLocale = window.__HARNESS_LOCALE__ || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");
let locale = localStorage.getItem("harness.locale") || defaultLocale;
if (!window.HarnessI18n?.[locale]) locale = "en";
let labels = window.HarnessI18n?.[locale] || {};

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
  taskLayout: localStorage.getItem("harness.taskLayout") || "list",
  taskSortOrder: localStorage.getItem("harness.taskSortOrder") === "asc" ? "asc" : "desc",
  runtime: { mode: "static", csrfToken: "", writableActions: [] },
  runtimeLoaded: false,
  runtimePoller: null,
};

const taskPageSize = 25;
const taskGroupsPerPage = 8;
const warningPageSize = 18;

const taskDocTabs = [
  ["brief", "brief.md"],
  ["taskPlan", "task_plan.md"],
  ["strategy", "execution_strategy.md"],
  ["visualMap", "visual_map.md"],
  ["legacyRoadmap", "visual_roadmap.md"],
  ["lessonCandidates", "lesson_candidates.md"],
  ["longRunningContract", "long-running-task-contract.md"],
  ["progress", "progress.md"],
  ["review", "review.md"],
  ["findings", "findings.md"],
  ["walkthrough", "__walkthrough__"],
  ["references", "references/INDEX.md"],
  ["artifacts", "artifacts/INDEX.md"],
];

function t(key) {
  return labels[key] || key;
}

function setLocale(nextLocale) {
  locale = window.HarnessI18n?.[nextLocale] ? nextLocale : "en";
  labels = window.HarnessI18n?.[locale] || {};
  localStorage.setItem("harness.locale", locale);
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
      </div>
      <div class="hero-actions">
        ${routeLink("#/", t("overview"), "overview")}
        ${routeLink("#/tasks", t("taskIndex"), "tasks")}
        ${routeLink("#/review", t("reviewQueue"), "review")}
        ${routeLink("#/modules", t("moduleView"), "modules")}
        <button data-language-toggle>${locale === "zh" ? "EN" : "中文"}</button>
        <button data-theme-toggle>${themeLabel()}</button>
      </div>
    </header>
    ${runtimeModeBanner()}
    ${renderRoute()}
    <div id="drawer-overlay" class="drawer-overlay"></div>
    <div id="task-drawer" class="task-drawer"></div>
  </div>`;
}

function runtimeModeBanner() {
  if (window.__HARNESS_WORKBENCH__ === true) return "";
  return `<section class="runtime-banner">
    <strong>${t("staticReadOnly")}</strong>
    <span>${t("staticReadOnlyDetail")}</span>
    <code>harness dev</code>
  </section>`;
}

function renderRoute() {
  const route = currentRoute();
  if (route.name === "task") return taskDetail(route);
  if (route.name === "reviewTask") return reviewWorkspace(route);
  if (route.name === "review") return reviewQueue();
  if (route.name === "modules") return modulesView(route.id);
  if (route.name === "tasks") return taskIndex();
  return overview();
}

function currentRoute() {
  const hash = window.location.hash || "#/";
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "tasks" && parts[1]) return { name: "task", id: parts[1], doc: parts[2] === "docs" ? parts[3] || "" : "" };
  if (parts[0] === "review" && parts[1]) return { name: "reviewTask", id: parts[1] };
  if (parts[0] === "review") return { name: "review" };
  if (parts[0] === "modules") return { name: "modules", id: parts[1] || "" };
  if (parts[0] === "tasks") return { name: "tasks" };
  return { name: "overview" };
}

function routeLink(hash, text, routeName) {
  const current = currentRoute().name;
  const active = current === routeName || (routeName === "review" && current === "reviewTask");
  return `<a class="${active ? "active" : ""}" href="${hash}">${escapeHtml(text)}</a>`;
}

function overview() {
  return `<div class="dashboard-grid">
    <main class="dashboard-main stack">
      ${flowPanel()}
      ${activeTaskBriefs()}
      ${migrationSummaryPanel()}
    </main>
    <aside class="dashboard-sidebar stack">
      ${statusStrip()}
      ${ledgerPanel()}
      ${healthPanel()}
      ${lessonPanel()}
    </aside>
  </div>`;
}

function statusStrip() {
  const status = bundle.status?.checkState?.status || "unknown";
  const failures = bundle.status?.checkState?.failures || 0;
  const warnings = bundle.status?.checkState?.warnings || 0;
  const tasks = bundle.status?.tasks || [];
  const summary = bundle.status?.summary || {};
  const visual = summary.visualMapCoverage || {};
  const withBrief = tasks.filter((task) => task.briefSource === "standalone").length;
  return `<section class="status-card-group">
    <div class="status-primary ${status}">
      <span>${t("readiness")}</span>
      <strong>${label(status)}</strong>
      <p>${nextActionText()}</p>
    </div>
    <div class="metrics-grid">
      ${metric(t("tasks"), tasks.length)}
      ${metric(t("briefCoverage"), `${withBrief}/${tasks.length}`)}
      ${metric(t("visualMapCoverage"), `${visual.canonical || 0}/${summary.visualMapRequiredCount || tasks.length}`)}
      ${metric(t("fullCutover"), summary.fullCutoverEligible ? t("ready") : t("notReady"))}
      ${metric(t("legacyVisualOnly"), summary.legacyVisualOnlyCount || 0)}
      ${metric(t("weakBrief"), summary.weakBriefCount || 0)}
      ${metric(t("blockers"), failures)}
      ${metric(t("advice"), warnings)}
    </div>
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
  const tasks = bundle.status?.tasks || [];
  const total = tasks.length;
  if (total === 0) return "";
  const active = tasks.filter((task) => isActiveTaskState(task.state)).length;
  const done = tasks.filter((task) => !isActiveTaskState(task.state) && (task.state === "done" || task.completion === 100)).length;
  const planned = Math.max(0, total - done - active);
  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
  return `<section class="flow-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("firstLook")}</p>
        <h2>${t("projectProgress")}</h2>
      </div>
      <span class="subtle">${done}/${total} ${t("completed")}</span>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar">
        ${done > 0 ? `<div class="progress-segment done" style="width:${pct(done)}%" title="${t("done")}: ${done}"></div>` : ""}
        ${active > 0 ? `<div class="progress-segment active" style="width:${pct(active)}%" title="${t("active")}: ${active}"></div>` : ""}
        ${planned > 0 ? `<div class="progress-segment planned" style="width:${pct(planned)}%" title="${t("planned")}: ${planned}"></div>` : ""}
      </div>
      <div class="progress-legend">
        <span class="legend-item"><span class="legend-dot done"></span>${t("done")} ${done}</span>
        <span class="legend-item"><span class="legend-dot active"></span>${t("active")} ${active}</span>
        <span class="legend-item"><span class="legend-dot planned"></span>${t("planned")} ${planned}</span>
      </div>
    </div>
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
  const tasks = activeTasks();
  return `<section class="task-briefs">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("currentWork")}</p>
        <h2>${t("activeBriefs")}</h2>
      </div>
      <div class="section-actions">
        <span class="subtle">${t("activeBriefCount").replace("{count}", tasks.length).replace("{order}", taskSortLabel())}</span>
        <a href="#/tasks">${t("openTaskIndex")}</a>
      </div>
    </div>
    <div class="brief-scroll">
      <div class="brief-grid">${tasks.map((task) => taskBriefCard(task, { compact: false })).join("") || emptyState(t("noActiveTasks"))}</div>
    </div>
  </section>`;
}

function activeTasks() {
  const tasks = bundle.status?.tasks || [];
  const active = tasks.filter((task) => isActiveTaskState(task.state) || ["planned", "not_started"].includes(task.state));
  if (active.length > 0) return sortTasksByTime(active);
  return sortTasksByTime(tasks.filter((task) => task.briefSource === "standalone"));
}

function isActiveTaskState(state) {
  return ["active", "in_progress", "review", "blocked", "reopened", "current-evidence"].includes(state);
}

function taskBriefCard(task, { compact = true } = {}) {
  const doc = taskDocument(task, "brief.md");
  const summaryText = doc ? getBriefSummary(doc.content) : t("missingBriefExplain");
  return `<article class="brief-card ${compact ? "compact" : ""}">
    <div class="card-head">
      <div>
        <a href="#/tasks/${encodeURIComponent(task.id)}">${escapeHtml(task.title)}</a>
        <p>${escapeHtml(task.id)}</p>
      </div>
      ${tag(task.state)}
    </div>
    ${progressBar(task.completion)}
    <div class="brief-content">
      <p class="brief-teaser">${escapeHtml(summaryText)}</p>
    </div>
    <div class="card-actions">
      ${taskCopyButton(task)}
      <button class="btn-drawer-trigger" data-open-drawer="${escapeAttr(task.id)}">${t("viewDetails")}</button>
    </div>
  </article>`;
}

function getBriefSummary(content) {
  if (!content) return "";
  let text = content
    .replace(/#+\s+/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/-\s+/g, "")
    .replace(/>\s+/g, "")
    .replaceAll("\n", " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > 140) text = text.slice(0, 137) + "...";
  return text;
}

function generatedBrief(task) {
  const phaseText = (task.phases || []).slice(0, 6).map((phase) => `<li><strong>${escapeHtml(phase.id)}</strong> ${escapeHtml(phase.output || phase.state)} · ${phase.completion}%</li>`).join("");
  return `<div class="missing-brief">
    <strong>${t("visibilityBriefMissing")}</strong>
    <p>${t("missingBriefExplain")}</p>
    <ul>${phaseText || `<li>${t("noPhaseData")}</li>`}</ul>
  </div>`;
}

function clampCompletion(value) {
  const number = Number(value) || 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function stateToColorVar(state) {
  const map = { in_progress: "--accent", review: "--accent-2", blocked: "--danger", done: "--ok", planned: "--muted", not_started: "--muted" };
  return map[state] || "--muted";
}

function taskSortLabel() {
  return state.taskSortOrder === "asc" ? t("sortOldest") : t("sortNewest");
}

function taskDateKey(task) {
  const source = `${task.shortId || ""} ${task.id || ""}`.trim();
  const match = source.match(/(?:^|[^\d])(\d{4})-(\d{2})(?:-(\d{2}))?/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] || "1");
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

function stableTaskLabel(task) {
  return `${task.shortId || ""} ${task.id || ""} ${task.title || ""}`.trim();
}

function compareTasksByTime(left, right) {
  const leftDate = taskDateKey(left);
  const rightDate = taskDateKey(right);
  if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
    return state.taskSortOrder === "asc" ? leftDate - rightDate : rightDate - leftDate;
  }
  if (leftDate !== null && rightDate === null) return -1;
  if (leftDate === null && rightDate !== null) return 1;
  return stableTaskLabel(left).localeCompare(stableTaskLabel(right));
}

function sortTasksByTime(tasks) {
  return [...tasks].sort(compareTasksByTime);
}

function taskFolderName(task) {
  const fromPath = String(task?.path || "").split("/").filter(Boolean).pop();
  const fromId = String(task?.id || "").split("/").filter(Boolean).pop();
  return task?.shortId || fromPath || fromId || task?.title || "";
}

function taskCopyButton(task, extraClass = "") {
  const folderName = taskFolderName(task);
  return `<button type="button" class="copy-task-name ${extraClass}" data-copy-task-name="${escapeAttr(folderName)}" data-copy-task-folder="${escapeAttr(folderName)}" aria-label="${escapeAttr(t("copyTaskName"))}" title="${escapeAttr(t("copyTaskName"))}">
    ${t("copyTaskNameShort")}
  </button>`;
}

function taskGroupTimeKey(group) {
  const match = group.match(/^(?:month|legacy):(\d{4})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
}

function taskToolbarCard(filteredCount) {
  return `<section class="sidebar-card">
    <h3>${t("filterTitle")}</h3>
    <div class="input-group">
      <input data-search value="${escapeAttr(state.query)}" placeholder="${t("searchPlaceholder")}" aria-label="${t("searchTasks")}">
    </div>
    <div class="select-group">
      <label>${t("stateFilter")}</label>
      <select data-state-filter aria-label="${t("stateFilter")}">
        ${["all", "in_progress", "review", "blocked", "planned", "done", "unknown"].map((value) => `<option value="${value}" ${state.taskState === value ? "selected" : ""}>${label(value)}</option>`).join("")}
      </select>
    </div>
    <div class="select-group">
      <label>${t("groupBy")}</label>
      <select data-group-mode aria-label="${t("groupBy")}">
        ${["migration", "module", "month", "state"].map((value) => `<option value="${value}" ${state.taskGroupMode === value ? "selected" : ""}>${t(`group_${value}`)}</option>`).join("")}
      </select>
    </div>
    <div class="select-group">
      <label>${t("layout")}</label>
      <div class="layout-toggle-group">
        <button class="layout-btn ${state.taskLayout === "list" ? "active" : ""}" data-layout="list" aria-label="${t("layoutList")}">
          <svg style="width:12px;height:12px;vertical-align:middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          ${t("layoutList")}
        </button>
        <button class="layout-btn ${state.taskLayout === "grid" ? "active" : ""}" data-layout="grid" aria-label="${t("layoutGrid")}">
          <svg style="width:12px;height:12px;vertical-align:middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          ${t("layoutGrid")}
        </button>
      </div>
    </div>
    <div class="select-group">
      <label>${t("sortByTime")}</label>
      <div class="layout-toggle-group sort-toggle-group">
        <button class="layout-btn ${state.taskSortOrder === "desc" ? "active" : ""}" data-task-sort-order="desc" aria-label="${t("sortNewest")}">
          ${t("sortNewest")}
        </button>
        <button class="layout-btn ${state.taskSortOrder === "asc" ? "active" : ""}" data-task-sort-order="asc" aria-label="${t("sortOldest")}">
          ${t("sortOldest")}
        </button>
      </div>
    </div>
    <div class="search-stats">
      ${t("showing")} <strong>${filteredCount}</strong> / ${(bundle.status?.tasks || []).length} ${t("tasks")}
    </div>
  </section>`;
}

function taskStatsCard() {
  const allTasks = bundle.status?.tasks || [];
  const avgCompletion = allTasks.length ? clampCompletion(allTasks.reduce((sum, task) => sum + clampCompletion(task.completion), 0) / allTasks.length) : 0;
  return `<section class="sidebar-card">
    <h3>${t("releaseHealth")}</h3>
    <div class="stats-hero-gauge">
      <span class="gauge-percentage">${avgCompletion}%</span>
      <span class="gauge-label">${t("statOverall")}</span>
    </div>
    <div class="stats-breakdown">
      ${[
        { state: "in_progress", label: t("statInProgress"), colorVar: "--accent" },
        { state: "review", label: t("statReview"), colorVar: "--accent-2" },
        { state: "blocked", label: t("statBlocked"), colorVar: "--danger" },
        { state: "done", label: t("statDone"), colorVar: "--ok" }
      ].map(({ state, label, colorVar }) => {
        const count = allTasks.filter(t => t.state === state).length;
        return `<div class="stats-breakdown-row">
          <span class="stat-label">
            <span class="state-dot" style="background:var(${colorVar})"></span>
            ${label}
          </span>
          <span class="stat-value">${count}</span>
        </div>`;
      }).join("")}
    </div>
  </section>`;
}

function taskLegendCard() {
  return `<section class="sidebar-card">
    <h3>${t("legendTitle")}</h3>
    <div class="legend-list">
      <div class="legend-item">
        <span class="badge brief ready" style="margin-top:2px">
          <svg style="width:10px;height:10px;margin-right:2px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          ${t("badgeBrief")}
        </span>
        <span>${t("legendBriefDesc")}</span>
      </div>
      <div class="legend-item">
        <span class="badge map ready" style="margin-top:2px">
          <svg style="width:10px;height:10px;margin-right:2px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          ${t("badgeMap")}
        </span>
        <span>${t("legendMapDesc")}</span>
      </div>
    </div>
  </section>`;
}

function taskStatsBar() {
  const allTasks = bundle.status?.tasks || [];
  const inProgress = allTasks.filter(t => t.state === "in_progress").length;
  const blocked = allTasks.filter(t => t.state === "blocked").length;
  const done = allTasks.filter(t => t.state === "done").length;
  const review = allTasks.filter(t => t.state === "review").length;
  const avgCompletion = allTasks.length ? clampCompletion(allTasks.reduce((sum, task) => sum + clampCompletion(task.completion), 0) / allTasks.length) : 0;

  return `<section class="task-stats-bar">
    <div class="stat-chip">
      <span class="stat-value">${allTasks.length}</span>
      <span class="stat-label">${t("statTotal")}</span>
    </div>
    <div class="stat-chip in-progress">
      <span class="stat-value">${inProgress}</span>
      <span class="stat-label">${t("statInProgress")}</span>
    </div>
    <div class="stat-chip review">
      <span class="stat-value">${review}</span>
      <span class="stat-label">${t("statReview")}</span>
    </div>
    <div class="stat-chip blocked">
      <span class="stat-value">${blocked}</span>
      <span class="stat-label">${t("statBlocked")}</span>
    </div>
    <div class="stat-chip done">
      <span class="stat-value">${done}</span>
      <span class="stat-label">${t("statDone")}</span>
    </div>
    <div class="stat-chip completion">
      <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${avgCompletion}%"></div></div>
      <div style="text-align:right">
        <span class="stat-value">${avgCompletion}%</span>
        <span class="stat-label" style="display:block;margin-top:2px">${t("statOverall")}</span>
      </div>
    </div>
  </section>`;
}

function taskRow(task) {
  const completion = clampCompletion(task.completion);
  const briefReady = task.briefSource === "standalone" || !!taskDocument(task, "brief.md");
  const mapReady = !!taskDocument(task, "visual_map.md");
  const briefLabel = briefReady ? t("briefReady") : t("briefMissing");
  const mapLabel = mapReady ? t("mapReady") : t("mapMissing");

  return `<article class="task-row-card" data-open-drawer="${escapeAttr(task.id)}" style="--row-accent: var(${stateToColorVar(task.state)})">
    <div class="row-accent-bar"></div>
    <div class="row-main">
      <strong>${escapeHtml(task.title)}</strong>
      <span class="row-meta">${escapeHtml(task.id)} · ${escapeHtml(taskModuleKey(task))}</span>
      ${taskCopyButton(task, "row-copy")}
    </div>
    <div class="row-status">${tag(task.state)}</div>
    <div class="row-progress">
      <div class="mini-progress-track"><div class="mini-progress-fill" style="width:${completion}%"></div></div>
      <span class="row-pct">${completion}%</span>
    </div>
    <div class="row-brief ${briefReady ? "ready" : "missing"}" title="${escapeAttr(briefLabel)}" aria-label="${escapeAttr(briefLabel)}">
      <span class="badge brief ${briefReady ? "ready" : "missing"}">
        <svg style="width:10px;height:10px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        ${briefReady ? t("badgeBrief") : t("badgeBriefMissing")}
      </span>
    </div>
    <div class="row-map ${mapReady ? "ready" : "missing"}" title="${escapeAttr(mapLabel)}" aria-label="${escapeAttr(mapLabel)}">
      <span class="badge map ${mapReady ? "ready" : "missing"}">
        <svg style="width:10px;height:10px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        ${mapReady ? t("badgeMap") : t("badgeMapMissing")}
      </span>
    </div>
  </article>`;
}

function taskIndex() {
  const tasks = filteredTasks();
  const groups = taskGroups(tasks);
  const orderedGroups = orderedTaskGroups(groups);
  const groupPageCount = Math.max(1, Math.ceil(orderedGroups.length / taskGroupsPerPage));
  const groupPage = Math.min(Math.max(1, Number(state.taskGroupPage) || 1), groupPageCount);
  const visibleGroups = orderedGroups.slice((groupPage - 1) * taskGroupsPerPage, groupPage * taskGroupsPerPage);

  return `<div class="tasks-grid">
    <div class="tasks-main stack">
      ${taskStatsBar()}
      ${visibleGroups.map(([group, groupTasks]) => taskGroup(group, groupTasks)).join("")}
      <section class="group-pager">
        <span>${t("showingGroups")} ${visibleGroups.length ? (groupPage - 1) * taskGroupsPerPage + 1 : 0}-${Math.min(groupPage * taskGroupsPerPage, orderedGroups.length)} / ${orderedGroups.length}</span>
        ${pager("task-groups", groupPage, groupPageCount)}
      </section>
    </div>
    <aside class="tasks-sidebar stack">
      ${taskToolbarCard(tasks.length)}
      ${taskStatsCard()}
      ${taskLegendCard()}
    </aside>
  </div>`;
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
  return Object.entries(groups).sort(([left], [right]) => {
    const rankDiff = rank(left) - rank(right);
    if (rankDiff !== 0) return rankDiff;
    const leftTime = taskGroupTimeKey(left);
    const rightTime = taskGroupTimeKey(right);
    if (leftTime !== null && rightTime !== null && leftTime !== rightTime) {
      return state.taskSortOrder === "asc" ? leftTime - rightTime : rightTime - leftTime;
    }
    if (leftTime !== null && rightTime === null) return -1;
    if (leftTime === null && rightTime !== null) return 1;
    return left.localeCompare(right);
  });
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
  const orderedTasks = sortTasksByTime(tasks);
  const pageCount = Math.max(1, Math.ceil(orderedTasks.length / taskPageSize));
  const page = Math.min(Math.max(1, Number(state.taskPageByGroup[group]) || 1), pageCount);
  const start = (page - 1) * taskPageSize;
  const visibleTasks = orderedTasks.slice(start, start + taskPageSize);
  const avgCompletion = orderedTasks.length ? clampCompletion(orderedTasks.reduce((sum, task) => sum + clampCompletion(task.completion), 0) / orderedTasks.length) : 0;

  const isGrid = state.taskLayout === "grid";
  const layoutClass = isGrid ? "task-card-grid" : "task-list";
  const itemRenderer = isGrid ? taskCard : taskRow;
  const listHeader = isGrid ? "" : `<div class="task-list-header">
    <div class="col-main">${t("columnTask")}</div>
    <div class="col-status">${t("columnState")}</div>
    <div class="col-progress">${t("columnCompletion")}</div>
    <div class="col-brief">${t("columnBrief")}</div>
    <div class="col-map">${t("badgeMap")}</div>
  </div>`;

  return `<section class="task-group">
      <div class="section-head">
        <div>
          <h2>${taskGroupLabel(group)}</h2>
          <p class="subtle">${t("showing")} ${Math.min(start + 1, orderedTasks.length)}-${Math.min(start + visibleTasks.length, orderedTasks.length)} / ${orderedTasks.length}</p>
        </div>
        <div class="group-actions">
          <div class="group-progress" aria-label="${escapeAttr(t("groupCompletion"))}">
            <div class="group-progress-track"><div class="group-progress-fill" style="width:${avgCompletion}%"></div></div>
            <span>${avgCompletion}%</span>
          </div>
          ${pager("task", page, pageCount, group)}
        </div>
      </div>
      <div class="${layoutClass}">
        ${listHeader}
        ${visibleTasks.map(itemRenderer).join("")}
      </div>
    </section>`;
}

function taskCard(task) {
  const completion = clampCompletion(task.completion);
  const stateColor = stateToColorVar(task.state);
  const briefReady = task.briefSource === "standalone" || !!taskDocument(task, "brief.md");
  const mapReady = !!taskDocument(task, "visual_map.md");
  const briefLabel = briefReady ? t("briefReady") : t("briefMissing");
  const mapLabel = mapReady ? t("mapReady") : t("mapMissing");

  return `<article class="task-card" data-open-drawer="${escapeAttr(task.id)}" style="--row-accent: var(${stateColor})">
    <div class="card-header">
      <span class="card-id">${escapeHtml(task.id)}</span>
      <div class="card-header-actions">
        ${taskCopyButton(task, "compact")}
        ${tag(task.state)}
      </div>
    </div>
    <h4 class="card-title" title="${escapeAttr(task.title)}">${escapeHtml(task.title)}</h4>
    <div class="card-meta">
      <span class="meta-module" title="${escapeAttr(taskModuleKey(task))}">
        <svg style="width:12px;height:12px;vertical-align:middle;margin-right:2px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        ${escapeHtml(taskModuleKey(task))}
      </span>
    </div>
    <div class="card-progress">
      <div class="card-progress-track"><div class="card-progress-fill" style="width:${completion}%"></div></div>
      <span class="progress-pct">${completion}%</span>
    </div>
    <div class="card-badges">
      <span class="badge brief ${briefReady ? "ready" : "missing"}" title="${escapeAttr(briefLabel)}">
        <svg style="width:10px;height:10px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        ${briefReady ? t("badgeBrief") : t("badgeBriefMissing")}
      </span>
      <span class="badge map ${mapReady ? "ready" : "missing"}" title="${escapeAttr(mapLabel)}">
        <svg style="width:10px;height:10px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        ${mapReady ? t("badgeMap") : t("badgeMapMissing")}
      </span>
    </div>
  </article>`;
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
  return sortTasksByTime((bundle.status?.tasks || []).filter((task) => {
    const stateMatch = state.taskState === "all" || task.state === state.taskState;
    if (!stateMatch) return false;
    if (!query) return true;
    return [task.id, task.shortId, task.title, task.module, task.inferredModule, task.classificationSource, task.classificationBucket, task.state].some((value) => String(value || "").toLowerCase().includes(query));
  }));
}

function taskModuleKey(task) {
  return task.module || task.inferredModule || "legacy-unclassified";
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
        ${taskCopyButton(task, "detail-copy")}
      </div>
      <div class="detail-score">${task.completion}%</div>
    </section>
    ${taskStateSummary(task)}
    ${phaseTimeline(task)}
    <section class="detail-grid">
      <article class="detail-main">
        ${taskDocumentLibrary(task, route.doc)}
      </article>
      <aside class="detail-side">
        ${reviewActionPanel(task, { mode: "summary" })}
        ${openFindings(task)}
        ${evidenceList(task)}
        ${documentTabs(task)}
      </aside>
    </section>
  </main>`;
}

function taskStateSummary(task) {
  return `<section class="task-state-summary">
    <div>
      <span>${t("legacyState")}</span>
      ${tag(task.state)}
    </div>
    <div>
      <span>${t("lifecycleState")}</span>
      ${tag(task.lifecycleState || "unknown")}
    </div>
    <div>
      <span>${t("reviewStatus")}</span>
      ${tag(task.reviewStatus || "missing")}
    </div>
    <div>
      <span>${t("sedimentationStatus")}</span>
      ${tag(task.lessonCandidateStatus || "missing")}
    </div>
    <div>
      <span>${t("closeoutStatus")}</span>
      ${tag(task.closeoutStatus || "missing")}
    </div>
    <div>
      <span>${t("lifecycleQueues")}</span>
      ${(task.taskQueues || []).map(tag).join("") || tag("active")}
    </div>
    ${taskQueueReasonSummary(task)}
  </section>`;
}

function taskQueueReasonSummary(task) {
  const reasons = task.queueReasons || [];
  if (!reasons.length) return "";
  return `<div class="task-queue-reasons">
    <span>${t("queueReasons")}</span>
    <ul>
      ${reasons.slice(0, 5).map((reason) => `<li><strong>${escapeHtml(reason.code || reason.queue || "")}</strong> ${escapeHtml(reason.message || "")}</li>`).join("")}
    </ul>
  </div>`;
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

function taskDocumentLibrary(task, selectedTab) {
  const docs = orderedTaskDocuments(task);
  if (!docs.length) return taskDocSection(task, "brief.md", t("brief"), true);
  const selectedKey = docs.some((doc) => doc.key === selectedTab) ? selectedTab : defaultTaskDocumentKey(task, docs);
  return `<section class="doc-library">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("taskDocuments")}</p>
        <h2>${escapeHtml(t("sourceDocuments"))}</h2>
      </div>
      <button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button>
    </div>
    <div class="doc-accordion-list">
      ${docs.map((item) => documentAccordion(item, item.key === selectedKey)).join("")}
    </div>
  </section>`;
}

function orderedTaskDocuments(task) {
  const docs = taskDocTabs
    .map(([key, file]) => {
      const doc = taskDocument(task, file);
      if (doc) return { key, file, title: t(key), path: doc.path, content: doc.content };
      if (key === "brief") return { key, file, title: t(key), path: `${task.path}/brief.md`, content: generatedBrief(task), generated: true };
      return null;
    })
    .filter(Boolean);
  const priority = taskDocumentPriority(task);
  const rank = new Map(priority.map((key, index) => [key, index]));
  return docs.sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
}

function taskDocumentPriority(task) {
  const stateName = task?.state || "";
  const lifecycle = task?.lifecycleState || "";
  if (stateName === "review" || ["in_review", "review-blocked"].includes(lifecycle)) {
    return ["walkthrough", "lessonCandidates", "review", "findings", "visualMap", "progress", "brief", "taskPlan", "strategy", "longRunningContract", "legacyRoadmap", "references", "artifacts"];
  }
  if (stateName === "in_progress" || lifecycle === "active" || stateName === "blocked") {
    return ["progress", "visualMap", "brief", "taskPlan", "strategy", "findings", "review", "walkthrough", "references", "artifacts", "legacyRoadmap"];
  }
  if (stateName === "done" || ["closing", "closed"].includes(lifecycle)) {
    return ["walkthrough", "progress", "review", "findings", "visualMap", "brief", "taskPlan", "strategy", "references", "artifacts", "legacyRoadmap"];
  }
  return ["brief", "taskPlan", "visualMap", "strategy", "progress", "findings", "review", "walkthrough", "references", "artifacts", "legacyRoadmap"];
}

function defaultTaskDocumentKey(task, docs) {
  const priority = taskDocumentPriority(task);
  return priority.find((key) => docs.some((doc) => doc.key === key)) || docs[0]?.key || "brief";
}

function documentAccordion(item, open) {
  return `<details class="doc-accordion" ${open ? "open" : ""}>
    <summary>
      <span>${escapeHtml(item.title)}</span>
      <small>${escapeHtml(item.generated ? t("generatedFallback") : item.path)}</small>
    </summary>
    <div class="markdown">${window.HarnessMarkdown.render(item.content, state.renderMode)}</div>
  </details>`;
}

function documentTabs(task) {
  const docs = orderedTaskDocuments(task);
  return `<section class="side-panel">
    <h3>${t("sourceDocuments")}</h3>
    ${docs.map((doc) => `<a href="#/tasks/${encodeURIComponent(task.id)}/docs/${encodeURIComponent(doc.key)}" title="${escapeAttr(doc.path)}">${escapeHtml(doc.title)}</a>`).join("") || `<p>${t("noDocuments")}</p>`}
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

function reviewActionPanel(task, { mode = "summary" } = {}) {
  if (!isTaskInReviewQueue(task)) return "";
  const blocking = task.reviewStatus === "blocked-open-findings" || (task.risks || []).some((risk) => /^P[0-2]$/i.test(risk.severity || "") && (risk.open || risk.blocksRelease));
  const confirmed = task.reviewStatus === "confirmed";
  const candidateBlocked = task.budget !== "simple" && !task.lessonCandidateDecisionComplete;
  const candidateStatus = task.lessonCandidateStatus || "missing";
  if (mode !== "workspace") {
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(confirmed ? t("reviewAlreadyConfirmed") : t("reviewOpenInWorkspace"))}</p>
      <p>${escapeHtml(t("lessonCandidateStatus"))}: ${tag(candidateStatus)}</p>
      <a href="#/review/${encodeURIComponent(task.id)}">${t("openReviewWorkspace")}</a>
    </section>`;
  }
  if (!canUseWorkbenchAction("review-complete")) {
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(t("staticReadOnlyDetail"))}</p>
    </section>`;
  }
  if (confirmed) {
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(t("reviewAlreadyConfirmed"))}</p>
    </section>`;
  }
  const missingWalkthrough = task.budget !== "simple" && !task.walkthroughPath;
  const queueBlocked = !taskCanBeHumanConfirmed(task);
  const disabled = blocking || missingWalkthrough || candidateBlocked || queueBlocked;
  const message = missingWalkthrough ? t("reviewWalkthroughRequired") : blocking ? t("reviewBlocked") : candidateBlocked ? t("reviewCandidateDecisionRequired") : queueBlocked ? t("reviewQueueRequired") : t("reviewWorkbenchReady");
  return `<section class="side-panel review-actions">
    <h3>${t("reviewActions")}</h3>
    <p>${escapeHtml(message)}</p>
    <p>${escapeHtml(t("lessonCandidateStatus"))}: ${tag(candidateStatus)}</p>
    <label class="review-check">
      <input type="checkbox" data-review-confirm-check="${escapeAttr(task.id)}" ${disabled ? "disabled" : ""}>
      <span>${t("reviewConfirmChecklist")}</span>
    </label>
    <div class="review-confirm-copy">
      ${taskCopyButton(task, "review-copy-task-name")}
    </div>
    <input data-review-confirm-text="${escapeAttr(task.id)}" value="" placeholder="${escapeAttr(task.shortId || task.id)}" ${disabled ? "disabled" : ""}>
    <button data-review-complete="${escapeAttr(task.id)}" ${disabled ? "disabled" : ""}>${t("confirmReviewComplete")}</button>
    <div class="review-result" data-review-result="${escapeAttr(task.id)}"></div>
  </section>`;
}

function isTaskInReviewQueue(task) {
  return (task?.reviewQueueState || "not-in-queue") !== "not-in-queue";
}

function taskCanBeHumanConfirmed(task) {
  return task?.reviewQueueState === "ready-to-confirm" && Array.isArray(task?.taskQueues) && task.taskQueues.includes("review");
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
  const tasks = (bundle.status?.tasks || []).filter((task) => taskModuleKey(task) === moduleKey);

  // Inline Pagination
  state.modulePages = state.modulePages || {};
  const currentPage = state.modulePages[moduleKey] || 1;
  const pageCount = Math.ceil(tasks.length / 8) || 1;
  const visibleTasks = tasks.slice((currentPage - 1) * 8, currentPage * 8);

  const brief = findDocument(`TARGET:docs/09-PLANNING/MODULES/${moduleKey}/brief.md`);

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

function reviewQueue() {
  ensureReviewQueueState();
  const tabs = reviewQueueTabs();
  const activeTab = tabs.find((tab) => tab.id === state.reviewQueueTab) || tabs[0];
  const baseTasks = reviewQueueBaseTasks(activeTab);
  const reasonOptions = reviewReasonOptions(baseTasks);
  normalizeReviewReasonFilter(reasonOptions);
  const tasks = reviewFilteredTasks(baseTasks);
  const pageCount = Math.max(1, Math.ceil(tasks.length / taskPageSize));
  const page = Math.min(Math.max(1, Number(state.reviewQueuePage) || 1), pageCount);
  const visibleTasks = tasks.slice((page - 1) * taskPageSize, page * taskPageSize);
  return `<div class="dashboard-grid review-queue-page">
    <main class="dashboard-main stack">
      <section class="flow-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t("review")}</p>
            <h2>${t("reviewQueue")}</h2>
            <p class="subtle">${t("reviewQueueSubtitle")}</p>
          </div>
          <span class="subtle">${t("showing")} ${visibleTasks.length ? (page - 1) * taskPageSize + 1 : 0}-${Math.min(page * taskPageSize, tasks.length)} / ${tasks.length}</span>
        </div>
        <div class="review-queue-tabs" role="tablist" aria-label="${escapeAttr(t("reviewQueueTabs"))}">
          ${tabs.map((tab) => reviewQueueTab(tab)).join("")}
        </div>
        <div class="review-queue-toolbar">
          <div class="input-group">
            <input data-search value="${escapeAttr(state.query)}" placeholder="${t("searchPlaceholder")}" aria-label="${t("searchTasks")}">
          </div>
          <div class="select-group">
            <label>${t("reasonFilter")}</label>
            <select data-review-reason-filter aria-label="${t("reasonFilter")}">
              <option value="all" ${state.reviewReasonFilter === "all" ? "selected" : ""}>${t("allReasons")}</option>
              ${reasonOptions.map((code) => `<option value="${escapeAttr(code)}" ${state.reviewReasonFilter === code ? "selected" : ""}>${escapeHtml(code)}</option>`).join("")}
            </select>
          </div>
          <div class="select-group">
            <label>${t("sortBy")}</label>
            <select data-review-sort aria-label="${t("sortBy")}">
              ${reviewSortOptions().map((option) => `<option value="${option.id}" ${state.reviewSort === option.id ? "selected" : ""}>${option.label}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="review-queue-list-shell" tabindex="0" aria-label="${escapeAttr(activeTab.label)} ${escapeAttr(t("reviewQueue"))}">
          <div class="review-queue-list">
            ${visibleTasks.map((task) => reviewQueueCard(task, activeTab)).join("") || emptyState(t("noQueueTasks"))}
          </div>
        </div>
        <div class="review-queue-pager">
          ${pager("review", page, pageCount)}
        </div>
      </section>
    </main>
    <aside class="dashboard-sidebar stack">
      <section class="side-panel review-queue-summary">
        <h3>${t("reviewQueue")}</h3>
        <div class="review-queue-stats">
          ${tabs.map((tab) => metric(tab.label, reviewQueueBaseTasks(tab).length)).join("")}
        </div>
      </section>
      <section class="side-panel">
        <h3>${escapeHtml(activeTab.label)}</h3>
        <p>${escapeHtml(activeTab.description)}</p>
        <dl class="review-queue-contract">
          <div><dt>${t("reviewSubmitted")}</dt><dd>${reviewTruthyCount(baseTasks, "reviewSubmitted")}/${baseTasks.length}</dd></div>
          <div><dt>${t("materialsReady")}</dt><dd>${reviewTruthyCount(baseTasks, "materialsReady")}/${baseTasks.length}</dd></div>
        </dl>
      </section>
    </aside>
  </div>`;
}

function ensureReviewQueueState() {
  if (!state.reviewQueueTab) state.reviewQueueTab = "review";
  if (!state.reviewReasonFilter) state.reviewReasonFilter = "all";
  if (!state.reviewSort) state.reviewSort = "queue";
  if (!state.reviewQueuePage) state.reviewQueuePage = 1;
}

function reviewQueueTabs() {
  return [
    { id: "review", queues: ["review"], label: t("queueReview"), description: t("queueReviewDesc") },
    { id: "missing-materials", queues: ["missing-materials"], label: t("queueMissingMaterials"), description: t("queueMissingMaterialsDesc"), repair: true },
    { id: "blocked", queues: ["blocked"], label: t("queueBlocked"), description: t("queueBlockedDesc"), repair: true },
    { id: "lessons", queues: ["lessons"], label: t("queueLessons"), description: t("queueLessonsDesc") },
    { id: "confirmed-finalized", queues: ["confirmed", "finalized", "confirmed-finalized", "confirmed-finalization-pending"], label: t("queueConfirmedFinalized"), description: t("queueConfirmedFinalizedDesc") },
    { id: "soft-deleted-superseded", queues: ["soft-deleted-superseded"], label: t("queueSoftDeletedSuperseded"), description: t("queueSoftDeletedSupersededDesc") },
  ];
}

function reviewQueueTab(tab) {
  const active = tab.id === state.reviewQueueTab;
  const count = reviewQueueBaseTasks(tab).length;
  return `<button type="button" class="review-queue-tab ${active ? "active" : ""}" data-review-queue-tab="${escapeAttr(tab.id)}" role="tab" aria-selected="${active ? "true" : "false"}">
    <span>${escapeHtml(tab.label)}</span>
    <strong>${count}</strong>
  </button>`;
}

function reviewSortOptions() {
  return [
    { id: "queue", label: t("sortQueuePriority") },
    { id: "newest", label: t("sortNewest") },
    { id: "oldest", label: t("sortOldest") },
    { id: "id", label: t("sortTaskId") },
  ];
}

function reviewQueueBaseTasks(tab) {
  return (bundle.status?.tasks || []).filter((task) => taskMatchesReviewTab(task, tab));
}

function taskMatchesReviewTab(task, tab) {
  const queues = reviewTaskQueues(task);
  return (tab.queues || []).some((queue) => queues.includes(queue));
}

function reviewTaskQueues(task) {
  return Array.isArray(task?.taskQueues) ? task.taskQueues : Array.isArray(task?.queues) ? task.queues : [];
}

function reviewReasonOptions(tasks) {
  return [...new Set(tasks.flatMap((task) => (task.queueReasons || []).map((reason) => reason.code || reason.queue || "").filter(Boolean)))].sort();
}

function normalizeReviewReasonFilter(reasonOptions) {
  const current = state.reviewReasonFilter || "all";
  if (current === "all") return;
  if (!reasonOptions.includes(current)) state.reviewReasonFilter = "all";
}

function reviewFilteredTasks(tasks) {
  const query = state.query.trim().toLowerCase();
  const reasonFilter = state.reviewReasonFilter || "all";
  return [...tasks]
    .filter((task) => {
      if (reasonFilter !== "all" && !(task.queueReasons || []).some((reason) => (reason.code || reason.queue) === reasonFilter)) return false;
      if (!query) return true;
      return [
        task.id,
        task.shortId,
        task.title,
        task.module,
        task.inferredModule,
        task.state,
        task.lifecycleState,
        task.reviewStatus,
        task.closeoutStatus,
        ...(task.taskQueues || []),
        ...(task.queueReasons || []).flatMap((reason) => [reason.code, reason.message, reason.sourcePath]),
      ].some((value) => String(value || "").toLowerCase().includes(query));
    })
    .sort(reviewTaskSort);
}

function reviewTaskSort(left, right) {
  if (state.reviewSort === "newest") return compareTasksByTimeForOrder(left, right, "desc");
  if (state.reviewSort === "oldest") return compareTasksByTimeForOrder(left, right, "asc");
  if (state.reviewSort === "id") return stableTaskLabel(left).localeCompare(stableTaskLabel(right));
  return reviewPriorityRank(left) - reviewPriorityRank(right)
    || compareTasksByTimeForOrder(left, right, "desc")
    || stableTaskLabel(left).localeCompare(stableTaskLabel(right));
}

function compareTasksByTimeForOrder(left, right, order) {
  const previous = state.taskSortOrder;
  state.taskSortOrder = order;
  const result = compareTasksByTime(left, right);
  state.taskSortOrder = previous;
  return result;
}

function reviewPriorityRank(task) {
  const severityRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
  const reasonRank = Math.min(...(task.queueReasons || []).map((reason) => severityRank[String(reason.severity || "").toUpperCase()] ?? 8), 8);
  const queueRank = { blocked: 0, "missing-materials": 1, review: 2, lessons: 3, confirmed: 4, finalized: 5, "soft-deleted-superseded": 6 };
  const queues = reviewTaskQueues(task);
  const taskQueueRank = Math.min(...queues.map((queue) => queueRank[queue] ?? 7), 7);
  return Math.min(reasonRank, taskQueueRank);
}

function reviewTruthyCount(tasks, key) {
  return tasks.filter((task) => task[key] === true).length;
}

function reviewQueueCard(task, tab) {
  const openMaterial = (task.risks || []).filter((risk) => /^P[0-2]$/i.test(risk.severity || "") && (risk.open || risk.blocksRelease)).length;
  const reasons = task.queueReasons || [];
  const canCopyRepairPrompt = tab?.repair && String(task.repairPrompt || "").trim();
  const lessonActions = tab?.id === "lessons" ? lessonCandidateActions(task) : "";
  return `<article class="task-card review-queue-card" style="--row-accent: var(${stateToColorVar(task.state)})">
    <div class="card-header">
      <span class="card-id">${escapeHtml(task.id)}</span>
      ${tag(task.reviewStatus || "missing")}
      ${reviewTaskQueues(task).map(tag).join("")}
    </div>
    <h4 class="card-title" title="${escapeAttr(task.title)}">${escapeHtml(task.title)}</h4>
    <div class="card-meta">
      <span>${tag(task.lifecycleState || "unknown")}</span>
      <span>${tag(task.closeoutStatus || "missing")}</span>
      <span>${openMaterial} ${t("openFindings")}</span>
      <span>${t("reviewSubmitted")}: ${task.reviewSubmitted === true ? t("yes") : t("no")}</span>
      <span>${t("materialsReady")}: ${task.materialsReady === true ? t("yes") : t("no")}</span>
    </div>
    <p class="subtle">${escapeHtml(firstUsefulLine(task.summary || task.briefText || ""))}</p>
    ${reasons.length ? `<div class="review-reasons">${reasons.slice(0, 4).map(reviewReason).join("")}</div>` : ""}
    ${lessonActions}
    <div class="review-queue-actions">
      <a href="#/review/${encodeURIComponent(task.id)}">${t("openReviewWorkspace")}</a>
      <a href="#/tasks/${encodeURIComponent(task.id)}">${t("fullView")}</a>
      <button data-open-drawer="${escapeAttr(task.id)}">${t("viewDetails")}</button>
      ${tab?.repair ? `<button data-copy-repair-prompt="${escapeAttr(task.id)}" data-repair-prompt="${escapeAttr(task.repairPrompt || "")}" ${canCopyRepairPrompt ? "" : "disabled"}>${t("copyRepairPrompt")}</button>` : ""}
    </div>
  </article>`;
}

function lessonCandidateActions(task) {
  const candidates = (task.lessonCandidateRows || []).filter((candidate) => ["ready-for-review", "needs-promotion"].includes(candidate.status));
  if (!candidates.length) return "";
  const hiddenCount = Math.max(0, candidates.length - 2);
  return `<div class="lesson-candidate-actions">
    ${candidates.slice(0, 2).map((candidate) => lessonCandidateAction(task, candidate)).join("")}
    ${hiddenCount ? `<div class="lesson-candidate-more">${escapeHtml(t("moreLessonCandidates")).replace("{count}", String(hiddenCount))}</div>` : ""}
  </div>`;
}

function lessonCandidateAction(task, candidate) {
  const followUp = String(candidate.followUpTask || "").trim();
  const hasFollowUp = followUp && !/^pending$/i.test(followUp);
  const prompt = lessonSedimentationPrompt(task, candidate);
  return `<div class="lesson-candidate-action">
    <strong>${escapeHtml(candidate.id)}</strong>
    <span>${escapeHtml(candidate.title || candidate.promotionTarget || t("lessonCandidates"))}</span>
    <small>${escapeHtml(candidate.scope || t("none"))} · ${escapeHtml(candidate.promotionTarget || t("none"))}</small>
    ${hasFollowUp ? `<a href="#/tasks/${encodeURIComponent(followUp)}">${t("openFollowUpTask")}</a>` : ""}
    <button data-copy-lesson-prompt="${escapeAttr(task.id)}:${escapeAttr(candidate.id)}" data-lesson-prompt="${escapeAttr(prompt)}">${t("copyLessonPrompt")}</button>
    <button data-create-lesson-sedimentation="${escapeAttr(task.id)}" data-candidate-id="${escapeAttr(candidate.id)}" ${canUseWorkbenchAction("lesson-sedimentation-task") && !hasFollowUp ? "" : "disabled"}>${t("createLessonTask")}</button>
    <span class="review-result" data-lesson-result="${escapeAttr(task.id)}:${escapeAttr(candidate.id)}"></span>
  </div>`;
}

function lessonSedimentationPrompt(task, candidate) {
  return [
    "You are executing a lesson sedimentation follow-up task.",
    "",
    `Source task: ${task.id}`,
    `Source candidate: ${candidate.id} - ${candidate.title || ""}`,
    `Candidate scope: ${candidate.scope || "unspecified"}`,
    `Boundary reason: ${candidate.boundaryReason || "unspecified"}`,
    `Why it might matter: ${candidate.whyItMightMatter || "unspecified"}`,
    `Promotion target: ${candidate.promotionTarget || "unspecified"}`,
    `Conflict check: ${candidate.conflictCheck || "pending"}`,
    `Required standard update: ${candidate.requiredStandardUpdate || "pending"}`,
    "",
    "Instructions:",
    "1. Read the source task, review, findings, progress, and lesson_candidates.md.",
    "2. Classify whether the lesson is task-local, module-local, or global.",
    "3. Check conflicts against existing lessons and standards.",
    "4. Propose the smallest diff first.",
    "5. Do not write Lessons SSoT directly unless the human explicitly approves the target diff.",
  ].join("\n");
}

function reviewReason(reason) {
  return `<div class="review-reason">
    <strong>${escapeHtml(reason.code || reason.queue || t("reason"))}</strong>
    <span>${escapeHtml(reason.message || reason.sourcePath || "")}</span>
  </div>`;
}

function firstUsefulLine(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)[0] || "";
}

function reviewWorkspace(route) {
  const task = (bundle.status?.tasks || []).find((item) => item.id === route.id);
  if (!task) return `<main>${emptyState(t("taskNotFound"))}</main>`;
  const walkthroughDoc = taskDocument(task, "__walkthrough__");
  const candidateDoc = taskDocument(task, "lesson_candidates.md");
  const reviewDoc = taskDocument(task, "review.md");
  const findingsDoc = taskDocument(task, "findings.md");
  return `<main class="review-workspace">
    <nav class="crumbs"><a href="#/review">${t("reviewQueue")}</a><span>/</span><span>${escapeHtml(task.id)}</span></nav>
    <section class="detail-hero review-hero">
      <div>
        <p class="eyebrow">${t("reviewWorkspace")}</p>
        <h2>${escapeHtml(task.title)}</h2>
        <p>${escapeHtml(task.path)}</p>
      </div>
      <div class="review-hero-tags">
        ${tag(task.lifecycleState || "unknown")}
        ${tag(task.reviewStatus || "missing")}
        ${tag(task.lessonCandidateStatus || "missing")}
      </div>
    </section>
    <section class="review-workspace-grid">
      <article class="review-workspace-main stack">
        ${reviewDocPanel("walkthrough", walkthroughDoc, task.walkthroughPath)}
        ${reviewDocPanel("lessonCandidates", candidateDoc, task.lessonCandidatePath)}
        ${reviewDocPanel("review", reviewDoc, task.reviewPath)}
        ${reviewDocPanel("findings", findingsDoc, task.findingsPath)}
      </article>
      <aside class="review-workspace-side stack">
        ${reviewActionPanel(task, { mode: "workspace" })}
        ${taskStateSummary(task)}
        ${openFindings(task)}
        ${evidenceList(task)}
      </aside>
    </section>
  </main>`;
}

function reviewDocPanel(key, doc, fallbackPath = "") {
  return `<section class="doc-section review-doc-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">${escapeHtml(fallbackPath || "")}</p>
        <h2>${t(key)}</h2>
      </div>
      ${doc ? `<button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button>` : ""}
    </div>
    <div class="review-doc-scroll"><div class="markdown">${doc ? window.HarnessMarkdown.render(doc.content, state.renderMode) : emptyState(t("documentMissing"))}</div></div>
  </section>`;
}

function migrationPanel() {
  const advice = warningQueue();
  const missingBriefs = advice.filter((warning) => warning.type === "missing-brief").length;
  if (advice.length === 0 && missingBriefs === 0) return "";
  const groups = groupBy(advice, (item) => item.category || "Advice");
  const categories = Object.entries(groups).slice(0, 6);
  return `<section class="migration-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("migration")}</p>
        <h2>${t("migrationWorkbench")}</h2>
      </div>
      <span>${advice.length} ${t("advice")} · ${missingBriefs} ${t("briefMissing")}</span>
    </div>
    <div class="migration-grid">
      ${categories.map(([category, items]) => `<button data-warning-filter="${escapeAttr(category)}" class="${state.warningFilter === category ? "active" : ""}"><strong>${escapeHtml(category)}</strong><p>${items.length} ${t("items")}</p></button>`).join("")}
      ${missingBriefs > 0 ? `<div><strong>${t("visibilityLayer")}</strong><p>${missingBriefs} ${t("missingBriefs")}</p></div>` : ""}
    </div>
    ${migrationWarningWorkbench(advice)}
  </section>`;
}

function migrationWarningWorkbench(advice) {
  const groups = groupBy(advice, (item) => item.category || "Advice");
  const filters = ["all", ...Object.keys(groups).sort(), ...new Set(advice.map((item) => item.type).filter(Boolean)), "active-task-contracts", "strict-cutover"];
  const filtered = state.warningFilter === "all" ? advice : advice.filter((item) => (item.category || "Advice") === state.warningFilter || item.phase === state.warningFilter || item.type === state.warningFilter);
  const pageCount = Math.max(1, Math.ceil(filtered.length / warningPageSize));
  const page = Math.min(Math.max(1, Number(state.warningPage) || 1), pageCount);
  const visible = filtered.slice((page - 1) * warningPageSize, page * warningPageSize);
  return `<div class="warning-workbench">
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
    </div>`;
}

function migrationSummaryPanel() {
  const advice = warningQueue();
  const summary = bundle.status?.summary || {};
  if (advice.length === 0 && summary.fullCutoverEligible) {
    return `<section class="migration-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t("migration")}</p>
          <h2>${t("fullCutover")}</h2>
        </div>
        <span>${t("ready")}</span>
      </div>
      ${emptyState(t("noWarnings"))}
    </section>`;
  }
  const cards = [
    [t("advice"), advice.length],
    [t("legacyVisualOnly"), summary.legacyVisualOnlyCount || 0],
    [t("weakBrief"), summary.weakBriefCount || 0],
    [t("blockers"), bundle.status?.checkState?.failures || 0],
  ];
  return `<section class="migration-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("migration")}</p>
        <h2>${t("migrationSummary")}</h2>
      </div>
      <a href="#/tasks">${t("openTaskIndex")}</a>
    </div>
    <div class="migration-grid">
      ${cards.map(([title, count]) => `<a href="#/tasks"><strong>${escapeHtml(title)}</strong><p>${count} ${t("items")}</p></a>`).join("")}
    </div>
    ${migrationWarningWorkbench(advice)}
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
      priority: (typeof isActiveTaskState === "function" && isActiveTaskState(task.state)) || ["planned", "not_started"].includes(task.state) ? "P2" : "P3",
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
    .flatMap((table) => table.rows);
  return `<section class="lesson-panel">
    <div class="section-head"><h2>${t("lessons")}</h2><span>${lessons.length}</span></div>
    <div class="lesson-list" style="padding-top: 10px;">
      ${lessons.map((row) => {
        const cells = row.cells || {};
        const lessonId = cells.ID || cells.Lesson || cells["Lesson ID"] || cells["ID"] || "";
        const summary = cells.Summary || cells["\u6458\u8981"] || cells.Pattern || cells.Status || "";
        return `<div class="lesson" data-open-lesson-drawer="${escapeAttr(lessonId)}">
          <strong>${escapeHtml(lessonId)}</strong>
          <p>${escapeHtml(summary)}</p>
        </div>`;
      }).join("") || emptyState(t("noLessons"))}
    </div>
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
  if (fileName === "__walkthrough__" && task.walkthroughPath) return findDocument(task.walkthroughPath);
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

function canUseWorkbenchAction(action) {
  return state.runtime?.mode === "workbench" && (state.runtime?.writableActions || []).includes(action);
}

window.setModulePage = function(moduleKey, page) {
  state.modulePages = state.modulePages || {};
  state.modulePages[moduleKey] = page;
  app();
};

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
  document.querySelectorAll("[data-layout]").forEach((btn) => btn.addEventListener("click", () => {
    state.taskLayout = btn.dataset.layout;
    localStorage.setItem("harness.taskLayout", state.taskLayout);
    app();
  }));
  document.querySelectorAll("[data-task-sort-order]").forEach((btn) => btn.addEventListener("click", () => {
    state.taskSortOrder = btn.dataset.taskSortOrder === "asc" ? "asc" : "desc";
    localStorage.setItem("harness.taskSortOrder", state.taskSortOrder);
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
  document.querySelectorAll("[data-review-queue-tab]").forEach((button) => button.addEventListener("click", () => {
    state.reviewQueueTab = button.dataset.reviewQueueTab || "review";
    state.reviewQueuePage = 1;
    app();
  }));
  document.querySelectorAll("[data-review-reason-filter]").forEach((select) => select.addEventListener("change", () => {
    state.reviewReasonFilter = select.value || "all";
    state.reviewQueuePage = 1;
    app();
  }));
  document.querySelectorAll("[data-review-sort]").forEach((select) => select.addEventListener("change", () => {
    state.reviewSort = select.value || "queue";
    state.reviewQueuePage = 1;
    app();
  }));
  document.querySelectorAll("[data-page-kind]").forEach((button) => button.addEventListener("click", () => {
    const page = Math.max(1, Number(button.dataset.page) || 1);
    if (button.dataset.pageKind === "warning") state.warningPage = page;
    if (button.dataset.pageKind === "task-groups") state.taskGroupPage = page;
    if (button.dataset.pageKind === "task") state.taskPageByGroup[button.dataset.pageGroup || ""] = page;
    if (button.dataset.pageKind === "review") state.reviewQueuePage = page;
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
  document.querySelectorAll("[data-language-toggle]").forEach((button) => button.addEventListener("click", () => {
    setLocale(locale === "zh" ? "en" : "zh");
    app();
  }));
  document.querySelectorAll("[data-open-drawer]").forEach((el) => el.addEventListener("click", (e) => {
    e.preventDefault();
    const taskId = el.dataset.openDrawer;
    openDrawer(taskId);
  }));
  bindCopyTaskNameButtons(document);
  bindRepairPromptButtons(document);
  bindLessonSedimentationButtons(document);
  document.querySelectorAll("[data-open-lesson-drawer]").forEach((el) => el.addEventListener("click", (e) => {
    e.preventDefault();
    const lessonId = el.dataset.openLessonDrawer;
    openLessonDrawer(lessonId);
  }));
  document.querySelectorAll("[data-review-complete]").forEach((button) => button.addEventListener("click", () => completeReviewFromDashboard(button.dataset.reviewComplete)));
  const overlay = document.getElementById("drawer-overlay");
  if (overlay) overlay.addEventListener("click", closeDrawer);
}

async function loadRuntime() {
  if (state.runtimeLoaded || window.__HARNESS_WORKBENCH__ !== true || !/^https?:$/.test(window.location.protocol)) return;
  state.runtimeLoaded = true;
  try {
    const response = await fetch("/api/runtime", { cache: "no-store" });
    if (!response.ok) return;
    state.runtime = await response.json();
    startRuntimePolling();
    app();
  } catch {
    state.runtime = { mode: "static", csrfToken: "", writableActions: [] };
  }
}

function startRuntimePolling() {
  if (!state.runtime?.autoRefresh || state.runtimePoller) return;
  state.runtimePoller = setInterval(async () => {
    try {
      const response = await fetch("/api/runtime", { cache: "no-store" });
      if (!response.ok) return;
      const nextRuntime = await response.json();
      if (state.runtime?.snapshotVersion && nextRuntime.snapshotVersion !== state.runtime.snapshotVersion) {
        window.location.reload();
        return;
      }
      state.runtime = nextRuntime;
    } catch {
      clearInterval(state.runtimePoller);
      state.runtimePoller = null;
    }
  }, 1500);
}

async function completeReviewFromDashboard(taskId) {
  const result = document.querySelector(`[data-review-result="${CSS.escape(taskId)}"]`);
  const checkbox = document.querySelector(`[data-review-confirm-check="${CSS.escape(taskId)}"]`);
  const confirmInput = document.querySelector(`[data-review-confirm-text="${CSS.escape(taskId)}"]`);
  const task = (bundle.status?.tasks || []).find((item) => item.id === taskId);
  if (!checkbox?.checked) {
    if (result) result.textContent = t("reviewChecklistRequired");
    return;
  }
  if (!confirmInput?.value || ![task?.shortId, task?.id].includes(confirmInput.value.trim())) {
    if (result) result.textContent = t("reviewConfirmTextMismatch");
    return;
  }
  if (result) result.textContent = t("reviewSubmitting");
  try {
    const response = await fetch("/api/tasks/review-complete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify({
        taskId,
        confirmText: confirmInput.value.trim(),
        reviewer: "Human Reviewer",
        message: "confirmed from dashboard workbench",
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t("reviewCompleteFailed"));
    if (result) result.textContent = t("reviewCompleteSuccess");
    setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    if (result) result.textContent = `${t("reviewCompleteFailed")}: ${error.message}`;
  }
}

function renderDrawerContent(taskId) {
  const task = (bundle.status?.tasks || []).find((item) => item.id === taskId);
  if (!task) return `<div class="empty">${t("taskNotFound")}</div>`;

  const header = `
    <div class="task-drawer-header">
      <div>
        <h2>${escapeHtml(task.title)}</h2>
        <p style="font-family: var(--font-mono); font-size: 11px; margin: 4px 0 0; color: var(--muted);">${escapeHtml(task.id)}</p>
        ${taskCopyButton(task, "detail-copy")}
      </div>
      <button class="btn-close" data-close-drawer>×</button>
    </div>
  `;

  const timeline = phaseTimeline(task);
  const documents = taskDocumentLibrary(task, "");
  const findings = openFindings(task);
  const evidence = evidenceList(task);

  const body = `
    <div class="task-drawer-body stack">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; background: var(--paper-2); padding: 12px 16px; border-radius: 8px;">
        <div style="font-size: 24px; font-weight: 800; color: var(--accent);">${task.completion}%</div>
        <a href="#/tasks/${encodeURIComponent(task.id)}" class="btn-drawer-trigger" style="text-decoration: none;">${t("fullView")}</a>
      </div>
      ${taskStateSummary(task)}
      ${reviewActionPanel(task, { mode: "summary" })}
      ${timeline}
      ${documents}
      ${findings}
      ${evidence}
    </div>
  `;

  return header + body;
}

function openDrawer(taskId) {
  const drawer = document.getElementById("task-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (!drawer || !overlay) return;
  drawer.innerHTML = renderDrawerContent(taskId);
  drawer.classList.add("active");
  overlay.classList.add("active");

  drawer.querySelector("[data-close-drawer]").addEventListener("click", closeDrawer);
  drawer.querySelectorAll("[data-render-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.renderMode = state.renderMode === "rendered" ? "source" : "rendered";
    openDrawer(taskId);
  }));
  bindCopyTaskNameButtons(drawer);
  bindRepairPromptButtons(drawer);
  bindLessonSedimentationButtons(drawer);
  drawer.querySelectorAll("[data-review-complete]").forEach((button) => button.addEventListener("click", () => completeReviewFromDashboard(button.dataset.reviewComplete)));
}

function bindCopyTaskNameButtons(root) {
  root.querySelectorAll("[data-copy-task-name]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const taskName = button.dataset.copyTaskName || "";
    const defaultText = t("copyTaskNameShort");
    try {
      await copyText(taskName);
      button.textContent = t("copyTaskNameSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    window.setTimeout(() => {
      button.textContent = defaultText;
    }, 1400);
  }));
}

function bindRepairPromptButtons(root) {
  root.querySelectorAll("[data-copy-repair-prompt]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const prompt = button.dataset.repairPrompt || "";
    const defaultText = t("copyRepairPrompt");
    try {
      await copyText(prompt);
      button.textContent = t("copyRepairPromptSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    window.setTimeout(() => {
      button.textContent = defaultText;
    }, 1400);
  }));
}

function bindLessonSedimentationButtons(root) {
  root.querySelectorAll("[data-copy-lesson-prompt]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const prompt = button.dataset.lessonPrompt || "";
    const defaultText = t("copyLessonPrompt");
    try {
      await copyText(prompt);
      button.textContent = t("copyRepairPromptSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    window.setTimeout(() => {
      button.textContent = defaultText;
    }, 1400);
  }));
  root.querySelectorAll("[data-create-lesson-sedimentation]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await createLessonSedimentationFromDashboard(button);
  }));
}

async function createLessonSedimentationFromDashboard(button) {
  const taskId = button.dataset.createLessonSedimentation || "";
  const candidateId = button.dataset.candidateId || "";
  const result = document.querySelector(`[data-lesson-result="${CSS.escape(`${taskId}:${candidateId}`)}"]`);
  if (result) result.textContent = t("lessonTaskCreating");
  try {
    const response = await fetch("/api/tasks/lesson-sedimentation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify({ taskId, candidateId }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t("lessonTaskCreateFailed"));
    if (result) result.textContent = t("lessonTaskCreated");
    setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    if (result) result.textContent = `${t("lessonTaskCreateFailed")}: ${error.message}`;
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

function renderLessonDrawerContent(lessonId) {
  const lessonTable = (bundle.tables?.tables || []).find((table) => table.kind === "lessons-ssot");
  const row = (lessonTable?.rows || []).find((r) => {
    const cells = r.cells || {};
    const id = cells.ID || cells.Lesson || cells["Lesson ID"] || cells["ID"] || "";
    return id === lessonId;
  });

  if (!row) {
    return `<div class="task-drawer-header">
      <h2>${escapeHtml(lessonId)}</h2>
      <button class="btn-close" data-close-drawer>×</button>
    </div>
    <div class="task-drawer-body">
      <div class="empty">${t("lessonNotFound")}</div>
    </div>`;
  }

  const cells = row.cells || {};
  const summary = cells.Summary || cells["\u6458\u8981"] || cells.Pattern || cells.Status || "";
  const docPath = cells["\u8be6\u60c5\u6587\u6863"] || cells.Document || cells.document || "";

  let doc = null;
  if (docPath) {
    doc = findDocument(docPath);
  }
  if (!doc) {
    doc = (bundle.documents?.documents || []).find((d) => d.path.includes(lessonId) || d.path.endsWith(`${lessonId}.md`));
  }

  const header = `
    <div class="task-drawer-header">
      <div>
        <h2>${escapeHtml(lessonId)}</h2>
        <p style="font-size: 12px; margin: 4px 0 0; color: var(--muted); font-weight: 600;">${escapeHtml(summary)}</p>
      </div>
      <button class="btn-close" data-close-drawer>×</button>
    </div>
  `;

  let markdownBody = "";
  if (doc && doc.content) {
    markdownBody = `<div class="markdown">${window.HarnessMarkdown.render(doc.content, "rendered")}</div>`;
  } else {
    const rowsHtml = Object.entries(cells)
      .map(([key, val]) => `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(val)}</td></tr>`)
      .join("");
    markdownBody = `
      <div style="margin-bottom: 20px; background: var(--paper-2); padding: 16px; border-radius: 8px; border: 1px dashed var(--line);">
        <p style="margin: 0; font-size: 13px; color: var(--muted);">${t("lessonDocMissing")}</p>
      </div>
      <table class="rendered-table" style="width: 100%;">
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }

  const body = `
    <div class="task-drawer-body stack">
      ${markdownBody}
    </div>
  `;

  return header + body;
}

function openLessonDrawer(lessonId) {
  const drawer = document.getElementById("task-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (!drawer || !overlay) return;
  drawer.innerHTML = renderLessonDrawerContent(lessonId);
  drawer.classList.add("active");
  overlay.classList.add("active");

  drawer.querySelector("[data-close-drawer]").addEventListener("click", closeDrawer);
}

function closeDrawer() {
  const drawer = document.getElementById("task-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (drawer) drawer.classList.remove("active");
  if (overlay) overlay.classList.remove("active");
}

function ledgerPanel() {
  const ledgerTable = (bundle.tables?.tables || []).find((table) => table.kind === "harness-ledger");
  const rows = ledgerTable?.rows || [];

  let closedCount = 0;
  let openCount = 0;
  let blockedCount = 0;

  let lessonsReviewed = 0;
  let lessonsTotal = 0;

  let evidenceAudited = 0;
  let evidenceTotal = 0;

  for (const row of rows) {
    const cells = row.cells || {};
    const status = String(cells.Status || cells["\u72b6\u6001"] || "").toLowerCase();
    if (status.includes("close") || status.includes("done") || status.includes("\u7ed3") || status.includes("\u5b8c")) {
      closedCount++;
    } else if (status.includes("block") || status.includes("\u963b")) {
      blockedCount++;
    } else {
      openCount++;
    }

    const lesson = String(cells.Lessons || cells["\u7ecf\u9a8c"] || cells["\u7ecf\u9a8c\u5ba1\u67e5"] || cells["Lesson"] || "");
    if (lesson) {
      lessonsTotal++;
      if (lesson.toLowerCase().includes("pass") || lesson.includes("\u901a\u8fc7") || lesson.includes("\u5c31\u7eea") || lesson.toLowerCase().includes("checked") || lesson.toLowerCase().includes("done")) {
        lessonsReviewed++;
      }
    }

    const evidence = String(cells.Evidence || cells["\u8bc1\u636e"] || cells["\u9a8c\u8bc1\u8bc1\u636e"] || cells["Evidence Checked"] || "");
    if (evidence) {
      evidenceTotal++;
      if (evidence.toLowerCase().includes("pass") || evidence.includes("\u901a\u8fc7") || evidence.toLowerCase().includes("present") || evidence.toLowerCase().includes("verified") || evidence.toLowerCase().includes("done")) {
        evidenceAudited++;
      }
    }
  }

  const total = closedCount + openCount + blockedCount || 1;
  const closedPct = Math.round((closedCount / total) * 100);
  const openPct = Math.round((openCount / total) * 100);
  const blockedPct = total - closedPct - openPct;

  const lessonsPct = lessonsTotal ? Math.round((lessonsReviewed / lessonsTotal) * 100) : 0;
  const evidencePct = evidenceTotal ? Math.round((evidenceAudited / evidenceTotal) * 100) : 0;

  if (rows.length === 0) return "";

  return `<section class="ledger-panel">
    <h2>${t("ssotLedger")}</h2>
    <div class="ledger-split-bar" title="${t("tagClosed")}: ${closedCount}, ${t("tagOpen")}: ${openCount}, ${t("tagBlocked")}: ${blockedCount}">
      <div class="ledger-split-segment closed" style="width: ${closedPct}%"></div>
      <div class="ledger-split-segment open" style="width: ${openPct}%"></div>
      <div class="ledger-split-segment blocked" style="width: ${Math.max(0, blockedPct)}%"></div>
    </div>
    <div class="ledger-split-legend">
      <span class="ledger-split-legend-item"><i class="ledger-split-legend-dot closed"></i>${t("tagClosed")} (${closedCount})</span>
      <span class="ledger-split-legend-item"><i class="ledger-split-legend-dot open"></i>${t("tagOpen")} (${openCount})</span>
      <span class="ledger-split-legend-item"><i class="ledger-split-legend-dot blocked"></i>${t("tagBlocked")} (${blockedCount})</span>
    </div>
    <div class="ledger-gauge-row">
      <div class="ledger-gauge-card">
        <span>${t("lessonsCheckRate")}</span>
        <strong>${lessonsPct}%</strong>
      </div>
      <div class="ledger-gauge-card">
        <span>${t("evidenceAuditRate")}</span>
        <strong>${evidencePct}%</strong>
      </div>
    </div>
  </section>`;
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
loadRuntime();
