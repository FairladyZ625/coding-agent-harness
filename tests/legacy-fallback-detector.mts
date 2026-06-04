#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { LegacyFallbackFinding } from "../scripts/check-legacy-fallback-surfaces.mts";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const detectorModule = await import(pathToFileURL(path.join(repoRoot, "dist/check-legacy-fallback-surfaces.mjs")).href) as {
  analyzeLegacyFallbackSurfaces: (options?: {
    repoRoot?: string;
    scanRoots?: string[];
    registryPath?: string;
    packageJsonPath?: string;
    finalAudit?: boolean;
  }) => { schemaVersion: string; scannedFiles: string[]; findings: LegacyFallbackFinding[] };
  legacyFallbackScanManifest: string[];
};
const { analyzeLegacyFallbackSurfaces, legacyFallbackScanManifest } = detectorModule;

const runtimeFallbackToken = ["LEGACY", "RUNTIME", "FALLBACK"].join("_");
const inferLifecycleName = ["infer", "Lifecycle"].join("");
const inferQueuesName = ["infer", "Queues"].join("");
const inferReviewStatusName = ["infer", "ReviewStatus"].join("");
const retiredSourceFacade = ["scripts", "lib", "task-operations.mts"].join("/");
const retiredDistFacade = ["dist", "lib", "task-operations.mjs"].join("/");
const retiredExportKey = ["./lib", "task-operations"].join("/");
const rawStateField = "state";
const rawReviewStatusField = "reviewStatus";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-fallback-detector-"));

try {
  writeFixture("src/positive/raw-runtime.ts", `
export function ${inferLifecycleName}(task: { ${rawStateField}?: string }) {
  return task.${rawStateField} === "done" ? "done" : "active";
}
`);
  writeFixture("src/positive/raw-field-decision.ts", `
export function project(task: { ${rawStateField}?: string }) {
  if (task.${rawStateField} === "done") return "done";
  return "active";
}
`);
  writeFixture("src/positive/raw-field-bracket-decision.ts", `
export function project(task: { ${rawReviewStatusField}?: string }) {
  if (task["${rawReviewStatusField}"] === "agent-reviewed") return "reviewed";
  return "open";
}
`);
  writeFixture("src/positive/raw-field-destructured-decision.ts", `
export function project(task: { ${rawReviewStatusField}?: string }) {
  const { ${rawReviewStatusField} } = task;
  if (${rawReviewStatusField} === "agent-reviewed") return "reviewed";
  return "open";
}
`);
  writeFixture("src/positive/explicit-marker.ts", `
export const marker = "${runtimeFallbackToken}";
`);
  writeFixture("src/positive/retired-facade-from.ts", `
import { runTaskOperation } from "../../${retiredSourceFacade}";
console.log(runTaskOperation);
`);
  writeFixture("src/positive/retired-facade-side-effect.ts", `
import "../../${retiredSourceFacade}";
`);
  writeFixture("src/positive/retired-facade-dynamic.ts", `
await import("../../${retiredSourceFacade}");
`);
  writeFixture("src/positive/retired-facade-require.cjs", `
require("../../${retiredSourceFacade}");
`);
  writeFixture("docs-release/positive/stale-path.md", `
Use ${retiredSourceFacade} for runtime task writes.
`);
  writeFixture("src/negative/migration-only.ts", `
export function ${inferLifecycleName}() { // migration-only runtimeTruth: false
  return "migration-only";
}
`);
  writeFixture("src/negative/stable-kernel.ts", `
export function ${inferQueuesName}() { // stable-kernel pure helper
  return [];
}
`);
  writeFixture("src/negative/test-only-compat.ts", `
export function ${inferReviewStatusName}() { // test-only-compat fixture
  return "agent-reviewed";
}
`);
  writeFixture("scripts/domain/task/task-semantic-projection.mts", `
export function project(task: { ${rawStateField}?: string }) {
  if (task.${rawStateField} === "done") return "done";
  return "active";
}
`);
  writeFixture("scripts/lib/task-repository.mts", `
export function list(tasks: Array<{ ${rawStateField}?: string }>) {
  return tasks.filter((task) => task.${rawStateField} === "done");
}
`);
  writeFixture("harness-gui/src/server/scanner.ts", `
export function ${inferLifecycleName}(task: { ${rawStateField}?: string }) {
  return task.${rawStateField} === "done" ? "done" : "active";
}
`);
  writeFixture("tests/legal-raw-fixture.mts", `
export function assertProjection(item: { ${rawReviewStatusField}?: string }) {
  if (item.${rawReviewStatusField} === "confirmed") return true;
  return false;
}
`);
  writeFixture("harness-gui/node_modules/vendor/noise.js", `
if (entry.${rawStateField} === "done") console.log(entry);
`);
  writeFixture("harness-gui/dist/assets/generated.js", `
if (entry.${rawStateField} === "done") console.log(entry);
`);
  writeFixture("src/positive/mixed-runtime.ts", `
export const metadata = { schemaVersion: "legacy-migration-input/v1", runtimeTruth: false };

export function ${inferLifecycleName}() {
  return "runtime";
}
`);
  writeFixture("src/positive/adjacent-migration-runtime.ts", `
export const metadata = { schemaVersion: "legacy-migration-input/v1", runtimeTruth: false };
export function ${inferLifecycleName}() {
  return "runtime";
}
`);
  writeFixture("registry.md", `
| ID | Surface | Class | Review State | Recommended Phase |
| --- | --- | --- | --- | --- |
| RAW-1 | raw-runtime | bypass-to-migrate | open-runtime-fallback | P03 |
| OK-1 | final-helper | stable-kernel | closed | P13 |
| BAD-1 | bad-class | maybe-legacy | closed | P13 |
`);
  writeFixture("registry-multi-table.md", `
| ID | Type | Path |
| --- | --- | --- |
| REF-001 | runbook | references/project-protocol.md |

| Surface | Class | Review State | Owner | Next Phase |
| --- | --- | --- | --- | --- |
| later-runtime | bypass-to-migrate | open-runtime-fallback | architecture | P13 |
| later-bad-class | maybe-legacy | closed | architecture | P13 |
`);
  writeFixture("registry-historical-section.md", `
## Historical Seed Registry

| Surface | Class | Review State | Owner | Next Phase |
| --- | --- | --- | --- | --- |
| historical-runtime | bypass-to-migrate | open-runtime-fallback | architecture | P13 |
| historical-bad-class | maybe-legacy | open | architecture | P13 |

## Current Registry

| Surface | Class | Review State | Owner | Next Phase |
| --- | --- | --- | --- | --- |
| current-helper | stable-kernel | closed | architecture | P13 |
`);
  writeFixture("pack.json", JSON.stringify({
    main: retiredDistFacade,
    types: "dist/index.d.ts",
    bin: {
      harness: retiredDistFacade,
    },
    exports: {
      [retiredExportKey]: "./dist/lib/task-semantic-projection.mjs",
      ".": "./dist/index.mjs",
    },
    files: [
      { path: retiredDistFacade },
      { path: ".harness-private/coding-agent-harness/planning/private.md" },
      { path: "dist/lib/task-semantic-projection.mjs" },
    ],
  }, null, 2));
  writeFixture("pack-dry-run.json", JSON.stringify([{
    id: "coding-agent-harness@0.0.0",
    files: [
      { path: retiredDistFacade },
      { path: "dist/index.mjs" },
    ],
  }], null, 2));
  writeFixture("pack-export-key.json", JSON.stringify({
    exports: {
      [retiredExportKey]: "./dist/lib/task-semantic-projection.mjs",
      ".": "./dist/index.mjs",
    },
  }, null, 2));

  const report = analyzeLegacyFallbackSurfaces({
    repoRoot: tmpRoot,
    scanRoots: ["src", "docs-release"],
    registryPath: "registry.md",
    packageJsonPath: "pack.json",
    finalAudit: true,
  });
  const packReport = analyzeLegacyFallbackSurfaces({
    repoRoot: tmpRoot,
    scanRoots: [],
    packageJsonPath: "pack-dry-run.json",
  });
  const multiTableRegistryReport = analyzeLegacyFallbackSurfaces({
    repoRoot: tmpRoot,
    scanRoots: [],
    registryPath: "registry-multi-table.md",
    finalAudit: true,
  });
  const historicalRegistryReport = analyzeLegacyFallbackSurfaces({
    repoRoot: tmpRoot,
    scanRoots: ["registry-historical-section.md"],
    registryPath: "registry-historical-section.md",
    finalAudit: true,
  });
  const exportKeyReport = analyzeLegacyFallbackSurfaces({
    repoRoot: tmpRoot,
    scanRoots: [],
    packageJsonPath: "pack-export-key.json",
  });
  const selfScanReport = analyzeLegacyFallbackSurfaces({
    repoRoot,
    scanRoots: ["tests/legacy-fallback-detector.mts"],
  });
  const legalSurfaceReport = analyzeLegacyFallbackSurfaces({
    repoRoot: tmpRoot,
    scanRoots: ["scripts", "harness-gui", "tests"],
  });

  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/raw-runtime.ts");
  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/raw-field-decision.ts");
  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/raw-field-bracket-decision.ts");
  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/raw-field-destructured-decision.ts");
  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/explicit-marker.ts");
  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/mixed-runtime.ts");
  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/adjacent-migration-runtime.ts");
  expectFinding(report.findings, "retired-facade-import", "src/positive/retired-facade-from.ts");
  expectFinding(report.findings, "retired-facade-import", "src/positive/retired-facade-side-effect.ts");
  expectFinding(report.findings, "retired-facade-import", "src/positive/retired-facade-dynamic.ts");
  expectFinding(report.findings, "retired-facade-import", "src/positive/retired-facade-require.cjs");
  expectFinding(report.findings, "stale-package-export", "docs-release/positive/stale-path.md");
  expectFinding(report.findings, "stale-package-export", "pack.json");
  expectFinding(report.findings, "private-package-leak", "pack.json");
  expectFinding(report.findings, "registry-class-out-of-range", "registry.md");
  expectFinding(report.findings, "registry-p13-illegal-class", "registry.md");
  expectFinding(report.findings, "registry-open-review-state", "registry.md");
  expectFinding(multiTableRegistryReport.findings, "registry-class-out-of-range", "registry-multi-table.md");
  expectFinding(multiTableRegistryReport.findings, "registry-p13-illegal-class", "registry-multi-table.md");
  expectFinding(multiTableRegistryReport.findings, "registry-open-review-state", "registry-multi-table.md");
  assert(historicalRegistryReport.findings.length === 0, `historical seed registry section should not be final-audit authoritative; got ${JSON.stringify(historicalRegistryReport.findings, null, 2)}`);
  expectFinding(packReport.findings, "stale-package-export", "pack-dry-run.json");
  expectFinding(exportKeyReport.findings, "stale-package-export", "pack-export-key.json");
  expectNoFinding(report.findings, "src/negative/migration-only.ts");
  expectNoFinding(report.findings, "src/negative/stable-kernel.ts");
  expectNoFinding(report.findings, "src/negative/test-only-compat.ts");
  expectNoFinding(legalSurfaceReport.findings, "scripts/domain/task/task-semantic-projection.mts");
  expectNoFinding(legalSurfaceReport.findings, "scripts/lib/task-repository.mts");
  expectNoFinding(legalSurfaceReport.findings, "harness-gui/src/server/scanner.ts");
  expectNoFinding(legalSurfaceReport.findings, "tests/legal-raw-fixture.mts");
  assert(!legalSurfaceReport.scannedFiles.some((file) => file.includes("node_modules")), "detector should not scan vendored node_modules");
  assert(!legalSurfaceReport.scannedFiles.some((file) => file.includes("dist/assets")), "detector should not scan generated GUI dist assets");
  assert(selfScanReport.findings.length === 0, `detector test source must not pollute repo scans; got ${JSON.stringify(selfScanReport.findings, null, 2)}`);
  assert(report.schemaVersion === "legacy-fallback-detector/v1", "detector should expose stable schema version");
  assert(report.scannedFiles.includes("src/positive/raw-runtime.ts"), "detector should record scanned files");
  for (const root of ["harness-gui", "references", ".github", "postinstall.mjs", "run-dist.mjs"]) {
    assert(legacyFallbackScanManifest.includes(root), `scan manifest should include ${root}`);
  }

  console.log("Legacy fallback detector tests passed");
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

function writeFixture(relativePath: string, content: string): void {
  const absolutePath = path.join(tmpRoot, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content.trimStart());
}

function expectFinding(findings: LegacyFallbackFinding[], code: LegacyFallbackFinding["code"], file: string): void {
  assert(findings.some((finding) => finding.code === code && finding.file === file), `expected ${code} finding for ${file}; got ${JSON.stringify(findings, null, 2)}`);
}

function expectNoFinding(findings: LegacyFallbackFinding[], file: string): void {
  assert(!findings.some((finding) => finding.file === file), `expected no finding for ${file}; got ${JSON.stringify(findings.filter((finding) => finding.file === file), null, 2)}`);
}
