const swimlaneStageOrder = [
  ["planned", "swimlaneStagePlanned"],
  ["in_progress", "swimlaneStageInProgress"],
  ["evidence", "swimlaneStageEvidence"],
  ["review", "swimlaneStageReview"],
  ["confirmed", "swimlaneStageConfirmed"],
  ["closeout", "swimlaneStageCloseout"],
  ["blocked", "swimlaneStageBlocked"],
];
const swimlaneCellPageSize = 10;
const swimlaneMiniColumnLimit = 5;

function taskSwimlaneModel(tasks) {
  const cards = sortTasksByTime(tasks)
    .filter((task) => taskVisibleInSwimlane(task))
    .map((task) => {
      const lane = taskModuleKey(task);
      const stage = taskSwimlaneStage(task);
      return {
        task,
        lane,
        stage,
        id: task.id,
        title: task.title,
        reason: taskSwimlaneReason(task),
      };
    });
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
  const view = taskDashboardTaskView(task);
  if (typeof view.visibleInSwimlane === "boolean") return view.visibleInSwimlane;
  const stateValue = String(task.state || "");
  const closeout = String(task.closeoutStatus || "");
  if (["done", "closed", "finalized"].includes(stateValue)) return false;
  if (["closed", "finalized"].includes(closeout)) return false;
  if (clampCompletion(task.completion) >= 100 && !["review", "blocked", "reopened", "current-evidence"].includes(stateValue)) return false;
  return ["active", "planned", "not_started", "in_progress", "review", "blocked", "reopened", "current-evidence"].includes(stateValue)
    || ["ready-to-confirm", "needs-material", "review-blocked"].includes(String(task.reviewQueueState || ""))
    || ["agent-reviewed", "confirmed", "blocked-open-findings"].includes(String(task.reviewStatus || ""));
}

function taskSwimlaneStage(task) {
  const view = taskDashboardTaskView(task);
  if (view.swimlaneStage) return view.swimlaneStage;
  const stateValue = String(task.state || "");
  const review = String(task.reviewStatus || "");
  const reviewQueue = String(task.reviewQueueState || "");
  const closeout = String(task.closeoutStatus || "");
  if (stateValue === "blocked" || review.includes("blocked") || reviewQueue.includes("blocked")) return "blocked";
  if (review === "confirmed" && taskHasPendingLessonWork(task)) return "closeout";
  if (review === "confirmed" && ["missing", "pending", "required", "closing"].includes(closeout)) return "closeout";
  if (review === "confirmed") return "confirmed";
  if (stateValue === "review" || reviewQueue === "ready-to-confirm" || (task.taskQueues || []).includes("review") || ["agent-reviewed", "in_review"].includes(review)) return "review";
  if (["planned", "not_started"].includes(stateValue)) return "planned";
  if (taskNeedsEvidence(task)) return "evidence";
  if (["active", "in_progress", "reopened", "current-evidence"].includes(stateValue)) return "in_progress";
  return "planned";
}

function taskNeedsEvidence(task) {
  const view = taskDashboardTaskView(task);
  if (typeof view.needsEvidence === "boolean") return view.needsEvidence;
  if (["missing", "legacy-only"].includes(String(task.visualMapStatus || ""))) return true;
  if (task.briefSource && task.briefSource !== "standalone") return true;
  return (task.phases || []).some((phase) => ["missing", "partial"].includes(String(phase.evidenceStatus || "")));
}

function taskSwimlaneReason(task) {
  const view = taskDashboardTaskView(task);
  if (view.reasonMessage) return view.reasonMessage;
  if (view.reasonCode === "needs-evidence") return t("swimlaneNeedsEvidence");
  if (view.reasonCode === "ready-to-confirm") return t("swimlaneReadyToConfirm");
  if (view.reasonCode === "needs-closeout") return t("swimlaneNeedsCloseout");
  const reasons = Array.isArray(task.queueReasons) ? task.queueReasons.filter(Boolean) : [];
  if (reasons.length) return reasons[0];
  if (taskNeedsEvidence(task)) return t("swimlaneNeedsEvidence");
  if (task.reviewQueueState === "ready-to-confirm") return t("swimlaneReadyToConfirm");
  if (task.closeoutStatus === "missing") return t("swimlaneNeedsCloseout");
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
  return `<article class="swimlane-card ${escapeAttr(card.stage)}" data-open-drawer="${escapeAttr(task.id)}" style="--row-accent: var(${stateToColorVar(task.state)}); --task-progress: ${completion}%">
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
