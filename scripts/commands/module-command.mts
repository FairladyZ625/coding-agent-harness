import {
  normalizeTarget,
  prepareModuleRegistration,
  prepareModuleScaffold,
  prepareModuleUnregister,
  readHarnessModules,
} from "../lib/harness-core.mjs";
import { takeRepeatedOptionsFromArgs } from "../lib/command-registry.mjs";
import { beginGovernanceSync, commitGovernanceSync, governanceRelativePaths, releaseGovernanceSync } from "../lib/governance-sync.mjs";

type FlagReader = (name: string, fallback?: boolean) => boolean;
type OptionReader = (name: string, fallback?: string) => string;
type TargetReader = () => string;
type CommandContext = {
  args: string[];
  takeFlag: FlagReader;
  takeOption: OptionReader;
  targetArg: TargetReader;
};

export function runModuleCommand({ args, takeFlag, takeOption, targetArg }: CommandContext) {
  const subcommand = args.shift() || "list";
  const json = takeFlag("--json");

  if (subcommand === "list") {
    const modules = readHarnessModules(targetArg());
    const items = Object.entries(modules.items || {}).map(([key, module]) => ({ key, ...module }));
    if (json) console.log(JSON.stringify({ schema: modules.schema, generatedView: modules.generatedView, modules: items }, null, 2));
    else for (const item of items) console.log(`${item.key}\t${item.status || "planned"}\t${item.title || item.key}`);
    return;
  }

  if (subcommand === "inspect") {
    const moduleKey = args.shift();
    if (!moduleKey) {
      console.error("Missing module key");
      process.exit(2);
    }
    const modules = readHarnessModules(targetArg());
    const module = modules.items[moduleKey];
    if (!module) {
      console.error(`Module is not registered: ${moduleKey}`);
      process.exit(1);
    }
    console.log(JSON.stringify({ key: moduleKey, ...module }, null, 2));
    return;
  }

  if (subcommand === "register") {
    const dryRun = takeFlag("--dry-run");
    const moduleKey = args.shift();
    if (!moduleKey) {
      console.error("Missing module key");
      process.exit(2);
    }
    const input = {
      title: takeOption("--title", ""),
      prefix: takeOption("--prefix", ""),
      status: takeOption("--status", "planned"),
      branch: takeOption("--branch", ""),
      owner: takeOption("--owner", "coordinator"),
      currentStep: takeOption("--current-step", ""),
      locale: takeOption("--locale", ""),
      scope: takeRepeatedOptionsFromArgs(args, "--scope"),
      shared: takeRepeatedOptionsFromArgs(args, "--shared"),
      dependsOn: takeRepeatedOptionsFromArgs(args, "--depends-on"),
    };
    const target = normalizeTarget(targetArg());
    const planned = prepareModuleRegistration(target, moduleKey, input, { dryRun: true });
    const context = beginGovernanceSync(target, {
      operation: `module register ${moduleKey}`,
      dryRun,
      allowDirtyWorktree: true,
      allowedRelativePaths: governanceRelativePaths(planned.changes),
    });
    try {
      const result = prepareModuleRegistration(target, moduleKey, input, { dryRun });
      const commit = commitGovernanceSync(context, governanceRelativePaths(result.changes), { message: `chore(harness): register module ${result.moduleKey}` });
      console.log(JSON.stringify({ ...result, governance: { commit } }, null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    } finally {
      releaseGovernanceSync(context);
    }
    return;
  }

  if (subcommand === "unregister") {
    const dryRun = takeFlag("--dry-run");
    const moduleKey = args.shift();
    if (!moduleKey) {
      console.error("Missing module key");
      process.exit(2);
    }
    const target = normalizeTarget(targetArg());
    const planned = prepareModuleUnregister(target, moduleKey, { dryRun: true });
    const context = beginGovernanceSync(target, {
      operation: `module unregister ${moduleKey}`,
      dryRun,
      allowDirtyWorktree: true,
      allowedRelativePaths: governanceRelativePaths(planned.changes),
    });
    try {
      const result = prepareModuleUnregister(target, moduleKey, { dryRun });
      const commit = commitGovernanceSync(context, governanceRelativePaths(result.changes), { message: `chore(harness): unregister module ${result.moduleKey}` });
      console.log(JSON.stringify({ ...result, governance: { commit } }, null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    } finally {
      releaseGovernanceSync(context);
    }
    return;
  }

  if (subcommand === "scaffold") {
    const dryRun = takeFlag("--dry-run");
    const all = takeFlag("--all");
    const locale = takeOption("--locale", "");
    const moduleKey = all ? "" : args.shift();
    if (!all && !moduleKey) {
      console.error("Missing module key");
      process.exit(2);
    }
    const target = normalizeTarget(targetArg());
    const modules = readHarnessModules(target);
    const keys = all ? Object.keys(modules.items || {}).sort() : [moduleKey || ""];
    const plannedChanges = keys.flatMap((key) => prepareModuleScaffold(target, key, { dryRun: true, locale }).changes);
    const context = beginGovernanceSync(target, {
      operation: all ? "module scaffold --all" : `module scaffold ${moduleKey}`,
      dryRun,
      allowDirtyWorktree: true,
      allowedRelativePaths: governanceRelativePaths(plannedChanges),
      allowDirtyWriteScope: true,
    });
    try {
      const results = keys.map((key) => prepareModuleScaffold(target, key, { dryRun, locale }));
      const changes = results.flatMap((result) => result.changes);
      const commit = commitGovernanceSync(context, governanceRelativePaths(changes), { message: all ? "chore(harness): scaffold registered modules" : `chore(harness): scaffold module ${moduleKey}` });
      console.log(JSON.stringify({ modules: results, changes, governance: { commit } }, null, 2));
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    } finally {
      releaseGovernanceSync(context);
    }
    return;
  }

  console.error(`Unknown module subcommand: ${subcommand}`);
  process.exit(2);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
