#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.join(root, "scripts/build-dist.mts");
const distPostinstall = path.join(root, "dist/postinstall.mjs");
const buildOnly = process.argv.includes("--build-only");
const skipPostinstall = process.env.CODING_AGENT_HARNESS_SKIP_POSTINSTALL === "1";

function runBuild() {
  if (!fs.existsSync(buildScript)) return false;
  const result = spawnSync(process.execPath, [buildScript, "--quiet"], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
  return true;
}

if (!fs.existsSync(distPostinstall)) {
  runBuild();
}

if (buildOnly || skipPostinstall) {
  process.exit(0);
}

if (!fs.existsSync(distPostinstall)) {
  console.error("coding-agent-harness postinstall failed: missing dist/postinstall.mjs");
  console.error("Run npm run build:runtime from a source checkout, or reinstall a complete package.");
  process.exit(1);
}

await import(pathToFileURL(distPostinstall).href);
