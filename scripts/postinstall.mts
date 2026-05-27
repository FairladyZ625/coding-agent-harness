#!/usr/bin/env node
// @ts-nocheck

import { seedBundledPresets } from "./lib/harness-core.mjs";

if (process.env.CODING_AGENT_HARNESS_SKIP_POSTINSTALL === "1") process.exit(0);

try {
  const result = seedBundledPresets({ scope: "user" });
  const changed = result.created + result.overwritten;
  const summary = changed > 0 ? `${changed} bundled presets installed` : `${result.skipped} bundled presets already present`;
  console.log(`coding-agent-harness postinstall: ${summary} at ${result.target}`);
} catch (error) {
  console.warn(`coding-agent-harness postinstall: preset seed skipped (${error.message})`);
}
