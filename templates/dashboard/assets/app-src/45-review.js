function reviewQueue() {
  ensureReviewQueueState();
  const tabs = reviewQueueTabs();
  const activeTab = tabs.find((tab) => tab.id === state.reviewQueueTab) || tabs[0];
  const baseTasks = reviewQueueBaseTasks(activeTab);
  const reasonOptions = reviewReasonOptions(baseTasks);
  normalizeReviewReasonFilter(reasonOptions);
  const tasks = reviewFilteredTasks(baseTasks);
  const confirmableTasks = activeTab.id === "review" ? tasks.filter(taskCanBeHumanConfirmed) : [];
  syncReviewBulkSelection(confirmableTasks);
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
  return normalCycleTasks().filter((task) => taskMatchesReviewTab(task, tab));
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
