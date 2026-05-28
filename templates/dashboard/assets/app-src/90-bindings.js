window.setModulePage = function(moduleKey, page) {
  state.modulePages = state.modulePages || {};
  state.modulePages[moduleKey] = page;
  app();
};

function rerenderPreservingFieldFocus(field, selector) {
  const shouldRestore = document.activeElement === field;
  const selectionStart = typeof field.selectionStart === "number" ? field.selectionStart : null;
  const selectionEnd = typeof field.selectionEnd === "number" ? field.selectionEnd : selectionStart;
  app();
  if (!shouldRestore) return;
  const nextField = document.querySelector(selector);
  if (!nextField || typeof nextField.focus !== "function") return;
  nextField.focus({ preventScroll: true });
  if (typeof nextField.setSelectionRange === "function" && selectionStart !== null) {
    nextField.setSelectionRange(selectionStart, selectionEnd);
  }
}

function bind() {
  document.querySelectorAll("[data-search]").forEach((input) => input.addEventListener("input", () => {
    state.query = input.value;
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    rerenderPreservingFieldFocus(input, "[data-search]");
  }));
  document.querySelectorAll("[data-state-filter]").forEach((select) => select.addEventListener("change", () => {
    state.taskState = select.value;
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    app();
  }));
  document.querySelectorAll("[data-group-mode]").forEach((select) => select.addEventListener("change", () => {
    state.taskGroupMode = select.value;
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    app();
  }));
  document.querySelectorAll("[data-layout]").forEach((btn) => btn.addEventListener("click", () => {
    state.taskLayout = btn.dataset.layout;
    localStorage.setItem("harness.taskLayout", state.taskLayout);
    app();
  }));
  document.querySelectorAll("[data-task-sort-order]").forEach((btn) => btn.addEventListener("click", () => {
    state.taskSortOrder = btn.dataset.taskSortOrder === "asc" ? "asc" : "desc";
    localStorage.setItem("harness.taskSortOrder", state.taskSortOrder);
    state.taskPageByGroup = {};
    state.taskGroupPage = 1;
    app();
  }));
  document.querySelectorAll("[data-render-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.renderMode = state.renderMode === "rendered" ? "source" : "rendered";
    app();
  }));
  document.querySelectorAll("[data-warning-filter]").forEach((button) => button.addEventListener("click", () => {
    state.warningFilter = button.dataset.warningFilter || "all";
    state.warningPage = 1;
    app();
  }));
  document.querySelectorAll("[data-warning-filter-select]").forEach((select) => select.addEventListener("change", () => {
    state.warningFilter = select.value;
    state.warningPage = 1;
    app();
  }));
  document.querySelectorAll("[data-preset-search]").forEach((input) => input.addEventListener("input", () => {
    state.presetQuery = input.value;
    rerenderPreservingFieldFocus(input, "[data-preset-search]");
  }));
  document.querySelectorAll("[data-preset-source-filter]").forEach((button) => button.addEventListener("click", () => {
    state.presetSourceFilter = button.dataset.presetSourceFilter || "all";
    state.selectedPresetKey = "";
    state.presetUninstallConfirm = "";
    app();
  }));
  document.querySelectorAll("[data-preset-select]").forEach((button) => button.addEventListener("click", () => {
    state.selectedPresetKey = button.dataset.presetSelect || "";
    state.selectedPresetId = "";
    const selectedPreset = (bundle.presetCatalog?.presets || []).find((preset) => presetKey(preset) === state.selectedPresetKey);
    if (selectedPreset && state.presetSourceFilter !== "all" && selectedPreset.source !== state.presetSourceFilter) {
      state.presetSourceFilter = selectedPreset.source;
    }
    if (selectedPreset && !presetMatchesQuery(selectedPreset)) state.presetQuery = "";
    if (selectedPreset && ["project", "user"].includes(selectedPreset.source)) state.presetUninstallScope = selectedPreset.source;
    state.presetUninstallConfirm = "";
    app();
  }));
  document.querySelectorAll("[data-preset-install-source]").forEach((input) => input.addEventListener("input", () => {
    state.presetInstallSource = input.value;
  }));
  document.querySelectorAll("[data-preset-install-scope]").forEach((select) => select.addEventListener("change", () => {
    state.presetInstallScope = select.value || "project";
  }));
  document.querySelectorAll("[data-preset-install-force]").forEach((input) => input.addEventListener("change", () => {
    state.presetInstallForce = input.checked;
  }));
  document.querySelectorAll("[data-preset-seed-scope]").forEach((select) => select.addEventListener("change", () => {
    state.presetSeedScope = select.value || "project";
  }));
  document.querySelectorAll("[data-preset-seed-force]").forEach((input) => input.addEventListener("change", () => {
    state.presetSeedForce = input.checked;
  }));
  document.querySelectorAll("[data-preset-uninstall-scope]").forEach((select) => select.addEventListener("change", () => {
    state.presetUninstallScope = select.value || "project";
  }));
  document.querySelectorAll("[data-preset-uninstall-confirm]").forEach((input) => input.addEventListener("input", () => {
    state.presetUninstallConfirm = input.value;
  }));
  document.querySelectorAll("[data-preset-fill-confirm]").forEach((button) => button.addEventListener("click", () => {
    state.presetUninstallConfirm = button.dataset.presetFillConfirm || "";
    app();
  }));
  document.querySelectorAll("[data-preset-check]").forEach((button) => button.addEventListener("click", () => runPresetAction("check", { id: button.dataset.presetCheck || "" })));
  document.querySelectorAll("[data-preset-install]").forEach((button) => button.addEventListener("click", () => runPresetAction("install", {
    source: state.presetInstallSource,
    scope: state.presetInstallScope,
    force: state.presetInstallForce,
  })));
  document.querySelectorAll("[data-preset-seed]").forEach((button) => button.addEventListener("click", () => runPresetAction("seed", {
    scope: state.presetSeedScope,
    force: state.presetSeedForce,
  })));
  document.querySelectorAll("[data-preset-uninstall]").forEach((button) => button.addEventListener("click", () => runPresetAction("uninstall", {
    id: button.dataset.presetUninstall || "",
    scope: state.presetUninstallScope,
    confirmText: state.presetUninstallConfirm,
  })));
  document.querySelectorAll("[data-review-queue-tab]").forEach((button) => button.addEventListener("click", () => {
    state.reviewQueueTab = button.dataset.reviewQueueTab || "review";
    state.reviewQueuePage = 1;
    app();
  }));
  document.querySelectorAll("[data-review-reason-filter]").forEach((select) => select.addEventListener("change", () => {
    state.reviewReasonFilter = select.value || "all";
    state.reviewQueuePage = 1;
    app();
  }));
  document.querySelectorAll("[data-review-sort]").forEach((select) => select.addEventListener("change", () => {
    state.reviewSort = select.value || "queue";
    state.reviewQueuePage = 1;
    app();
  }));
  document.querySelectorAll("[data-page-kind]").forEach((button) => button.addEventListener("click", () => {
    const page = Math.max(1, Number(button.dataset.page) || 1);
    if (button.dataset.pageKind === "warning") state.warningPage = page;
    if (button.dataset.pageKind === "task-groups") state.taskGroupPage = page;
    if (button.dataset.pageKind === "task") state.taskPageByGroup[button.dataset.pageGroup || ""] = page;
    if (button.dataset.pageKind === "review") state.reviewQueuePage = page;
    app();
  }));
  document.querySelectorAll("[data-runway-phase]").forEach((link) => link.addEventListener("click", () => {
    const phase = link.dataset.runwayPhase || "all";
    if (phase === "module-classification") state.taskGroupMode = "module";
    if (["triage", "active-task-contracts", "strict-cutover"].includes(phase)) state.warningFilter = phase === "triage" ? "all" : phase;
    state.warningPage = 1;
    state.taskGroupPage = 1;
    if (link.getAttribute("href") === "#/") app();
  }));
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : state.theme === "light" ? "system" : "dark";
    localStorage.setItem("harness.theme", state.theme);
    app();
  }));
  document.querySelectorAll("[data-language-toggle]").forEach((button) => button.addEventListener("click", () => {
    setLocale(locale === "zh" ? "en" : "zh");
    app();
  }));
  document.querySelectorAll("[data-open-drawer]").forEach((el) => el.addEventListener("click", (e) => {
    e.preventDefault();
    const taskId = el.dataset.openDrawer;
    openDrawer(taskId);
  }));
  bindCopyTaskNameButtons(document);
  bindPresetCopyButtons(document);
  bindRepairPromptButtons(document);
  bindLessonSedimentationButtons(document);
  document.querySelectorAll("[data-open-lesson-drawer]").forEach((el) => el.addEventListener("click", (e) => {
    e.preventDefault();
    const lessonId = el.dataset.openLessonDrawer;
    openLessonDrawer(lessonId);
  }));
  document.querySelectorAll("[data-review-complete]").forEach((button) => button.addEventListener("click", () => completeReviewFromDashboard(button.dataset.reviewComplete)));
  const overlay = document.getElementById("drawer-overlay");
  if (overlay) overlay.addEventListener("click", closeDrawer);
}

async function loadRuntime() {
  if (state.runtimeLoaded || window.__HARNESS_WORKBENCH__ !== true || !/^https?:$/.test(window.location.protocol)) return;
  state.runtimeLoaded = true;
  try {
    const response = await fetch("/api/runtime", { cache: "no-store" });
    if (!response.ok) return;
    state.runtime = await response.json();
    startRuntimePolling();
    app();
  } catch {
    state.runtime = { mode: "static", csrfToken: "", writableActions: [] };
  }
}

function startRuntimePolling() {
  if (!state.runtime?.autoRefresh || state.runtimePoller) return;
  state.runtimePoller = setInterval(async () => {
    try {
      const response = await fetch("/api/runtime", { cache: "no-store" });
      if (!response.ok) return;
      const nextRuntime = await response.json();
      if (state.runtime?.snapshotVersion && nextRuntime.snapshotVersion !== state.runtime.snapshotVersion) {
        window.location.reload();
        return;
      }
      state.runtime = nextRuntime;
    } catch {
      clearInterval(state.runtimePoller);
      state.runtimePoller = null;
    }
  }, 1500);
}

async function completeReviewFromDashboard(taskId) {
  const result = document.querySelector(`[data-review-result="${CSS.escape(taskId)}"]`);
  const checkbox = document.querySelector(`[data-review-confirm-check="${CSS.escape(taskId)}"]`);
  const confirmInput = document.querySelector(`[data-review-confirm-text="${CSS.escape(taskId)}"]`);
  const task = (bundle.status?.tasks || []).find((item) => item.id === taskId);
  if (!checkbox?.checked) {
    if (result) result.textContent = t("reviewChecklistRequired");
    return;
  }
  if (!confirmInput?.value || ![task?.shortId, task?.id].includes(confirmInput.value.trim())) {
    if (result) result.textContent = t("reviewConfirmTextMismatch");
    return;
  }
  if (result) result.textContent = t("reviewSubmitting");
  try {
    const response = await fetch("/api/tasks/review-complete", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify({
        taskId,
        confirmText: confirmInput.value.trim(),
        reviewer: "Human Reviewer",
        message: "confirmed from dashboard workbench",
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || t("reviewCompleteFailed"));
    if (result) result.textContent = t("reviewCompleteSuccess");
    setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    if (result) result.textContent = `${t("reviewCompleteFailed")}: ${error.message}`;
  }
}

async function runPresetAction(action, body) {
  state.presetActionResult = { ok: true, title: t("presetActionRunning"), message: action };
  app();
  try {
    const response = await fetch(`/api/presets/${action}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw payload;
    state.presetActionResult = {
      ok: true,
      title: t("presetActionSuccess"),
      message: presetActionMessage(action, payload),
    };
    app();
    if (["install", "seed", "uninstall"].includes(action)) setTimeout(() => window.location.reload(), 650);
  } catch (error) {
    state.presetActionResult = {
      ok: false,
      title: t("presetActionFailed"),
      message: error?.error || error?.message || String(error || action),
    };
    app();
  }
}

function presetActionMessage(action, payload) {
  if (action === "check") return `${payload.id || ""} ${payload.status || ""}`.trim();
  if (action === "install") return `${payload.id || ""} -> ${payload.scope || ""}`.trim();
  if (action === "seed") return `${payload.created || 0} ${t("created")} · ${payload.skipped || 0} ${t("skipped")}`;
  if (action === "uninstall") return `${payload.id || ""} ${payload.removed ? t("removed") : t("notInstalled")}`.trim();
  return action;
}

function renderDrawerContent(taskId) {
  const task = (bundle.status?.tasks || []).find((item) => item.id === taskId);
  if (!task) return `<div class="empty">${t("taskNotFound")}</div>`;

  const header = `
    <div class="task-drawer-header">
      <div>
        <h2>${escapeHtml(task.title)}</h2>
        <p style="font-family: var(--font-mono); font-size: 11px; margin: 4px 0 0; color: var(--muted);">${escapeHtml(task.id)}</p>
        ${taskCopyButton(task, "detail-copy")}
      </div>
      <button class="btn-close" data-close-drawer>×</button>
    </div>
  `;

  const timeline = phaseTimeline(task);
  const documents = taskDocumentLibrary(task, "");
  const findings = openFindings(task);
  const evidence = evidenceList(task);

  const body = `
    <div class="task-drawer-body stack">
      <div class="drawer-task-summary">
        <div>
          <span>${t("statOverall")}</span>
          <strong>${task.completion}%</strong>
        </div>
        <a href="#/tasks/${encodeURIComponent(task.id)}" class="btn-drawer-trigger">${t("fullView")}</a>
      </div>
      ${taskStateSummary(task)}
      ${reviewActionPanel(task, { mode: "summary" })}
      ${lessonCandidatePanel(task, { context: "drawer" })}
      ${timeline}
      ${documents}
      ${findings}
      ${evidence}
    </div>
  `;

  return header + body;
}

function openDrawer(taskId) {
  const drawer = document.getElementById("task-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (!drawer || !overlay) return;
  drawer.innerHTML = renderDrawerContent(taskId);
  drawer.classList.add("active");
  overlay.classList.add("active");

  drawer.querySelector("[data-close-drawer]").addEventListener("click", closeDrawer);
  drawer.querySelectorAll("[data-render-toggle]").forEach((button) => button.addEventListener("click", () => {
    state.renderMode = state.renderMode === "rendered" ? "source" : "rendered";
    openDrawer(taskId);
  }));
  bindCopyTaskNameButtons(drawer);
  bindRepairPromptButtons(drawer);
  bindLessonSedimentationButtons(drawer);
  drawer.querySelectorAll("[data-review-complete]").forEach((button) => button.addEventListener("click", () => completeReviewFromDashboard(button.dataset.reviewComplete)));
}

function bindCopyTaskNameButtons(root) {
  root.querySelectorAll("[data-copy-task-name]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const taskName = button.dataset.copyTaskName || "";
    const defaultText = t("copyTaskNameShort");
    try {
      await copyText(taskName);
      button.textContent = t("copyTaskNameSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    window.setTimeout(() => {
      button.textContent = defaultText;
    }, 1400);
  }));
}

function bindPresetCopyButtons(root) {
  root.querySelectorAll("[data-copy-preset-id]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const presetId = button.dataset.copyPresetId || "";
    const defaultText = button.textContent;
    try {
      await copyText(presetId);
      button.textContent = t("copyTaskNameSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    setTimeout(() => { button.textContent = defaultText; }, 1200);
  }));
  root.querySelectorAll("[data-copy-preset-command]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const command = button.dataset.copyPresetCommand || "";
    const defaultText = button.textContent;
    try {
      await copyText(command);
      button.textContent = t("copyTaskNameSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    setTimeout(() => { button.textContent = defaultText; }, 1200);
  }));
}

function bindRepairPromptButtons(root) {
  root.querySelectorAll("[data-copy-repair-prompt]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const prompt = button.dataset.repairPrompt || "";
    const defaultText = t("copyRepairPrompt");
    try {
      await copyText(prompt);
      button.textContent = t("copyRepairPromptSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    window.setTimeout(() => {
      button.textContent = defaultText;
    }, 1400);
  }));
}

function bindLessonSedimentationButtons(root) {
  root.querySelectorAll("[data-copy-lesson-prompt]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const prompt = button.dataset.lessonPrompt || "";
    const defaultText = t("copyLessonPrompt");
    try {
      await copyText(prompt);
      button.textContent = t("copyRepairPromptSuccess");
    } catch {
      button.textContent = t("copyTaskNameFailed");
    }
    window.setTimeout(() => {
      button.textContent = defaultText;
    }, 1400);
  }));
  root.querySelectorAll("[data-create-lesson-sedimentation]").forEach((button) => button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    await createLessonSedimentationFromDashboard(button);
  }));
}

async function createLessonSedimentationFromDashboard(button) {
  const taskId = button.dataset.createLessonSedimentation || "";
  const candidateId = button.dataset.candidateId || "";
  const result = document.querySelector(`[data-lesson-result="${CSS.escape(`${taskId}:${candidateId}`)}"]`);
  if (result) result.textContent = t("lessonTaskCreating");
  button.disabled = true;
  try {
    const response = await fetch("/api/tasks/lesson-sedimentation", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-harness-csrf": state.runtime?.csrfToken || "",
      },
      body: JSON.stringify({ taskId, candidateId }),
    });
    const payload = await response.json();
    if (!response.ok) throw payload;
    if (result) {
      result.innerHTML = lessonSedimentationSuccess(payload);
      bindLessonSedimentationButtons(result);
      result.scrollIntoView({ block: "center", inline: "nearest" });
    }
  } catch (error) {
    button.disabled = false;
    if (result) result.innerHTML = lessonSedimentationFailure(error);
  }
}

function lessonSedimentationSuccess(payload) {
  const followUp = payload?.followUpTask || {};
  const prompt = payload?.prompt || "";
  const taskId = followUp.id || "";
  const openHref = taskId ? `#/tasks/${encodeURIComponent(taskId)}` : "#/review";
  return `<div class="workbench-action-result success">
    <strong>${escapeHtml(t("lessonTaskCreated"))}</strong>
    ${taskId ? `<a href="${openHref}">${escapeHtml(t("openFollowUpTask"))}</a>` : ""}
    ${prompt ? `<button data-copy-lesson-prompt="${escapeAttr(taskId || "follow-up")}" data-lesson-prompt="${escapeAttr(prompt)}">${escapeHtml(t("copyLessonPrompt"))}</button>` : ""}
  </div>`;
}

function lessonSedimentationFailure(error) {
  const message = error?.error || error?.message || t("lessonTaskCreateFailed");
  const recovery = Array.isArray(error?.recovery) ? error.recovery : [];
  const details = error?.details || {};
  const existingTask = details.followUpTask || details.existingTask || "";
  return `<div class="workbench-action-result failed">
    <strong>${escapeHtml(t("lessonTaskCreateFailed"))}</strong>
    <span>${escapeHtml(message)}</span>
    ${existingTask ? `<a href="#/tasks/${encodeURIComponent(existingTask)}">${escapeHtml(t("openFollowUpTask"))}</a>` : ""}
    ${recovery.length ? `<ul>${recovery.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : ""}
  </div>`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

function renderLessonDrawerContent(lessonId) {
  const lesson = lessonDocuments().find((item) => item.id === lessonId);

  if (!lesson) {
    return `<div class="task-drawer-header">
      <h2>${escapeHtml(lessonId)}</h2>
      <button class="btn-close" data-close-drawer>×</button>
    </div>
    <div class="task-drawer-body">
      <div class="empty">${t("lessonNotFound")}</div>
    </div>`;
  }

  const doc = lesson.doc || findDocument(lesson.path);

  const header = `
    <div class="task-drawer-header">
      <div>
        <h2>${escapeHtml(lessonId)}</h2>
        <p style="font-size: 12px; margin: 4px 0 0; color: var(--muted); font-weight: 600;">${escapeHtml(lesson.title || lesson.path)}</p>
      </div>
      <button class="btn-close" data-close-drawer>×</button>
    </div>
  `;

  let markdownBody = "";
  if (doc && doc.content) {
    markdownBody = `<div class="markdown">${window.HarnessMarkdown.render(doc.content, "rendered")}</div>`;
  } else {
    markdownBody = `
      <div style="margin-bottom: 20px; background: var(--paper-2); padding: 16px; border-radius: 8px; border: 1px dashed var(--line);">
        <p style="margin: 0; font-size: 13px; color: var(--muted);">${t("lessonDocMissing")}</p>
      </div>
    `;
  }

  const body = `
    <div class="task-drawer-body stack">
      ${markdownBody}
    </div>
  `;

  return header + body;
}

function openLessonDrawer(lessonId) {
  const drawer = document.getElementById("task-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (!drawer || !overlay) return;
  drawer.innerHTML = renderLessonDrawerContent(lessonId);
  drawer.classList.add("active");
  overlay.classList.add("active");

  drawer.querySelector("[data-close-drawer]").addEventListener("click", closeDrawer);
}

function closeDrawer() {
  const drawer = document.getElementById("task-drawer");
  const overlay = document.getElementById("drawer-overlay");
  if (drawer) drawer.classList.remove("active");
  if (overlay) overlay.classList.remove("active");
}

function ledgerPanel() {
  const ledgerTable = (bundle.tables?.tables || []).find((table) => table.kind === "harness-ledger");
  const rows = ledgerTable?.rows || [];

  let closedCount = 0;
  let openCount = 0;
  let blockedCount = 0;

  let lessonsReviewed = 0;
  let lessonsTotal = 0;

  let evidenceAudited = 0;
  let evidenceTotal = 0;

  for (const row of rows) {
    const cells = row.cells || {};
    const status = String(cells.Status || cells["\u72b6\u6001"] || "").toLowerCase();
    if (status.includes("close") || status.includes("done") || status.includes("\u7ed3") || status.includes("\u5b8c")) {
      closedCount++;
    } else if (status.includes("block") || status.includes("\u963b")) {
      blockedCount++;
    } else {
      openCount++;
    }

    const lesson = String(cells.Lessons || cells["\u7ecf\u9a8c"] || cells["\u7ecf\u9a8c\u5ba1\u67e5"] || cells["Lesson"] || "");
    if (lesson) {
      lessonsTotal++;
      if (lesson.toLowerCase().includes("pass") || lesson.includes("\u901a\u8fc7") || lesson.includes("\u5c31\u7eea") || lesson.toLowerCase().includes("checked") || lesson.toLowerCase().includes("done")) {
        lessonsReviewed++;
      }
    }

    const evidence = String(cells.Evidence || cells["\u8bc1\u636e"] || cells["\u9a8c\u8bc1\u8bc1\u636e"] || cells["Evidence Checked"] || "");
    if (evidence) {
      evidenceTotal++;
      if (evidence.toLowerCase().includes("pass") || evidence.includes("\u901a\u8fc7") || evidence.toLowerCase().includes("present") || evidence.toLowerCase().includes("verified") || evidence.toLowerCase().includes("done")) {
        evidenceAudited++;
      }
    }
  }

  const total = closedCount + openCount + blockedCount || 1;
  const closedPct = Math.round((closedCount / total) * 100);
  const openPct = Math.round((openCount / total) * 100);
  const blockedPct = total - closedPct - openPct;

  const lessonsPct = lessonsTotal ? Math.round((lessonsReviewed / lessonsTotal) * 100) : 0;
  const evidencePct = evidenceTotal ? Math.round((evidenceAudited / evidenceTotal) * 100) : 0;

  if (rows.length === 0) return "";

  return `<section class="ledger-panel">
    <h2>${t("ssotLedger")}</h2>
    <div class="ledger-split-bar" title="${t("tagClosed")}: ${closedCount}, ${t("tagOpen")}: ${openCount}, ${t("tagBlocked")}: ${blockedCount}">
      <div class="ledger-split-segment closed" style="width: ${closedPct}%"></div>
      <div class="ledger-split-segment open" style="width: ${openPct}%"></div>
      <div class="ledger-split-segment blocked" style="width: ${Math.max(0, blockedPct)}%"></div>
    </div>
    <div class="ledger-split-legend">
      <span class="ledger-split-legend-item"><i class="ledger-split-legend-dot closed"></i>${t("tagClosed")} (${closedCount})</span>
      <span class="ledger-split-legend-item"><i class="ledger-split-legend-dot open"></i>${t("tagOpen")} (${openCount})</span>
      <span class="ledger-split-legend-item"><i class="ledger-split-legend-dot blocked"></i>${t("tagBlocked")} (${blockedCount})</span>
    </div>
    <div class="ledger-gauge-row">
      <div class="ledger-gauge-card">
        <span>${t("lessonsCheckRate")}</span>
        <strong>${lessonsPct}%</strong>
      </div>
      <div class="ledger-gauge-card">
        <span>${t("evidenceAuditRate")}</span>
        <strong>${evidencePct}%</strong>
      </div>
    </div>
  </section>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

window.addEventListener("hashchange", app);
app();
loadRuntime();
