#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assert,
  expectJson,
  run,
  tmpRoot,
  todayLocal,
} from "./helpers/harness-test-utils.mjs";

type PublishStandardRunResult = {
  status?: string;
  materialized: Array<{ destination?: string }>;
};

const home = path.join(tmpRoot, "publish-standard-home");
const env = { ...process.env, HOME: home };
const target = path.join(tmpRoot, "publish-standard-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", target], { env });
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "baseline"]);

const inspected = expectJson(["preset", "inspect", "publish-standard", "--json", target], { env });
assert(inspected.task.kind === "publish-standard", "publish-standard should expose its own task kind");
assert(inspected.inputs.release?.flag === "--release" && inspected.inputs.release.required === true, "publish-standard should require --release");
assert(inspected.inputs.from?.flag === "--from" && inspected.inputs.from.required === true, "publish-standard should require --from");
assert(inspected.inputs.publishIntent?.flag === "--publish-intent", "publish-standard should expose publish intent without auto publishing");

writeTaskFixture(`${todayLocal}-dashboard-workbench`, "Upgrade Dashboard workbench", "Dashboard now shows module status, Review queue readiness, and task search improvements.");
writeTaskFixture(`${todayLocal}-human-review`, "Improve Human Review flow", "Human Review Confirmation is separated from agent closeout material preparation.");
writeTaskFixture(`${todayLocal}-projection-internal`, "Remove projection-first facade fallback", "Internal projection-first facade cleanup should stay in the technical summary.");
git(target, ["add", "."]);
git(target, ["commit", "-m", "add publish standard fixtures"]);

const publishTask = expectJson(["new-task", "publish-standard-1-1-1", "--budget", "standard", "--preset", "publish-standard", "--release", "1.1.1", "--from", "1.0.8", "--task-query", `date:${todayLocal}..${todayLocal}`, target], { env });
const taskPlan = fs.readFileSync(path.join(target, publishTask.task.path.replace(/^TARGET:/, ""), "task_plan.md"), "utf8");
assert(taskPlan.includes("Publish Standard Preset"), "publish-standard task plan should name the publish standard workflow");
assert(taskPlan.includes("does not run `npm publish`"), "publish-standard task plan should state the owner publish boundary");

const scaffold = expectJson<PublishStandardRunResult>(["preset", "run", "publish-standard", "scaffold", "--task", "publish-standard-1-1-1", "--allow-scripts", "--json", target], { env });
assert(scaffold.status === "ok", "publish-standard scaffold should complete through the generic runner");
assert(scaffold.materialized.some((item) => item.destination === "coding-agent-harness/governance/releases/1.1.1/public-changelog.md"), "publish-standard should materialize a public changelog");
assert(scaffold.materialized.some((item) => item.destination === "coding-agent-harness/governance/releases/1.1.1/publish-checklist.md"), "publish-standard should materialize a publish checklist");

const releaseRoot = path.join(target, "coding-agent-harness/governance/releases/1.1.1");
const publicChangelog = fs.readFileSync(path.join(releaseRoot, "public-changelog.md"), "utf8");
const technicalSummary = fs.readFileSync(path.join(releaseRoot, "technical-summary.md"), "utf8");
const checklist = fs.readFileSync(path.join(releaseRoot, "publish-checklist.md"), "utf8");
const packReport = JSON.parse(fs.readFileSync(path.join(releaseRoot, "pack-report.json"), "utf8"));

for (const heading of ["功能新增", "功能优化", "问题修复", "稳定性提升", "文档与模板更新", "重要说明"]) {
  assert(publicChangelog.includes(`## ${heading}`), `public changelog should include APP-style section: ${heading}`);
}
assert(publicChangelog.includes("Dashboard") && publicChangelog.includes("Human Review"), "public changelog should preserve user-facing task topics");
assert(!/projection-first|facade|route through repository/i.test(publicChangelog), "public changelog should not foreground internal implementation jargon");
assert(technicalSummary.includes("projection-first") && technicalSummary.includes("TASKS/"), "technical summary should keep traceable internal evidence");
assert(checklist.includes("npm run check") && checklist.includes("npm run prepublishOnly") && checklist.includes("npm run pack:dry-run"), "publish checklist should include npm package gates");
assert(checklist.includes("does not execute `npm publish`"), "publish checklist should preserve the owner publish boundary");
assert(packReport.status === "pending-owner-run", "pack report should default to a pending owner-run status before real pack evidence is attached");
assert(Array.isArray(packReport.forbiddenPaths) && packReport.forbiddenPaths.includes(".harness-private/"), "pack report should document forbidden private paths");

const check = expectJson<PublishStandardRunResult>(["preset", "run", "publish-standard", "check", "--task", "publish-standard-1-1-1", "--allow-scripts", "--json", target], { env });
assert(check.status === "pass", "publish-standard check should pass after scaffold materializes required files");

const missingSelectorTask = expectJson(["new-task", "publish-standard-no-selector", "--budget", "standard", "--preset", "publish-standard", "--release", "1.1.2", "--from", "1.1.1", target], { env });
assert(missingSelectorTask.task.id, "fixture task should be created before selector failure is checked");
const missingSelector = run(["preset", "run", "publish-standard", "scaffold", "--task", "publish-standard-no-selector", "--allow-scripts", "--json", target], { env });
assert(missingSelector.status !== 0, "publish-standard scaffold should require an explicit evidence selector");
assert(`${missingSelector.stdout}\n${missingSelector.stderr}`.includes("publish-standard requires --task-list or --task-query"), "missing selector failure should explain the required selector");

console.log("Publish standard preset tests passed");

function writeTaskFixture(slug: string, title: string, progress: string): void {
  const taskDir = path.join(target, "coding-agent-harness/planning/tasks", slug);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "task_plan.md"), `# ${title}

Task Contract: harness-task/v1

## Selected Budget

Selected budget: simple
`);
  fs.writeFileSync(path.join(taskDir, "brief.md"), `# ${title}\n\n${progress}\n`);
  fs.writeFileSync(path.join(taskDir, "progress.md"), `# ${title} - Progress\n\n## Current Status\n\ndone\n\n## Log\n\n- ${progress}\n`);
  fs.writeFileSync(path.join(taskDir, "review.md"), "# Review\n\nNo open findings.\n");
  fs.writeFileSync(path.join(taskDir, "INDEX.md"), `# Index

## Task Audit Metadata

| Field | Value |
| --- | --- |
| Created By | historical-backfill |
| Created At | ${todayLocal} |
| Command Shape | test fixture |
| Budget | simple |
| Template Source | tests/publish-standard-preset.mts |
| Task Creator | test |
| Task Creator Source | git-unavailable |
| Human Review Status | not-confirmed |
| Confirmation ID | n/a |
| Confirmed At | n/a |
| Reviewer | n/a |
| Reviewer Email | n/a |
| Confirm Text | n/a |
| Evidence Checked | n/a |
| Review Commit SHA | n/a |
| Audit Source | native-index |
| Audit Status | created |
| Exception Reason | n/a |
| Message | n/a |
| Migration Status | native |
| Migrated From | n/a |
| Legacy Extra Fields | {} |
| Migration Notes | n/a |
`);
}

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}
