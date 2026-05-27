#!/usr/bin/env node
// @ts-nocheck

import fs from "node:fs";
import path from "node:path";
import { assert, expectPass, run, tmpRoot } from "./helpers/harness-test-utils.mjs";

const target = path.join(tmpRoot, "cli-help-target");
fs.mkdirSync(target, { recursive: true });

const topLevelHelp = expectPass(["--help"]);
assert(topLevelHelp.stdout.includes("Usage:"), "top-level --help should print usage");

const subcommandHelp = run(["new-task", "--help"], { cwd: target });
assert(subcommandHelp.status === 0, `new-task --help should exit 0\nSTDOUT:\n${subcommandHelp.stdout}\nSTDERR:\n${subcommandHelp.stderr}`);
assert(subcommandHelp.stdout.includes("Usage:"), "new-task --help should print usage");
assert(!fs.existsSync(path.join(target, "docs")), "new-task --help must not create target docs");

const positionalSubcommandHelp = run(["new-task", "help"], { cwd: target });
assert(positionalSubcommandHelp.status === 0, `new-task help should exit 0\nSTDOUT:\n${positionalSubcommandHelp.stdout}\nSTDERR:\n${positionalSubcommandHelp.stderr}`);
assert(positionalSubcommandHelp.stdout.includes("Usage:"), "new-task help should print usage");
assert(!fs.existsSync(path.join(target, "docs")), "new-task help must not create target docs");

const noSideEffectCommands = [
  ["init", "--help"],
  ["add-capability", "--help"],
  ["preset", "--help"],
  ["preset", "install", "--help"],
  ["preset", "seed", "--help"],
  ["task-start", "--help"],
  ["task-log", "--help"],
  ["task-complete", "--help"],
  ["review-confirm", "--help"],
  ["lesson-promote", "--help"],
  ["install-user", "--help"],
];

for (const command of noSideEffectCommands) {
  const beforeEntries = fs.readdirSync(target).sort();
  const result = run(command, { cwd: target });
  assert(result.status === 0, `${command.join(" ")} should exit 0\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  assert(result.stdout.includes("Usage:"), `${command.join(" ")} should print usage`);
  const afterEntries = fs.readdirSync(target).sort();
  assert(JSON.stringify(afterEntries) === JSON.stringify(beforeEntries), `${command.join(" ")} must not modify the target directory`);
}

const presetList = expectPass(["preset", "list"]);
assert(presetList.stdout.includes(" - "), "preset list should show each preset purpose in text mode");

const helpText = topLevelHelp.stdout;
assert(helpText.includes("<target>/.coding-agent-harness/presets/<preset-id>/"), "help should document project preset root");
assert(helpText.includes("~/.coding-agent-harness/presets/<preset-id>/"), "help should document user preset root");
assert(helpText.includes("bundled package"), "help should document bundled preset fallback");
assert(helpText.includes("preset list --json"), "help should point agents to preset discovery command");
assert(helpText.includes("preset seed"), "help should document bundled preset seeding");
