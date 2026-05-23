#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import {
  addCapability,
  buildMigrationPlan,
  buildStatus,
  confirmTaskReview,
  createTask,
  doctorUserSkill,
  installUserSkill,
  listLifecycleTasks,
  checkPresetPackage,
  inspectPresetPackage,
  listPresetPackages,
  normalizeLocale,
  promoteLessonCandidate,
  runMigration,
  serveDashboardWorkbench,
  validateSourcePackageBoundary,
  updateModuleStep,
  updateTaskPhase,
  updateTaskLifecycle,
  verifyMigrationSession,
  writeDashboardFolder,
  writeDashboardSingleFile,
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
  harness dev [--no-open] [--out-dir folder] [--host 127.0.0.1] [--port n] [target]
  harness dashboard [--out file.html] [--out-dir folder] [--workbench] [--host 127.0.0.1] [--port n] [target]
  harness init [--dry-run] [--locale zh-CN|en-US] [--capabilities core,dashboard] [--add-npm-scripts] [target]
  harness add-capability <name> [--dry-run] [--locale zh-CN|en-US] [target]
  harness migrate-plan [--json] [--limit n] [target]
  harness migrate-run [--locale zh-CN|en-US] [--assume-locale] [--allow-dirty] [--plan-only] [--out-dir folder] [--session-dir folder] [target]
  harness migrate-verify [--json] [--full-cutover] <session.json>
  harness preset list [--json]
  harness preset inspect <id> [--json]
  harness preset check <id> [--json]
  harness new-task <task-id> [--module key] [--budget simple|standard|complex] [--preset legacy-migration] [--from-session session.json] [--long-running] [--title title] [--locale zh-CN|en-US] [--dry-run] [target]
  harness task-start <task-id> [--message text] [target]
  harness task-phase <task-id> <phase-id> [--state done] [--completion 100] [--evidence present] [target]
  harness task-log <task-id> --message text [--evidence type:PATH:summary] [target]
  harness task-block <task-id> [--message text] [target]
  harness task-review <task-id> [--message text] [target]
  harness review-confirm <task-id> --confirm task-id [--reviewer name] [--message text] [target]
  harness lesson-promote <task-id> <candidate-id> [--dry-run] [target]
  harness task-complete <task-id> [--message text] [target]
  harness task-list [--json] [--state state] [--module key] [target]
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
  const dashboardOutDir = outDir || defaultDevOutDir(target);
  const opts = localeOverride ? { localeOverride } : {};
  try {
    await serveDashboardWorkbench(dashboardOutDir, target, { ...opts, host, port, autoRefresh: true, open, label: "harness dev" });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "dashboard") {
  const watch = takeFlag("--watch");
  const workbench = takeFlag("--workbench");
  const out = takeOption("--out", "harness-dashboard.html");
  const outDir = takeOption("--out-dir", "");
  const host = takeOption("--host", "127.0.0.1");
  const port = takeOption("--port", "0");
  const localeOverride = takeOption("--locale", "");
  const opts = localeOverride ? { localeOverride } : {};
  if (workbench) {
    if (!outDir) {
      console.error("dashboard --workbench requires --out-dir so regenerated data has a stable folder");
      process.exit(2);
    }
    try {
      await serveDashboardWorkbench(outDir, targetArg(), { ...opts, host, port });
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  }
  if (watch) {
    if (!outDir) {
      console.error("dashboard --watch requires --out-dir so updates are written to a stable folder");
      process.exit(2);
    }
    const target = targetArg();
    const docsRoot = path.basename(path.resolve(target)) === "docs" ? path.resolve(target) : path.join(path.resolve(target), "docs");
    const regenerate = () => {
      try {
        console.log(writeDashboardFolder(outDir, target, opts));
        console.log(`dashboard regenerated: ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`dashboard regeneration failed: ${error.message}`);
      }
    };
    regenerate();
    let timer = null;
    const watcher = fs.watch(docsRoot, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(regenerate, 300);
    });
    const close = () => {
      watcher.close();
      clearTimeout(timer);
      process.exit(0);
    };
    process.on("SIGINT", close);
    process.on("SIGTERM", close);
    console.log(`watching ${docsRoot}`);
    await new Promise(() => {});
  }
  if (outDir) {
    console.log(writeDashboardFolder(outDir, targetArg(), opts));
  } else {
    console.log(writeDashboardSingleFile(out, targetArg(), opts));
  }
  process.exit(0);
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
} else if (command === "migrate-plan") {
  const json = takeFlag("--json");
  const limit = Number.parseInt(takeOption("--limit", "20"), 10) || 20;
  try {
    const plan = buildMigrationPlan(targetArg(), { limit });
    if (json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      console.log(`Migration Plan: ${plan.target}`);
      console.log(`mode: ${plan.mode}`);
      console.log(`warnings: ${plan.summary.warnings}`);
      console.log(`task actions: ${plan.summary.taskActions}`);
      console.log(`visual map actions: ${plan.summary.visualMapActions}`);
      console.log(`legacy visual-only tasks: ${plan.summary.legacyVisualOnly}`);
      console.log(`weak briefs: ${plan.summary.weakBrief}`);
      console.log(`unknown classifications: ${plan.summary.unknownClassification}`);
      console.log(`full cutover eligible: ${plan.summary.fullCutoverEligible ? "yes" : "no"}`);
      console.log(`review actions: ${plan.summary.reviewSchemaGaps}`);
      console.log(`legacy actions: ${plan.summary.legacyReferenceGaps}`);
      console.log(`legacy residuals: ${plan.summary.legacyResiduals}`);
      console.log(`recommended capabilities: ${plan.summary.recommendedCapabilities.join(", ") || "none"}`);
      console.log("\nPhases:");
      for (const phase of plan.phases) console.log(`- ${phase.id}: ${phase.title}`);
      console.log("\nTop task actions:");
      for (const action of plan.taskActions) console.log(`- ${action.taskId}: add ${action.files.join(", ")}`);
      console.log("\nTop review actions:");
      for (const action of plan.reviewActions) console.log(`- ${action.path}: add ${action.missing.join(", ")}`);
      console.log("\nTop legacy residuals:");
      for (const action of plan.legacyResiduals) console.log(`- ${action.taskId}: ${action.missing} (${action.reason})`);
      console.log("\nNext commands:");
      for (const next of plan.nextCommands) console.log(`- ${next}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "migrate-run") {
  const locale = takeOption("--locale", "");
  const assumeLocale = takeFlag("--assume-locale");
  const allowDirty = takeFlag("--allow-dirty");
  const planOnly = takeFlag("--plan-only");
  const outDir = takeOption("--out-dir", "");
  const sessionDir = takeOption("--session-dir", "");
  try {
    console.log(
      JSON.stringify(
        runMigration(targetArg(), {
          locale,
          assumeLocale,
          allowDirty,
          planOnly,
          outDir,
          sessionDir,
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "migrate-verify") {
  const json = takeFlag("--json");
  const fullCutover = takeFlag("--full-cutover");
  const sessionPath = args.shift();
  if (!sessionPath) {
    console.error("Missing session.json path");
    process.exit(2);
  }
  const result = verifyMigrationSession(sessionPath, { fullCutover });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const failure of result.failures) console.error(`Failure: ${failure}`);
    for (const warning of result.warnings) console.log(`Warning: ${warning}`);
    console.log(`Migration verify ${result.status}: ${result.sessionPath}`);
  }
  process.exit(result.status === "pass" ? 0 : 1);
} else if (command === "preset") {
  const subcommand = args.shift() || "list";
  const json = takeFlag("--json");
  try {
    if (subcommand === "list") {
      const presets = listPresetPackages().map((preset) => ({
        id: preset.id,
        version: preset.version,
        purpose: preset.purpose,
        compatibleBudgets: preset.compatibleBudgets,
        manifestPath: preset.manifestRelativePath,
      }));
      if (json) console.log(JSON.stringify({ presets }, null, 2));
      else for (const preset of presets) console.log(`${preset.id}@${preset.version} ${preset.compatibleBudgets.join(",")}`);
    } else if (subcommand === "inspect") {
      const id = args.shift();
      if (!id) throw new Error("Missing preset id");
      const preset = inspectPresetPackage(id);
      if (json) console.log(JSON.stringify(preset, null, 2));
      else console.log(`${preset.id}@${preset.version}\n${preset.purpose}`);
    } else if (subcommand === "check") {
      const id = args.shift();
      if (!id) throw new Error("Missing preset id");
      const report = checkPresetPackage(id);
      if (json) console.log(JSON.stringify(report, null, 2));
      else {
        for (const failure of report.failures) console.error(`Failure: ${failure}`);
        for (const warning of report.warnings) console.log(`Warning: ${warning}`);
        console.log(`Preset check ${report.status}: ${report.id}@${report.version}`);
      }
      process.exit(report.status === "pass" ? 0 : 1);
    } else {
      throw new Error(`Unknown preset subcommand: ${subcommand}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "new-task") {
  const dryRun = takeFlag("--dry-run");
  const locale = takeOption("--locale", "");
  const title = takeOption("--title", "");
  const moduleKey = takeOption("--module", "");
  const budget = takeOption("--budget", "standard");
  const preset = takeOption("--preset", "");
  const fromSession = takeOption("--from-session", "");
  const longRunning = takeFlag("--long-running");
  const shouldDeriveTaskId = fromSession && args.length === 0;
  const taskId = shouldDeriveTaskId ? "harness-v1-migration" : args.shift();
  if (!taskId) {
    console.error("Missing task id");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(createTask(targetArg(), taskId, { title, locale, dryRun, moduleKey, budget, longRunning, preset, fromSession }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "task-phase") {
  const state = takeOption("--state", "");
  const completion = takeOption("--completion", "");
  const evidenceStatus = takeOption("--evidence", "");
  const taskId = args.shift();
  const phaseId = args.shift();
  if (!taskId || !phaseId) {
    console.error("Missing task id or phase id");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(updateTaskPhase(targetArg(), taskId, phaseId, { state, completion, evidenceStatus }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (["task-start", "task-log", "task-block", "task-review", "task-complete"].includes(command)) {
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
    "task-review": { event: "task-review", state: "review" },
    "task-complete": { event: "task-complete", state: "done" },
  }[command];
  try {
    console.log(JSON.stringify(updateTaskLifecycle(targetArg(), taskId, { ...lifecycle, message, evidence }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "review-confirm") {
  const reviewer = takeOption("--reviewer", "Human Reviewer");
  const message = takeOption("--message", "");
  const evidence = takeOption("--evidence", "");
  const confirmText = takeOption("--confirm", "");
  const taskId = args.shift();
  if (!taskId) {
    console.error("Missing task id");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(confirmTaskReview(targetArg(), taskId, { reviewer, message, evidence, confirmText }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "lesson-promote") {
  const dryRun = takeFlag("--dry-run");
  const taskId = args.shift();
  const candidateId = args.shift();
  if (!taskId || !candidateId) {
    console.error("Missing task id or candidate id");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(promoteLessonCandidate(targetArg(), taskId, candidateId, { dryRun }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else if (command === "task-list") {
  const json = takeFlag("--json");
  const state = takeOption("--state", "");
  const moduleKey = takeOption("--module", "");
  const result = listLifecycleTasks(targetArg(), { state, moduleKey });
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    for (const task of result.tasks) {
      console.log(`${task.id}\t${task.state}\t${task.completion}%\t${task.title}`);
    }
  }
} else if (command === "module-step") {
  const state = takeOption("--state", "done");
  const moduleKey = args.shift();
  const stepId = args.shift();
  if (!moduleKey || !stepId) {
    console.error("Missing module key or step id");
    process.exit(2);
  }
  try {
    console.log(JSON.stringify(updateModuleStep(targetArg(), moduleKey, stepId, { state }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
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

function defaultDevOutDir(targetInput) {
  const target = path.resolve(targetInput || ".");
  const name = path.basename(target) || "project";
  const hash = Buffer.from(target).toString("hex").slice(0, 16);
  return path.join(os.tmpdir(), "coding-agent-harness-dev", `${name}-${hash}`);
}
