#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const typeIsland = path.join(repoRoot, "tests/helpers/harness-test-types.ts");
const typeConsumer = path.join(repoRoot, "tests/helpers/harness-test-type-consumer.ts");

assert(fs.existsSync(typeIsland), "test helper type island should exist");
assert(fs.existsSync(typeConsumer), "test helper type consumer should exist");

const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
assert(
  !packageJson.files.some((entry: string) => entry === "tests/" || entry.startsWith("tests/")),
  "test helper types must stay outside the package allowlist",
);

const consumerContent = fs.readFileSync(typeConsumer, "utf8");
assert(consumerContent.includes('import type {'), "test helper type consumer should use import type");
assert(!consumerContent.includes('from "../../scripts/'), "test helper type island should not depend on runtime scripts");

console.log("Test helper type island tests passed");
