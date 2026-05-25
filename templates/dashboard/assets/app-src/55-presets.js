function presetsView() {
  ensurePresetState();
  const catalog = bundle.presetCatalog || { summary: {}, roots: [], presets: [] };
  const presets = filteredPresets();
  const selected = selectedPreset(presets);
  syncPresetUninstallScope(selected);
  return `<div class="dashboard-grid presets-page">
    <main class="dashboard-main stack">
      <section class="flow-panel preset-catalog-panel">
        <div class="section-head">
          <div>
            <p class="eyebrow">${t("presetCatalog")}</p>
            <h2>${t("presetCatalog")}</h2>
            <p class="subtle">${t("presetCatalogSubtitle")}</p>
          </div>
          <span class="subtle">${presets.length}/${catalog.summary?.total || 0}</span>
        </div>
        <div class="preset-toolbar">
          <div class="input-group">
            <input data-preset-search value="${escapeAttr(state.presetQuery)}" placeholder="${t("presetSearchPlaceholder")}" aria-label="${t("presetSearch")}">
          </div>
          <div class="preset-source-tabs" role="tablist" aria-label="${escapeAttr(t("presetSourceFilter"))}">
            ${presetSourceOptions().map((source) => presetSourceButton(source)).join("")}
          </div>
        </div>
        <div class="preset-catalog-grid">
          ${presets.map((preset) => presetCard(preset, selected ? presetKey(selected) : "")).join("") || emptyState(t("noPresets"))}
        </div>
      </section>
    </main>
    <aside class="dashboard-sidebar stack">
      ${presetSummaryPanel(catalog)}
      ${presetDetailPanel(selected)}
      ${presetActionPanel(selected)}
    </aside>
  </div>`;
}

function ensurePresetState() {
  const presets = bundle.presetCatalog?.presets || [];
  if (!state.selectedPresetKey && state.selectedPresetId) {
    const legacySelection = presets.find((preset) => preset.id === state.selectedPresetId);
    if (legacySelection) state.selectedPresetKey = presetKey(legacySelection);
  }
  if (!state.selectedPresetKey && presets[0]) state.selectedPresetKey = presetKey(presets[0]);
  if (state.selectedPresetKey && !presets.some((preset) => presetKey(preset) === state.selectedPresetKey) && presets[0]) {
    state.selectedPresetKey = presetKey(presets[0]);
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
    if (!query) return true;
    return [
      preset.id,
      preset.source,
      preset.purpose,
      preset.taskKind,
      preset.manifestPath,
      ...(preset.compatibleBudgets || []),
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
}

function selectedPreset(visiblePresets = filteredPresets()) {
  return visiblePresets.find((preset) => presetKey(preset) === state.selectedPresetKey) || visiblePresets[0] || null;
}

function presetCard(preset, selectedId) {
  const key = presetKey(preset);
  const selected = key === selectedId;
  return `<article class="preset-card ${selected ? "active" : ""}">
    <button type="button" class="preset-card-select" data-preset-select="${escapeAttr(key)}" aria-pressed="${selected ? "true" : "false"}">
      <span class="card-id">${escapeHtml(preset.id)}</span>
      ${presetSourceBadge(preset.source)}
    </button>
    <p>${escapeHtml(preset.purpose || t("none"))}</p>
    <div class="preset-card-meta">
      <span>${t("version")}: ${escapeHtml(preset.version)}</span>
      <span>${t("taskKind")}: ${escapeHtml(preset.taskKind || t("none"))}</span>
      <span>${t("budgets")}: ${escapeHtml((preset.compatibleBudgets || []).join(", ") || t("none"))}</span>
      <span>${escapeHtml(preset.effective ? t("presetEffective") : t("presetShadowed"))}</span>
    </div>
    <code class="preset-manifest-path">${escapeHtml(preset.manifestPath || "")}</code>
  </article>`;
}

function presetKey(preset) {
  return preset?.key || `${preset?.source || "unknown"}:${preset?.id || ""}`;
}

function syncPresetUninstallScope(preset) {
  if (preset && ["project", "user"].includes(preset.source)) state.presetUninstallScope = preset.source;
}

function presetSourceBadge(source) {
  const normalized = String(source || "unknown");
  return `<span class="tag">${escapeHtml(t(`presetSource_${normalized}`) || normalized)}</span>`;
}

function presetSummaryPanel(catalog) {
  const roots = catalog.roots || [];
  return `<section class="side-panel preset-summary-panel">
    <h3>${t("presetSources")}</h3>
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
  if (!preset) return `<section class="side-panel">${emptyState(t("noPresets"))}</section>`;
  return `<section class="side-panel preset-detail-panel">
    <h3>${escapeHtml(preset.id)}</h3>
    <p>${escapeHtml(preset.purpose || "")}</p>
    <dl class="preset-detail-list">
      <div><dt>${t("version")}</dt><dd>${escapeHtml(preset.version)}</dd></div>
      <div><dt>${t("source")}</dt><dd>${escapeHtml(preset.source)}</dd></div>
      <div><dt>${t("status")}</dt><dd>${escapeHtml(preset.effective ? t("presetEffective") : t("presetShadowed"))}</dd></div>
      <div><dt>${t("taskKind")}</dt><dd>${escapeHtml(preset.taskKind || t("none"))}</dd></div>
      <div><dt>${t("inputs")}</dt><dd>${preset.inputCount || 0}</dd></div>
      <div><dt>${t("references")}</dt><dd>${preset.referenceCount || 0}</dd></div>
      <div><dt>${t("artifacts")}</dt><dd>${preset.artifactCount || 0}</dd></div>
      <div><dt>${t("writeScopes")}</dt><dd>${preset.writeScopeCount || 0}</dd></div>
      <div><dt>${t("requiredReads")}</dt><dd>${preset.requiredReadCount || 0}</dd></div>
    </dl>
    <code class="preset-manifest-path">${escapeHtml(preset.manifestPath || "")}</code>
    <div class="preset-command-list">
      <code>harness preset inspect ${escapeHtml(preset.id)} --json .</code>
      <code>harness preset check ${escapeHtml(preset.id)} --json .</code>
    </div>
  </section>`;
}

function presetActionPanel(preset) {
  const staticNote = canUseWorkbenchAction("preset-install") ? "" : `<p class="lesson-action-note">${escapeHtml(t("presetWorkbenchRequired"))}</p>`;
  const lockedUninstallScope = preset && ["project", "user"].includes(preset.source) ? preset.source : "";
  return `<section class="side-panel preset-action-panel">
    <h3>${t("presetActions")}</h3>
    ${staticNote}
    ${presetActionResult()}
    <div class="preset-action-group">
      <h4>${t("presetCheck")}</h4>
      <button data-preset-check="${escapeAttr(preset?.id || "")}" ${canUseWorkbenchAction("preset-check") && preset ? "" : "disabled"}>${t("presetCheck")}</button>
    </div>
    <div class="preset-action-group">
      <h4>${t("presetInstall")}</h4>
      <label>${t("source")}<input data-preset-install-source value="${escapeAttr(state.presetInstallSource)}" placeholder="${t("presetInstallSourcePlaceholder")}"></label>
      <label>${t("scope")}<select data-preset-install-scope>
        ${presetScopeOptions(state.presetInstallScope)}
      </select></label>
      <label class="check-row"><input type="checkbox" data-preset-install-force ${state.presetInstallForce ? "checked" : ""}> ${t("forceOverwrite")}</label>
      <button data-preset-install ${canUseWorkbenchAction("preset-install") ? "" : "disabled"}>${t("presetInstall")}</button>
    </div>
    <div class="preset-action-group">
      <h4>${t("presetSeed")}</h4>
      <label>${t("scope")}<select data-preset-seed-scope>
        ${presetScopeOptions(state.presetSeedScope)}
      </select></label>
      <label class="check-row"><input type="checkbox" data-preset-seed-force ${state.presetSeedForce ? "checked" : ""}> ${t("forceOverwrite")}</label>
      <button data-preset-seed ${canUseWorkbenchAction("preset-seed") ? "" : "disabled"}>${t("presetSeed")}</button>
    </div>
    <div class="preset-action-group danger">
      <h4>${t("presetUninstall")}</h4>
      <label>${t("scope")}<select data-preset-uninstall-scope ${lockedUninstallScope ? "disabled" : ""}>
        ${presetScopeOptions(lockedUninstallScope || state.presetUninstallScope)}
      </select></label>
      <label>${t("confirmPresetId")}<input data-preset-uninstall-confirm value="${escapeAttr(state.presetUninstallConfirm)}" placeholder="${escapeAttr(preset?.id || "")}"></label>
      <button data-preset-uninstall="${escapeAttr(preset?.id || "")}" ${canUseWorkbenchAction("preset-uninstall") && preset && preset.source !== "builtin" ? "" : "disabled"}>${t("presetUninstall")}</button>
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
