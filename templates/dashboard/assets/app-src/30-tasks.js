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
