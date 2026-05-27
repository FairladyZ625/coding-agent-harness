#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appJs = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/app.js"), "utf8")
    .replace(/\nwindow\.addEventListener\("hashchange", app\);\napp\(\);\nloadRuntime\(\);\n?$/, "\n");
const i18nJs = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/i18n.js"), "utf8");
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}
function renderWithState(mutator) {
    const sandbox = {
        window: {
            __HARNESS_LOCALE__: "en",
            __HARNESS_WORKBENCH__: true,
            __HARNESS_DASHBOARD__: {
                presetCatalog: {
                    summary: { total: 4, project: 1, user: 1, builtin: 2 },
                    roots: [
                        { source: "project", path: "PROJECT_ROOT" },
                        { source: "user", path: "USER_ROOT" },
                        { source: "builtin", path: "BUILTIN_ROOT" },
                    ],
                    presets: [
                        preset({ key: "project:dup", id: "dup", source: "project", version: 3, effective: true, purpose: "Project layer" }),
                        preset({ key: "user:dup", id: "dup", source: "user", version: 2, effective: false, purpose: "User shadow layer" }),
                        preset({ key: "builtin:dup", id: "dup", source: "builtin", version: 1, effective: false, purpose: "Bundled shadow layer" }),
                        preset({ key: "builtin:solo", id: "solo", source: "builtin", version: 1, effective: true, purpose: "Bundled solo" }),
                    ],
                },
                status: { project: { name: "Fixture" }, tasks: [], summary: {} },
                documents: { documents: [] },
                graph: { nodes: [], edges: [] },
            },
        },
        navigator: { language: "en-US", clipboard: { writeText: async () => { } } },
        localStorage: { getItem: () => "", setItem: () => { } },
        setInterval: () => 0,
        clearInterval: () => { },
    };
    sandbox.window.HarnessI18n = {};
    vm.createContext(sandbox);
    vm.runInContext(`${i18nJs}\n${appJs}\n${mutator}`, sandbox);
    return sandbox.__result;
}
function preset(overrides) {
    return {
        id: "dup",
        source: "project",
        version: 1,
        effective: true,
        purpose: "Preset fixture",
        taskKind: "fixture-task",
        compatibleBudgets: ["standard", "complex"],
        manifestPath: "LOCAL_PATH_REDACTED/preset.yaml",
        inputCount: 0,
        referenceCount: 0,
        artifactCount: 0,
        writeScopeCount: 1,
        requiredReadCount: 0,
        ...overrides,
    };
}
const hiddenSelection = renderWithState(`
  state.runtime = { mode: "workbench", writableActions: ["preset-check", "preset-install", "preset-seed", "preset-uninstall"] };
  state.presetSourceFilter = "user";
  state.selectedPresetKey = "project:dup";
  const html = presetsView();
  __result = {
    selectedKey: state.selectedPresetKey,
    hasProjectSourceDetail: html.includes("<dd>Project</dd>"),
    hasUserSourceDetail: html.includes("<dd>User</dd>"),
    html,
  };
`);
assert(hiddenSelection.selectedKey === "user:dup", "source filter should move selection to a visible preset");
assert(!hiddenSelection.hasProjectSourceDetail, "filtered user view must not keep hidden project detail actionable");
assert(hiddenSelection.hasUserSourceDetail, "filtered user view should show user-layer detail");
const searchEmpty = renderWithState(`
  state.runtime = { mode: "workbench", writableActions: ["preset-check", "preset-install", "preset-seed", "preset-uninstall"] };
  state.presetSourceFilter = "user";
  state.presetQuery = "solo";
  state.selectedPresetKey = "user:dup";
  const html = presetsView();
  __result = { selectedKey: state.selectedPresetKey, html };
`);
assert(searchEmpty.selectedKey === "", "empty filtered result should clear selected preset");
assert(!searchEmpty.html.includes('data-preset-uninstall="dup"'), "empty filtered result must not keep hidden uninstall target");
const shadowedLayer = renderWithState(`
  state.runtime = { mode: "workbench", writableActions: ["preset-check", "preset-install", "preset-seed", "preset-uninstall"] };
  state.presetSourceFilter = "builtin";
  state.selectedPresetKey = "builtin:dup";
  const html = presetsView();
  __result = { html };
`);
assert(shadowedLayer.html.includes("CLI inspect/check commands resolve the effective preset by id"), "shadowed layer should warn that CLI commands target the effective layer");
assert(shadowedLayer.html.includes('data-preset-check="dup" disabled'), "shadowed layer check action should be disabled");
assert(!shadowedLayer.html.includes('data-copy-preset-command="harness preset inspect dup --json ."'), "shadowed layer should not expose copyable inspect command for the wrong layer");
const confirmGateClosed = renderWithState(`
  state.runtime = { mode: "workbench", writableActions: ["preset-check", "preset-install", "preset-seed", "preset-uninstall"] };
  state.presetSourceFilter = "user";
  state.selectedPresetKey = "user:dup";
  state.presetUninstallConfirm = "";
  __result = presetsView();
`);
assert(confirmGateClosed.includes('data-preset-uninstall="dup" disabled'), "uninstall should stay disabled until confirmation matches the selected id");
assert(confirmGateClosed.includes("Use the selected ID before uninstalling."), "uninstall confirmation gate should explain the required action");
const confirmGateOpen = renderWithState(`
  state.runtime = { mode: "workbench", writableActions: ["preset-check", "preset-install", "preset-seed", "preset-uninstall"] };
  state.presetSourceFilter = "user";
  state.selectedPresetKey = "user:dup";
  state.presetUninstallConfirm = "dup";
  __result = presetsView();
`);
assert(confirmGateOpen.includes('data-preset-uninstall="dup" >'), "uninstall should enable only after confirmation matches the selected id");
const staleConfirmAfterFilter = renderWithState(`
  state.runtime = { mode: "workbench", writableActions: ["preset-check", "preset-install", "preset-seed", "preset-uninstall"] };
  state.presetSourceFilter = "project";
  state.selectedPresetKey = "";
  state.presetUninstallConfirm = "dup";
  const html = presetsView();
  __result = { confirm: state.presetUninstallConfirm, html };
`);
assert(staleConfirmAfterFilter.confirm === "", "auto-selecting a new layer after filter changes should clear stale uninstall confirmation");
assert(staleConfirmAfterFilter.html.includes('data-preset-uninstall="dup" disabled'), "stale confirmation must not enable uninstall for a different same-id layer");
console.log("Dashboard preset UI tests passed");
