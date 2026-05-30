#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
type NoTsNocheckResult = {
  ok: boolean;
  violations: Array<{
    code: string;
    file: string;
    message: string;
  }>;
};
type CheckNoTsNocheck = (options: { repoRoot: string; allowlistPath: string }) => NoTsNocheckResult;
const { checkNoTsNocheck } = (await import(pathToFileURL(path.join(repoRoot, "dist/check-no-ts-nocheck.mjs")).href)) as {
  checkNoTsNocheck: CheckNoTsNocheck;
};

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function writeFixture(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-no-ts-nocheck-"));
const allowlistPath = path.join(fixtureRoot, "ts-nocheck-allowlist.json");
const tsNoCheck = "// @ts" + "-nocheck\n";

writeFixture(fixtureRoot, "scripts/allowed.mts", `${tsNoCheck}export const allowed = true;\n`);
writeFixture(fixtureRoot, "tests/new-unreviewed.mts", `${tsNoCheck}export const blocked = true;\n`);
writeFixture(fixtureRoot, "scripts/new-unreviewed.ts", `${tsNoCheck}export const blocked = true;\n`);
writeFixture(fixtureRoot, "scripts/clean.mts", "export const clean = true;\n");

fs.writeFileSync(
  allowlistPath,
  JSON.stringify(
    {
      files: ["scripts/allowed.mts"],
    },
    null,
    2,
  ),
);

const failed = checkNoTsNocheck({ repoRoot: fixtureRoot, allowlistPath });
assert(failed.ok === false, `unreviewed ${"@ts"}-nocheck file should fail the gate`);
assert(
  failed.violations.some((violation) => violation.file === "tests/new-unreviewed.mts" && violation.code === "unlisted-ts-nocheck"),
  `gate should report the unlisted ${"@ts"}-nocheck file`,
);
assert(
  failed.violations.some((violation) => violation.file === "scripts/new-unreviewed.ts" && violation.code === "unlisted-ts-nocheck"),
  `gate should report unlisted ${"@ts"}-nocheck in .ts files`,
);
assert(
  !failed.violations.some((violation) => violation.file === "scripts/allowed.mts"),
  "gate should allow reviewed baseline files",
);

fs.writeFileSync(
  allowlistPath,
  JSON.stringify(
    {
      files: ["scripts/allowed.mts", "tests/new-unreviewed.mts", "scripts/new-unreviewed.ts"],
    },
    null,
    2,
  ),
);

const passed = checkNoTsNocheck({ repoRoot: fixtureRoot, allowlistPath });
assert(passed.ok === true, `fully reviewed ${"@ts"}-nocheck baseline should pass:\n${passed.violations.map((violation) => violation.message).join("\n")}`);

console.log("No ts-nocheck gate tests passed");
