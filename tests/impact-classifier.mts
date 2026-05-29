#!/usr/bin/env node
import { classifyImpact } from "../scripts/lib/impact-classifier.mjs";
import type { ChangedFileRecord, GateId, ImpactClassification, ImpactSurface, RuntimeLayer } from "../scripts/lib/types/impact.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function classify(records: readonly ChangedFileRecord[]): ImpactClassification {
  return classifyImpact(records);
}

function assertIncludes<T extends string>(actual: readonly T[], expected: T, message: string): void {
  assert(actual.includes(expected), `${message}; expected ${expected} in [${actual.join(", ")}]`);
}

function assertNotIncludes<T extends string>(actual: readonly T[], rejected: T, message: string): void {
  assert(!actual.includes(rejected), `${message}; did not expect ${rejected} in [${actual.join(", ")}]`);
}

function assertSurface(result: ImpactClassification, surface: ImpactSurface): void {
  assertIncludes(result.surfaces, surface, "impact should include surface");
}

function assertLayer(result: ImpactClassification, layer: RuntimeLayer): void {
  assertIncludes(result.runtimeLayers, layer, "impact should include runtime layer");
}

function assertGate(result: ImpactClassification, gate: GateId): void {
  assert(
    result.requiredGates.some((requiredGate) => requiredGate.id === gate),
    `impact should require gate ${gate}; got [${result.requiredGates.map((requiredGate) => requiredGate.id).join(", ")}]`,
  );
}

const tsRuntime = classify([{ path: "scripts/harness.mts", status: "modified" }]);
assertSurface(tsRuntime, "ts-runtime");
assertLayer(tsRuntime, "ts-source");
assertGate(tsRuntime, "typecheck");
assertGate(tsRuntime, "typecheck-guards");
assertGate(tsRuntime, "import-graph");
assertGate(tsRuntime, "dist-drift");
assertGate(tsRuntime, "temp-project-cli-smoke");
assertGate(tsRuntime, "status-json-contract");
assert(tsRuntime.compatibilityPolicyRequired, "CLI runtime changes should require compatibility policy");

const topLevelScript = classify([{ path: "scripts/check-harness.mts", status: "modified" }, { path: "scripts/postinstall.mts", status: "modified" }]);
assertSurface(topLevelScript, "ts-runtime");
assertLayer(topLevelScript, "ts-source");
assertGate(topLevelScript, "typecheck");
assertGate(topLevelScript, "dist-drift");
assert(
  !topLevelScript.requiredGates.some((gate) => gate.id === "temp-project-cli-smoke" || gate.id === "status-json-contract"),
  "generic top-level scripts should not always require CLI/status contract gates",
);

const typeIsland = classify([{ path: "scripts/lib/types/task.ts", status: "modified" }, { path: "tests/helpers/test-helper-types.mts", status: "modified" }]);
assertSurface(typeIsland, "type-island");
assertLayer(typeIsland, "ts-source");
assertGate(typeIsland, "typecheck-guards");
assertGate(typeIsland, "import-graph");

const reportContracts = classify([
  { path: "scripts/lib/types/impact.ts", status: "modified" },
  { path: "scripts/lib/types/task-scanner.ts", status: "modified" },
  { path: "scripts/lib/types/check-profiles.ts", status: "modified" },
  { path: "scripts/lib/check-profiles.mts", status: "modified" },
  { path: "scripts/lib/task-review-model.mts", status: "modified" },
  { path: "scripts/lib/task-index.mts", status: "modified" },
]);
assertSurface(reportContracts, "type-island");
assertSurface(reportContracts, "dashboard-data");
assertGate(reportContracts, "status-json-contract");
assert(reportContracts.compatibilityPolicyRequired, "status, scanner, and impact report schema changes should require compatibility policy");

const runtimeBuild = classify([{ path: "tsconfig.json", status: "modified" }, { path: "tsconfig.dist.json", status: "modified" }, { path: "dist/harness.mjs", status: "modified" }]);
assertSurface(runtimeBuild, "runtime-build");
assertSurface(runtimeBuild, "package-boundary");
assertLayer(runtimeBuild, "runtime-emit");
assertLayer(runtimeBuild, "ts-source");
assertLayer(runtimeBuild, "package-runtime");
assertGate(runtimeBuild, "runtime-emit-contract");
assertGate(runtimeBuild, "dist-build-pipeline");
assertGate(runtimeBuild, "dist-observation");
assertGate(runtimeBuild, "dist-drift");
assertGate(runtimeBuild, "pack-dry-run");
assertGate(runtimeBuild, "source-package-check");
assert(runtimeBuild.compatibilityPolicyRequired, "dist/package runtime layout changes should require compatibility policy");

const builtTestRunner = classify([{ path: "tests/run-all.mts", status: "modified" }, { path: "tests/impact-classifier.mts", status: "added" }]);
assertSurface(builtTestRunner, "built-test-runner");
assertLayer(builtTestRunner, "built-test");
assertLayer(builtTestRunner, "ts-source");
assertGate(builtTestRunner, "built-tests");

const dashboardData = classify([{ path: "scripts/lib/dashboard-data.mts", status: "modified" }, { path: "tests/golden/dashboard/status.json", status: "modified" }]);
assertSurface(dashboardData, "dashboard-data");
assertSurface(dashboardData, "fixture-golden");
assertLayer(dashboardData, "ts-source");
assertGate(dashboardData, "dashboard-data-golden");
assertGate(dashboardData, "status-json-contract");
assertGate(dashboardData, "dashboard-smoke");
assert(dashboardData.compatibilityPolicyRequired, "dashboard data changes should require compatibility policy");

const templates = classify([{ path: "templates/planning/task_plan.md", status: "modified" }, { path: "templates-zh-CN/planning/brief.md", status: "modified" }]);
assertSurface(templates, "template-schema");
assertLayer(templates, "installed-target");
assertGate(templates, "target-project-check");
assertGate(templates, "compatibility-policy");
assert(templates.compatibilityPolicyRequired, "template schema changes should require compatibility policy");

const dashboardUi = classify([{ path: "templates/dashboard/assets/app-src/30-tasks.js", status: "modified" }]);
assertSurface(dashboardUi, "dashboard-ui");
assertNotIncludes(dashboardUi.surfaces, "template-schema", "dashboard assets should stay in the UI surface");
assertLayer(dashboardUi, "installed-target");
assertGate(dashboardUi, "dashboard-smoke");

const docsRelease = classify([{ path: "docs-release/guides/contributing.md", status: "modified" }]);
assertSurface(docsRelease, "docs-release");
assertLayer(docsRelease, "not-runtime");
assertGate(docsRelease, "docs-leak-link-check");
assertGate(docsRelease, "source-package-check");
assert(!docsRelease.compatibilityPolicyRequired, "ordinary docs-release changes should not require compatibility policy");

const packageBoundary = classify([{ path: "package.json", status: "modified" }, { path: "postinstall.mjs", status: "modified" }]);
assertSurface(packageBoundary, "package-boundary");
assertLayer(packageBoundary, "package-runtime");
assertGate(packageBoundary, "pack-dry-run");
assertGate(packageBoundary, "source-package-check");
assert(packageBoundary.compatibilityPolicyRequired, "package layout changes should require compatibility policy");

const presets = classify([
  { path: "presets/legacy-migration/preset.yaml", status: "modified" },
  { path: "scripts/lib/core-shared.mts", status: "modified" },
  { path: "scripts/lib/types/preset.ts", status: "modified" },
  { path: "scripts/lib/preset-registry.mts", status: "modified" },
  { path: "scripts/commands/preset-command.mts", status: "modified" },
]);
assertSurface(presets, "preset-package");
assertSurface(presets, "ts-runtime");
assertSurface(presets, "type-island");
assertLayer(presets, "installed-target");
assertLayer(presets, "ts-source");
assertGate(presets, "preset-contract");
assert(presets.compatibilityPolicyRequired, "preset registry/install changes should require compatibility policy");

const migrationLegacy = classify([{ path: "scripts/commands/migration-command.mts", status: "modified" }, { path: "tests/hard-cutover-guards.mts", status: "modified" }]);
assertSurface(migrationLegacy, "migration-legacy");
assertLayer(migrationLegacy, "ts-source");
assertGate(migrationLegacy, "migration-fixture");
assert(migrationLegacy.compatibilityPolicyRequired, "migration and hard-cutover surfaces should require compatibility policy");

const ciEvidence = classify([{ path: ".github/workflows/ci.yml", status: "modified" }, { path: ".github/pull_request_template.md", status: "modified" }]);
assertSurface(ciEvidence, "ci-pr-evidence");
assertLayer(ciEvidence, "not-runtime");
assertGate(ciEvidence, "workflow-lint");
assertGate(ciEvidence, "maintainer-review");
assert(ciEvidence.compatibilityPolicyRequired, "PR evidence template changes should require compatibility policy");

const rootContributorDocs = classify([{ path: "README.zh-CN.md", status: "modified" }, { path: "CONTRIBUTING.md", status: "modified" }]);
assertSurface(rootContributorDocs, "root-contributor-docs");
assertGate(rootContributorDocs, "docs-leak-link-check");
assertGate(rootContributorDocs, "source-package-check");
assertGate(rootContributorDocs, "command-consistency");

const skillReference = classify([{ path: "SKILL.md", status: "modified" }, { path: "references/worktree-standard.md", status: "modified" }, { path: "skills/example/SKILL.md", status: "added" }]);
assertSurface(skillReference, "skill-reference-distribution");
assertLayer(skillReference, "installed-target");
assertGate(skillReference, "pack-dry-run");

const fixtures = classify([{ path: "examples/minimal-project/AGENTS.md", status: "modified" }, { path: "fixtures/snapshot-matrix.json", status: "modified" }, { path: "tests/fixtures/legacy-project/README.md", status: "modified" }]);
assertSurface(fixtures, "fixture-golden");
assertLayer(fixtures, "installed-target");
assertGate(fixtures, "fixture-manifest");
assertGate(fixtures, "target-project-check");

const multiRepo = classify([{ path: "docs-release/guides/parent-control-repository-pattern.md", status: "modified" }]);
assertSurface(multiRepo, "docs-release");
assertSurface(multiRepo, "multi-repo-contract");
assertGate(multiRepo, "maintainer-review");

const gui = classify([{ path: "harness-gui", status: "modified", isSubmodule: true }, { path: "harness-gui/package.json", status: "modified" }]);
assertSurface(gui, "gui-submodule");
assertGate(gui, "gui-check");

const privateLocalOnly = classify([
  { path: "AGENTS.md", status: "added" },
  { path: ".harness-private", status: "added" },
  { path: ".harness-private/AGENTS.md", status: "modified" },
  { path: "docs", status: "added" },
  { path: "docs/private-plan.md", status: "added" },
]);
assertSurface(privateLocalOnly, "private-local-only");
assertLayer(privateLocalOnly, "not-runtime");
assertGate(privateLocalOnly, "source-package-check");
assertGate(privateLocalOnly, "maintainer-review");
assert(privateLocalOnly.unknownSurfaces.length === 0, "known private local-only paths should not be reported as unknown");

const unknown = classify([{ path: "experimental/new-surface.txt", status: "untracked" }, { path: "/Users/example/absolute.txt", status: "modified" }]);
assertSurface(unknown, "unknown");
assertLayer(unknown, "not-runtime");
assertGate(unknown, "maintainer-review");
assert(unknown.unknownSurfaces.length === 2, `unknown paths should be tracked individually, got ${unknown.unknownSurfaces.length}`);

const rename = classify([{ path: "templates/new-task.md", oldPath: "docs/old-private-task.md", status: "renamed" }]);
assertSurface(rename, "template-schema");
assertSurface(rename, "private-local-only");
assert(rename.changedFiles[0]?.oldPath === "docs/old-private-task.md", "rename should preserve normalized oldPath");

const deletedAndTypechange = classify([{ path: "scripts/lib/task-scanner.mts", status: "deleted" }, { path: "harness-gui", status: "typechange", isSubmodule: true }]);
assertSurface(deletedAndTypechange, "ts-runtime");
assertSurface(deletedAndTypechange, "dashboard-data");
assertSurface(deletedAndTypechange, "gui-submodule");
assertGate(deletedAndTypechange, "gui-check");
assert(deletedAndTypechange.changedFiles.some((file) => file.status === "deleted"), "deleted status should be preserved in classified files");
assert(deletedAndTypechange.changedFiles.some((file) => file.status === "typechange"), "typechange status should be preserved in classified files");

const gateSurface = tsRuntime.requiredGates.find((gate) => gate.id === "typecheck");
assert(gateSurface?.surfaces.includes("ts-runtime") === true, "required gates should include the surfaces that triggered them");
const cliSmokeGate = tsRuntime.requiredGates.find((gate) => gate.id === "temp-project-cli-smoke");
assert(cliSmokeGate?.surfaces.includes("ts-runtime") === true, "path-local CLI gates should still report their triggering runtime surface");

const lifecycleContract = classify([{ path: "scripts/lib/task-lifecycle.mts", status: "modified" }, { path: "scripts/lib/types/task-lifecycle.ts", status: "modified" }]);
assertSurface(lifecycleContract, "ts-runtime");
assertSurface(lifecycleContract, "type-island");
assertGate(lifecycleContract, "status-json-contract");
assert(lifecycleContract.compatibilityPolicyRequired, "task lifecycle output shape changes should require compatibility policy");

console.log("Impact classifier tests passed");
