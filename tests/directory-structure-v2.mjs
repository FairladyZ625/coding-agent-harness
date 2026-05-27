#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  acceptNoLessonCandidate,
  assert,
  expectJson,
  expectPass,
  run,
  tmpRoot,
  todayLocal,
} from "./helpers/harness-test-utils.mjs";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

const target = path.join(tmpRoot, "directory-structure-v2-target");
fs.mkdirSync(target);

const init = expectJson(["init", "--structure", "v2", "--locale", "en-US", "--capabilities", "core,dashboard", target]);
assert(init.structureVersion === 2, "init --structure v2 should report structureVersion 2");
assert(fs.existsSync(path.join(target, "coding-agent-harness/harness.yaml")), "v2 init should write coding-agent-harness/harness.yaml");
assert(!fs.existsSync(path.join(target, "docs/09-PLANNING")), "v2 init should not create legacy docs/09-PLANNING");
assert(fs.existsSync(path.join(target, "coding-agent-harness/planning/tasks/_task-template/walkthrough.md")), "v2 task template should include task-local walkthrough.md");
assert(!fs.existsSync(path.join(target, "coding-agent-harness/governance/generated/Closeout-Index.md")), "v2 init should not seed generated Closeout-Index from legacy SSoT template");

const legacyTarget = path.join(tmpRoot, "directory-structure-v2-legacy-target");
fs.mkdirSync(legacyTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", legacyTarget]);
assert(fs.existsSync(path.join(legacyTarget, "docs/09-PLANNING/TASKS/_task-template/task_plan.md")), "legacy init should still create legacy docs task template");
assert(!read(path.join(legacyTarget, "AGENTS.md")).includes("coding-agent-harness/planning/tasks"), "legacy init AGENTS should not route agents to v2 task paths");

const legacyLocalWalkthroughTarget = path.join(tmpRoot, "directory-structure-v2-legacy-local-walkthrough-target");
fs.mkdirSync(legacyLocalWalkthroughTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", legacyLocalWalkthroughTarget]);
const legacyLocalTask = expectJson(["new-task", "legacy-local-walkthrough", "--budget", "simple", "--title", "Legacy Local Walkthrough", "--locale", "en-US", legacyLocalWalkthroughTarget]);
const legacyLocalTaskDir = path.join(legacyLocalWalkthroughTarget, `docs/09-PLANNING/TASKS/${todayLocal}-legacy-local-walkthrough`);
fs.writeFileSync(path.join(legacyLocalTaskDir, "walkthrough.md"), "# Legacy Local Walkthrough\n\nCloseout Status: closed\n");
const legacyLocalStatus = expectJson(["status", "--json", legacyLocalWalkthroughTarget]);
const legacyLocalEntry = legacyLocalStatus.tasks.find((entry) => entry.shortId === legacyLocalTask.task.shortId);
assert(legacyLocalEntry?.closeoutStatus === "missing", "legacy targets should not treat task-local walkthrough.md as Closeout SSoT");
assert(!legacyLocalEntry?.walkthroughPath, "legacy targets should not expose unlinked task-local walkthrough paths");

const addCapabilityTarget = path.join(tmpRoot, "directory-structure-v2-add-capability-target");
fs.mkdirSync(addCapabilityTarget);
expectJson(["init", "--structure", "v2", "--locale", "en-US", "--capabilities", "core", addCapabilityTarget]);
expectPass(["add-capability", "module-parallel", "--locale", "en-US", addCapabilityTarget]);
assert(fs.existsSync(path.join(addCapabilityTarget, "coding-agent-harness/planning/modules/Module-Registry.md")), "v2 add-capability should write module registry under planning/modules");
assert(fs.existsSync(path.join(addCapabilityTarget, "coding-agent-harness/planning/modules/_task-template/walkthrough.md")), "v2 add-capability module task template should include walkthrough.md");
assert(!fs.existsSync(path.join(addCapabilityTarget, "docs/09-PLANNING")), "v2 add-capability should not create legacy docs planning");
expectPass(["check", "--profile", "target-project", addCapabilityTarget]);

const contextTarget = path.join(tmpRoot, "directory-structure-v2-context-target");
fs.mkdirSync(contextTarget);
expectJson(["init", "--structure", "v2", "--locale", "en-US", "--capabilities", "core", contextTarget]);
fs.writeFileSync(path.join(contextTarget, "coding-agent-harness/context/architecture/service-catalog.md"), "# Broken Service Catalog\n");
const contextCheck = run(["check", "--profile", "target-project", contextTarget]);
assert(contextCheck.status !== 0, "v2 target-project check should validate v2 context docs");
assert(contextCheck.stderr.includes("coding-agent-harness/context/architecture/service-catalog.md missing Context Doc Type"), "v2 context check should report missing Context Doc Type");

const created = expectJson(["new-task", "v2-walkthrough-task", "--title", "V2 Walkthrough Task", "--locale", "en-US", target]);
const taskDir = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-v2-walkthrough-task`);
assert(created.task.path === `TARGET:coding-agent-harness/planning/tasks/${todayLocal}-v2-walkthrough-task`, "new-task should report v2 task path");
assert(fs.existsSync(path.join(taskDir, "task_plan.md")), "v2 new-task should create task_plan.md under planning/tasks");
assert(fs.existsSync(path.join(taskDir, "walkthrough.md")), "v2 new-task should create task-local walkthrough.md");
const index = read(path.join(taskDir, "INDEX.md"));
assert(index.includes("| Walkthrough Path | `walkthrough.md` |"), "INDEX should register the task-local Walkthrough Path");

fs.writeFileSync(
  path.join(taskDir, "walkthrough.md"),
  "# Walkthrough: V2 Walkthrough Task\n\n## Summary\n\nTask-local closeout evidence.\n",
);
const status = expectJson(["status", "--json", target]);
const task = status.tasks.find((entry) => entry.shortId === `${todayLocal}-v2-walkthrough-task`);
assert(task, "status should scan v2 task");
assert(task.walkthroughPath === `TARGET:coding-agent-harness/planning/tasks/${todayLocal}-v2-walkthrough-task/walkthrough.md`, "status should use task-local walkthrough path");
const harnessRootStatus = expectJson(["status", "--json", path.join(target, "coding-agent-harness")]);
assert(harnessRootStatus.tasks.some((entry) => entry.shortId === `${todayLocal}-v2-walkthrough-task`), "status should resolve when target is the v2 harness root");

const taskIndex = expectJson(["task-index", "--json", target]);
assert(taskIndex.schemaVersion === "task-index/v2", "v2 target should emit task-index/v2");
assert(taskIndex.harnessRoot === "TARGET:coding-agent-harness", "task-index/v2 should expose harnessRoot");
assert(taskIndex.generatedRoot === "TARGET:coding-agent-harness/governance/generated", "task-index/v2 should expose generatedRoot");
const indexedTask = taskIndex.tasks.find((entry) => entry.shortId === `${todayLocal}-v2-walkthrough-task`);
assert(indexedTask, "task-index/v2 should include v2 task");
assert(indexedTask.taskRootKind === "project-task", "task-index/v2 task should expose taskRootKind");
assert(indexedTask.namespace === "main", "task-index/v2 task should expose namespace");
assert(indexedTask.packageRole === "local", "task-index/v2 task should expose packageRole");
assert(indexedTask.documentRefs.some((ref) => ref.kind === "walkthrough" && ref.path.endsWith("/walkthrough.md")), "documentRefs should include task-local walkthrough");
assert(Array.isArray(indexedTask.repairActions), "task-index/v2 should expose structured repairActions");

const rebuilt = expectJson(["governance", "rebuild", "--apply", target]);
assert(rebuilt.applied === true, "governance rebuild should apply on v2 targets");
assert(fs.existsSync(path.join(target, "coding-agent-harness/planning/generated/task-index.json")), "v2 governance rebuild should write planning/generated/task-index.json");
assert(fs.existsSync(path.join(target, "coding-agent-harness/planning/generated/task-index.md")), "v2 governance rebuild should write planning/generated/task-index.md");
assert(fs.existsSync(path.join(target, "coding-agent-harness/governance/generated/Closeout-Index.md")), "v2 governance rebuild should write generated Closeout-Index.md");
const generatedTaskIndex = JSON.parse(read(path.join(target, "coding-agent-harness/planning/generated/task-index.json")));
assert(generatedTaskIndex.schemaVersion === "task-index/v2", "generated v2 task index JSON should keep schemaVersion");
assert(read(path.join(target, "coding-agent-harness/governance/generated/Closeout-Index.md")).includes("walkthrough.md"), "generated Closeout Index should reference task-local walkthrough");
const archiveRebuild = expectJson(["governance", "rebuild", "--archive", "--apply", target]);
assert(archiveRebuild.archiveDir.startsWith("coding-agent-harness/governance/archive/"), "v2 archive rebuild should use governance/archive");
assert(!fs.existsSync(path.join(target, "docs")), "v2 archive rebuild should not create a legacy docs directory");

const dashboardData = JSON.parse(read(path.join(target, "coding-agent-harness/planning/generated/task-index.json")));
assert(dashboardData.tasks.length >= 1, "generated task index should contain tasks before dashboard collection");
expectPass(["dashboard", "--out-dir", path.join(target, "dashboard-out"), target]);
const dashboardDocuments = JSON.parse(read(path.join(target, "dashboard-out/data/documents.json")));
assert(dashboardDocuments.documents.some((doc) => doc.type === "task-index" && doc.path.endsWith("/planning/generated/task-index.md")), "Dashboard documents should include generated task-index.md");

const externalTaskId = `EXTERNAL/vendor/tasks/${todayLocal}-external-v2-task`;
const externalTaskDir = path.join(target, "coding-agent-harness/planning/external/vendor/tasks", `${todayLocal}-external-v2-task`);
fs.mkdirSync(path.dirname(externalTaskDir), { recursive: true });
fs.cpSync(taskDir, externalTaskDir, { recursive: true });
expectJson(["task-log", externalTaskId, "--message", "external v2 log", target]);
assert(read(path.join(externalTaskDir, "progress.md")).includes("external v2 log"), "v2 lifecycle commands should resolve EXTERNAL task refs");

const escapeTask = expectJson(["new-task", "v2-walkthrough-escape", "--title", "V2 Walkthrough Escape", "--locale", "en-US", target]);
const escapeDir = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-v2-walkthrough-escape`);
fs.rmSync(path.join(escapeDir, "walkthrough.md"));
fs.writeFileSync(
  path.join(escapeDir, "INDEX.md"),
  read(path.join(escapeDir, "INDEX.md")).replace("| Walkthrough Path | `walkthrough.md` |", "| Walkthrough Path | `../v2-walkthrough-task/walkthrough.md` |"),
);
const escapeStatus = expectJson(["status", "--json", target]);
const escapeEntry = escapeStatus.tasks.find((entry) => entry.shortId === `${todayLocal}-v2-walkthrough-escape`);
assert(escapeEntry?.walkthroughPath === "", "Walkthrough Path must not escape the task directory");

const invalidWalkthroughTarget = path.join(tmpRoot, "directory-structure-v2-invalid-walkthrough-target");
fs.mkdirSync(invalidWalkthroughTarget);
expectJson(["init", "--structure", "v2", "--locale", "en-US", "--capabilities", "core", invalidWalkthroughTarget]);
const invalidCreated = expectJson(["new-task", "v2-walkthrough-dot", "--title", "V2 Walkthrough Dot", "--locale", "en-US", invalidWalkthroughTarget]);
const invalidDir = path.join(invalidWalkthroughTarget, `coding-agent-harness/planning/tasks/${todayLocal}-v2-walkthrough-dot`);
fs.rmSync(path.join(invalidDir, "walkthrough.md"));
fs.writeFileSync(
  path.join(invalidDir, "INDEX.md"),
  read(path.join(invalidDir, "INDEX.md")).replace("| Walkthrough Path | `walkthrough.md` |", "| Walkthrough Path | `.` |"),
);
acceptNoLessonCandidate(invalidDir);
const invalidPathStatus = expectJson(["status", "--json", invalidWalkthroughTarget]);
const invalidPathEntry = invalidPathStatus.tasks.find((entry) => entry.shortId === invalidCreated.task.shortId);
assert(!invalidPathEntry?.walkthroughPath, "Walkthrough Path must resolve to a markdown file, not the task directory");
git(invalidWalkthroughTarget, ["init"]);
git(invalidWalkthroughTarget, ["config", "user.name", "Harness Test"]);
git(invalidWalkthroughTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(invalidWalkthroughTarget, ["add", "."]);
git(invalidWalkthroughTarget, ["commit", "-m", "invalid walkthrough fixture"]);
expectJson(["task-start", invalidCreated.task.shortId, "--message", "start invalid walkthrough", invalidWalkthroughTarget]);
expectJson(["task-phase", invalidCreated.task.shortId, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", invalidWalkthroughTarget]);
expectJson(["task-review", invalidCreated.task.shortId, "--message", "submitted invalid walkthrough", invalidWalkthroughTarget]);
const invalidReviewStatus = expectJson(["status", "--json", invalidWalkthroughTarget]);
const invalidReviewEntry = invalidReviewStatus.tasks.find((entry) => entry.shortId === invalidCreated.task.shortId);
assert(invalidReviewEntry?.taskQueues?.includes("missing-materials"), "invalid Walkthrough Path should keep the task in missing-materials");
const invalidConfirm = run(["review-confirm", invalidCreated.task.shortId, "--reviewer", "Harness Reviewer", "--confirm", invalidCreated.task.shortId, invalidWalkthroughTarget]);
assert(invalidConfirm.status !== 0, "review-confirm should not pass when Walkthrough Path points at a directory");

const symlinkWalkthroughTarget = path.join(tmpRoot, "directory-structure-v2-symlink-walkthrough-target");
fs.mkdirSync(symlinkWalkthroughTarget);
expectJson(["init", "--structure", "v2", "--locale", "en-US", "--capabilities", "core", symlinkWalkthroughTarget]);
const symlinkCreated = expectJson(["new-task", "v2-walkthrough-symlink", "--title", "V2 Walkthrough Symlink", "--locale", "en-US", symlinkWalkthroughTarget]);
const symlinkDir = path.join(symlinkWalkthroughTarget, `coding-agent-harness/planning/tasks/${todayLocal}-v2-walkthrough-symlink`);
fs.rmSync(path.join(symlinkDir, "walkthrough.md"));
const outsideWalkthrough = path.join(tmpRoot, "outside-walkthrough.md");
fs.writeFileSync(outsideWalkthrough, "# Outside Walkthrough\n\nCloseout Status: closed\n");
fs.symlinkSync(outsideWalkthrough, path.join(symlinkDir, "walkthrough.md"));
acceptNoLessonCandidate(symlinkDir);
const symlinkStatus = expectJson(["status", "--json", symlinkWalkthroughTarget]);
const symlinkEntry = symlinkStatus.tasks.find((entry) => entry.shortId === symlinkCreated.task.shortId);
assert(!symlinkEntry?.walkthroughPath, "task-local walkthrough must be a real markdown file, not a symlink");
git(symlinkWalkthroughTarget, ["init"]);
git(symlinkWalkthroughTarget, ["config", "user.name", "Harness Test"]);
git(symlinkWalkthroughTarget, ["config", "user.email", "harness-test@example.invalid"]);
git(symlinkWalkthroughTarget, ["add", "."]);
git(symlinkWalkthroughTarget, ["commit", "-m", "symlink walkthrough fixture"]);
expectJson(["task-start", symlinkCreated.task.shortId, "--message", "start symlink walkthrough", symlinkWalkthroughTarget]);
expectJson(["task-phase", symlinkCreated.task.shortId, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", symlinkWalkthroughTarget]);
expectJson(["task-review", symlinkCreated.task.shortId, "--message", "submitted symlink walkthrough", symlinkWalkthroughTarget]);
const symlinkReviewStatus = expectJson(["status", "--json", symlinkWalkthroughTarget]);
const symlinkReviewEntry = symlinkReviewStatus.tasks.find((entry) => entry.shortId === symlinkCreated.task.shortId);
assert(symlinkReviewEntry?.taskQueues?.includes("missing-materials"), "symlink Walkthrough Path should keep the task in missing-materials");
const symlinkConfirm = run(["review-confirm", symlinkCreated.task.shortId, "--reviewer", "Harness Reviewer", "--confirm", symlinkCreated.task.shortId, symlinkWalkthroughTarget]);
assert(symlinkConfirm.status !== 0, "review-confirm should not pass when walkthrough.md is a symlink outside the task");

git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "v2 fixture baseline"]);
acceptNoLessonCandidate(taskDir);
git(target, ["add", "."]);
git(target, ["commit", "-m", "accept no v2 lesson candidate"]);
expectJson(["task-start", created.task.shortId, "--message", "start v2 work", target]);
expectJson(["task-phase", created.task.shortId, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
expectJson(["task-review", created.task.shortId, "--message", "submitted", "--evidence", "command:test", target]);
const confirmed = expectJson(["review-confirm", created.task.shortId, "--reviewer", "Harness Reviewer", "--confirm", created.task.shortId, "--message", "confirmed v2", path.join(target, "coding-agent-harness")]);
assert(confirmed.audit?.commitSha, "v2 review-confirm should commit INDEX audit");
assert(read(path.join(taskDir, "INDEX.md")).includes("| Human Review Status | confirmed |"), "v2 review-confirm should write confirmation to INDEX");
expectJson(["task-complete", created.task.shortId, "--message", "completed v2", path.join(target, "coding-agent-harness")]);
const completedStatus = expectJson(["status", "--json", target]);
const completedTask = completedStatus.tasks.find((entry) => entry.shortId === `${todayLocal}-v2-walkthrough-task`);
assert(completedTask?.closeoutStatus === "closed", "v2 task-complete should mark task-local walkthrough closed");
assert(read(path.join(taskDir, "walkthrough.md")).includes("Closeout Status: closed"), "v2 task-complete should write Closeout Status to walkthrough.md");

console.log("Directory structure v2 tests passed");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}
