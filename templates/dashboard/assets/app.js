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
  presetQuery: "",
  presetSourceFilter: "all",
  selectedPresetKey: "",
  selectedPresetId: "",
  presetActionResult: null,
  presetInstallSource: "",
  presetInstallScope: "project",
  presetInstallForce: false,
  presetSeedScope: "project",
  presetSeedForce: false,
  presetUninstallScope: "project",
  presetUninstallConfirm: "",
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
        ${routeLink("#/presets", t("presetCatalog"), "presets")}
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
  if (route.name === "presets") return presetsView();
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
  if (parts[0] === "presets") return { name: "presets" };
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
  const validationMode = bundle.status?.checkState?.validationMode || "validated";
  const dataOnly = validationMode === "data-only";
  const displayState = dataOnly ? "snapshot" : status;
  const failures = bundle.status?.checkState?.failures || 0;
  const warnings = bundle.status?.checkState?.warnings || 0;
  const tasks = bundle.status?.tasks || [];
  const summary = bundle.status?.summary || {};
  const visual = summary.visualMapCoverage || {};
  const withBrief = tasks.filter((task) => task.briefSource === "standalone").length;
  return `<section class="status-card-group">
    <div class="status-primary ${displayState}">
      <span>${dataOnly ? t("snapshotStatus") : t("readiness")}</span>
      <strong>${dataOnly ? t("snapshot") : label(status)}</strong>
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
  if ((bundle.status?.checkState?.validationMode || "validated") === "data-only") return t("snapshotNotValidated");
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
        ${lessonCandidatePanel(task, { context: "detail" })}
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
    <div class="review-reasons">
      ${reasons.slice(0, 5).map(reviewReason).join("")}
    </div>
  </div>`;
}

function phaseTimeline(task) {
  const knownKinds = new Set(["init", "execution", "gate"]);
  const groups = [
    ["init", "Init"],
    ["execution", "Execution"],
    ["gate", "Gate"],
    ["other", "Other / Invalid"],
  ];
  const phases = task.phases || [];
  const grouped = groups
    .map(([kind, label]) => {
      const items = kind === "other"
        ? phases.filter((phase) => !knownKinds.has(phase.kind || "execution"))
        : phases.filter((phase) => (phase.kind || "execution") === kind);
      if (!items.length) return "";
      return `<div class="phase-kind-group ${escapeAttr(kind)}">
        <h3>${escapeHtml(label)}</h3>
        ${items.map(phaseStep).join("")}
      </div>`;
    })
    .join("");
  return `<section class="phase-timeline">
    <h2>${t("phaseTimeline")}</h2>
    ${grouped || emptyState(t("noPhaseData"))}
  </section>`;
}

function phaseStep(phase) {
  const kind = phase.kind || "execution";
  const actor = phase.actor || "agent";
  const knownKind = ["init", "execution", "gate"].includes(kind);
  const kindLabel = knownKind ? escapeHtml(kind) : `<span class="tag warn">${escapeHtml(kind)}</span>`;
  const phaseKindClass = knownKind ? kind : "other";
  return `<div class="phase-step ${escapeAttr(phase.state)} ${escapeAttr(phaseKindClass)}">
    <div class="phase-step-head">
      <strong>${escapeHtml(phase.id)}</strong>
      <span>${kindLabel} · ${phase.completion}%</span>
    </div>
    <p>${escapeHtml(phase.output || phase.blockingRisk || phase.state)}</p>
    ${progressBar(phase.completion)}
    <div class="phase-meta">
      ${phaseMetaTag(actor)}
      ${tag(phase.evidenceStatus || "missing")}
    </div>
    ${phase.exitCommand ? `<code class="phase-exit-command">${escapeHtml(phase.exitCommand)}</code>` : ""}
  </div>`;
}

function phaseMetaTag(value) {
  return `<span class="tag">${escapeHtml(String(value || "unknown").replaceAll("_", " "))}</span>`;
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
  const lessonActions = tab?.id === "lessons" ? lessonCandidatePanel(task, { context: "card", limit: 2 }) : "";
  const displayId = task.shortId || taskFolderName(task) || task.id;
  return `<article class="task-card review-queue-card" style="--row-accent: var(${stateToColorVar(task.state)})">
    <div class="card-header">
      <span class="card-id" title="${escapeAttr(task.id)}">${escapeHtml(displayId)}</span>
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

function lessonCandidatePanel(task, { context = "detail", limit = 0 } = {}) {
  const candidates = (task.lessonCandidateRows || []).filter((candidate) => ["ready-for-review", "needs-promotion"].includes(candidate.status));
  if (!candidates.length) return "";
  const visibleCandidates = limit > 0 ? candidates.slice(0, limit) : candidates;
  const hiddenCount = Math.max(0, candidates.length - visibleCandidates.length);
  const staticNote = canUseWorkbenchAction("lesson-sedimentation-task") ? "" : `<p class="lesson-action-note">${escapeHtml(t("lessonWorkbenchRequired"))}</p>`;
  return `<section class="lesson-candidate-panel ${context === "card" ? "compact" : ""}">
    <div class="lesson-candidate-panel-head">
      <div>
        <p class="eyebrow">${t("lessonCandidates")}</p>
        <h3>${t("lessonSedimentationActions")}</h3>
      </div>
      <span class="tag">${visibleCandidates.length}/${candidates.length}</span>
    </div>
    ${staticNote}
    <div class="lesson-candidate-actions">
      ${visibleCandidates.map((candidate) => lessonCandidateAction(task, candidate)).join("")}
    </div>
    ${hiddenCount ? `<a class="lesson-candidate-more" href="#/review/${encodeURIComponent(task.id)}">${escapeHtml(t("moreLessonCandidates")).replace("{count}", String(hiddenCount))}</a>` : ""}
  </section>`;
}

function lessonCandidateAction(task, candidate) {
  const followUp = String(candidate.followUpTask || "").trim();
  const hasFollowUp = followUp && !/^pending$/i.test(followUp);
  const prompt = lessonSedimentationPrompt(task, candidate);
  return `<div class="lesson-candidate-action">
    <div class="lesson-candidate-main">
      <strong>${escapeHtml(candidate.id)}</strong>
      <span>${escapeHtml(candidate.title || candidate.promotionTarget || t("lessonCandidates"))}</span>
      <small>${escapeHtml(candidate.scope || t("none"))} · ${escapeHtml(candidate.promotionTarget || t("none"))}</small>
    </div>
    <span class="review-result" data-lesson-result="${escapeAttr(task.id)}:${escapeAttr(candidate.id)}"></span>
    <div class="lesson-candidate-command-row">
      ${hasFollowUp ? `<a href="#/tasks/${encodeURIComponent(followUp)}">${t("openFollowUpTask")}</a>` : ""}
      <button data-copy-lesson-prompt="${escapeAttr(task.id)}:${escapeAttr(candidate.id)}" data-lesson-prompt="${escapeAttr(prompt)}">${t("copyLessonPrompt")}</button>
      <button data-create-lesson-sedimentation="${escapeAttr(task.id)}" data-candidate-id="${escapeAttr(candidate.id)}" ${canUseWorkbenchAction("lesson-sedimentation-task") && !hasFollowUp ? "" : "disabled"}>${t("createLessonTask")}</button>
    </div>
  </div>`;
}

function lessonSedimentationPrompt(task, candidate) {
  return [
    "You are executing a lesson sedimentation follow-up task.",
    "",
    `Source task: ${task.id}`,
    `Source candidate: ${candidate.id} - ${candidate.title || ""}`,
    `Candidate scope: ${candidate.scope || "unspecified"}`,
    `Candidate module key: ${candidate.moduleKey || "n/a"}`,
    `Detail artifact: ${candidate.detailArtifact || "not provided"}`,
    `Boundary reason: ${candidate.boundaryReason || "unspecified"}`,
    `Why it might matter: ${candidate.whyItMightMatter || "unspecified"}`,
    `Promotion target: ${candidate.promotionTarget || "unspecified"}`,
    `Conflict check: ${candidate.conflictCheck || "pending"}`,
    `Required standard update: ${candidate.requiredStandardUpdate || "pending"}`,
    "",
    "Instructions:",
    "1. Read the source task, review, findings, progress, lesson_candidates.md, and the task-local detail artifact.",
    "2. Use the detail artifact as the lesson body source; do not reconstruct the lesson from the brief row.",
    "3. Classify whether the lesson is task-local, module-local, or global, preserving the module key and source path when present.",
    "4. Check conflicts against existing lessons and standards.",
    "5. Propose the smallest diff first.",
    "6. Do not write a shared Lessons table; use task-local candidates and promoted detail docs.",
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
  const lessons = lessonDocuments();
  return `<section class="lesson-panel">
    <div class="section-head"><h2>${t("lessons")}</h2><span>${lessons.length}</span></div>
    <div class="lesson-list" style="padding-top: 10px;">
      ${lessons.map((lesson) => {
        return `<div class="lesson" data-open-lesson-drawer="${escapeAttr(lesson.id)}">
          <strong>${escapeHtml(lesson.id)}</strong>
          <p>${escapeHtml(lesson.title || lesson.path)}</p>
        </div>`;
      }).join("") || emptyState(t("noLessons"))}
    </div>
  </section>`;
}

function lessonDocuments() {
  return (bundle.documents?.documents || [])
    .filter((doc) => doc.type === "lesson-detail" || /\/01-GOVERNANCE\/lessons\/[^/]+\.md$/i.test(doc.path || ""))
    .map((doc) => {
      const id = lessonIdFromDocument(doc);
      return { id, title: (doc.title || "").replace(new RegExp(`^${id}\\s*-\\s*`, "i"), ""), path: doc.path, doc };
    })
    .filter((lesson) => lesson.id)
    .sort((left, right) => String(right.id).localeCompare(String(left.id)));
}

function lessonIdFromDocument(doc) {
  const content = doc?.content || "";
  const path = doc?.path || "";
  return content.match(/#\s*(L-\d{4}(?:-\d{2}-\d{2})?-\d+)/i)?.[1]
    || path.match(/(L-\d{4}(?:-\d{2}-\d{2})?-\d+)/i)?.[1]
    || "";
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

function presetsView() {
  ensurePresetState();
  const catalog = bundle.presetCatalog || { summary: {}, roots: [], presets: [] };
  let presets = filteredPresets();
  syncVisiblePresetSelection(presets);
  presets = filteredPresets();
  const selected = selectedPreset(presets);
  syncPresetUninstallScope(selected);
  return `<div class="presets-page stack">
    <section class="flow-panel preset-command-center">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t("presetCatalog")}</p>
          <h2>${t("presetCatalog")}</h2>
          <p class="subtle">${t("presetCatalogSubtitle")}</p>
        </div>
        <span class="preset-count-pill">${presets.length}/${catalog.summary?.total || 0}</span>
      </div>
      <div class="preset-priority-strip" aria-label="${escapeAttr(t("presetPriorityTitle"))}">
        ${presetPriorityStep("project", 1)}
        ${presetPriorityStep("user", 2)}
        ${presetPriorityStep("builtin", 3)}
      </div>
      <div class="preset-toolbar">
        <div class="input-group">
          <input data-preset-search value="${escapeAttr(state.presetQuery)}" placeholder="${escapeAttr(t("presetSearchPlaceholder"))}" aria-label="${escapeAttr(t("presetSearch"))}">
        </div>
        <div class="preset-source-tabs" role="tablist" aria-label="${escapeAttr(t("presetSourceFilter"))}">
          ${presetSourceOptions().map((source) => presetSourceButton(source)).join("")}
        </div>
      </div>
    </section>
    <section class="preset-workspace">
      <div class="flow-panel preset-collection-panel">
        <div class="preset-panel-heading">
          <div>
            <h3>${t("presetCollection")}</h3>
            <p>${t("presetCollectionHint")}</p>
          </div>
        </div>
        <div class="preset-catalog-list">
          ${presets.map((preset) => presetCard(preset, selected ? presetKey(selected) : "")).join("") || emptyState(t("noPresets"))}
        </div>
      </div>
      <div class="preset-detail-workspace stack">
        ${presetDetailPanel(selected)}
        ${presetLayerStackPanel(selected)}
      </div>
      <aside class="preset-context-actions stack">
        ${presetActionPanel(selected)}
        ${presetImportPanel()}
        ${presetRestorePanel()}
        ${presetSummaryPanel(catalog)}
      </aside>
    </section>
  </div>`;
}

function ensurePresetState() {
  const presets = bundle.presetCatalog?.presets || [];
  if (!state.selectedPresetKey && state.selectedPresetId) {
    const legacySelection = presets.find((preset) => preset.id === state.selectedPresetId);
    if (legacySelection) state.selectedPresetKey = presetKey(legacySelection);
  }
  if (!state.selectedPresetKey && presets[0]) {
    state.selectedPresetKey = presetKey(presets[0]);
    state.presetUninstallConfirm = "";
  }
  if (state.selectedPresetKey && !presets.some((preset) => presetKey(preset) === state.selectedPresetKey) && presets[0]) {
    state.selectedPresetKey = presetKey(presets[0]);
    state.presetUninstallConfirm = "";
  }
}

function presetSourceOptions() {
  return [
    ["all", t("allPresets")],
    ["project", t("presetSourceProject")],
    ["user", t("presetSourceUser")],
    ["builtin", t("presetSourceBuiltin")],
  ];
}

function presetSourceButton([source, labelText]) {
  const active = state.presetSourceFilter === source;
  const count = source === "all" ? (bundle.presetCatalog?.summary?.total || 0) : (bundle.presetCatalog?.summary?.[source] || 0);
  return `<button type="button" class="${active ? "active" : ""}" data-preset-source-filter="${escapeAttr(source)}" role="tab" aria-selected="${active ? "true" : "false"}">
    <span>${escapeHtml(labelText)}</span>
    <strong>${count}</strong>
  </button>`;
}

function filteredPresets() {
  const query = String(state.presetQuery || "").trim().toLowerCase();
  return (bundle.presetCatalog?.presets || []).filter((preset) => {
    if (state.presetSourceFilter !== "all" && preset.source !== state.presetSourceFilter) return false;
    return presetMatchesQuery(preset, query);
  });
}

function presetMatchesQuery(preset, query = state.presetQuery) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    preset.id,
    preset.source,
    preset.purpose,
    preset.taskKind,
    preset.manifestPath,
    preset.version,
    ...(preset.compatibleBudgets || []),
  ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
}

function syncVisiblePresetSelection(visiblePresets) {
  if (!visiblePresets.length) {
    state.selectedPresetKey = "";
    state.presetUninstallConfirm = "";
    return;
  }
  if (!visiblePresets.some((preset) => presetKey(preset) === state.selectedPresetKey)) {
    state.selectedPresetKey = presetKey(visiblePresets[0]);
    state.presetUninstallConfirm = "";
  }
}

function selectedPreset(visiblePresets = filteredPresets()) {
  return visiblePresets.find((preset) => presetKey(preset) === state.selectedPresetKey) || visiblePresets[0] || null;
}

function presetCard(preset, selectedId) {
  const key = presetKey(preset);
  const selected = key === selectedId;
  return `<article class="preset-card ${selected ? "active" : ""} ${preset.effective ? "effective" : "shadowed"}">
    <div class="preset-card-topline">
      <button type="button" class="preset-card-select" data-preset-select="${escapeAttr(key)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="card-id">${escapeHtml(preset.id)}</span>
      </button>
      <div class="preset-card-tools">
        ${presetSourceBadge(preset.source)}
        ${presetStatusBadge(preset)}
        <button type="button" class="copy-inline" data-copy-preset-id="${escapeAttr(preset.id)}" title="${escapeAttr(t("copyPresetId"))}">${t("copyIdShort")}</button>
      </div>
    </div>
    <button type="button" class="preset-card-body" data-preset-select="${escapeAttr(key)}">
      <span>${escapeHtml(preset.purpose || t("none"))}</span>
    </button>
    <div class="preset-card-meta">
      <span>${t("manifestVersion")}: ${escapeHtml(formatPresetVersion(preset))}</span>
      <span>${t("taskKind")}: ${escapeHtml(preset.taskKind || t("none"))}</span>
      <span>${t("budgets")}: ${escapeHtml((preset.compatibleBudgets || []).join(", ") || t("none"))}</span>
    </div>
    <code class="preset-manifest-path">${escapeHtml(preset.manifestPath || "")}</code>
  </article>`;
}

function presetKey(preset) {
  return preset?.key || `${preset?.source || "unknown"}:${preset?.id || ""}`;
}

function presetSourceRank(source) {
  return { project: 1, user: 2, builtin: 3 }[source] || 9;
}

function presetLayersForId(id) {
  return (bundle.presetCatalog?.presets || [])
    .filter((preset) => preset.id === id)
    .sort((a, b) => presetSourceRank(a.source) - presetSourceRank(b.source));
}

function syncPresetUninstallScope(preset) {
  if (preset && ["project", "user"].includes(preset.source)) state.presetUninstallScope = preset.source;
}

function presetPriorityStep(source, index) {
  return `<div class="preset-priority-step">
    <span>${index}</span>
    <strong>${escapeHtml(t(`presetSource_${source}`) || source)}</strong>
  </div>`;
}

function presetSourceBadge(source) {
  const normalized = String(source || "unknown");
  return `<span class="tag preset-source-badge ${escapeAttr(normalized)}">${escapeHtml(t(`presetSource_${normalized}`) || normalized)}</span>`;
}

function presetStatusBadge(preset) {
  return `<span class="tag ${preset.effective ? "pass" : "warn"}">${escapeHtml(preset.effective ? t("presetEffective") : t("presetShadowed"))}</span>`;
}

function formatPresetVersion(preset) {
  return preset?.version ?? t("none");
}

function presetSummaryPanel(catalog) {
  const roots = catalog.roots || [];
  return `<section class="side-panel preset-summary-panel">
    <h3>${t("presetSources")}</h3>
    <p class="preset-helper">${t("presetSourcesHint")}</p>
    <div class="metrics-grid compact">
      ${metric(t("presetSourceProject"), catalog.summary?.project || 0)}
      ${metric(t("presetSourceUser"), catalog.summary?.user || 0)}
      ${metric(t("presetSourceBuiltin"), catalog.summary?.builtin || 0)}
    </div>
    <div class="preset-roots">
      ${roots.map((root) => `<div><strong>${escapeHtml(t(`presetSource_${root.source}`) || root.source)}</strong><code>${escapeHtml(root.path || "")}</code></div>`).join("")}
    </div>
  </section>`;
}

function presetDetailPanel(preset) {
  if (!preset) return `<section class="flow-panel preset-detail-panel">${emptyState(t("noPresets"))}</section>`;
  const inspectCommand = `harness preset inspect ${preset.id} --json .`;
  const checkCommand = `harness preset check ${preset.id} --json .`;
  const commandRows = preset.effective
    ? `${presetCommandRow(inspectCommand)}${presetCommandRow(checkCommand)}`
    : `<div class="preset-command-warning">${escapeHtml(t("presetCommandsEffectiveOnly"))}</div>`;
  return `<section class="flow-panel preset-detail-panel">
    <div class="preset-detail-hero">
      <div>
        <div class="preset-detail-title-row">
          <h3>${escapeHtml(preset.id)}</h3>
          <button type="button" class="copy-inline" data-copy-preset-id="${escapeAttr(preset.id)}">${t("copyPresetId")}</button>
        </div>
        <p>${escapeHtml(preset.purpose || "")}</p>
      </div>
      <div class="preset-detail-badges">
        ${presetSourceBadge(preset.source)}
        ${presetStatusBadge(preset)}
      </div>
    </div>
    <dl class="preset-detail-list">
      ${presetDetailRow(t("manifestVersion"), formatPresetVersion(preset))}
      ${presetDetailRow(t("source"), t(`presetSource_${preset.source}`) || preset.source)}
      ${presetDetailRow(t("status"), preset.effective ? t("presetEffective") : t("presetShadowed"))}
      ${presetDetailRow(t("taskKind"), preset.taskKind || t("none"))}
      ${presetDetailRow(t("budgets"), (preset.compatibleBudgets || []).join(", ") || t("none"))}
      ${presetDetailRow(t("inputs"), preset.inputCount || 0)}
      ${presetDetailRow(t("references"), preset.referenceCount || 0)}
      ${presetDetailRow(t("artifacts"), preset.artifactCount || 0)}
      ${presetDetailRow(t("writeScopes"), preset.writeScopeCount || 0)}
      ${presetDetailRow(t("requiredReads"), preset.requiredReadCount || 0)}
    </dl>
    <div class="preset-path-block">
      <span>${t("manifestPath")}</span>
      <code class="preset-manifest-path">${escapeHtml(preset.manifestPath || "")}</code>
    </div>
    <div class="preset-command-list">
      ${commandRows}
    </div>
  </section>`;
}

function presetDetailRow(labelText, value) {
  return `<div><dt>${escapeHtml(labelText)}</dt><dd>${escapeHtml(String(value ?? ""))}</dd></div>`;
}

function presetCommandRow(command) {
  return `<div class="preset-command-row">
    <code>${escapeHtml(command)}</code>
    <button type="button" class="copy-inline" data-copy-preset-command="${escapeAttr(command)}">${t("copyCommand")}</button>
  </div>`;
}

function presetLayerStackPanel(preset) {
  if (!preset) return "";
  const layers = presetLayersForId(preset.id);
  return `<section class="flow-panel preset-layer-panel">
    <div class="preset-panel-heading">
      <div>
        <h3>${t("presetLayerStack")}</h3>
        <p>${t("presetLayerStackHint")}</p>
      </div>
    </div>
    <div class="preset-layer-list">
      ${layers.map((layer) => `<button type="button" class="preset-layer-row ${presetKey(layer) === presetKey(preset) ? "active" : ""}" data-preset-select="${escapeAttr(presetKey(layer))}">
        <span class="preset-layer-rank">${presetSourceRank(layer.source)}</span>
        <span>
          <strong>${escapeHtml(t(`presetSource_${layer.source}`) || layer.source)}</strong>
          <small>${t("manifestVersion")}: ${escapeHtml(formatPresetVersion(layer))}</small>
        </span>
        ${presetStatusBadge(layer)}
      </button>`).join("")}
    </div>
  </section>`;
}

function presetActionPanel(preset) {
  const staticNote = canUseWorkbenchAction("preset-install") ? "" : `<p class="lesson-action-note">${escapeHtml(t("presetWorkbenchRequired"))}</p>`;
  const lockedUninstallScope = preset && ["project", "user"].includes(preset.source) ? preset.source : "";
  const confirmMatches = Boolean(preset && state.presetUninstallConfirm.trim() === preset.id);
  const canCheck = canUseWorkbenchAction("preset-check") && preset && preset.effective;
  const canUninstall = canUseWorkbenchAction("preset-uninstall") && preset && preset.source !== "builtin" && confirmMatches;
  return `<section class="side-panel preset-action-panel">
    <div class="preset-panel-heading">
      <div>
        <h3>${t("presetContextActions")}</h3>
        <p>${preset ? escapeHtml(preset.id) : t("noPresets")}</p>
      </div>
    </div>
    ${staticNote}
    ${presetActionResult()}
    <div class="preset-action-group">
      <h4>${t("presetCheck")}</h4>
      <p>${preset?.effective ? t("presetCheckHint") : t("presetShadowedActionHint")}</p>
      <button data-preset-check="${escapeAttr(preset?.id || "")}" ${canCheck ? "" : "disabled"}>${t("presetCheckSelected")}</button>
    </div>
    <div class="preset-action-group danger">
      <h4>${t("presetUninstallSelected")}</h4>
      <p>${preset?.source === "builtin" ? t("presetBuiltinImmutable") : t("presetUninstallHint")}</p>
      <label>${t("scope")}<select data-preset-uninstall-scope ${lockedUninstallScope ? "disabled" : ""}>
        ${presetScopeOptions(lockedUninstallScope || state.presetUninstallScope)}
      </select></label>
      <div class="preset-confirm-row">
        <label>${t("confirmPresetId")}<input data-preset-uninstall-confirm value="${escapeAttr(state.presetUninstallConfirm)}" placeholder="${escapeAttr(preset?.id || "")}"></label>
        <button type="button" data-preset-fill-confirm="${escapeAttr(preset?.id || "")}" ${preset && preset.source !== "builtin" ? "" : "disabled"}>${t("useSelectedId")}</button>
      </div>
      ${preset && preset.source !== "builtin" && !confirmMatches ? `<p class="preset-confirm-warning">${escapeHtml(t("presetConfirmRequired"))}</p>` : ""}
      <button data-preset-uninstall="${escapeAttr(preset?.id || "")}" ${canUninstall ? "" : "disabled"}>${t("presetUninstallSelected")}</button>
    </div>
  </section>`;
}

function presetImportPanel() {
  return `<section class="side-panel preset-action-panel">
    <div class="preset-panel-heading">
      <div>
        <h3>${t("presetImportTitle")}</h3>
        <p>${t("presetImportHint")}</p>
      </div>
    </div>
    <div class="preset-action-group">
      <label>${t("source")}<input data-preset-install-source value="${escapeAttr(state.presetInstallSource)}" placeholder="${escapeAttr(t("presetInstallSourcePlaceholder"))}"></label>
      <label>${t("scope")}<select data-preset-install-scope>
        ${presetScopeOptions(state.presetInstallScope)}
      </select></label>
      <label class="check-row"><input type="checkbox" data-preset-install-force ${state.presetInstallForce ? "checked" : ""}> ${t("forceOverwrite")}</label>
      <button data-preset-install ${canUseWorkbenchAction("preset-install") ? "" : "disabled"}>${t("presetInstall")}</button>
    </div>
  </section>`;
}

function presetRestorePanel() {
  return `<section class="side-panel preset-action-panel">
    <div class="preset-panel-heading">
      <div>
        <h3>${t("presetRestoreBundled")}</h3>
        <p>${t("presetRestoreBundledHint")}</p>
      </div>
    </div>
    <div class="preset-action-group">
      <label>${t("scope")}<select data-preset-seed-scope>
        ${presetScopeOptions(state.presetSeedScope)}
      </select></label>
      <label class="check-row"><input type="checkbox" data-preset-seed-force ${state.presetSeedForce ? "checked" : ""}> ${t("forceOverwrite")}</label>
      <button data-preset-seed ${canUseWorkbenchAction("preset-seed") ? "" : "disabled"}>${t("presetRestoreBundled")}</button>
    </div>
  </section>`;
}

function presetScopeOptions(current) {
  return [["project", t("presetSourceProject")], ["user", t("presetSourceUser")]]
    .map(([value, labelText]) => `<option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(labelText)}</option>`)
    .join("");
}

function presetActionResult() {
  const result = state.presetActionResult;
  if (!result) return "";
  const klass = result.ok ? "success" : "failed";
  return `<div class="workbench-action-result ${klass}">
    <strong>${escapeHtml(result.title || "")}</strong>
    <span>${escapeHtml(result.message || "")}</span>
  </div>`;
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
  document.querySelectorAll("[data-preset-search]").forEach((input) => input.addEventListener("input", () => {
    state.presetQuery = input.value;
    app();
  }));
  document.querySelectorAll("[data-preset-source-filter]").forEach((button) => button.addEventListener("click", () => {
    state.presetSourceFilter = button.dataset.presetSourceFilter || "all";
    state.selectedPresetKey = "";
    state.presetUninstallConfirm = "";
    app();
  }));
  document.querySelectorAll("[data-preset-select]").forEach((button) => button.addEventListener("click", () => {
    state.selectedPresetKey = button.dataset.presetSelect || "";
    state.selectedPresetId = "";
    const selectedPreset = (bundle.presetCatalog?.presets || []).find((preset) => presetKey(preset) === state.selectedPresetKey);
    if (selectedPreset && state.presetSourceFilter !== "all" && selectedPreset.source !== state.presetSourceFilter) {
      state.presetSourceFilter = selectedPreset.source;
    }
    if (selectedPreset && !presetMatchesQuery(selectedPreset)) state.presetQuery = "";
    if (selectedPreset && ["project", "user"].includes(selectedPreset.source)) state.presetUninstallScope = selectedPreset.source;
    state.presetUninstallConfirm = "";
    app();
  }));
  document.querySelectorAll("[data-preset-install-source]").forEach((input) => input.addEventListener("input", () => {
    state.presetInstallSource = input.value;
  }));
  document.querySelectorAll("[data-preset-install-scope]").forEach((select) => select.addEventListener("change", () => {
    state.presetInstallScope = select.value || "project";
  }));
  document.querySelectorAll("[data-preset-install-force]").forEach((input) => input.addEventListener("change", () => {
    state.presetInstallForce = input.checked;
  }));
  document.querySelectorAll("[data-preset-seed-scope]").forEach((select) => select.addEventListener("change", () => {
    state.presetSeedScope = select.value || "project";
  }));
  document.querySelectorAll("[data-preset-seed-force]").forEach((input) => input.addEventListener("change", () => {
    state.presetSeedForce = input.checked;
  }));
  document.querySelectorAll("[data-preset-uninstall-scope]").forEach((select) => select.addEventListener("change", () => {
    state.presetUninstallScope = select.value || "project";
  }));
  document.querySelectorAll("[data-preset-uninstall-confirm]").forEach((input) => input.addEventListener("input", () => {
    state.presetUninstallConfirm = input.value;
  }));
  document.querySelectorAll("[data-preset-fill-confirm]").forEach((button) => button.addEventListener("click", () => {
    state.presetUninstallConfirm = button.dataset.presetFillConfirm || "";
    app();
  }));
  document.querySelectorAll("[data-preset-check]").forEach((button) => button.addEventListener("click", () => runPresetAction("check", { id: button.dataset.presetCheck || "" })));
  document.querySelectorAll("[data-preset-install]").forEach((button) => button.addEventListener("click", () => runPresetAction("install", {
    source: state.presetInstallSource,
    scope: state.presetInstallScope,
    force: state.presetInstallForce,
  })));
  document.querySelectorAll("[data-preset-seed]").forEach((button) => button.addEventListener("click", () => runPresetAction("seed", {
    scope: state.presetSeedScope,
    force: state.presetSeedForce,
  })));
  document.querySelectorAll("[data-preset-uninstall]").forEach((button) => button.addEventListener("click", () => runPresetAction("uninstall", {
    id: button.dataset.presetUninstall || "",
    scope: state.presetUninstallScope,
    confirmText: state.presetUninstallConfirm,
  })));
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
  bindPresetCopyButtons(document);
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

async function runPresetAction(action, body) {
  state.presetActionResult = { ok: true, title: t("presetActionRunning"), message: action };
  app();
  try {
    const response = await fetch(`/api/presets/${action}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw payload;
    state.presetActionResult = {
      ok: true,
      title: t("presetActionSuccess"),
      message: presetActionMessage(action, payload),
    };
    app();
    if (["install", "seed", "uninstall"].includes(action)) setTimeout(() => window.location.reload(), 650);
  } catch (error) {
    state.presetActionResult = {
      ok: false,
      title: t("presetActionFailed"),
      message: error?.error || error?.message || String(error || action),
    };
    app();
  }
}

function presetActionMessage(action, payload) {
  if (action === "check") return `${payload.id || ""} ${payload.status || ""}`.trim();
  if (action === "install") return `${payload.id || ""} -> ${payload.scope || ""}`.trim();
  if (action === "seed") return `${payload.created || 0} ${t("created")} · ${payload.skipped || 0} ${t("skipped")}`;
  if (action === "uninstall") return `${payload.id || ""} ${payload.removed ? t("removed") : t("notInstalled")}`.trim();
  return action;
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
      <div class="drawer-task-summary">
        <div>
          <span>${t("statOverall")}</span>
          <strong>${task.completion}%</strong>
        </div>
        <a href="#/tasks/${encodeURIComponent(task.id)}" class="btn-drawer-trigger">${t("fullView")}</a>
      </div>
      ${taskStateSummary(task)}
      ${reviewActionPanel(task, { mode: "summary" })}
      ${lessonCandidatePanel(task, { context: "drawer" })}
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

function bindPresetCopyButtons(root) {
  root.querySelectorAll("[data-copy-preset-id]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const presetId = button.dataset.copyPresetId || "";
    const defaultText = button.textContent;
    try {
      await copyText(presetId);
      button.textContent = t("copyTaskNameSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    setTimeout(() => { button.textContent = defaultText; }, 1200);
  }));
  root.querySelectorAll("[data-copy-preset-command]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const command = button.dataset.copyPresetCommand || "";
    const defaultText = button.textContent;
    try {
      await copyText(command);
      button.textContent = t("copyTaskNameSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    setTimeout(() => { button.textContent = defaultText; }, 1200);
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
  button.disabled = true;
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
    if (!response.ok) throw payload;
    if (result) {
      result.innerHTML = lessonSedimentationSuccess(payload);
      bindLessonSedimentationButtons(result);
      result.scrollIntoView({ block: "center", inline: "nearest" });
    }
  } catch (error) {
    button.disabled = false;
    if (result) result.innerHTML = lessonSedimentationFailure(error);
  }
}

function lessonSedimentationSuccess(payload) {
  const followUp = payload?.followUpTask || {};
  const prompt = payload?.prompt || "";
  const taskId = followUp.id || "";
  const openHref = taskId ? `#/tasks/${encodeURIComponent(taskId)}` : "#/review";
  return `<div class="workbench-action-result success">
    <strong>${escapeHtml(t("lessonTaskCreated"))}</strong>
    ${taskId ? `<a href="${openHref}">${escapeHtml(t("openFollowUpTask"))}</a>` : ""}
    ${prompt ? `<button data-copy-lesson-prompt="${escapeAttr(taskId || "follow-up")}" data-lesson-prompt="${escapeAttr(prompt)}">${escapeHtml(t("copyLessonPrompt"))}</button>` : ""}
  </div>`;
}

function lessonSedimentationFailure(error) {
  const message = error?.error || error?.message || t("lessonTaskCreateFailed");
  const recovery = Array.isArray(error?.recovery) ? error.recovery : [];
  const details = error?.details || {};
  const existingTask = details.followUpTask || details.existingTask || "";
  return `<div class="workbench-action-result failed">
    <strong>${escapeHtml(t("lessonTaskCreateFailed"))}</strong>
    <span>${escapeHtml(message)}</span>
    ${existingTask ? `<a href="#/tasks/${encodeURIComponent(existingTask)}">${escapeHtml(t("openFollowUpTask"))}</a>` : ""}
    ${recovery.length ? `<ul>${recovery.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
  </div>`;
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
  const lesson = lessonDocuments().find((item) => item.id === lessonId);

  if (!lesson) {
    return `<div class="task-drawer-header">
      <h2>${escapeHtml(lessonId)}</h2>
      <button class="btn-close" data-close-drawer>×</button>
    </div>
    <div class="task-drawer-body">
      <div class="empty">${t("lessonNotFound")}</div>
    </div>`;
  }

  const doc = lesson.doc || findDocument(lesson.path);

  const header = `
    <div class="task-drawer-header">
      <div>
        <h2>${escapeHtml(lessonId)}</h2>
        <p style="font-size: 12px; margin: 4px 0 0; color: var(--muted); font-weight: 600;">${escapeHtml(lesson.title || lesson.path)}</p>
      </div>
      <button class="btn-close" data-close-drawer>×</button>
    </div>
  `;

  let markdownBody = "";
  if (doc && doc.content) {
    markdownBody = `<div class="markdown">${window.HarnessMarkdown.render(doc.content, "rendered")}</div>`;
  } else {
    markdownBody = `
      <div style="margin-bottom: 20px; background: var(--paper-2); padding: 16px; border-radius: 8px; border: 1px dashed var(--line);">
        <p style="margin: 0; font-size: 13px; color: var(--muted);">${t("lessonDocMissing")}</p>
      </div>
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
