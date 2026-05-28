// Dashboard command parsing stays behavior-first until command handler types are modeled.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  normalizeTarget,
  serveDashboardWorkbench,
  writeDashboardFolder,
  writeDashboardSingleFile,
} from "../lib/harness-core.mjs";
import type { ResolvedHarnessPaths } from "../lib/harness-paths.mjs";
import { dashboardWatchRoots } from "../lib/harness-paths.mjs";

type FlagReader = (name: string, fallback?: boolean) => boolean;
type OptionReader = (name: string, fallback?: string) => string;
type TargetReader = () => string;
type DashboardCommandContext = { takeFlag: FlagReader; takeOption: OptionReader; targetArg: TargetReader };

export async function runDevDashboardCommand({ takeFlag, takeOption, targetArg }: DashboardCommandContext) {
  const open = !takeFlag("--no-open");
  const outDir = takeOption("--out-dir", "");
  const host = takeOption("--host", "127.0.0.1");
  const port = Number(takeOption("--port", "0"));
  const localeOverride = takeOption("--locale", "");
  const target = targetArg();
  const usesDefaultOutDir = !outDir;
  const dashboardOutDir = outDir || defaultDevOutDir(target);
  const opts = {
    ...(localeOverride ? { localeOverride } : {}),
    recoverGeneratedDashboard: usesDefaultOutDir,
    replaceExistingDashboardOutput: usesDefaultOutDir,
  };
  try {
    await serveDashboardWorkbench(dashboardOutDir, target, { ...opts, host, port, autoRefresh: true, open, label: "harness dev" });
  } catch (error) {
    console.error(errorMessage(error));
    process.exit(1);
  }
}

export async function runDashboardCommand({ takeFlag, takeOption, targetArg }: DashboardCommandContext) {
  const watch = takeFlag("--watch");
  const workbench = takeFlag("--workbench");
  const out = takeOption("--out", path.join("tmp", "harness-dashboard.html"));
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
      requireV2DashboardTarget(targetArg());
      await serveDashboardWorkbench(outDir, targetArg(), { ...opts, host, port: Number(port) });
    } catch (error) {
      console.error(errorMessage(error));
      process.exit(1);
    }
  }
  if (watch) {
    if (!outDir) {
      console.error("dashboard --watch requires --out-dir so updates are written to a stable folder");
      process.exit(2);
    }
    const target = targetArg();
    const harnessPaths = requireV2DashboardTarget(target);
    const watchRoots = dashboardWatchRoots(harnessPaths);
    const regenerate = () => {
      try {
        console.log(writeDashboardFolder(outDir, target, opts));
        console.log(`dashboard regenerated: ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`dashboard regeneration failed: ${errorMessage(error)}`);
      }
    };
    regenerate();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const watchers = watchRoots.map((watchRoot) => fs.watch(watchRoot, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(regenerate, 300);
    }));
    const close = () => {
      for (const watcher of watchers) watcher.close();
      if (timer) clearTimeout(timer);
      process.exit(0);
    };
    process.on("SIGINT", close);
    process.on("SIGTERM", close);
    console.log(`watching ${watchRoots.join(", ")}`);
    await new Promise(() => {});
  }
  requireV2DashboardTarget(targetArg());
  if (outDir) {
    console.log(writeDashboardFolder(outDir, targetArg(), opts));
  } else {
    console.log(writeDashboardSingleFile(out, targetArg(), opts));
  }
  process.exit(0);
}

function requireV2DashboardTarget(target: string): ResolvedHarnessPaths {
  const normalizedTarget = normalizeTarget(target) as { harness?: unknown };
  const harnessPaths = readV2HarnessPaths(normalizedTarget);
  if (harnessPaths) return harnessPaths;
  console.error("dashboard requires v2 harness structure; run `harness migrate-structure --plan` then `harness migrate-structure --apply`");
  process.exit(1);
}

function defaultDevOutDir(targetInput: string): string {
  const target = path.resolve(targetInput || ".");
  return path.join(os.tmpdir(), "coding-agent-harness-dev", `${path.basename(target) || "project"}-${Buffer.from(target).toString("hex").slice(0, 16)}`);
}

function readV2HarnessPaths(target: { harness?: unknown }): ResolvedHarnessPaths | null {
  const harness = target.harness;
  return isRecord(harness) && harness.version === 2 ? harness as ResolvedHarnessPaths : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
