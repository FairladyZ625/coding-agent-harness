function presetsView() {
  ensurePresetState();
  const catalog = bundle.presetCatalog || { summary: {}, roots: [], presets: [] };
  let presets = filteredPresets();
  syncVisiblePresetSelection(presets);
  presets = filteredPresets();
  const selected = selectedPreset(presets);
  syncPresetUninstallScope(selected);
  return `<div class="presets-page stack">
    <section class="flow-panel preset-command-center">
      <div class="section-head">
        <div>
          <p class="eyebrow">${t("presetCatalog")}</p>
          <h2>${t("presetCatalog")}</h2>
          <p class="subtle">${t("presetCatalogSubtitle")}</p>
        </div>
        <span class="preset-count-pill">${presets.length}/${catalog.summary?.total || 0}</span>
      </div>
      <div class="preset-priority-strip" aria-label="${escapeAttr(t("presetPriorityTitle"))}">
        ${presetPriorityStep("project", 1)}
        ${presetPriorityStep("user", 2)}
        ${presetPriorityStep("builtin", 3)}
      </div>
      <div class="preset-toolbar">
        <div class="input-group">
          <input data-preset-search value="${escapeAttr(state.presetQuery)}" placeholder="${escapeAttr(t("presetSearchPlaceholder"))}" aria-label="${escapeAttr(t("presetSearch"))}">
        </div>
        <div class="preset-source-tabs" role="tablist" aria-label="${escapeAttr(t("presetSourceFilter"))}">
          ${presetSourceOptions().map((source) => presetSourceButton(source)).join("")}
        </div>
      </div>
    </section>
    <section class="preset-workspace">
      <div class="flow-panel preset-collection-panel">
        <div class="preset-panel-heading">
          <div>
            <h3>${t("presetCollection")}</h3>
            <p>${t("presetCollectionHint")}</p>
          </div>
        </div>
        <div class="preset-catalog-list">
          ${presets.map((preset) => presetCard(preset, selected ? presetKey(selected) : "")).join("") || emptyState(t("noPresets"))}
        </div>
      </div>
      <div class="preset-detail-workspace stack">
        ${presetDetailPanel(selected)}
        ${presetLayerStackPanel(selected)}
      </div>
      <aside class="preset-context-actions stack">
        ${presetActionPanel(selected)}
        ${presetImportPanel()}
        ${presetRestorePanel()}
        ${presetSummaryPanel(catalog)}
      </aside>
    </section>
  </div>`;
}

function ensurePresetState() {
  const presets = bundle.presetCatalog?.presets || [];
  if (!state.selectedPresetKey && state.selectedPresetId) {
    const legacySelection = presets.find((preset) => preset.id === state.selectedPresetId);
    if (legacySelection) state.selectedPresetKey = presetKey(legacySelection);
  }
  if (!state.selectedPresetKey && presets[0]) {
    state.selectedPresetKey = presetKey(presets[0]);
    state.presetUninstallConfirm = "";
  }
  if (state.selectedPresetKey && !presets.some((preset) => presetKey(preset) === state.selectedPresetKey) && presets[0]) {
    state.selectedPresetKey = presetKey(presets[0]);
    state.presetUninstallConfirm = "";
  }
}

function presetSourceOptions() {
  return [
    ["all", t("allPresets")],
    ["project", t("presetSourceProject")],
    ["user", t("presetSourceUser")],
    ["builtin", t("presetSourceBuiltin")],
  ];
}

function presetSourceButton([source, labelText]) {
  const active = state.presetSourceFilter === source;
  const count = source === "all" ? (bundle.presetCatalog?.summary?.total || 0) : (bundle.presetCatalog?.summary?.[source] || 0);
  return `<button type="button" class="${active ? "active" : ""}" data-preset-source-filter="${escapeAttr(source)}" role="tab" aria-selected="${active ? "true" : "false"}">
    <span>${escapeHtml(labelText)}</span>
    <strong>${count}</strong>
  </button>`;
}

function filteredPresets() {
  const query = String(state.presetQuery || "").trim().toLowerCase();
  return (bundle.presetCatalog?.presets || []).filter((preset) => {
    if (state.presetSourceFilter !== "all" && preset.source !== state.presetSourceFilter) return false;
    return presetMatchesQuery(preset, query);
  });
}

function presetMatchesQuery(preset, query = state.presetQuery) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [
    preset.id,
    preset.source,
    preset.purpose,
    preset.taskKind,
    preset.manifestPath,
    preset.version,
    ...(preset.compatibleBudgets || []),
  ].some((value) => String(value || "").toLowerCase().includes(normalizedQuery));
}

function syncVisiblePresetSelection(visiblePresets) {
  if (!visiblePresets.length) {
    state.selectedPresetKey = "";
    state.presetUninstallConfirm = "";
    return;
  }
  if (!visiblePresets.some((preset) => presetKey(preset) === state.selectedPresetKey)) {
    state.selectedPresetKey = presetKey(visiblePresets[0]);
    state.presetUninstallConfirm = "";
  }
}

function selectedPreset(visiblePresets = filteredPresets()) {
  return visiblePresets.find((preset) => presetKey(preset) === state.selectedPresetKey) || visiblePresets[0] || null;
}

function presetCard(preset, selectedId) {
  const key = presetKey(preset);
  const selected = key === selectedId;
  return `<article class="preset-card ${selected ? "active" : ""} ${preset.effective ? "effective" : "shadowed"}">
    <div class="preset-card-topline">
      <button type="button" class="preset-card-select" data-preset-select="${escapeAttr(key)}" aria-pressed="${selected ? "true" : "false"}">
        <span class="card-id">${escapeHtml(preset.id)}</span>
      </button>
      <div class="preset-card-tools">
        ${presetSourceBadge(preset.source)}
        ${presetStatusBadge(preset)}
        <button type="button" class="copy-inline" data-copy-preset-id="${escapeAttr(preset.id)}" title="${escapeAttr(t("copyPresetId"))}">${t("copyIdShort")}</button>
      </div>
    </div>
    <button type="button" class="preset-card-body" data-preset-select="${escapeAttr(key)}">
      <span>${escapeHtml(preset.purpose || t("none"))}</span>
    </button>
    <div class="preset-card-meta">
      <span>${t("manifestVersion")}: ${escapeHtml(formatPresetVersion(preset))}</span>
      <span>${t("taskKind")}: ${escapeHtml(preset.taskKind || t("none"))}</span>
      <span>${t("budgets")}: ${escapeHtml((preset.compatibleBudgets || []).join(", ") || t("none"))}</span>
    </div>
    <code class="preset-manifest-path">${escapeHtml(preset.manifestPath || "")}</code>
  </article>`;
}

function presetKey(preset) {
  return preset?.key || `${preset?.source || "unknown"}:${preset?.id || ""}`;
}

function presetSourceRank(source) {
  return { project: 1, user: 2, builtin: 3 }[source] || 9;
}

function presetLayersForId(id) {
  return (bundle.presetCatalog?.presets || [])
    .filter((preset) => preset.id === id)
    .sort((a, b) => presetSourceRank(a.source) - presetSourceRank(b.source));
}

function syncPresetUninstallScope(preset) {
  if (preset && ["project", "user"].includes(preset.source)) state.presetUninstallScope = preset.source;
}

function presetPriorityStep(source, index) {
  return `<div class="preset-priority-step">
    <span>${index}</span>
    <strong>${escapeHtml(t(`presetSource_${source}`) || source)}</strong>
  </div>`;
}

function presetSourceBadge(source) {
  const normalized = String(source || "unknown");
  return `<span class="tag preset-source-badge ${escapeAttr(normalized)}">${escapeHtml(t(`presetSource_${normalized}`) || normalized)}</span>`;
}

function presetStatusBadge(preset) {
  return `<span class="tag ${preset.effective ? "pass" : "warn"}">${escapeHtml(preset.effective ? t("presetEffective") : t("presetShadowed"))}</span>`;
}

function formatPresetVersion(preset) {
  return preset?.version ?? t("none");
}

function presetSummaryPanel(catalog) {
  const roots = catalog.roots || [];
  return `<section class="side-panel preset-summary-panel">
    <h3>${t("presetSources")}</h3>
    <p class="preset-helper">${t("presetSourcesHint")}</p>
    <div class="metrics-grid compact">
      ${metric(t("presetSourceProject"), catalog.summary?.project || 0)}
      ${metric(t("presetSourceUser"), catalog.summary?.user || 0)}
      ${metric(t("presetSourceBuiltin"), catalog.summary?.builtin || 0)}
    </div>
    <div class="preset-roots">
      ${roots.map((root) => `<div><strong>${escapeHtml(t(`presetSource_${root.source}`) || root.source)}</strong><code>${escapeHtml(root.path || "")}</code></div>`).join("")}
    </div>
  </section>`;
}

function presetDetailPanel(preset) {
  if (!preset) return `<section class="flow-panel preset-detail-panel">${emptyState(t("noPresets"))}</section>`;
  const inspectCommand = `harness preset inspect ${preset.id} --json .`;
  const checkCommand = `harness preset check ${preset.id} --json .`;
  const commandRows = preset.effective
    ? `${presetCommandRow(inspectCommand)}${presetCommandRow(checkCommand)}`
    : `<div class="preset-command-warning">${escapeHtml(t("presetCommandsEffectiveOnly"))}</div>`;
  return `<section class="flow-panel preset-detail-panel">
    <div class="preset-detail-hero">
      <div>
        <div class="preset-detail-title-row">
          <h3>${escapeHtml(preset.id)}</h3>
          <button type="button" class="copy-inline" data-copy-preset-id="${escapeAttr(preset.id)}">${t("copyPresetId")}</button>
        </div>
        <p>${escapeHtml(preset.purpose || "")}</p>
      </div>
      <div class="preset-detail-badges">
        ${presetSourceBadge(preset.source)}
        ${presetStatusBadge(preset)}
      </div>
    </div>
    <dl class="preset-detail-list">
      ${presetDetailRow(t("manifestVersion"), formatPresetVersion(preset))}
      ${presetDetailRow(t("source"), t(`presetSource_${preset.source}`) || preset.source)}
      ${presetDetailRow(t("status"), preset.effective ? t("presetEffective") : t("presetShadowed"))}
      ${presetDetailRow(t("taskKind"), preset.taskKind || t("none"))}
      ${presetDetailRow(t("budgets"), (preset.compatibleBudgets || []).join(", ") || t("none"))}
      ${presetDetailRow(t("inputs"), preset.inputCount || 0)}
      ${presetDetailRow(t("references"), preset.referenceCount || 0)}
      ${presetDetailRow(t("artifacts"), preset.artifactCount || 0)}
      ${presetDetailRow(t("writeScopes"), preset.writeScopeCount || 0)}
      ${presetDetailRow(t("requiredReads"), preset.requiredReadCount || 0)}
    </dl>
    <div class="preset-path-block">
      <span>${t("manifestPath")}</span>
      <code class="preset-manifest-path">${escapeHtml(preset.manifestPath || "")}</code>
    </div>
    <div class="preset-command-list">
      ${commandRows}
    </div>
  </section>`;
}

function presetDetailRow(labelText, value) {
  return `<div><dt>${escapeHtml(labelText)}</dt><dd>${escapeHtml(String(value ?? ""))}</dd></div>`;
}

function presetCommandRow(command) {
  return `<div class="preset-command-row">
    <code>${escapeHtml(command)}</code>
    <button type="button" class="copy-inline" data-copy-preset-command="${escapeAttr(command)}">${t("copyCommand")}</button>
  </div>`;
}

function presetLayerStackPanel(preset) {
  if (!preset) return "";
  const layers = presetLayersForId(preset.id);
  return `<section class="flow-panel preset-layer-panel">
    <div class="preset-panel-heading">
      <div>
        <h3>${t("presetLayerStack")}</h3>
        <p>${t("presetLayerStackHint")}</p>
      </div>
    </div>
    <div class="preset-layer-list">
      ${layers.map((layer) => `<button type="button" class="preset-layer-row ${presetKey(layer) === presetKey(preset) ? "active" : ""}" data-preset-select="${escapeAttr(presetKey(layer))}">
        <span class="preset-layer-rank">${presetSourceRank(layer.source)}</span>
        <span>
          <strong>${escapeHtml(t(`presetSource_${layer.source}`) || layer.source)}</strong>
          <small>${t("manifestVersion")}: ${escapeHtml(formatPresetVersion(layer))}</small>
        </span>
        ${presetStatusBadge(layer)}
      </button>`).join("")}
    </div>
  </section>`;
}

function presetActionPanel(preset) {
  const staticNote = canUseWorkbenchAction("preset-install") ? "" : `<p class="lesson-action-note">${escapeHtml(t("presetWorkbenchRequired"))}</p>`;
  const lockedUninstallScope = preset && ["project", "user"].includes(preset.source) ? preset.source : "";
  const confirmMatches = Boolean(preset && state.presetUninstallConfirm.trim() === preset.id);
  const canCheck = canUseWorkbenchAction("preset-check") && preset && preset.effective;
  const canUninstall = canUseWorkbenchAction("preset-uninstall") && preset && preset.source !== "builtin" && confirmMatches;
  return `<section class="side-panel preset-action-panel">
    <div class="preset-panel-heading">
      <div>
        <h3>${t("presetContextActions")}</h3>
        <p>${preset ? escapeHtml(preset.id) : t("noPresets")}</p>
      </div>
    </div>
    ${staticNote}
    ${presetActionResult()}
    <div class="preset-action-group">
      <h4>${t("presetCheck")}</h4>
      <p>${preset?.effective ? t("presetCheckHint") : t("presetShadowedActionHint")}</p>
      <button data-preset-check="${escapeAttr(preset?.id || "")}" ${canCheck ? "" : "disabled"}>${t("presetCheckSelected")}</button>
    </div>
    <div class="preset-action-group danger">
      <h4>${t("presetUninstallSelected")}</h4>
      <p>${preset?.source === "builtin" ? t("presetBuiltinImmutable") : t("presetUninstallHint")}</p>
      <label>${t("scope")}<select data-preset-uninstall-scope ${lockedUninstallScope ? "disabled" : ""}>
        ${presetScopeOptions(lockedUninstallScope || state.presetUninstallScope)}
      </select></label>
      <div class="preset-confirm-row">
        <label>${t("confirmPresetId")}<input data-preset-uninstall-confirm value="${escapeAttr(state.presetUninstallConfirm)}" placeholder="${escapeAttr(preset?.id || "")}"></label>
        <button type="button" data-preset-fill-confirm="${escapeAttr(preset?.id || "")}" ${preset && preset.source !== "builtin" ? "" : "disabled"}>${t("useSelectedId")}</button>
      </div>
      ${preset && preset.source !== "builtin" && !confirmMatches ? `<p class="preset-confirm-warning">${escapeHtml(t("presetConfirmRequired"))}</p>` : ""}
      <button data-preset-uninstall="${escapeAttr(preset?.id || "")}" ${canUninstall ? "" : "disabled"}>${t("presetUninstallSelected")}</button>
    </div>
  </section>`;
}

function presetImportPanel() {
  return `<section class="side-panel preset-action-panel">
    <div class="preset-panel-heading">
      <div>
        <h3>${t("presetImportTitle")}</h3>
        <p>${t("presetImportHint")}</p>
      </div>
    </div>
    <div class="preset-action-group">
      <label>${t("source")}<input data-preset-install-source value="${escapeAttr(state.presetInstallSource)}" placeholder="${escapeAttr(t("presetInstallSourcePlaceholder"))}"></label>
      <label>${t("scope")}<select data-preset-install-scope>
        ${presetScopeOptions(state.presetInstallScope)}
      </select></label>
      <label class="check-row"><input type="checkbox" data-preset-install-force ${state.presetInstallForce ? "checked" : ""}> ${t("forceOverwrite")}</label>
      <button data-preset-install ${canUseWorkbenchAction("preset-install") ? "" : "disabled"}>${t("presetInstall")}</button>
    </div>
  </section>`;
}

function presetRestorePanel() {
  return `<section class="side-panel preset-action-panel">
    <div class="preset-panel-heading">
      <div>
        <h3>${t("presetRestoreBundled")}</h3>
        <p>${t("presetRestoreBundledHint")}</p>
      </div>
    </div>
    <div class="preset-action-group">
      <label>${t("scope")}<select data-preset-seed-scope>
        ${presetScopeOptions(state.presetSeedScope)}
      </select></label>
      <label class="check-row"><input type="checkbox" data-preset-seed-force ${state.presetSeedForce ? "checked" : ""}> ${t("forceOverwrite")}</label>
      <button data-preset-seed ${canUseWorkbenchAction("preset-seed") ? "" : "disabled"}>${t("presetRestoreBundled")}</button>
    </div>
  </section>`;
}

function presetScopeOptions(current) {
  return [["project", t("presetSourceProject")], ["user", t("presetSourceUser")]]
    .map(([value, labelText]) => `<option value="${value}" ${current === value ? "selected" : ""}>${escapeHtml(labelText)}</option>`)
    .join("");
}

function presetActionResult() {
  const result = state.presetActionResult;
  if (!result) return "";
  const klass = result.ok ? "success" : "failed";
  return `<div class="workbench-action-result ${klass}">
    <strong>${escapeHtml(result.title || "")}</strong>
    <span>${escapeHtml(result.message || "")}</span>
  </div>`;
}
