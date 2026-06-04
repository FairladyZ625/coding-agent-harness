#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const node = process.execPath;
const cli = path.join(repoRoot, "dist/harness.mjs");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-source-boundary-"));

type HarnessStatusJson = { tasks: unknown[] };
type PackEntry = { path: string; mode?: number };
type PackResult = { files: PackEntry[] };

function run(args: string[], options: Omit<SpawnSyncOptionsWithStringEncoding, "encoding"> = {}): SpawnSyncReturns<string> {
  return spawnSync(node, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    ...options,
  });
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function expectPass(args: string[]): SpawnSyncReturns<string> {
  const result = run(args);
  assert(result.status === 0, `${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function expectJson(args: string[]): HarnessStatusJson {
  return JSON.parse(expectPass(args).stdout) as HarnessStatusJson;
}

function readManifestBundle(assetsDir: string, manifestName: string): string {
  const manifestPath = path.join(assetsDir, manifestName);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as string[];
  assert(Array.isArray(manifest) && manifest.length > 0, `${manifestName} must list dashboard source files`);
  return `${manifest.map((relativePath) => fs.readFileSync(path.join(assetsDir, relativePath), "utf8").trimEnd()).join("\n\n")}\n`;
}

expectPass(["check", "--profile", "source-package", "."]);
if (fs.existsSync(path.join(repoRoot, ".harness-private"))) {
  const privateStatusResult = run(["status", "--json", ".harness-private"]);
  assert(privateStatusResult.stdout.trim().startsWith("{"), "private-harness status JSON should be emitted even when local private checks fail");
  const privateStatus = JSON.parse(privateStatusResult.stdout) as HarnessStatusJson;
  assert(privateStatus.tasks.length >= 1, "private-harness status JSON should be complete and parseable");
}

const sourceBoundaryTarget = path.join(tmpRoot, "source-boundary-target");
fs.mkdirSync(path.join(sourceBoundaryTarget, "scripts"), { recursive: true });
fs.mkdirSync(path.join(sourceBoundaryTarget, "templates/planning"), { recursive: true });
fs.mkdirSync(path.join(sourceBoundaryTarget, "docs/private"), { recursive: true });
fs.mkdirSync(path.join(sourceBoundaryTarget, ".harness-private"), { recursive: true });
fs.writeFileSync(path.join(sourceBoundaryTarget, "package.json"), "{}\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "scripts/harness.mjs"), "#!/usr/bin/env node\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "scripts/check-harness.mjs"), "#!/usr/bin/env node\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "scripts/test-harness.mjs"), "#!/usr/bin/env node\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "scripts/smoke-dashboard.mjs"), "#!/usr/bin/env node\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "templates/planning/task_plan.md"), "# Task\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "AGENTS.md"), "# Local only\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "CLAUDE.md"), "# Local only\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "docs/private/plan.md"), "# Private\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, ".harness-private/AGENTS.md"), "# Private harness\n");
fs.writeFileSync(path.join(sourceBoundaryTarget, "harness-dashboard.html"), "<html>generated dashboard</html>\n");
spawnSync("git", ["init"], { cwd: sourceBoundaryTarget, encoding: "utf8" });
spawnSync("git", ["add", "-f", "AGENTS.md", "CLAUDE.md", "docs/private/plan.md", ".harness-private/AGENTS.md", "harness-dashboard.html"], { cwd: sourceBoundaryTarget, encoding: "utf8" });
const sourceBoundaryCheck = run(["check", "--profile", "source-package", sourceBoundaryTarget]);
assert(sourceBoundaryCheck.status !== 0, "source-package check should reject staged local-only harness files");
assert(sourceBoundaryCheck.stderr.includes("private local-only file staged: AGENTS.md"), "source-package check should report staged AGENTS.md");
assert(sourceBoundaryCheck.stderr.includes("private local-only file staged: CLAUDE.md"), "source-package check should report staged CLAUDE.md");
assert(sourceBoundaryCheck.stderr.includes("private local-only file staged: docs/private/plan.md"), "source-package check should report staged docs/");
assert(sourceBoundaryCheck.stderr.includes("private local-only file staged: .harness-private/AGENTS.md"), "source-package check should report staged .harness-private/");
assert(sourceBoundaryCheck.stderr.includes("generated dashboard file tracked in source root: harness-dashboard.html"), "source-package check should report tracked root dashboard output");
assert(sourceBoundaryCheck.stderr.includes("internal test/smoke file in publishable scripts directory: scripts/test-harness.mjs"), "source-package check should report internal test script under scripts/");
assert(sourceBoundaryCheck.stderr.includes("internal test/smoke file in publishable scripts directory: scripts/smoke-dashboard.mjs"), "source-package check should report internal smoke script under scripts/");

const packDryRun = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: repoRoot, encoding: "utf8" });
assert(packDryRun.status === 0, `npm pack dry run failed\nSTDOUT:\n${packDryRun.stdout}\nSTDERR:\n${packDryRun.stderr}`);
const packedEntries = (JSON.parse(packDryRun.stdout) as PackResult[])[0]?.files || [];
const packedFiles = packedEntries.map((file) => file.path);
const packedFileByPath = new Map(packedEntries.map((file) => [file.path, file]));
assert(!packedFiles.includes("harness-dashboard.html"), "npm package must not include root dashboard output");
assert(!packedFiles.includes("scripts/test-harness.mjs"), "npm package must not include internal test harness");
assert(!packedFiles.includes("scripts/smoke-dashboard.mjs"), "npm package must not include internal dashboard smoke script");
assert(!packedFiles.some((file) => file.startsWith("tests/")), "npm package must not include tests/");
assert(packedFiles.includes("postinstall.mjs"), "npm package must include source-safe postinstall bootstrap");
assert(packedFiles.includes("run-dist.mjs"), "npm package must include npm script dist bootstrap");
assert(packedFiles.includes("dist/harness.mjs"), "npm package must include dist harness runtime entrypoint");
const packedHarnessEntry = packedFileByPath.get("dist/harness.mjs");
assert(Boolean(packedHarnessEntry) && ((packedHarnessEntry?.mode || 0) & 0o111) !== 0, "npm package dist harness runtime entrypoint must be executable");
assert(packedFiles.includes("dist/postinstall.mjs"), "npm package must include dist postinstall runtime entrypoint");
assert(!packedFiles.some((file) => file.startsWith("scripts/")), "npm package must not include historical scripts/ shims after PR-28");
for (const required of [
  "dist/lib/harness-paths.mjs",
  "dist/lib/preset-runtime-bridge.mjs",
  "dist/lib/structure-migration.mjs",
  "templates/planning/walkthrough.md",
  "examples/minimal-project/coding-agent-harness/harness.yaml",
]) {
  assert(packedFiles.includes(required), `npm package must include ${required}`);
}
assert(fs.readFileSync(path.join(repoRoot, "presets/release-closeout/scripts/generate-release-package.mjs"), "utf8").includes("preset-runtime-bridge.mjs"), "release-closeout preset must use the narrow preset runtime bridge");
assert(fs.readFileSync(path.join(repoRoot, "presets/publish-standard/scripts/generate-publish-standard.mjs"), "utf8").includes("preset-runtime-bridge.mjs"), "publish-standard preset must use the narrow preset runtime bridge");

const dashboardAssetsDir = path.join(repoRoot, "templates/dashboard/assets");
const dashboardWriter = fs.readFileSync(path.join(repoRoot, "scripts/lib/dashboard-writer.mts"), "utf8");
assert(dashboardWriter.includes('from "node:url"'), "dashboard writer should use Node URL helpers for import.meta.url paths");
assert(dashboardWriter.includes("fileURLToPath(import.meta.url)"), "dashboard writer should convert import.meta.url with fileURLToPath");
assert(!dashboardWriter.includes("new URL(import.meta.url).pathname"), "dashboard writer must not derive filesystem paths from URL.pathname");

assert(
  fs.readFileSync(path.join(dashboardAssetsDir, "app.js"), "utf8") === readManifestBundle(dashboardAssetsDir, "app.manifest.json"),
  "tracked dashboard assets/app.js must match app-src manifest assembly",
);
assert(
  fs.readFileSync(path.join(dashboardAssetsDir, "app.css"), "utf8") === readManifestBundle(dashboardAssetsDir, "app.css.manifest.json"),
  "tracked dashboard assets/app.css must match css-src manifest assembly",
);

console.log("Source/package boundary tests passed");
