#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appJs = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/app.js"), "utf8")
  .replace(/\nwindow\.addEventListener\("hashchange", app\);\napp\(\);\nloadRuntime\(\);\n?$/, "\n");
const i18nJs = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/i18n.js"), "utf8");
const css = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/app.css"), "utf8");

type DashboardTask = {
  id: string;
  shortId: string;
  title: string;
  path: string;
  state: string;
  module: string;
  inferredModule: string;
  completion: number;
  reviewStatus: string;
  reviewQueueState: string;
  closeoutStatus: string;
  visualMapStatus: string;
  briefSource: string;
  taskQueues: string[];
  queueReasons: string[];
};

type SwimlaneModel = {
  lanes: { key: string }[];
  stages: { key: string }[];
  cards: { title: string; lane: string; stage: string }[];
};

type RenderedSwimlane = {
  html: string;
  model: SwimlaneModel;
  moduleCounts?: Record<string, number>;
  fallbackModuleCounts?: Record<string, number>;
  enLabel: string;
  zhLabel: string;
  enHeatmapLabel: string;
  zhHeatmapLabel: string;
  enPageLabel: string;
  zhPageLabel: string;
  enBaseLabel: string;
  zhBaseLabel: string;
};

type SandboxContext = {
  window: {
    __HARNESS_LOCALE__: string;
    __HARNESS_WORKBENCH__: boolean;
    __HARNESS_DASHBOARD__: {
      status: {
        project: { name: string };
        summary: Record<string, unknown>;
        checkState: {
          status: string;
          validationMode: string;
          warnings: number;
          failures: number;
          details: { warnings: unknown[]; failures: unknown[] };
        };
        tasks: DashboardTask[];
      };
      modules: Array<{ key: string; title: string; source: string; status: string; counts?: Record<string, number>; tasks?: DashboardTask[] }>;
      documents: { documents: { path: string; content: string }[] };
      graph: { nodes: unknown[]; edges: unknown[] };
      adoption: { warnings: unknown[] };
    };
    HarnessI18n?: Record<string, Record<string, string>>;
  };
  navigator: { language: string; clipboard: { writeText: (value: string) => Promise<void> } };
  localStorage: { getItem: (key: string) => string; setItem: (key: string, value: string) => void };
  setInterval: () => number;
  clearInterval: () => void;
  __result?: RenderedSwimlane;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function fixtureTask(overrides: Partial<DashboardTask> = {}): DashboardTask {
  return {
    id: "TASKS/2026-05-28-fixture",
    shortId: "2026-05-28-fixture",
    title: "Fixture task",
    path: "TARGET:coding-agent-harness/planning/tasks/2026-05-28-fixture",
    state: "in_progress",
    module: "core",
    inferredModule: "",
    completion: 40,
    reviewStatus: "missing",
    reviewQueueState: "not-in-queue",
    closeoutStatus: "missing",
    visualMapStatus: "present",
    briefSource: "standalone",
    taskQueues: [],
    queueReasons: [],
    ...overrides,
  };
}

function renderTasks(mutator: string): RenderedSwimlane {
  const sandbox: SandboxContext = {
    window: {
      __HARNESS_LOCALE__: "en",
      __HARNESS_WORKBENCH__: false,
      __HARNESS_DASHBOARD__: {
        status: {
          project: { name: "Fixture" },
          summary: {},
          checkState: { status: "pass", validationMode: "data-only", warnings: 0, failures: 0, details: { warnings: [], failures: [] } },
          tasks: [
            fixtureTask({ title: "Implement CLI support", module: "core", state: "in_progress", queueReasons: ["Needs runtime evidence"] }),
            fixtureTask({ id: "TASKS/2026-05-28-core-review", shortId: "2026-05-28-core-review", title: "Core review", module: "core", state: "review", reviewStatus: "agent-reviewed", reviewQueueState: "ready-to-confirm", taskQueues: ["review"] }),
            fixtureTask({ id: "TASKS/2026-05-28-core-evidence", shortId: "2026-05-28-core-evidence", title: "Core evidence", module: "core", state: "in_progress", visualMapStatus: "missing" }),
            fixtureTask({ id: "TASKS/2026-05-28-core-evidence-2", shortId: "2026-05-28-core-evidence-2", title: "Core evidence 2", module: "core", state: "in_progress", visualMapStatus: "missing" }),
            fixtureTask({ id: "TASKS/2026-05-28-core-evidence-3", shortId: "2026-05-28-core-evidence-3", title: "Core evidence 3", module: "core", state: "in_progress", visualMapStatus: "missing" }),
            fixtureTask({ id: "TASKS/2026-05-28-core-evidence-4", shortId: "2026-05-28-core-evidence-4", title: "Core evidence 4", module: "core", state: "in_progress", visualMapStatus: "missing" }),
            fixtureTask({ id: "TASKS/2026-05-28-review", shortId: "2026-05-28-review", title: "Confirm review", module: "governance", state: "review", reviewStatus: "agent-reviewed", reviewQueueState: "ready-to-confirm", taskQueues: ["review"] }),
            fixtureTask({ id: "TASKS/2026-05-28-confirmed-closeout", shortId: "2026-05-28-confirmed-closeout", title: "Confirmed closeout", module: "governance", state: "review", reviewStatus: "confirmed", reviewQueueState: "not-in-queue", closeoutStatus: "missing" }),
            fixtureTask({ id: "TASKS/2026-05-28-blocked", shortId: "2026-05-28-blocked", title: "Blocked follow-up", module: "dashboard", state: "blocked", reviewStatus: "blocked-open-findings", visualMapStatus: "missing", briefSource: "missing", queueReasons: ["Open P1 finding"] }),
            fixtureTask({ id: "TASKS/2026-05-28-root-base", shortId: "2026-05-28-root-base", title: "Root base task", module: "", inferredModule: "base", state: "planned", completion: 0 }),
            fixtureTask({ id: "TASKS/2026-05-28-done", shortId: "2026-05-28-done", title: "Historical task", module: "archive", state: "done", completion: 100, closeoutStatus: "closed" }),
          ],
        },
        modules: [
          { key: "core", title: "Core", source: "registry", status: "in-progress", counts: { total: 6, active: 6, review: 1, blocked: 0, risk: 4 }, tasks: [] },
          { key: "dashboard", title: "Dashboard", source: "registry", status: "in-progress", counts: { total: 1, active: 1, review: 0, blocked: 1, risk: 1 }, tasks: [] },
          { key: "qa", title: "Quality Assurance", source: "registry", status: "planned", counts: { total: 0, active: 0, review: 0, blocked: 0, risk: 0 }, tasks: [] },
        ],
        documents: {
          documents: [
            { path: "TARGET:coding-agent-harness/planning/tasks/2026-05-28-fixture/brief.md", content: "# Brief" },
            { path: "TARGET:coding-agent-harness/planning/tasks/2026-05-28-fixture/visual_map.md", content: "# Map" },
          ],
        },
        graph: { nodes: [], edges: [] },
        adoption: { warnings: [] },
      },
    },
    navigator: { language: "en-US", clipboard: { writeText: async () => {} } },
    localStorage: { getItem: () => "", setItem: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
  };
  sandbox.window.HarnessI18n = {};
  vm.createContext(sandbox);
  vm.runInContext(`${i18nJs}\n${appJs}\n${mutator}`, sandbox);
  assert(sandbox.__result, "dashboard app script should set a render result");
  return sandbox.__result;
}

const rendered = renderTasks(`
  state.taskLayout = "swimlane";
  const html = taskIndex();
  __result = {
    html,
    model: taskSwimlaneModel(bundle.status.tasks),
    enLabel: window.HarnessI18n.en.layoutSwimlane,
    zhLabel: window.HarnessI18n.zh.layoutSwimlane,
    enHeatmapLabel: window.HarnessI18n.en.swimlaneHeatmapLabel,
    zhHeatmapLabel: window.HarnessI18n.zh.swimlaneHeatmapLabel,
    enPageLabel: window.HarnessI18n.en.swimlanePageLabel,
    zhPageLabel: window.HarnessI18n.zh.swimlanePageLabel,
    enBaseLabel: window.HarnessI18n.en.baseModule,
    zhBaseLabel: window.HarnessI18n.zh.baseModule,
  };
`);

assert(rendered.enLabel === "Swimlane", "English i18n should expose the swimlane layout label");
assert(rendered.zhLabel === "泳道图", "Chinese i18n should expose the swimlane layout label");
assert(rendered.enHeatmapLabel === "Heatmap overview", "English i18n should expose the heatmap overview label");
assert(rendered.zhHeatmapLabel === "热力图鸟瞰", "Chinese i18n should expose the heatmap overview label");
assert(rendered.enPageLabel === "Page", "English i18n should expose the swimlane pagination label");
assert(rendered.zhPageLabel === "页", "Chinese i18n should expose the swimlane pagination label");
assert(rendered.enBaseLabel === "Base", "English i18n should expose the base module label");
assert(rendered.zhBaseLabel === "Base（未分模块）", "Chinese i18n should expose the base module label");
assert(rendered.html.includes('data-layout="swimlane"'), "task toolbar should expose a swimlane layout toggle");
assert(rendered.html.includes("task-swimlane"), "task index should render the swimlane view when selected");
assert(rendered.html.includes('data-swimlane-heatmap="true"'), "swimlane should render a heatmap overview by default");
assert(rendered.html.includes('data-swimlane-drilldown-host="true"'), "swimlane should expose a single drilldown host");
assert(rendered.html.includes('data-swimlane-row="core"'), "swimlane should expose module rows in the heatmap");
assert(rendered.html.includes('data-swimlane-row="base"'), "swimlane should expose project-root tasks as a base row");
assert(rendered.html.includes('data-swimlane-row="qa"'), "swimlane should include registered YAML modules even when they have no active swimlane tasks");
assert(rendered.html.includes('data-swimlane-row="qa" data-swimlane-row-total="0"'), "registered modules with no active swimlane tasks should render a zero-total heatmap row");
assert(rendered.html.includes('data-swimlane-row-total="6"'), "swimlane should render row totals");
assert(rendered.html.includes('data-swimlane-stage-total="review" data-total="2"'), "swimlane should render review stage totals in headers");
assert(rendered.html.includes('data-swimlane-stage-total="closeout" data-total="1"'), "swimlane should render confirmed closeout stage totals in headers");
assert(rendered.html.includes('data-swimlane-stage="evidence" data-count="4"'), "swimlane heatmap cells should expose module-stage counts");
assert(rendered.html.includes("heat-2"), "swimlane heatmap should classify 4-7 tasks into the middle heat band");
assert(rendered.html.includes('data-swimlane-expand="cell"'), "heatmap cells should be expandable controls");
assert(rendered.html.includes('data-swimlane-expand="lane"'), "module row labels should be expandable controls");
assert(!rendered.html.includes("Implement CLI support"), "default heatmap should not render task titles before drilldown");
assert(!rendered.html.includes("Confirm review"), "default heatmap should not render review task titles before drilldown");
assert(!rendered.html.includes("Blocked follow-up"), "default heatmap should not render blocked task titles before drilldown");
assert(!rendered.html.includes("Root base task"), "default heatmap should not render base task titles before drilldown");
assert(!rendered.html.includes("Historical task"), "swimlane should keep closed historical work out of the first view");
assert(!rendered.html.includes("Needs runtime evidence"), "default heatmap should not render queue reason text before drilldown");
assert(!rendered.html.includes('data-open-drawer="TASKS/2026-05-28-review"'), "default heatmap should not render task drawer triggers before drilldown");
assert(rendered.model.lanes.some((lane) => lane.key === "core"), "swimlane model should group tasks by module");
assert(rendered.model.lanes.some((lane) => lane.key === "base"), "swimlane model should group project-root tasks into base");
assert(rendered.model.stages.some((stage) => stage.key === "review"), "swimlane model should include a review stage");
assert(rendered.model.cards.some((card) => card.stage === "blocked" && card.lane === "dashboard"), "blocked tasks should project into a blocked swimlane stage");
assert(rendered.model.cards.some((card) => card.title === "Confirmed closeout" && card.stage === "closeout"), "confirmed tasks with missing closeout should project into closeout before review");
assert(!rendered.model.cards.some((card) => card.title === "Historical task"), "swimlane model should exclude closed historical work");
assert(css.includes(".task-swimlane"), "dashboard CSS should style the swimlane surface");
assert(css.includes(".swimlane-heatmap"), "dashboard CSS should style the heatmap surface");
assert(css.includes(".swimlane-drilldown"), "dashboard CSS should style the drilldown surface");
assert(css.includes("--dashboard-page-gap"), "dashboard CSS should expose a shared page gap density token");
assert(css.includes(".swimlane-pager"), "dashboard CSS should style swimlane pagination controls");
assert(css.includes("@media (max-width: 760px)"), "swimlane CSS should include a narrow-screen adaptation");
assert(css.includes("--dashboard-page-gap: 8px;"), "dashboard page gap should use the denser 8px rhythm");
assert(css.includes("--dashboard-panel-gap: 8px;"), "dashboard panel gap should use the denser 8px rhythm");

const moduleMetrics = renderTasks(`
  const riskyTask = {
    ...bundle.status.tasks[0],
    id: "TASKS/2026-05-30-risky",
    state: "in_progress",
    module: "core",
    reviewStatus: "missing",
    visualMapStatus: "present",
    materialIssues: ["missing review evidence"],
    queueReasons: ["Needs owner decision"],
  };
  const unreachableActiveTask = {
    ...bundle.status.tasks[0],
    id: "TASKS/2026-05-30-active",
    state: "active",
    module: "core",
    reviewStatus: "missing",
    visualMapStatus: "present",
    queueReasons: [],
  };
  bundle.status.tasks = [riskyTask, unreachableActiveTask];
  __result = {
    html: "",
    model: taskSwimlaneModel([]),
    moduleCounts: moduleCountsForTasks(bundle.status.tasks),
    fallbackModuleCounts: modulesWithTaskFallback().find((module) => module.key === "core").counts,
    enLabel: window.HarnessI18n.en.layoutSwimlane,
    zhLabel: window.HarnessI18n.zh.layoutSwimlane,
    enHeatmapLabel: window.HarnessI18n.en.swimlaneHeatmapLabel,
    zhHeatmapLabel: window.HarnessI18n.zh.swimlaneHeatmapLabel,
    enPageLabel: window.HarnessI18n.en.swimlanePageLabel,
    zhPageLabel: window.HarnessI18n.zh.swimlanePageLabel,
    enBaseLabel: window.HarnessI18n.en.baseModule,
    zhBaseLabel: window.HarnessI18n.zh.baseModule,
  };
`);
assert(moduleMetrics.moduleCounts?.risk === 1, "moduleCountsForTasks should count materialIssues/queueReasons as risk");
assert(moduleMetrics.fallbackModuleCounts?.risk === 1, "UI module fallback risk counts should match server dashboard risk semantics");
assert(moduleMetrics.moduleCounts?.active === 1, "moduleCountsForTasks should not count unreachable active state as active work");
assert(moduleMetrics.fallbackModuleCounts?.active === 1, "UI module fallback active counts should align with moduleCountsForTasks");

const pagedDrilldown = renderTasks(`
  for (let index = 1; index <= 12; index += 1) {
    const suffix = String(index).padStart(2, "0");
    bundle.status.tasks.push({
      id: "TASKS/2026-05-29-core-review-extra-" + suffix,
      shortId: "2026-05-29-core-review-extra-" + suffix,
      title: "Core review extra " + index,
      path: "TARGET:coding-agent-harness/planning/tasks/2026-05-29-core-review-extra-" + suffix,
      state: "review",
      module: "core",
      inferredModule: "",
      completion: 10 + index,
      reviewStatus: "agent-reviewed",
      reviewQueueState: "ready-to-confirm",
      closeoutStatus: "missing",
      visualMapStatus: "present",
      briefSource: "standalone",
      taskQueues: ["review"],
      queueReasons: [],
    });
  }
  state.taskLayout = "swimlane";
  state.taskSortOrder = "asc";
  swimlaneExpansion = { mode: "cell", lane: "core", stage: "review", page: 1 };
  __result = {
    html: taskIndex(),
    model: taskSwimlaneModel(bundle.status.tasks),
    enLabel: window.HarnessI18n.en.layoutSwimlane,
    zhLabel: window.HarnessI18n.zh.layoutSwimlane,
    enHeatmapLabel: window.HarnessI18n.en.swimlaneHeatmapLabel,
    zhHeatmapLabel: window.HarnessI18n.zh.swimlaneHeatmapLabel,
    enPageLabel: window.HarnessI18n.en.swimlanePageLabel,
    zhPageLabel: window.HarnessI18n.zh.swimlanePageLabel,
    enBaseLabel: window.HarnessI18n.en.baseModule,
    zhBaseLabel: window.HarnessI18n.zh.baseModule,
  };
`);

assert(pagedDrilldown.html.includes('data-swimlane-page="1"'), "cell drilldown should preserve active page state");
assert(pagedDrilldown.html.includes('data-swimlane-page-action="prev"'), "cell drilldown should render a previous page control");
assert(pagedDrilldown.html.includes('data-swimlane-page-action="next"'), "cell drilldown should render a next page control");
assert(pagedDrilldown.html.includes("11-13 / 13"), "cell drilldown should summarize the visible page range");
assert(!pagedDrilldown.html.includes("Core review extra 3"), "second page should not render first page tasks");
assert(pagedDrilldown.html.includes("Core review extra 10"), "second page should render the first task in its visible slice");
assert(pagedDrilldown.html.includes("Core review extra 12"), "second page should render the last task in its visible slice");

const laneDrilldown = renderTasks(`
  for (let index = 1; index <= 12; index += 1) {
    const suffix = String(index).padStart(2, "0");
    bundle.status.tasks.push({
      id: "TASKS/2026-05-29-core-review-extra-" + suffix,
      shortId: "2026-05-29-core-review-extra-" + suffix,
      title: "Core review extra " + index,
      path: "TARGET:coding-agent-harness/planning/tasks/2026-05-29-core-review-extra-" + suffix,
      state: "review",
      module: "core",
      inferredModule: "",
      completion: 10 + index,
      reviewStatus: "agent-reviewed",
      reviewQueueState: "ready-to-confirm",
      closeoutStatus: "missing",
      visualMapStatus: "present",
      briefSource: "standalone",
      taskQueues: ["review"],
      queueReasons: [],
    });
  }
  state.taskLayout = "swimlane";
  state.taskSortOrder = "asc";
  swimlaneExpansion = { mode: "lane", lane: "core", stage: "" };
  __result = {
    html: taskIndex(),
    model: taskSwimlaneModel(bundle.status.tasks),
    enLabel: window.HarnessI18n.en.layoutSwimlane,
    zhLabel: window.HarnessI18n.zh.layoutSwimlane,
    enHeatmapLabel: window.HarnessI18n.en.swimlaneHeatmapLabel,
    zhHeatmapLabel: window.HarnessI18n.zh.swimlaneHeatmapLabel,
    enPageLabel: window.HarnessI18n.en.swimlanePageLabel,
    zhPageLabel: window.HarnessI18n.zh.swimlanePageLabel,
    enBaseLabel: window.HarnessI18n.en.baseModule,
    zhBaseLabel: window.HarnessI18n.zh.baseModule,
  };
`);

assert(laneDrilldown.html.includes('data-swimlane-stage-drilldown="review"'), "lane mini board should expose a stage drilldown control when a column overflows");
assert(laneDrilldown.html.includes("+8"), "lane mini board should summarize hidden overflow tasks");
assert(laneDrilldown.html.includes("Core review extra 4"), "lane mini board should render tasks up to its visible column limit");
assert(!laneDrilldown.html.includes("Core review extra 5"), "lane mini board should not render all overflow tasks inline");

const moduleRenderStability = renderTasks(`
  state.taskLayout = "list";
  const first = modulesView("core");
  const second = modulesView("core");
  __result = {
    html: first + second,
    model: taskSwimlaneModel(bundle.status.tasks),
    enLabel: String(bundle.modules.find((module) => module.key === "core")?.counts?.active ?? ""),
    zhLabel: String(bundle.modules.find((module) => module.key === "qa")?.counts?.active ?? ""),
    enHeatmapLabel: window.HarnessI18n.en.swimlaneHeatmapLabel,
    zhHeatmapLabel: window.HarnessI18n.zh.swimlaneHeatmapLabel,
    enPageLabel: window.HarnessI18n.en.swimlanePageLabel,
    zhPageLabel: window.HarnessI18n.zh.swimlanePageLabel,
    enBaseLabel: window.HarnessI18n.en.baseModule,
    zhBaseLabel: window.HarnessI18n.zh.baseModule,
  };
`);

assert(moduleRenderStability.enLabel === "6", "module view rendering should not mutate structured module active counts");
assert(moduleRenderStability.zhLabel === "0", "zero-task registered module counts should remain stable after module view rendering");
assert(moduleRenderStability.html.includes("Quality Assurance"), "module view should retain zero-task registered YAML modules");

console.log("Dashboard swimlane UI tests passed");
