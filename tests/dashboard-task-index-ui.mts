#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appJs = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/app.js"), "utf8")
  .replace(/\nwindow\.addEventListener\("hashchange", app\);\napp\(\);\nloadRuntime\(\);\n?$/, "\n");
const i18nJs = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/i18n.js"), "utf8");

type DashboardSandbox = {
  [key: string]: unknown;
  window: Record<string, unknown>;
  navigator: { language: string; clipboard: { writeText: () => Promise<void> } };
  localStorage: { getItem: () => string; setItem: () => void };
  setInterval: () => number;
  clearInterval: () => void;
  __result?: unknown;
};

type FakeInput = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  listeners: Record<string, () => void>;
  dataset: Record<string, string>;
  focused?: boolean;
  selectionRestored?: boolean;
  addEventListener(type: string, listener: () => void): void;
  focus(): void;
  setSelectionRange(start: number, end: number): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: "TASKS/fixture",
    shortId: "fixture",
    title: "Fixture task",
    path: "TARGET:coding-agent-harness/planning/tasks/fixture",
    state: "in_progress",
    module: "dashboard",
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

function createSandbox(extra: Record<string, unknown> = {}): DashboardSandbox {
  const sandbox: DashboardSandbox = {
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
            task({ id: "TASKS/in-progress", state: "in_progress", completion: 40 }),
            task({ id: "TASKS/review", state: "review", completion: 80 }),
            task({ id: "TASKS/blocked", state: "blocked", completion: 25 }),
            task({ id: "TASKS/done", state: "done", completion: 100 }),
            task({ id: "TASKS/planned", state: "planned", completion: 0 }),
            task({ id: "TASKS/not-started", state: "not_started", completion: 0 }),
            task({ id: "TASKS/unknown", state: "unknown", completion: 0 }),
          ],
        },
        documents: { documents: [] },
        graph: { nodes: [], edges: [] },
        adoption: { warnings: [] },
      },
      location: { hash: "#/tasks", protocol: "http:" },
      matchMedia: () => ({ matches: false }),
      HarnessI18n: {},
    },
    navigator: { language: "en-US", clipboard: { writeText: async () => {} } },
    localStorage: { getItem: () => "", setItem: () => {} },
    setInterval: () => 0,
    clearInterval: () => {},
    ...extra,
  };
  vm.createContext(sandbox);
  vm.runInContext(`${i18nJs}\n${appJs}`, sandbox);
  return sandbox;
}

const stats = createSandbox();
vm.runInContext(`
  __result = taskStatsBar();
`, stats);
const statsHtml = stats.__result;
assert(typeof statsHtml === "string", "task stats should render html");
assert(statsHtml.includes("Total"), "task stats should include total count");
assert(statsHtml.includes(">7</span>"), "task stats total should include all tasks");
assert(statsHtml.includes("planned"), "task stats should expose planned tasks so displayed buckets add up");
assert(statsHtml.includes("not started"), "task stats should expose not_started tasks so displayed buckets add up");
assert(statsHtml.includes("unknown"), "task stats should expose unknown tasks so displayed buckets add up");

const projectionSandbox = createSandbox();
vm.runInContext(`
  bundle.status.tasks = [{
    id: "TASKS/projection-conflict",
    shortId: "projection-conflict",
    title: "Projection conflict",
    path: "TARGET:coding-agent-harness/planning/tasks/projection-conflict",
    state: "done",
    module: "dashboard",
    inferredModule: "",
    completion: 100,
    reviewStatus: "missing",
    reviewQueueState: "not-in-queue",
    closeoutStatus: "closed",
    visualMapStatus: "present",
    briefSource: "standalone",
    taskQueues: ["finalized"],
    queueReasons: [],
    taskLifecycleProjection: {
      state: "review",
      lifecycleState: "in_review",
      reviewStatus: "agent-reviewed",
      reviewQueueState: "ready-to-confirm",
      closeoutStatus: "missing",
      taskQueues: ["review", "projected-queue"],
    },
    reviewWorkbenchQueueView: {
      queues: ["review", "projected-queue"],
      primaryQueue: "review",
      inQueue: true,
      humanConfirmable: true,
      blocked: false,
      confirmed: false,
      hasPendingLessonWork: false,
      readyForCloseout: false,
      reasonCodes: ["projected-queue"],
    },
  }];
  state.taskState = "review";
  state.query = "projected-queue";
  __result = JSON.stringify({
    stats: taskStatRows(normalCycleTasks()).map((row) => [row.state, row.count]),
    filtered: filteredTasks().map((item) => item.id),
    row: taskRow(bundle.status.tasks[0]),
  });
`, projectionSandbox);
const projectionResult = JSON.parse(String(projectionSandbox.__result)) as { stats: Array<[string, number]>; filtered: string[]; row: string };
assert(projectionResult.stats.some(([state, count]) => state === "review" && count === 1), "task stats should count projected review state before raw done state");
assert(!projectionResult.stats.some(([state]) => state === "done"), "task stats should not count raw done state when projection overrides it");
assert(projectionResult.filtered.includes("TASKS/projection-conflict"), "task filter/search should match projected state and queues");
assert(projectionResult.row.includes("agent reviewed"), "task rows should display projected review lifecycle");

const reviewAffordanceSandbox = createSandbox();
vm.runInContext(`
  state.runtime = { mode: "workbench", writableActions: ["review-complete", "task-complete"] };
  const task = {
    id: "TASKS/review-affordance",
    shortId: "review-affordance",
    title: "Review affordance",
    path: "TARGET:coding-agent-harness/planning/tasks/review-affordance",
    state: "review",
    budget: "complex",
    completion: 80,
    reviewStatus: "missing",
    reviewQueueState: "not-in-queue",
    closeoutStatus: "missing",
    visualMapStatus: "present",
    briefSource: "standalone",
    taskQueues: [],
    queueReasons: [],
    lessonCandidateDecisionComplete: false,
    walkthroughPath: "",
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
      confirmed: false,
      hasPendingLessonWork: false,
      readyForCloseout: false,
      reasonCodes: [],
    },
  };
  __result = reviewActionPanel(task, { mode: "workspace" });
`, reviewAffordanceSandbox);
const reviewAffordanceHtml = String(reviewAffordanceSandbox.__result);
assert(reviewAffordanceHtml.includes("data-review-complete"), "review action panel should expose review completion for projection-confirmable tasks");
assert(!reviewAffordanceHtml.includes("disabled"), "review action panel should not let raw material fallback block projection-confirmable tasks");

const bulkErrorSandbox = createSandbox();
vm.runInContext(`
  __result = dashboardActionErrorDetail({
    ok: false,
    confirmed: 0,
    failed: 3,
    results: [
      { ok: false, error: "Human review confirmation must be performed by a human-controlled runtime." },
      { ok: false, error: "Human review confirmation must be performed by a human-controlled runtime." },
      { ok: false, error: "Human review confirmation must be performed by a human-controlled runtime." },
    ],
  }, "fallback");
`, bulkErrorSandbox);
assert(typeof bulkErrorSandbox.__result === "string", "bulk action error detail should render text");
assert(!bulkErrorSandbox.__result.includes("[object Object]"), "bulk action error detail must not stringify payload objects");
assert(bulkErrorSandbox.__result.includes("3 failed"), "bulk action error detail should include failed count");
assert(bulkErrorSandbox.__result.includes("human-controlled runtime"), "bulk action error detail should expose per-task failure reason");

function fakeInput(value: string): FakeInput {
  return {
    value,
    selectionStart: value.length,
    selectionEnd: value.length,
    listeners: {},
    dataset: {},
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
    focus() {
      this.focused = true;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
      this.selectionRestored = true;
    },
  };
}

const searchInput = fakeInput("dash");
const replacementSearchInput = fakeInput("dash");
const focusSandbox = createSandbox({
  document: {
    activeElement: searchInput,
    documentElement: { dataset: {}, lang: "" },
    getElementById: () => null,
    querySelector: (selector: string) => selector === "[data-search]" ? replacementSearchInput : null,
    querySelectorAll: (selector: string) => selector === "[data-search]" ? [searchInput] : [],
  },
});
vm.runInContext(`
  app = () => {
    document.activeElement = null;
  };
  bind();
`, focusSandbox);
searchInput.listeners.input();
assert(replacementSearchInput.focused === true, "task search input should keep focus after rerender");
assert(replacementSearchInput.selectionRestored === true, "task search input should restore cursor position after rerender");

const presetInput = fakeInput("preset");
const replacementPresetInput = fakeInput("preset");
const presetFocusSandbox = createSandbox({
  document: {
    activeElement: presetInput,
    documentElement: { dataset: {}, lang: "" },
    getElementById: () => null,
    querySelector: (selector: string) => selector === "[data-preset-search]" ? replacementPresetInput : null,
    querySelectorAll: (selector: string) => selector === "[data-preset-search]" ? [presetInput] : [],
  },
});
vm.runInContext(`
  app = () => {
    document.activeElement = null;
  };
  bind();
`, presetFocusSandbox);
presetInput.listeners.input();
assert(replacementPresetInput.focused === true, "preset search input should keep focus after rerender");
assert(replacementPresetInput.selectionRestored === true, "preset search input should restore cursor position after rerender");

console.log("Dashboard task index UI tests passed");
