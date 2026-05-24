#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  addCapability,
  buildStatus,
  doctorUserSkill,
  installUserSkill,
  normalizeLocale,
  rebuildGovernanceIndexes,
  serveDashboardWorkbench,
  validateSourcePackageBoundary,
  writeInitFiles,
} from "./lib/harness-core.mjs";
import { runDashboardCommand } from "./commands/dashboard-command.mjs";
import { runMigrationCommand } from "./commands/migration-command.mjs";
import { runPresetCommand } from "./commands/preset-command.mjs";
import { runTaskCommand } from "./commands/task-command.mjs";

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
  harness dev [--no-open] [--out-dir folder] [--host 127.0.0.1] [--port n] [target]
  harness dashboard [--out file.html] [--out-dir folder] [--workbench] [--host 127.0.0.1] [--port n] [target]
  harness init [--dry-run] [--locale zh-CN|en-US] [--capabilities core,dashboard] [--add-npm-scripts] [target]
  harness add-capability <name> [--dry-run] [--locale zh-CN|en-US] [target]
  harness migrate-plan [--json] [--limit n] [target]
  harness migrate-run [--locale zh-CN|en-US] [--assume-locale] [--allow-dirty] [--plan-only] [--out-dir folder] [--session-dir folder] [target]
  harness migrate-verify [--json] [--full-cutover] <session.json>
  harness governance rebuild [--dry-run] [--archive] [--apply] [target]
  harness preset list [--json]
  harness preset inspect <id> [--json]
  harness preset check <id> [--json]
  harness preset install <path-or-builtin-id> [--force] [--json]
  harness preset uninstall <id> [--json]
  harness new-task <task-id> [--module key] [--budget simple|standard|complex] [--preset id] [--from-session session.json] [--long-running] [--title title] [--locale zh-CN|en-US] [--dry-run] [target]
  harness task-start <task-id> [--message text] [target]
  harness task-phase <task-id> <phase-id> [--state done] [--completion 100] [--evidence present] [target]
  harness task-log <task-id> --message text [--evidence type:PATH:summary] [target]
  harness task-block <task-id> [--message text] [target]
  harness task-review <task-id> [--message text] [target]
  harness review-confirm <task-id> --confirm task-id [--reviewer name] [--message text] [target]
  harness lesson-promote <task-id> <candidate-id> [--dry-run|--apply] [target]
  harness lesson-sediment <task-id> <candidate-id> [--dry-run] [--title title] [target]
  harness task-complete <task-id> [--message text] [target]
  harness task-list [--json] [--state state] [--module key] [--queue queue] [--preset id] [--review status] [--lesson status] [--missing-materials] [--search text] [target]
  harness task-index [--json] [target]
  harness task-supersede <old-task-id> --by <new-task-id> [--reason text] [target]
  harness task-delete <task-id> --soft [--reason text] [target]
  harness task-archive <task-id> [--reason text] [target]
  harness task-reopen <task-id> [--reason text] [target]
  harness module-step <module-key> <step-id> [--state done|in-progress|blocked] [target]
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
    const boundary = validateSourcePackageBoundary(target);
    failures.push(...boundary.failures);
    warnings.push(...boundary.warnings);
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
  process.exitCode = status.checkState.status === "fail" ? 1 : 0;
} else if (command === "dev") {
  const open = !takeFlag("--no-open");
  const outDir = takeOption("--out-dir", "");
  const host = takeOption("--host", "127.0.0.1");
  const port = takeOption("--port", "0");
  const localeOverride = takeOption("--locale", "");
  const target = targetArg();
  const usesDefaultOutDir = !outDir;
  const dashboardOutDir = outDir || defaultDevOutDir(target);
  const opts = { ...(localeOverride ? { localeOverride } : {}), recoverGeneratedDashboard: usesDefaultOutDir };
  try {
    await serveDashboardWorkbench(dashboardOutDir, target, { ...opts, host, port, autoRefresh: true, open, label: "harness dev" });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "dashboard") {
  await runDashboardCommand({ takeFlag, takeOption, targetArg });
} else if (command === "init") {
  const dryRun = takeFlag("--dry-run");
  const addNpmScripts = takeFlag("--add-npm-scripts");
  const locale = await resolveInitLocale(takeOption("--locale", ""));
  const capabilities = takeOption("--capabilities", "core").split(",").map((item) => item.trim()).filter(Boolean);
  try {
    const result = writeInitFiles(targetArg(), capabilities, { dryRun, locale, addNpmScripts });
    console.log(JSON.stringify({ dryRun, locale: result.locale, capabilities: result.capabilities, changes: result.changes, nextCommands: result.nextCommands, report: result.report }, null, 2));
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
} else if (["migrate-plan", "migrate-run", "migrate-verify"].includes(command)) {
  runMigrationCommand(command, { args, takeFlag, takeOption, targetArg });
} else if (command === "governance") {
  const subcommand = args.shift() || "";
  if (subcommand !== "rebuild") {
    console.error(`Unknown governance subcommand: ${subcommand || "(missing)"}`);
    process.exit(2);
  }
  const dryRun = takeFlag("--dry-run");
  const archive = takeFlag("--archive");
  const apply = takeFlag("--apply");
  try {
    console.log(JSON.stringify(rebuildGovernanceIndexes(targetArg(), { dryRun, archive, apply }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "preset") {
  runPresetCommand({ args, takeFlag });
} else if (["new-task", "task-phase", "task-start", "task-log", "task-block", "task-review", "task-complete", "review-confirm", "lesson-promote", "lesson-sediment", "task-list", "task-index", "task-supersede", "task-delete", "task-archive", "task-reopen", "module-step"].includes(command)) {
  runTaskCommand(command, { args, takeFlag, takeOption, targetArg });
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

function defaultDevOutDir(targetInput) {
  const target = path.resolve(targetInput || ".");
  const name = path.basename(target) || "project";
  const hash = Buffer.from(target).toString("hex").slice(0, 16);
  return path.join(os.tmpdir(), "coding-agent-harness-dev", `${name}-${hash}`);
}
