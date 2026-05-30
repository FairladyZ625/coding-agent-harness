#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const contractRoot = path.join(repoRoot, "docs-release/architecture/document-contract-kernel");
const contractPath = path.join(contractRoot, "README.md");
const liteOverlayPath = path.join(contractRoot, "products/lite-skill-overlay.md");
const fullOverlayPath = path.join(contractRoot, "products/full-skill-overlay.md");
const forbiddenSurfacesPath = path.join(contractRoot, "products/lite-forbidden-surfaces.txt");
const checkerPath = path.join(repoRoot, "scripts/check-lite-forbidden-surfaces.mts");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readRequired(relativePath: string): string {
  const absolutePath = path.join(repoRoot, relativePath);
  assert(fs.existsSync(absolutePath), `${relativePath} should exist`);
  return fs.readFileSync(absolutePath, "utf8");
}

const contract = readRequired("docs-release/architecture/document-contract-kernel/README.md");
for (const required of [
  "Document Contract Kernel",
  "Compatibility Matrix",
  "Change Classification",
  "Lite Forbidden Surfaces",
  "Lite to Full Upgrade Path",
  "Source, Overlay, Generator Path",
  "Document Contract Kernel | Product / Skill contract",
  "Domain Kernel | Runtime domain",
  "Infrastructure Kernel | Runtime infrastructure",
]) {
  assert(contract.includes(required), `contract should include ${required}`);
}

for (const concept of ["Agent entry", "Project context", "Task package", "Progress evidence", "Review", "Walkthrough", "Regression", "Lessons"]) {
  assert(contract.includes(concept), `contract should define shared concept: ${concept}`);
}

for (const matrixSurface of ["AGENTS.md", "context/", "task_plan.md", "progress.md", "walkthrough.md", "review.md", "visual_map.md", "harness.yaml"]) {
  assert(contract.includes(matrixSurface), `compatibility matrix should classify ${matrixSurface}`);
}

const liteOverlay = readRequired("docs-release/architecture/document-contract-kernel/products/lite-skill-overlay.md");
assert(liteOverlay.includes("document-only"), "Lite overlay should position Lite as document-only");
assert(liteOverlay.includes("AGENTS.md"), "Lite overlay should keep the shared agent entry concept");
assert(liteOverlay.includes("tasks/"), "Lite overlay should keep the shared task package concept");

const fullOverlay = readRequired("docs-release/architecture/document-contract-kernel/products/full-skill-overlay.md");
assert(fullOverlay.includes("Document Contract Kernel"), "Full overlay should reference the shared kernel");
assert(fullOverlay.includes("Full-only"), "Full overlay should keep Full-only sections explicit");

const forbiddenSurfaces = readRequired("docs-release/architecture/document-contract-kernel/products/lite-forbidden-surfaces.txt")
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#"));
assert(forbiddenSurfaces.length >= 10, "Lite forbidden-surface list should be substantial");
assert(
  forbiddenSurfaces.some((line) => line.includes("npx") && line.includes("coding-agent-harness")),
  "Lite forbidden-surface list should block npx coding-agent-harness variants",
);
assert(
  forbiddenSurfaces.some((line) => /generated.*governance|generated.*indexes/.test(line)),
  "Lite forbidden-surface list should block generated governance and generated indexes",
);

const checkResult = spawnSync(process.execPath, [checkerPath, "--repo-root", repoRoot], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert(checkResult.status === 0, `Lite forbidden-surface check failed\nSTDOUT:\n${checkResult.stdout}\nSTDERR:\n${checkResult.stderr}`);

const negativeRepoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lite-forbidden-negative-"));
const negativeProductDir = path.join(negativeRepoRoot, "docs-release/architecture/document-contract-kernel/products");
fs.mkdirSync(negativeProductDir, { recursive: true });
fs.copyFileSync(forbiddenSurfacesPath, path.join(negativeProductDir, "lite-forbidden-surfaces.txt"));
fs.writeFileSync(
  path.join(negativeProductDir, "lite-skill-overlay.md"),
  [
    "# Lite Negative Fixture",
    "",
    "This Lite source must not suggest npx coding-agent-harness.",
    "It must not rely on generated governance files.",
    "It must not ask agents to inspect generated indexes.",
    "",
  ].join("\n"),
);
const negativeResult = spawnSync(process.execPath, [checkerPath, "--repo-root", negativeRepoRoot], {
  cwd: repoRoot,
  encoding: "utf8",
});
assert(negativeResult.status !== 0, "Lite forbidden-surface check should fail for npx and generated governance/indexes fixtures");
assert(negativeResult.stderr.includes("npx coding-agent-harness"), "negative fixture should report npx coding-agent-harness");
assert(negativeResult.stderr.includes("generated governance"), "negative fixture should report generated governance");
assert(negativeResult.stderr.includes("generated indexes"), "negative fixture should report generated indexes");

const skill = readRequired("SKILL.md");
assert(skill.includes("Document Contract Kernel"), "Full SKILL.md should point to the Document Contract Kernel");
assert(skill.includes("docs-release/architecture/document-contract-kernel/README.md"), "Full SKILL.md should cite the public contract path");

for (const absolutePath of [contractPath, liteOverlayPath, fullOverlayPath, forbiddenSurfacesPath]) {
  assert(fs.existsSync(absolutePath), `${path.relative(repoRoot, absolutePath)} should exist`);
}

console.log("Document Contract Kernel tests passed");
