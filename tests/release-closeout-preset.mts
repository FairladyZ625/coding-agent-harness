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

type ReleaseFixtureOptions = {
  title?: string;
  state?: string;
  tombstone?: string;
  localPath?: string;
  confirmedReview?: boolean;
  moduleKey?: string;
  taskPathPrefix?: string;
};

type ReleaseTaskIndexTask = {
  id: string;
  state?: string;
  archiveMetadata?: Record<string, string>;
};

type ReleaseTaskAggregate = {
  selector?: { type: string };
  summary: { totalTasks: number; doneTasks: number };
  matched: ReleaseTaskIndexTask[];
  excluded: Array<{ id: string; reason: string }>;
};

const home = path.join(tmpRoot, "release-closeout-home");
const env = { ...process.env, HOME: home, HARNESS_PRESET_SECRET: "do-not-leak" };
const target = path.join(tmpRoot, "release-closeout-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", target], { env });
git(target, ["init"]);
git(target, ["config", "user.name", "Harness Test"]);
git(target, ["config", "user.email", "harness-test@example.invalid"]);
git(target, ["add", "."]);
git(target, ["commit", "-m", "baseline"]);

const inspected = expectJson(["preset", "inspect", "release-closeout", "--json", target], { env });
assert(inspected.entrypoints.plan?.type === "script", "release-closeout should declare a plan script entrypoint");
assert(inspected.entrypoints.scaffold?.type === "script", "release-closeout should declare a scaffold script entrypoint");
assert(inspected.entrypoints.check?.type === "check", "release-closeout should declare a check entrypoint");
assert(inspected.inputs.release?.flag === "--release" && inspected.inputs.release.required === true, "release-closeout should require --release");

const runnerPreset = path.join(tmpRoot, "runner-materialize-preset");
fs.mkdirSync(path.join(runnerPreset, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(runnerPreset, "preset.yaml"),
  `id: runner-materialize
version: 1
purpose: Test generic preset runner materialization
compatibleBudgets: [standard]
localeSupport: [en-US]
task:
  kind: runner-test
  defaultTaskId: runner-test
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
  plan:
    type: script
    command: scripts/write-manifest.mjs
    writes: [coding-agent-harness/governance/runner/**]
    audit: true
inputs:
  note:
    type: text
    flag: --note
    required: true
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
  runnerOutput:
    path: coding-agent-harness/governance/runner/**
    access: write
`,
);
fs.writeFileSync(
  path.join(runnerPreset, "scripts/write-manifest.mjs"),
  `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const context = JSON.parse(fs.readFileSync(process.env.HARNESS_PRESET_CONTEXT, "utf8"));
fs.mkdirSync(path.join(context.outputRoot, "reports"), { recursive: true });
fs.writeFileSync(path.join(context.outputRoot, "reports/runner.txt"), \`task=\${context.task.id}\\nnote=\${context.inputs.note}\\nsecret=\${process.env.HARNESS_PRESET_SECRET || "missing"}\\n\`);
fs.writeFileSync(context.materializationManifestPath, JSON.stringify({
  schemaVersion: "preset-materialization/v1",
  writes: [{ source: "reports/runner.txt", destination: "coding-agent-harness/governance/runner/runner.txt", type: "text" }]
}, null, 2));
`,
);
const runnerInstallWithoutTrust = run(["preset", "install", runnerPreset, "--project", "--force", "--json", target], { env });
assert(runnerInstallWithoutTrust.status !== 0, "script entrypoint presets should require --allow-scripts during install");
assert(`${runnerInstallWithoutTrust.stdout}\n${runnerInstallWithoutTrust.stderr}`.includes("--allow-scripts"), "entrypoint trust failure should explain --allow-scripts");
expectJson(["preset", "install", runnerPreset, "--project", "--force", "--allow-scripts", "--json", target], { env });
const runnerOwnedTask = expectJson(["new-task", "runner-owned-task", "--budget", "standard", "--preset", "runner-materialize", "--note", "hello", target], { env });
const runnerResult = expectJson(["preset", "run", "runner-materialize", "plan", "--task", "runner-owned-task", "--json", target], { env });
assert(runnerResult.entrypoint === "plan", "generic preset runner should report the executed entrypoint");
assert(runnerResult.materialized.some((item) => item.destination === "coding-agent-harness/governance/runner/runner.txt"), "generic preset runner should report materialized writes");
const runnerOutput = fs.readFileSync(path.join(target, "coding-agent-harness/governance/runner/runner.txt"), "utf8");
assert(runnerOutput.includes("note=hello"), "generic preset runner should pass resolved preset inputs to scripts");
assert(runnerOutput.includes("secret=missing"), "generic preset runner should not pass arbitrary caller environment variables to scripts");

const installedRunnerScript = path.join(target, ".coding-agent-harness/presets/runner-materialize/scripts/write-manifest.mjs");
fs.appendFileSync(installedRunnerScript, "\n// tamper after trust\n");
const tamperedTrustRun = run(["preset", "run", "runner-materialize", "plan", "--task", "runner-owned-task", "--json", target], { env });
assert(tamperedTrustRun.status !== 0, "script trust should become invalid when trusted script content changes");
assert(`${tamperedTrustRun.stdout}\n${tamperedTrustRun.stderr}`.includes("--allow-scripts"), "tampered trust failure should explain --allow-scripts");
expectJson(["preset", "run", "runner-materialize", "plan", "--task", "runner-owned-task", "--allow-scripts", "--json", target], { env });

const runnerAuditPath = path.join(target, runnerOwnedTask.task.evidenceBundle.replace(/^TARGET:/, ""), "preset-audit.json");
const runnerAudit = JSON.parse(fs.readFileSync(runnerAuditPath, "utf8"));
runnerAudit.manifestSha256 = "0".repeat(64);
fs.writeFileSync(runnerAuditPath, `${JSON.stringify(runnerAudit, null, 2)}\n`);
const driftRun = run(["preset", "run", "runner-materialize", "plan", "--task", "runner-owned-task", "--allow-scripts", "--json", target], { env });
assert(driftRun.status !== 0, "preset run should block recorded/current manifest hash drift by default");
assert(`${driftRun.stdout}\n${driftRun.stderr}`.includes("--use-current-preset"), "preset drift failure should explain explicit current preset opt-in");
const acceptedDriftRun = expectJson(["preset", "run", "runner-materialize", "plan", "--task", "runner-owned-task", "--allow-scripts", "--use-current-preset", "--reason", "fixture accepts current preset semantics", "--json", target], { env });
assert((acceptedDriftRun.presetDrift as { accepted?: boolean } | undefined)?.accepted === true, "explicit current preset opt-in should be recorded in preset run output");

const escapePreset = path.join(tmpRoot, "runner-escape-preset");
fs.mkdirSync(path.join(escapePreset, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(escapePreset, "preset.yaml"),
  `id: runner-escape
version: 1
purpose: Test generic preset runner rejects out-of-scope writes
compatibleBudgets: [standard]
localeSupport: [en-US]
task:
  kind: runner-escape-test
  defaultTaskId: runner-escape-test
entrypoints:
  newTask:
    type: template
    writes: [coding-agent-harness/planning/tasks/**]
    audit: true
  plan:
    type: script
    command: scripts/write-escape.mjs
    writes: [coding-agent-harness/governance/runner/**]
    audit: true
inputs: {}
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: coding-agent-harness/planning/tasks/**
    access: write
  runnerOutput:
    path: coding-agent-harness/governance/runner/**
    access: write
`,
);
fs.writeFileSync(
  path.join(escapePreset, "scripts/write-escape.mjs"),
  `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const context = JSON.parse(fs.readFileSync(process.env.HARNESS_PRESET_CONTEXT, "utf8"));
fs.mkdirSync(path.join(context.outputRoot, "reports"), { recursive: true });
fs.writeFileSync(path.join(context.outputRoot, "reports/escape.txt"), "escape\\n");
fs.writeFileSync(context.materializationManifestPath, JSON.stringify({
  schemaVersion: "preset-materialization/v1",
  writes: [{ source: "reports/escape.txt", destination: "coding-agent-harness/governance/outside/escape.txt", type: "text" }]
}, null, 2));
`,
);
expectJson(["preset", "install", escapePreset, "--project", "--force", "--allow-scripts", "--json", target], { env });
expectJson(["new-task", "runner-escape-task", "--budget", "standard", "--preset", "runner-escape", target], { env });
const escapeResult = run(["preset", "run", "runner-escape", "plan", "--task", "runner-escape-task", "--allow-scripts", "--json", target], { env });
assert(escapeResult.status !== 0, "generic preset runner should reject materialization outside entrypoint write scopes");
assert(`${escapeResult.stdout}\n${escapeResult.stderr}`.includes("Preset write scope violation"), "out-of-scope materialization should explain the write scope violation");
assert(!fs.existsSync(path.join(target, "coding-agent-harness/governance/outside/escape.txt")), "out-of-scope materialization should not write target files");

const sourceEscapePreset = path.join(tmpRoot, "runner-source-escape-preset");
fs.mkdirSync(path.join(sourceEscapePreset, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(sourceEscapePreset, "preset.yaml"),
  fs.readFileSync(path.join(escapePreset, "preset.yaml"), "utf8")
    .replaceAll("runner-escape", "runner-source-escape")
    .replace("scripts/write-escape.mjs", "scripts/write-source-escape.mjs"),
);
fs.writeFileSync(
  path.join(sourceEscapePreset, "scripts/write-source-escape.mjs"),
  `#!/usr/bin/env node
import fs from "node:fs";
const context = JSON.parse(fs.readFileSync(process.env.HARNESS_PRESET_CONTEXT, "utf8"));
fs.writeFileSync(context.materializationManifestPath, JSON.stringify({
  schemaVersion: "preset-materialization/v1",
  writes: [{ source: "../private.txt", destination: "coding-agent-harness/governance/runner/private.txt", type: "text" }]
}, null, 2));
`,
);
expectJson(["preset", "install", sourceEscapePreset, "--project", "--force", "--allow-scripts", "--json", target], { env });
expectJson(["new-task", "runner-source-escape-task", "--budget", "standard", "--preset", "runner-source-escape", target], { env });
const sourceEscapeResult = run(["preset", "run", "runner-source-escape", "plan", "--task", "runner-source-escape-task", "--allow-scripts", "--json", target], { env });
assert(sourceEscapeResult.status !== 0, "generic preset runner should reject source paths outside the temp output root");
assert(`${sourceEscapeResult.stdout}\n${sourceEscapeResult.stderr}`.includes("Manifest source escapes preset output root"), "source escape failure should explain the rejected manifest source");

const directMutationPreset = path.join(tmpRoot, "runner-direct-mutation-preset");
fs.mkdirSync(path.join(directMutationPreset, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(directMutationPreset, "preset.yaml"),
  fs.readFileSync(path.join(escapePreset, "preset.yaml"), "utf8")
    .replaceAll("runner-escape", "runner-direct-mutation")
    .replace("scripts/write-escape.mjs", "scripts/write-direct-mutation.mjs"),
);
fs.writeFileSync(
  path.join(directMutationPreset, "scripts/write-direct-mutation.mjs"),
  `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const context = JSON.parse(fs.readFileSync(process.env.HARNESS_PRESET_CONTEXT, "utf8"));
fs.mkdirSync(path.join(context.targetRoot, "coding-agent-harness/governance/runner"), { recursive: true });
fs.writeFileSync(path.join(context.targetRoot, "coding-agent-harness/governance/runner/direct.txt"), "direct target mutation\\n");
fs.writeFileSync(context.materializationManifestPath, JSON.stringify({ schemaVersion: "preset-materialization/v1", writes: [] }, null, 2));
`,
);
expectJson(["preset", "install", directMutationPreset, "--project", "--force", "--allow-scripts", "--json", target], { env });
expectJson(["new-task", "runner-direct-mutation-task", "--budget", "standard", "--preset", "runner-direct-mutation", target], { env });
const directMutationResult = run(["preset", "run", "runner-direct-mutation", "plan", "--task", "runner-direct-mutation-task", "--allow-scripts", "--json", target], { env });
assert(directMutationResult.status !== 0, "generic preset runner should reject scripts that mutate the target outside manifest materialization");
assert(`${directMutationResult.stdout}\n${directMutationResult.stderr}`.includes("Preset script mutated target before materialization"), "direct target mutation failure should explain the audit failure");

function writeTaskFixture(slug: string, { title, state = "done", tombstone = "", localPath = "", confirmedReview = false, moduleKey, taskPathPrefix: explicitTaskPathPrefix = "" }: ReleaseFixtureOptions = {}): string {
  const taskPathPrefix = explicitTaskPathPrefix || (moduleKey
    ? `coding-agent-harness/planning/modules/${moduleKey}/tasks/${slug}`
    : `coding-agent-harness/planning/tasks/${slug}`);
  const canonicalTaskId = moduleKey ? `MODULES/${moduleKey}/${slug}` : `TASKS/${slug}`;
  const taskDir = path.join(target, taskPathPrefix);
  fs.mkdirSync(taskDir, { recursive: true });
  fs.writeFileSync(path.join(taskDir, "task_plan.md"), `# ${title || slug}

Task Contract: harness-task/v1

## Selected Budget

Selected budget: simple
${tombstone}
`);
  fs.writeFileSync(path.join(taskDir, "brief.md"), `# ${title || slug}\n\nFixture task for release aggregation.\n`);
  fs.writeFileSync(path.join(taskDir, "progress.md"), `# ${title || slug} - Progress\n\n## Current Status\n\n${state}\n\n## Log\n\n- evidence ${localPath}\n`);
  fs.writeFileSync(path.join(taskDir, "review.md"), "# Review\n\nNo open findings.\n");
  fs.writeFileSync(path.join(taskDir, "INDEX.md"), `# Index

## Task Audit Metadata

| Field | Value |
| --- | --- |
| Created By | historical-backfill |
| Created At | 2026-05-28 |
| Command Shape | test fixture |
| Budget | simple |
| Template Source | tests/release-closeout-preset.mts |
| Task Creator | test |
| Task Creator Source | git-unavailable |
| Human Review Status | ${confirmedReview ? "confirmed" : "not-confirmed"} |
| Confirmation ID | ${confirmedReview ? "HRC-20260528101010" : "n/a"} |
| Confirmed At | ${confirmedReview ? "2026-05-28 10:10" : "n/a"} |
| Reviewer | ${confirmedReview ? "Release Reviewer" : "n/a"} |
| Reviewer Email | ${confirmedReview ? "release-reviewer@example.invalid" : "n/a"} |
| Confirm Text | ${confirmedReview ? slug : "n/a"} |
| Evidence Checked | ${confirmedReview ? "TARGET:" + taskPathPrefix + "/review.md" : "n/a"} |
| Review Commit SHA | ${confirmedReview ? "pending" : "n/a"} |
| Audit Source | native-index |
| Audit Status | ${confirmedReview ? "committed" : "created"} |
| Exception Reason | n/a |
| Message | ${confirmedReview ? "Human review confirmed" : "n/a"} |
| Migration Status | native |
| Migrated From | n/a |
| Legacy Extra Fields | {} |
| Migration Notes | n/a |
`);
  if (confirmedReview) writeNativeReviewConfirmation(taskDir, canonicalTaskId, slug);
  return taskDir;
}

function writeNativeReviewConfirmation(taskDir: string, taskId: string, confirmText: string): void {
  const indexPath = path.join(taskDir, "INDEX.md");
  git(target, ["add", "--", path.relative(target, indexPath)]);
  git(target, ["commit", "-m", `chore: confirm review ${taskId.replace(/[^A-Za-z0-9._/-]+/g, "-")}`]);
  const commitSha = git(target, ["rev-parse", "HEAD"]).stdout.trim();
  const content = fs.readFileSync(indexPath, "utf8").replace("| Review Commit SHA | pending |", `| Review Commit SHA | ${commitSha} |`);
  fs.writeFileSync(indexPath, content);
  git(target, ["add", "--", path.relative(target, indexPath)]);
  git(target, ["commit", "-m", `chore: record review confirmation audit ${taskId.replace(/[^A-Za-z0-9._/-]+/g, "-")}`]);
}

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

writeTaskFixture(`${todayLocal}-release-done-path`, {
  title: "Done task with local path",
  state: "done",
  localPath: "/Users/example/secret/repo",
  confirmedReview: true,
  tombstone: `
## Task Tombstone

| Field | Value |
| --- | --- |
| State | archived |
| Retention Bucket | release-1.0.5 |
| Evidence | TARGET:coding-agent-harness/governance/releases/1.0.5/INDEX.md |
`,
});
writeTaskFixture(`${todayLocal}-release-unconfirmed`, { title: "Done task without human review confirmation", state: "done" });
writeTaskFixture(`${todayLocal}-release-blocked`, { title: "Blocked task must stay active", state: "blocked" });
const nestedArtifactTaskDir = writeTaskFixture(`${todayLocal}-release-nested-artifact-carrier`, {
  title: "Release nested artifact carrier",
  state: "done",
  confirmedReview: true,
});
const nestedArtifactPlan = path.join(nestedArtifactTaskDir, "artifacts/copied-task", `${todayLocal}-release-nested-artifact`, "task_plan.md");
fs.mkdirSync(path.dirname(nestedArtifactPlan), { recursive: true });
fs.writeFileSync(path.join(path.dirname(nestedArtifactPlan), "task_plan.md"), "# Nested Artifact Task\n\nTask Contract: harness-task/v1\n\n## Selected Budget\n\nSelected budget: simple\n");
fs.writeFileSync(path.join(path.dirname(nestedArtifactPlan), "progress.md"), "# Nested Artifact Task - Progress\n\n## Current Status\n\ndone\n");
writeTaskFixture(`${todayLocal}-release-module-done`, {
  title: "Module done task with review confirmation",
  state: "done",
  moduleKey: "life-circle",
  confirmedReview: true,
});
writeTaskFixture(`${todayLocal}-release-external-done`, {
  title: "External done task with review confirmation",
  state: "done",
  taskPathPrefix: `coding-agent-harness/planning/external/references/vendor/tasks/${todayLocal}-release-external-done`,
  confirmedReview: true,
});
writeTaskFixture(`${todayLocal}-release-template-ignored`, {
  title: "Template task must be ignored",
  state: "done",
  taskPathPrefix: `coding-agent-harness/planning/modules/life-circle/_task-template/${todayLocal}-release-template-ignored`,
  confirmedReview: true,
});
writeTaskFixture(`${todayLocal}-release-optional-ignored`, {
  title: "Optional structure task must be ignored",
  state: "done",
  taskPathPrefix: `coding-agent-harness/planning/modules/life-circle/_optional-structures/${todayLocal}-release-optional-ignored`,
  confirmedReview: true,
});
writeTaskFixture(`${todayLocal}-release-ambiguous`, { title: "Root ambiguous done task", state: "done", confirmedReview: true });
writeTaskFixture(`${todayLocal}-release-ambiguous`, {
  title: "Module ambiguous done task",
  state: "done",
  moduleKey: "life-circle",
  confirmedReview: true,
});
for (let index = 0; index < 105; index += 1) {
  writeTaskFixture(`${todayLocal}-bulk-done-${String(index).padStart(3, "0")}`, { title: `Bulk done ${index}`, state: "done" });
}
git(target, ["add", "."]);
git(target, ["commit", "-m", "add release closeout fixtures"]);

const taskIndex = expectJson(["task-index", "--json", target], { env });
const genericArchivedTask = taskIndex.tasks.find((task) => task.id.endsWith("release-done-path"));
assert(genericArchivedTask, "task index should include release-done-path fixture");
assert(genericArchivedTask.archiveMetadata?.["retention bucket"] === "release-1.0.5", "task index should expose generic tombstone metadata without release-specific fields");
const blockedArchive = run(["task-archive", "release-blocked", "--reason", "should not archive", target], { env });
assert(blockedArchive.status !== 0, "generic task-archive should reject blocked tasks");
assert(`${blockedArchive.stdout}\n${blockedArchive.stderr}`.includes("blocked tasks cannot be archived"), "blocked archive failure should explain the generic guard");

const unconfirmedArchive = run(["task-archive", "release-unconfirmed", "--reason", "release closeout", "--archive-field", "retention bucket=release:1.0.5", target], { env });
assert(unconfirmedArchive.status !== 0, "task-archive should reject done tasks without human review confirmation");
assert(`${unconfirmedArchive.stdout}\n${unconfirmedArchive.stderr}`.includes("Human review confirmation is required before task archive"), "unconfirmed archive failure should explain the human review gate");

const missingArchivedBy = run(["task-archive", "release-done-path", "--reason", "release closeout", "--archive-field", "retention bucket=release:1.0.5", target], { env });
assert(missingArchivedBy.status !== 0, "task-archive should reject confirmed tasks without an archived-by identity");
assert(`${missingArchivedBy.stdout}\n${missingArchivedBy.stderr}`.includes("task archive requires --archived-by"), "missing archived-by failure should explain the accountability gate");

const reservedArchiveField = run(["task-archive", "release-done-path", "--reason", "release closeout", "--archived-by", "Release Manager <release@example.invalid>", "--archive-field", "Archived By=Fake Reviewer", target], { env });
assert(reservedArchiveField.status !== 0, "task-archive should reject archive-field attempts to override accountability fields");
assert(`${reservedArchiveField.stdout}\n${reservedArchiveField.stderr}`.includes("Reserved archive field"), "reserved archive field failure should explain the audit field boundary");

expectJson(["task-archive", "release-done-path", "--reason", "release closeout", "--archived-by", "Release Manager <release@example.invalid>", "--archive-field", "retention bucket=release:1.0.5", "--archive-field", "release package=coding-agent-harness/governance/releases/1.0.5/INDEX.md", target], { env });
const taskIndexWithArchiveFields = expectJson(["task-index", "--json", target], { env });
const releaseArchivedTask = taskIndexWithArchiveFields.tasks.find((task) => task.id.endsWith("release-done-path"));
assert(releaseArchivedTask, "task index should include archived release-done-path fixture");
assert(releaseArchivedTask.archiveMetadata?.["retention bucket"] === "release:1.0.5", "task index should read generic archive-field retention metadata");
assert(releaseArchivedTask.archiveMetadata?.["release package"] === "coding-agent-harness/governance/releases/1.0.5/INDEX.md", "task index should read generic archive-field package metadata");
assert(releaseArchivedTask.archiveMetadata?.["archived by"] === "Release Manager <release@example.invalid>", "task index should expose the accountable archive actor");
assert(releaseArchivedTask.archiveMetadata?.["review confirmed by"] === "Release Reviewer", "task index should expose the review confirmation actor");
assert(releaseArchivedTask.archiveMetadata?.["review confirmation id"] === "HRC-20260528101010", "task index should expose the review confirmation id");

expectJson(["new-task", "release-closeout-no-selector", "--budget", "complex", "--preset", "release-closeout", "--release", "1.0.4", target], { env });
const noSelector = run(["preset", "run", "release-closeout", "scaffold", "--task", "release-closeout-no-selector", "--allow-scripts", "--json", target], { env });
assert(noSelector.status !== 0, "release-closeout scaffold should fail without an explicit task selector");
assert(`${noSelector.stdout}\n${noSelector.stderr}`.includes("release-closeout requires --task-list or --task-query"), `missing selector failure should explain the required selector\nSTDOUT:\n${noSelector.stdout}\nSTDERR:\n${noSelector.stderr}`);

const taskListPath = path.join(tmpRoot, "release-closeout-task-list.json");
fs.writeFileSync(taskListPath, JSON.stringify({
  schemaVersion: "release-closeout-task-list/v1",
  release: "1.0.5",
  taskIds: [`TASKS/${todayLocal}-release-done-path`, `TASKS/${todayLocal}-release-unconfirmed`, `MODULES/life-circle/${todayLocal}-release-module-done`],
}, null, 2));
const releaseTask = expectJson(["new-task", "release-closeout-1-0-5", "--budget", "complex", "--preset", "release-closeout", "--release", "1.0.5", "--task-list", taskListPath, target], { env });
const releaseTaskPlanPath = path.join(target, releaseTask.task.path.replace(/^TARGET:/, ""), "task_plan.md");
const releaseTaskPlan = fs.readFileSync(releaseTaskPlanPath, "utf8");
assert(releaseTaskPlan.includes("Release Version: 1.0.5"), "release closeout task should include release metadata");
assert(releaseTaskPlan.includes("harness preset run release-closeout plan"), "release closeout task template should direct the generic preset runner workflow");
assert(!fs.existsSync(path.join(target, "coding-agent-harness/governance/releases/1.0.5/INDEX.md")), "new-task release-closeout should not generate the release package");

const scaffold = expectJson(["preset", "run", "release-closeout", "scaffold", "--task", "release-closeout-1-0-5", "--allow-scripts", "--json", target], { env });
assert(scaffold.materialized.length >= 4, "release scaffold should materialize a version package through the generic runner");
const releaseRoot = path.join(target, "coding-agent-harness/governance/releases/1.0.5");
const releaseIndex = fs.readFileSync(path.join(releaseRoot, "INDEX.md"), "utf8");
const archivePlan = fs.readFileSync(path.join(releaseRoot, "task-archive-plan.md"), "utf8");
const publicSummary = fs.readFileSync(path.join(releaseRoot, "public-summary.md"), "utf8");
const publicRedactionReport = JSON.parse(fs.readFileSync(path.join(releaseRoot, "public-redaction-report.json"), "utf8"));
const aggregate = JSON.parse(fs.readFileSync(path.join(releaseRoot, "task-aggregate.json"), "utf8")) as ReleaseTaskAggregate;
assert(releaseIndex.includes("Release Closeout Package") && releaseIndex.includes("1.0.5"), "release package should include a version index");
assert(aggregate.selector?.type === "task-list", "task-list release aggregation should record selector type");
assert(aggregate.summary.totalTasks === 3, "task-list release aggregation should include only the selected tasks");
assert(
  aggregate.matched.map((task) => task.id).sort().join(",") === `MODULES/life-circle/${todayLocal}-release-module-done,TASKS/${todayLocal}-release-done-path,TASKS/${todayLocal}-release-unconfirmed`,
  "task-list release aggregation should match requested root and module task IDs",
);
assert(aggregate.excluded.some((task) => task.id.endsWith("release-blocked") && task.reason === "not-selected"), "task-list release aggregation should record unselected tasks as excluded");
assert(archivePlan.includes("task-archive") && archivePlan.includes("--archived-by \"Release Reviewer\"") && archivePlan.includes("--archive-field \"retention bucket=release:1.0.5\""), "release archive plan should emit executable generic archive-field commands with an accountable archive actor");
assert(archivePlan.includes("--archive-field \"release package=coding-agent-harness/governance/releases/1.0.5/INDEX.md\""), "release archive plan should include release package archive metadata");
assert(archivePlan.includes("release-done-path"), "release archive plan should include completed eligible tasks");
assert(archivePlan.includes(`task-archive "MODULES/life-circle/${todayLocal}-release-module-done"`), "release archive plan should emit full module task IDs");
const eligibleSection = archivePlan.split("## Not Eligible")[0];
assert(!eligibleSection.includes("release-blocked"), "release archive plan should not emit archive commands for blocked tasks");
assert(!eligibleSection.includes("release-unconfirmed"), "release archive plan should not emit archive commands for unconfirmed tasks");
assert(archivePlan.includes("release-unconfirmed") && archivePlan.includes("Human review confirmation is required before task archive"), "release archive plan should explain unconfirmed task ineligibility");
assert(!/\/Users\/|LOCAL_PATH_REDACTED\/secret/.test(publicSummary), "public release summary should redact local absolute paths");
assert(publicSummary.includes("LOCAL_PATH_REDACTED") || !publicSummary.includes("secret"), "public release summary should avoid leaking local paths");
assert(publicRedactionReport.status === "pass", "release preset should emit a public redaction report for public-facing output");

const ambiguousTaskListPath = path.join(tmpRoot, "release-closeout-ambiguous-task-list.json");
fs.writeFileSync(ambiguousTaskListPath, JSON.stringify({
  schemaVersion: "release-closeout-task-list/v1",
  release: "1.0.5",
  taskIds: [`${todayLocal}-release-ambiguous`],
}, null, 2));
expectJson(["new-task", "release-closeout-ambiguous", "--budget", "complex", "--preset", "release-closeout", "--release", "1.0.5", "--task-list", ambiguousTaskListPath, target], { env });
const ambiguousScaffold = run(["preset", "run", "release-closeout", "scaffold", "--task", "release-closeout-ambiguous", "--allow-scripts", "--json", target], { env });
assert(ambiguousScaffold.status !== 0, "release-closeout should reject ambiguous bare task IDs");
assert(`${ambiguousScaffold.stdout}\n${ambiguousScaffold.stderr}`.includes("Ambiguous task reference"), "ambiguous task-list failure should explain the selector ambiguity");

expectJson(["new-task", "release-closeout-query", "--budget", "complex", "--preset", "release-closeout", "--release", "1.0.6", "--task-query", `date:${todayLocal}..${todayLocal} state:done`, target], { env });
expectJson(["preset", "run", "release-closeout", "scaffold", "--task", "release-closeout-query", "--allow-scripts", "--json", target], { env });
const queryReleaseRoot = path.join(target, "coding-agent-harness/governance/releases/1.0.6");
const queryAggregate = JSON.parse(fs.readFileSync(path.join(queryReleaseRoot, "task-aggregate.json"), "utf8")) as ReleaseTaskAggregate;
const queryArchivePlan = fs.readFileSync(path.join(queryReleaseRoot, "task-archive-plan.md"), "utf8");
assert(queryAggregate.selector?.type === "task-query", "task-query release aggregation should record selector type");
assert(queryAggregate.summary.totalTasks >= 109 && queryAggregate.summary.doneTasks >= 109, "task-query release aggregation should handle large selected task sets");
assert(queryAggregate.matched.every((task) => task.state === "done"), "task-query state filter should only match done tasks");
assert(queryAggregate.matched.some((task) => task.id === `MODULES/life-circle/${todayLocal}-release-module-done`), "task-query date/state selector should include module tasks");
assert(queryAggregate.matched.some((task) => task.id.includes("release-external-done")), "task-query date/state selector should include external-root tasks, including groups named references");
assert(!queryAggregate.matched.some((task) => task.id.includes("/artifacts/")), "release-closeout selector must not treat nested artifact task_plan.md files as tasks");
assert(!queryAggregate.matched.some((task) => task.id.includes("release-template-ignored")), "release-closeout selector must not include task template fixtures");
assert(!queryAggregate.matched.some((task) => task.id.includes("release-optional-ignored")), "release-closeout selector must not include optional-structure fixtures");
assert(!queryAggregate.matched.some((task) => task.id.endsWith("release-blocked")), "task-query state filter should exclude blocked tasks");
assert(!queryArchivePlan.split("## Not Eligible")[0].includes("release-blocked"), "task-query archive plan should not emit archive commands for blocked tasks");

expectJson(["new-task", "release-closeout-module-query", "--budget", "complex", "--preset", "release-closeout", "--release", "1.0.7", "--task-query", `date:${todayLocal}..${todayLocal} state:done module:life-circle`, target], { env });
expectJson(["preset", "run", "release-closeout", "scaffold", "--task", "release-closeout-module-query", "--allow-scripts", "--json", target], { env });
const moduleQueryReleaseRoot = path.join(target, "coding-agent-harness/governance/releases/1.0.7");
const moduleQueryAggregate = JSON.parse(fs.readFileSync(path.join(moduleQueryReleaseRoot, "task-aggregate.json"), "utf8")) as ReleaseTaskAggregate;
assert(moduleQueryAggregate.matched.length >= 2, "module query should include module-owned selected tasks");
assert(moduleQueryAggregate.matched.every((task) => task.id.startsWith("MODULES/life-circle/")), "module query should only include tasks from the requested module");
const check = expectJson(["preset", "run", "release-closeout", "check", "--task", "release-closeout-1-0-5", "--allow-scripts", "--json", target], { env });
assert(check.status === "pass", "release closeout check entrypoint should pass after scaffold materializes the version package");

console.log("Release closeout preset tests passed");
