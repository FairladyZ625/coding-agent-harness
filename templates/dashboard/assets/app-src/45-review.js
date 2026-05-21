function reviewQueue() {
  const tasks = reviewQueueTasks();
  const ready = tasks.filter((task) => task.reviewStatus !== "blocked-open-findings" && task.reviewStatus !== "confirmed").length;
  const blocked = tasks.filter((task) => task.reviewStatus === "blocked-open-findings").length;
  const confirmed = tasks.filter((task) => task.reviewStatus === "confirmed").length;
  return `<main class="review-queue-page">
    <section class="flow-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t("review")}</p>
          <h2>${t("reviewQueue")}</h2>
          <p class="subtle">${t("reviewQueueSubtitle")}</p>
        </div>
        <div class="review-queue-stats">
          ${metric(t("reviewReady"), ready)}
          ${metric(t("reviewBlockedQueue"), blocked)}
          ${metric(t("reviewConfirmedQueue"), confirmed)}
        </div>
      </div>
      <div class="task-card-grid review-queue-grid">
        ${tasks.map(reviewQueueCard).join("") || emptyState(t("noReviewTasks"))}
      </div>
    </section>
  </main>`;
}

function reviewQueueTasks() {
  return (bundle.status?.tasks || [])
    .filter(isTaskInReviewStage)
    .sort((left, right) => reviewSortKey(left).localeCompare(reviewSortKey(right)));
}

function reviewSortKey(task) {
  const rank = task.reviewStatus === "blocked-open-findings" ? "0" : task.reviewStatus === "confirmed" ? "2" : "1";
  return `${rank}:${task.id}`;
}

function reviewQueueCard(task) {
  const openMaterial = (task.risks || []).filter((risk) => /^P[0-2]$/i.test(risk.severity || "") && (risk.open || risk.blocksRelease)).length;
  return `<article class="task-card review-queue-card" style="--row-accent: var(${stateToColorVar(task.state)})">
    <div class="card-header">
      <span class="card-id">${escapeHtml(task.id)}</span>
      ${tag(task.reviewStatus || "missing")}
    </div>
    <h4 class="card-title" title="${escapeAttr(task.title)}">${escapeHtml(task.title)}</h4>
    <div class="card-meta">
      <span>${tag(task.lifecycleState || "unknown")}</span>
      <span>${tag(task.closeoutStatus || "missing")}</span>
      <span>${openMaterial} ${t("openFindings")}</span>
    </div>
    <p class="subtle">${escapeHtml(firstUsefulLine(task.summary || task.briefText || ""))}</p>
    <div class="review-queue-actions">
      <a href="#/tasks/${encodeURIComponent(task.id)}">${t("fullView")}</a>
      <button data-open-drawer="${escapeAttr(task.id)}">${t("viewDetails")}</button>
    </div>
    ${reviewActionPanel(task)}
  </article>`;
}

function firstUsefulLine(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)[0] || "";
}
