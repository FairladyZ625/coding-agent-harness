#!/usr/bin/env node

import { commandRegistry } from "./commands/registry.mjs";
import { dispatchCommand } from "./lib/command-registry.mjs";

await Promise.resolve(dispatchCommand(commandRegistry, process.argv.slice(2))).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
