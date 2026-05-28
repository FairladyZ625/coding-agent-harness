#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [entrypoint, ...args] = process.argv.slice(2);
if (!entrypoint) {
  console.error("Usage: node run-dist.mjs <dist-entrypoint> [...args]");
  process.exit(1);
}

const root = path.dirname(fileURLToPath(import.meta.url));
const buildScript = path.join(root, "scripts/build-dist.mts");
const distEntrypoint = path.join(root, "dist", entrypoint);

if (fs.existsSync(buildScript)) {
  const build = spawnSync(process.execPath, [buildScript, "--quiet"], {
    cwd: root,
    stdio: "inherit",
  });
  if (build.status !== 0) process.exit(build.status ?? 1);
}

if (!fs.existsSync(distEntrypoint)) {
  console.error(`Missing dist runtime entrypoint: dist/${entrypoint}`);
  process.exit(1);
}

const result = spawnSync(process.execPath, [distEntrypoint, ...args], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
