#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const appJs = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/app.js"), "utf8")
  .replace(/\nwindow\.addEventListener\("hashchange", app\);\nwindow\.addEventListener\("popstate", app\);\napp\(\);\nloadRuntime\(\);\n?$/, "\n");
const dashboardCss = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/app.css"), "utf8");
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
  const item = {
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
  } as Record<string, unknown>;
  const fallbackQueue = item.state === "in_progress" ? "active" : ["planned", "not_started"].includes(String(item.state)) ? "planned" : item.state === "done" ? "done" : "unknown";
  const queues = Array.isArray(item.taskQueues) && item.taskQueues.length ? item.taskQueues as string[] : [fallbackQueue];
  const primaryQueue = queues.find((queue) => ["blocked", "missing-materials", "review", "lessons", "finalized", "soft-deleted-superseded", "active", "planned", "done", "unknown"].includes(queue)) || queues[0] || "unknown";
  const rawState = String(item.state || "");
  const lifecycleState = rawState === "in_progress" ? "active" : ["planned", "not_started"].includes(rawState) ? "ready" : rawState === "done" ? "closed" : rawState;
  item.taskLifecycleProjection ??= {
    state: item.state,
    lifecycleState,
    reviewStatus: item.reviewStatus,
    reviewQueueState: item.reviewQueueState,
    closeoutStatus: item.closeoutStatus,
    taskQueues: queues,
    materialsReady: true,
    reviewSubmitted: item.reviewStatus === "agent-reviewed",
  };
  item.reviewWorkbenchQueueView ??= {
    queues,
    primaryQueue,
    inQueue: !["active", "planned", "done", "unknown"].includes(primaryQueue),
    humanConfirmable: item.reviewQueueState === "ready-to-confirm" && primaryQueue === "review",
    blocked: primaryQueue === "blocked",
    needsMaterials: primaryQueue === "missing-materials",
    confirmed: primaryQueue === "finalized" && item.reviewStatus === "confirmed",
    finalized: primaryQueue === "finalized",
    hasPendingLessonWork: primaryQueue === "lessons",
    readyForCloseout: false,
    reasonCodes: [],
    reasonSummaries: [],
  };
  item.dashboardTaskView ??= {
    materials: { briefReady: item.briefSource === "standalone", visualMapReady: item.visualMapStatus !== "missing", evidenceReady: item.visualMapStatus !== "missing" && item.briefSource === "standalone", blockingReasonCodes: [] },
    swimlane: { visible: primaryQueue !== "finalized", rowKey: item.module || item.inferredModule || "legacy-unclassified", columnKey: primaryQueue },
  };
  item.semanticProjection ??= {
    taskLifecycleProjection: item.taskLifecycleProjection,
    reviewWorkbenchQueueView: item.reviewWorkbenchQueueView,
    dashboardTaskView: item.dashboardTaskView,
  };
  return item;
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
assert(statsHtml.includes("Active"), "task stats should expose lifecycle queue buckets so displayed buckets add up");
assert(!statsHtml.includes("not started"), "task stats should not expose raw task states as primary task index buckets");
assert(!statsHtml.includes("unknown"), "task stats should not expose raw unknown states as primary task index buckets");

vm.runInContext(`
  __result = JSON.stringify({ layout: state.taskLayout, hasSwimlane: taskIndex().includes('class="task-swimlane"') });
`, stats);
const defaultLayoutResult = JSON.parse(String(stats.__result)) as { layout: string; hasSwimlane: boolean };
assert(defaultLayoutResult.layout === "swimlane", "task index should default to swimlane layout");
assert(defaultLayoutResult.hasSwimlane === true, "default task index render should show the swimlane view");

vm.runInContext(`
  __result = JSON.stringify({
    rows: taskStatRows(normalCycleTasks()).map((row) => [row.state, row.count]),
    activeBriefIds: activeTasks().map((item) => item.id),
    flow: flowPanel(),
    briefs: activeTaskBriefs(),
  });
`, stats);
const activeSemanticsResult = JSON.parse(String(stats.__result)) as { rows: Array<[string, number]>; activeBriefIds: string[]; flow: string; briefs: string };
assert(activeSemanticsResult.rows.some(([state, count]) => state === "active" && count === 1), "only in-progress tasks should count as active");
assert(activeSemanticsResult.rows.some(([state, count]) => state === "planned" && count === 2), "planned and not-started tasks should be planned, not active");
assert(activeSemanticsResult.activeBriefIds.length === 1 && activeSemanticsResult.activeBriefIds[0] === "TASKS/in-progress", "active briefs should include only current in-progress tasks");
assert(!activeSemanticsResult.briefs.includes("Open task index"), "overview active brief section should not render the redundant task-index CTA");
assert(activeSemanticsResult.flow.includes("Queued"), "overview progress should expose non-active queue work separately from active work");

const unknownLifecycleSandbox = createSandbox();
vm.runInContext(`
  bundle.status.tasks = [{
    id: "TASKS/legacy-active-unknown-lifecycle",
    shortId: "legacy-active-unknown-lifecycle",
    title: "Legacy active unknown lifecycle",
    path: "TARGET:coding-agent-harness/planning/tasks/legacy-active-unknown-lifecycle",
    state: "in_progress",
    module: "dashboard",
    completion: 25,
    taskQueues: ["active"],
    taskLifecycleProjection: {
      state: "in_progress",
      lifecycleState: "unknown",
      closeoutStatus: "open",
      taskQueues: ["active"],
    },
  }];
  __result = JSON.stringify({ active: activeTasks().map((item) => item.id) });
`, unknownLifecycleSandbox);
const unknownLifecycleResult = JSON.parse(String(unknownLifecycleSandbox.__result)) as { active: string[] };
assert(!unknownLifecycleResult.active.includes("TASKS/legacy-active-unknown-lifecycle"), "unknown lifecycle projection should fail closed instead of being treated as active");

const missingProjectionSandbox = createSandbox();
vm.runInContext(`
  bundle.status.tasks = [{
    id: "TASKS/raw-without-projection",
    shortId: "raw-without-projection",
    title: "Raw without projection",
    path: "TARGET:coding-agent-harness/planning/tasks/raw-without-projection",
    state: "in_progress",
    module: "dashboard",
    inferredModule: "",
    completion: 40,
    reviewStatus: "agent-reviewed",
    reviewQueueState: "ready-to-confirm",
    closeoutStatus: "missing",
    taskQueues: ["review"],
    queueReasons: [{ code: "raw-only" }],
    taskLifecycleProjection: undefined,
    reviewWorkbenchQueueView: undefined,
    dashboardTaskView: undefined,
    semanticProjection: undefined,
  }];
  state.taskState = "active";
  __result = JSON.stringify({
    state: taskStateValue(bundle.status.tasks[0]),
    activeCount: moduleCountsForTasks(bundle.status.tasks).active,
    filteredActive: filteredTasks().map((item) => item.id),
  });
`, missingProjectionSandbox);
const missingProjectionResult = JSON.parse(String(missingProjectionSandbox.__result)) as { state: string; activeCount: number; filteredActive: string[] };
assert(missingProjectionResult.state === "unknown", "task state should fail closed to unknown when queue projections are missing");
assert(missingProjectionResult.activeCount === 0, "module/task counts must not treat projection-missing tasks as active");
assert(missingProjectionResult.filteredActive.length === 0, "task filters must not show projection-missing raw active/review tasks in the active bucket");

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

const documentOrderSandbox = createSandbox();
vm.runInContext(`
  window.HarnessMarkdown = { render: (content) => String(content || "") };
  bundle.documents = {
    documents: [
      { path: "TARGET:coding-agent-harness/planning/tasks/raw-core-fallback/progress.md", content: "# Raw Progress" },
      { path: "TARGET:coding-agent-harness/planning/tasks/raw-core-fallback/walkthrough.md", content: "# Raw Walkthrough" },
    ],
  };
  const docsByKey = {
    "brief.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/brief.md", content: "# Brief" },
    "task_plan.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/task_plan.md", content: "# Plan" },
    "progress.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/progress.md", content: "# Progress" },
    "review.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/review.md", content: "# Review" },
    "lesson_candidates.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/lesson_candidates.md", content: "# Lessons" },
    "walkthrough.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/walkthrough.md", content: "# Walkthrough" },
    "references/INDEX.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/references/INDEX.md", content: "# References" },
    "references/operator-runbook.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/references/operator-runbook.md", title: "Operator Runbook", content: "# Operator Runbook" },
    "artifacts/__dashboard_artifacts.md": { path: "TARGET:coding-agent-harness/planning/tasks/doc-order/artifacts/__dashboard_artifacts.md", content: "# Artifacts" },
  };
  function orderedKeysFor(overrides) {
    const item = {
      id: "TASKS/doc-order",
      path: "TARGET:coding-agent-harness/planning/tasks/doc-order",
      state: overrides.state || "planned",
      completion: 0,
      documentsByKey: docsByKey,
      documentProjection: { byKey: docsByKey },
      reviewWorkbenchQueueView: {
        queues: overrides.taskQueues || [],
        primaryQueue: (overrides.taskQueues || [])[0] || "planned",
      },
      ...overrides,
    };
    return orderedTaskDocuments(item).map((doc) => doc.key);
  }
  __result = JSON.stringify({
    missing: orderedKeysFor({ state: "review", taskQueues: ["missing-materials"], taskLifecycleProjection: { state: "review", lifecycleState: "in_review", taskQueues: ["missing-materials"] } }).slice(0, 4),
    active: orderedKeysFor({ state: "in_progress", taskQueues: ["active"], taskLifecycleProjection: { state: "in_progress", lifecycleState: "active", taskQueues: ["active"] } }).slice(0, 4),
    review: orderedKeysFor({ state: "review", taskQueues: ["review"], taskLifecycleProjection: { state: "review", lifecycleState: "in_review", taskQueues: ["review"] } }).slice(0, 5),
    done: orderedKeysFor({ state: "done", taskQueues: ["finalized"], taskLifecycleProjection: { state: "done", lifecycleState: "closed", taskQueues: ["finalized"] } }).slice(0, 6),
    allReview: orderedKeysFor({ state: "review", taskQueues: ["review"], taskLifecycleProjection: { state: "review", lifecycleState: "in_review", taskQueues: ["review"] } }),
    unprojectedCoreOrder: orderedTaskDocuments({
      id: "TASKS/raw-core-fallback",
      path: "TARGET:coding-agent-harness/planning/tasks/raw-core-fallback",
      state: "in_progress",
      completion: 0,
      documentsByKey: {},
      documentProjection: { byKey: {} },
      reviewWorkbenchQueueView: { queues: ["active"], primaryQueue: "active" },
      taskLifecycleProjection: { state: "in_progress", lifecycleState: "active", taskQueues: ["active"] },
    }).map((doc) => doc.key),
    projectedSelected: selectedSourceDocument({ path: "TARGET:coding-agent-harness/planning/tasks/doc-order", documentsByKey: docsByKey, documentProjection: { byKey: docsByKey } }, "references/operator-runbook.md"),
    unprojectedSelected: selectedSourceDocument({ path: "TARGET:coding-agent-harness/planning/tasks/doc-order", documentsByKey: {}, documentProjection: { byKey: {} } }, "references/operator-runbook.md"),
  });
`, documentOrderSandbox);
const documentOrderResult = JSON.parse(String(documentOrderSandbox.__result)) as { missing: string[]; active: string[]; review: string[]; done: string[]; allReview: string[]; unprojectedCoreOrder: string[]; projectedSelected: string; unprojectedSelected: string };
assert(documentOrderResult.missing[0] === "brief", "missing-materials/early tasks should open brief first");
assert(documentOrderResult.active[0] === "progress", "in-progress tasks should open progress first");
assert(documentOrderResult.review[0] === "walkthrough", "review tasks should open walkthrough first");
assert(documentOrderResult.review[1] === "lessonCandidates", "review tasks should prioritize lesson candidates after walkthrough");
assert(documentOrderResult.done[0] === "walkthrough", "closed tasks should open walkthrough first");
assert(documentOrderResult.allReview.includes("references/operator-runbook.md"), "task detail should include nested reference documents");
assert(documentOrderResult.allReview.includes("artifacts/__dashboard_artifacts.md"), "task detail should include generated artifact manifests");
assert(!documentOrderResult.unprojectedCoreOrder.includes("progress"), "task detail core docs must not bypass task documentProjection through raw bundle documents");
assert(documentOrderResult.projectedSelected.includes("Operator Runbook"), "manual material doc route should render projected documents");
assert(documentOrderResult.unprojectedSelected === "", "manual material doc route must not bypass task documentProjection");

const documentWorkbenchSandbox = createSandbox();
vm.runInContext(`
  window.HarnessMarkdown = { render: (content) => "<rendered>" + String(content || "") + "</rendered>" };
  const workbenchDocs = {
    "brief.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/brief.md", content: "# Brief\\nBrief body" },
    "task_plan.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/task_plan.md", content: "# Plan" },
    "visual_map.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/visual_map.md", content: "# Visual Map" },
    "long-running-task-contract.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/long-running-task-contract.md", content: "# Contract" },
    "progress.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/progress.md", content: "# Progress" },
    "walkthrough.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/walkthrough.md", content: "# Walkthrough" },
    "references/operator-runbook.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/references/operator-runbook.md", title: "Operator Runbook", content: "# Operator Runbook" },
    "artifacts/__dashboard_artifacts.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/artifacts/__dashboard_artifacts.md", content: "# Artifacts" },
    "notes/future.md": { path: "TARGET:coding-agent-harness/planning/tasks/workbench/notes/future.md", title: "Future Note", content: "# Future" },
  };
  const workbenchTask = {
    id: "TASKS/workbench",
    path: "TARGET:coding-agent-harness/planning/tasks/workbench",
    state: "in_progress",
    completion: 40,
    documentsByKey: workbenchDocs,
    documentProjection: { byKey: workbenchDocs },
    taskLifecycleProjection: { state: "in_progress", lifecycleState: "active", taskQueues: ["active"] },
    reviewWorkbenchQueueView: { queues: ["active"], primaryQueue: "active" },
  };
  const libraryHtml = taskDocumentLibrary(workbenchTask, "references/operator-runbook.md");
  __result = JSON.stringify({
    groups: taskDocumentGroups(workbenchTask).map((group) => [group.key, group.docs.map((doc) => doc.key)]),
    defaultKey: defaultTaskDocumentKey(workbenchTask, orderedTaskDocuments(workbenchTask)),
    libraryHtml,
    readerCount: (libraryHtml.match(/class="doc-workbench-reader/g) || []).length,
  });
`, documentWorkbenchSandbox);
const documentWorkbenchResult = JSON.parse(String(documentWorkbenchSandbox.__result)) as { groups: Array<[string, string[]]>; defaultKey: string; libraryHtml: string; readerCount: number };
const workbenchGroups = new Map(documentWorkbenchResult.groups);
assert(workbenchGroups.get("operations")?.includes("longRunningContract"), "document workbench should preserve long-running contracts in Operations");
assert(workbenchGroups.get("references")?.includes("references/operator-runbook.md"), "document workbench should group nested references");
assert(workbenchGroups.get("artifacts")?.includes("artifacts/__dashboard_artifacts.md"), "document workbench should group generated artifact manifests");
assert(workbenchGroups.get("other")?.includes("notes/future.md"), "document workbench should preserve unknown projected keys in Other projected docs");
assert(documentWorkbenchResult.defaultKey === "progress", "document workbench should reuse projection-backed priority for default active document");
assert(documentWorkbenchResult.readerCount === 1, "document workbench should render exactly one markdown reader");
assert(documentWorkbenchResult.libraryHtml.includes('class="doc-workbench"'), "document workbench should replace accordion layout with a workspace layout");
assert(!documentWorkbenchResult.libraryHtml.includes("doc-accordion"), "document workbench should not render source documents as accordions");
assert(documentWorkbenchResult.libraryHtml.includes("Operator Runbook"), "document workbench should render selected material document content");

const drawerPreviewSandbox = createSandbox();
vm.runInContext(`
  window.HarnessMarkdown = { render: (content) => "<rendered>" + String(content || "") + "</rendered>" };
  const drawerDocs = {
    "brief.md": { path: "TARGET:coding-agent-harness/planning/tasks/drawer/brief.md", content: "---\\ntitle: Brief\\n---\\n# Brief\\nBrief summary line.\\n\\n\\\`\\\`\\\`mermaid\\nflowchart LR\\nA-->B\\n\\\`\\\`\\\`\\nKeep this later." },
    "visual_map.md": { path: "TARGET:coding-agent-harness/planning/tasks/drawer/visual_map.md", content: "# Visual Map\\nMap summary line.\\n\\n\\\`\\\`\\\`\\ncommand block should be skipped\\n\\\`\\\`\\\`" },
    "progress.md": { path: "TARGET:coding-agent-harness/planning/tasks/drawer/progress.md", content: "# Progress\\nProgress summary line.\\n" + "x".repeat(1000) },
    "walkthrough.md": { path: "TARGET:coding-agent-harness/planning/tasks/drawer/walkthrough.md", content: "# Walkthrough\\nWalkthrough summary line." },
    "references/operator-runbook.md": { path: "TARGET:coding-agent-harness/planning/tasks/drawer/references/operator-runbook.md", title: "Operator Runbook", content: "# Runbook" },
  };
  function drawerTask(overrides) {
    return {
      id: overrides.id,
      shortId: overrides.id.split("/").pop(),
      title: "Drawer task",
      path: "TARGET:coding-agent-harness/planning/tasks/drawer",
      state: overrides.state,
      completion: overrides.completion || 0,
      documentsByKey: drawerDocs,
      documentProjection: { byKey: drawerDocs },
      taskLifecycleProjection: overrides.lifecycle,
      reviewWorkbenchQueueView: { queues: overrides.lifecycle.taskQueues, primaryQueue: overrides.lifecycle.taskQueues[0] },
      phases: [{ id: "EXEC-01", kind: "execution", state: "in_progress", completion: 40, actor: "agent", evidenceStatus: "partial", output: "work", exitCommand: "harness task-phase drawer EXEC-01" }],
    };
  }
  const planned = drawerTask({ id: "TASKS/drawer-planned", state: "planned", lifecycle: { state: "planned", lifecycleState: "ready", taskQueues: ["planned"] } });
  const active = drawerTask({ id: "TASKS/drawer-active", state: "in_progress", completion: 40, lifecycle: { state: "in_progress", lifecycleState: "active", taskQueues: ["active"] } });
  const review = drawerTask({ id: "TASKS/drawer-review", state: "review", completion: 90, lifecycle: { state: "review", lifecycleState: "in_review", taskQueues: ["review"] } });
  bundle.status.tasks = [planned, active, review];
  __result = JSON.stringify({
    plannedPreview: drawerPreviewDocuments(planned).map((item) => item.key),
    activePreview: drawerPreviewDocuments(active).map((item) => item.key),
    reviewPreview: drawerPreviewDocuments(review).map((item) => item.key),
    excerpt: safeDocumentExcerpt(drawerDocs["brief.md"].content, 120),
    activeDrawer: renderDrawerContent("TASKS/drawer-active"),
  });
`, drawerPreviewSandbox);
const drawerPreviewResult = JSON.parse(String(drawerPreviewSandbox.__result)) as { plannedPreview: string[]; activePreview: string[]; reviewPreview: string[]; excerpt: string; activeDrawer: string };
assert(drawerPreviewResult.plannedPreview[0] === "brief", "drawer should preview brief for planned tasks");
assert(drawerPreviewResult.activePreview.includes("progress") && drawerPreviewResult.activePreview.includes("visualMap"), "drawer should preview progress and visual map for active tasks");
assert(drawerPreviewResult.reviewPreview[0] === "walkthrough", "drawer should preview walkthrough for review tasks");
assert(!drawerPreviewResult.excerpt.includes("---"), "safe excerpt should skip frontmatter");
assert(!drawerPreviewResult.excerpt.includes("flowchart"), "safe excerpt should skip mermaid/code blocks");
assert(drawerPreviewResult.excerpt.length <= 140, "safe excerpt should be length-limited");
assert(drawerPreviewResult.activeDrawer.includes("Progress summary line"), "drawer should show lifecycle-priority plain text preview");
assert(drawerPreviewResult.activeDrawer.includes("#/tasks/TASKS%2Fdrawer-active/docs/progress"), "drawer preview should deep-link to full page doc route");
assert(!drawerPreviewResult.activeDrawer.includes("doc-accordion"), "drawer should not embed the full document library");
assert(drawerPreviewResult.activeDrawer.includes("drawer-preview-body markdown"), "drawer preview cards should expand inline for core documents");
assert(drawerPreviewResult.activeDrawer.includes("<rendered># Progress"), "drawer preview should render only selected core documents inline");
assert(!drawerPreviewResult.activeDrawer.includes("<rendered># Runbook"), "drawer should keep non-preview documents as full-page links only");

assert(/\.phase-step strong\s*\{[^}]*overflow-wrap:\s*anywhere/s.test(dashboardCss), "compact phase cards should wrap long phase ids");
assert(/\.phase-step-head span\s*\{[^}]*overflow-wrap:\s*anywhere/s.test(dashboardCss), "compact phase cards should wrap long phase metadata");

const lifecycleQueueSandbox = createSandbox();
vm.runInContext(`
  bundle.status.tasks = [{
    id: "TASKS/raw-review-missing-materials",
    shortId: "raw-review-missing-materials",
    title: "Raw review missing materials",
    path: "TARGET:coding-agent-harness/planning/tasks/raw-review-missing-materials",
    state: "review",
    module: "dashboard",
    inferredModule: "",
    completion: 80,
    reviewStatus: "agent-reviewed",
    reviewQueueState: "needs-material",
    closeoutStatus: "missing",
    visualMapStatus: "present",
    briefSource: "standalone",
    taskQueues: ["missing-materials"],
    queueReasons: [{ code: "missing-review-submission", message: "missing packet" }],
    taskLifecycleProjection: {
      state: "review",
      lifecycleState: "in_review",
      reviewStatus: "agent-reviewed",
      reviewQueueState: "needs-material",
      closeoutStatus: "missing",
      taskQueues: ["missing-materials"],
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
      reasonCodes: ["missing-review-submission"],
      reasonSummaries: [{ code: "missing-review-submission", message: "missing packet" }],
    },
    dashboardTaskView: {
      visibleInSwimlane: true,
      swimlaneStage: "missing-materials",
      swimlane: {
        visible: true,
        rowKey: "dashboard",
        rowLabelKey: "",
        columnKey: "missing-materials",
        columnLabelKey: "queueMissingMaterials",
        tone: "warn",
        sortKey: "raw-review-missing-materials",
      },
      materials: { briefReady: true, visualMapReady: true, evidenceReady: false, blockingReasonCodes: ["missing-review-submission"] },
      needsEvidence: false,
      reasonCode: "",
      reasonMessage: "",
    },
  }];
  state.taskState = "missing-materials";
  state.query = "";
  __result = JSON.stringify({
    stats: taskStatRows(normalCycleTasks()).map((row) => [row.state, row.count]),
    filtered: filteredTasks().map((item) => item.id),
    row: taskRow(bundle.status.tasks[0]),
    swimlaneCards: taskSwimlaneModel(filteredTasks()).cards.map((card) => [card.id, card.stage]),
  });
`, lifecycleQueueSandbox);
const lifecycleQueueResult = JSON.parse(String(lifecycleQueueSandbox.__result)) as {
  stats: Array<[string, number]>;
  filtered: string[];
  row: string;
  swimlaneCards: Array<[string, string]>;
};
assert(lifecycleQueueResult.stats.some(([state, count]) => state === "missing-materials" && count === 1), "task stats should count lifecycle primary queue instead of raw review state");
assert(!lifecycleQueueResult.stats.some(([state]) => state === "review"), "raw review state must not inflate the task index review count when the primary lifecycle queue is missing-materials");
assert(lifecycleQueueResult.filtered.includes("TASKS/raw-review-missing-materials"), "task state filter should use lifecycle primary queue values");
assert(lifecycleQueueResult.row.includes("missing materials"), "task row should display the lifecycle primary queue label");
assert(lifecycleQueueResult.swimlaneCards.some(([id, stage]) => id === "TASKS/raw-review-missing-materials" && stage === "missing-materials"), "task swimlane should use the same lifecycle primary queue as list/grid views");

const reviewQueueProjectionSandbox = createSandbox();
vm.runInContext(`
  bundle.status.tasks = [{
    id: "TASKS/raw-review-projected-materials",
    shortId: "raw-review-projected-materials",
    title: "Raw review projected materials",
    path: "TARGET:coding-agent-harness/planning/tasks/raw-review-projected-materials",
    state: "review",
    module: "dashboard",
    inferredModule: "",
    completion: 80,
    reviewStatus: "agent-reviewed",
    reviewQueueState: "ready-to-confirm",
    closeoutStatus: "missing",
    visualMapStatus: "present",
    briefSource: "standalone",
    taskQueues: ["review"],
    queueReasons: [{ code: "raw-review-only", message: "raw reason must not drive review UI", severity: "P0" }],
    taskLifecycleProjection: {
      state: "review",
      lifecycleState: "in_review",
      reviewStatus: "agent-reviewed",
      reviewQueueState: "needs-material",
      closeoutStatus: "missing",
      taskQueues: ["missing-materials"],
      reviewSubmitted: true,
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
      reasonCodes: ["projected-material"],
      reasonSummaries: [{ code: "projected-material", message: "projected reason", severity: "P3" }],
    },
    dashboardTaskView: {
      materials: { evidenceReady: false },
    },
  }];
  state.query = "";
  state.reviewSort = "queue";
  state.reviewReasonFilter = "all";
  state.reviewQueueTab = "review";
  const reviewHtml = reviewQueue();
  state.reviewQueueTab = "missing-materials";
  const materialsHtml = reviewQueue();
  state.reviewReasonFilter = "projected-material";
  const projectedFilterHtml = reviewQueue();
  state.reviewReasonFilter = "all";
  state.query = "raw-review-only";
  const rawSearchHtml = reviewQueue();
  __result = JSON.stringify({
    reviewHtml,
    materialsHtml,
    projectedFilterHtml,
    rawSearchHtml,
    queues: reviewTaskQueues(bundle.status.tasks[0]),
    reasonOptions: reviewReasonOptions(bundle.status.tasks),
    priority: reviewPriorityRank(bundle.status.tasks[0]),
  });
`, reviewQueueProjectionSandbox);
const reviewQueueProjectionResult = JSON.parse(String(reviewQueueProjectionSandbox.__result)) as {
  reviewHtml: string;
  materialsHtml: string;
  projectedFilterHtml: string;
  rawSearchHtml: string;
  queues: string[];
  reasonOptions: string[];
  priority: number;
};
assert(!reviewQueueProjectionResult.reviewHtml.includes("Raw review projected materials"), "review queue tab must not include tasks solely because raw taskQueues contains review");
assert(reviewQueueProjectionResult.materialsHtml.includes("Raw review projected materials"), "missing-materials tab should include tasks from reviewWorkbenchQueueView projection");
assert(reviewQueueProjectionResult.projectedFilterHtml.includes("Raw review projected materials"), "reason filter should use projected reason codes");
assert(!reviewQueueProjectionResult.rawSearchHtml.includes("Raw review projected materials"), "review queue search must not use raw queueReasons");
assert(reviewQueueProjectionResult.queues.includes("missing-materials") && !reviewQueueProjectionResult.queues.includes("review"), "review queue helper should expose projected queues only");
assert(reviewQueueProjectionResult.reasonOptions.includes("projected-material") && !reviewQueueProjectionResult.reasonOptions.includes("raw-review-only"), "review reason options should expose projected reason codes only");
assert(reviewQueueProjectionResult.priority === 1, "review priority should be driven by projected queue rank, not raw P0 reason severity");

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

const reviewSelectionSandbox = createSandbox();
vm.runInContext(`
  bundle.status.tasks = [
    {
      id: "TASKS/review-alpha",
      shortId: "review-alpha",
      title: "Alpha review",
      path: "TARGET:coding-agent-harness/planning/tasks/review-alpha",
      state: "review",
      module: "dashboard",
      completion: 100,
      taskLifecycleProjection: {
        state: "review",
        lifecycleState: "in_review",
        reviewStatus: "agent-reviewed",
        reviewQueueState: "ready-to-confirm",
        closeoutStatus: "missing",
        taskQueues: ["review"],
        materialsReady: true,
        reviewSubmitted: true,
      },
      reviewWorkbenchQueueView: {
        queues: ["review"],
        primaryQueue: "review",
        inQueue: true,
        humanConfirmable: true,
        reasonCodes: [],
      },
    },
    {
      id: "TASKS/review-beta",
      shortId: "review-beta",
      title: "Beta review",
      path: "TARGET:coding-agent-harness/planning/tasks/review-beta",
      state: "review",
      module: "dashboard",
      completion: 100,
      taskLifecycleProjection: {
        state: "review",
        lifecycleState: "in_review",
        reviewStatus: "agent-reviewed",
        reviewQueueState: "ready-to-confirm",
        closeoutStatus: "missing",
        taskQueues: ["review"],
        materialsReady: true,
        reviewSubmitted: true,
      },
      reviewWorkbenchQueueView: {
        queues: ["review"],
        primaryQueue: "review",
        inQueue: true,
        humanConfirmable: true,
        reasonCodes: [],
      },
    },
  ];
  state.reviewQueueTab = "review";
  state.reviewSort = "id";
  state.reviewReasonFilter = "all";
  state.reviewBulkSelection = { "TASKS/review-beta": true };
  state.query = "alpha";
  reviewQueue();
  const retainedWhileHidden = state.reviewBulkSelection["TASKS/review-beta"] === true;
  state.query = "beta";
  const betaHtml = reviewQueue();
  __result = JSON.stringify({ retainedWhileHidden, betaChecked: betaHtml.includes('data-review-bulk-select="TASKS/review-beta"') && betaHtml.includes("checked") });
`, reviewSelectionSandbox);
const reviewSelectionResult = JSON.parse(String(reviewSelectionSandbox.__result)) as { retainedWhileHidden: boolean; betaChecked: boolean };
assert(reviewSelectionResult.retainedWhileHidden === true, "review bulk selection should survive search filters that hide selected tasks");
assert(reviewSelectionResult.betaChecked === true, "review bulk selection should restore checkbox state when the task becomes visible again");

const oldReviewShell = { scrollTop: 480 };
const newReviewShell = { scrollTop: 0 };
const scrollSandbox = createSandbox({
  window: {
    __HARNESS_LOCALE__: "en",
    __HARNESS_WORKBENCH__: false,
    __HARNESS_DASHBOARD__: { schemaVersion: "dashboard-bundle/v1", status: { tasks: [], summary: {}, checkState: { details: { warnings: [], failures: [] } } }, documents: { documents: [] }, graph: { nodes: [], edges: [] }, adoption: { warnings: [] } },
    location: { hash: "#/review", protocol: "http:" },
    matchMedia: () => ({ matches: false }),
    HarnessI18n: {},
    scrollX: 0,
    scrollY: 960,
    scrollTo(this: { scrollX: number; scrollY: number }, x: number, y: number) {
      this.scrollX = x;
      this.scrollY = y;
    },
  },
  document: {
    documentElement: { dataset: {}, lang: "", scrollLeft: 0, scrollTop: 960 },
    body: { scrollTop: 960 },
    querySelector: () => oldReviewShell,
    querySelectorAll: () => [],
    getElementById: () => null,
  },
  requestAnimationFrame: (callback: () => void) => {
    callback();
    return 1;
  },
});
vm.runInContext(`
  app = () => {
    document.querySelector = () => __nextReviewShell;
  };
  __nextReviewShell = ${JSON.stringify(newReviewShell)};
  rerenderPreservingScroll();
  __result = JSON.stringify({ scrollY: window.scrollY, shellTop: __nextReviewShell.scrollTop });
`, scrollSandbox);
const scrollResult = JSON.parse(String(scrollSandbox.__result)) as { scrollY: number; shellTop: number };
assert(scrollResult.scrollY === 960, "bulk selection rerender should preserve window scroll");
assert(scrollResult.shellTop === 480, "bulk selection rerender should preserve review list scroll");

const docNavSandbox = createSandbox({
  requestAnimationFrame: (callback: () => void) => {
    callback();
    return 1;
  },
});
vm.runInContext(`
  const oldDocNav = { scrollTop: 620 };
  const newDocNav = { scrollTop: 0 };
  const docLink = {
    listeners: {},
    getAttribute(name) {
      return name === "href" ? "#/tasks/TASKS%2Fworkbench/docs/review" : "";
    },
    addEventListener(type, listener) {
      this.listeners[type] = listener;
    },
  };
  window.location.hash = "#/tasks/TASKS%2Fworkbench/docs/progress";
  window.scrollX = 0;
  window.scrollY = 740;
  window.scrollTo = function(x, y) {
    this.scrollX = x;
    this.scrollY = y;
  };
  window.history = {
    pushed: "",
    pushState(_state, _title, href) {
      this.pushed = href;
      window.location.hash = href;
    },
  };
  document = {
    documentElement: { dataset: {}, lang: "", scrollTop: 740 },
    body: { scrollTop: 740 },
    querySelector(selector) {
      if (selector === ".doc-workbench-nav") return oldDocNav;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === "[data-doc-nav-link]") return [docLink];
      return [];
    },
    getElementById: () => null,
  };
  let rerendered = false;
  app = () => {
    rerendered = true;
    document.querySelector = (selector) => selector === ".doc-workbench-nav" ? newDocNav : null;
  };
  bind();
  const clickEvent = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  docLink.listeners.click(clickEvent);
  __result = JSON.stringify({
    defaultPrevented: clickEvent.defaultPrevented,
    hash: window.location.hash,
    pushed: window.history.pushed,
    scrollY: window.scrollY,
    docNavTop: newDocNav.scrollTop,
    rerendered,
  });
`, docNavSandbox);
const docNavResult = JSON.parse(String(docNavSandbox.__result)) as { defaultPrevented: boolean; hash: string; pushed: string; scrollY: number; docNavTop: number; rerendered: boolean };
assert(docNavResult.defaultPrevented === true, "document nav clicks should suppress browser hash scroll");
assert(docNavResult.hash.endsWith("/docs/review"), "document nav click should update the selected document route");
assert(docNavResult.pushed.endsWith("/docs/review"), "document nav click should keep browser history addressable");
assert(docNavResult.scrollY === 740, "document nav click should preserve window scroll");
assert(docNavResult.docNavTop === 620, "document nav click should preserve the source document list scroll");
assert(docNavResult.rerendered === true, "document nav click should rerender the selected document");

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
