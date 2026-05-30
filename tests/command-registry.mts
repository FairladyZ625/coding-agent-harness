#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assert, repoRoot } from "./helpers/harness-test-utils.mjs";

const registryModule = await import(pathToFileURL(path.join(repoRoot, "dist/commands/registry.mjs")).href) as typeof import("../scripts/commands/registry.mjs");
const commandRegistryModule = await import(pathToFileURL(path.join(repoRoot, "dist/lib/command-registry.mjs")).href) as typeof import("../scripts/lib/command-registry.mjs");

const { commandRegistry } = registryModule;
const { generateCommandHelp, validateCommandRegistry } = commandRegistryModule;

const issues = validateCommandRegistry(commandRegistry);
assert(issues.length === 0, `registry integrity issues:\n${issues.join("\n")}`);

const help = generateCommandHelp(commandRegistry);
for (const expected of [
  "harness check",
  "harness status",
  "harness preset install",
  "harness module register",
  "harness new-task",
  "harness dashboard",
]) {
  assert(help.includes(expected), `generated help should include ${expected}`);
}

assert(help.includes("<target>/.coding-agent-harness/presets/<preset-id>/"), "generated help should keep preset discovery notes");
assert(help.includes("Human review confirmation is available only through local Dashboard workbench."), "generated help should keep human review confirmation note");
assert(!help.includes("harness review-confirm"), "generated help must not expose review-confirm");
