#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
type TypeBoundaryResult = {
  ok: boolean;
  violations: Array<{ message: string }>;
};

const { checkTypeBoundaries } = await import(pathToFileURL(path.join(repoRoot, "dist/check-type-boundaries.mjs")).href) as {
  checkTypeBoundaries: (options: { repoRoot: string }) => TypeBoundaryResult;
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const expectedFiles = [
  "scripts/lib/types/impact.ts",
  "scripts/lib/types/index.ts",
  "scripts/lib/types/review.ts",
  "scripts/lib/types/snapshot.ts",
  "scripts/lib/types/task.ts",
  "scripts/lib/types/task-lifecycle.ts",
  "scripts/lib/types/task-repository.ts",
];

for (const file of expectedFiles) {
  assert(fs.existsSync(path.join(repoRoot, file)), `missing shared type island file: ${file}`);
}

const indexContent = fs.readFileSync(path.join(repoRoot, "scripts/lib/types/index.ts"), "utf8");
assert(indexContent.includes("export type ") || indexContent.includes("export interface "), "shared type index should export types only");
assert(!/\bfrom\s+["'][.]{1,2}\//.test(indexContent), "shared type index should not re-export local type files until the guard supports export type");
assert(!/export\s+\*\s+from/.test(indexContent), "shared type index should not use value-style export star");

for (const file of expectedFiles) {
  const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
  assert(!/^\s*import\s+(?!type\b)/m.test(content), `${file} should not value-import local modules`);
  assert(!/^\s*export\s+(?!type\b|interface\b)/m.test(content), `${file} should not value-export local modules`);
  assert(!/@(ts-ignore|ts-expect-error)\b|(?:^|[^A-Za-z0-9_$])(?:as\s+any|:\s*any\b)/.test(content), `${file} should not use TypeScript escape hatches`);
}

const boundary = checkTypeBoundaries({ repoRoot });
assert(boundary.ok === true, `shared type islands should satisfy static boundaries:\n${boundary.violations.map((violation) => violation.message).join("\n")}`);

console.log("Shared type island tests passed");
