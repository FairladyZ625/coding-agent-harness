#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import type { SpawnSyncReturns } from "node:child_process";
import { confirmTaskReview } from "../scripts/lib/task-lifecycle.mjs";
import type { HarnessTestLooseJson, HarnessTestLooseTask } from "./helpers/harness-test-types.js";
import { acceptNoLessonCandidate, assert, expectJson, expectPass, run, sanitizeTemplateFixtureMaterials, tmpRoot } from "./helpers/harness-test-utils.mjs";

type ContractTask = HarnessTestLooseTask & {
  semanticProjection?: {
    taskLifecycleProjection?: Record<string, unknown>;
    visibility?: { scopes?: string[] };
    dashboardTaskView?: Record<string, unknown>;
    reviewWorkbenchQueueView?: Record<string, unknown>;
  };
  taskLifecycleProjection?: Record<string, unknown>;
  visibility?: { scopes?: string[] };
  visibilityScopes?: string[];
  dashboardTaskView?: Record<string, unknown>;
  reviewWorkbenchQueueView?: {
    queues?: string[];
    primaryQueue?: string;
    humanConfirmable?: boolean;
    blocked?: boolean;
    needsMaterials?: boolean;
    finalized?: boolean;
    reasonCodes?: string[];
  };
};

type DashboardBundle = {
  schemaVersion: string;
  status: { tasks: ContractTask[]; summary?: { taskScopes?: Record<string, number> } };
};

const target = path.join(tmpRoot, "semantic-contract-baseline-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", target]);

const emptyTarget = path.join(tmpRoot, "semantic-contract-empty-target");
fs.mkdirSync(emptyTarget);
expectJson(["init", "--locale", "zh-CN", "--capabilities", "core,dashboard", emptyTarget]);
const emptyStatus = expectJson(["status", "--json", emptyTarget]);
const emptyIndex = expectJson(["task-index", "--json", emptyTarget]);
assert(emptyStatus.schemaVersion === 2, "empty target status --json must preserve schemaVersion 2");
assert(Array.isArray(emptyStatus.tasks) && emptyStatus.tasks.length === 0, "empty target status --json should not invent tasks");
assert(emptyIndex.schemaVersion === "task-index/v2", "empty target task-index --json must preserve task-index/v2");
assert(Array.isArray(emptyIndex.tasks) && emptyIndex.tasks.length === 0, "empty target task-index --json should not invent tasks");

const active = expectJson(["new-task", "contract-active", "--title", "Contract Active", "--locale", "en-US", target]);
expectJson(["task-start", "contract-active", "--message", "active contract fixture started", target]);

const migrationOnly = expectJson(["new-task", "contract-migration-only", "--title", "Contract Migration Only", "--locale", "en-US", target]);
expectJson(["task-start", "contract-migration-only", "--message", "migration-only adapter fixture started", target]);
markMigrationOnlyAdapter(taskDirectory(migrationOnly));

const rootTask = expectJson(["new-task", "contract-root-task", "--title", "Contract Root Task", "--locale", "en-US", target]);
expectJson(["task-start", "contract-root-task", "--message", "root task fixture started", target]);

const ready = submitReviewReadyTask("contract-ready-review", "Contract Ready Review");
const missingMaterials = submitReviewReadyTask("contract-missing-materials", "Contract Missing Materials");
fs.rmSync(path.join(taskDirectory(missingMaterials), "walkthrough.md"));

const blocked = submitReviewReadyTask("contract-blocked", "Contract Blocked");
appendOpenBlockingFinding(taskDirectory(blocked), "CB-001", "Contract baseline blocking finding");

const noLessonDecision = submitReviewReadyTask("contract-no-lesson-decision", "Contract No Lesson Decision");
resetLessonDecision(taskDirectory(noLessonDecision));

const closedButUnconfirmed = submitReviewReadyTask("contract-closed-unconfirmed", "Contract Closed Unconfirmed");
acceptNoLessonCandidate(taskDirectory(closedButUnconfirmed));
writeClosedCloseout(taskDirectory(closedButUnconfirmed));

const confirmed = submitReviewReadyTask("contract-confirmed", "Contract Confirmed");
acceptNoLessonCandidate(taskDirectory(confirmed));
const archived = submitReviewReadyTask("contract-archived", "Contract Archived");
acceptNoLessonCandidate(taskDirectory(archived));
commitFixtureBaseline(target, "before contract confirmation");
expectReviewConfirmJson(confirmed.task.id, confirmed.task.shortId);
expectReviewConfirmJson(archived.task.id, archived.task.shortId);
expectJson(["task-archive", archived.task.id, "--reason", "contract archive fixture", "--archived-by", "Contract Reviewer <contract@example.invalid>", "--archive-field", "retention bucket=contract-baseline", target]);

const replacement = expectJson(["new-task", "contract-superseding", "--title", "Contract Superseding", "--locale", "en-US", target]);
const superseded = expectJson(["new-task", "contract-superseded", "--title", "Contract Superseded", "--locale", "en-US", target]);
expectJson(["task-supersede", superseded.task.id, "--by", replacement.task.id, "--reason", "contract supersede fixture", target]);
const softDeleted = expectJson(["new-task", "contract-soft-deleted", "--title", "Contract Soft Deleted", "--locale", "en-US", target]);
expectJson(["task-delete", softDeleted.task.id, "--soft", "--reason", "contract soft-delete fixture", target]);

const status = expectJsonAllowingValidationFailure(["status", "--json", target]) as HarnessTestLooseJson & { summary?: { taskScopes?: Record<string, number> } };
const taskIndex = expectJsonAllowingValidationFailure(["task-index", "--json", target]) as HarnessTestLooseJson & { scope?: string; taskScopes?: Record<string, number> };
assert(Array.isArray(status.tasks), "status --json tasks must be an array for the contract baseline");
assert(Array.isArray(taskIndex.tasks), "task-index --json tasks must be an array for the contract baseline");
const statusTasks: ContractTask[] = status.tasks.map((task) => task);
const indexTasks: ContractTask[] = taskIndex.tasks.map((task) => task);

assert(status.schemaVersion === 2, "status --json must expose schemaVersion 2 for the contract baseline");
assert(taskIndex.schemaVersion === "task-index/v2", "task-index --json must expose task-index/v2 for the contract baseline");

const requiredIds = [
  active.task.id,
  migrationOnly.task.id,
  rootTask.task.id,
  ready.task.id,
  missingMaterials.task.id,
  blocked.task.id,
  noLessonDecision.task.id,
  closedButUnconfirmed.task.id,
  confirmed.task.id,
  archived.task.id,
  replacement.task.id,
  superseded.task.id,
  softDeleted.task.id,
];
for (const id of requiredIds) {
  assert(statusTasks.some((task) => task.id === id), `status --json lost contract task ${id}`);
  assert(indexTasks.some((task) => task.id === id), `task-index --json lost contract task ${id}`);
}

for (const task of statusTasks.filter((item) => requiredIds.includes(item.id))) {
  assertContractFields(task, `status task ${task.id}`);
  assert(task.semanticProjection?.taskLifecycleProjection, `status task ${task.id} missing semanticProjection.taskLifecycleProjection`);
  assert(task.semanticProjection?.visibility, `status task ${task.id} missing semanticProjection.visibility`);
  assert(task.semanticProjection?.dashboardTaskView, `status task ${task.id} missing semanticProjection.dashboardTaskView`);
  assert(task.semanticProjection?.reviewWorkbenchQueueView, `status task ${task.id} missing semanticProjection.reviewWorkbenchQueueView`);
  assert(JSON.stringify(task.taskLifecycleProjection) === JSON.stringify(task.semanticProjection.taskLifecycleProjection), `status task ${task.id} direct lifecycle projection drifted from nested projection`);
  assert(JSON.stringify(task.visibility) === JSON.stringify(task.semanticProjection.visibility), `status task ${task.id} direct visibility projection drifted from nested projection`);
  assert(JSON.stringify(task.visibilityScopes) === JSON.stringify(task.semanticProjection.visibility.scopes), `status task ${task.id} direct visibilityScopes drifted from nested visibility projection`);
  assert(JSON.stringify(task.dashboardTaskView) === JSON.stringify(task.semanticProjection.dashboardTaskView), `status task ${task.id} direct dashboard projection drifted from nested projection`);
  assert(JSON.stringify(task.reviewWorkbenchQueueView) === JSON.stringify(task.semanticProjection.reviewWorkbenchQueueView), `status task ${task.id} direct workbench projection drifted from nested projection`);
}

for (const task of indexTasks.filter((item) => requiredIds.includes(item.id))) {
  assertContractFields(task, `task-index task ${task.id}`);
}

const readyStatus = findTask(statusTasks, ready.task.id);
assert(readyStatus.reviewQueueState === "ready-to-confirm", "ready task should project ready-to-confirm");
assert(readyStatus.reviewWorkbenchQueueView?.humanConfirmable === true, "ready task should be human-confirmable");
assert(readyStatus.reviewWorkbenchQueueView?.primaryQueue === "review", "ready task should use review as primary workbench queue");

const missingStatus = findTask(statusTasks, missingMaterials.task.id);
assert(missingStatus.reviewWorkbenchQueueView?.humanConfirmable === false, "missing-materials fixture must fail closed for human confirmation");
assert(missingStatus.reviewWorkbenchQueueView?.needsMaterials === true, "missing-materials fixture should project material debt");
assert(missingStatus.taskQueues.includes("missing-materials"), "missing-materials fixture should enter missing-materials queue");
assert(missingStatus.reviewWorkbenchQueueView.reasonCodes?.includes("review-closeout-materials-incomplete"), "missing-materials fixture should explain closeout material debt");

const noLessonStatus = findTask(statusTasks, noLessonDecision.task.id);
assert(noLessonStatus.reviewWorkbenchQueueView?.humanConfirmable === false, "no-lesson-decision fixture must fail closed for human confirmation");
assert(noLessonStatus.reviewWorkbenchQueueView?.needsMaterials === true, "no-lesson-decision fixture should project material debt");
assert(noLessonStatus.reviewWorkbenchQueueView.reasonCodes?.includes("missing-lesson-decision"), "no-lesson-decision fixture should explain missing lesson decision");

const closedButUnconfirmedStatus = findTask(statusTasks, closedButUnconfirmed.task.id);
assert(closedButUnconfirmedStatus.reviewWorkbenchQueueView?.humanConfirmable === false, "closed-but-unconfirmed fixture must fail closed for human confirmation");
assert(closedButUnconfirmedStatus.reviewQueueState !== "ready-to-confirm", "closed-but-unconfirmed fixture must not project ready-to-confirm");
assert(!closedButUnconfirmedStatus.taskQueues.includes("review"), "closed-but-unconfirmed fixture must not enter review queue without Agent Review Submission");

const blockedStatus = findTask(statusTasks, blocked.task.id);
assert(blockedStatus.reviewWorkbenchQueueView?.humanConfirmable === false, "blocked fixture must fail closed for human confirmation");
assert(blockedStatus.reviewWorkbenchQueueView?.blocked === true, "blocked fixture should project blocked workbench state");
assert(blockedStatus.taskQueues.includes("blocked"), "blocked fixture should enter blocked queue");

const confirmedStatus = findTask(statusTasks, confirmed.task.id);
assert(confirmedStatus.reviewStatus === "confirmed", "confirmed fixture should expose confirmed reviewStatus");
assert(confirmedStatus.deletionState === "active", "confirmed fixture should remain active for finalized projection coverage");
assert(confirmedStatus.reviewWorkbenchQueueView?.finalized === true, "confirmed fixture should project finalized workbench state");
assert(!confirmedStatus.taskQueues.includes("review"), "confirmed fixture must not remain in review queue");

const archivedStatus = findTask(statusTasks, archived.task.id);
assert(archivedStatus.reviewSubmitted === true, "archived fixture should retain Agent Review Submission status after archive storage move");
const archivedReviewSubmission = archivedStatus.reviewSubmission as { submitted?: unknown } | undefined;
assert(archivedReviewSubmission?.submitted === true, "archived fixture should retain Agent Review Submission packet after archive storage move");
assert(archivedStatus.reviewStatus === "confirmed", "archived fixture should retain confirmed human-review status after archive storage move");
assert(archivedStatus.deletionState === "archived", "archived fixture should expose archived deletionState after task-archive");
assert(archivedStatus.reviewQueueState === "not-in-queue", "archived fixture must not enter review queue");
assert(!archivedStatus.taskQueues.includes("review"), "archived fixture must not remain in the review queue");
assert(archivedStatus.taskQueues.includes("soft-deleted-superseded"), "archived fixture should route through the deleted/superseded workbench queue");

const supersededStatus = findTask(statusTasks, superseded.task.id);
assert(supersededStatus.deletionState === "superseded", "superseded fixture should expose superseded deletionState");
assert(supersededStatus.supersededBy === replacement.task.id, "superseded fixture should expose replacement task id");
assert(supersededStatus.reviewQueueState === "not-in-queue", "superseded fixture must not enter review queue");
assert(supersededStatus.visibilityScopes?.includes("tombstone-history"), "superseded fixture should enter tombstone-history scope");
assert(!supersededStatus.visibilityScopes?.includes("active-cycle"), "superseded fixture must not enter active-cycle scope");

const softDeletedStatus = findTask(statusTasks, softDeleted.task.id);
assert(softDeletedStatus.deletionState === "soft-deleted", "soft-deleted fixture should expose soft-deleted deletionState");
assert(softDeletedStatus.visibilityScopes?.includes("tombstone-history"), "soft-deleted fixture should enter tombstone-history scope");
assert(!softDeletedStatus.visibilityScopes?.includes("archive-history"), "soft-deleted fixture must not enter archive-history scope");
assert(!softDeletedStatus.visibilityScopes?.includes("active-cycle"), "soft-deleted fixture must not enter active-cycle scope");

assert(status.summary?.taskScopes?.all === statusTasks.length, "status summary taskScopes.all must match full status task count");
assert(status.summary?.taskScopes?.activeCycle === statusTasks.filter((task) => task.visibilityScopes?.includes("active-cycle")).length, "status summary activeCycle scope count must match task visibility projections");
assert(status.summary?.taskScopes?.archiveHistory === statusTasks.filter((task) => task.visibilityScopes?.includes("archive-history")).length, "status summary archiveHistory scope count must match task visibility projections");
assert(status.summary?.taskScopes?.tombstoneHistory === statusTasks.filter((task) => task.visibilityScopes?.includes("tombstone-history")).length, "status summary tombstoneHistory scope count must match task visibility projections");
assert(taskIndex.scope === "all", "task-index should declare its explicit all-task audit scope");
assert(taskIndex.taskScopes?.taskIndexDefault === indexTasks.filter((task) => task.visibilityScopes?.includes("task-index-default")).length, "task-index scope summary must match task visibility projections");

const dashboardDir = path.join(target, "tmp-dashboard");
expectPass(["dashboard", "--out-dir", dashboardDir, target]);
const dashboardStatus = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/status.json"), "utf8")) as { tasks: ContractTask[] };
const dashboardTables = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/tables.json"), "utf8")) as { tables?: unknown[] };
const dashboardDocuments = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/documents.json"), "utf8")) as { documents?: unknown[] };
const dashboardGraph = JSON.parse(fs.readFileSync(path.join(dashboardDir, "data/graph.json"), "utf8")) as { nodes?: unknown[]; edges?: unknown[] };
for (const generated of ["data/modules.json", "data/moduleSummary.json", "data/adoption.json"]) {
  assert(fs.existsSync(path.join(dashboardDir, generated)), `dashboard generated-only projection missing ${generated}`);
}
assert(Array.isArray(dashboardTables.tables), "dashboard generated-only projection should expose tables array");
assert(Array.isArray(dashboardDocuments.documents), "dashboard generated-only projection should expose documents array");
assert(Array.isArray(dashboardGraph.nodes) && Array.isArray(dashboardGraph.edges), "dashboard generated-only projection should expose graph nodes and edges arrays");
const dashboardScript = fs.readFileSync(path.join(dashboardDir, "assets/dashboard-data.js"), "utf8");
const match = dashboardScript.match(/window\.__HARNESS_DASHBOARD__\s*=\s*([\s\S]*);\s*$/);
assert(match, "dashboard-data.js must expose a parseable dashboard bundle");
const dashboardBundle = JSON.parse(match[1]) as DashboardBundle;
assert(dashboardBundle.schemaVersion === "dashboard-bundle/v1", "dashboard bundle should expose dashboard-bundle/v1");

for (const id of requiredIds) {
  assert(dashboardStatus.tasks.some((task) => task.id === id), `dashboard data/status.json lost contract task ${id}`);
  assert(dashboardBundle.status.tasks.some((task) => task.id === id), `dashboard bundle lost contract task ${id}`);
}
for (const task of dashboardBundle.status.tasks.filter((item) => requiredIds.includes(item.id))) {
  assertContractFields(task, `dashboard bundle task ${task.id}`);
  assert(task.visibilityScopes, `dashboard bundle task ${task.id} missing visibilityScopes`);
  assert(task.reviewWorkbenchQueueView, `dashboard bundle task ${task.id} missing direct reviewWorkbenchQueueView`);
  assert(task.dashboardTaskView, `dashboard bundle task ${task.id} missing direct dashboardTaskView`);
}
assert(dashboardBundle.status.summary?.taskScopes?.activeCycle === dashboardBundle.status.tasks.filter((task) => task.visibilityScopes?.includes("active-cycle")).length, "dashboard bundle activeCycle scope count must match task visibility projections");

assertDashboardTemplateConsumesVisibilityScopes();
assertDashboardScopeRuntimeBehavior();

assertGuiPreviewOnlyBaseline();
assertGuiSchemaCompatibility(statusTasks.filter((item) => requiredIds.includes(item.id)));

console.log("Semantic contract baseline tests passed");

function submitReviewReadyTask(slug: string, title: string): HarnessTestLooseJson {
  const created = expectJson(["new-task", slug, "--title", title, "--locale", "en-US", target]);
  const taskDir = taskDirectory(created);
  expectJson(["task-start", slug, "--message", `${slug} started`, target]);
  expectJson(["task-phase", slug, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
  sanitizeTemplateFixtureMaterials(taskDir);
  const reviewed = expectJson(["task-review", slug, "--message", `${slug} ready`, "--evidence", "command:TARGET:semantic-contract-baseline:passed", target]);
  fs.appendFileSync(path.join(taskDir, "walkthrough.md"), "\n## Contract Evidence\n\nSemantic contract baseline fixture evidence is present.\n");
  return reviewed;
}

function expectJsonAllowingValidationFailure(args: string[]): HarnessTestLooseJson {
  const result = run(args);
  assert(result.stdout.trim().startsWith("{"), `${args.join(" ")} should emit JSON even when validation fails\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return JSON.parse(result.stdout) as HarnessTestLooseJson;
}

function taskDirectory(result: HarnessTestLooseJson): string {
  return path.join(target, result.task.path.replace(/^TARGET:/, ""));
}

function appendOpenBlockingFinding(taskDir: string, findingId: string, message: string): void {
  const reviewPath = path.join(taskDir, "review.md");
  const content = fs.readFileSync(reviewPath, "utf8");
  fs.writeFileSync(
    reviewPath,
    content.replace(
      "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
      `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| ${findingId} | P1 | ${message} | command:TARGET:semantic-contract-baseline:checked | Resolve before human confirmation | yes | open | yes | P01 |`,
    ),
  );
}

function markMigrationOnlyAdapter(taskDir: string): void {
  fs.mkdirSync(path.join(taskDir, "artifacts"), { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, "artifacts", "migration-only-legacy-input.json"),
    JSON.stringify({ schemaVersion: "legacy-migration-input/v1", source: "legacy-task-pack", runtimeTruth: false }, null, 2),
  );
  fs.appendFileSync(
    path.join(taskDir, "task_plan.md"),
    "\n## Migration-Only Adapter Contract\n\nThis fixture represents legacy input that may be read only by migration adapters. It is not runtime truth and must not change Dashboard or Workbench projection semantics.\n",
  );
}

function resetLessonDecision(taskDir: string): void {
  const candidatePath = path.join(taskDir, "lesson_candidates.md");
  let content = fs.readFileSync(candidatePath, "utf8");
  content = content
    .replace("| Task-level status | no-candidate-accepted |", "| Task-level status | pending-review |")
    .replace("| Review decision | accepted-no-candidate |", "| Review decision | pending-human-review |")
    .replace("| Closeout token | checked-candidate:LC-TEST-000 |", "| Closeout token | pending |");
  fs.writeFileSync(candidatePath, content);
}

function writeClosedCloseout(taskDir: string): void {
  const closeoutPath = path.join(taskDir, "walkthrough.md");
  fs.writeFileSync(closeoutPath, `${fs.readFileSync(closeoutPath, "utf8").trimEnd()}\n\nCloseout Status: closed\n`);
}

function expectReviewConfirmJson(taskId: string, confirmText: string): void {
  try {
    confirmTaskReview(target, taskId, {
      reviewer: "Human Reviewer",
      message: "contract baseline confirmation",
      confirmText,
    });
  } catch (error) {
    throw new Error(`review confirmation failed: ${error instanceof Error ? error.message : String(error || "unknown error")}`);
  }
}

function commitFixtureBaseline(targetRoot: string, message: string): void {
  if (!fs.existsSync(path.join(targetRoot, ".git"))) {
    expectFixtureGit(targetRoot, ["init"]);
    expectFixtureGit(targetRoot, ["config", "user.name", "Harness Test"]);
    expectFixtureGit(targetRoot, ["config", "user.email", "harness-test@example.invalid"]);
  }
  expectFixtureGit(targetRoot, ["add", "."]);
  const diff = spawnSync("git", ["diff", "--cached", "--quiet"], { cwd: targetRoot, encoding: "utf8" });
  if (diff.status === 0) return;
  expectFixtureGit(targetRoot, ["commit", "-m", `test fixture baseline: ${message}`]);
}

function expectFixtureGit(targetRoot: string, args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd: targetRoot, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function assertContractFields(task: ContractTask, label: string): void {
  assert(Object.hasOwn(task, "path") || Object.hasOwn(task, "currentPath"), `${label} missing required contract path/currentPath field`);
  for (const field of [
    "id",
    "state",
    "lifecycleState",
    "reviewStatus",
    "reviewQueueState",
    "reviewSubmitted",
    "materialsReady",
    "materialIssues",
    "taskQueues",
    "visibilityScopes",
    "queueReasons",
    "repairPrompt",
    "closeoutStatus",
    "lessonCandidateStatus",
    "lessonCandidateReviewDecision",
    "lessonCandidatePromotionState",
    "deletionState",
    "supersededBy",
  ]) {
    assert(Object.hasOwn(task, field), `${label} missing required contract field ${field}`);
  }
  assert(Array.isArray(task.taskQueues), `${label} taskQueues must be an array`);
  assert(Array.isArray(task.visibilityScopes), `${label} visibilityScopes must be an array`);
  assert(Array.isArray(task.queueReasons), `${label} queueReasons must be an array`);
  assert(Array.isArray(task.materialIssues), `${label} materialIssues must be an array`);
  assert(typeof task.materialsReady === "boolean", `${label} materialsReady must be boolean`);
}

function findTask(tasks: ContractTask[], id: string): ContractTask {
  const task = tasks.find((item) => item.id === id);
  assert(task, `missing task ${id}`);
  return task;
}

function assertGuiPreviewOnlyBaseline(): void {
  const modelPath = path.join(repoRoot(), "harness-gui/src/model/harnessGui.ts");
  const scannerPath = path.join(repoRoot(), "harness-gui/src/server/scanner.ts");
  if (!fs.existsSync(modelPath) || !fs.existsSync(scannerPath)) {
    assertGitmodulesDeclaresGui();
    return;
  }
  const model = fs.readFileSync(modelPath, "utf8");
  const scanner = fs.readFileSync(scannerPath, "utf8");
  assert(model.includes("previewOnly: boolean"), "GUi action schema must keep previewOnly as an explicit contract field");
  assert(scanner.includes("previewOnly: true"), "GUi review-confirm action must remain preview-only until P08 consumes stable CLI projection");
  assert(scanner.includes("Disabled as a real write until Harness CLI/core confirm action exists."), "GUi preview-only action must explain why it is not runtime truth");
  assert(!scanner.includes("inferQueues("), "GUi scanner must not keep independent raw queue inference after semantic projection parity repair");
  assert(scanner.includes("projectCanonicalTaskSemantics("), "GUi scanner should adapt raw public docs into canonical task semantics before mapping UI queues");
  assert(scanner.includes("projectGuiQueuesFromCanonicalProjection("), "GUi scanner should map canonical task semantics into GUi queue labels through a dedicated adapter");
}

function assertDashboardTemplateConsumesVisibilityScopes(): void {
  const visibilityPath = path.join(repoRoot(), "templates/dashboard/assets/app-src/25-task-visibility.js");
  const tasksPath = path.join(repoRoot(), "templates/dashboard/assets/app-src/30-tasks.js");
  const reviewPath = path.join(repoRoot(), "templates/dashboard/assets/app-src/45-review.js");
  const visibilitySource = fs.readFileSync(visibilityPath, "utf8");
  const tasksSource = fs.readFileSync(tasksPath, "utf8");
  const reviewSource = fs.readFileSync(reviewPath, "utf8");
  assert(visibilitySource.includes("function taskInVisibilityScope"), "Dashboard should centralize task visibility scope checks in a dedicated helper source");
  assert(tasksSource.includes('taskInVisibilityScope(task, "active-cycle")'), "Dashboard task index should consume the active-cycle visibility scope");
  assert(tasksSource.includes('taskInVisibilityScope(task, "archive-history")'), "Dashboard archive page should consume the archive-history visibility scope");
  assert(reviewSource.includes("reviewWorkbenchTasks().filter"), "Review workbench should consume review-workbench scope instead of normal-cycle tasks");
}

function assertDashboardScopeRuntimeBehavior(): void {
  const context = vm.createContext({
    window: {
      __HARNESS_DASHBOARD__: {
        schemaVersion: "dashboard-bundle/v1",
        status: {
          tasks: [
            dashboardScopeTask("active-task", ["all", "active-cycle", "review-workbench", "task-index-default"], ["active"]),
            dashboardScopeTask("archived-task", ["all", "review-workbench", "archive-history", "tombstone-history"], ["soft-deleted-superseded"], "archived"),
            dashboardScopeTask("soft-deleted-task", ["all", "review-workbench", "tombstone-history"], ["soft-deleted-superseded"], "soft-deleted"),
            dashboardScopeTask("superseded-task", ["all", "review-workbench", "tombstone-history"], ["soft-deleted-superseded"], "superseded"),
          ],
        },
        documents: { documents: [] },
        graph: { nodes: [], edges: [] },
      },
      __HARNESS_LOCALE__: "en",
      HarnessI18n: { en: {} },
    },
    navigator: { language: "en-US" },
    localStorage: { getItem: () => null, setItem: () => undefined },
    console,
  });
  for (const relative of [
    "templates/dashboard/assets/app-src/00-state.js",
    "templates/dashboard/assets/app-src/25-task-visibility.js",
    "templates/dashboard/assets/app-src/35-task-detail.js",
    "templates/dashboard/assets/app-src/30-tasks.js",
    "templates/dashboard/assets/app-src/45-review.js",
  ]) {
    vm.runInContext(fs.readFileSync(path.join(repoRoot(), relative), "utf8"), context, { filename: relative });
  }
  const activeIds = vm.runInContext("normalCycleTasks().map((task) => task.id)", context) as string[];
  const archiveIds = vm.runInContext("archivedTasks().map((task) => task.id)", context) as string[];
  const tombstoneWorkbenchIds = vm.runInContext('reviewQueueBaseTasks({ queues: ["soft-deleted-superseded"] }).map((task) => task.id)', context) as string[];
  assert(JSON.stringify(activeIds) === JSON.stringify(["active-task"]), "Dashboard active-cycle runtime scope should include only active tasks");
  assert(JSON.stringify(archiveIds) === JSON.stringify(["archived-task"]), "Dashboard archive-history runtime scope should exclude soft-deleted and superseded tombstones");
  assert(
    JSON.stringify(tombstoneWorkbenchIds) === JSON.stringify(["archived-task", "soft-deleted-task", "superseded-task"]),
    "Dashboard review-workbench runtime scope should keep all tombstones in the soft-deleted/superseded workbench tab",
  );
}

function dashboardScopeTask(id: string, visibilityScopes: string[], taskQueues: string[], deletionState = "active"): Record<string, unknown> {
  return {
    id,
    shortId: id,
    title: id,
    state: deletionState === "active" ? "in_progress" : "done",
    lifecycleState: deletionState === "active" ? "active" : "closed",
    reviewStatus: "agent-reviewed",
    reviewQueueState: "not-in-queue",
    reviewSubmitted: false,
    materialsReady: true,
    materialIssues: [],
    queueReasons: [],
    taskQueues,
    visibilityScopes,
    semanticProjection: {
      taskLifecycleProjection: { taskQueues, lifecycleState: deletionState === "active" ? "active" : "closed", reviewStatus: "agent-reviewed", closeoutStatus: "missing" },
      visibility: { scopes: visibilityScopes },
      dashboardTaskView: {},
      reviewWorkbenchQueueView: { queues: taskQueues, primaryQueue: taskQueues[0] },
    },
    reviewWorkbenchQueueView: { queues: taskQueues, primaryQueue: taskQueues[0] },
    deletionState,
    supersededBy: "",
  };
}

function assertGuiSchemaCompatibility(tasks: ContractTask[]): void {
  const snapshot = {
    schemaVersion: "harness-gui/v1",
    generatedAt: new Date(0).toISOString(),
    scannerVersion: "semantic-contract-baseline",
    portfolio: {
      projectCount: 1,
      taskCount: tasks.length,
      evidenceCount: 0,
      queueCounts: {
        reviewNeeded: 0,
        reviewBlocked: 0,
        blocked: 0,
        missingMaterials: 0,
        lessonCandidate: 0,
        active: 0,
        closed: 0,
        archived: 0,
        softDeletedSuperseded: 0,
      },
    },
    projects: [
      {
        id: "contract-project",
        displayName: "Contract Project",
        path: target,
        dataClass: "local-path",
        health: { status: "unknown", warnings: 0, failures: 0, summary: "contract fixture" },
        queueCounts: {
          reviewNeeded: 0,
          reviewBlocked: 0,
          blocked: 0,
          missingMaterials: 0,
          lessonCandidate: 0,
          active: 0,
          closed: 0,
          archived: 0,
          softDeletedSuperseded: 0,
        },
        moduleSummary: {},
        lastScanAt: new Date(0).toISOString(),
        staleState: "fresh",
        taskCount: tasks.length,
        evidenceCount: 0,
      },
    ],
    queues: tasks.flatMap((task) => mapGuiQueues(task).map((queue) => ({
      id: `${task.id}:${queue}`,
      queue,
      projectId: "contract-project",
      taskKey: task.shortId || task.id,
      title: task.title || task.id,
      reason: queueReasonMessage(task) || task.reviewWorkbenchQueueView?.reasonCodes?.[0] || "contract projection",
      exitCondition: "contract projection must stay fail-closed",
      priority: queue === "review-blocked" || queue === "blocked" ? "high" : "normal",
      sourceSnapshotHash: `contract-${task.id}`,
      staleState: "fresh",
      generatedAt: new Date(0).toISOString(),
    }))),
    tasks: tasks.map((task) => ({
      id: task.id,
      taskKey: task.shortId || task.id,
      title: task.title || task.id,
      projectId: "contract-project",
      projectPath: target,
      currentPath: task.currentPath || task.path || "",
      moduleKey: task.module || task.inferredModule || "",
      lifecycleState: task.lifecycleState,
      reviewStatus: task.reviewStatus || "",
      materialsReady: task.materialsReady,
      queues: mapGuiQueues(task),
      queueReasons: (task.queueReasons || []).map((reason) => reason.message || reason.code || "contract projection"),
      repairPrompt: task.repairPrompt || "",
      sourceFileHashes: {},
      sourceSnapshotHash: `contract-${task.id}`,
      scannerVersion: "semantic-contract-baseline",
      generatedAt: new Date(0).toISOString(),
      staleState: "fresh",
      evidenceCount: 0,
      dataClass: "local-path",
      archiveState: guiArchiveState(task),
      archiveBucket: task.deletionState === "archived" ? "contract-baseline" : undefined,
    })),
    evidence: [],
    actions: [
      {
        id: "contract-review-confirm-preview",
        projectId: "contract-project",
        kind: "review-confirm",
        label: "Review Confirm",
        enabled: false,
        previewOnly: true,
        status: "preview-only",
        reason: "Disabled as a real write until Harness CLI/core confirm action exists.",
      },
    ],
  };
  assertGuiSnapshotShape(snapshot);
  const modelPath = path.join(repoRoot(), "harness-gui/src/model/harnessGui.ts");
  if (!fs.existsSync(modelPath)) {
    assertGitmodulesDeclaresGui();
    return;
  }
  const model = fs.readFileSync(modelPath, "utf8");
  for (const field of ["sourceSnapshotHash", "scannerVersion", "staleState", "previewOnly", "queueReasons", "archiveState"]) {
    assert(model.includes(field), `GUi model should declare ${field} consumed by the compatibility fixture`);
  }
}

function assertGitmodulesDeclaresGui(): void {
  const gitmodulesPath = path.join(repoRoot(), ".gitmodules");
  assert(fs.existsSync(gitmodulesPath), "Root package baseline without initialized GUi submodule must still declare the GUi consumer submodule");
  const gitmodules = fs.readFileSync(gitmodulesPath, "utf8");
  assert(gitmodules.includes("path = harness-gui"), "Root package baseline without initialized GUi submodule must keep harness-gui registered as a consumer");
}

function assertGuiSnapshotShape(snapshot: {
  schemaVersion: string;
  projects: Array<Record<string, unknown>>;
  queues: Array<Record<string, unknown>>;
  tasks: Array<Record<string, unknown>>;
  evidence: Array<Record<string, unknown>>;
  actions: Array<Record<string, unknown>>;
}): void {
  assert(snapshot.schemaVersion === "harness-gui/v1", "GUi compatibility fixture should use harness-gui/v1");
  assert(Array.isArray(snapshot.projects), "GUi compatibility fixture should expose projects array");
  assert(Array.isArray(snapshot.queues), "GUi compatibility fixture should expose queues array");
  assert(Array.isArray(snapshot.tasks), "GUi compatibility fixture should expose tasks array");
  assert(Array.isArray(snapshot.evidence), "GUi compatibility fixture should expose evidence array");
  assert(Array.isArray(snapshot.actions), "GUi compatibility fixture should expose actions array");
  for (const task of snapshot.tasks) {
    assert(task.projectId, `GUi task ${String(task.id || "")} missing projectId`);
    assert(task.sourceSnapshotHash, `GUi task ${String(task.id || "")} missing sourceSnapshotHash`);
    assert(task.scannerVersion, `GUi task ${String(task.id || "")} missing scannerVersion`);
    assert(task.staleState, `GUi task ${String(task.id || "")} missing staleState`);
    assert(Array.isArray(task.queues), `GUi task ${String(task.id || "")} missing queues array`);
  }
  for (const item of snapshot.queues) {
    assert(item.reason, `GUi queue item ${String(item.id || "")} missing reason`);
    assert(item.exitCondition, `GUi queue item ${String(item.id || "")} missing exitCondition`);
    assert(item.sourceSnapshotHash, `GUi queue item ${String(item.id || "")} missing sourceSnapshotHash`);
  }
  for (const action of snapshot.actions) {
    assert(action.previewOnly === true, `GUi action ${String(action.id || "")} must remain previewOnly in P01`);
  }
}

function queueReasonMessage(task: ContractTask): string {
  const [first] = task.queueReasons || [];
  return first?.message || first?.code || "";
}

function mapGuiQueues(task: ContractTask): string[] {
  if (task.deletionState === "archived") return ["archived"];
  if (task.deletionState === "superseded" || task.deletionState === "soft-deleted") return ["soft-deleted-superseded"];
  const queues = new Set<string>();
  for (const queue of task.taskQueues || []) {
    if (queue === "review") queues.add(task.reviewWorkbenchQueueView?.blocked ? "review-blocked" : "review-needed");
    else if (queue === "missing-materials") queues.add("missing-materials");
    else if (queue === "blocked") queues.add("blocked");
    else if (queue === "lessons") queues.add("lesson-candidate");
    else if (queue === "finalized") queues.add("closed");
    else if (queue === "active" || queue === "planned") queues.add("active");
  }
  if (!queues.size) queues.add("active");
  return [...queues];
}

function guiArchiveState(task: ContractTask): "active" | "archived" | "soft-deleted" | "superseded" {
  if (task.deletionState === "archived") return "archived";
  if (task.deletionState === "superseded") return "superseded";
  if (task.deletionState === "soft-deleted") return "soft-deleted";
  return "active";
}

function repoRoot(): string {
  return process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}
