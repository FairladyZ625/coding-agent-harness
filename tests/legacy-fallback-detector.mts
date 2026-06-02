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
};
const { analyzeLegacyFallbackSurfaces } = detectorModule;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "legacy-fallback-detector-"));

try {
  writeFixture("src/positive/raw-runtime.ts", `
export function inferLifecycle(task: { state?: string }) {
  return task.state === "done" ? "done" : "active";
}
`);
  writeFixture("src/positive/explicit-marker.ts", `
export const marker = "LEGACY_RUNTIME_FALLBACK";
`);
  writeFixture("src/positive/retired-facade.ts", `
import { runTaskOperation } from "../../scripts/lib/task-operations.mts";
console.log(runTaskOperation);
`);
  writeFixture("docs-release/positive/stale-path.md", `
Use scripts/lib/task-operations.mts for runtime task writes.
`);
  writeFixture("src/negative/migration-only.ts", `
export const metadata = { schemaVersion: "legacy-migration-input/v1", runtimeTruth: false };
export function inferLifecycle() {
  return "migration-only";
}
`);
  writeFixture("src/negative/stable-kernel.ts", `
// stable-kernel pure helper
export function inferQueues() {
  return [];
}
`);
  writeFixture("src/negative/test-only-compat.ts", `
// test-only-compat fixture
export function inferReviewStatus() {
  return "agent-reviewed";
}
`);
  writeFixture("registry.md", `
| Surface | Class | Review State |
| --- | --- | --- |
| raw-runtime | bypass-to-migrate | open-runtime-fallback |
| final-helper | stable-kernel | closed |
| bad-class | maybe-legacy | closed |
`);
  writeFixture("pack.json", JSON.stringify({
    files: [
      { path: "dist/lib/task-operations.mjs" },
      { path: ".harness-private/coding-agent-harness/planning/private.md" },
      { path: "dist/lib/task-semantic-projection.mjs" },
    ],
  }, null, 2));

  const report = analyzeLegacyFallbackSurfaces({
    repoRoot: tmpRoot,
    scanRoots: ["src", "docs-release"],
    registryPath: "registry.md",
    packageJsonPath: "pack.json",
    finalAudit: true,
  });

  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/raw-runtime.ts");
  expectFinding(report.findings, "legacy-raw-runtime-fallback", "src/positive/explicit-marker.ts");
  expectFinding(report.findings, "retired-facade-import", "src/positive/retired-facade.ts");
  expectFinding(report.findings, "stale-package-export", "docs-release/positive/stale-path.md");
  expectFinding(report.findings, "stale-package-export", "pack.json");
  expectFinding(report.findings, "private-package-leak", "pack.json");
  expectFinding(report.findings, "registry-class-out-of-range", "registry.md");
  expectFinding(report.findings, "registry-p13-illegal-class", "registry.md");
  expectFinding(report.findings, "registry-open-review-state", "registry.md");
  expectNoFinding(report.findings, "src/negative/migration-only.ts");
  expectNoFinding(report.findings, "src/negative/stable-kernel.ts");
  expectNoFinding(report.findings, "src/negative/test-only-compat.ts");
  assert(report.schemaVersion === "legacy-fallback-detector/v1", "detector should expose stable schema version");
  assert(report.scannedFiles.includes("src/positive/raw-runtime.ts"), "detector should record scanned files");

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
