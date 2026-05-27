#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, expectJson, run, tmpRoot, todayLocal, } from "./helpers/harness-test-utils.mjs";
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
const featurePath = path.join(target, "coding-agent-harness/planning/Feature-SSoT.md");
const privateFeaturePath = path.join(target, "coding-agent-harness/planning/Private-Feature-SSoT.md");
const ledgerPath = path.join(target, "coding-agent-harness/governance/generated/Harness-Ledger.md");
assert(!fs.existsSync(featurePath), "core init should not create Feature SSoT for generated task lifecycle state");
assert(!fs.existsSync(privateFeaturePath), "core init should not create Private Feature SSoT for generated task lifecycle state");
fs.writeFileSync(featurePath, "# Feature SSoT\n\n| ID | Feature | Status | Task Plan |\n| --- | --- | --- | --- |\n| F-STALE | stale feature | active | coding-agent-harness/planning/tasks/stale/task_plan.md |\n");
fs.writeFileSync(privateFeaturePath, "# Private Feature SSoT\n\n| ID | 状态 | Feature | 负责人 | 当前产物 | 备注 |\n| --- | --- | --- | --- | --- | --- |\n| PF-STALE | active | stale private feature | coordinator | `coding-agent-harness/planning/tasks/stale/task_plan.md` | stale |\n");
fs.appendFileSync(ledgerPath, "\n| HL-STALE | stale ledger | coordinator | active | coding-agent-harness/planning/tasks/stale/task_plan.md | F-STALE | pending | pending | pending | pending | stale | 2026-01-01 |\n");
git(target, ["add", "coding-agent-harness/planning/Feature-SSoT.md", "coding-agent-harness/planning/Private-Feature-SSoT.md", "coding-agent-harness/governance/generated/Harness-Ledger.md"]);
git(target, ["commit", "-m", "add stale generated table rows"]);
const dryRun = expectJson(["governance", "rebuild", "--dry-run", "--archive", target]);
assert(dryRun.dryRun === true, "governance rebuild --dry-run should report dryRun true");
assert(dryRun.archive === true, "governance rebuild --archive should report archive true");
assert(!dryRun.changes.some((change) => change.surface === "feature-ssot" && /rebuild/.test(change.action)), "dry-run must not rebuild Feature SSoT");
assert(dryRun.changes.some((change) => change.surface === "legacy-feature-ssot" && /archive/.test(change.action)), "dry-run should archive legacy Feature SSoT");
assert(fs.readFileSync(featurePath, "utf8").includes("F-STALE"), "dry-run must not rewrite Feature SSoT");
const contradictoryDryRun = expectJson(["governance", "rebuild", "--dry-run", "--apply", target]);
assert(contradictoryDryRun.applied === false, "--dry-run should win over --apply");
assert(fs.readFileSync(featurePath, "utf8").includes("F-STALE"), "--dry-run --apply must not rewrite Feature SSoT");
const rebuilt = expectJson(["governance", "rebuild", "--archive", "--apply", target]);
assert(rebuilt.applied === true, "governance rebuild --apply should report applied true");
assert(rebuilt.commit?.committed === true, "governance rebuild --apply should commit generated indexes in git targets");
const ledgerAfter = fs.readFileSync(ledgerPath, "utf8");
assert(!fs.existsSync(featurePath), "ledger-only rebuild should remove current Feature SSoT after archiving it");
assert(!fs.existsSync(privateFeaturePath), "ledger-only rebuild should remove current Private Feature SSoT after archiving it");
assert(!ledgerAfter.includes("HL-STALE"), "generated Harness Ledger should remove stale manual rows");
assert(ledgerAfter.includes("| ID | Scope | Module | Task | State | Queues | Plan | Review | Lessons Check | Closeout | Residual | Updated |"), "generated Harness Ledger should use canonical lifecycle schema");
assert(ledgerAfter.includes(`${todayLocal}-generated-index-beta/task_plan.md`), "generated Harness Ledger should include scanned beta task");
assert(rebuilt.archiveDir, "archive rebuild should report archive directory");
assert(fs.existsSync(path.join(target, rebuilt.archiveDir, "coding-agent-harness/planning/Feature-SSoT.md")), "archive should preserve old Feature SSoT before rewriting");
assert(fs.existsSync(path.join(target, rebuilt.archiveDir, "coding-agent-harness/planning/Private-Feature-SSoT.md")), "archive should preserve old Private Feature SSoT before rewriting");
assert(fs.existsSync(path.join(target, rebuilt.archiveDir, "coding-agent-harness/governance/generated/Harness-Ledger.md")), "archive should preserve old Harness Ledger before rewriting");
assert(git(target, ["status", "--short"]).stdout.trim() === "", "governance rebuild should leave git clean");
const secondRebuild = expectJson(["governance", "rebuild", "--archive", "--apply", target]);
assert(secondRebuild.archiveDir !== rebuilt.archiveDir, "repeated archive rebuilds should use unique archive directories");
const search = expectJson(["task-list", "--json", "--search", "beta", target]);
assert(search.tasks.length === 1, "task-list --search should narrow task results");
assert(search.tasks[0].title === "Generated Index Beta", "task-list --search should return the matching task");
assert("closeoutStatus" in search.tasks[0], "task-list should expose closeout status for ledger replacement");
assert("lessonCandidateRows" in search.tasks[0], "task-list should expose lesson detail rows for ledger replacement");
assert("risks" in search.tasks[0], "task-list should expose review risks for ledger replacement");
const taskIndex = expectJson(["task-index", "--json", target]);
const betaIndex = taskIndex.tasks.find((task) => task.title === "Generated Index Beta");
assert(betaIndex?.closeoutStatus, "task-index should include closeout status");
assert(Array.isArray(betaIndex?.lessonCandidateRows), "task-index should include lesson candidate rows");
assert(Array.isArray(betaIndex?.risks), "task-index should include review risks");
assert(typeof betaIndex?.residual === "string", "task-index should include residual summary");
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
const pipeVisual = fs.readFileSync(path.join(target, "coding-agent-harness/planning/modules/pipe/visual_map.md"), "utf8");
const incrementalLedger = fs.readFileSync(ledgerPath, "utf8");
assert(pipeVisual.includes("Pipe \\| Title"), "generated module visual map should escape table pipes in task titles");
assert(incrementalLedger.includes("| module | pipe |"), "new-task --module ledger row should expose module scope and key");
assert(!fs.existsSync(featurePath), "new-task should not recreate public Feature SSoT");
assert(!fs.existsSync(privateFeaturePath), "new-task should not recreate private Feature SSoT");
expectJson(["new-task", "private-feature-pipe-title", "--title", "Private | Feature", target]);
assert(!fs.existsSync(featurePath), "non-module new-task should not recreate public Feature SSoT");
assert(!fs.existsSync(privateFeaturePath), "non-module new-task should not recreate private Feature SSoT");
expectJson(["governance", "rebuild", "--archive", "--apply", target]);
const rebuiltLedger = fs.readFileSync(ledgerPath, "utf8");
assert(rebuiltLedger.includes("Private \\| Feature"), "generated Harness Ledger should escape table pipes in task titles");
assert(rebuiltLedger.includes("Pipe \\| Title"), "generated Harness Ledger should include module-local task rows");
assert(rebuiltLedger.includes("| module | pipe |"), "rebuilt Harness Ledger should retain module grouping");
assert(!rebuiltLedger.includes(`F-${todayLocal}-module-pipe-title`), "rebuilt Harness Ledger should not route module task rows to hidden public module-local Feature rows");
assert(!rebuiltLedger.includes(`PF-${todayLocal}-module-pipe-title`), "rebuilt Harness Ledger should not route module task rows to hidden private module-local Feature rows");
assert(pipeTitle.governance?.commit?.committed === true, "module pipe title fixture should commit governance indexes");
const strategyPath = path.join(target, `coding-agent-harness/planning/tasks/${todayLocal}-generated-index-alpha/execution_strategy.md`);
let strategy = fs.readFileSync(strategyPath, "utf8");
strategy = strategy.replace("| Would a worker subagent materially help? | no / ask-user / already-authorized | [parallel slice, independent implementation, focused investigation, or not useful] | If ask-user, ask directly: \"This task is suitable for a worker subagent. Do you authorize me to assign one worker subagent to modify only [scope] in [worktree/branch] while I coordinate and review the result?\" |", "| Would a worker subagent materially help? | ask-user | independent generator and query CLI slices | Ask the user before implementation. |");
fs.writeFileSync(strategyPath, strategy);
git(target, ["add", strategyPath]);
git(target, ["commit", "-m", "mark unresolved worker authorization gate"]);
const unresolvedGate = run(["check", "--profile", "target-project", target]);
assert(unresolvedGate.status !== 0, "check should block unresolved worker ask-user decisions");
assert(`${unresolvedGate.stdout}\n${unresolvedGate.stderr}`.includes("worker subagent ask-user decision is unresolved"), "unresolved worker gate should explain the missing user decision");
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
assert(`${placeholderGate.stdout}\n${placeholderGate.stderr}`.includes("worker subagent authorization decision is incomplete"), "placeholder worker gate should explain incomplete authorization details");
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
