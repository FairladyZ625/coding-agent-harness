function reviewQueue() {
  const tasks = reviewQueueTasks();
  const ready = tasks.filter((task) => task.reviewStatus !== "blocked-open-findings" && task.reviewStatus !== "confirmed").length;
  const blocked = tasks.filter((task) => task.reviewStatus === "blocked-open-findings").length;
  const confirmed = tasks.filter((task) => task.reviewStatus === "confirmed").length;
  return `<div class="dashboard-grid review-queue-page">
    <main class="dashboard-main stack">
      <section class="flow-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t("review")}</p>
            <h2>${t("reviewQueue")}</h2>
            <p class="subtle">${t("reviewQueueSubtitle")}</p>
          </div>
          <span class="subtle">${ready}/${tasks.length} ${t("reviewReady")}</span>
        </div>
        <div class="task-card-grid review-queue-grid">
          ${tasks.map(reviewQueueCard).join("") || emptyState(t("noReviewTasks"))}
        </div>
      </section>
    </main>
    <aside class="dashboard-sidebar stack">
      <section class="side-panel review-queue-summary">
        <h3>${t("reviewQueue")}</h3>
        <div class="review-queue-stats">
          ${metric(t("reviewReady"), ready)}
          ${metric(t("reviewBlockedQueue"), blocked)}
          ${metric(t("reviewConfirmedQueue"), confirmed)}
        </div>
      </section>
      <section class="side-panel">
        <h3>${t("review")}</h3>
        <p>${escapeHtml(t("reviewQueueSubtitle"))}</p>
      </section>
    </aside>
  </div>`;
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
      <a href="#/review/${encodeURIComponent(task.id)}">${t("openReviewWorkspace")}</a>
      <a href="#/tasks/${encodeURIComponent(task.id)}">${t("fullView")}</a>
      <button data-open-drawer="${escapeAttr(task.id)}">${t("viewDetails")}</button>
    </div>
  </article>`;
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
    <div class="markdown">${doc ? window.HarnessMarkdown.render(doc.content, state.renderMode) : emptyState(t("documentMissing"))}</div>
  </section>`;
}
