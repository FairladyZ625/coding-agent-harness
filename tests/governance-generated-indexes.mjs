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

const target = path.join(tmpRoot, "governance-generated-indexes-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", target]);
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "test fixture baseline"]);

const first = expectJson(["new-task", "generated-index-alpha", "--title", "Generated Index Alpha", "--locale", "en-US", target]);
const second = expectJson(["new-task", "generated-index-beta", "--title", "Generated Index Beta", "--locale", "en-US", target]);
assert(first.governance?.commit?.committed === true, "new-task should leave governance committed");
assert(second.governance?.commit?.committed === true, "second new-task should leave governance committed");

const featurePath = path.join(target, "docs/09-PLANNING/Feature-SSoT.md");
const privateFeaturePath = path.join(target, "docs/09-PLANNING/Private-Feature-SSoT.md");
const ledgerPath = path.join(target, "docs/Harness-Ledger.md");
fs.appendFileSync(featurePath, "\n| F-STALE | stale feature | duplicate old row | coordinator | active | P3 | docs/09-PLANNING/TASKS/stale/task_plan.md | n/a | n/a | n/a | none | 2026-01-01 |\n");
fs.writeFileSync(privateFeaturePath, "# Private Feature SSoT\n\n| ID | 状态 | Feature | 负责人 | 当前产物 | 备注 |\n| --- | --- | --- | --- | --- | --- |\n| PF-STALE | active | stale private feature | coordinator | `docs/09-PLANNING/TASKS/stale/task_plan.md` | stale |\n");
fs.appendFileSync(ledgerPath, "\n| HL-STALE | stale ledger | coordinator | active | docs/09-PLANNING/TASKS/stale/task_plan.md | F-STALE | pending | pending | pending | pending | stale | 2026-01-01 |\n");
git(target, ["add", "docs/09-PLANNING/Feature-SSoT.md", "docs/09-PLANNING/Private-Feature-SSoT.md", "docs/Harness-Ledger.md"]);
git(target, ["commit", "-m", "add stale generated table rows"]);

const dryRun = expectJson(["governance", "rebuild", "--dry-run", "--archive", target]);
assert(dryRun.dryRun === true, "governance rebuild --dry-run should report dryRun true");
assert(dryRun.archive === true, "governance rebuild --archive should report archive true");
assert(dryRun.changes.some((change) => change.surface === "feature-ssot"), "dry-run should include Feature SSoT change");
assert(fs.readFileSync(featurePath, "utf8").includes("F-STALE"), "dry-run must not rewrite Feature SSoT");
const contradictoryDryRun = expectJson(["governance", "rebuild", "--dry-run", "--apply", target]);
assert(contradictoryDryRun.applied === false, "--dry-run should win over --apply");
assert(fs.readFileSync(featurePath, "utf8").includes("F-STALE"), "--dry-run --apply must not rewrite Feature SSoT");

const rebuilt = expectJson(["governance", "rebuild", "--archive", "--apply", target]);
assert(rebuilt.applied === true, "governance rebuild --apply should report applied true");
assert(rebuilt.commit?.committed === true, "governance rebuild --apply should commit generated indexes in git targets");
const featureAfter = fs.readFileSync(featurePath, "utf8");
const privateFeatureAfter = fs.readFileSync(privateFeaturePath, "utf8");
const ledgerAfter = fs.readFileSync(ledgerPath, "utf8");
assert(!featureAfter.includes("F-STALE"), "generated Feature SSoT should remove stale manual rows");
assert(!privateFeatureAfter.includes("PF-STALE"), "generated Private Feature SSoT should remove stale manual rows");
assert(!ledgerAfter.includes("HL-STALE"), "generated Harness Ledger should remove stale manual rows");
assert(featureAfter.includes(`${todayLocal}-generated-index-alpha/task_plan.md`), "generated Feature SSoT should include scanned alpha task");
assert(privateFeatureAfter.includes(`${todayLocal}-generated-index-alpha/task_plan.md`), "generated Private Feature SSoT should include scanned alpha task");
assert(ledgerAfter.includes(`${todayLocal}-generated-index-beta/task_plan.md`), "generated Harness Ledger should include scanned beta task");
assert(rebuilt.archiveDir, "archive rebuild should report archive directory");
assert(fs.existsSync(path.join(target, rebuilt.archiveDir, "docs/09-PLANNING/Feature-SSoT.md")), "archive should preserve old Feature SSoT before rewriting");
assert(fs.existsSync(path.join(target, rebuilt.archiveDir, "docs/09-PLANNING/Private-Feature-SSoT.md")), "archive should preserve old Private Feature SSoT before rewriting");
assert(fs.existsSync(path.join(target, rebuilt.archiveDir, "docs/Harness-Ledger.md")), "archive should preserve old Harness Ledger before rewriting");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "governance rebuild should leave git clean");

const secondRebuild = expectJson(["governance", "rebuild", "--archive", "--apply", target]);
assert(secondRebuild.archiveDir !== rebuilt.archiveDir, "repeated archive rebuilds should use unique archive directories");

const search = expectJson(["task-list", "--json", "--search", "beta", target]);
assert(search.tasks.length === 1, "task-list --search should narrow task results");
assert(search.tasks[0].title === "Generated Index Beta", "task-list --search should return the matching task");
const noMissingMaterials = expectJson(["task-list", "--json", "--missing-materials", target]);
assert(Array.isArray(noMissingMaterials.tasks), "task-list --missing-materials should return a task array");
const presetNone = expectJson(["task-list", "--json", "--preset", "none", "--search", "alpha", target]);
assert(presetNone.tasks.length === 1 && presetNone.tasks[0].title === "Generated Index Alpha", "task-list should combine preset and search filters");
const reviewFiltered = expectJson(["task-list", "--json", "--review", search.tasks[0].reviewStatus, "--search", "beta", target]);
assert(reviewFiltered.tasks.length === 1, "task-list --review should match scanned review status");
const reviewNormalized = expectJson(["task-list", "--json", "--review", search.tasks[0].reviewStatus.replaceAll("-", "_"), "--search", "beta", target]);
assert(reviewNormalized.tasks.length === 1, "task-list --review should normalize underscores and hyphens");
const lessonFiltered = expectJson(["task-list", "--json", "--lesson", search.tasks[0].lessonCandidateStatus.replaceAll("-", "_"), "--search", "beta", target]);
assert(lessonFiltered.tasks.length === 1, "task-list --lesson should match scanned lesson status");
if (search.tasks[0].taskQueues.length > 0) {
  const queue = search.tasks[0].taskQueues[0].replaceAll("-", "_");
  const queueFiltered = expectJson(["task-list", "--json", "--queue", queue, "--search", "beta", target]);
  assert(queueFiltered.tasks.length === 1, "task-list --queue should normalize underscores and hyphens");
}
const noMatch = expectJson(["task-list", "--json", "--search", "does-not-exist", target]);
assert(noMatch.tasks.length === 0, "task-list filters should return empty results on no match");

const pipeTitle = expectJson(["new-task", "module-pipe-title", "--module", "pipe", "--title", "Pipe | Title", target]);
const pipeVisual = fs.readFileSync(path.join(target, "docs/09-PLANNING/MODULES/pipe/visual_map.md"), "utf8");
const incrementalLedger = fs.readFileSync(ledgerPath, "utf8");
assert(pipeVisual.includes("Pipe \\| Title"), "generated module visual map should escape table pipes in task titles");
assert(incrementalLedger.includes("| F-MODULE-pipe |"), "new-task --module ledger row should route to canonical public module Feature ID");
assert(!incrementalLedger.includes("| PF-MODULE-pipe |"), "new-task --module ledger row should not route to private module Feature ID");
expectJson(["new-task", "private-feature-pipe-title", "--title", "Private | Feature", target]);
assert(fs.readFileSync(featurePath, "utf8").includes("Private \\| Feature"), "new-task should update public Feature SSoT when both public and private tables exist");
assert(fs.readFileSync(privateFeaturePath, "utf8").includes("Private \\| Feature"), "new-task should update private Feature SSoT when both public and private tables exist");
expectJson(["governance", "rebuild", "--archive", "--apply", target]);
const rebuiltPrivateFeature = fs.readFileSync(privateFeaturePath, "utf8");
const rebuiltLedger = fs.readFileSync(ledgerPath, "utf8");
assert(rebuiltPrivateFeature.includes("Private \\| Feature"), "generated Private Feature SSoT should escape table pipes in task titles");
assert(rebuiltPrivateFeature.includes("docs/09-PLANNING/MODULES/pipe/module_plan.md"), "generated Private Feature SSoT should include module aggregate rows");
assert(!rebuiltPrivateFeature.includes("Pipe \\| Title"), "generated Private Feature SSoT should not include module-local task rows");
assert(rebuiltLedger.includes("| F-MODULE-pipe |"), "rebuilt Harness Ledger should route module task rows to the module aggregate Feature row");
assert(!rebuiltLedger.includes(`F-${todayLocal}-module-pipe-title`), "rebuilt Harness Ledger should not route module task rows to hidden public module-local Feature rows");
assert(!rebuiltLedger.includes(`PF-${todayLocal}-module-pipe-title`), "rebuilt Harness Ledger should not route module task rows to hidden private module-local Feature rows");
assert(pipeTitle.governance?.commit?.committed === true, "module pipe title fixture should commit governance indexes");

const strategyPath = path.join(target, `docs/09-PLANNING/TASKS/${todayLocal}-generated-index-alpha/execution_strategy.md`);
let strategy = fs.readFileSync(strategyPath, "utf8");
strategy = strategy.replace(
  "| Would a worker subagent materially help? | no / ask-user / already-authorized | [parallel slice, independent implementation, focused investigation, or not useful] | If ask-user, ask directly: \"This task is suitable for a worker subagent. Do you authorize me to assign one worker subagent to modify only [scope] in [worktree/branch] while I coordinate and review the result?\" |",
  "| Would a worker subagent materially help? | ask-user | independent generator and query CLI slices | Ask the user before implementation. |",
);
fs.writeFileSync(strategyPath, strategy);
git(target, ["add", strategyPath]);
git(target, ["commit", "-m", "mark unresolved worker authorization gate"]);
const unresolvedGate = run(["check", "--profile", "target-project", target]);
assert(unresolvedGate.status !== 0, "check should block unresolved worker ask-user decisions");
assert(
  `${unresolvedGate.stdout}\n${unresolvedGate.stderr}`.includes("worker subagent ask-user decision is unresolved"),
  "unresolved worker gate should explain the missing user decision",
);

strategy = `${fs.readFileSync(strategyPath, "utf8").trimEnd()}

## User Authorization Decision

| Gate | State | Decided By | Decided At | Scope | Worktree / Branch | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| worker subagent | authorized | pending | pending | pending | pending | placeholder |
`;
fs.writeFileSync(strategyPath, strategy);
git(target, ["add", strategyPath]);
git(target, ["commit", "-m", "add placeholder worker authorization gate"]);
const placeholderGate = run(["check", "--profile", "target-project", target]);
assert(placeholderGate.status !== 0, "check should reject placeholder worker authorization details");
assert(
  `${placeholderGate.stdout}\n${placeholderGate.stderr}`.includes("worker subagent authorization decision is incomplete"),
  "placeholder worker gate should explain incomplete authorization details",
);

strategy = `${fs.readFileSync(strategyPath, "utf8").trimEnd()}

## User Authorization Decision

| Gate | State | Decided By | Decided At | Scope | Worktree / Branch | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| worker subagent | denied | test user | 2026-05-24 | n/a | n/a | coordinator will execute solo |
`;
fs.writeFileSync(strategyPath, strategy);
git(target, ["add", strategyPath]);
git(target, ["commit", "-m", "resolve worker authorization gate"]);
const resolvedGate = run(["check", "--profile", "target-project", target]);
assert(resolvedGate.status === 0, `resolved worker gate should pass\nSTDOUT:\n${resolvedGate.stdout}\nSTDERR:\n${resolvedGate.stderr}`);

console.log("Governance generated index tests passed");

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}
