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
