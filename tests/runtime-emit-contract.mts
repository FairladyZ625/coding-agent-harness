#!/usr/bin/env node
// @ts-nocheck

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { checkRuntimeEmitContract } = await import(pathToFileURL(path.join(repoRoot, "dist/check-runtime-emit.mjs")));
const fixtureSource = path.join(repoRoot, "fixtures/runtime-emit");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeFixture(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-runtime-emit-"));
fs.cpSync(fixtureSource, fixtureRoot, { recursive: true });

const passed = checkRuntimeEmitContract({
  projectRoot: fixtureRoot,
  configPath: path.join(fixtureRoot, "tsconfig.runtime.json"),
  expectedDir: path.join(fixtureRoot, "expected"),
});
assert(passed.ok === true, `valid runtime emit fixture should pass:\n${passed.violations.map((violation) => violation.message).join("\n")}`);

const missingExpected = checkRuntimeEmitContract({
  projectRoot: fixtureRoot,
  configPath: path.join(fixtureRoot, "tsconfig.runtime.json"),
  expectedDir: path.join(fixtureRoot, "missing-expected"),
});
assert(missingExpected.ok === false, "missing expected emit directory should fail");
assert(
  missingExpected.violations.some((violation) => violation.code === "missing-expected-dir"),
  "missing expected emit directory should report a dedicated violation",
);

fs.writeFileSync(path.join(fixtureRoot, "src/commented.mts"), '// import "./leaf' + '.ts";\nconst sample = "import \\"./leaf' + '.ts\\"";\n');
const ignoredNonCode = checkRuntimeEmitContract({
  projectRoot: fixtureRoot,
  configPath: path.join(fixtureRoot, "tsconfig.runtime.json"),
  expectedDir: path.join(fixtureRoot, "expected"),
});
assert(
  !ignoredNonCode.violations.some((violation) => violation.code === "typescript-source-import"),
  "runtime emit import parser should ignore comments and string literals",
);
fs.rmSync(path.join(fixtureRoot, "src/commented.mts"));

fs.writeFileSync(path.join(fixtureRoot, "expected/leaf.mjs"), 'export const value = "drift";\n');
const failed = checkRuntimeEmitContract({
  projectRoot: fixtureRoot,
  configPath: path.join(fixtureRoot, "tsconfig.runtime.json"),
  expectedDir: path.join(fixtureRoot, "expected"),
});
assert(failed.ok === false, "runtime emit drift should fail");
assert(failed.violations.some((violation) => violation.code === "emit-drift"), "drift check should report emitted .mjs drift");

fs.writeFileSync(path.join(fixtureRoot, "src/bad.mts"), 'import "./leaf' + '.ts";\n');
const badImport = checkRuntimeEmitContract({
  projectRoot: fixtureRoot,
  configPath: path.join(fixtureRoot, "tsconfig.runtime.json"),
  expectedDir: path.join(fixtureRoot, "expected"),
});
assert(badImport.ok === false, "runtime emit contract should fail TypeScript source extension imports");
assert(badImport.violations.some((violation) => violation.code === "typescript-source-import"), "contract should report .ts source import specifiers");

const productionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-runtime-production-"));
writeFixture(
  productionRoot,
  "tsconfig.runtime.json",
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2024",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        verbatimModuleSyntax: true,
        strict: true,
        rootDir: ".",
        outDir: "tmp/runtime-emit",
        declaration: false,
        sourceMap: false,
        removeComments: false,
        skipLibCheck: true,
        types: [],
      },
      include: ["scripts/**/*.mts"],
      exclude: ["tmp"],
    },
    null,
    2,
  ),
);
writeFixture(productionRoot, "scripts/leaf.mts", 'export const productionValue: string = "emit-ok";\n');
writeFixture(productionRoot, "scripts/bin.mts", 'import { productionValue } from "./leaf.mjs";\nconsole.log(productionValue);\n');
const productionPassed = checkRuntimeEmitContract({
  projectRoot: productionRoot,
  configPath: path.join(productionRoot, "tsconfig.runtime.json"),
});
assert(
  productionPassed.ok === true,
  `default production emit check should validate TypeScript source emit:\n${productionPassed.violations.map((violation) => violation.message).join("\n")}`,
);

console.log("Runtime emit contract tests passed");
