#!/usr/bin/env node
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

const unknownFlagHelp = run(["not-a-command", "--help"], { cwd: target });
assert(unknownFlagHelp.status === 0, `unknown command --help should exit 0\nSTDOUT:\n${unknownFlagHelp.stdout}\nSTDERR:\n${unknownFlagHelp.stderr}`);
assert(unknownFlagHelp.stdout.includes("Usage:"), "unknown command --help should print usage");

const unknownPositionalHelp = run(["not-a-command", "help"], { cwd: target });
assert(unknownPositionalHelp.status === 0, `unknown command help should exit 0\nSTDOUT:\n${unknownPositionalHelp.stdout}\nSTDERR:\n${unknownPositionalHelp.stderr}`);
assert(unknownPositionalHelp.stdout.includes("Usage:"), "unknown command help should print usage");

const plainUnknownCommand = run(["not-a-command"], { cwd: target });
assert(plainUnknownCommand.status === 2, `plain unknown command should exit 2\nSTDOUT:\n${plainUnknownCommand.stdout}\nSTDERR:\n${plainUnknownCommand.stderr}`);
assert(plainUnknownCommand.stdout.includes("Usage:"), "plain unknown command should print usage");

const noSideEffectCommands = [
  ["init", "--help"],
  ["add-capability", "--help"],
  ["preset", "--help"],
  ["preset", "install", "--help"],
  ["preset", "seed", "--help"],
  ["task-start", "--help"],
  ["task-log", "--help"],
  ["task-complete", "--help"],
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
assert(helpText.includes("preset action <id> <action>"), "help should document preset action runner command");
assert(helpText.includes("--allow-scripts"), "help should document explicit trust for script actions");
assert(helpText.includes("Human review confirmation is available only through local Dashboard workbench."), "help should document human review confirmation boundary");
assert(!helpText.includes("harness review-confirm"), "help must not expose review-confirm as a CLI command");
