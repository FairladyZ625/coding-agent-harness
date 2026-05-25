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
