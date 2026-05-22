const bundle = window.__HARNESS_DASHBOARD__ || {};
const defaultLocale = window.__HARNESS_LOCALE__ || ((navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en");
let locale = localStorage.getItem("harness.locale") || defaultLocale;
if (!window.HarnessI18n?.[locale]) locale = "en";
let labels = window.HarnessI18n?.[locale] || {};

const state = {
  query: "",
  taskState: "all",
  taskGroupMode: "migration",
  taskPageByGroup: {},
  taskGroupPage: 1,
  warningFilter: "all",
  warningPage: 1,
  renderMode: "rendered",
  theme: localStorage.getItem("harness.theme") || "system",
  taskLayout: localStorage.getItem("harness.taskLayout") || "list",
  runtime: { mode: "static", csrfToken: "", writableActions: [] },
  runtimeLoaded: false,
  runtimePoller: null,
};

const taskPageSize = 25;
const taskGroupsPerPage = 8;
const warningPageSize = 18;

const taskDocTabs = [
  ["brief", "brief.md"],
  ["taskPlan", "task_plan.md"],
  ["strategy", "execution_strategy.md"],
  ["visualMap", "visual_map.md"],
  ["legacyRoadmap", "visual_roadmap.md"],
  ["lessonCandidates", "lesson_candidates.md"],
  ["longRunningContract", "long-running-task-contract.md"],
  ["progress", "progress.md"],
  ["review", "review.md"],
  ["findings", "findings.md"],
  ["walkthrough", "__walkthrough__"],
  ["references", "references/INDEX.md"],
  ["artifacts", "artifacts/INDEX.md"],
];
