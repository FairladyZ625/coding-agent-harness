import fs from "node:fs";
import path from "node:path";
import {
  checkPresetPackage,
  inspectPresetPackage,
  installPresetPackage,
  auditBundledPresetDrift,
  listPresetPackages,
  seedBundledPresets,
  runPresetAction,
  runPresetEntrypoint,
  uninstallPresetPackage,
} from "../lib/harness-core.mjs";

type FlagReader = (name: string, fallback?: boolean) => boolean;
type TargetReader = () => string;

export function runPresetCommand({ args, takeFlag, targetArg }: { args: string[]; takeFlag: FlagReader; targetArg: TargetReader }) {
  const subcommand = args.shift() || "list";
  const json = takeFlag("--json");
  const project = takeFlag("--project");
  try {
    if (subcommand === "list") {
      const target = targetArg();
      const presets = listPresetPackages({ targetInput: target }).map((preset) => ({
        id: preset.id,
        version: preset.version,
        purpose: preset.purpose,
        compatibleBudgets: preset.compatibleBudgets,
        source: preset.source,
        manifestPath: preset.manifestRelativePath,
      }));
      if (json) console.log(JSON.stringify({ presets }, null, 2));
      else for (const preset of presets) console.log(`${preset.id}@${preset.version} [${preset.source}] ${preset.compatibleBudgets.join(",")} - ${preset.purpose}`);
    } else if (subcommand === "inspect") {
      const id = args.shift();
      if (!id) throw new Error("Missing preset id");
      const preset = inspectPresetPackage(id, { targetInput: targetArg() });
      if (json) console.log(JSON.stringify(preset, null, 2));
      else console.log(`${preset.id}@${preset.version}\n${preset.purpose}`);
    } else if (subcommand === "check") {
      const id = args.shift();
      if (!id) throw new Error("Missing preset id");
      const report = checkPresetPackage(id, { targetInput: targetArg() });
      if (json) console.log(JSON.stringify(report, null, 2));
      else {
        for (const failure of report.failures) console.error(`Failure: ${failure}`);
        for (const warning of report.warnings) console.log(`Warning: ${warning}`);
        console.log(`Preset check ${report.status}: ${report.id}@${report.version}`);
      }
      process.exit(report.status === "pass" ? 0 : 1);
    } else if (subcommand === "install") {
      const force = takeFlag("--force");
      const allowScripts = takeFlag("--allow-scripts");
      const source = args.shift();
      if (!source) throw new Error("Missing preset source");
      const result = installPresetPackage(source, { force, allowScripts, scope: project ? "project" : "user", targetInput: targetArg() });
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Installed preset ${result.id}@${result.version} to ${result.destination}`);
    } else if (subcommand === "seed") {
      const force = takeFlag("--force");
      const dryRun = takeFlag("--dry-run");
      const result = seedBundledPresets({ force, dryRun, scope: project ? "project" : "user", targetInput: targetArg() });
      if (json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Seeded bundled presets to ${result.target}`);
        for (const preset of result.presets) console.log(`${preset.action}: ${preset.id}@${preset.version}`);
      }
    } else if (subcommand === "audit") {
      const result = auditBundledPresetDrift({ scope: project ? "project" : "user", targetInput: targetArg() });
      if (json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Preset audit ${result.scope}: ${result.stale} stale or missing bundled presets`);
        for (const preset of result.presets) console.log(`${preset.upgradeAction}: ${preset.id}@${preset.installedVersion || "missing"} [builtin ${preset.builtinVersion}]`);
      }
    } else if (subcommand === "uninstall") {
      const id = args.shift();
      if (!id) throw new Error("Missing preset id");
      const result = uninstallPresetPackage(id, { scope: project ? "project" : "user", targetInput: targetArg() });
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`${result.removed ? "Removed" : "Preset not installed"}: ${result.id}`);
    } else if (subcommand === "run") {
      const taskRef = takeOptionFromArgs(args, "--task", "");
      const id = args.shift();
      const entrypoint = args.shift();
      if (!id) throw new Error("Missing preset id");
      if (!entrypoint) throw new Error("Missing preset entrypoint");
      const result = runPresetEntrypoint(id, entrypoint, { taskRef, targetInput: targetArg(), json });
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Preset run ${result.status}: ${result.preset}.${result.entrypoint} (${result.materialized.length} writes)`);
    } else if (subcommand === "action") {
      const allowScripts = takeFlag("--allow-scripts");
      const taskRef = takeOptionFromArgs(args, "--task", "");
      const id = args.shift();
      const action = args.shift();
      if (!id) throw new Error("Missing preset id");
      if (!action) throw new Error("Missing preset action");
      const target = takeTrailingActionTarget(args);
      const result = runPresetAction(id, action, { taskRef, targetInput: target, json, allowScripts, actionArgs: args });
      if (json) console.log(JSON.stringify(result, null, 2));
      else console.log(`Preset action ${result.status}: ${result.preset}.${result.action} (${result.materialized.length} writes) [${result.source} ${String(result.manifestSha256 || "").slice(0, 12)}]`);
    } else {
      throw new Error(`Unknown preset subcommand: ${subcommand}`);
    }
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

function takeOptionFromArgs(args: string[], name: string, fallback = ""): string {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1] || fallback;
  args.splice(index, 2);
  return value;
}

function takeTrailingActionTarget(args: string[]): string {
  const candidate = args[args.length - 1] || "";
  if (!candidate || candidate.startsWith("-")) return ".";
  if (candidate === "." || candidate.startsWith("~") || candidate.includes("/") || candidate.includes("\\") || fs.existsSync(path.resolve(candidate))) {
    args.pop();
    return candidate;
  }
  return ".";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
