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
  __result?: string;
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
