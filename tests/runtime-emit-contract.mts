#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
type RuntimeEmitViolation = { code: string; file?: string; message: string };
type RuntimeEmitResult = { ok: boolean; violations: RuntimeEmitViolation[] };
type RuntimeEmitModule = {
  checkRuntimeEmitContract(options: { projectRoot: string; configPath?: string; expectedDir?: string }): RuntimeEmitResult;
};
const { checkRuntimeEmitContract } = (await import(pathToFileURL(path.join(repoRoot, "dist/check-runtime-emit.mjs")).href)) as RuntimeEmitModule;
const fixtureSource = path.join(repoRoot, "fixtures/runtime-emit");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeFixture(root: string, relativePath: string, content: string): void {
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
writeFixture(
  productionRoot,
  "tsconfig.dist.json",
  JSON.stringify(
    {
      extends: "./tsconfig.runtime.json",
      compilerOptions: {
        rootDir: "scripts",
        outDir: "dist",
      },
      include: ["scripts/**/*.mts"],
      exclude: ["tmp", "dist"],
    },
    null,
    2,
  ),
);
writeFixture(productionRoot, "dist/leaf.mjs", 'export const productionValue = "emit-ok";\n');
writeFixture(productionRoot, "dist/bin.mjs", 'import { productionValue } from "./leaf.mjs";\nconsole.log(productionValue);\n');
const defaultProductionPassed = checkRuntimeEmitContract({
  projectRoot: productionRoot,
});
assert(
  defaultProductionPassed.ok === true,
  `default production emit check should compare committed dist output:\n${defaultProductionPassed.violations.map((violation) => violation.message).join("\n")}`,
);
fs.writeFileSync(path.join(productionRoot, "dist/leaf.mjs"), 'export const productionValue = "stale";\n');
const defaultProductionDrift = checkRuntimeEmitContract({
  projectRoot: productionRoot,
});
assert(defaultProductionDrift.ok === false, "default production emit check should fail stale committed dist files");
assert(
  defaultProductionDrift.violations.some((violation) => violation.code === "emit-drift" && violation.file === "leaf.mjs"),
  "default production emit check should report committed dist drift",
);
fs.writeFileSync(path.join(productionRoot, "dist/leaf.mjs"), 'export const productionValue = "emit-ok";\n');
const productionPassed = checkRuntimeEmitContract({
  projectRoot: productionRoot,
  configPath: path.join(productionRoot, "tsconfig.runtime.json"),
});
assert(
  productionPassed.ok === true,
  `default production emit check should validate TypeScript source emit:\n${productionPassed.violations.map((violation) => violation.message).join("\n")}`,
);

console.log("Runtime emit contract tests passed");
