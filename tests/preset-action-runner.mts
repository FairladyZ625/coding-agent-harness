#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  assert,
  expectJson,
  run,
  tmpRoot,
  todayLocal,
} from "./helpers/harness-test-utils.mjs";

type ScriptPolicyReport = {
  hasScripts?: boolean;
  scriptCommands: string[];
  trusted?: boolean;
};

type PresetCheckReport = {
  actions?: Record<string, { type?: string }>;
  scriptPolicy?: ScriptPolicyReport;
};

type PresetInstallResult = {
  scriptPolicy?: ScriptPolicyReport;
};

type PresetActionResult = {
  action?: string;
  status?: string;
  materialized?: Array<{ destination?: string }>;
};

const home = path.join(tmpRoot, "preset-action-home");
const env = { ...process.env, HOME: home, HARNESS_ACTION_SECRET: "do-not-leak" };
const target = path.join(tmpRoot, "preset-action-target");
fs.mkdirSync(target);
expectJson(["init", "--locale", "en-US", "--capabilities", "core", target], { env });

const actionPreset = path.join(tmpRoot, "action-runner-preset");
fs.mkdirSync(path.join(actionPreset, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(actionPreset, "preset.yaml"),
  `id: action-runner
version: 1
purpose: Test preset action runner
compatibleBudgets: [standard]
localeSupport: [en-US]
task:
  kind: action-runner-task
  defaultTaskId: action-runner-task
entrypoints:
  newTask:
    type: template
    writes: [{{paths.tasksRoot}}/**]
    audit: true
actions:
  close-stage:
    type: script
    command: scripts/close-stage.mjs
    taskRequired: true
    reads: [{{task.paths.taskPlan}}, {{task.paths.progress}}, {{task.paths.artifacts}}/**]
    writes: [{{task.paths.artifacts}}/stages/**, {{task.paths.artifacts}}/INDEX.md, {{task.paths.progress}}]
    audit: true
    inputs:
      stage:
        type: text
        flag: --stage
        required: true
      summary:
        type: text
        flag: --summary
        required: true
      done:
        type: flag
        flag: --done
      payload:
        type: json-file
        flag: --payload
  mutate-direct:
    type: script
    command: scripts/mutate-direct.mjs
    taskRequired: true
    writes: [{{task.paths.artifacts}}/direct/**]
    audit: true
writeScopes:
  taskDocs:
    path: {{paths.tasksRoot}}/**
    access: write
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
`,
);
fs.writeFileSync(
  path.join(actionPreset, "scripts/close-stage.mjs"),
  `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const context = JSON.parse(fs.readFileSync(process.env.HARNESS_PRESET_CONTEXT, "utf8"));
fs.mkdirSync(path.join(context.outputRoot, "reports"), { recursive: true });
fs.writeFileSync(path.join(context.outputRoot, "reports/stage.md"), [
  "# Stage",
  \`stage=\${context.inputs.stage}\`,
  \`summary=\${context.inputs.summary}\`,
  \`done=\${context.inputs.done}\`,
  \`payload=\${context.inputs.payload?.ok ? "yes" : "no"}\`,
  \`secret=\${process.env.HARNESS_ACTION_SECRET || "missing"}\`,
  \`hasAbsolutePaths=\${context.absolutePaths ? "yes" : "no"}\`,
  \`taskDir=\${context.task.dir}\`,
  ""
].join("\\n"));
fs.writeFileSync(context.materializationManifestPath, JSON.stringify({
  schemaVersion: "preset-materialization/v1",
  status: "closed",
  writes: [{
    source: "reports/stage.md",
    destination: \`\${context.task.paths.artifacts}/stages/\${context.inputs.stage}.md\`,
    type: "text"
  }]
}, null, 2));
`,
);
fs.writeFileSync(
  path.join(actionPreset, "scripts/mutate-direct.mjs"),
  `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
const context = JSON.parse(fs.readFileSync(process.env.HARNESS_PRESET_CONTEXT, "utf8"));
fs.mkdirSync(path.join(context.targetRoot, context.task.paths.artifacts, "direct"), { recursive: true });
fs.writeFileSync(path.join(context.targetRoot, context.task.paths.artifacts, "direct/mutated.txt"), "direct mutation\\n");
fs.writeFileSync(context.materializationManifestPath, JSON.stringify({ schemaVersion: "preset-materialization/v1", writes: [] }, null, 2));
`,
);

const checkReport = expectJson<PresetCheckReport>(["preset", "check", actionPreset, "--json"], { env });
assert(checkReport.actions?.["close-stage"]?.type === "script", "preset check should expose action declarations");
assert(checkReport.scriptPolicy?.hasScripts === true, "preset check should report script policy for action scripts");
assert(checkReport.scriptPolicy.scriptCommands.some((item) => item.includes("close-stage")), "script policy should name action script commands");

const installWithoutTrust = run(["preset", "install", actionPreset, "--project", "--force", "--json", target], { env });
assert(installWithoutTrust.status !== 0, "non-builtin script actions should require --allow-scripts during install");
assert(`${installWithoutTrust.stdout}\n${installWithoutTrust.stderr}`.includes("--allow-scripts"), "install trust failure should explain --allow-scripts");

const installTrusted = expectJson<PresetInstallResult>(["preset", "install", actionPreset, "--project", "--force", "--allow-scripts", "--json", target], { env });
assert(installTrusted.scriptPolicy?.trusted === true, "trusted install should record script trust");

const payloadPath = path.join(tmpRoot, "action-payload.json");
fs.writeFileSync(payloadPath, JSON.stringify({ ok: true }, null, 2));
expectJson(["new-task", "action-owned-task", "--budget", "standard", "--preset", "action-runner", target], { env });

const actionResult = expectJson<PresetActionResult>([
  "preset",
  "action",
  "action-runner",
  "close-stage",
  "--task",
  "action-owned-task",
  "--stage",
  "PLAN",
  "--summary",
  "closed cleanly",
  "--done",
  "--payload",
  payloadPath,
  "--json",
  target,
], { env });
assert(actionResult.action === "close-stage", "preset action should report the executed action");
assert(actionResult.status === "closed", "preset action should return manifest status");
assert(actionResult.materialized?.some((item) => item.destination?.endsWith("/artifacts/stages/PLAN.md")), "preset action should materialize task-local writes");
const taskDir = path.join(target, "coding-agent-harness/planning/tasks", `${todayLocal}-action-owned-task`);
const stagePath = path.join(taskDir, "artifacts/stages/PLAN.md");
const stageContent = fs.readFileSync(stagePath, "utf8");
assert(stageContent.includes("summary=closed cleanly"), "action script should receive schema-declared text input");
assert(stageContent.includes("done=true"), "action script should receive schema-declared flag input");
assert(stageContent.includes("payload=yes"), "action script should receive parsed json-file input");
assert(stageContent.includes("secret=missing"), "action runner should not pass arbitrary caller environment variables to scripts");
assert(stageContent.includes("hasAbsolutePaths=no"), "action context should not include the broad absolutePaths map");

const missingInput = run(["preset", "action", "action-runner", "close-stage", "--task", "action-owned-task", "--summary", "missing stage", "--json", target], { env });
assert(missingInput.status !== 0, "action runner should reject missing required action inputs");
assert(`${missingInput.stdout}\n${missingInput.stderr}`.includes("--stage"), "missing input failure should name the missing flag");

const unknownArg = run(["preset", "action", "action-runner", "close-stage", "--task", "action-owned-task", "--stage", "PLAN", "--summary", "extra", "--unknown", "--json", target], { env });
assert(unknownArg.status !== 0, "action runner should reject arbitrary extra CLI args");
assert(`${unknownArg.stdout}\n${unknownArg.stderr}`.includes("Unknown action argument"), "unknown argument failure should explain schema-only inputs");

expectJson(["new-task", "standard-owned-task", "--budget", "standard", "--preset", "standard-task", target], { env });
const mismatch = run(["preset", "action", "action-runner", "close-stage", "--task", "standard-owned-task", "--stage", "PLAN", "--summary", "wrong owner", "--json", target], { env });
assert(mismatch.status !== 0, "action runner should reject tasks owned by another preset");
assert(`${mismatch.stdout}\n${mismatch.stderr}`.includes("not action-runner"), "preset mismatch failure should name the expected preset");

const directMutation = run(["preset", "action", "action-runner", "mutate-direct", "--task", "action-owned-task", "--json", target], { env });
assert(directMutation.status !== 0, "action runner should reject direct target mutation before materialization");
assert(`${directMutation.stdout}\n${directMutation.stderr}`.includes("Preset script mutated target before materialization"), "direct mutation failure should explain the audit failure");

const badCommandPreset = path.join(tmpRoot, "bad-action-command-preset");
fs.mkdirSync(path.join(badCommandPreset, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(badCommandPreset, "preset.yaml"),
  `id: bad-action-command
version: 1
purpose: Test invalid action command
compatibleBudgets: [standard]
localeSupport: [en-US]
task:
  kind: bad-action-command-task
entrypoints:
  newTask:
    type: template
    writes: [{{paths.tasksRoot}}/**]
    audit: true
actions:
  bad:
    type: script
    command: scripts/not-esm.js
    taskRequired: true
    writes: [{{task.paths.artifacts}}/**]
writeScopes:
  taskDocs:
    path: {{paths.tasksRoot}}/**
    access: write
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
`,
);
fs.writeFileSync(path.join(badCommandPreset, "scripts/not-esm.js"), "console.log('bad');\n");
const badCommandCheck = run(["preset", "check", badCommandPreset, "--json"], { env });
assert(badCommandCheck.status !== 0, "preset check should reject non-.mjs action commands");
assert(`${badCommandCheck.stdout}\n${badCommandCheck.stderr}`.includes(".mjs"), "invalid action command failure should explain the .mjs requirement");

const broadWritePreset = path.join(tmpRoot, "broad-action-write-preset");
fs.mkdirSync(path.join(broadWritePreset, "scripts"), { recursive: true });
fs.writeFileSync(
  path.join(broadWritePreset, "preset.yaml"),
  `id: broad-action-write
version: 1
purpose: Test broad action writes
compatibleBudgets: [standard]
localeSupport: [en-US]
task:
  kind: broad-action-write-task
entrypoints:
  newTask:
    type: template
    writes: [{{paths.tasksRoot}}/**]
    audit: true
actions:
  broad:
    type: script
    command: scripts/broad.mjs
    taskRequired: true
    writes: [{{paths.tasksRoot}}/**]
writeScopes:
  taskDocs:
    path: {{paths.tasksRoot}}/**
    access: write
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json]
`,
);
fs.writeFileSync(path.join(broadWritePreset, "scripts/broad.mjs"), "console.log('broad');\n");
const broadWriteCheck = run(["preset", "check", broadWritePreset, "--json"], { env });
assert(broadWriteCheck.status !== 0, "preset check should reject broad task-root action write scopes");
assert(`${broadWriteCheck.stdout}\n${broadWriteCheck.stderr}`.includes("task-local"), "broad action write failure should explain task-local writes");

console.log("Preset action runner tests passed");
