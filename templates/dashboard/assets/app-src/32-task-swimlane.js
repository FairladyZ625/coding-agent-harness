const swimlaneStageOrder = [
  ["planned", "swimlaneStagePlanned"],
  ["in_progress", "swimlaneStageInProgress"],
  ["evidence", "swimlaneStageEvidence"],
  ["review", "swimlaneStageReview"],
  ["confirmed", "swimlaneStageConfirmed"],
  ["closeout", "swimlaneStageCloseout"],
  ["blocked", "swimlaneStageBlocked"],
];

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
    lanes: laneKeys.map((key) => ({ key, label: key === "legacy-unclassified" ? t("unclassifiedModule") : key })),
    cards,
  };
}

function taskVisibleInSwimlane(task) {
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
  const stateValue = String(task.state || "");
  const review = String(task.reviewStatus || "");
  const reviewQueue = String(task.reviewQueueState || "");
  const closeout = String(task.closeoutStatus || "");
  if (stateValue === "blocked" || review.includes("blocked") || reviewQueue.includes("blocked")) return "blocked";
  if (stateValue === "review" || reviewQueue === "ready-to-confirm" || (task.taskQueues || []).includes("review") || ["agent-reviewed", "in_review"].includes(review)) return "review";
  if (review === "confirmed" && ["missing", "required", "closing"].includes(closeout)) return "closeout";
  if (review === "confirmed") return "confirmed";
  if (["planned", "not_started"].includes(stateValue)) return "planned";
  if (taskNeedsEvidence(task)) return "evidence";
  if (["active", "in_progress", "reopened", "current-evidence"].includes(stateValue)) return "in_progress";
  return "planned";
}

function taskNeedsEvidence(task) {
  if (["missing", "legacy-only"].includes(String(task.visualMapStatus || ""))) return true;
  if (task.briefSource && task.briefSource !== "standalone") return true;
  return (task.phases || []).some((phase) => ["missing", "partial"].includes(String(phase.evidenceStatus || "")));
}

function taskSwimlaneReason(task) {
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
  return `<section class="task-swimlane" aria-label="${escapeAttr(t("layoutSwimlane"))}">
    <div class="swimlane-header">
      <div>
        <p class="eyebrow">${t("swimlaneEyebrow")}</p>
        <h2>${t("swimlaneTitle")}</h2>
      </div>
      <span class="subtle">${model.cards.length} · ${t("tasks")}</span>
    </div>
    <div class="swimlane-stage-legend">
      ${model.stages.map((stage) => `<span data-swimlane-stage="${escapeAttr(stage.key)}">${escapeHtml(stage.label)}</span>`).join("")}
    </div>
    <div class="swimlane-board">
      ${model.lanes.map((lane) => taskSwimlaneLane(lane, model)).join("")}
    </div>
  </section>`;
}

function taskSwimlaneLane(lane, model) {
  return `<div class="swimlane-row">
    <div class="swimlane-lane-label">
      <strong>${escapeHtml(lane.label)}</strong>
      <span>${model.cards.filter((card) => card.lane === lane.key).length} · ${t("tasks")}</span>
    </div>
    <div class="swimlane-cells">
      ${model.stages.map((stage) => {
        const cards = model.cards.filter((card) => card.lane === lane.key && card.stage === stage.key);
        return `<div class="swimlane-cell" data-swimlane-stage="${escapeAttr(stage.key)}">
          <div class="swimlane-cell-title">${escapeHtml(stage.label)}</div>
          ${cards.map((card) => taskSwimlaneCard(card)).join("") || `<span class="swimlane-cell-empty">${t("none")}</span>`}
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function taskSwimlaneCard(card) {
  const task = card.task;
  const completion = clampCompletion(task.completion);
  return `<article class="swimlane-card ${escapeAttr(card.stage)}" data-open-drawer="${escapeAttr(task.id)}" style="--row-accent: var(${stateToColorVar(task.state)})">
    <div class="swimlane-card-head">
      ${tag(task.state)}
      <span>${completion}%</span>
    </div>
    <strong>${escapeHtml(task.title)}</strong>
    <p>${escapeHtml(task.shortId || task.id)}</p>
    ${card.reason ? `<div class="swimlane-card-reason">${escapeHtml(card.reason)}</div>` : ""}
  </article>`;
}
