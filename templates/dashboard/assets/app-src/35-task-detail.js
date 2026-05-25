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
        ${documentTabs(task)}
      </aside>
    </section>
  </main>`;
}

function taskStateSummary(task) {
  return `<section class="task-state-summary">
    <div>
      <span>${t("legacyState")}</span>
      ${tag(task.state)}
    </div>
    <div>
      <span>${t("lifecycleState")}</span>
      ${tag(task.lifecycleState || "unknown")}
    </div>
    <div>
      <span>${t("reviewStatus")}</span>
      ${tag(task.reviewStatus || "missing")}
    </div>
    <div>
      <span>${t("sedimentationStatus")}</span>
      ${tag(task.lessonCandidateStatus || "missing")}
    </div>
    <div>
      <span>${t("closeoutStatus")}</span>
      ${tag(task.closeoutStatus || "missing")}
    </div>
    <div>
      <span>${t("lifecycleQueues")}</span>
      ${(task.taskQueues || []).map(tag).join("") || tag("active")}
    </div>
    ${taskQueueReasonSummary(task)}
  </section>`;
}

function taskQueueReasonSummary(task) {
  const reasons = task.queueReasons || [];
  if (!reasons.length) return "";
  return `<div class="task-queue-reasons">
    <span>${t("queueReasons")}</span>
    <div class="review-reasons">
      ${reasons.slice(0, 5).map(reviewReason).join("")}
    </div>
  </div>`;
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
      return `<div class="phase-kind-group ${escapeAttr(kind)}">
        <h3>${escapeHtml(label)}</h3>
        ${items.map(phaseStep).join("")}
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
  return `<div class="phase-step ${escapeAttr(phase.state)} ${escapeAttr(phaseKindClass)}">
    <div class="phase-step-head">
      <strong>${escapeHtml(phase.id)}</strong>
      <span>${kindLabel} · ${phase.completion}%</span>
    </div>
    <p>${escapeHtml(phase.output || phase.blockingRisk || phase.state)}</p>
    ${progressBar(phase.completion)}
    <div class="phase-meta">
      ${phaseMetaTag(actor)}
      ${tag(phase.evidenceStatus || "missing")}
    </div>
    ${phase.exitCommand ? `<code class="phase-exit-command">${escapeHtml(phase.exitCommand)}</code>` : ""}
  </div>`;
}

function phaseMetaTag(value) {
  return `<span class="tag">${escapeHtml(String(value || "unknown").replaceAll("_", " "))}</span>`;
}

function taskDocSection(task, fileName, title, required) {
  const doc = taskDocument(task, fileName);
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
  return `<section class="doc-library">
    <div class="section-head">
      <div>
        <p class="eyebrow">${t("taskDocuments")}</p>
        <h2>${escapeHtml(t("sourceDocuments"))}</h2>
      </div>
      <button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button>
    </div>
    <div class="doc-accordion-list">
      ${docs.map((item) => documentAccordion(item, item.key === selectedKey)).join("")}
    </div>
  </section>`;
}

function orderedTaskDocuments(task) {
  const docs = taskDocTabs
    .map(([key, file]) => {
      const doc = taskDocument(task, file);
      if (doc) return { key, file, title: t(key), path: doc.path, content: doc.content };
      if (key === "brief") return { key, file, title: t(key), path: `${task.path}/brief.md`, content: generatedBrief(task), generated: true };
      return null;
    })
    .filter(Boolean);
  const priority = taskDocumentPriority(task);
  const rank = new Map(priority.map((key, index) => [key, index]));
  return docs.sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
}

function taskDocumentPriority(task) {
  const stateName = task?.state || "";
  const lifecycle = task?.lifecycleState || "";
  if (stateName === "review" || ["in_review", "review-blocked"].includes(lifecycle)) {
    return ["walkthrough", "lessonCandidates", "review", "findings", "visualMap", "progress", "brief", "taskPlan", "strategy", "longRunningContract", "legacyRoadmap", "references", "artifacts"];
  }
  if (stateName === "in_progress" || lifecycle === "active" || stateName === "blocked") {
    return ["progress", "visualMap", "brief", "taskPlan", "strategy", "findings", "review", "walkthrough", "references", "artifacts", "legacyRoadmap"];
  }
  if (stateName === "done" || ["closing", "closed"].includes(lifecycle)) {
    return ["walkthrough", "progress", "review", "findings", "visualMap", "brief", "taskPlan", "strategy", "references", "artifacts", "legacyRoadmap"];
  }
  return ["brief", "taskPlan", "visualMap", "strategy", "progress", "findings", "review", "walkthrough", "references", "artifacts", "legacyRoadmap"];
}

function defaultTaskDocumentKey(task, docs) {
  const priority = taskDocumentPriority(task);
  return priority.find((key) => docs.some((doc) => doc.key === key)) || docs[0]?.key || "brief";
}

function documentAccordion(item, open) {
  return `<details class="doc-accordion" ${open ? "open" : ""}>
    <summary>
      <span>${escapeHtml(item.title)}</span>
      <small>${escapeHtml(item.generated ? t("generatedFallback") : item.path)}</small>
    </summary>
    <div class="markdown">${window.HarnessMarkdown.render(item.content, state.renderMode)}</div>
  </details>`;
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
  if (!match) return "";
  const doc = taskDocument(task, match[1]);
  if (!doc) return "";
  return `<section class="doc-section selected-source">
    <div class="section-head"><h2>${t("selectedSource")} · ${t(match[0])}</h2><button data-render-toggle>${state.renderMode === "rendered" ? t("source") : t("rendered")}</button></div>
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
  const blocking = task.reviewStatus === "blocked-open-findings" || (task.risks || []).some((risk) => /^P[0-2]$/i.test(risk.severity || "") && (risk.open || risk.blocksRelease));
  const confirmed = task.reviewStatus === "confirmed";
  const candidateBlocked = task.budget !== "simple" && !task.lessonCandidateDecisionComplete;
  const candidateStatus = task.lessonCandidateStatus || "missing";
  if (mode !== "workspace") {
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(confirmed ? t("reviewAlreadyConfirmed") : t("reviewOpenInWorkspace"))}</p>
      <p>${escapeHtml(t("lessonCandidateStatus"))}: ${tag(candidateStatus)}</p>
      <a href="#/review/${encodeURIComponent(task.id)}">${t("openReviewWorkspace")}</a>
    </section>`;
  }
  if (!canUseWorkbenchAction("review-complete")) {
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(t("staticReadOnlyDetail"))}</p>
    </section>`;
  }
  if (confirmed) {
    return `<section class="side-panel review-actions">
      <h3>${t("reviewActions")}</h3>
      <p>${escapeHtml(t("reviewAlreadyConfirmed"))}</p>
    </section>`;
  }
  const missingWalkthrough = task.budget !== "simple" && !task.walkthroughPath;
  const queueBlocked = !taskCanBeHumanConfirmed(task);
  const disabled = blocking || missingWalkthrough || candidateBlocked || queueBlocked;
  const message = missingWalkthrough ? t("reviewWalkthroughRequired") : blocking ? t("reviewBlocked") : candidateBlocked ? t("reviewCandidateDecisionRequired") : queueBlocked ? t("reviewQueueRequired") : t("reviewWorkbenchReady");
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
  return (task?.reviewQueueState || "not-in-queue") !== "not-in-queue";
}

function taskCanBeHumanConfirmed(task) {
  return task?.reviewQueueState === "ready-to-confirm" && Array.isArray(task?.taskQueues) && task.taskQueues.includes("review");
}

function evidenceList(task) {
  const evidence = task.evidence || [];
  return `<section class="side-panel">
    <h3>${t("evidence")}</h3>
    ${evidence.map((item) => `<p><strong>${escapeHtml(item.type || "evidence")}</strong> ${escapeHtml(item.summary || "")}</p>`).join("") || `<p>${t("noEvidence")}</p>`}
  </section>`;
}
