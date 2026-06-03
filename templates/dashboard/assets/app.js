const dashboardBundleSchemaVersion = "dashboard-bundle/v1";
let rawBundle = window.__HARNESS_DASHBOARD__ || {};
let bundle = normalizeDashboardBundle(rawBundle);

function normalizeDashboardBundle(nextRawBundle) {
  const bundleSchemaCompatible = !nextRawBundle.schemaVersion || nextRawBundle.schemaVersion === dashboardBundleSchemaVersion;
  return bundleSchemaCompatible ? nextRawBundle : {
    schemaVersion: nextRawBundle.schemaVersion || "missing",
    schemaError: `Unsupported dashboard bundle schema: ${nextRawBundle.schemaVersion || "missing"}`,
    status: { tasks: [], summary: {}, checkState: { details: { warnings: [], failures: [] } } },
    tables: { tables: [] },
    documents: { documents: [] },
    graph: { nodes: [], edges: [] },
    modules: [],
    moduleSummary: {},
    adoption: { warnings: [], summary: {} },
    presetCatalog: { presets: [], roots: [], summary: {} },
  };
}

function setDashboardBundle(nextRawBundle) {
  rawBundle = nextRawBundle || {};
  window.__HARNESS_DASHBOARD__ = rawBundle;
  bundle = normalizeDashboardBundle(rawBundle);
}
const defaultLocale = window.__HARNESS_LOCALE__ || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");
let locale = localStorage.getItem("harness.locale") || defaultLocale;
if (!window.HarnessI18n?.[locale]) locale = "en";
let labels = window.HarnessI18n?.[locale] || {};

const state = {
  query: "",
  taskState: "all",
  taskGroupMode: localStorage.getItem("harness.taskGroupMode") || ((Array.isArray(bundle.modules) && bundle.modules.length > 0) ? "module" : "migration"),
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
  reviewBulkSelection: {},
  reviewBulkResult: null,
  lessonBulkSelection: {},
  lessonBulkResult: null,
  renderMode: "rendered",
  theme: localStorage.getItem("harness.theme") || "system",
  taskLayout: localStorage.getItem("harness.taskLayout") || "swimlane",
  taskSortOrder: localStorage.getItem("harness.taskSortOrder") === "asc" ? "asc" : "desc",
  detailDocsCollapsed: localStorage.getItem("harness.detailDocsCollapsed") === "true",
  detailSideCollapsed: localStorage.getItem("harness.detailSideCollapsed") === "true",
  runtime: { mode: "static", csrfToken: "", writableActions: [] },
  runtimeLoaded: false,
  runtimePoller: null,
  runtimeRefreshInFlight: false,
  runtimeRefreshError: "",
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

function formatMessage(key, values = {}) {
  return escapeHtml(t(key)).replace(/\{([^}]+)\}/g, (_, name) => escapeHtml(values[name] ?? ""));
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
  return `<a class="skip-link" href="#main">${escapeHtml(t("skipToMain"))}</a>
  <div class="visibility-shell">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow">${t("eyebrow")}</p>
        <h1>${escapeHtml(projectName())} ${t("projectCockpit")}</h1>
      </div>
      <nav class="hero-actions" aria-label="${escapeAttr(t("primaryNavigation"))}">
        ${routeLink("#/", t("overview"), "overview")}
        ${routeLink("#/tasks", t("taskIndex"), "tasks")}
        ${routeLink("#/review", t("reviewQueue"), "review")}
        ${routeLink("#/archive", t("archive"), "archive")}
        ${routeLink("#/modules", t("moduleView"), "modules")}
        ${routeLink("#/presets", t("presetCatalog"), "presets")}
        <button type="button" data-language-toggle>${locale === "zh" ? "EN" : "中文"}</button>
        <button type="button" data-theme-toggle>${themeLabel()}</button>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      ${runtimeModeBanner()}
      ${renderRoute()}
    </main>
    <div id="drawer-overlay" class="drawer-overlay"></div>
    <div id="task-drawer" class="task-drawer" aria-hidden="true" inert></div>
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
  if (route.name === "archive") return archiveView();
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
  if (parts[0] === "archive") return { name: "archive" };
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
  const snapshotOnly = validationMode === "data-only" && !isWorkbenchRuntime();
  const displayState = snapshotOnly ? "snapshot" : status;
  const failures = bundle.status?.checkState?.failures || 0;
  const warnings = bundle.status?.checkState?.warnings || 0;
  const tasks = normalCycleTasks();
  const summary = bundle.status?.summary || {};
  const visual = summary.visualMapCoverage || {};
  const withBrief = tasks.filter((task) => taskMaterialsView(task).briefReady === true).length;
  return `<section class="status-card-group">
    <div class="status-primary ${displayState}">
      <span>${snapshotOnly ? t("snapshotStatus") : t("readiness")}</span>
      <strong>${snapshotOnly ? t("snapshot") : label(status)}</strong>
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
  const dataOnly = (bundle.status?.checkState?.validationMode || "validated") === "data-only";
  if (dataOnly && !isWorkbenchRuntime()) return t("snapshotNotValidated");
  const failures = bundle.status?.checkState?.failures || 0;
  if (failures > 0) return t("resolveBlockers");
  const missingBriefs = normalCycleTasks().filter((task) => taskMaterialsView(task).briefReady === false).length;
  if (missingBriefs > 0) return `${missingBriefs} ${t("missingBriefs")}`;
  const warnings = bundle.status?.checkState?.warnings || 0;
  if (warnings > 0) return t("reviewAdvice");
  if (dataOnly) return t("workbenchDataOnly");
  return t("noBlockers");
}

function isWorkbenchRuntime() {
  return window.__HARNESS_WORKBENCH__ === true || state.runtime?.mode === "workbench";
}

function flowPanel() {
  const tasks = normalCycleTasks();
  const total = tasks.length;
  if (total === 0) return "";
  const active = tasks.filter(taskIsCurrentlyActive).length;
  const done = tasks.filter(taskCountsAsCompleted).length;
  const queued = tasks.filter((task) => !taskIsCurrentlyActive(task) && !taskCountsAsCompleted(task) && taskIsNonActiveQueueWork(task)).length;
  const planned = Math.max(0, total - done - active - queued);
  const pct = (n) => total > 0 ? Math.round((n / total) * 100) : 0;
  const progressText = t("taskProgressAria")
    .replaceAll("{done}", String(done))
    .replaceAll("{active}", String(active))
    .replaceAll("{queued}", String(queued))
    .replaceAll("{planned}", String(planned))
    .replaceAll("{total}", String(total));
  return `<section class="flow-panel">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("firstLook")}</p>
        <h2>${t("projectProgress")}</h2>
      </div>
      <span class="subtle">${done}/${total} ${t("completed")}</span>
    </div>
    <div class="progress-bar-container">
      <div class="progress-bar" role="progressbar" aria-label="${escapeAttr(t("projectProgress"))}" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-valuetext="${escapeAttr(progressText)}">
        ${done > 0 ? `<div class="progress-segment done" style="width:${pct(done)}%" title="${t("done")}: ${done}" aria-hidden="true"></div>` : ""}
        ${active > 0 ? `<div class="progress-segment active" style="width:${pct(active)}%" title="${t("active")}: ${active}" aria-hidden="true"></div>` : ""}
        ${queued > 0 ? `<div class="progress-segment queued" style="width:${pct(queued)}%" title="${t("queued")}: ${queued}" aria-hidden="true"></div>` : ""}
        ${planned > 0 ? `<div class="progress-segment planned" style="width:${pct(planned)}%" title="${t("planned")}: ${planned}" aria-hidden="true"></div>` : ""}
      </div>
      <div class="progress-legend">
        <span class="legend-item"><span class="legend-dot done"></span>${t("done")} ${done}</span>
        <span class="legend-item"><span class="legend-dot active"></span>${t("active")} ${active}</span>
        <span class="legend-item"><span class="legend-dot queued"></span>${t("queued")} ${queued}</span>
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
  const taskCount = normalCycleTasks().length;
  const taskNodes = (graph.nodes || []).filter((node) => node.type === "task").length;
  const usefulEdges = (graph.edges || []).filter((edge) => ["depends_on", "current_step"].includes(edge.type)).length;
  return taskCount > 80 || taskNodes > 80 || ((graph.nodes || []).length > 80 && usefulEdges < 6);
}

function migrationAggregateMermaid() {
  const tasks = normalCycleTasks();
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
  const tasks = normalCycleTasks();
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
  if (usesAggregateFlow()) return `${t("aggregateMigrationView")} · ${normalCycleTasks().length} ${t("tasks")}`;
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
      </div>
    </div>
    <div class="brief-scroll">
      <div class="brief-grid">${tasks.map((task) => taskBriefCard(task, { compact: false })).join("") || emptyState(t("noActiveTasks"))}</div>
    </div>
  </section>`;
}

function activeTasks() {
  const tasks = normalCycleTasks();
  return sortTasksByTime(tasks.filter(taskIsCurrentlyActive));
}

function isActiveTaskState(state) {
  return state === "active" || state === "in_progress";
}

function taskIsCurrentlyActive(task) {
  const projection = taskLifecycleProjection(task);
  const queues = taskQueueValues(task);
  return String(projection.deletionState || "active") === "active"
    && String(projection.state || "") === "in_progress"
    && String(projection.lifecycleState || "") === "active"
    && String(projection.closeoutStatus || "") !== "closed"
    && queues.includes("active")
    && clampCompletion(task.completion) < 100;
}

function taskCountsAsCompleted(task) {
  const stateValue = taskStateValue(task);
  const projection = taskLifecycleProjection(task);
  return ["finalized", "done", "soft-deleted-superseded"].includes(stateValue)
    || String(projection.closeoutStatus || "") === "closed"
    || String(projection.lifecycleState || "") === "closed";
}

function taskIsNonActiveQueueWork(task) {
  const stateValue = taskStateValue(task);
  return ["missing-materials", "blocked", "review", "lessons"].includes(stateValue);
}

function taskBriefCard(task, { compact = true } = {}) {
  const doc = taskDocument(task, "brief.md");
  const summaryText = doc ? getBriefSummary(doc.content) : t("missingBriefExplain");
  const stateValue = taskStateValue(task);
  return `<article class="brief-card ${compact ? "compact" : ""}">
    <div class="card-head">
      <div>
        <a href="#/tasks/${encodeURIComponent(task.id)}">${escapeHtml(task.title)}</a>
        <p>${escapeHtml(task.id)}</p>
      </div>
      ${tag(stateValue)}
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

function clampCompletion(value) {
  const number = Number(value) || 0;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function stateToColorVar(state) {
  const map = { active: "--accent", in_progress: "--accent", review: "--accent-2", "missing-materials": "--warn", lessons: "--accent-3", blocked: "--danger", confirmed: "--ok", "confirmed-finalization-pending": "--ok", finalized: "--ok", "soft-deleted-superseded": "--muted", done: "--ok", planned: "--muted", not_started: "--muted", unknown: "--muted" };
  return map[state] || "--muted";
}

function taskLifecycleDisplay(task) {
  const projection = taskLifecycleProjection(task);
  return [projection.lifecycleState, projection.reviewStatus, projection.closeoutStatus].filter(Boolean).map((item) => label(item)).join(" · ");
}

function taskStatRows(tasks) {
  return [
    { state: "active", label: t("active"), className: "active" },
    { state: "missing-materials", label: t("queueMissingMaterials"), className: "missing-materials" },
    { state: "blocked", label: t("queueBlocked"), className: "blocked" },
    { state: "review", label: t("queueReview"), className: "review" },
    { state: "lessons", label: t("queueLessons"), className: "lessons" },
    { state: "finalized", label: label("finalized"), className: "finalized" },
    { state: "soft-deleted-superseded", label: t("queueSoftDeletedSuperseded"), className: "soft-deleted-superseded" },
    { state: "planned", label: t("planned"), className: "planned" },
  ].map((row) => ({
    ...row,
    count: tasks.filter((task) => taskStateValue(task) === row.state).length,
    colorVar: stateToColorVar(row.state),
  })).filter((row) => row.count > 0);
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

function normalCycleTasks() {
  return (bundle.status?.tasks || []).filter((task) => taskInVisibilityScope(task, "active-cycle"));
}

function reviewWorkbenchTasks() {
  return (bundle.status?.tasks || []).filter((task) => taskInVisibilityScope(task, "review-workbench"));
}

function archivedTasks() {
  return (bundle.status?.tasks || []).filter((task) => taskInVisibilityScope(task, "archive-history"));
}

function archiveBucket(task) {
  return task?.archiveMetadata?.["retention bucket"] || task?.archiveMetadata?.["Retention Bucket"] || t("archiveUnclassified");
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
        ${["all", ...taskPrimaryQueueOrder].map((value) => `<option value="${value}" ${state.taskState === value ? "selected" : ""}>${value === "all" ? label(value) : taskQueueFilterLabel(value)}</option>`).join("")}
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
        <button class="layout-btn ${state.taskLayout === "swimlane" ? "active" : ""}" data-layout="swimlane" aria-label="${t("layoutSwimlane")}">
          <svg style="width:12px;height:12px;vertical-align:middle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><path d="M8 4v16"/><path d="M16 4v16"/></svg>
          ${t("layoutSwimlane")}
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
      ${t("showing")} <strong>${filteredCount}</strong> / ${normalCycleTasks().length} ${t("tasks")}
    </div>
  </section>`;
}

function taskStatsCard() {
  const allTasks = normalCycleTasks();
  const avgCompletion = allTasks.length ? clampCompletion(allTasks.reduce((sum, task) => sum + clampCompletion(task.completion), 0) / allTasks.length) : 0;
  return `<section class="sidebar-card">
    <h3>${t("releaseHealth")}</h3>
    <div class="stats-hero-gauge">
      <span class="gauge-percentage">${avgCompletion}%</span>
      <span class="gauge-label">${t("statOverall")}</span>
    </div>
    <div class="stats-breakdown">
      ${taskStatRows(allTasks).map(({ label, colorVar, count }) => {
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
  const allTasks = normalCycleTasks();
  const avgCompletion = allTasks.length ? clampCompletion(allTasks.reduce((sum, task) => sum + clampCompletion(task.completion), 0) / allTasks.length) : 0;

  return `<section class="task-stats-bar">
    <div class="stat-chip">
      <span class="stat-value">${allTasks.length}</span>
      <span class="stat-label">${t("statTotal")}</span>
    </div>
    ${taskStatRows(allTasks).map((row) => `<div class="stat-chip ${escapeAttr(row.className)}" style="--stat-color: var(${row.colorVar})">
      <span class="stat-value">${row.count}</span>
      <span class="stat-label">${escapeHtml(row.label)}</span>
    </div>`).join("")}
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
  const materials = taskMaterialsView(task);
  const briefReady = materials.briefReady === true;
  const mapReady = materials.visualMapReady === true;
  const briefLabel = briefReady ? t("briefReady") : t("briefMissing");
  const mapLabel = mapReady ? t("mapReady") : t("mapMissing");
  const moduleLabel = taskModuleLabel(task);
  const lifecycle = taskLifecycleDisplay(task);
  const stateValue = taskStateValue(task);

  return `<article class="task-row-card" data-open-drawer="${escapeAttr(task.id)}" style="--row-accent: var(${stateToColorVar(stateValue)})">
    <div class="row-accent-bar"></div>
    <div class="row-main">
      <div class="row-title-line">
        <strong>${escapeHtml(task.title)}</strong>
        ${taskCopyButton(task, "row-copy")}
      </div>
      <span class="row-meta">${escapeHtml(task.id)} · ${escapeHtml(moduleLabel)}${lifecycle ? ` · ${escapeHtml(lifecycle)}` : ""}</span>
    </div>
    <div class="row-status">${tag(stateValue)}</div>
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
  const swimlane = state.taskLayout === "swimlane";

  return `<div class="tasks-grid">
    <div class="tasks-main stack">
      ${taskStatsBar()}
      ${swimlane ? taskSwimlane(tasks) : visibleGroups.map(([group, groupTasks]) => taskGroup(group, groupTasks)).join("")}
      ${swimlane || groupPageCount <= 1 ? "" : `<section class="group-pager">
        <span>${t("showingGroups")} ${visibleGroups.length ? (groupPage - 1) * taskGroupsPerPage + 1 : 0}-${Math.min(groupPage * taskGroupsPerPage, orderedGroups.length)} / ${orderedGroups.length}</span>
        ${pager("task-groups", groupPage, groupPageCount)}
      </section>`}
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
    return groupBy(tasks, (task) => `state:${taskStateValue(task)}`);
  }
  return groupBy(tasks, (task) => {
    const stateValue = taskStateValue(task);
    if (taskPrimaryQueueOrder.includes(stateValue) && !["finalized", "soft-deleted-superseded"].includes(stateValue)) return stateValue;
    if (taskMaterialsView(task).briefReady === true) return "brief-ready";
    const match = task.shortId?.match(/^(\d{4}-\d{2})/);
    return match ? `legacy:${match[1]}` : stateValue || "unknown";
  });
}

function taskGroup(group, tasks) {
  const orderedTasks = sortTasksByTime(tasks);
  const pageCount = Math.max(1, Math.ceil(orderedTasks.length / taskPageSize));
  const page = Math.min(Math.max(1, Number(state.taskPageByGroup[group]) || 1), pageCount);
  const start = (page - 1) * taskPageSize;
  const visibleTasks = orderedTasks.slice(start, start + taskPageSize);
  const avgCompletion = orderedTasks.length ? clampCompletion(orderedTasks.reduce((sum, task) => sum + clampCompletion(task.completion), 0) / orderedTasks.length) : 0;
  const groupContext = taskGroupContext(group, orderedTasks);

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
          <p class="eyebrow">${escapeHtml(groupContext.eyebrow)}</p>
          <h2>${escapeHtml(groupContext.title)}</h2>
          <p class="subtle">${escapeHtml(groupContext.summary)} · ${t("showing")} ${Math.min(start + 1, orderedTasks.length)}-${Math.min(start + visibleTasks.length, orderedTasks.length)} / ${orderedTasks.length}</p>
          ${groupContext.chips.length ? `<div class="module-chip-row">${groupContext.chips.map((chip) => `<span class="module-chip">${escapeHtml(chip)}</span>`).join("")}</div>` : ""}
        </div>
        <div class="group-actions">
          <div class="group-progress" aria-label="${escapeAttr(t("groupCompletion"))}">
            <div class="group-progress-track"><div class="group-progress-fill" style="width:${avgCompletion}%"></div></div>
            <span>${avgCompletion}%</span>
          </div>
          ${pageCount > 1 ? pager("task", page, pageCount, group) : ""}
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
  const stateValue = taskStateValue(task);
  const stateColor = stateToColorVar(stateValue);
  const materials = taskMaterialsView(task);
  const briefReady = materials.briefReady === true;
  const mapReady = materials.visualMapReady === true;
  const briefLabel = briefReady ? t("briefReady") : t("briefMissing");
  const mapLabel = mapReady ? t("mapReady") : t("mapMissing");
  const lifecycle = taskLifecycleDisplay(task);

  return `<article class="task-card" data-open-drawer="${escapeAttr(task.id)}" style="--row-accent: var(${stateColor})">
    <div class="card-header">
      <span class="card-id">${escapeHtml(task.id)}</span>
      <div class="card-header-actions">
        ${taskCopyButton(task, "compact")}
        ${tag(stateValue)}
      </div>
    </div>
    <h4 class="card-title" title="${escapeAttr(task.title)}">${escapeHtml(task.title)}</h4>
    <div class="card-meta">
      <span class="meta-module" title="${escapeAttr(taskModuleKey(task))}">
        <svg style="width:12px;height:12px;vertical-align:middle;margin-right:2px" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        ${escapeHtml(taskModuleLabel(task))}
      </span>
      ${lifecycle ? `<span class="meta-lifecycle" title="${escapeAttr(lifecycle)}">${escapeHtml(lifecycle)}</span>` : ""}
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
  if (["missing-materials", "blocked", "review", "lessons", "finalized", "soft-deleted-superseded"].includes(group)) return taskQueueFilterLabel(group);
  if (group === "brief-ready") return t("briefReadyGroup");
  if (group.startsWith("legacy:")) return `${t("legacyMonth")} ${group.slice("legacy:".length)}`;
  if (group.startsWith("module:")) return taskGroupContext(group, []).title;
  if (group.startsWith("month:")) return `${t("legacyMonth")} ${group.slice("month:".length)}`;
  if (group.startsWith("state:")) return `${t("columnState")} · ${label(group.slice("state:".length))}`;
  return label(group);
}

function filteredTasks() {
  const query = state.query.trim().toLowerCase();
  return sortTasksByTime(normalCycleTasks().filter((task) => {
    const stateValue = taskStateValue(task);
    const stateMatch = state.taskState === "all" || stateValue === state.taskState;
    if (!stateMatch) return false;
    if (!query) return true;
    return [task.id, task.shortId, task.title, taskModuleKey(task), taskModuleLabel(task), stateValue, ...taskQueueValues(task)].some((value) => String(value || "").toLowerCase().includes(query));
  }));
}

function taskModuleKey(task) {
  return task.module || task.inferredModule || "legacy-unclassified";
}

function taskModuleDisplayLabel(key) {
  if (key === "base") return t("baseModule");
  if (key === "legacy-unclassified") return t("unclassifiedModule");
  return key;
}

function archiveView() {
  const tasks = sortTasksByTime(archivedTasks());
  const groups = Object.entries(groupBy(tasks, archiveBucket)).sort(([left], [right]) => left.localeCompare(right));
  return `<main class="stack archive-view">
    <section class="flow-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t("archive")}</p>
          <h2>${t("archiveView")}</h2>
          <p class="subtle">${t("archiveSubtitle")}</p>
        </div>
        <a href="#/tasks">${t("openTaskIndex")}</a>
      </div>
      <div class="archive-summary-grid">
        ${metric(t("archivedTasks"), tasks.length)}
        ${metric(t("archiveBuckets"), groups.length)}
      </div>
    </section>
    ${groups.map(([bucket, bucketTasks]) => archiveGroup(bucket, bucketTasks)).join("") || emptyState(t("noArchivedTasks"))}
  </main>`;
}

function archiveGroup(bucket, tasks) {
  const orderedTasks = sortTasksByTime(tasks);
  return `<section class="archive-group">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(bucket)}</h2>
        <p class="subtle">${orderedTasks.length} ${t("tasks")}</p>
      </div>
    </div>
    <div class="archive-task-list">
      ${orderedTasks.map(archiveTaskRow).join("")}
    </div>
  </section>`;
}

function archiveTaskRow(task) {
  const archiveMetadata = task.archiveMetadata || {};
  const archivedBy = archiveMetadata?.["archived by"] || t("unknown");
  const archivedAt = archiveMetadata?.["archived at"] || "";
  const reviewConfirmedBy = archiveMetadata?.["review confirmed by"] || t("unknown");
  const reviewConfirmedAt = archiveMetadata?.["review confirmed at"] || "";
  const reviewConfirmationId = archiveMetadata?.["review confirmation id"] || "";
  const releasePackage = archiveMetadata?.["release package"] || "";
  const reason = task.deleteReason || archiveMetadata?.reason || "";
  return `<article class="archive-task-row">
    <div class="archive-task-main">
      <a href="#/tasks/${encodeURIComponent(task.id)}">${escapeHtml(task.title || task.id)}</a>
      <span>${escapeHtml(task.id)}</span>
      ${reason ? `<p>${escapeHtml(reason)}</p>` : ""}
    </div>
    <dl class="archive-meta-grid">
      <div><dt>${t("archivedBy")}</dt><dd>${escapeHtml(archivedBy)}</dd></div>
      <div><dt>${t("archivedAt")}</dt><dd>${escapeHtml(archivedAt || t("unknown"))}</dd></div>
      <div><dt>${t("reviewConfirmedBy")}</dt><dd>${escapeHtml(reviewConfirmedBy)}</dd></div>
      <div><dt>${t("reviewConfirmedAt")}</dt><dd>${escapeHtml(reviewConfirmedAt || t("unknown"))}</dd></div>
      ${reviewConfirmationId ? `<div><dt>${t("reviewConfirmationId")}</dt><dd>${escapeHtml(reviewConfirmationId)}</dd></div>` : ""}
      ${releasePackage ? `<div><dt>${t("releasePackage")}</dt><dd>${escapeHtml(releasePackage)}</dd></div>` : ""}
    </dl>
  </article>`;
}

const swimlaneStageOrder = [
  ["active", "active"],
  ["planned", "planned"],
  ["missing-materials", "queueMissingMaterials"],
  ["blocked", "queueBlocked"],
  ["review", "queueReview"],
  ["lessons", "queueLessons"],
  ["finalized", "state_finalized"],
  ["soft-deleted-superseded", "queueSoftDeletedSuperseded"],
];
const swimlaneCellPageSize = 10;
const swimlaneMiniColumnLimit = 5;

function taskSwimlaneModel(tasks) {
  const cards = sortTasksByTime(tasks)
    .filter((task) => taskVisibleInSwimlane(task))
    .map((task) => {
      const swimlane = taskSwimlaneProjection(task);
      if (!swimlane.rowKey || !swimlane.columnKey) return null;
      const lane = swimlane.rowKey;
      const stage = swimlane.columnKey;
      return {
        task,
        lane,
        stage,
        id: task.id,
        title: task.title,
        reason: taskSwimlaneReason(task),
      };
    })
    .filter(Boolean);
  const laneKeys = [...new Set(cards.map((card) => card.lane))].sort((left, right) => {
    if (left === "legacy-unclassified") return 1;
    if (right === "legacy-unclassified") return -1;
    return left.localeCompare(right);
  });
  return {
    stages: swimlaneStageOrder.map(([key, labelKey]) => ({ key, label: t(labelKey) })),
    lanes: laneKeys.map((key) => ({ key, label: taskModuleDisplayLabel(key) })),
    cards,
  };
}

function taskVisibleInSwimlane(task) {
  const swimlane = taskSwimlaneProjection(task);
  if (typeof swimlane.visible === "boolean") return swimlane.visible;
  return false;
}

function taskSwimlaneStage(task) {
  const swimlane = taskSwimlaneProjection(task);
  if (swimlane.columnKey) return swimlane.columnKey;
  return "";
}

function taskSwimlaneProjection(task) {
  const view = taskDashboardTaskView(task);
  return view?.swimlane && typeof view.swimlane === "object" ? view.swimlane : {};
}

function taskNeedsEvidence(task) {
  const view = taskDashboardTaskView(task);
  if (typeof view.needsEvidence === "boolean") return view.needsEvidence;
  return false;
}

function taskSwimlaneReason(task) {
  const view = taskDashboardTaskView(task);
  if (view.reasonMessage) return view.reasonMessage;
  if (view.reasonCode === "needs-evidence") return t("swimlaneNeedsEvidence");
  if (view.reasonCode === "ready-to-confirm") return t("swimlaneReadyToConfirm");
  if (view.reasonCode === "needs-closeout") return t("swimlaneNeedsCloseout");
  const reasons = taskQueueReasonSummaries(task);
  if (reasons.length) return reasons[0].message || reasons[0].code || reasons[0].queue || "";
  if (taskNeedsEvidence(task)) return t("swimlaneNeedsEvidence");
  return "";
}

function taskSwimlane(tasks) {
  const model = taskSwimlaneModel(tasks);
  if (!model.cards.length) return `<section class="task-swimlane empty-state">${escapeHtml(t("swimlaneEmpty"))}</section>`;
  const view = taskSwimlaneHeatmapModel(model);
  const active = taskSwimlaneActiveExpansion(view);
  return `<section class="task-swimlane" aria-label="${escapeAttr(t("layoutSwimlane"))}">
    <div class="swimlane-header">
      <div>
        <p class="eyebrow">${t("swimlaneEyebrow")}</p>
        <h2>${t("swimlaneTitle")}</h2>
      </div>
      <span class="subtle">${model.cards.length} · ${t("tasks")}</span>
    </div>
    ${taskSwimlaneHeatmap(view, active)}
    ${taskSwimlaneMobileList(view, active)}
    ${taskSwimlaneDrilldown(view, active)}
  </section>`;
}

function taskSwimlaneHeatmapModel(model) {
  const stageTotals = Object.fromEntries(model.stages.map((stage) => [stage.key, 0]));
  const lanes = taskSwimlaneRenderLanes(model).map((lane) => {
    const stageCards = Object.fromEntries(model.stages.map((stage) => [stage.key, []]));
    for (const card of model.cards) {
      if (card.lane !== lane.key) continue;
      stageCards[card.stage] = stageCards[card.stage] || [];
      stageCards[card.stage].push(card);
      stageTotals[card.stage] = (stageTotals[card.stage] || 0) + 1;
    }
    const total = Object.values(stageCards).reduce((sum, cards) => sum + cards.length, 0);
    return { ...lane, total, stageCards };
  }).sort((left, right) => {
    if (left.key === "legacy-unclassified") return 1;
    if (right.key === "legacy-unclassified") return -1;
    const totalDiff = right.total - left.total;
    return totalDiff || left.label.localeCompare(right.label);
  });
  const total = model.cards.length;
  const columnTemplate = model.stages.map((stage) => {
    const count = stageTotals[stage.key] || 0;
    if (count === 0) return "minmax(44px, 0.36fr)";
    if (count <= 3) return "minmax(74px, 0.7fr)";
    if (count <= 7) return "minmax(88px, 1fr)";
    return "minmax(104px, 1.16fr)";
  }).join(" ");
  return { stages: model.stages, lanes, stageTotals, total, columnTemplate };
}

function taskSwimlaneRenderLanes(model) {
  const lanes = new Map(model.lanes.map((lane) => [lane.key, { ...lane }]));
  const modules = typeof dashboardModules === "function" ? dashboardModules() : [];
  for (const module of modules) {
    const key = String(module.key || "").trim();
    if (!key || key === "legacy-unclassified") continue;
    const label = key === "base" ? taskModuleDisplayLabel(key) : String(module.title || taskModuleDisplayLabel(key) || key);
    lanes.set(key, { ...(lanes.get(key) || { key }), key, label });
  }
  return [...lanes.values()];
}

function taskSwimlaneHeatmap(view, active) {
  const style = `--swimlane-stage-columns: ${escapeAttr(view.columnTemplate)}`;
  return `<div class="swimlane-heatmap" data-swimlane-heatmap="true" style="${style}" aria-label="${escapeAttr(t("swimlaneHeatmapLabel"))}">
    <div class="swimlane-heatmap-row swimlane-heatmap-head">
      <div class="swimlane-axis-label">${escapeHtml(t("swimlaneModuleColumn"))}</div>
      ${view.stages.map((stage) => {
        const total = view.stageTotals[stage.key] || 0;
        return `<div class="swimlane-stage-header" data-swimlane-stage-total="${escapeAttr(stage.key)}" data-total="${total}">
          <span>${escapeHtml(stage.label)}</span>
          <strong>${total}</strong>
        </div>`;
      }).join("")}
      <div class="swimlane-total-header">${escapeHtml(t("swimlaneTotalColumn"))}</div>
    </div>
    ${view.lanes.map((lane) => taskSwimlaneHeatmapRow(lane, view, active)).join("")}
  </div>`;
}

function taskSwimlaneHeatmapRow(lane, view, active) {
  const laneActive = active?.mode === "lane" && active.lane === lane.key;
  return `<div class="swimlane-heatmap-row" data-swimlane-row="${escapeAttr(lane.key)}" data-swimlane-row-total="${lane.total}">
    <button class="swimlane-lane-button ${laneActive ? "active" : ""}" type="button" data-swimlane-expand="lane" data-lane="${escapeAttr(lane.key)}" aria-expanded="${laneActive ? "true" : "false"}" aria-controls="swimlane-drilldown-panel">
      <strong>${escapeHtml(lane.label)}</strong>
      <span>${lane.total}</span>
    </button>
    ${view.stages.map((stage) => taskSwimlaneHeatmapCell(lane, stage, active)).join("")}
    <div class="swimlane-row-total"><strong>${lane.total}</strong></div>
  </div>`;
}

function taskSwimlaneHeatmapCell(lane, stage, active) {
  const cards = lane.stageCards[stage.key] || [];
  const count = cards.length;
  const cellActive = active?.mode === "cell" && active.lane === lane.key && active.stage === stage.key;
  const disabled = count === 0 ? " disabled" : "";
  const label = `${lane.label} · ${stage.label} · ${count} ${t("tasks")}`;
  return `<button class="swimlane-heat-cell heat-${taskSwimlaneHeatLevel(count)} ${cellActive ? "active" : ""}" type="button" data-swimlane-expand="cell" data-lane="${escapeAttr(lane.key)}" data-swimlane-stage="${escapeAttr(stage.key)}" data-count="${count}" aria-label="${escapeAttr(label)}" aria-expanded="${cellActive ? "true" : "false"}" aria-controls="swimlane-drilldown-panel"${disabled}>
    <span>${count}</span>
  </button>`;
}

function taskSwimlaneMobileList(view, active) {
  return `<div class="swimlane-mobile-list" aria-label="${escapeAttr(t("swimlaneHeatmapLabel"))}">
    ${view.lanes.map((lane) => {
      const laneActive = active?.mode === "lane" && active.lane === lane.key;
      return `<button class="swimlane-mobile-module ${laneActive ? "active" : ""}" type="button" data-swimlane-expand="lane" data-lane="${escapeAttr(lane.key)}" aria-expanded="${laneActive ? "true" : "false"}" aria-controls="swimlane-drilldown-panel">
        <span><strong>${escapeHtml(lane.label)}</strong><small>${lane.total} · ${t("tasks")}</small></span>
        <span class="swimlane-mobile-stages">${view.stages.map((stage) => {
          const count = (lane.stageCards[stage.key] || []).length;
          return count ? `<em>${escapeHtml(stage.label)} ${count}</em>` : "";
        }).join("")}</span>
      </button>`;
    }).join("")}
  </div>`;
}

function taskSwimlaneDrilldown(view, active) {
  if (!active) return `<div class="swimlane-drilldown-host" data-swimlane-drilldown-host="true"></div>`;
  const lane = view.lanes.find((candidate) => candidate.key === active.lane);
  if (!lane) return `<div class="swimlane-drilldown-host" data-swimlane-drilldown-host="true"></div>`;
  const cards = active.mode === "cell" ? (lane.stageCards[active.stage] || []) : Object.values(lane.stageCards).flat();
  const title = active.mode === "cell"
    ? `${lane.label} · ${view.stages.find((stage) => stage.key === active.stage)?.label || active.stage}`
    : lane.label;
  return `<div class="swimlane-drilldown-host open" data-swimlane-drilldown-host="true">
    <section class="swimlane-drilldown" id="swimlane-drilldown-panel" aria-label="${escapeAttr(t("swimlaneDrilldownLabel"))}">
      <div class="swimlane-drilldown-head">
        <div>
          <p class="eyebrow">${escapeHtml(t("swimlaneDrilldownLabel"))}</p>
          <h3>${escapeHtml(title)}</h3>
        </div>
        <div class="swimlane-drilldown-actions">
          <span>${cards.length} · ${t("tasks")}</span>
          <button type="button" data-swimlane-collapse>${escapeHtml(t("swimlaneCollapse"))}</button>
        </div>
      </div>
      ${active.mode === "lane" ? taskSwimlaneLaneBoard(lane, view.stages) : taskSwimlanePagedCardList(cards, active.page || 0)}
    </section>
  </div>`;
}

function taskSwimlaneLaneBoard(lane, stages) {
  return `<div class="swimlane-mini-board">
    ${stages.map((stage) => {
      const cards = lane.stageCards[stage.key] || [];
      const visibleCards = cards.slice(0, swimlaneMiniColumnLimit);
      const hidden = Math.max(0, cards.length - visibleCards.length);
      return `<div class="swimlane-mini-column">
        <div class="swimlane-mini-column-head"><span>${escapeHtml(stage.label)}</span><strong>${cards.length}</strong></div>
        <div class="swimlane-card-list">${visibleCards.map((card) => taskSwimlaneCard(card)).join("") || `<span class="swimlane-mini-empty">${escapeHtml(t("none"))}</span>`}</div>
        ${hidden ? `<button class="swimlane-stage-drilldown" type="button" data-swimlane-expand="cell" data-swimlane-stage-drilldown="${escapeAttr(stage.key)}" data-lane="${escapeAttr(lane.key)}" data-swimlane-stage="${escapeAttr(stage.key)}">
          <span>+${hidden}</span>
          <strong>${escapeHtml(t("swimlaneViewStage"))}</strong>
        </button>` : ""}
      </div>`;
    }).join("")}
  </div>`;
}

function taskSwimlanePagedCardList(cards, page) {
  const total = cards.length;
  const pageCount = Math.max(1, Math.ceil(total / swimlaneCellPageSize));
  const safePage = Math.max(0, Math.min(pageCount - 1, Number(page) || 0));
  const start = safePage * swimlaneCellPageSize;
  const end = Math.min(total, start + swimlaneCellPageSize);
  const visibleCards = cards.slice(start, end);
  return `<div class="swimlane-paged-list">
    <div class="swimlane-card-list">${visibleCards.map((card) => taskSwimlaneCard(card)).join("")}</div>
    ${total > swimlaneCellPageSize ? `<div class="swimlane-pager" data-swimlane-page="${safePage}" aria-label="${escapeAttr(t("swimlanePageLabel"))}">
      <button type="button" data-swimlane-page-action="prev" data-page="${safePage - 1}" ${safePage <= 0 ? "disabled" : ""}>${escapeHtml(t("swimlanePrevPage"))}</button>
      <span>${start + 1}-${end} / ${total}</span>
      <button type="button" data-swimlane-page-action="next" data-page="${safePage + 1}" ${safePage >= pageCount - 1 ? "disabled" : ""}>${escapeHtml(t("swimlaneNextPage"))}</button>
    </div>` : ""}
  </div>`;
}

function taskSwimlaneCard(card) {
  const task = card.task;
  const completion = clampCompletion(task.completion);
  return `<article class="swimlane-card ${escapeAttr(card.stage)}" data-open-drawer="${escapeAttr(task.id)}" style="--row-accent: var(${stateToColorVar(taskStateValue(task))}); --task-progress: ${completion}%">
    <span class="swimlane-status-dot" aria-hidden="true"></span>
    <strong>${escapeHtml(task.title)}</strong>
    <span class="swimlane-progress" aria-label="${completion}%"><i></i></span>
  </article>`;
}

function taskSwimlaneHeatLevel(count) {
  if (count <= 0) return 0;
  if (count <= 3) return 1;
  if (count <= 7) return 2;
  return 3;
}

function taskSwimlaneActiveExpansion(view) {
  if (!swimlaneExpansion) return null;
  const lane = view.lanes.find((candidate) => candidate.key === swimlaneExpansion.lane);
  if (!lane) return null;
  if (swimlaneExpansion.mode === "cell" && !view.stages.some((stage) => stage.key === swimlaneExpansion.stage)) return null;
  if (swimlaneExpansion.mode !== "cell") return swimlaneExpansion;
  const count = (lane.stageCards[swimlaneExpansion.stage] || []).length;
  const pageCount = Math.max(1, Math.ceil(count / swimlaneCellPageSize));
  const page = Math.max(0, Math.min(pageCount - 1, Number(swimlaneExpansion.page) || 0));
  return { ...swimlaneExpansion, page };
}

let swimlaneExpansion = null;

if (typeof window !== "undefined" && typeof document !== "undefined" && typeof document.addEventListener === "function" && !window.__HARNESS_SWIMLANE_BOUND__) {
  window.__HARNESS_SWIMLANE_BOUND__ = true;
  document.addEventListener("click", (event) => {
    const collapse = event.target.closest?.("[data-swimlane-collapse]");
    const pager = event.target.closest?.("[data-swimlane-page-action]");
    const trigger = event.target.closest?.("[data-swimlane-expand]");
    if (!collapse && !pager && !trigger) return;
    event.preventDefault();
    if (collapse) {
      swimlaneExpansion = null;
      app();
      return;
    }
    if (pager && swimlaneExpansion?.mode === "cell") {
      swimlaneExpansion = { ...swimlaneExpansion, page: Number(pager.dataset.page) || 0 };
      app();
      return;
    }
    const mode = trigger.dataset.swimlaneExpand;
    const lane = trigger.dataset.lane;
    const stage = trigger.dataset.swimlaneStage || "";
    const same = swimlaneExpansion?.mode === mode && swimlaneExpansion?.lane === lane && (swimlaneExpansion?.stage || "") === stage;
    swimlaneExpansion = same ? null : { mode, lane, stage, page: 0 };
    app();
  });
}

function taskLifecycleProjection(task) {
  return task?.taskLifecycleProjection || task?.semanticProjection?.taskLifecycleProjection || {};
}

function taskReviewProjection(task) {
  return task?.reviewWorkbenchQueueView || task?.semanticProjection?.reviewWorkbenchQueueView || {};
}

const taskPrimaryQueueOrder = ["blocked", "missing-materials", "review", "lessons", "finalized", "soft-deleted-superseded", "active", "planned"];

function taskQueueFilterLabel(queue) {
  const labels = {
    active: t("active"),
    "missing-materials": t("queueMissingMaterials"),
    blocked: t("queueBlocked"),
    review: t("queueReview"),
    lessons: t("queueLessons"),
    finalized: label("finalized"),
    "soft-deleted-superseded": t("queueSoftDeletedSuperseded"),
    planned: t("planned"),
  };
  return labels[queue] || label(queue);
}

function taskPrimaryQueueValue(task) {
  const reviewProjection = taskReviewProjection(task);
  const lifecycleProjection = taskLifecycleProjection(task);
  if (reviewProjection.primaryQueue) return reviewProjection.primaryQueue;
  const queues = Array.isArray(reviewProjection.queues)
    ? reviewProjection.queues
    : Array.isArray(lifecycleProjection.taskQueues)
      ? lifecycleProjection.taskQueues
      : [];
  return taskPrimaryQueueOrder.find((queue) => queues.includes(queue)) || queues[0] || "unknown";
}

function taskStateValue(task) {
  return taskPrimaryQueueValue(task);
}

function taskRawStateValue(task) {
  const projection = taskLifecycleProjection(task);
  return projection.state || task?.state || "unknown";
}

function taskQueueValues(task) {
  const projection = taskLifecycleProjection(task);
  return Array.isArray(projection.taskQueues) ? projection.taskQueues : [];
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
    <section class="detail-grid ${state.detailSideCollapsed ? "side-collapsed" : ""}">
      <article class="detail-main">
        ${taskDocumentLibrary(task, route.doc)}
      </article>
      <aside class="detail-side ${state.detailSideCollapsed ? "collapsed" : ""}">
        <button type="button" class="detail-side-toggle" data-detail-side-toggle aria-expanded="${state.detailSideCollapsed ? "false" : "true"}">${escapeHtml(state.detailSideCollapsed ? t("expandSidePanel") : t("collapseSidePanel"))}</button>
        ${reviewActionPanel(task, { mode: "summary" })}
        ${lessonCandidatePanel(task, { context: "detail" })}
        ${openFindings(task)}
        ${evidenceList(task)}
      </aside>
    </section>
  </main>`;
}

function taskStateSummary(task) {
  const lifecycle = taskLifecycleProjection(task);
  const queues = Array.isArray(lifecycle.taskQueues) ? lifecycle.taskQueues : [];
  return `<section class="task-state-summary">
    <div>
      <span>${t("legacyState")}</span>
      ${tag(taskRawStateValue(task))}
    </div>
    <div>
      <span>${t("lifecycleState")}</span>
      ${tag(lifecycle.lifecycleState || "unknown")}
    </div>
    <div>
      <span>${t("reviewStatus")}</span>
      ${tag(lifecycle.reviewStatus || "missing")}
    </div>
    <div>
      <span>${t("sedimentationStatus")}</span>
      ${tag(task.lessonCandidateStatus || "missing")}
    </div>
    <div>
      <span>${t("closeoutStatus")}</span>
      ${tag(lifecycle.closeoutStatus || "missing")}
    </div>
    <div>
      <span>${t("lifecycleQueues")}</span>
      ${queues.map(tag).join("") || tag("unknown")}
    </div>
    ${taskQueueReasonSummary(task)}
  </section>`;
}

function taskQueueReasonSummary(task) {
  const reasons = taskQueueReasonSummaries(task);
  if (!reasons.length) return "";
  return `<div class="task-queue-reasons">
    <span>${t("queueReasons")}</span>
    <div class="review-reasons">
      ${reasons.slice(0, 5).map(reviewReason).join("")}
    </div>
  </div>`;
}

function taskQueueReasonSummaries(task) {
  const projection = taskReviewWorkbenchQueueView(task);
  return Array.isArray(projection.reasonSummaries) ? projection.reasonSummaries.filter(Boolean) : [];
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
      return `<div class="phase-kind-group ${escapeAttr(kind)}" role="list">
        <h3>${escapeHtml(label)}</h3>
        <div class="phase-lane">${items.map(phaseStep).join("")}</div>
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
  const detail = phase.output || phase.blockingRisk || phase.state || "";
  return `<details class="phase-step ${escapeAttr(phase.state)} ${escapeAttr(phaseKindClass)}" role="listitem">
    <summary class="phase-step-head">
      <strong>${escapeHtml(phase.id)}</strong>
      <span>${kindLabel} · ${phase.completion}%</span>
    </summary>
    ${progressBar(phase.completion)}
    <div class="phase-meta">
      ${phaseMetaTag(actor)}
      ${tag(phase.evidenceStatus || "missing")}
    </div>
    <p>${escapeHtml(detail)}</p>
    ${phase.exitCommand ? `<code class="phase-exit-command">${escapeHtml(phase.exitCommand)}</code>` : ""}
  </details>`;
}

function phaseMetaTag(value) {
  return `<span class="tag">${escapeHtml(String(value || "unknown").replaceAll("_", " "))}</span>`;
}

function taskDocSection(task, fileName, title, required) {
  const doc = projectedTaskDocument(task, fileName);
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
  const selected = docs.find((doc) => doc.key === selectedKey) || docs[0];
  const groups = taskDocumentGroups(task, docs);
  return `<section class="doc-library ${state.detailDocsCollapsed ? "docs-collapsed" : ""}">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("taskDocuments")}</p>
        <h2>${escapeHtml(t("sourceDocuments"))}</h2>
      </div>
      <div class="section-actions">
        <button type="button" data-detail-docs-toggle aria-expanded="${state.detailDocsCollapsed ? "false" : "true"}">${escapeHtml(state.detailDocsCollapsed ? t("expandDocumentNav") : t("collapseDocumentNav"))}</button>
        <button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button>
      </div>
    </div>
    <div class="doc-workbench ${state.detailDocsCollapsed ? "docs-collapsed" : ""}">
      <nav class="doc-workbench-nav" aria-label="${escapeAttr(t("sourceDocuments"))}">
        ${groups.map((group) => documentGroupNav(task, group, selectedKey)).join("")}
      </nav>
      ${documentReader(selected)}
    </div>
  </section>`;
}

function orderedTaskDocuments(task) {
  const coreDocs = taskDocTabs
    .map(([key, file]) => {
      const doc = projectedTaskDocument(task, file);
      if (doc) return { key, file, title: t(key), path: doc.path, content: doc.content };
      if (key === "brief") return { key, file, title: t(key), path: `${task.path}/brief.md`, content: generatedBrief(task), generated: true };
      return null;
    })
    .filter(Boolean);
  const seen = new Set(coreDocs.map((doc) => doc.path));
  const materialDocs = taskProjectionDocuments(task).filter((doc) => {
    if (seen.has(doc.path)) return false;
    seen.add(doc.path);
    return true;
  });
  const docs = [...coreDocs, ...materialDocs];
  const priority = taskDocumentPriority(task);
  const rank = new Map(priority.map((key, index) => [key, index]));
  return docs.sort((a, b) => {
    const rankDelta = (rank.get(documentPriorityKey(a)) ?? 99) - (rank.get(documentPriorityKey(b)) ?? 99);
    if (rankDelta) return rankDelta;
    return String(a.key).localeCompare(String(b.key));
  });
}

function projectedTaskDocument(task, fileName) {
  const projection = taskDocumentProjection(task);
  if (fileName === "__walkthrough__") return projection["walkthrough.md"] || null;
  return projection[fileName] || null;
}

function taskProjectionDocuments(task) {
  const projection = taskDocumentProjection(task);
  return Object.entries(projection)
    .filter(([, doc]) => doc?.path)
    .map(([key, doc]) => ({
      key,
      file: key,
      title: taskMaterialTitle(key, doc),
      path: doc.path,
      content: doc.content,
    }));
}

function taskMaterialTitle(key, doc) {
  if (key === "references/INDEX.md") return t("references");
  if (key === "artifacts/INDEX.md" || key === "artifacts/__dashboard_artifacts.md") return t("artifacts");
  const group = key.startsWith("references/") ? t("references") : key.startsWith("artifacts/") ? t("artifacts") : "Other";
  const name = String(doc?.title || key.split("/").pop() || key).replace(/\.md$/i, "");
  return `${group} · ${name}`;
}

function documentPriorityKey(doc) {
  if (doc.key?.startsWith("references/")) return "references";
  if (doc.key?.startsWith("artifacts/")) return "artifacts";
  return doc.key;
}

function taskDocumentPriority(task) {
  const projection = taskLifecycleProjection(task);
  const primaryQueue = taskPrimaryQueueValue(task);
  const stateName = projection.state || "";
  const lifecycle = projection.lifecycleState || "";
  if (primaryQueue === "missing-materials" || ["planned", "not_started"].includes(stateName) || lifecycle === "ready") {
    return ["brief", "taskPlan", "visualMap", "strategy", "references", "artifacts", "progress", "findings", "review", "walkthrough", "legacyRoadmap"];
  }
  if (primaryQueue === "review" || primaryQueue === "lessons" || stateName === "review" || ["in_review", "review-blocked"].includes(lifecycle)) {
    return ["walkthrough", "lessonCandidates", "review", "findings", "visualMap", "progress", "artifacts", "references", "brief", "taskPlan", "strategy", "longRunningContract", "legacyRoadmap"];
  }
  if (primaryQueue === "active" || primaryQueue === "blocked" || stateName === "in_progress" || lifecycle === "active" || stateName === "blocked" || lifecycle === "blocked") {
    return ["progress", "visualMap", "brief", "taskPlan", "strategy", "findings", "review", "walkthrough", "references", "artifacts", "legacyRoadmap"];
  }
  if (primaryQueue === "finalized" || stateName === "done" || ["closing", "closed", "finalized"].includes(lifecycle)) {
    return ["walkthrough", "lessonCandidates", "review", "artifacts", "references", "progress", "findings", "visualMap", "brief", "taskPlan", "strategy", "legacyRoadmap"];
  }
  return ["brief", "taskPlan", "visualMap", "strategy", "progress", "findings", "review", "walkthrough", "references", "artifacts", "legacyRoadmap"];
}

function defaultTaskDocumentKey(task, docs) {
  const priority = taskDocumentPriority(task);
  return priority.find((key) => docs.some((doc) => doc.key === key)) || docs[0]?.key || "brief";
}

function taskDocumentGroups(task, docs = orderedTaskDocuments(task)) {
  const defaultKey = defaultTaskDocumentKey(task, docs);
  const seen = new Set();
  const pick = (predicate) => docs.filter((doc) => {
    if (seen.has(doc.key) || !predicate(doc)) return false;
    seen.add(doc.key);
    return true;
  });
  const groups = [
    { key: "primary", title: "Primary", docs: pick((doc) => doc.key === defaultKey || doc.key === "brief") },
    { key: "operations", title: "Operations", docs: pick((doc) => ["taskPlan", "visualMap", "strategy", "progress", "longRunningContract", "legacyRoadmap"].includes(doc.key)) },
    { key: "review", title: "Review", docs: pick((doc) => ["findings", "review", "walkthrough", "lessonCandidates"].includes(doc.key)) },
    { key: "references", title: t("references"), docs: pick((doc) => doc.key?.startsWith("references/") || doc.key === "references") },
    { key: "artifacts", title: t("artifacts"), docs: pick((doc) => doc.key?.startsWith("artifacts/") || doc.key === "artifacts") },
    { key: "other", title: "Other projected docs", docs: pick(() => true) },
  ];
  return groups.filter((group) => group.docs.length);
}

function documentGroupNav(task, group, selectedKey) {
  return `<div class="doc-nav-group" data-doc-group="${escapeAttr(group.key)}">
    <h3>${escapeHtml(group.title)}</h3>
    <div class="doc-nav-links">
      ${group.docs.map((doc) => documentNavLink(task, doc, selectedKey)).join("")}
    </div>
  </div>`;
}

function documentNavLink(task, doc, selectedKey) {
  const active = doc.key === selectedKey;
  return `<a class="doc-nav-link ${active ? "active" : ""}" href="#/tasks/${encodeURIComponent(task.id)}/docs/${encodeURIComponent(doc.key)}" title="${escapeAttr(doc.path)}" data-doc-nav-link ${active ? 'aria-current="page"' : ""}>
    <span>${escapeHtml(doc.title)}</span>
    <small>${escapeHtml(doc.generated ? t("generatedFallback") : doc.path)}</small>
  </a>`;
}

function documentReader(doc) {
  if (!doc) return emptyState(t("noDocuments"));
  return `<article class="doc-workbench-reader" tabindex="-1">
    <header class="doc-reader-head">
      <div>
        <h3>${escapeHtml(doc.title)}</h3>
        <p>${escapeHtml(doc.generated ? t("generatedFallback") : doc.path)}</p>
      </div>
    </header>
    <div class="doc-reader-scroll markdown" tabindex="0">${window.HarnessMarkdown.render(doc.content, state.renderMode)}</div>
  </article>`;
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
  const doc = match ? projectedTaskDocument(task, match[1]) : taskDocumentProjection(task)[tab];
  if (!doc) return "";
  return `<section class="doc-section selected-source">
    <div class="section-head"><h2>${t("selectedSource")} · ${escapeHtml(match ? t(match[0]) : taskMaterialTitle(tab, doc))}</h2><button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button></div>
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
  const lifecycle = taskLifecycleProjection(task);
  const reviewView = taskReviewWorkbenchQueueView(task);
  const blocking = reviewView.blocked === true || (task.risks || []).some((risk) => /^P[0-2]$/i.test(risk.severity || "") && (risk.open || risk.blocksRelease));
  const confirmed = reviewView.confirmed === true;
  const readyForCloseout = taskReadyForCloseout(task);
  const hasLessonWork = taskHasPendingLessonWork(task);
  const candidateStatus = task.lessonCandidateStatus || "missing";
  if (mode !== "workspace") {
    const summaryMessage = confirmed && hasLessonWork ? t("reviewConfirmedLessonPending") : confirmed && readyForCloseout ? t("reviewConfirmedCloseoutReady") : confirmed ? t("reviewAlreadyConfirmed") : t("reviewOpenInWorkspace");
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(summaryMessage)}</p>
      <p>${escapeHtml(t("lessonCandidateStatus"))}: ${tag(candidateStatus)}</p>
      <a href="#/review/${encodeURIComponent(task.id)}">${t("openReviewWorkspace")}</a>
    </section>`;
  }
  if (confirmed) {
    if (hasLessonWork) {
      return `<section class="side-panel review-actions">
        <h3>${t("reviewActions")}</h3>
        <p>${escapeHtml(t("reviewConfirmedLessonPending"))}</p>
        <p>${escapeHtml(t("lessonCandidateStatus"))}: ${tag(candidateStatus)}</p>
        ${lessonCandidatePanel(task, { context: "detail", limit: 3 })}
      </section>`;
    }
    const closeoutDisabled = !readyForCloseout || !canUseWorkbenchAction("task-complete");
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(readyForCloseout ? t("reviewConfirmedCloseoutReady") : t("reviewAlreadyConfirmed"))}</p>
      <p>${escapeHtml(t("lessonCandidateStatus"))}: ${tag(candidateStatus)}</p>
      <button data-task-complete="${escapeAttr(task.id)}" ${closeoutDisabled ? "disabled" : ""}>${t("completeTaskCloseout")}</button>
      <div class="review-result" data-task-complete-result="${escapeAttr(task.id)}"></div>
    </section>`;
  }
  if (!canUseWorkbenchAction("review-complete")) {
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(t("staticReadOnlyDetail"))}</p>
    </section>`;
  }
  const missingWalkthrough = task.budget !== "simple" && !task.walkthroughPath;
  const candidateBlocked = task.budget !== "simple" && !task.lessonCandidateDecisionComplete;
  const projectionOwnsConfirmability = typeof reviewView.humanConfirmable === "boolean";
  const queueBlocked = !taskCanBeHumanConfirmed(task);
  const rawMaterialBlocked = projectionOwnsConfirmability ? false : missingWalkthrough || candidateBlocked;
  const disabled = blocking || rawMaterialBlocked || queueBlocked;
  const message = blocking ? t("reviewBlocked") : queueBlocked ? t("reviewQueueRequired") : !projectionOwnsConfirmability && missingWalkthrough ? t("reviewWalkthroughRequired") : !projectionOwnsConfirmability && candidateBlocked ? t("reviewCandidateDecisionRequired") : t("reviewWorkbenchReady");
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
  const view = taskReviewWorkbenchQueueView(task);
  if (typeof view.inQueue === "boolean") return view.inQueue;
  return false;
}

function taskCanBeHumanConfirmed(task) {
  const view = taskReviewWorkbenchQueueView(task);
  if (typeof view.humanConfirmable === "boolean") return view.humanConfirmable;
  return false;
}

function taskHasPendingLessonWork(task) {
  const view = taskReviewWorkbenchQueueView(task);
  if (typeof view.hasPendingLessonWork === "boolean") return view.hasPendingLessonWork;
  return false;
}

function taskReadyForCloseout(task) {
  const view = taskReviewWorkbenchQueueView(task);
  if (typeof view.readyForCloseout === "boolean") return view.readyForCloseout;
  return false;
}

function taskDashboardTaskView(task) {
  return task?.dashboardTaskView || task?.semanticProjection?.dashboardTaskView || {};
}

function taskMaterialsView(task) {
  const view = taskDashboardTaskView(task);
  return view?.materials && typeof view.materials === "object" ? view.materials : {};
}

function taskReviewWorkbenchQueueView(task) {
  return task?.reviewWorkbenchQueueView || task?.semanticProjection?.reviewWorkbenchQueueView || {};
}

function evidenceList(task) {
  const evidence = task.evidence || [];
  return `<section class="side-panel evidence-panel">
    <h3>${t("evidence")}</h3>
    ${evidence.map((item) => `<p><strong>${escapeHtml(item.type || "evidence")}</strong> ${escapeHtml(item.summary || "")}</p>`).join("") || `<p>${t("noEvidence")}</p>`}
  </section>`;
}

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
    active: tasks.filter(taskIsCurrentlyActive).length,
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
  if (taskIsCurrentlyActive(task)) {
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
  const activeTasks = tasks.filter(taskIsCurrentlyActive);
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

function reviewQueue() {
  ensureReviewQueueState();
  const tabs = reviewQueueTabs();
  const activeTab = tabs.find((tab) => tab.id === state.reviewQueueTab) || tabs[0];
  const baseTasks = reviewQueueBaseTasks(activeTab);
  const reasonOptions = reviewReasonOptions(baseTasks);
  normalizeReviewReasonFilter(reasonOptions);
  const tasks = reviewFilteredTasks(baseTasks);
  const confirmableTasks = activeTab.id === "review" ? tasks.filter(taskCanBeHumanConfirmed) : [];
  const allConfirmableTasks = activeTab.id === "review" ? baseTasks.filter(taskCanBeHumanConfirmed) : [];
  syncReviewBulkSelection(allConfirmableTasks);
  if (activeTab.id === "lessons") syncLessonBulkSelection(lessonBulkActionableSelections());
  else syncLessonBulkSelection([]);
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
        ${activeTab.id === "review" ? reviewBulkBar(confirmableTasks) : ""}
        ${activeTab.id === "lessons" ? lessonBulkBar() : ""}
        <div class="review-queue-list-shell" tabindex="0" aria-label="${escapeAttr(activeTab.label)} ${escapeAttr(t("reviewQueue"))}">
          <div class="review-queue-list">
            ${visibleTasks.map((task) => reviewQueueCard(task, activeTab)).join("") || emptyState(t("noQueueTasks"))}
          </div>
        </div>
        <div class="review-queue-pager" ${pageCount <= 1 ? "hidden" : ""}>
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
  return reviewWorkbenchTasks().filter((task) => taskMatchesReviewTab(task, tab));
}

function taskMatchesReviewTab(task, tab) {
  const view = taskReviewWorkbenchQueueView(task);
  const queues = reviewTaskQueues(task);
  if (view.primaryQueue && (tab.queues || []).includes(view.primaryQueue)) return true;
  return (tab.queues || []).some((queue) => queues.includes(queue));
}

function reviewTaskQueues(task) {
  const view = taskReviewWorkbenchQueueView(task);
  if (Array.isArray(view.queues)) return view.queues;
  return [];
}

function reviewReasonOptions(tasks) {
  return [...new Set(tasks.flatMap((task) => {
    const view = taskReviewWorkbenchQueueView(task);
    return (Array.isArray(view.reasonCodes) ? view.reasonCodes : []).filter(Boolean);
  }))].sort();
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
      const view = taskReviewWorkbenchQueueView(task);
      const reasonCodes = Array.isArray(view.reasonCodes) ? view.reasonCodes : [];
      if (reasonFilter !== "all" && !reasonCodes.includes(reasonFilter)) return false;
      if (!query) return true;
      const lifecycle = taskLifecycleProjection(task);
      const queues = reviewTaskQueues(task);
      return [
        task.id,
        task.shortId,
        task.title,
        task.module,
        task.inferredModule,
        lifecycle.state,
        lifecycle.lifecycleState,
        lifecycle.reviewStatus,
        lifecycle.closeoutStatus,
        ...queues,
        ...reasonCodes,
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
  const reasonRank = Math.min(...taskQueueReasonSummaries(task).map((reason) => severityRank[String(reason.severity || "").toUpperCase()] ?? 8), 8);
  const queueRank = { blocked: 0, "missing-materials": 1, review: 2, lessons: 3, confirmed: 4, finalized: 5, "soft-deleted-superseded": 6 };
  const queues = reviewTaskQueues(task);
  const view = taskReviewWorkbenchQueueView(task);
  if (view.primaryQueue && queueRank[view.primaryQueue] !== undefined) return queueRank[view.primaryQueue];
  const taskQueueRank = Math.min(...queues.map((queue) => queueRank[queue] ?? 7), 7);
  return Math.min(reasonRank, taskQueueRank);
}

function reviewTruthyCount(tasks, key) {
  return tasks.filter((task) => {
    const lifecycle = taskLifecycleProjection(task);
    if (key === "materialsReady" && typeof lifecycle.materialsReady === "boolean") return lifecycle.materialsReady;
    if (key === "reviewSubmitted" && typeof lifecycle.reviewSubmitted === "boolean") return lifecycle.reviewSubmitted;
    return false;
  }).length;
}

function reviewBulkSelectedIds() {
  return Object.entries(state.reviewBulkSelection || {})
    .filter(([, selected]) => selected === true)
    .map(([taskId]) => taskId);
}

function syncReviewBulkSelection(confirmableTasks) {
  const allowed = new Set(confirmableTasks.map((task) => task.id));
  for (const taskId of Object.keys(state.reviewBulkSelection || {})) {
    if (!allowed.has(taskId)) delete state.reviewBulkSelection[taskId];
  }
}

function reviewBulkBar(confirmableTasks) {
  const selectedCount = reviewBulkSelectedIds().length;
  const allSelected = confirmableTasks.length > 0 && confirmableTasks.every((task) => state.reviewBulkSelection?.[task.id] === true);
  const disabled = selectedCount === 0 || !canUseWorkbenchAction("review-complete-bulk");
  const result = state.reviewBulkResult ? `<span class="bulk-action-result ${state.reviewBulkResult.ok ? "success" : "failed"}">${escapeHtml(state.reviewBulkResult.message)}</span>` : "";
  return `<div class="bulk-action-bar review-bulk-bar">
    <label class="bulk-select-all">
      <input type="checkbox" data-review-bulk-select-all ${allSelected ? "checked" : ""} ${confirmableTasks.length ? "" : "disabled"} aria-label="${escapeAttr(t("selectAllReviewTasks"))}">
      <span>${t("selectAllReviewTasks")}</span>
    </label>
    <span class="bulk-selected-count">${formatMessage("reviewBulkSelected", { count: selectedCount })}</span>
    <button type="button" data-review-bulk-confirm ${disabled ? "disabled" : ""}>${t("reviewBulkConfirm")}</button>
    <button type="button" data-review-bulk-clear ${selectedCount ? "" : "disabled"}>${t("clearSelection")}</button>
    ${result}
  </div>`;
}

function reviewQueueCard(task, tab) {
  const openMaterial = (task.risks || []).filter((risk) => /^P[0-2]$/i.test(risk.severity || "") && (risk.open || risk.blocksRelease)).length;
  const reasons = taskQueueReasonSummaries(task);
  const lifecycle = taskLifecycleProjection(task);
  const canCopyRepairPrompt = tab?.repair && String(task.repairPrompt || "").trim();
  const lessonActions = tab?.id === "lessons" ? lessonCandidatePanel(task, { context: "card", limit: 2 }) : "";
  const closeoutAction = taskReadyForCloseout(task)
    ? `<button data-task-complete="${escapeAttr(task.id)}" ${canUseWorkbenchAction("task-complete") ? "" : "disabled"}>${t("completeTaskCloseout")}</button><span class="inline-result" data-task-complete-result="${escapeAttr(task.id)}"></span>`
    : "";
  const displayId = task.shortId || taskFolderName(task) || task.id;
  const canBulkConfirm = tab?.id === "review" && taskCanBeHumanConfirmed(task);
  const bulkSelected = state.reviewBulkSelection?.[task.id] === true;
  const bulkControl = tab?.id === "review" ? `<label class="bulk-card-check">
      <input type="checkbox" data-review-bulk-select="${escapeAttr(task.id)}" ${canBulkConfirm ? "" : "disabled"} ${bulkSelected ? "checked" : ""} aria-label="${escapeAttr(t("selectReviewTask"))}">
      <span>${t("select")}</span>
    </label>` : "";
  return `<article class="task-card review-queue-card" style="--row-accent: var(${stateToColorVar(lifecycle.state || taskStateValue(task))})">
    <div class="card-header">
      <span class="card-id" title="${escapeAttr(task.id)}">${escapeHtml(displayId)}</span>
      ${tag(lifecycle.reviewStatus || "missing")}
      ${reviewTaskQueues(task).map(tag).join("")}
      ${bulkControl}
    </div>
    <h4 class="card-title" title="${escapeAttr(task.title)}">${escapeHtml(task.title)}</h4>
    <div class="card-meta">
      <span>${tag(lifecycle.lifecycleState || "unknown")}</span>
      <span>${tag(lifecycle.closeoutStatus || "missing")}</span>
      <span>${openMaterial} ${t("openFindings")}</span>
      <span>${t("reviewSubmitted")}: ${lifecycle.reviewSubmitted === true ? t("yes") : t("no")}</span>
      <span>${t("materialsReady")}: ${lifecycle.materialsReady === true ? t("yes") : t("no")}</span>
    </div>
    <p class="subtle">${escapeHtml(firstUsefulLine(task.summary || task.briefText || ""))}</p>
    ${tombstoneSummary(task)}
    ${reasons.length ? `<div class="review-reasons">${reasons.slice(0, 4).map(reviewReason).join("")}</div>` : ""}
    ${lessonActions}
    <div class="review-queue-actions">
      <a href="#/review/${encodeURIComponent(task.id)}">${t("openReviewWorkspace")}</a>
      <a href="#/tasks/${encodeURIComponent(task.id)}">${t("fullView")}</a>
      <button data-open-drawer="${escapeAttr(task.id)}">${t("viewDetails")}</button>
      ${closeoutAction}
      ${tab?.repair ? `<button data-copy-repair-prompt="${escapeAttr(task.id)}" data-repair-prompt="${escapeAttr(task.repairPrompt || "")}" ${canCopyRepairPrompt ? "" : "disabled"}>${t("copyRepairPrompt")}</button>` : ""}
    </div>
  </article>`;
}

function tombstoneSummary(task) {
  const deletionState = String(task?.deletionState || "active");
  if (deletionState === "active") return "";
  const reason = String(task?.deleteReason || "").trim();
  const supersededBy = String(task?.supersededBy || "").trim();
  return `<div class="review-tombstone-summary">
    <span>${tag(deletionState)}</span>
    ${reason ? `<span>${t("reason")}: ${escapeHtml(reason)}</span>` : ""}
    ${supersededBy ? `<a href="#/tasks/${encodeURIComponent(supersededBy)}">${escapeHtml(supersededBy)}</a>` : ""}
  </div>`;
}

function lessonCandidatePanel(task, { context = "detail", limit = 0 } = {}) {
  const candidates = (task.lessonCandidateRows || []).filter((candidate) => ["ready-for-review", "needs-promotion"].includes(candidate.status));
  if (!candidates.length) return "";
  const visibleCandidates = limit > 0 ? candidates.slice(0, limit) : candidates;
  const hiddenCount = Math.max(0, candidates.length - visibleCandidates.length);
  const staticNote = canUseWorkbenchAction("lesson-sedimentation-task") ? "" : `<p class="lesson-action-note">${escapeHtml(t("lessonWorkbenchRequired"))}</p>`;
  syncLessonBulkSelection(lessonBulkActionableSelections());
  const bulkBar = context === "card" ? "" : lessonBulkBar();
  return `<section class="lesson-candidate-panel ${context === "card" ? "compact" : ""}">
    <div class="lesson-candidate-panel-head">
      <div>
        <p class="eyebrow">${t("lessonCandidates")}</p>
        <h3>${t("lessonSedimentationActions")}</h3>
      </div>
      <span class="tag">${visibleCandidates.length}/${candidates.length}</span>
    </div>
    ${staticNote}
    ${bulkBar}
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
  const selectionKey = lessonBulkSelectionKey(task.id, candidate.id);
  const canBulkCreate = canUseWorkbenchAction("lesson-sedimentation-bulk") && !hasFollowUp;
  const selected = state.lessonBulkSelection?.[selectionKey] === true;
  return `<div class="lesson-candidate-action">
    <div class="lesson-candidate-main">
      <strong>${escapeHtml(candidate.id)}</strong>
      <span>${escapeHtml(candidate.title || candidate.promotionTarget || t("lessonCandidates"))}</span>
      <small>${escapeHtml(candidate.scope || t("none"))} · ${escapeHtml(candidate.promotionTarget || t("none"))}</small>
    </div>
    <span class="review-result" data-lesson-result="${escapeAttr(task.id)}:${escapeAttr(candidate.id)}"></span>
    <div class="lesson-candidate-command-row">
      <label class="bulk-card-check lesson-bulk-check">
        <input type="checkbox" data-lesson-bulk-select="${escapeAttr(selectionKey)}" ${canBulkCreate ? "" : "disabled"} ${selected ? "checked" : ""} aria-label="${escapeAttr(t("selectLessonCandidate"))}">
        <span>${t("select")}</span>
      </label>
      ${hasFollowUp ? `<a href="#/tasks/${encodeURIComponent(followUp)}">${t("openFollowUpTask")}</a>` : ""}
      <button data-copy-lesson-prompt="${escapeAttr(task.id)}:${escapeAttr(candidate.id)}" data-lesson-prompt="${escapeAttr(prompt)}">${t("copyLessonPrompt")}</button>
      <button data-create-lesson-sedimentation="${escapeAttr(task.id)}" data-candidate-id="${escapeAttr(candidate.id)}" ${canUseWorkbenchAction("lesson-sedimentation-task") && !hasFollowUp ? "" : "disabled"}>${t("createLessonTask")}</button>
    </div>
  </div>`;
}

function lessonBulkSelectionKey(taskId, candidateId) {
  return `${taskId}::${candidateId}`;
}

function parseLessonBulkSelectionKey(key) {
  const separator = String(key || "").lastIndexOf("::");
  if (separator < 0) return null;
  const taskId = key.slice(0, separator);
  const candidateId = key.slice(separator + 2);
  if (!taskId || !candidateId) return null;
  return { taskId, candidateId };
}

function lessonBulkSelectedSelections() {
  return Object.entries(state.lessonBulkSelection || {})
    .filter(([, selected]) => selected === true)
    .map(([key]) => parseLessonBulkSelectionKey(key))
    .filter(Boolean);
}

function lessonBulkActionableSelections() {
  return (bundle.status?.tasks || []).flatMap((task) => (task.lessonCandidateRows || [])
    .filter((candidate) => ["ready-for-review", "needs-promotion"].includes(candidate.status))
    .filter((candidate) => {
      const followUp = String(candidate.followUpTask || "").trim();
      return !followUp || /^pending$/i.test(followUp);
    })
    .map((candidate) => ({ taskId: task.id, candidateId: candidate.id })));
}

function syncLessonBulkSelection(actionableSelections) {
  const allowed = new Set(actionableSelections.map((selection) => lessonBulkSelectionKey(selection.taskId, selection.candidateId)));
  for (const key of Object.keys(state.lessonBulkSelection || {})) {
    if (!allowed.has(key)) delete state.lessonBulkSelection[key];
  }
}

function lessonBulkBar() {
  const actionableSelections = lessonBulkActionableSelections();
  syncLessonBulkSelection(actionableSelections);
  const selectedCount = lessonBulkSelectedSelections().length;
  const allSelected = actionableSelections.length > 0 && actionableSelections.every((selection) => state.lessonBulkSelection?.[lessonBulkSelectionKey(selection.taskId, selection.candidateId)] === true);
  const disabled = selectedCount === 0 || !canUseWorkbenchAction("lesson-sedimentation-bulk");
  const result = state.lessonBulkResult ? `<span class="bulk-action-result ${state.lessonBulkResult.ok ? "success" : "failed"}">${escapeHtml(state.lessonBulkResult.message)}</span>` : "";
  return `<div class="bulk-action-bar lesson-bulk-bar">
    <label class="bulk-select-all">
      <input type="checkbox" data-lesson-bulk-select-all ${allSelected ? "checked" : ""} ${actionableSelections.length ? "" : "disabled"} aria-label="${escapeAttr(t("selectAllLessonCandidates"))}">
      <span>${t("selectAllLessonCandidates")}</span>
    </label>
    <span class="bulk-selected-count">${formatMessage("lessonBulkSelected", { count: selectedCount })}</span>
    <button type="button" data-lesson-bulk-create ${disabled ? "disabled" : ""}>${t("lessonBulkCreate")}</button>
    <button type="button" data-lesson-bulk-clear ${selectedCount ? "" : "disabled"}>${t("clearSelection")}</button>
    ${result}
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
  const lifecycle = taskLifecycleProjection(task);
  return `<main class="review-workspace">
    <nav class="crumbs"><a href="#/review">${t("reviewQueue")}</a><span>/</span><span>${escapeHtml(task.id)}</span></nav>
    <section class="detail-hero review-hero">
      <div>
        <p class="eyebrow">${t("reviewWorkspace")}</p>
        <h2>${escapeHtml(task.title)}</h2>
        <p>${escapeHtml(task.path)}</p>
      </div>
      <div class="review-hero-tags">
        ${tag(lifecycle.lifecycleState || "unknown")}
        ${tag(lifecycle.reviewStatus || "missing")}
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
  const projected = bundle.adoption?.warningProjection?.queue;
  const warnings = Array.isArray(projected) ? projected : (bundle.adoption?.warnings || []);
  return warnings.map((warning) => ({ ...warning })).sort(warningSort);
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

window.setModulePage = function(moduleKey, page) {
  state.modulePages = state.modulePages || {};
  state.modulePages[moduleKey] = page;
  app();
};

function rerenderPreservingFieldFocus(field, selector) {
  const shouldRestore = document.activeElement === field;
  const selectionStart = typeof field.selectionStart === "number" ? field.selectionStart : null;
  const selectionEnd = typeof field.selectionEnd === "number" ? field.selectionEnd : selectionStart;
  app();
  if (!shouldRestore) return;
  const nextField = document.querySelector(selector);
  if (!nextField || typeof nextField.focus !== "function") return;
  nextField.focus({ preventScroll: true });
  if (typeof nextField.setSelectionRange === "function" && selectionStart !== null) {
    nextField.setSelectionRange(selectionStart, selectionEnd);
  }
}

function rerenderPreservingScroll() {
  const scrollX = window.scrollX || document.documentElement?.scrollLeft || 0;
  const scrollY = window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
  const reviewShellTop = document.querySelector(".review-queue-list-shell")?.scrollTop || 0;
  const docNavTop = document.querySelector(".doc-workbench-nav")?.scrollTop || 0;
  app();
  const restore = () => {
    window.scrollTo?.(scrollX, scrollY);
    const nextReviewShell = document.querySelector(".review-queue-list-shell");
    if (nextReviewShell) nextReviewShell.scrollTop = reviewShellTop;
    const nextDocNav = document.querySelector(".doc-workbench-nav");
    if (nextDocNav) nextDocNav.scrollTop = docNavTop;
  };
  restore();
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(restore);
}

function bind() {
  if (typeof document.querySelector === "function") document.querySelector(".skip-link")?.addEventListener("click", (event) => {
    const main = document.getElementById("main");
    if (!main) return;
    event.preventDefault();
    main.focus({ preventScroll: true });
    main.scrollIntoView({ block: "start" });
  });
  document.querySelectorAll("[data-search]").forEach((input) => input.addEventListener("input", () => {
    state.query = input.value;
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    rerenderPreservingFieldFocus(input, "[data-search]");
  }));
  document.querySelectorAll("[data-doc-nav-link]").forEach((link) => link.addEventListener("click", (event) => {
    const href = link.getAttribute("href") || "";
    if (!href.startsWith("#/tasks/")) return;
    event.preventDefault();
    if (window.location.hash !== href) {
      if (window.history?.pushState) window.history.pushState(null, "", href);
      else window.location.hash = href;
    }
    rerenderPreservingScroll();
  }));
  document.querySelectorAll("[data-state-filter]").forEach((select) => select.addEventListener("change", () => {
    state.taskState = select.value;
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    app();
  }));
  document.querySelectorAll("[data-group-mode]").forEach((select) => select.addEventListener("change", () => {
    state.taskGroupMode = select.value;
    localStorage.setItem("harness.taskGroupMode", state.taskGroupMode);
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
  document.querySelectorAll("[data-detail-docs-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.detailDocsCollapsed = !state.detailDocsCollapsed;
    localStorage.setItem("harness.detailDocsCollapsed", String(state.detailDocsCollapsed));
    rerenderPreservingScroll();
  }));
  document.querySelectorAll("[data-detail-side-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.detailSideCollapsed = !state.detailSideCollapsed;
    localStorage.setItem("harness.detailSideCollapsed", String(state.detailSideCollapsed));
    rerenderPreservingScroll();
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
    rerenderPreservingFieldFocus(input, "[data-preset-search]");
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
    state.reviewBulkSelection = {};
    state.reviewBulkResult = null;
    state.lessonBulkResult = null;
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
  document.querySelectorAll("[data-review-bulk-select]").forEach((input) => input.addEventListener("change", () => {
    state.reviewBulkSelection = state.reviewBulkSelection || {};
    state.reviewBulkSelection[input.dataset.reviewBulkSelect || ""] = input.checked;
    state.reviewBulkResult = null;
    rerenderPreservingScroll();
  }));
  document.querySelectorAll("[data-review-bulk-select-all]").forEach((input) => input.addEventListener("change", () => {
    const activeTab = reviewQueueTabs().find((tab) => tab.id === state.reviewQueueTab) || reviewQueueTabs()[0];
    const tasks = activeTab.id === "review" ? reviewFilteredTasks(reviewQueueBaseTasks(activeTab)).filter(taskCanBeHumanConfirmed) : [];
    state.reviewBulkSelection = state.reviewBulkSelection || {};
    tasks.forEach((task) => {
      if (input.checked) state.reviewBulkSelection[task.id] = true;
      else delete state.reviewBulkSelection[task.id];
    });
    state.reviewBulkResult = null;
    rerenderPreservingScroll();
  }));
  document.querySelectorAll("[data-review-bulk-clear]").forEach((button) => button.addEventListener("click", () => {
    state.reviewBulkSelection = {};
    state.reviewBulkResult = null;
    app();
  }));
  document.querySelectorAll("[data-review-bulk-confirm]").forEach((button) => button.addEventListener("click", () => confirmSelectedReviewsFromDashboard(button)));
  document.querySelectorAll("[data-lesson-bulk-select]").forEach((input) => input.addEventListener("change", () => {
    state.lessonBulkSelection = state.lessonBulkSelection || {};
    state.lessonBulkSelection[input.dataset.lessonBulkSelect || ""] = input.checked;
    state.lessonBulkResult = null;
    rerenderPreservingScroll();
  }));
  document.querySelectorAll("[data-lesson-bulk-select-all]").forEach((input) => input.addEventListener("change", () => {
    state.lessonBulkSelection = state.lessonBulkSelection || {};
    lessonBulkActionableSelections().forEach((selection) => {
      const key = lessonBulkSelectionKey(selection.taskId, selection.candidateId);
      if (input.checked) state.lessonBulkSelection[key] = true;
      else delete state.lessonBulkSelection[key];
    });
    state.lessonBulkResult = null;
    rerenderPreservingScroll();
  }));
  document.querySelectorAll("[data-lesson-bulk-clear]").forEach((button) => button.addEventListener("click", () => {
    state.lessonBulkSelection = {};
    state.lessonBulkResult = null;
    app();
  }));
  document.querySelectorAll("[data-lesson-bulk-create]").forEach((button) => button.addEventListener("click", () => createSelectedLessonSedimentationFromDashboard(button)));
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
  document.querySelectorAll("[data-task-complete]").forEach((button) => button.addEventListener("click", () => completeTaskFromDashboard(button.dataset.taskComplete)));
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
        await refreshDashboardSnapshot(nextRuntime);
        return;
      }
      state.runtime = nextRuntime;
    } catch {
      clearInterval(state.runtimePoller);
      state.runtimePoller = null;
    }
  }, 1500);
}

async function refreshDashboardSnapshot(nextRuntime = null) {
  if (state.runtimeRefreshInFlight) return;
  state.runtimeRefreshInFlight = true;
  try {
    const response = await fetch(`/assets/dashboard-data.js?v=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`dashboard data ${response.status}`);
    const script = await response.text();
    const match = script.match(/^\s*window\.__HARNESS_DASHBOARD__\s*=\s*([\s\S]*?);\s*$/);
    if (!match) throw new Error("dashboard data payload missing");
    setDashboardBundle(JSON.parse(match[1]));
    let refreshedRuntime = nextRuntime;
    if (state.runtime?.autoRefresh) {
      const runtimeResponse = await fetch("/api/runtime", { cache: "no-store" });
      if (runtimeResponse.ok) refreshedRuntime = await runtimeResponse.json();
    }
    if (refreshedRuntime) state.runtime = refreshedRuntime;
    app();
  } catch (error) {
    state.runtimeRefreshError = error?.message || String(error);
  } finally {
    state.runtimeRefreshInFlight = false;
  }
}

function scheduleDashboardSnapshotRefresh(delay = 0) {
  setTimeout(() => {
    refreshDashboardSnapshot().catch(() => {});
  }, delay);
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
    scheduleDashboardSnapshotRefresh(500);
  } catch (error) {
    if (result) result.textContent = `${t("reviewCompleteFailed")}: ${error.message}`;
  }
}

async function completeTaskFromDashboard(taskId) {
  const result = document.querySelector(`[data-task-complete-result="${CSS.escape(taskId)}"]`);
  if (result) result.textContent = t("taskCloseoutSubmitting");
  try {
    const response = await fetch("/api/tasks/task-complete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify({
        taskId,
        message: "closed from dashboard workbench",
        evidence: "dashboard:task-complete",
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t("taskCloseoutFailed"));
    if (result) result.textContent = t("taskCloseoutSuccess");
    scheduleDashboardSnapshotRefresh(500);
  } catch (error) {
    if (result) result.textContent = `${t("taskCloseoutFailed")}: ${error.message}`;
  }
}

function dashboardActionErrorDetail(error, fallback) {
  const direct = error?.error || error?.message;
  if (direct) return direct;
  const failedResults = Array.isArray(error?.results) ? error.results.filter((result) => result?.ok === false) : [];
  if (failedResults.length > 0) {
    const reasons = [];
    for (const result of failedResults) {
      const reason = result?.error || result?.message;
      if (reason && !reasons.includes(reason)) reasons.push(reason);
    }
    if (reasons.length > 0) {
      return formatMessage("bulkActionFailedWithReason", {
        failed: error?.failed || failedResults.length,
        reason: reasons.slice(0, 3).join("; "),
      });
    }
    return formatMessage("bulkActionFailedSummary", { failed: error?.failed || failedResults.length });
  }
  return String(error || fallback);
}

async function confirmSelectedReviewsFromDashboard(button) {
  const taskIds = reviewBulkSelectedIds();
  if (!taskIds.length) {
    state.reviewBulkResult = { ok: false, message: t("reviewBulkNone") };
    app();
    return;
  }
  button.disabled = true;
  state.reviewBulkResult = { ok: true, message: t("reviewBulkSubmitting") };
  app();
  try {
    const response = await fetch("/api/tasks/review-complete-bulk", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify({
        taskIds,
        reviewer: "Human Reviewer",
        message: "bulk confirmed from dashboard workbench",
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw payload;
    state.reviewBulkSelection = {};
    state.reviewBulkResult = {
      ok: payload.failed === 0,
      message: payload.failed ? formatMessage("reviewBulkPartial", { confirmed: payload.confirmed || 0, failed: payload.failed || 0 }) : formatMessage("reviewBulkSuccess", { confirmed: payload.confirmed || 0 }),
    };
    app();
    if ((payload.confirmed || 0) > 0) scheduleDashboardSnapshotRefresh(1500);
  } catch (error) {
    state.reviewBulkResult = { ok: false, message: `${t("reviewCompleteFailed")}: ${dashboardActionErrorDetail(error, t("reviewCompleteFailed"))}` };
    app();
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
    if (["install", "seed", "uninstall"].includes(action)) scheduleDashboardSnapshotRefresh(650);
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
      <button class="btn-close" data-close-drawer aria-label="${escapeAttr(t("close"))}">×</button>
    </div>
  `;

  const timeline = phaseTimeline(task);
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
      ${drawerDocumentPreview(task)}
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
  drawer.removeAttribute("aria-hidden");
  drawer.removeAttribute("inert");
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
  drawer.querySelectorAll("[data-task-complete]").forEach((button) => button.addEventListener("click", () => completeTaskFromDashboard(button.dataset.taskComplete)));
}

function drawerPreviewDocuments(task) {
  const docs = orderedTaskDocuments(task);
  if (!docs.length) return [];
  const defaultKey = defaultTaskDocumentKey(task, docs);
  const primaryQueue = taskPrimaryQueueValue(task);
  const preferred = primaryQueue === "active" || primaryQueue === "blocked"
    ? ["progress", "visualMap", defaultKey]
    : [defaultKey];
  const selected = [];
  for (const key of preferred) {
    const doc = docs.find((item) => item.key === key);
    if (doc && !selected.some((item) => item.key === doc.key)) selected.push(doc);
  }
  return selected.length ? selected : docs.slice(0, 1);
}

function drawerDocumentPreview(task) {
  const previewDocs = drawerPreviewDocuments(task);
  const docs = orderedTaskDocuments(task);
  if (!previewDocs.length && !docs.length) return "";
  return `<section class="side-panel drawer-doc-preview">
    <div class="section-head compact">
      <div>
        <p class="eyebrow">${t("taskDocuments")}</p>
        <h3>${t("sourceDocuments")}</h3>
      </div>
      <a href="#/tasks/${encodeURIComponent(task.id)}">${t("fullView")}</a>
    </div>
    <div class="drawer-preview-stack">
      ${previewDocs.map((doc) => drawerPreviewCard(task, doc)).join("")}
    </div>
    <div class="drawer-doc-links">
      ${docs.map((doc) => `<a href="#/tasks/${encodeURIComponent(task.id)}/docs/${encodeURIComponent(doc.key)}" title="${escapeAttr(doc.path)}">${escapeHtml(doc.title)}</a>`).join("")}
    </div>
  </section>`;
}

function drawerPreviewCard(task, doc) {
  return `<details class="drawer-preview-card">
    <summary class="drawer-preview-head">
      <strong>${escapeHtml(doc.title)}</strong>
    </summary>
    <a class="drawer-preview-full" href="#/tasks/${encodeURIComponent(task.id)}/docs/${encodeURIComponent(doc.key)}">${t("fullView")}</a>
    <p>${escapeHtml(safeDocumentExcerpt(doc.content || ""))}</p>
    <div class="drawer-preview-body markdown">${window.HarnessMarkdown.render(doc.content || "", state.renderMode)}</div>
  </details>`;
}

function safeDocumentExcerpt(content, maxLength = 260) {
  const lines = String(content || "").split(/\r?\n/);
  const output = [];
  let inFence = false;
  let inFrontmatter = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (index === 0 && trimmed === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (trimmed === "---") inFrontmatter = false;
      continue;
    }
    if (/^```/.test(trimmed)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!trimmed || /^[-*_]{3,}$/.test(trimmed)) continue;
    const cleaned = trimmed
      .replace(/^#{1,6}\s+/, "")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~]+/g, "")
      .trim();
    if (!cleaned || /^harness\s+/i.test(cleaned)) continue;
    output.push(cleaned);
    if (output.join(" ").length >= maxLength || output.length >= 4) break;
  }
  const excerpt = output.join(" ").replace(/\s+/g, " ").trim();
  if (excerpt.length <= maxLength) return excerpt || "No preview available.";
  return `${excerpt.slice(0, Math.max(0, maxLength - 1)).trim()}…`;
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

async function createSelectedLessonSedimentationFromDashboard(button) {
  const selections = lessonBulkSelectedSelections();
  if (!selections.length) {
    state.lessonBulkResult = { ok: false, message: t("lessonBulkNone") };
    app();
    return;
  }
  button.disabled = true;
  state.lessonBulkResult = { ok: true, message: t("lessonBulkSubmitting") };
  app();
  try {
    const response = await fetch("/api/tasks/lesson-sedimentation-bulk", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify({ selections }),
    });
    const payload = await response.json();
    if (!response.ok) throw payload;
    state.lessonBulkSelection = {};
    state.lessonBulkResult = {
      ok: payload.failed === 0,
      message: payload.failed ? formatMessage("lessonBulkPartial", { created: payload.created || 0, failed: payload.failed || 0 }) : formatMessage("lessonBulkSuccess", { candidates: payload.candidates || selections.length }),
    };
    app();
    if ((payload.created || 0) > 0) scheduleDashboardSnapshotRefresh(1500);
  } catch (error) {
    state.lessonBulkResult = { ok: false, message: `${t("lessonTaskCreateFailed")}: ${error?.error || error?.message || String(error)}` };
    app();
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
      <button class="btn-close" data-close-drawer aria-label="${escapeAttr(t("close"))}">×</button>
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
      <button class="btn-close" data-close-drawer aria-label="${escapeAttr(t("close"))}">×</button>
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
  drawer.removeAttribute("aria-hidden");
  drawer.removeAttribute("inert");
  drawer.classList.add("active");
  overlay.classList.add("active");

  drawer.querySelector("[data-close-drawer]").addEventListener("click", closeDrawer);
}

function closeDrawer() {
  const drawer = document.getElementById("task-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (drawer) {
    if (drawer.contains(document.activeElement)) {
      document.getElementById("main")?.focus({ preventScroll: true });
    }
    drawer.classList.remove("active");
    drawer.setAttribute("aria-hidden", "true");
    drawer.setAttribute("inert", "");
  }
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
window.addEventListener("popstate", app);
app();
loadRuntime();
