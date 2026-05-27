import fs from "node:fs";
import path from "node:path";
import {
  normalizeTarget,
  serveDashboardWorkbench,
  writeDashboardFolder,
  writeDashboardSingleFile,
} from "../lib/harness-core.mjs";

export async function runDashboardCommand({ takeFlag, takeOption, targetArg }) {
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
    const normalizedTarget = normalizeTarget(target);
    const watchRoot = normalizedTarget.harness?.version === 2
      ? normalizedTarget.harness.harnessRoot
      : path.basename(path.resolve(target)) === "docs" ? path.resolve(target) : path.join(path.resolve(target), "docs");
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
    const watcher = fs.watch(watchRoot, { recursive: true }, () => {
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
    console.log(`watching ${watchRoot}`);
    await new Promise(() => {});
  }
  if (outDir) {
    console.log(writeDashboardFolder(outDir, targetArg(), opts));
  } else {
    console.log(writeDashboardSingleFile(out, targetArg(), opts));
  }
  process.exit(0);
}
