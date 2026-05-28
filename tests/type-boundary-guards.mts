#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
type BoundaryViolation = { code: string; file: string; message: string };
type BoundaryResult = { ok: boolean; violations: BoundaryViolation[] };
type BoundaryModule = {
  checkTypeBoundaries(options: { repoRoot: string; escapeAllowlistPath?: string }): BoundaryResult;
};
const { checkTypeBoundaries } = (await import(pathToFileURL(path.join(repoRoot, "dist/check-type-boundaries.mjs")).href)) as BoundaryModule;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeFixture(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-type-boundary-"));

const tsRuntimeImport = 'import "./runtime-target' + '.ts";\n';
const mtsRuntimeImport = 'import "./runtime-target' + '.mts";\n';
const validRuntimeImport = 'import "./runtime-target' + '.mjs";\n';

writeFixture(fixtureRoot, "scripts/runtime.mjs", tsRuntimeImport);
writeFixture(fixtureRoot, "scripts/runtime-mts.mjs", mtsRuntimeImport);
writeFixture(fixtureRoot, "scripts/runtime-target.ts", "export const value = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/types/protocol.ts", "export type Protocol = { id: string };\n");
writeFixture(fixtureRoot, "scripts/type-consumer.ts", 'import type { Protocol } from "./lib/types/protocol.js";\nconst value: Protocol = { id: "ok" };\n');
writeFixture(fixtureRoot, "scripts/value-consumer.ts", 'import { Protocol } from "./lib/types/protocol.js";\nconsole.log(Protocol);\n');
writeFixture(fixtureRoot, "scripts/mts-type-consumer.mts", 'import type { Protocol } from "./lib/types/protocol.js";\nconst value: Protocol = { id: "ok" };\n');
writeFixture(fixtureRoot, "scripts/mts-value-consumer.mts", 'import { Protocol } from "./lib/types/protocol.js";\nconsole.log(Protocol);\n');
writeFixture(fixtureRoot, "scripts/mts-escape.mts", "const value = input as " + "any;\n");

const failed = checkTypeBoundaries({ repoRoot: fixtureRoot });
assert(failed.ok === false, "invalid type boundary fixture should fail");
assert(
  failed.violations.some((violation) => violation.code === "mjs-imports-ts" && violation.file === "scripts/runtime.mjs"),
  "guard should report .mjs runtime importing .ts",
);
assert(
  failed.violations.some((violation) => violation.code === "mjs-imports-ts" && violation.file === "scripts/runtime-mts.mjs"),
  "guard should report .mjs runtime importing .mts",
);
assert(
  failed.violations.some((violation) => violation.code === "types-value-import" && violation.file === "scripts/value-consumer.ts"),
  "guard should report value imports from scripts/lib/types",
);
assert(
  failed.violations.some((violation) => violation.code === "types-value-import" && violation.file === "scripts/mts-value-consumer.mts"),
  "guard should report .mts value imports from scripts/lib/types",
);
assert(
  failed.violations.some((violation) => violation.code === "ts-escape-hatch" && violation.file === "scripts/mts-escape.mts"),
  "guard should report .mts TypeScript escape hatches",
);
assert(
  !failed.violations.some((violation) => violation.file === "scripts/type-consumer.ts"),
  "guard should allow TypeScript import type from scripts/lib/types",
);
assert(
  !failed.violations.some((violation) => violation.file === "scripts/mts-type-consumer.mts"),
  "guard should allow .mts import type from scripts/lib/types",
);

fs.writeFileSync(path.join(fixtureRoot, "scripts/runtime.mjs"), validRuntimeImport);
fs.writeFileSync(path.join(fixtureRoot, "scripts/runtime-mts.mjs"), validRuntimeImport);
fs.writeFileSync(path.join(fixtureRoot, "scripts/value-consumer.ts"), 'import type { Protocol } from "./lib/types/protocol.js";\nconst value: Protocol = { id: "ok" };\n');
fs.writeFileSync(path.join(fixtureRoot, "scripts/mts-value-consumer.mts"), 'import type { Protocol } from "./lib/types/protocol.js";\nconst value: Protocol = { id: "ok" };\n');
const escapeAllowlistPath = path.join(fixtureRoot, "type-escape-allowlist.json");
fs.writeFileSync(
  escapeAllowlistPath,
  JSON.stringify(
    {
      escapes: [
        {
          file: "scripts/mts-escape.mts",
          line: 1,
          code: "ts-escape-hatch",
          reason: "test fixture reviewed baseline",
        },
      ],
    },
    null,
    2,
  ),
);

const passed = checkTypeBoundaries({ repoRoot: fixtureRoot, escapeAllowlistPath });
assert(passed.ok === true, `valid type boundary fixture should pass:\n${passed.violations.map((violation) => violation.message).join("\n")}`);

console.log("Type boundary guard tests passed");
