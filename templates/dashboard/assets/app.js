const bundle = window.__HARNESS_DASHBOARD__ || {};
const state = {
  page: "overview",
  lang: localStorage.getItem("harness.lang") || "zh",
  theme: localStorage.getItem("harness.theme") || "system",
  density: localStorage.getItem("harness.density") || "comfortable",
  selected: null,
  tab: "plan",
  renderMode: "rendered",
};

const pageKeys = ["overview", "ledger", "tasks", "modules", "evidence", "lessons", "adoption", "settings"];
const taskDocTabs = [
  ["plan", "task_plan.md"],
  ["strategy", "execution_strategy.md"],
  ["roadmap", "visual_roadmap.md"],
  ["progress", "progress.md"],
  ["review", "review.md"],
  ["findings", "findings.md"],
  ["references", "references/INDEX.md"],
  ["artifacts", "artifacts/INDEX.md"],
];

function t(key) {
  return (window.HarnessI18n?.[state.lang] || window.HarnessI18n.zh)[key] || key;
}

function app() {
  const systemTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = state.theme === "system" ? systemTheme : state.theme;
  document.documentElement.dataset.density = state.density;
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand">
          <strong>${escapeHtml(bundle.status?.project?.name || "Harness")}</strong>
          <span>${escapeHtml(bundle.status?.project?.root || "TARGET:.")}</span>
        </div>
        <nav class="nav">${pageKeys.map((page) => navButton(page)).join("")}</nav>
      </aside>
      <main class="main">
        ${topbar()}
        ${renderPage()}
      </main>
    </div>`;
  bind();
}

function navButton(page) {
  return `<button data-page="${page}" class="${state.page === page ? "active" : ""}">${t(page)}</button>`;
}

function topbar() {
  return `<div class="topbar">
    <div>
      <p class="eyebrow">Coding Agent Harness Dashboard</p>
      <h1>${escapeHtml(pageTitle())}</h1>
    </div>
    <div class="controls">
      <div class="control">
        <button data-lang="zh" class="${state.lang === "zh" ? "active" : ""}">中文</button>
        <button data-lang="en" class="${state.lang === "en" ? "active" : ""}">EN</button>
      </div>
      <div class="control">
        <button data-theme="light" class="${state.theme === "light" ? "active" : ""}">${t("light")}</button>
        <button data-theme="dark" class="${state.theme === "dark" ? "active" : ""}">${t("dark")}</button>
        <button data-theme="system" class="${state.theme === "system" ? "active" : ""}">${t("system")}</button>
      </div>
      <div class="control">
        <button data-density="compact" class="${state.density === "compact" ? "active" : ""}">${t("compact")}</button>
        <button data-density="comfortable" class="${state.density === "comfortable" ? "active" : ""}">${t("comfortable")}</button>
      </div>
    </div>
  </div>`;
}

function pageTitle() {
  const project = bundle.status?.project?.name || "project";
  if (state.page === "overview") return state.lang === "zh" ? `${project} 项目驾驶舱` : `${project} project cockpit`;
  return t(state.page);
}

function renderPage() {
  if (state.page === "overview") return overview();
  if (state.page === "ledger") return withDrawer(ledgerTable());
  if (state.page === "tasks") return withDrawer(taskTable());
  if (state.page === "modules") return withDrawer(moduleTable());
  if (state.page === "evidence") return withDrawer(evidenceTable());
  if (state.page === "lessons") return withDrawer(lessonsTable());
  if (state.page === "adoption") return adoption();
  return settings();
}

function overview() {
  const status = bundle.status || {};
  const evidence = evidenceHealth(status.tasks || []);
  const blockers = status.checkState?.failures || 0;
  const warnings = status.checkState?.warnings || 0;
  return `<section class="status-grid">
    <div class="readiness panel">
    <span class="state ${status.checkState?.status || "warn"}">${t("readiness")}: ${label(status.checkState?.status || "unknown")}</span>
      <h2>${nextActionText()}</h2>
      <p class="muted">${state.lang === "zh" ? "这里把真实阻塞、证据缺口和旧版升级建议拆开显示。" : "Blockers, evidence gaps, and adoption advice are separated."}</p>
    </div>
    ${metric(t("activeTasks"), status.tasks?.length || 0)}
    ${metric(t("blockers"), blockers)}
    ${metric(t("warnings"), warnings)}
  </section>
  <section class="page-grid">
    <div>
      ${overviewTasks()}
      ${ledgerSummary()}
      ${riskPanel()}
    </div>
    ${drawer()}
  </section>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`;
}

function nextActionText() {
  const failures = bundle.status?.checkState?.failures || 0;
  if (failures > 0) return state.lang === "zh" ? "先处理 release blocker" : "Resolve release blockers first";
  const advice = bundle.adoption?.warnings?.length || 0;
  if (advice > 0) return state.lang === "zh" ? "可以继续，但需要处理升级建议" : "Proceed, with adoption advice to address";
  return state.lang === "zh" ? "当前快照没有阻塞项" : "No blockers in this snapshot";
}

function overviewTasks() {
  const rows = (bundle.status?.tasks || []).slice(0, 6);
  return tablePanel(t("tasks"), [t("task"), t("state"), t("completion"), t("roadmapSource")], rows.map((task) => [
    clickable(task.title, "task", task.id),
    tag(task.state, label(task.state)),
    progress(task.completion),
    escapeHtml(label(task.roadmapSource || "unknown")),
  ]));
}

function riskPanel() {
  const warnings = bundle.adoption?.warnings || [];
  const grouped = groupBy(warnings, (item) => item.category);
  return `<section class="panel" style="padding:16px;margin-top:16px">
    <h2>${state.lang === "zh" ? "风险与升级建议" : "Risks and adoption advice"}</h2>
    <div class="risk-list">${Object.entries(grouped).map(([category, items]) => `
      <div class="risk-item"><strong>${escapeHtml(category)}</strong><p class="muted">${items.length} ${state.lang === "zh" ? "项" : "items"}</p></div>
    `).join("") || `<p class="empty">${state.lang === "zh" ? "没有建议" : "No advice"}</p>`}</div>
  </section>`;
}

function taskTable() {
  const rows = bundle.status?.tasks || [];
  return tablePanel(t("tasks"), [t("task"), t("state"), t("completion"), t("evidence"), t("roadmapSource")], rows.map((task) => [
    clickable(task.title, "task", task.id),
    tag(task.state, label(task.state)),
    progress(task.completion),
    progress(evidenceHealth([task])),
    escapeHtml(label(task.roadmapSource || "unknown")),
  ]));
}

function ledgerSummary() {
  const tables = (bundle.tables?.tables || []).filter((table) => table.kind === "harness-ledger");
  if (tables.length === 0) return "";
  const rows = tables.flatMap((table) => table.rows).slice(0, 5);
  return `<section class="panel ledger-summary">
    <div class="panel-head"><h2>${t("ledger")}</h2><span class="muted">${rows.length}</span></div>
    <div class="risk-list">${rows.map((row) => {
      const cells = row.cells || {};
      const title = cells.Task || cells.ID || cells.Item || cells.Title || cells.Module || "Ledger item";
      const state = cells.State || cells.Status || cells.Review || cells["Review State"] || "";
      const action = cells["Next Action"] || cells.Action || cells.Owner || cells["Required Action"] || "";
      return `<div class="risk-item"><strong>${escapeHtml(title)}</strong><p class="muted">${escapeHtml([label(state), action].filter(Boolean).join(" · "))}</p></div>`;
    }).join("")}</div>
  </section>`;
}

function ledgerTable() {
  const tables = (bundle.tables?.tables || []).filter((table) => table.kind === "harness-ledger");
  if (tables.length === 0) return emptyTable(t("ledger"), state.lang === "zh" ? "未找到 Harness Ledger。" : "No Harness Ledger found.");
  return genericTables(t("ledger"), tables);
}

function moduleTable() {
  const tables = (bundle.tables?.tables || []).filter((table) => table.kind === "module-registry");
  const graph = graphPanel();
  if (tables.length === 0) return `${graph}${emptyTable(t("modules"), state.lang === "zh" ? "未找到 Module Registry。" : "No Module Registry found.")}`;
  return `${graph}${genericTables(t("modules"), tables)}`;
}

function evidenceTable() {
  const items = evidenceItems();
  return tablePanel(t("evidence"), [t("origin"), t("task"), t("state"), t("title"), t("affected")], items.map((item) => [
    escapeHtml(label(item.source)),
    escapeHtml(item.task || "-"),
    tag(item.state || "present", label(item.state || "present")),
    escapeHtml(item.title),
    escapeHtml(item.affected || ""),
  ]));
}

function evidenceItems() {
  const taskEvidence = (bundle.status?.tasks || []).flatMap((task) => [
    ...(task.evidence || []).map((item) => ({
      source: item.type || "task-progress",
      task: task.title,
      state: item.status || "present",
      title: item.summary || item.id,
      affected: item.path || "",
    })),
    ...(task.risks || []).map((item) => ({
      source: "task-review",
      task: task.title,
      state: item.open ? "open" : "closed",
      title: item.summary || item.id,
      affected: `${item.severity || ""}${item.blocksRelease ? " · blocks" : ""}`.trim(),
    })),
  ]);
  const qaTables = (bundle.tables?.tables || [])
    .filter((table) => ["task-review", "regression-ssot", "cadence-ledger"].includes(table.kind))
    .flatMap((table) => table.rows.slice(0, 12).map((row) => {
      const cells = row.cells || {};
      return {
        source: table.kind,
        task: cells.Task || cells.Module || cells.ID || "-",
        state: cells.Status || cells.State || cells.Open || cells.Verdict || "present",
        title: cells.Finding || cells.Summary || cells.Check || cells.Item || cells.Title || table.source,
        affected: cells["Evidence Checked"] || cells.Path || cells.Owner || cells["Required Action"] || table.source,
      };
    }));
  return [...taskEvidence, ...qaTables];
}

function lessonsTable() {
  const tables = (bundle.tables?.tables || []).filter((table) => table.kind === "lessons-ssot");
  if (tables.length === 0) return emptyTable(t("lessons"), state.lang === "zh" ? "未找到 Lessons SSoT。" : "No Lessons SSoT found.");
  return genericTables(t("lessons"), tables);
}

function adoption() {
  const advice = bundle.adoption?.warnings || [];
  return `<section class="page-grid">
    <div>
      ${tablePanel(t("adoption"), [t("category"), t("severity"), t("title"), t("affected"), t("requiredAction")], advice.map((item) => [
        escapeHtml(item.category),
        tag(item.severity, label(item.severity)),
        escapeHtml(item.title),
        escapeHtml(item.affected),
        escapeHtml(item.requiredAction),
      ]))}
      <section class="panel" style="padding:16px;margin-top:16px">
        <h2>${t("nextAction")}</h2>
        <ol>${((bundle.adoption?.manualSteps || {})[state.lang] || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
      </section>
    </div>
    ${drawer()}
  </section>`;
}

function settings() {
  return `<section class="panel" style="padding:18px">
    <h2>${t("settings")}</h2>
    <p class="muted">${state.lang === "zh" ? "这些设置只保存在浏览器本地，不会写回项目。" : "These settings are browser-local and never write back to the project."}</p>
    <p>${t("rendered")} / ${t("source")}: ${state.lang === "zh" ? "在详情抽屉里切换。" : "Switch inside the detail drawer."}</p>
  </section>`;
}

function withDrawer(content) {
  return `<section class="page-grid"><div>${content}</div>${drawer()}</section>`;
}

function tablePanel(title, headers, rows) {
  return `<section class="table-panel">
    <div class="panel-head"><h2>${escapeHtml(title)}</h2><span class="muted">${rows.length}</span></div>
    <div class="table-wrap"><table>
      <thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
    </table></div>
  </section>`;
}

function genericTables(title, tables) {
  return tables.map((table) => tablePanel(`${title} · ${table.source}`, table.columns, table.rows.map((row) => table.columns.map((column) => escapeHtml(row.cells[column] || ""))))).join("");
}

function graphPanel() {
  const graph = bundle.graph || { nodes: [], edges: [] };
  const modules = graph.nodes.filter((node) => node.type === "module");
  const fallbackTasks = graph.nodes.filter((node) => node.type === "task");
  const laneNodes = modules.length > 0 ? modules : fallbackTasks;
  const edges = graph.edges || [];
  return `<section class="panel graph-panel">
    <div class="panel-head"><h2>${t("graph")}</h2><span class="muted">${modules.length} modules · ${fallbackTasks.length} tasks · ${edges.length} edges</span></div>
    <div class="graph-lanes">${laneNodes.slice(0, 12).map((module) => {
      const owned = edges.filter((edge) => edge.from === module.id).slice(0, 8);
      return `<div class="lane"><strong>${escapeHtml(module.label)}</strong><span>${label(module.state || "")}</span>${owned.map((edge) => `<small>${escapeHtml(edge.type)} → ${escapeHtml(edge.to.replace(/^step:/, ""))}</small>`).join("")}</div>`;
    }).join("") || `<p class="empty">${state.lang === "zh" ? "暂无模块图数据" : "No module graph data"}</p>`}</div>
  </section>`;
}

function emptyTable(title, message) {
  return `<section class="table-panel"><div class="panel-head"><h2>${escapeHtml(title)}</h2></div><p class="empty">${escapeHtml(message)}</p></section>`;
}

function drawer() {
  const selection = state.selected;
  if (!selection) {
    return `<aside class="drawer"><div class="drawer-head"><h2>${t("detail")}</h2></div><div class="drawer-body empty">${t("noSelection")}</div></aside>`;
  }
  const docs = docsForSelection(selection);
  const active = docs.find((doc) => doc.tab === state.tab) || docs[0];
  return `<aside class="drawer">
    <div class="drawer-head"><h2>${escapeHtml(selection.label)}</h2><p class="muted">${escapeHtml(active?.path || "")}</p></div>
    <div class="drawer-tabs">${docs.map((doc) => `<button data-tab="${doc.tab}" class="${active?.tab === doc.tab ? "active" : ""}">${t(doc.tab)}</button>`).join("")}</div>
    <div class="drawer-mode"><button data-render-mode="rendered" class="${state.renderMode === "rendered" ? "active" : ""}">${t("rendered")}</button><button data-render-mode="source" class="${state.renderMode === "source" ? "active" : ""}">${t("source")}</button></div>
    <div class="drawer-body"><article class="markdown">${active ? window.HarnessMarkdown.render(active.content, state.renderMode) : t("noSelection")}</article></div>
  </aside>`;
}

function docsForSelection(selection) {
  if (selection.type !== "task") return [];
  const task = (bundle.status?.tasks || []).find((item) => item.id === selection.id);
  if (!task) return [];
  return taskDocTabs.map(([tab, suffix]) => {
    const doc = findDocument(`${task.path}/${suffix}`);
    return doc ? { tab, ...doc } : null;
  }).filter(Boolean);
}

function findDocument(pathSuffix) {
  return (bundle.documents?.documents || []).find((doc) => doc.path.endsWith(pathSuffix));
}

function clickable(label, type, id) {
  return `<button class="linklike" data-select-type="${type}" data-select-id="${id}" data-select-label="${escapeAttr(label)}">${escapeHtml(label)}</button>`;
}

function tag(value, text = value) {
  const raw = String(value || "unknown");
  const klass = /fail|blocked|open/i.test(raw) ? "fail" : /warn|advice|planned|missing/i.test(raw) ? "warn" : /pass|done|present|verified/i.test(raw) ? "pass" : "";
  return `<span class="tag ${klass}">${escapeHtml(text)}</span>`;
}

function label(value) {
  const labels = {
    zh: {
      pass: "通过",
      warn: "需关注",
      fail: "阻塞",
      in_progress: "进行中",
      planned: "计划中",
      done: "完成",
      blocked: "阻塞",
      missing: "缺失",
      present: "已有",
      closed: "关闭",
      advice: "建议",
      standalone: "独立文件",
      legacy: "旧版兼容",
      "task-review": "审查",
      "task-progress": "进度",
      "regression-ssot": "回归",
      "cadence-ledger": "节奏",
      unknown: "未知",
    },
    en: {
      pass: "pass",
      warn: "warn",
      fail: "fail",
      in_progress: "in progress",
      planned: "planned",
      done: "done",
      blocked: "blocked",
      missing: "missing",
      present: "present",
      closed: "closed",
      advice: "advice",
      standalone: "standalone",
      legacy: "legacy",
      "task-review": "review",
      "task-progress": "progress",
      "regression-ssot": "regression",
      "cadence-ledger": "cadence",
      unknown: "unknown",
    },
  };
  return labels[state.lang][value] || value;
}

function progress(value) {
  const score = Math.max(0, Math.min(100, Number(value) || 0));
  return `<span>${score}%</span><div class="bar"><i style="width:${score}%"></i></div>`;
}

function evidenceHealth(tasks) {
  const phases = tasks.flatMap((task) => task.phases || []).filter((phase) => phase.state !== "skipped");
  if (phases.length === 0) return 0;
  const score = phases.reduce((sum, phase) => {
    if (["present", "waived"].includes(phase.evidenceStatus)) return sum + 100;
    if (phase.evidenceStatus === "partial") return sum + 50;
    return sum;
  }, 0);
  return Math.round(score / phases.length);
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
  document.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", () => {
    state.page = button.dataset.page;
    state.selected = null;
    app();
  }));
  document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => {
    state.lang = button.dataset.lang;
    localStorage.setItem("harness.lang", state.lang);
    app();
  }));
  document.querySelectorAll("[data-theme]").forEach((button) => button.addEventListener("click", () => {
    state.theme = button.dataset.theme;
    localStorage.setItem("harness.theme", state.theme);
    app();
  }));
  document.querySelectorAll("[data-density]").forEach((button) => button.addEventListener("click", () => {
    state.density = button.dataset.density;
    localStorage.setItem("harness.density", state.density);
    app();
  }));
  document.querySelectorAll("[data-select-type]").forEach((button) => button.addEventListener("click", () => {
    state.selected = { type: button.dataset.selectType, id: button.dataset.selectId, label: button.dataset.selectLabel };
    state.tab = "plan";
    app();
  }));
  document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    state.tab = button.dataset.tab;
    app();
  }));
  document.querySelectorAll("[data-render-mode]").forEach((button) => button.addEventListener("click", () => {
    state.renderMode = button.dataset.renderMode;
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

app();
