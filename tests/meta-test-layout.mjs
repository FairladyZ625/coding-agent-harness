#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
assert(pkg.scripts.test === "node tests/run-all.mjs", "npm test should use the multi-suite test runner");

const mainHarness = fs.readFileSync(path.join(repoRoot, "tests/test-harness.mjs"), "utf8");
assert(mainHarness.split(/\r?\n/).length <= 350, "tests/test-harness.mjs should stay below 350 lines after lifecycle/migration suite extraction");
assert(fs.existsSync(path.join(repoRoot, "tests/source-package-boundary.mjs")), "source/package boundary tests should live in a dedicated suite");
assert(fs.existsSync(path.join(repoRoot, "tests/dashboard-generation.mjs")), "dashboard generation tests should live in a dedicated suite");
assert(fs.existsSync(path.join(repoRoot, "tests/template-governance.mjs")), "template governance tests should live in a dedicated suite");
assert(fs.existsSync(path.join(repoRoot, "tests/task-lifecycle.mjs")), "task lifecycle tests should live in a dedicated suite");
assert(fs.existsSync(path.join(repoRoot, "tests/migration-adoption.mjs")), "migration/adoption tests should live in a dedicated suite");
assert(fs.existsSync(path.join(repoRoot, "tests/helpers/harness-test-utils.mjs")), "shared test utilities should live outside individual suites");

const cliEntrypoint = fs.readFileSync(path.join(repoRoot, "scripts/harness.mjs"), "utf8");
assert(cliEntrypoint.split(/\r?\n/).length <= 320, "scripts/harness.mjs should stay below 320 lines by routing command handlers out");
assert(fs.existsSync(path.join(repoRoot, "scripts/commands/dashboard-command.mjs")), "dashboard command handler should live outside scripts/harness.mjs");
assert(fs.existsSync(path.join(repoRoot, "scripts/commands/migration-command.mjs")), "migration command handler should live outside scripts/harness.mjs");
assert(fs.existsSync(path.join(repoRoot, "scripts/commands/task-command.mjs")), "task command handler should live outside scripts/harness.mjs");

const taskLifecycleModule = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-lifecycle.mjs"), "utf8");
assert(taskLifecycleModule.split(/\r?\n/).length <= 650, "task lifecycle core should stay below 650 lines by routing preset-specific evidence helpers out");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/task-migration-preset.mjs")), "legacy migration preset task helpers should live outside task-lifecycle.mjs");

const taskScannerModule = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-scanner.mjs"), "utf8");
assert(taskScannerModule.split(/\r?\n/).length <= 600, "task scanner should stay below 600 lines by routing lesson candidate parsing out");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/task-lesson-candidates.mjs")), "lesson candidate parsing should live outside task-scanner.mjs");

const cssManifestPath = path.join(repoRoot, "templates/dashboard/assets/app.css.manifest.json");
assert(fs.existsSync(cssManifestPath), "dashboard CSS should be assembled from a manifest of css-src files");
const cssManifest = JSON.parse(fs.readFileSync(cssManifestPath, "utf8"));
assert(Array.isArray(cssManifest) && cssManifest.length > 1, "dashboard CSS manifest should contain multiple source slices");
for (const relativePath of cssManifest) {
  const sourcePath = path.join(repoRoot, "templates/dashboard/assets", relativePath);
  assert(sourcePath.includes(`${path.sep}css-src${path.sep}`), `dashboard CSS source should live under css-src/: ${relativePath}`);
  const lineCount = fs.readFileSync(sourcePath, "utf8").split(/\r?\n/).length;
  assert(lineCount <= 900, `dashboard CSS source slice is too large (${lineCount} lines): ${relativePath}`);
}
