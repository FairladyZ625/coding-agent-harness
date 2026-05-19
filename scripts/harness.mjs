#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  addCapability,
  buildStatus,
  createTask,
  doctorUserSkill,
  installUserSkill,
  listLifecycleTasks,
  renderDashboard,
  normalizeLocale,
  updateTaskLifecycle,
  writeDashboardFolder,
  writeInitFiles,
} from "./lib/harness-core.mjs";

const args = process.argv.slice(2);
const command = args.shift() || "help";

function takeFlag(name, fallback = false) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  args.splice(index, 1);
  return true;
}

function takeOption(name, fallback = "") {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1] || fallback;
  args.splice(index, 2);
  return value;
}

async function resolveInitLocale(requestedLocale) {
  if (requestedLocale) return normalizeLocale(requestedLocale);
  if (!process.stdin.isTTY || !process.stdout.isTTY) return "en-US";

  const prompt = [
    "Select harness language / 选择初始化语言:",
    "  1. 中文 (zh-CN)",
    "  2. English (en-US)",
    "Language [1/2, default 2]: ",
  ].join("\n");
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await reader.question(prompt)).trim().toLowerCase();
    if (["1", "zh", "zh-cn", "cn", "中文"].includes(answer)) return "zh-CN";
    if (["2", "en", "en-us", "english", "英文", ""].includes(answer)) return "en-US";
    console.error(`Unknown language selection: ${answer}. Falling back to en-US.`);
    return "en-US";
  } finally {
    reader.close();
  }
}

async function confirmUserInstall({ yes = false, dryRun = false, agent = "codex" } = {}) {
  if (yes || dryRun) return true;
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await reader.question(`Install Coding Agent Harness into user skill directory for ${agent}? [y/N] `)).trim().toLowerCase();
    return ["y", "yes"].includes(answer);
  } finally {
    reader.close();
  }
}

function targetArg() {
  return args[args.length - 1] && !args[args.length - 1].startsWith("-") ? args[args.length - 1] : ".";
}

function printHelp() {
  console.log(`Coding Agent Harness

Usage:
  harness check [--profile source-package|private-harness|target-project] [target]
  harness status [--json] [--strict] [target]
  harness dashboard [--out file.html] [--out-dir folder] [target]
  harness init [--dry-run] [--locale zh-CN|en-US] [--capabilities core,dashboard] [target]
  harness add-capability <name> [--dry-run] [--locale zh-CN|en-US] [target]
  harness new-task <task-id> [--title title] [--locale zh-CN|en-US] [--dry-run] [target]
  harness task-start <task-id> [--message text] [target]
  harness task-log <task-id> --message text [--evidence type:PATH:summary] [target]
  harness task-block <task-id> [--message text] [target]
  harness task-complete <task-id> [--message text] [target]
  harness task-list [--json] [target]
  harness install-user [--agent codex|claude|gemini|openclaw|agents|all] [--home dir] [--dry-run] [--force] [--yes]
  harness doctor-user [--agent codex|claude|gemini|openclaw|agents|all] [--home dir]

If init runs in an interactive terminal and --locale is omitted, it asks for a
language. Non-interactive init defaults to en-US.
`);
}

function exitWithReport(report) {
  for (const warning of report.warnings || []) console.log(`Warning: ${warning}`);
  for (const failure of report.failures || []) console.error(`Failure: ${failure}`);
  process.exit((report.failures || []).length > 0 ? 1 : 0);
}

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else if (command === "check") {
  const profile = takeOption("--profile", "target-project");
  const strict = takeFlag("--strict");
  const target = targetArg();
  const failures = [];
  const warnings = [];

  if (profile === "source-package") {
    for (const required of ["package.json", "scripts/harness.mjs", "scripts/check-harness.mjs", "templates/planning/task_plan.md"]) {
      if (!fs.existsSync(path.resolve(target, required))) failures.push(`missing source package file: ${required}`);
    }
  }

  const status = buildStatus(target, { skipLegacyCheck: profile === "source-package", strictLegacy: strict, strict });
  failures.push(...status.checkState.details.failures);
  warnings.push(...status.checkState.details.warnings);

  if (!["source-package", "private-harness", "target-project"].includes(profile)) failures.push(`unknown profile: ${profile}`);
  if (failures.length === 0) console.log(`Harness check passed (${profile}): ${path.resolve(target)}`);
  exitWithReport({ failures: [...new Set(failures)], warnings: [...new Set(warnings)] });
} else if (command === "status") {
  const json = takeFlag("--json");
  const strict = takeFlag("--strict");
  const status = buildStatus(targetArg(), { strictLegacy: strict, strict });
  if (json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(`${status.project.name}: ${status.checkState.status} (${status.checkState.failures} failures, ${status.checkState.warnings} warnings)`);
    console.log(`mode: ${status.mode}`);
    console.log(`capabilities: ${status.capabilities.map((capability) => `${capability.name}:${capability.state}`).join(", ")}`);
    console.log(`tasks: ${status.tasks.length}`);
  }
  process.exit(status.checkState.status === "fail" ? 1 : 0);
} else if (command === "dashboard") {
  const out = takeOption("--out", "harness-dashboard.html");
  const outDir = takeOption("--out-dir", "");
  if (outDir) {
    console.log(writeDashboardFolder(outDir, targetArg()));
  } else {
    const status = buildStatus(targetArg());
    const html = renderDashboard(status);
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    fs.writeFileSync(path.resolve(out), html);
    console.log(path.resolve(out));
  }
  process.exit(0);
} else if (command === "init") {
  const dryRun = takeFlag("--dry-run");
  const locale = await resolveInitLocale(takeOption("--locale", ""));
  const capabilities = takeOption("--capabilities", "core").split(",").map((item) => item.trim()).filter(Boolean);
  try {
    const result = writeInitFiles(targetArg(), capabilities, { dryRun, locale });
    console.log(JSON.stringify({ dryRun, locale: result.locale, capabilities: result.capabilities, changes: result.changes, report: result.report }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "add-capability") {
  const dryRun = takeFlag("--dry-run");
  const locale = normalizeLocale(takeOption("--locale", ""));
  const capability = args.shift();
  if (!capability) {
    console.error("Missing capability name");
    process.exit(2);
  }
  try {
    const result = addCapability(targetArg(), capability, { dryRun, locale });
    console.log(JSON.stringify({ dryRun, registry: result.registry, changes: result.changes, report: result.report }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "new-task") {
  const dryRun = takeFlag("--dry-run");
  const locale = takeOption("--locale", "");
  const title = takeOption("--title", "");
  const taskId = args.shift();
  if (!taskId) {
    console.error("Missing task id");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(createTask(targetArg(), taskId, { title, locale, dryRun }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (["task-start", "task-log", "task-block", "task-complete"].includes(command)) {
  const message = takeOption("--message", "");
  const evidence = takeOption("--evidence", "");
  const taskId = args.shift();
  if (!taskId) {
    console.error("Missing task id");
    process.exit(2);
  }
  const lifecycle = {
    "task-start": { event: "task-start", state: "in_progress" },
    "task-log": { event: "task-log", state: "" },
    "task-block": { event: "task-block", state: "blocked" },
    "task-complete": { event: "task-complete", state: "done" },
  }[command];
  try {
    console.log(JSON.stringify(updateTaskLifecycle(targetArg(), taskId, { ...lifecycle, message, evidence }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "task-list") {
  const json = takeFlag("--json");
  const result = listLifecycleTasks(targetArg());
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const task of result.tasks) {
      console.log(`${task.id}\t${task.state}\t${task.completion}%\t${task.title}`);
    }
  }
} else if (command === "install-user") {
  const dryRun = takeFlag("--dry-run");
  const force = takeFlag("--force");
  const yes = takeFlag("--yes") || takeFlag("-y");
  takeFlag("--global");
  const agent = takeOption("--agent", "codex");
  const home = takeOption("--home", "");
  if (!(await confirmUserInstall({ yes, dryRun, agent }))) {
    console.error("Refusing to write user skill files without confirmation. Re-run with --yes or --dry-run.");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(installUserSkill({ agent, home, dryRun, force }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "doctor-user") {
  const agent = takeOption("--agent", "codex");
  const home = takeOption("--home", "");
  try {
    const report = doctorUserSkill({ agent, home });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.status === "pass" ? 0 : 1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  printHelp();
  process.exit(2);
}
