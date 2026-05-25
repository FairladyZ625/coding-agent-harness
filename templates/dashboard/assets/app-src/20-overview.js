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
