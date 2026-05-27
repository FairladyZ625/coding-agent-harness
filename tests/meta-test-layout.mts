#!/usr/bin/env node
// @ts-nocheck

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
assert(fs.existsSync(path.join(repoRoot, "tests/lifecycle/task-lifecycle.mjs")), "task lifecycle domain tests should live under tests/lifecycle/");
assert(fs.existsSync(path.join(repoRoot, "tests/lifecycle/lifecycle-queues.mjs")), "lifecycle queue tests should live under tests/lifecycle/");
assert(fs.existsSync(path.join(repoRoot, "tests/lifecycle/review-confirm-git-gate.mjs")), "review-confirm git gate tests should live under tests/lifecycle/");
assert(fs.existsSync(path.join(repoRoot, "tests/migration-adoption.mjs")), "migration/adoption tests should live in a dedicated suite");
assert(fs.existsSync(path.join(repoRoot, "tests/helpers/harness-test-utils.mjs")), "shared test utilities should live outside individual suites");

const cliEntrypoint = fs.readFileSync(path.join(repoRoot, "scripts/harness.mjs"), "utf8");
assert(cliEntrypoint.split(/\r?\n/).length <= 320, "scripts/harness.mjs should stay below 320 lines by routing command handlers out");
assert(fs.existsSync(path.join(repoRoot, "scripts/commands/dashboard-command.mjs")), "dashboard command handler should live outside scripts/harness.mjs");
assert(fs.existsSync(path.join(repoRoot, "scripts/commands/migration-command.mjs")), "migration command handler should live outside scripts/harness.mjs");
assert(fs.existsSync(path.join(repoRoot, "scripts/commands/preset-command.mjs")), "preset command handler should live outside scripts/harness.mjs");
assert(fs.existsSync(path.join(repoRoot, "scripts/commands/task-command.mjs")), "task command handler should live outside scripts/harness.mjs");

const taskLifecycleModule = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-lifecycle.mjs"), "utf8");
assert(taskLifecycleModule.split(/\r?\n/).length <= 650, "task lifecycle core should stay below 650 lines by routing preset-specific evidence helpers out");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/preset-engine.mjs")), "generic preset engine should live outside task-lifecycle.mjs");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/task-lifecycle/review-gates.mjs")), "review gates should live under scripts/lib/task-lifecycle/");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/task-lifecycle/review-confirm.mjs")), "review-confirm lifecycle writer should live under scripts/lib/task-lifecycle/");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/task-lifecycle/text-utils.mjs")), "task lifecycle text helpers should live under scripts/lib/task-lifecycle/");

const taskScannerModule = fs.readFileSync(path.join(repoRoot, "scripts/lib/task-scanner.mjs"), "utf8");
assert(taskScannerModule.split(/\r?\n/).length <= 600, "task scanner should stay below 600 lines by routing lesson candidate parsing out");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/task-metadata.mjs")), "task metadata parsing should live outside task-scanner.mjs");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/task-lesson-candidates.mjs")), "lesson candidate parsing should live outside task-scanner.mjs");

const harnessChecker = fs.readFileSync(path.join(repoRoot, "scripts/check-harness.mjs"), "utf8");
assert(harnessChecker.split(/\r?\n/).length <= 650, "check-harness should stay below 650 lines by routing module-parallel checks out");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/check-module-parallel.mjs")), "module-parallel private harness checks should live outside check-harness.mjs");

const checkProfilesModule = fs.readFileSync(path.join(repoRoot, "scripts/lib/check-profiles.mjs"), "utf8");
assert(checkProfilesModule.split(/\r?\n/).length <= 420, "check profiles should stay below 420 lines by routing legacy status dashboard rendering out");
assert(fs.existsSync(path.join(repoRoot, "scripts/lib/status-dashboard-renderer.mjs")), "legacy status dashboard renderer should live outside check-profiles.mjs");

const dashboardTaskSource = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/app-src/30-tasks.js"), "utf8");
assert(dashboardTaskSource.split(/\r?\n/).length <= 520, "dashboard task index source should stay below 520 lines by routing task detail rendering out");
assert(fs.existsSync(path.join(repoRoot, "templates/dashboard/assets/app-src/35-task-detail.js")), "dashboard task detail rendering should live outside 30-tasks.js");

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

const taskIndexCss = fs.readFileSync(path.join(repoRoot, "templates/dashboard/assets/css-src/30-task-index.css"), "utf8");
assert(taskIndexCss.split(/\r?\n/).length <= 760, "dashboard task index CSS should stay below 760 lines by routing review workspace styles out");
assert(fs.existsSync(path.join(repoRoot, "templates/dashboard/assets/css-src/35-review-workspace.css")), "dashboard review workspace CSS should live outside task index CSS");
