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
    <section class="detail-grid">
      <article class="detail-main">
        ${taskDocumentLibrary(task, route.doc)}
      </article>
      <aside class="detail-side">
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
  return `<section class="doc-library">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("taskDocuments")}</p>
        <h2>${escapeHtml(t("sourceDocuments"))}</h2>
      </div>
      <button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button>
    </div>
    <div class="doc-workbench">
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
    <div class="markdown">${window.HarnessMarkdown.render(doc.content, state.renderMode)}</div>
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
