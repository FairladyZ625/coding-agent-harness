#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  assert,
  expectJson,
  expectPass,
  run,
  tmpRoot,
  todayLocal,
} from "./helpers/harness-test-utils.mjs";

assert(fs.existsSync(path.join(repoRootFromTest(), "docs-release/guides/preset-development.md")), "preset development guide should exist");
assert(fs.existsSync(path.join(repoRootFromTest(), "skills/preset-creator/SKILL.md")), "preset creator skill should exist");

const home = path.join(tmpRoot, "preset-home");
const env = { ...process.env, HOME: home };
const target = path.join(tmpRoot, "preset-engine-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", target], { env });

const listBefore = expectJson(["preset", "list", "--json"], { env });
const legacyBefore = listBefore.presets.find((preset) => preset.id === "legacy-migration");
assert(legacyBefore?.source === "builtin", "builtin presets should report source=builtin");
const listTextBefore = expectPass(["preset", "list"], { env }).stdout;
assert(listTextBefore.includes("legacy-migration@") && listTextBefore.includes("[builtin]"), "text preset list should show source labels");

const customSource = path.join(tmpRoot, "custom-review-preset");
fs.mkdirSync(path.join(customSource, "templates"), { recursive: true });
fs.writeFileSync(
  path.join(customSource, "preset.yaml"),
  `id: custom-review
version: 1
purpose: Custom review task preset
compatibleBudgets: [standard, complex]
localeSupport: [en-US]
task:
  kind: review-task
  defaultTaskId: custom-review-task
entrypoints:
  newTask:
    type: template
    writes: [docs/09-PLANNING/TASKS/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
inputs:
  subject:
    type: text
    flag: --subject
    required: true
templateValues:
  subject:
    from: inputs.subject
metadata:
  ReviewSubject:
    label: Review Subject
    from: inputs.subject
evidence:
  bundleDir: artifacts/preset
  files:
    subject:
      path: subject.txt
      type: text
      value: inputs.subject
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json, preset-manifest.json, write-scope.json]
writeScopes:
  taskDocs:
    path: docs/09-PLANNING/TASKS/**
    access: write
`,
);
fs.writeFileSync(path.join(customSource, "templates/task_plan.append.md"), "## Custom Review\n\nSubject: {{subject}}\n");

assert(expectJson(["preset", "check", customSource, "--json"], { env }).source === "local", "preset check should validate local preset directories before install");
const install = expectJson(["preset", "install", customSource, "--force", "--json"], { env });
assert(install.installed === true, "preset install should report installed=true");
assert(install.destination.includes(".coding-agent-harness/presets/custom-review"), "preset install should copy into the user preset directory");
const listAfter = expectJson(["preset", "list", "--json"], { env });
assert(listAfter.presets.some((preset) => preset.id === "custom-review" && preset.source === "user"), "installed preset should be listed with source=user");
const inspect = expectJson(["preset", "inspect", "custom-review", "--json"], { env });
assert(inspect.inputs.subject.flag === "--subject", "preset inspect should expose declarative inputs");
assert(inspect.templateValues.subject.from === "inputs.subject", "preset inspect should expose templateValues");
assert(inspect.metadata.ReviewSubject.from === "inputs.subject", "preset inspect should expose declarative metadata");
assert(inspect.source === "user", "user-installed preset should override builtin discovery source");
assert(expectJson(["preset", "check", "custom-review", "--json"], { env }).status === "pass", "installed preset should pass preset check");

const missingInput = run(["new-task", "custom-review-task", "--budget", "standard", "--preset", "custom-review", target], { env });
assert(missingInput.status !== 0, "new-task should fail when required preset input is missing");
assert(`${missingInput.stdout}\n${missingInput.stderr}`.includes("--subject"), `missing preset input error should name the CLI flag\nSTDOUT:\n${missingInput.stdout}\nSTDERR:\n${missingInput.stderr}`);

const created = expectJson(["new-task", "custom-review-task", "--budget", "standard", "--preset", "custom-review", "--subject", "API contracts", target], { env });
assert(created.task.kind === "review-task", "custom preset should set task kind from manifest");
assert(created.task.preset === "custom-review", "custom preset should report preset id");
assert(created.task.evidenceBundle, "custom preset should report evidence bundle");
const customTaskDir = path.join(target, `docs/09-PLANNING/TASKS/${todayLocal}-custom-review-task`);
const customTaskPlan = fs.readFileSync(path.join(customTaskDir, "task_plan.md"), "utf8");
assert(customTaskPlan.includes("Task Preset: custom-review"), "generic preset engine should persist preset metadata");
assert(customTaskPlan.includes("Task Kind: review-task"), "generic preset engine should persist manifest task kind");
assert(customTaskPlan.includes("Review Subject: API contracts"), "generic preset engine should render declarative metadata");
assert(customTaskPlan.includes("Subject: API contracts"), "generic preset engine should render declarative template values");
assert(fs.readFileSync(path.join(target, created.task.evidenceBundle, "subject.txt"), "utf8").trim() === "API contracts", "generic preset engine should generate declared text evidence");
assert(fs.existsSync(path.join(target, created.task.evidenceBundle, "preset-audit.json")), "generic preset engine should generate declared audit evidence");
assert(fs.existsSync(path.join(target, created.task.evidenceBundle, "preset-manifest.json")), "generic preset engine should generate declared manifest evidence");
assert(fs.existsSync(path.join(target, created.task.evidenceBundle, "write-scope.json")), "generic preset engine should generate declared write-scope evidence");
const customPresetManifest = JSON.parse(fs.readFileSync(path.join(target, created.task.evidenceBundle, "preset-manifest.json"), "utf8"));
assert(customPresetManifest.metadata.ReviewSubject.from === "inputs.subject", "preset manifest evidence should include declarative metadata");
const customStatus = expectJson(["status", "--json", target], { env });
assert(customStatus.checkState.status === "pass", `target status should accept installed custom presets\n${JSON.stringify(customStatus.checkState, null, 2)}`);
const customStatusTask = customStatus.tasks.find((task) => task.id === `TASKS/${todayLocal}-custom-review-task`);
assert(customStatusTask?.taskPreset === "custom-review", "status should expose installed custom preset id");
assert(customStatusTask?.taskKind === "review-task", "status should expose installed custom preset kind");
assert(customStatusTask?.presetVersion === "1", "status should expose installed custom preset version");
assert(customStatusTask?.evidenceBundle === `TARGET:${created.task.evidenceBundle}`, "status should expose installed custom preset evidence bundle");
const customTaskIndex = expectJson(["task-index", "--json", target], { env });
const customIndexedTask = customTaskIndex.tasks.find((task) => task.id === `TASKS/${todayLocal}-custom-review-task`);
assert(customIndexedTask?.preset === "custom-review", "task-index should expose installed custom preset id");
assert(customIndexedTask?.kind === "review-task", "task-index should expose installed custom preset task kind");
assert(customIndexedTask?.evidenceBundle === `TARGET:${created.task.evidenceBundle}`, "task-index should expose installed custom preset evidence bundle");

const currentTarget = path.join(tmpRoot, "preset-engine-current-target");
fs.mkdirSync(currentTarget);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", currentTarget], { env });
const createdInCurrent = expectJson(["new-task", "current-review-task", "--budget", "standard", "--preset", "custom-review", "--subject", "Current directory target"], { env, cwd: currentTarget });
assert(createdInCurrent.task.id === `TASKS/${todayLocal}-current-review-task`, "custom preset inputs without an explicit target should use the current directory");
const currentTaskPlan = fs.readFileSync(path.join(currentTarget, `docs/09-PLANNING/TASKS/${todayLocal}-current-review-task/task_plan.md`), "utf8");
assert(currentTaskPlan.includes("Subject: Current directory target"), "custom preset input values should not be mistaken for target paths");

const badIdSource = path.join(tmpRoot, "bad-id-preset");
fs.mkdirSync(badIdSource, { recursive: true });
fs.writeFileSync(
  path.join(badIdSource, "preset.yaml"),
  `id: ../../Documents
version: 1
purpose: Bad id preset
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [docs/09-PLANNING/TASKS/**]
    audit: true
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: docs/09-PLANNING/TASKS/**
    access: write
`,
);
const badIdInstall = run(["preset", "install", badIdSource, "--force", "--json"], { env });
assert(badIdInstall.status !== 0, "preset install should reject ids that are not safe directory names");
assert(`${badIdInstall.stdout}\n${badIdInstall.stderr}`.includes("Invalid preset id"), "bad preset id rejection should explain the invalid id");
const badIdUninstall = run(["preset", "uninstall", "../../Documents", "--json"], { env });
assert(badIdUninstall.status !== 0, "preset uninstall should reject path traversal ids");
assert(`${badIdUninstall.stdout}\n${badIdUninstall.stderr}`.includes("Invalid preset id"), "bad uninstall id rejection should explain the invalid id");

const invalidOverwriteSource = path.join(tmpRoot, "custom-review-invalid-overwrite");
fs.mkdirSync(invalidOverwriteSource, { recursive: true });
fs.writeFileSync(
  path.join(invalidOverwriteSource, "preset.yaml"),
  `id: custom-review
version: 1
purpose: Invalid overwrite fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [docs/09-PLANNING/TASKS/**]
    audit: true
    templates:
      taskPlanAppend: templates/missing.md
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: docs/09-PLANNING/TASKS/**
    access: write
`,
);
const invalidOverwrite = run(["preset", "install", invalidOverwriteSource, "--force", "--json"], { env });
assert(invalidOverwrite.status !== 0, "failed forced overwrite should exit non-zero");
assert(expectJson(["preset", "check", "custom-review", "--json"], { env }).status === "pass", "failed forced overwrite should preserve the previous installed preset");

const blockedSource = path.join(tmpRoot, "bad-scope-preset");
fs.mkdirSync(path.join(blockedSource, "templates"), { recursive: true });
fs.writeFileSync(
  path.join(blockedSource, "preset.yaml"),
  `id: bad-scope
version: 1
purpose: Bad write scope preset
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [docs/09-PLANNING/TASKS/**]
    audit: true
inputs:
  note:
    type: text
    flag: --note
    required: false
    default: ok
evidence:
  bundleDir: ../../outside
  files:
    note:
      path: note.txt
      type: text
      value: inputs.note
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
writeScopes:
  taskDocs:
    path: docs/09-PLANNING/TASKS/**
    access: write
`,
);
const badScopeCheck = run(["preset", "check", blockedSource, "--json"], { env });
assert(badScopeCheck.status !== 0, "preset check should reject evidence bundles that escape the task directory");
assert(`${badScopeCheck.stdout}\n${badScopeCheck.stderr}`.includes("evidence.bundleDir escapes task directory"), "bad preset check should explain the escaping evidence bundle");
const badScopeInstall = run(["preset", "install", blockedSource, "--force", "--json"], { env });
assert(badScopeInstall.status !== 0, "preset install should reject write-scope-violating manifests before task creation");

const exactScopeSource = path.join(tmpRoot, "exact-scope-preset");
fs.mkdirSync(exactScopeSource, { recursive: true });
fs.writeFileSync(
  path.join(exactScopeSource, "preset.yaml"),
  `id: exact-scope
version: 1
purpose: Exact scope fixture
compatibleBudgets: [standard]
entrypoints:
  newTask:
    type: template
    writes: [docs/09-PLANNING/TASKS]
    audit: true
audit:
  manifestRequired: true
writeScopes:
  taskDocs:
    path: docs/09-PLANNING/TASKS
    access: write
`,
);
expectJson(["preset", "install", exactScopeSource, "--force", "--json"], { env });
const exactScopeCreate = run(["new-task", "exact-scope-task", "--preset", "exact-scope", target], { env });
assert(exactScopeCreate.status !== 0, "runtime write scope enforcement should cover generated task files, not only evidence");
assert(`${exactScopeCreate.stdout}\n${exactScopeCreate.stderr}`.includes("write scope"), "runtime scope failure should explain the write scope violation");

const builtinInstall = expectJson(["preset", "install", "legacy-migration", "--force", "--json"], { env });
assert(builtinInstall.installed === true && builtinInstall.id === "legacy-migration", "preset install should copy builtin presets by id");
assert(expectJson(["preset", "inspect", "legacy-migration", "--json"], { env }).source === "user", "installed builtin preset should be discovered from user directory first");
const uninstall = expectJson(["preset", "uninstall", "custom-review", "--json"], { env });
assert(uninstall.removed === true, "preset uninstall should remove user-installed presets");

expectPass(["preset", "check", "standard-task"], { env });
const standardTask = expectJson(["new-task", "standard-task-fixture", "--preset", "standard-task", "--title", "Standard Task Fixture", target], { env });
assert(standardTask.task.preset === "standard-task", "second builtin preset should work through the generic engine");
assert(fs.existsSync(path.join(target, standardTask.task.evidenceBundle, "preset-audit.json")), "second builtin preset should generate audit evidence");
const standardTaskPlan = fs.readFileSync(path.join(target, `docs/09-PLANNING/TASKS/${todayLocal}-standard-task-fixture/task_plan.md`), "utf8");
assert(standardTaskPlan.includes("Preset Title | Standard Task Fixture"), "second builtin preset should render the global task title through task.title");

console.log("Preset engine tests passed");

function repoRootFromTest() {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
}
