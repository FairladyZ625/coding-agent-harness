#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  addCapability,
  auditTemplateProjections,
  buildStatus,
  doctorUserSkill,
  installUserSkill,
  normalizeLocale,
  refreshTemplateProjections,
  rebuildGovernanceIndexes,
  validateSourcePackageBoundary,
  writeInitFiles,
} from "./lib/harness-core.mjs";
import { runDashboardCommand, runDevDashboardCommand } from "./commands/dashboard-command.mjs";
import { runMigrationCommand } from "./commands/migration-command.mjs";
import { runModuleCommand } from "./commands/module-command.mjs";
import { runPresetCommand } from "./commands/preset-command.mjs";
import { runTaskCommand } from "./commands/task-command.mjs";

const args = process.argv.slice(2);
const command = args.shift() || "help";

type HarnessReport = { failures?: readonly string[]; warnings?: readonly string[] };

function takeFlag(name: string, fallback = false): boolean {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  args.splice(index, 1);
  return true;
}

function takeOption(name: string, fallback = ""): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1] || fallback;
  args.splice(index, 2);
  return value;
}

async function resolveInitLocale(requestedLocale: string): Promise<string> {
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

function targetArg(): string {
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
  harness migrate-structure [--plan|--apply] [--force] [--json] [target]
  harness migrate-task-audit-index [--plan] [--apply] [--json] [target]
  harness migrate-run [--locale zh-CN|en-US] [--assume-locale] [--allow-dirty] [--plan-only] [--out-dir folder] [--session-dir folder] [target]
  harness migrate-verify [--json] [--full-cutover] <session.json>
  harness governance rebuild [--dry-run] [--archive] [--apply] [target]
  harness preset list [--json] [target]
  harness preset inspect <id> [--json] [target]
  harness preset check <id> [--json] [target]
  harness preset install <folder|zip|builtin-id> [--project] [--force] [--allow-scripts] [--json] [target]
  harness preset seed [--project] [--force] [--dry-run] [--json] [target]
  harness preset audit [--project] [--json] [target]
  harness preset uninstall <id> [--project] [--json] [target]
  harness preset run <id> <plan|scaffold|check> --task <task-id> [--json] [target]
  harness preset action <id> <action> --task <task-id> [--allow-scripts] [--json] [action flags...] [target]
  harness templates audit [--json] [target]
  harness templates refresh [--apply] [--json] [target]
  harness module list [--json] [target]
  harness module inspect <key> [target]
  harness module register <key> --title title --prefix PREFIX --scope path [--status state] [--branch branch] [--owner owner] [--current-step step] [--shared path] [--depends-on key] [--locale zh-CN|en-US] [--dry-run] [target]
  harness module scaffold <key|--all> [--locale zh-CN|en-US] [--dry-run] [target]
  harness module unregister <key> [--dry-run] [target]
  harness new-task [task-id] [--module key] [--register-module --module-title title --module-prefix PREFIX --module-scope path] [--budget simple|standard|complex] [--preset id] [--from-session session.json] [--long-running] [--title title] [--locale zh-CN|en-US] [--dry-run] [target]
  harness task-start <task-id> [--message text] [target]
  harness task-phase <task-id> <phase-id> [--state done] [--completion 100] [--evidence present] [target]
  harness task-log <task-id> --message text [--evidence type:PATH:summary] [target]
  harness task-block <task-id> [--message text] [target]
  harness task-review <task-id> [--message text] [target]
  harness review-confirm <task-id> --confirm task-id [--reviewer name] [--message text] [target]  # human-only; denied in detected agent runtimes
  harness lesson-promote <task-id> <candidate-id> [--dry-run|--apply] [target]
  harness lesson-sediment <task-id> <candidate-id> [--dry-run] [--title title] [target]
  harness task-complete <task-id> [--message text] [target]
  harness task-list [--json] [--state state] [--module key] [--queue queue] [--preset id] [--review status] [--lesson status] [--missing-materials] [--include-archived] [--search text] [target]
  harness task-index [--json] [target]
  harness task-supersede <old-task-id> --by <new-task-id> [--reason text] [target]
  harness task-delete <task-id> --soft [--reason text] [target]
  harness task-archive <task-id> --archived-by name-or-email [--reason text] [--archive-field key=value] [target]
  harness task-reopen <task-id> [--reason text] [target]
  harness module-step <module-key> <step-id> [--state done|in-progress|blocked] [target]
  harness install-user [--agent codex|claude|gemini|openclaw|agents|all] [--home dir] [--dry-run] [--force] [--skip-presets] [--yes]
  harness doctor-user [--agent codex|claude|gemini|openclaw|agents|all] [--home dir]

If init runs in an interactive terminal and --locale is omitted, it asks for a
language. Non-interactive init defaults to en-US.

Preset discovery:
  Project presets live in <target>/.coding-agent-harness/presets/<preset-id>/.
  User presets live in ~/.coding-agent-harness/presets/<preset-id>/.
  Harness discovers project presets first when a target is supplied, then user
  presets, then bundled package presets under presets/<preset-id>/.
  "harness init" seeds bundled presets into the target project. "harness
  install-user" and npm postinstall seed bundled presets into the user root.
  Use "harness preset seed" to repair or re-run preset seeding.
  Use "harness preset install" with a local preset folder, .zip archive, or
  bundled preset id. Preset archives must contain preset.yaml at the archive
  root or inside one top-level folder.
  Use "harness preset list --json" to see available presets, their source,
  purpose, compatible budgets, and manifest path. Use "harness preset inspect
  <id> --json" for the full preset manifest summary.
`);
}

function exitWithReport(report: HarnessReport): void {
  for (const warning of report.warnings || []) console.log(`Warning: ${warning}`);
  for (const failure of report.failures || []) console.error(`Failure: ${failure}`);
  process.exit((report.failures || []).length > 0 ? 1 : 0);
}

if (command === "help" || command === "--help" || command === "-h") {
  printHelp();
} else if (args[0] === "help" || args.includes("--help") || args.includes("-h")) {
  printHelp();
} else if (command === "check") {
  const profile = takeOption("--profile", "target-project");
  const strict = takeFlag("--strict");
  const target = targetArg();
  const failures = [];
  const warnings = [];

  if (profile === "source-package") {
    for (const required of ["package.json", "dist/harness.mjs", "dist/check-harness.mjs", "templates/planning/task_plan.md"]) {
      if (!fs.existsSync(path.resolve(target, required))) failures.push(`missing source package file: ${required}`);
    }
    const boundary = validateSourcePackageBoundary(target);
    failures.push(...boundary.failures);
    warnings.push(...boundary.warnings);
  }

  const status = buildStatus(target, { skipLegacyCheck: profile === "source-package", strictLegacy: strict, strict, allowLegacyTarget: profile === "source-package" });
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
  await runDevDashboardCommand({ takeFlag, takeOption, targetArg });
} else if (command === "dashboard") {
  await runDashboardCommand({ takeFlag, takeOption, targetArg });
} else if (command === "init") {
  const dryRun = takeFlag("--dry-run");
  const addNpmScripts = takeFlag("--add-npm-scripts");
  const locale = await resolveInitLocale(takeOption("--locale", ""));
  const capabilities = takeOption("--capabilities", "core").split(",").map((item) => item.trim()).filter(Boolean);
  try {
    const result = writeInitFiles(targetArg(), capabilities, { dryRun, locale, addNpmScripts });
    console.log(JSON.stringify({ dryRun, locale: result.locale, capabilities: result.capabilities, changes: result.changes, presetSeed: result.presetSeed, nextCommands: result.nextCommands, report: result.report }, null, 2));
  } catch (error) {
    console.error(errorMessage(error));
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
    console.error(errorMessage(error));
    process.exit(1);
  }
} else if (["migrate-plan", "migrate-structure", "migrate-run", "migrate-verify", "migrate-task-audit-index"].includes(command)) {
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
    console.error(errorMessage(error));
    process.exit(1);
  }
} else if (command === "preset") {
  runPresetCommand({ args, takeFlag, targetArg });
} else if (command === "module") {
  runModuleCommand({ args, takeFlag, takeOption, targetArg });
} else if (command === "templates") {
  const subcommand = args.shift() || "audit";
  const json = takeFlag("--json");
  const apply = takeFlag("--apply");
  try {
    if (subcommand === "audit") {
      const result = auditTemplateProjections(targetArg());
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Template projection audit: ${result.summary.refreshable} refreshable, ${result.summary.reportOnly} report-only`);
    } else if (subcommand === "refresh") {
      const result = refreshTemplateProjections(targetArg(), { apply });
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Template projection refresh ${result.dryRun ? "dry-run" : "applied"}: ${result.changes.length} changes`);
    } else {
      throw new Error(`Unknown templates subcommand: ${subcommand}`);
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
} else if (["new-task", "task-phase", "task-start", "task-log", "task-block", "task-review", "task-complete", "review-confirm", "lesson-promote", "lesson-sediment", "task-list", "task-index", "task-supersede", "task-delete", "task-archive", "task-reopen", "module-step"].includes(command)) {
  runTaskCommand(command, { args, takeFlag, takeOption, targetArg });
} else if (command === "install-user") {
  const dryRun = takeFlag("--dry-run");
  const force = takeFlag("--force");
  const yes = takeFlag("--yes") || takeFlag("-y");
  const skipPresets = takeFlag("--skip-presets");
  takeFlag("--global");
  const agent = takeOption("--agent", "codex");
  const home = takeOption("--home", "");
  if (!(await confirmUserInstall({ yes, dryRun, agent }))) {
    console.error("Refusing to write user skill files without confirmation. Re-run with --yes or --dry-run.");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(installUserSkill({ agent, home, dryRun, force, seedPresets: !skipPresets }), null, 2));
  } catch (error) {
    console.error(errorMessage(error));
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
    console.error(errorMessage(error));
    process.exit(1);
  }
} else {
  printHelp();
  process.exit(2);
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
