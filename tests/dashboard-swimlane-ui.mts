#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appJs = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/app.js"), "utf8")
  .replace(/\nwindow\.addEventListener\("hashchange", app\);\nwindow\.addEventListener\("popstate", app\);\napp\(\);\nloadRuntime\(\);\n?$/, "\n");
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
  zhMissingMaterialsLabel?: string;
  zhBlockedLabel?: string;
  zhLessonsLabel?: string;
  zhSoftDeletedLabel?: string;
};

type SandboxContext = {
  window: {
    __HARNESS_LOCALE__: string;
    __HARNESS_WORKBENCH__: boolean;
    __HARNESS_DASHBOARD__: {
      schemaVersion?: string;
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
      modules: Array<{ key: string; title: string; source: string; status: string; counts?: Record<string, number>; tasks?: DashboardTask[]; dashboardModuleView?: Record<string, unknown>; moduleProjection?: Record<string, unknown> }>;
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
  const item = {
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
    taskQueues: ["active"],
    queueReasons: [],
    ...overrides,
  } as DashboardTask & Record<string, unknown>;
  const queues = Array.isArray(item.taskQueues) && item.taskQueues.length ? item.taskQueues : ["active"];
  const reasonSummaries = (Array.isArray(item.queueReasons) ? item.queueReasons : [])
    .map((reason) => typeof reason === "string" ? { code: reason, message: reason } : reason)
    .filter(Boolean);
  const primaryQueue = queues.find((queue) => ["blocked", "missing-materials", "review", "lessons", "finalized", "soft-deleted-superseded", "active"].includes(queue)) || queues[0] || "active";
  item.taskLifecycleProjection ||= {
    state: item.state,
    lifecycleState: item.state,
    reviewStatus: item.reviewStatus,
    reviewQueueState: item.reviewQueueState,
    closeoutStatus: item.closeoutStatus,
    taskQueues: queues,
    materialsReady: true,
    reviewSubmitted: item.reviewStatus === "agent-reviewed",
    lessonCandidateDecisionComplete: true,
    deletionState: "active",
  };
  item.reviewWorkbenchQueueView ||= {
    queues,
    primaryQueue,
    inQueue: primaryQueue !== "active",
    humanConfirmable: item.reviewQueueState === "ready-to-confirm" && primaryQueue === "review",
    blocked: primaryQueue === "blocked",
    needsMaterials: primaryQueue === "missing-materials",
    confirmed: primaryQueue === "finalized" && item.reviewStatus === "confirmed",
    finalized: primaryQueue === "finalized",
    hasPendingLessonWork: primaryQueue === "lessons",
    readyForCloseout: false,
    reasonCodes: reasonSummaries.map((reason) => String((reason as Record<string, unknown>).code || "")),
    reasonSummaries,
  };
  item.dashboardTaskView ||= {
    visibleInSwimlane: primaryQueue !== "finalized",
    swimlaneStage: primaryQueue,
    needsEvidence: item.visualMapStatus === "missing" || item.briefSource !== "standalone",
    reasonCode: "",
    reasonMessage: "",
    materials: {
      briefReady: item.briefSource === "standalone",
      visualMapReady: item.visualMapStatus !== "missing",
      evidenceReady: item.visualMapStatus !== "missing" && item.briefSource === "standalone",
      blockingReasonCodes: [],
    },
    swimlane: {
      visible: primaryQueue !== "finalized",
      rowKey: item.module || item.inferredModule || "legacy-unclassified",
      rowLabelKey: "",
      columnKey: primaryQueue,
      columnLabelKey: primaryQueue === "review" ? "queueReview" : primaryQueue === "blocked" ? "queueBlocked" : primaryQueue === "active" ? "active" : `state_${primaryQueue}`,
      tone: primaryQueue === "blocked" ? "fail" : primaryQueue === "active" ? "warn" : "pass",
      sortKey: item.shortId,
    },
  };
  item.semanticProjection ||= {
    taskLifecycleProjection: item.taskLifecycleProjection,
    dashboardTaskView: item.dashboardTaskView,
    reviewWorkbenchQueueView: item.reviewWorkbenchQueueView,
  };
  return item as DashboardTask;
}

function renderTasks(mutator: string): RenderedSwimlane {
  const sandbox: SandboxContext = {
    window: {
      __HARNESS_LOCALE__: "en",
      __HARNESS_WORKBENCH__: false,
      __HARNESS_DASHBOARD__: {
        schemaVersion: "dashboard-bundle/v1",
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
            fixtureTask({ id: "TASKS/2026-05-28-confirmed-closeout", shortId: "2026-05-28-confirmed-closeout", title: "Confirmed closeout", module: "governance", state: "review", reviewStatus: "confirmed", reviewQueueState: "not-in-queue", closeoutStatus: "missing", taskQueues: ["finalized"] }),
            fixtureTask({ id: "TASKS/2026-05-28-agent-reviewed-not-started", shortId: "2026-05-28-agent-reviewed-not-started", title: "Agent reviewed not started", module: "governance", state: "not_started", reviewStatus: "agent-reviewed", reviewQueueState: "not-in-queue", taskQueues: ["active"] }),
            fixtureTask({ id: "TASKS/2026-05-28-blocked", shortId: "2026-05-28-blocked", title: "Blocked follow-up", module: "dashboard", state: "blocked", reviewStatus: "blocked-open-findings", visualMapStatus: "missing", briefSource: "missing", taskQueues: ["blocked"], queueReasons: ["Open P1 finding"] }),
            fixtureTask({ id: "TASKS/2026-05-28-root-base", shortId: "2026-05-28-root-base", title: "Root base task", module: "", inferredModule: "base", state: "planned", completion: 0 }),
            fixtureTask({ id: "TASKS/2026-05-28-done", shortId: "2026-05-28-done", title: "Historical task", module: "archive", state: "done", completion: 100, closeoutStatus: "closed", taskQueues: ["finalized"] }),
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
    zhMissingMaterialsLabel: window.HarnessI18n.zh.queueMissingMaterials,
    zhBlockedLabel: window.HarnessI18n.zh.queueBlocked,
    zhLessonsLabel: window.HarnessI18n.zh.queueLessons,
    zhSoftDeletedLabel: window.HarnessI18n.zh.queueSoftDeletedSuperseded,
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
assert(rendered.zhMissingMaterialsLabel === "缺材料", "Chinese i18n should translate the missing-materials queue label");
assert(rendered.zhBlockedLabel === "阻塞", "Chinese i18n should translate the blocked queue label");
assert(rendered.zhLessonsLabel === "经验沉淀", "Chinese i18n should translate the lessons queue label");
assert(rendered.zhSoftDeletedLabel === "软删除 / 已替代", "Chinese i18n should translate the soft-deleted/superseded queue label");
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
assert(!rendered.html.includes('data-swimlane-stage-total="confirmed-finalization-pending"'), "swimlane should not render a post-confirmation closeout queue");
assert(rendered.html.includes('data-swimlane-stage="active" data-count="5"'), "swimlane heatmap cells should expose lifecycle queue counts");
assert(rendered.html.includes("heat-2"), "swimlane heatmap should classify 4-7 tasks into the middle heat band");
assert(rendered.html.includes('data-swimlane-expand="cell"'), "heatmap cells should be expandable controls");
assert(rendered.html.includes('data-swimlane-expand="lane"'), "module row labels should be expandable controls");
assert(!rendered.html.includes("Implement CLI support"), "default heatmap should not render task titles before drilldown");
assert(!rendered.html.includes("Confirm review"), "default heatmap should not render review task titles before drilldown");
assert(!rendered.html.includes("Blocked follow-up"), "default heatmap should not render blocked task titles before drilldown");
assert(!rendered.html.includes("Root base task"), "default heatmap should not render base task titles before drilldown");
assert(!rendered.html.includes("Historical task"), "default heatmap should not render finalized task titles before drilldown");
assert(!rendered.html.includes("Needs runtime evidence"), "default heatmap should not render queue reason text before drilldown");
assert(!rendered.html.includes('data-open-drawer="TASKS/2026-05-28-review"'), "default heatmap should not render task drawer triggers before drilldown");
assert(rendered.model.lanes.some((lane) => lane.key === "core"), "swimlane model should group tasks by module");
assert(rendered.model.lanes.some((lane) => lane.key === "base"), "swimlane model should group project-root tasks into base");
assert(rendered.model.stages.some((stage) => stage.key === "review"), "swimlane model should include a review stage");
assert(rendered.model.cards.some((card) => card.stage === "blocked" && card.lane === "dashboard"), "blocked tasks should project into a blocked swimlane stage");
assert(!rendered.model.cards.some((card) => card.title === "Confirmed closeout"), "confirmed no-lesson tasks should stay out of the active swimlane");
assert(rendered.model.cards.some((card) => card.title === "Agent reviewed not started" && card.stage === "active"), "agent-reviewed evidence alone must not inflate the review queue");
assert(!rendered.model.cards.some((card) => card.title === "Agent reviewed not started" && card.stage === "review"), "agent-reviewed evidence outside the review queue must not appear as current review work");
assert(!rendered.model.cards.some((card) => card.title === "Historical task"), "closed historical tasks should stay hidden when the dashboard swimlane projection marks them invisible");
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
	    taskQueues: ["finalized"],
	    queueReasons: [],
	    reviewWorkbenchQueueView: {
	      queues: ["finalized"],
	      primaryQueue: "finalized",
	      inQueue: true,
	      humanConfirmable: false,
	      blocked: false,
	      needsMaterials: false,
	      confirmed: true,
	      finalized: true,
	      hasPendingLessonWork: false,
	      readyForCloseout: false,
	      reasonCodes: [],
	    },
	  };
  const projectionActiveTask = {
    ...bundle.status.tasks[0],
    id: "TASKS/2026-05-30-projected-active",
    state: "done",
    module: "core",
    reviewStatus: "missing",
    visualMapStatus: "present",
    queueReasons: [],
	    taskLifecycleProjection: {
	      state: "in_progress",
	      lifecycleState: "active",
	      reviewStatus: "missing",
	      reviewQueueState: "not-in-queue",
	      closeoutStatus: "missing",
	      taskQueues: ["active"],
	    },
	    reviewWorkbenchQueueView: {
	      queues: ["active"],
	      primaryQueue: "active",
	      inQueue: false,
	      humanConfirmable: false,
	      blocked: false,
	      needsMaterials: false,
	      confirmed: false,
	      finalized: false,
	      hasPendingLessonWork: false,
	      readyForCloseout: false,
	      reasonCodes: [],
	    },
	  };
  bundle.status.tasks = [riskyTask, unreachableActiveTask, projectionActiveTask];
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
assert(moduleMetrics.moduleCounts?.active === 1, "moduleCountsForTasks should count only projected current in-progress active tasks");
assert(moduleMetrics.fallbackModuleCounts?.active === 1, "UI module fallback active counts should use projection-first active semantics");

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
	      taskLifecycleProjection: {
	        state: "review",
	        lifecycleState: "in_review",
	        reviewStatus: "agent-reviewed",
	        reviewQueueState: "ready-to-confirm",
	        closeoutStatus: "missing",
	        taskQueues: ["review"],
	      },
	      reviewWorkbenchQueueView: {
	        queues: ["review"],
	        primaryQueue: "review",
	        inQueue: true,
	        humanConfirmable: true,
	        blocked: false,
	        needsMaterials: false,
	        confirmed: false,
	        finalized: false,
	        hasPendingLessonWork: false,
	        readyForCloseout: false,
	        reasonCodes: [],
	      },
	      dashboardTaskView: {
	        visibleInSwimlane: true,
	        swimlaneStage: "review",
	        needsEvidence: false,
	        reasonCode: "",
	        reasonMessage: "",
	        materials: { briefReady: true, visualMapReady: true, evidenceReady: true, blockingReasonCodes: [] },
	        swimlane: { visible: true, rowKey: "core", rowLabelKey: "", columnKey: "review", columnLabelKey: "queueReview", tone: "pass", sortKey: "2026-05-29-core-review-extra-" + suffix },
	      },
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
	      taskLifecycleProjection: {
	        state: "review",
	        lifecycleState: "in_review",
	        reviewStatus: "agent-reviewed",
	        reviewQueueState: "ready-to-confirm",
	        closeoutStatus: "missing",
	        taskQueues: ["review"],
	      },
	      reviewWorkbenchQueueView: {
	        queues: ["review"],
	        primaryQueue: "review",
	        inQueue: true,
	        humanConfirmable: true,
	        blocked: false,
	        needsMaterials: false,
	        confirmed: false,
	        finalized: false,
	        hasPendingLessonWork: false,
	        readyForCloseout: false,
	        reasonCodes: [],
	      },
	      dashboardTaskView: {
	        visibleInSwimlane: true,
	        swimlaneStage: "review",
	        needsEvidence: false,
	        reasonCode: "",
	        reasonMessage: "",
	        materials: { briefReady: true, visualMapReady: true, evidenceReady: true, blockingReasonCodes: [] },
	        swimlane: { visible: true, rowKey: "core", rowLabelKey: "", columnKey: "review", columnLabelKey: "queueReview", tone: "pass", sortKey: "2026-05-29-core-review-extra-" + suffix },
	      },
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

const projectedModuleAndSwimlane = renderTasks(`
  bundle.status.tasks = [{
    ...bundle.status.tasks[0],
    id: "TASKS/projected-swimlane-contract",
    title: "Projected swimlane contract",
    state: "done",
    module: "raw-wrong-module",
    inferredModule: "",
    taskQueues: ["review"],
    taskLifecycleProjection: {
      state: "review",
      lifecycleState: "in_review",
      reviewStatus: "agent-reviewed",
      reviewQueueState: "needs-material",
      closeoutStatus: "missing",
      taskQueues: ["missing-materials"],
      materialsReady: false,
      reviewSubmitted: true,
      lessonCandidateDecisionComplete: false,
      deletionState: "active",
    },
    dashboardTaskView: {
      visibleInSwimlane: true,
      swimlaneStage: "missing-materials",
      needsEvidence: true,
      reasonCode: "missing-brief",
      reasonMessage: "Brief required",
      materials: {
        briefReady: false,
        visualMapReady: true,
        evidenceReady: false,
        blockingReasonCodes: ["missing-brief"],
      },
      swimlane: {
        visible: true,
        rowKey: "core",
        rowLabelKey: "",
        columnKey: "missing-materials",
        columnLabelKey: "queueMissingMaterials",
        tone: "warn",
        sortKey: "2026-05-28-fixture",
      },
    },
    reviewWorkbenchQueueView: {
      queues: ["missing-materials"],
      primaryQueue: "missing-materials",
      inQueue: true,
      humanConfirmable: false,
      blocked: false,
      needsMaterials: true,
      confirmed: false,
      finalized: false,
      hasPendingLessonWork: false,
      readyForCloseout: false,
      reasonCodes: ["missing-brief"],
    },
  }];
  bundle.modules = [{
    key: "core",
    title: "Core",
    source: "registry",
    status: "in-progress",
    counts: { total: 1, active: 1, review: 0, blocked: 0, risk: 1 },
    tasks: [],
    dashboardModuleView: {
      key: "core",
      title: "Core",
      sourceKind: "registry",
      sourceLabelKey: "moduleSourceRegistry",
      statusKey: "in_progress",
      statusLabelKey: "state_in_progress",
      statusTone: "pass",
      counts: { total: 1, active: 1, review: 0, blocked: 0, risk: 1, missingDocs: 1 },
    },
  }];
  const moduleHtml = modulesView("core");
  __result = {
    html: moduleHtml,
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

assert(projectedModuleAndSwimlane.model.cards.some((card) => card.title === "Projected swimlane contract" && card.lane === "core" && card.stage === "missing-materials"), "swimlane model should use dashboardTaskView.swimlane row/column instead of raw module/state/queue fields");
assert(!projectedModuleAndSwimlane.model.cards.some((card) => card.lane === "raw-wrong-module" || card.stage === "review"), "swimlane model must not derive placement from raw module or raw queues when a dashboard swimlane projection exists");
assert(projectedModuleAndSwimlane.html.includes("Registered"), "module view should render the module source from the semantic source label key");
assert(projectedModuleAndSwimlane.html.includes("in progress"), "module view should render the module status from the semantic status label key");
assert(!projectedModuleAndSwimlane.html.includes(">registry<"), "module view should not render raw module source tokens as display text");
assert(!projectedModuleAndSwimlane.html.includes(">in-progress<"), "module view should not render raw module status tokens as display text");

const moduleCurrentWorkProjection = renderTasks(`
  bundle.status.tasks = [
    {
      ...bundle.status.tasks[0],
      id: "TASKS/module-active-queue",
      title: "Module current active",
      state: "in_progress",
      module: "core",
      taskQueues: ["active"],
      queueReasons: [],
      materialIssues: [],
      risks: [],
      taskLifecycleProjection: {
        state: "in_progress",
        lifecycleState: "active",
        reviewStatus: "none",
        reviewQueueState: "not-in-queue",
        closeoutStatus: "open",
        taskQueues: ["active"],
      },
      reviewWorkbenchQueueView: {
        queues: ["active"],
        primaryQueue: "active",
        inQueue: false,
        humanConfirmable: false,
        blocked: false,
        needsMaterials: false,
        confirmed: false,
        finalized: false,
        hasPendingLessonWork: false,
        readyForCloseout: false,
        reasonCodes: [],
      },
    },
    {
      ...bundle.status.tasks[0],
      id: "TASKS/module-finalized-queue",
      title: "Module finalized queue",
      state: "in_progress",
      module: "core",
      taskQueues: ["active"],
      queueReasons: [],
      materialIssues: [],
      risks: [],
      taskLifecycleProjection: {
        state: "done",
        lifecycleState: "closed",
        reviewStatus: "confirmed",
        reviewQueueState: "not-in-queue",
        closeoutStatus: "closed",
        taskQueues: ["finalized"],
      },
      reviewWorkbenchQueueView: {
        queues: ["finalized"],
        primaryQueue: "finalized",
        inQueue: true,
        humanConfirmable: false,
        blocked: false,
        needsMaterials: false,
        confirmed: true,
        finalized: true,
        hasPendingLessonWork: false,
        readyForCloseout: false,
        reasonCodes: [],
      },
    },
  ];
  bundle.modules = [{
    key: "core",
    title: "Core",
    source: "registry",
    status: "in-progress",
    counts: { total: 2, active: 1, risk: 1 },
    tasks: [],
    dashboardModuleView: {
      key: "core",
      title: "Core",
      sourceLabelKey: "moduleSourceRegistry",
      statusKey: "in_progress",
      statusLabelKey: "state_in_progress",
      statusTone: "pass",
      counts: { total: 2, active: 1, risk: 1 },
    },
  }];
  __result = {
    html: modulesView("core"),
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

const moduleCurrentWorkHtml = moduleCurrentWorkProjection.html.match(/<section class="module-work-panel">[\s\S]*?<\/section>/)?.[0] || "";
assert(moduleCurrentWorkHtml.includes("Module current active"), "module detail current work should show only currently active tasks");
assert(!moduleCurrentWorkHtml.includes("Module finalized queue"), "module detail current work should not show finalized queue tasks just because raw state is active");

const missingProjectionFailClosed = renderTasks(`
  bundle.status.tasks = [{
    ...bundle.status.tasks[0],
    id: "TASKS/missing-projection",
    title: "Missing projection task",
    state: "review",
    module: "raw-module",
    taskQueues: ["review"],
    taskLifecycleProjection: undefined,
    dashboardTaskView: undefined,
    reviewWorkbenchQueueView: undefined,
    semanticProjection: undefined,
  }];
  __result = {
    html: "",
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
assert(missingProjectionFailClosed.model.cards.length === 0, "swimlane must fail closed instead of deriving placement from raw fields when the view projection is missing");

const missingProjectionOverviewFailClosed = renderTasks(`
  bundle.status.tasks = [
    {
      ...bundle.status.tasks[0],
      id: "TASKS/raw-active-without-projection",
      shortId: "raw-active-without-projection",
      title: "Raw active without projection",
      state: "in_progress",
      completion: 24,
      taskQueues: ["active"],
      taskLifecycleProjection: undefined,
      dashboardTaskView: undefined,
      reviewWorkbenchQueueView: undefined,
      semanticProjection: undefined,
    },
  ];
  const html = flowPanel() + activeTaskBriefs();
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

assert(missingProjectionOverviewFailClosed.html.includes("Active 0"), "overview flow must not derive active counts from raw state/queues when lifecycle projection is missing");
assert(!missingProjectionOverviewFailClosed.html.includes("Raw active without projection"), "active briefs must fail closed when lifecycle projection is missing");

const overviewProjection = renderTasks(`
  bundle.status.tasks = [
    {
      ...bundle.status.tasks[0],
      id: "TASKS/projected-overview-active",
      shortId: "projected-overview-active",
      title: "Projected overview active",
      state: "done",
      completion: 64,
      taskLifecycleProjection: {
        state: "in_progress",
        lifecycleState: "active",
        reviewStatus: "none",
        reviewQueueState: "not-in-queue",
        closeoutStatus: "open",
        taskQueues: ["active"],
      },
    },
  ];
  const html = flowPanel() + activeTaskBriefs();
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

assert(overviewProjection.html.includes("Active 1"), "overview flow should count projected active state before raw done state");
assert(overviewProjection.html.includes("Done 0"), "overview flow should not count raw done state when projection overrides it");
assert(overviewProjection.html.includes("Projected overview active"), "active briefs should include tasks made active by projection");

console.log("Dashboard swimlane UI tests passed");
