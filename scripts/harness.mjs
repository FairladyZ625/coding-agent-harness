#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  addCapability,
  buildStatus,
  renderDashboard,
  normalizeLocale,
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
  const locale = normalizeLocale(takeOption("--locale", "en-US"));
  const capabilities = takeOption("--capabilities", "core").split(",").map((item) => item.trim()).filter(Boolean);
  try {
    const result = writeInitFiles(targetArg(), capabilities, { dryRun, locale });
    console.log(JSON.stringify({ dryRun, locale: result.locale, capabilities: result.capabilities, changes: result.changes }, null, 2));
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
    console.log(JSON.stringify({ dryRun, registry: result.registry }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
} else {
  printHelp();
  process.exit(2);
}
