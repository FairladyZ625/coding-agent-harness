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
  enLabel: string;
  zhLabel: string;
  enHeatmapLabel: string;
  zhHeatmapLabel: string;
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
            fixtureTask({ id: "TASKS/2026-05-28-blocked", shortId: "2026-05-28-blocked", title: "Blocked follow-up", module: "dashboard", state: "blocked", reviewStatus: "blocked-open-findings", visualMapStatus: "missing", briefSource: "missing", queueReasons: ["Open P1 finding"] }),
            fixtureTask({ id: "TASKS/2026-05-28-done", shortId: "2026-05-28-done", title: "Historical task", module: "archive", state: "done", completion: 100, closeoutStatus: "closed" }),
          ],
        },
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
  };
`);

assert(rendered.enLabel === "Swimlane", "English i18n should expose the swimlane layout label");
assert(rendered.zhLabel === "泳道图", "Chinese i18n should expose the swimlane layout label");
assert(rendered.enHeatmapLabel === "Heatmap overview", "English i18n should expose the heatmap overview label");
assert(rendered.zhHeatmapLabel === "热力图鸟瞰", "Chinese i18n should expose the heatmap overview label");
assert(rendered.html.includes('data-layout="swimlane"'), "task toolbar should expose a swimlane layout toggle");
assert(rendered.html.includes("task-swimlane"), "task index should render the swimlane view when selected");
assert(rendered.html.includes('data-swimlane-heatmap="true"'), "swimlane should render a heatmap overview by default");
assert(rendered.html.includes('data-swimlane-drilldown-host="true"'), "swimlane should expose a single drilldown host");
assert(rendered.html.includes('data-swimlane-row="core"'), "swimlane should expose module rows in the heatmap");
assert(rendered.html.includes('data-swimlane-row-total="6"'), "swimlane should render row totals");
assert(rendered.html.includes('data-swimlane-stage-total="review" data-total="2"'), "swimlane should render stage totals in headers");
assert(rendered.html.includes('data-swimlane-stage="evidence" data-count="4"'), "swimlane heatmap cells should expose module-stage counts");
assert(rendered.html.includes("heat-2"), "swimlane heatmap should classify 4-7 tasks into the middle heat band");
assert(rendered.html.includes('data-swimlane-expand="cell"'), "heatmap cells should be expandable controls");
assert(rendered.html.includes('data-swimlane-expand="lane"'), "module row labels should be expandable controls");
assert(!rendered.html.includes("Implement CLI support"), "default heatmap should not render task titles before drilldown");
assert(!rendered.html.includes("Confirm review"), "default heatmap should not render review task titles before drilldown");
assert(!rendered.html.includes("Blocked follow-up"), "default heatmap should not render blocked task titles before drilldown");
assert(!rendered.html.includes("Historical task"), "swimlane should keep closed historical work out of the first view");
assert(!rendered.html.includes("Needs runtime evidence"), "default heatmap should not render queue reason text before drilldown");
assert(!rendered.html.includes('data-open-drawer="TASKS/2026-05-28-review"'), "default heatmap should not render task drawer triggers before drilldown");
assert(rendered.model.lanes.some((lane) => lane.key === "core"), "swimlane model should group tasks by module");
assert(rendered.model.stages.some((stage) => stage.key === "review"), "swimlane model should include a review stage");
assert(rendered.model.cards.some((card) => card.stage === "blocked" && card.lane === "dashboard"), "blocked tasks should project into a blocked swimlane stage");
assert(!rendered.model.cards.some((card) => card.title === "Historical task"), "swimlane model should exclude closed historical work");
assert(css.includes(".task-swimlane"), "dashboard CSS should style the swimlane surface");
assert(css.includes(".swimlane-heatmap"), "dashboard CSS should style the heatmap surface");
assert(css.includes(".swimlane-drilldown"), "dashboard CSS should style the drilldown surface");
assert(css.includes("@media (max-width: 760px)"), "swimlane CSS should include a narrow-screen adaptation");

console.log("Dashboard swimlane UI tests passed");
