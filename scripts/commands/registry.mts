import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  addCapability,
  auditTemplateProjections,
  buildStatus,
  normalizeLocale,
  refreshTemplateProjections,
  rebuildGovernanceIndexes,
  validateSourcePackageBoundary,
  writeInitFiles,
} from "../lib/harness-core.mjs";
import { doctorUserSkill, installUserSkill } from "../lib/capability-distribution.mjs";
import type { CommandContext, CommandDefinition, FlagDefinition } from "../lib/command-registry.mjs";
import { createArgReaders } from "../lib/command-registry.mjs";
import { runDashboardCommand, runDevDashboardCommand } from "./dashboard-command.mjs";
import { runMigrationCommand } from "./migration-command.mjs";
import { runModuleCommand } from "./module-command.mjs";
import { runPresetCommand } from "./preset-command.mjs";
import { runTaskCommand } from "./task-command.mjs";

type HarnessReport = { failures?: readonly string[]; warnings?: readonly string[] };

const jsonFlag = flag("--json", "Print JSON output");
const dryRunFlag = flag("--dry-run", "Plan changes without writing files");
const localeFlag = option("--locale", "Override output locale");
const applyFlag = flag("--apply", "Apply the planned change");
const projectFlag = flag("--project", "Use project preset scope");

export const commandRegistry: CommandDefinition[] = [
  {
    name: "check",
    description: "Validate harness structure and configuration",
    usage: "harness check [--profile source-package|private-harness|target-project] [target]",
    flags: [option("--profile", "Check profile", "target-project"), flag("--strict", "Enable strict validation")],
    handler: runCheck,
  },
  {
    name: "status",
    description: "Print harness status",
    usage: "harness status [--json] [--strict] [target]",
    flags: [jsonFlag, flag("--strict", "Enable strict validation")],
    handler: runStatus,
  },
  {
    name: "dev",
    description: "Serve the dashboard workbench",
    usage: "harness dev [--no-open] [--out-dir folder] [--host 127.0.0.1] [--port n] [target]",
    flags: [flag("--no-open", "Do not open the browser"), option("--out-dir", "Dashboard output folder"), option("--host", "Workbench host"), option("--port", "Workbench port")],
    handler: legacyDashboardHandler(runDevDashboardCommand),
  },
  {
    name: "dashboard",
    description: "Write or serve a dashboard",
    usage: "harness dashboard [--out file.html] [--out-dir folder] [--workbench] [--host 127.0.0.1] [--port n] [target]",
    flags: [option("--out", "Single-file dashboard output"), option("--out-dir", "Dashboard folder output"), flag("--workbench", "Serve editable workbench"), option("--host", "Workbench host"), option("--port", "Workbench port")],
    handler: legacyDashboardHandler(runDashboardCommand),
  },
  {
    name: "init",
    description: "Initialize harness files",
    usage: "harness init [--dry-run] [--locale zh-CN|en-US] [--capabilities core,dashboard] [--add-npm-scripts] [target]",
    flags: [dryRunFlag, localeFlag, option("--capabilities", "Comma-separated capabilities"), flag("--add-npm-scripts", "Add package scripts")],
    handler: runInit,
  },
  {
    name: "add-capability",
    description: "Add a harness capability",
    usage: "harness add-capability <name> [--dry-run] [--locale zh-CN|en-US] [target]",
    positionals: ["name"],
    flags: [dryRunFlag, localeFlag],
    handler: runAddCapability,
  },
  ...migrationCommands(),
  {
    name: "governance",
    description: "Run governance subcommands",
    usage: "harness governance rebuild [--dry-run] [--archive] [--apply] [target]",
    flags: [dryRunFlag, flag("--archive", "Archive generated governance outputs"), applyFlag],
    handler: runGovernanceUnknown,
  },
  {
    name: "governance rebuild",
    description: "Rebuild governance indexes",
    usage: "harness governance rebuild [--dry-run] [--archive] [--apply] [target]",
    flags: [dryRunFlag, flag("--archive", "Archive generated governance outputs"), applyFlag],
    handler: runGovernanceRebuild,
  },
  ...presetCommands(),
  {
    name: "templates",
    description: "Audit template projections",
    usage: "harness templates audit [--json] [target]",
    flags: [jsonFlag],
    handler: legacyTemplatesHandler("audit"),
  },
  {
    name: "templates audit",
    description: "Audit template projections",
    usage: "harness templates audit [--json] [target]",
    flags: [jsonFlag],
    handler: legacyTemplatesHandler("audit"),
  },
  {
    name: "templates refresh",
    description: "Refresh template projections",
    usage: "harness templates refresh [--apply] [--json] [target]",
    flags: [applyFlag, jsonFlag],
    handler: legacyTemplatesHandler("refresh"),
  },
  ...moduleCommands(),
  ...taskCommands(),
  {
    name: "install-user",
    description: "Install user-level skill files",
    usage: "harness install-user [--agent codex|claude|gemini|openclaw|agents|all] [--home dir] [--dry-run] [--force] [--skip-presets] [--yes]",
    hasTarget: false,
    flags: [option("--agent", "Target agent"), option("--home", "User home override"), dryRunFlag, flag("--force", "Overwrite existing files"), flag("--skip-presets", "Skip preset seeding"), { name: "--yes", alias: "-y", type: "boolean", description: "Confirm writes without prompting", default: false }],
    handler: runInstallUser,
  },
  {
    name: "doctor-user",
    description: "Diagnose user-level skill files",
    usage: "harness doctor-user [--agent codex|claude|gemini|openclaw|agents|all] [--home dir]",
    hasTarget: false,
    flags: [option("--agent", "Target agent"), option("--home", "User home override")],
    handler: runDoctorUser,
  },
];

function migrationCommands(): CommandDefinition[] {
  return [
    {
      name: "migrate-plan",
      description: "Build a migration plan",
      usage: "harness migrate-plan [--json] [--limit n] [target]",
      flags: [jsonFlag, option("--limit", "Maximum task actions")],
      handler: legacyMigrationHandler("migrate-plan"),
    },
    {
      name: "migrate-structure",
      description: "Plan or apply v2 structure migration",
      usage: "harness migrate-structure [--plan|--apply] [--force] [--json] [target]",
      flags: [flag("--plan", "Print migration plan"), applyFlag, flag("--force", "Force migration"), jsonFlag],
      handler: legacyMigrationHandler("migrate-structure"),
    },
    {
      name: "migrate-task-audit-index",
      description: "Plan or apply task audit index migration",
      usage: "harness migrate-task-audit-index [--plan] [--apply] [--json] [target]",
      flags: [flag("--plan", "Print migration plan"), applyFlag, jsonFlag],
      handler: legacyMigrationHandler("migrate-task-audit-index"),
    },
    {
      name: "migrate-run",
      description: "Run migration workflow",
      usage: "harness migrate-run [--locale zh-CN|en-US] [--assume-locale] [--allow-dirty] [--plan-only] [--out-dir folder] [--session-dir folder] [target]",
      flags: [localeFlag, flag("--assume-locale", "Use detected locale without prompting"), flag("--allow-dirty", "Allow dirty worktree"), flag("--plan-only", "Plan without applying"), option("--out-dir", "Output folder"), option("--session-dir", "Session folder")],
      handler: legacyMigrationHandler("migrate-run"),
    },
    {
      name: "migrate-verify",
      description: "Verify a migration session",
      usage: "harness migrate-verify [--json] [--full-cutover] <session.json>",
      hasTarget: false,
      positionals: ["session.json"],
      flags: [jsonFlag, flag("--full-cutover", "Require full cutover eligibility")],
      handler: legacyMigrationHandler("migrate-verify"),
    },
  ];
}

function presetCommands(): CommandDefinition[] {
  return [
    { name: "preset", description: "List presets", usage: "harness preset list [--json] [target]", flags: [jsonFlag], handler: legacyPresetHandler() },
    { name: "preset list", description: "List presets", usage: "harness preset list [--json] [target]", flags: [jsonFlag], handler: legacyPresetHandler("list") },
    { name: "preset inspect", description: "Inspect a preset", usage: "harness preset inspect <id> [--json] [target]", positionals: ["id"], flags: [jsonFlag], handler: legacyPresetHandler("inspect") },
    { name: "preset check", description: "Check a preset", usage: "harness preset check <id> [--json] [target]", positionals: ["id"], flags: [jsonFlag], handler: legacyPresetHandler("check") },
    {
      name: "preset install",
      description: "Install a preset package",
      usage: "harness preset install <folder|zip|builtin-id> [--project] [--force] [--allow-scripts] [--json] [target]",
      positionals: ["folder|zip|builtin-id"],
      flags: [projectFlag, flag("--force", "Overwrite existing preset"), flag("--allow-scripts", "Allow trusted preset scripts"), jsonFlag],
      handler: legacyPresetHandler("install"),
    },
    {
      name: "preset seed",
      description: "Seed bundled presets",
      usage: "harness preset seed [--project] [--force] [--dry-run] [--json] [target]",
      flags: [projectFlag, flag("--force", "Overwrite existing presets"), dryRunFlag, jsonFlag],
      handler: legacyPresetHandler("seed"),
    },
    { name: "preset audit", description: "Audit bundled preset drift", usage: "harness preset audit [--project] [--json] [target]", flags: [projectFlag, jsonFlag], handler: legacyPresetHandler("audit") },
    { name: "preset uninstall", description: "Uninstall a preset", usage: "harness preset uninstall <id> [--project] [--json] [target]", positionals: ["id"], flags: [projectFlag, jsonFlag], handler: legacyPresetHandler("uninstall") },
    {
      name: "preset run",
      description: "Run a preset entrypoint",
      usage: "harness preset run <id> <plan|scaffold|check> --task <task-id> [--use-current-preset --reason text] [--json] [target]",
      positionals: ["id", "plan|scaffold|check"],
      flags: [option("--task", "Task id"), flag("--use-current-preset", "Use preset recorded on task"), option("--reason", "Reason for preset override"), jsonFlag],
      handler: legacyPresetHandler("run"),
    },
    {
      name: "preset action",
      description: "Run a preset action",
      usage: "harness preset action <id> <action> --task <task-id> [--allow-scripts] [--use-current-preset --reason text] [--json] [action flags...] [target]",
      positionals: ["id", "action"],
      flags: [option("--task", "Task id"), flag("--allow-scripts", "Allow trusted preset scripts"), flag("--use-current-preset", "Use preset recorded on task"), option("--reason", "Reason for preset override"), jsonFlag],
      handler: legacyPresetHandler("action"),
    },
  ];
}

function moduleCommands(): CommandDefinition[] {
  return [
    { name: "module", description: "List modules", usage: "harness module list [--json] [target]", flags: [jsonFlag], handler: legacyModuleHandler() },
    { name: "module list", description: "List modules", usage: "harness module list [--json] [target]", flags: [jsonFlag], handler: legacyModuleHandler("list") },
    { name: "module inspect", description: "Inspect a module", usage: "harness module inspect <key> [target]", positionals: ["key"], handler: legacyModuleHandler("inspect") },
    {
      name: "module register",
      description: "Register a module",
      usage: "harness module register <key> --title title --prefix PREFIX --scope path [--status state] [--branch branch] [--owner owner] [--current-step step] [--shared path] [--depends-on key] [--locale zh-CN|en-US] [--dry-run] [target]",
      positionals: ["key"],
      flags: [option("--title", "Module title"), option("--prefix", "Module prefix"), repeated("--scope", "Owned path"), option("--status", "Module status"), option("--branch", "Module branch"), option("--owner", "Module owner"), option("--current-step", "Current step"), repeated("--shared", "Shared path"), repeated("--depends-on", "Dependency module key"), localeFlag, dryRunFlag],
      handler: legacyModuleHandler("register"),
    },
    { name: "module scaffold", description: "Scaffold module docs", usage: "harness module scaffold <key|--all> [--locale zh-CN|en-US] [--dry-run] [target]", positionals: ["key|--all"], flags: [flag("--all", "Scaffold all modules"), localeFlag, dryRunFlag], handler: legacyModuleHandler("scaffold") },
    { name: "module unregister", description: "Unregister a module", usage: "harness module unregister <key> [--dry-run] [target]", positionals: ["key"], flags: [dryRunFlag], handler: legacyModuleHandler("unregister") },
  ];
}

function taskCommands(): CommandDefinition[] {
  const lifecycleFlags = [option("--message", "Lifecycle message")];
  return [
    {
      name: "new-task",
      description: "Create a task package",
      usage: "harness new-task [task-id] [--module key] [--register-module --module-title title --module-prefix PREFIX --module-scope path] [--budget simple|standard|complex] [--preset id] [--from-session session.json] [--long-running] [--title title] [--locale zh-CN|en-US] [--dry-run] [target]",
      flags: [option("--module", "Module key"), flag("--register-module", "Register missing module"), option("--module-title", "New module title"), option("--module-prefix", "New module prefix"), repeated("--module-scope", "New module scope"), option("--budget", "Task budget"), option("--preset", "Task preset"), option("--from-session", "Session JSON path"), flag("--long-running", "Create long-running task contract"), option("--title", "Task title"), localeFlag, dryRunFlag],
      handler: legacyTaskHandler("new-task"),
    },
    {
      name: "new-task-batch",
      description: "Create multiple task packages in one commit",
      usage: "harness new-task-batch --task-list file [--module key] [--budget simple|standard|complex] [--title fallback-title] [--locale zh-CN|en-US] [--dry-run] [target]",
      flags: [option("--task-list", "JSON task list"), option("--module", "Module key"), option("--budget", "Task budget"), option("--title", "Fallback task title"), localeFlag, dryRunFlag],
      handler: legacyTaskHandler("new-task-batch"),
    },
    { name: "task-start", description: "Mark task started", usage: "harness task-start <task-id> [--message text] [target]", positionals: ["task-id"], flags: lifecycleFlags, handler: legacyTaskHandler("task-start") },
    { name: "task-phase", description: "Update a task phase", usage: "harness task-phase <task-id> <phase-id> [--state done] [--completion 100] [--evidence present] [target]", positionals: ["task-id", "phase-id"], flags: [option("--state", "Phase state"), option("--completion", "Completion percentage"), option("--evidence", "Evidence status")], handler: legacyTaskHandler("task-phase") },
    { name: "task-log", description: "Append task progress log", usage: "harness task-log <task-id> --message text [--evidence type:PATH:summary] [target]", positionals: ["task-id"], flags: [option("--message", "Progress message"), option("--evidence", "Evidence reference")], handler: legacyTaskHandler("task-log") },
    { name: "task-block", description: "Mark task blocked", usage: "harness task-block <task-id> [--message text] [target]", positionals: ["task-id"], flags: lifecycleFlags, handler: legacyTaskHandler("task-block") },
    { name: "task-review", description: "Move task to review", usage: "harness task-review <task-id> [--message text] [target]", positionals: ["task-id"], flags: lifecycleFlags, handler: legacyTaskHandler("task-review") },
    { name: "task-complete", description: "Complete a task", usage: "harness task-complete <task-id> [--message text] [target]", positionals: ["task-id"], flags: lifecycleFlags, handler: legacyTaskHandler("task-complete") },
    { name: "lesson-promote", description: "Promote a lesson candidate", usage: "harness lesson-promote <task-id> <candidate-id> [--dry-run|--apply] [target]", positionals: ["task-id", "candidate-id"], flags: [dryRunFlag, applyFlag], handler: legacyTaskHandler("lesson-promote") },
    { name: "lesson-sediment", description: "Create a lesson sedimentation task", usage: "harness lesson-sediment <task-id> <candidate-id> [--dry-run] [--title title] [target]", positionals: ["task-id", "candidate-id"], flags: [dryRunFlag, option("--title", "Lesson title")], handler: legacyTaskHandler("lesson-sediment") },
    { name: "task-list", description: "List tasks", usage: "harness task-list [--json] [--task-kernel|--compare-task-kernel] [--state state] [--module key] [--queue queue] [--preset id] [--review status] [--lesson status] [--missing-materials] [--include-archived] [--search text] [target]", flags: [jsonFlag, flag("--task-kernel", "Use Task Kernel query adapter"), flag("--compare-task-kernel", "Compare legacy and Task Kernel output"), option("--state", "Filter state"), option("--module", "Filter module"), option("--queue", "Filter queue"), option("--preset", "Filter preset"), option("--review", "Filter review status"), option("--lesson", "Filter lesson status"), flag("--missing-materials", "Only tasks missing materials"), flag("--include-archived", "Include archived tasks"), option("--search", "Search text")], handler: legacyTaskHandler("task-list") },
    { name: "task-index", description: "Build task index", usage: "harness task-index [--json] [target]", flags: [jsonFlag], handler: legacyTaskHandler("task-index") },
    { name: "task-supersede", description: "Supersede a task", usage: "harness task-supersede <old-task-id> --by <new-task-id> [--reason text] [--deleted-by name-or-email] [--confirm task-id] [--allow-open-findings] [target]", positionals: ["old-task-id"], flags: [option("--by", "Replacement task id"), option("--reason", "Supersede reason"), option("--deleted-by", "Actor"), option("--confirm", "Confirmation task id"), flag("--allow-open-findings", "Allow open findings")], handler: legacyTaskHandler("task-supersede") },
    { name: "task-delete", description: "Delete a task", usage: "harness task-delete <task-id> [--soft|--hard] [--confirm canonical-id] [--deleted-by name-or-email] [--reason text] [target]", positionals: ["task-id"], flags: [flag("--soft", "Soft delete"), flag("--hard", "Hard delete"), option("--confirm", "Confirmation id"), option("--deleted-by", "Actor"), option("--reason", "Delete reason")], handler: legacyTaskHandler("task-delete") },
    { name: "task-archive", description: "Archive a task", usage: "harness task-archive <task-id> --archived-by name-or-email [--reason text] [--archive-field key=value] [target]", positionals: ["task-id"], flags: [option("--archived-by", "Actor"), option("--reason", "Archive reason"), repeated("--archive-field", "Archive metadata field")], handler: legacyTaskHandler("task-archive") },
    { name: "task-archive-batch", description: "Archive tasks from a release task-list in one commit", usage: "harness task-archive-batch --release version --task-list file --archived-by name-or-email [--reason text] [--archive-field key=value] [target]", flags: [option("--release", "Release version"), option("--task-list", "Release closeout task-list JSON"), option("--archived-by", "Actor"), option("--reason", "Archive reason"), repeated("--archive-field", "Archive metadata field")], handler: legacyTaskHandler("task-archive-batch") },
    { name: "task-reopen", description: "Reopen a task", usage: "harness task-reopen <task-id> [--reason text] [target]", positionals: ["task-id"], flags: [option("--reason", "Reopen reason")], handler: legacyTaskHandler("task-reopen") },
    { name: "module-step", description: "Update a module step", usage: "harness module-step <module-key> <step-id> [--state done|in-progress|blocked] [target]", positionals: ["module-key", "step-id"], flags: [option("--state", "Step state")], handler: legacyTaskHandler("module-step") },
  ];
}

function runCheck(ctx: CommandContext): void {
  const profile = ctx.takeOption("--profile", "target-project");
  const strict = ctx.takeFlag("--strict");
  const target = ctx.targetArg();
  const failures: string[] = [];
  const warnings: string[] = [];

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
}

function runStatus(ctx: CommandContext): void {
  const json = ctx.takeFlag("--json");
  const strict = ctx.takeFlag("--strict");
  const status = buildStatus(ctx.targetArg(), { strictLegacy: strict, strict });
  if (json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log(`${status.project.name}: ${status.checkState.status} (${status.checkState.failures} failures, ${status.checkState.warnings} warnings)`);
    console.log(`mode: ${status.mode}`);
    console.log(`capabilities: ${status.capabilities.map((capability) => `${capability.name}:${capability.state}`).join(", ")}`);
    console.log(`tasks: ${status.tasks.length}`);
  }
  process.exitCode = status.checkState.status === "fail" ? 1 : 0;
}

async function runInit(ctx: CommandContext): Promise<void> {
  const dryRun = ctx.takeFlag("--dry-run");
  const addNpmScripts = ctx.takeFlag("--add-npm-scripts");
  const locale = await resolveInitLocale(ctx.takeOption("--locale", ""));
  const capabilities = ctx.takeOption("--capabilities", "core").split(",").map((item) => item.trim()).filter(Boolean);
  try {
    const result = writeInitFiles(ctx.targetArg(), capabilities, { dryRun, locale, addNpmScripts });
    console.log(JSON.stringify({ dryRun, locale: result.locale, capabilities: result.capabilities, changes: result.changes, presetSeed: result.presetSeed, nextCommands: result.nextCommands, report: result.report }, null, 2));
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

function runAddCapability(ctx: CommandContext): void {
  const args = [...ctx.raw];
  const readers = createArgReaders(args);
  const dryRun = readers.takeFlag("--dry-run");
  const locale = normalizeLocale(readers.takeOption("--locale", ""));
  const capability = args.shift();
  if (!capability) {
    console.error("Missing capability name");
    process.exit(2);
  }
  try {
    const result = addCapability(readers.targetArg(), capability, { dryRun, locale });
    console.log(JSON.stringify({ dryRun, registry: result.registry, changes: result.changes, report: result.report }, null, 2));
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

function runGovernanceUnknown(ctx: CommandContext): void {
  const subcommand = ctx.raw[0] || "";
  console.error(`Unknown governance subcommand: ${subcommand || "(missing)"}`);
  process.exit(2);
}

function runGovernanceRebuild(ctx: CommandContext): void {
  const dryRun = ctx.takeFlag("--dry-run");
  const archive = ctx.takeFlag("--archive");
  const apply = ctx.takeFlag("--apply");
  try {
    console.log(JSON.stringify(rebuildGovernanceIndexes(ctx.targetArg(), { dryRun, archive, apply }), null, 2));
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

function legacyTemplatesHandler(subcommand: "audit" | "refresh"): (ctx: CommandContext) => void {
  return (ctx) => {
    const args = ctx.definition.name === "templates" ? [...ctx.raw] : [subcommand, ...ctx.raw];
    const readers = createArgReaders(args);
    const actualSubcommand = args.shift() || "audit";
    const json = readers.takeFlag("--json");
    const apply = readers.takeFlag("--apply");
    try {
      if (actualSubcommand === "audit") {
        const result = auditTemplateProjections(readers.targetArg());
        if (json) console.log(JSON.stringify(result, null, 2));
        else console.log(`Template projection audit: ${result.summary.refreshable} refreshable, ${result.summary.reportOnly} report-only`);
      } else if (actualSubcommand === "refresh") {
        const result = refreshTemplateProjections(readers.targetArg(), { apply });
        if (json) console.log(JSON.stringify(result, null, 2));
        else console.log(`Template projection refresh ${result.dryRun ? "dry-run" : "applied"}: ${result.changes.length} changes`);
      } else {
        throw new Error(`Unknown templates subcommand: ${actualSubcommand}`);
      }
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
  };
}

function legacyMigrationHandler(command: string): (ctx: CommandContext) => void {
  return (ctx) => {
    const args = [...ctx.raw];
    runMigrationCommand(command, { args, ...createArgReaders(args) });
  };
}

function legacyPresetHandler(subcommand?: string): (ctx: CommandContext) => Promise<void> {
  return (ctx) => {
    const args = subcommand ? [subcommand, ...ctx.raw] : [...ctx.raw];
    return runPresetCommand({ args, ...createArgReaders(args) });
  };
}

function legacyModuleHandler(subcommand?: string): (ctx: CommandContext) => void {
  return (ctx) => {
    const args = subcommand ? [subcommand, ...ctx.raw] : [...ctx.raw];
    runModuleCommand({ args, ...createArgReaders(args) });
  };
}

function legacyTaskHandler(command: string): (ctx: CommandContext) => Promise<void> {
  return (ctx) => {
    const args = [...ctx.raw];
    return runTaskCommand(command, { args, ...createArgReaders(args) });
  };
}

function legacyDashboardHandler(
  handler: (ctx: { takeFlag: (name: string, fallback?: boolean) => boolean; takeOption: (name: string, fallback?: string) => string; targetArg: () => string }) => void | Promise<void>,
): (ctx: CommandContext) => void | Promise<void> {
  return (ctx) => {
    const args = [...ctx.raw];
    return handler(createArgReaders(args));
  };
}

async function runInstallUser(ctx: CommandContext): Promise<void> {
  const dryRun = ctx.takeFlag("--dry-run");
  const force = ctx.takeFlag("--force");
  const yes = ctx.takeFlag("--yes") || ctx.takeFlag("-y");
  const skipPresets = ctx.takeFlag("--skip-presets");
  ctx.takeFlag("--global");
  const agent = ctx.takeOption("--agent", "codex");
  const home = ctx.takeOption("--home", "");
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
}

function runDoctorUser(ctx: CommandContext): void {
  const agent = ctx.takeOption("--agent", "codex");
  const home = ctx.takeOption("--home", "");
  try {
    const report = doctorUserSkill({ agent, home });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.status === "pass" ? 0 : 1);
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
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

function exitWithReport(report: HarnessReport): void {
  for (const warning of report.warnings || []) console.log(`Warning: ${warning}`);
  for (const failure of report.failures || []) console.error(`Failure: ${failure}`);
  process.exit((report.failures || []).length > 0 ? 1 : 0);
}

function flag(name: string, description: string, fallback = false): FlagDefinition {
  return { name, type: "boolean", description, default: fallback };
}

function option(name: string, description: string, fallback = ""): FlagDefinition {
  return { name, type: "string", description, default: fallback };
}

function repeated(name: string, description: string): FlagDefinition {
  return { name, type: "string[]", description, default: [] };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
