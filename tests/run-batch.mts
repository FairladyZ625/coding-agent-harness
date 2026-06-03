#!/usr/bin/env node
import { pathToFileURL } from "node:url";

const suites = process.argv.slice(2);
if (suites.length === 0) {
  console.error("Usage: node tests/run-batch.mjs <suite.mjs> [...suite.mjs]");
  process.exit(1);
}

for (const suite of suites) {
  const started = performance.now();
  console.log(`[test] ${suite}`);
  await import(pathToFileURL(suite).href);
  console.log(`[test] ${suite} passed in ${formatDuration(performance.now() - started)}`);
}

function formatDuration(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(2)}s`;
}
