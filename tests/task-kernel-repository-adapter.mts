#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createTaskRef,
  createWriteScope,
} from "../scripts/kernel/task/domain/index.mjs";
import {
  createMarkdownTaskPackageStoreReader,
} from "../scripts/kernel/task/infrastructure/index.mjs";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const fixtureRoot = path.join(repoRoot, "tests/fixtures/task-kernel-repository");

const repository = createMarkdownTaskPackageStoreReader({ root: fixtureRoot });
const taskIds = repository.list().map((snapshot) => snapshot.task.id).sort();
assert.deepEqual(taskIds, [
  "2026-06-05-active-standard-task",
  "2026-06-05-missing-materials-task",
]);

const activeRef = createTaskRef({ kind: "task-id", value: "2026-06-05-active-standard-task" });
const active = repository.get(activeRef);
assert.equal(active.task.title, "Active standard task");
assert.equal(active.task.state, "active");
assert.equal(active.task.lifecycleState, "active");
assert.equal(active.task.reviewStatus, "agent-reviewed");
assert.equal(active.task.closeoutState, "open");
assert.equal(active.task.materials.kind, "complete");
assert.equal(active.task.modulePlacement?.moduleKey, "task-kernel");
assert.deepEqual(active.task.phases.map((phase) => [phase.id, phase.title]), [
  ["INIT-01", "Prepare repository adapter"],
  ["GATE-01", "Verify repository gates"],
]);
assert.deepEqual(active.task.artifacts.map((artifact) => [artifact.id, artifact.title]), [
  ["ART-001", "Task plan"],
  ["ART-002", "Progress notes"],
  ["ART-003", "Review notes"],
]);
assert.equal(active.task.artifacts.some((artifact) => artifact.id === "ART-999"), false);
assert.equal(active.task.auditMetadata?.["task-kind"], "coding-agent-harness-task");
assert.equal(active.materials["review.md"].source, "standalone");
assert.match(active.materials["review.md"].content, /Agent review evidence/);
assert.equal(active.parseWarnings.length, 0);

const activeByPath = repository.resolve(createTaskRef({ kind: "module-path", value: active.location.relativeDirectory }));
assert.equal(activeByPath.id, active.task.id);

const missing = repository.get(createTaskRef({ kind: "task-id", value: "2026-06-05-missing-materials-task" }));
assert.equal(missing.task.materials.kind, "missing");
if (missing.task.materials.kind !== "missing") throw new Error("missing fixture should classify missing materials");
assert.deepEqual(missing.task.materials.missing, ["ART-003"]);
assert.equal(missing.materials["review.md"].source, "missing");
assert.equal(missing.materials["review.md"].content, "");
assert.throws(
  () => repository.get(createTaskRef({ kind: "task-id", value: "2026-06-05-unknown-task" })),
  /Task not found/,
);
assert.equal(
  repository.list().some((snapshot) => snapshot.location.relativeDirectory.includes("demo-task")),
  false,
);

const repositoryRootReader = createMarkdownTaskPackageStoreReader({ root: repoRoot });
assert.doesNotThrow(() => repositoryRootReader.list());
assert.equal(
  repositoryRootReader.list().some((snapshot) => snapshot.task.id === "demo-task"),
  false,
);

const writableRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-kernel-repository-adapter-"));
fs.cpSync(path.join(fixtureRoot, "active-standard-task"), writableRoot, { recursive: true });
const writableRepository = createMarkdownTaskPackageStoreReader({ root: writableRoot });
const writable = writableRepository.get(activeRef);
const writeScope = createWriteScope({ allowedPaths: [writable.materials["progress.md"].relativePath] });
const updatedProgress = writableRepository.writeMaterial({
  ref: activeRef,
  materialName: "progress.md",
  content: "# Progress\n\nUpdated by repository adapter test.\n",
  writeScope,
});
assert.equal(updatedProgress.source, "standalone");
assert.match(fs.readFileSync(updatedProgress.path, "utf8"), /Updated by repository adapter test/);
assert.throws(
  () => writableRepository.writeMaterial({
    ref: activeRef,
    materialName: "review.md",
    content: "# Review\n\nOut of scope.\n",
    writeScope,
  }),
  /outside Task Kernel repository write scope/,
);
assert.throws(
  () => writableRepository.resolve(createTaskRef({ kind: "legacy-path", value: "../outside" })),
  /escapes repository root/,
);

const incompleteRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-kernel-repository-incomplete-"));
fs.cpSync(path.join(fixtureRoot, "active-standard-task"), incompleteRoot, { recursive: true });
const incompleteTaskPlan = path.join(
  incompleteRoot,
  "coding-agent-harness/planning/modules/task-kernel/tasks/2026-06-05-active-standard-task/task_plan.md",
);
fs.writeFileSync(
  incompleteTaskPlan,
  fs.readFileSync(incompleteTaskPlan, "utf8").replace(/^State: active\n/m, ""),
  "utf8",
);
const incompleteRepository = createMarkdownTaskPackageStoreReader({ root: incompleteRoot });
assert.deepEqual(incompleteRepository.list({ state: "active" }).map((snapshot) => snapshot.task.id), []);
assert.throws(
  () => incompleteRepository.get(activeRef),
  /Missing task metadata: state/,
);

console.log("Task Kernel repository adapter tests passed");
