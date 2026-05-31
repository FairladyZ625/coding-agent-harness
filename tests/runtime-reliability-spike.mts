#!/usr/bin/env node

import fs from "node:fs";
import { runRuntimeReliabilitySpikeProbe } from "./helpers/runtime-reliability-spike-effect.mjs";
import { spawnSync } from "node:child_process";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const success = await runRuntimeReliabilitySpikeProbe();
assert(success.ok === true, `expected success probe, got ${JSON.stringify(success, null, 2)}`);
assert(!fs.existsSync(success.root), "Effect acquireRelease should remove the temp root after success");
assert(!fs.existsSync(success.home), "Effect acquireRelease should remove isolated HOME after success");
assert(success.pathEntries[0].includes("harness-effect-runtime-spike-"), "isolated bin path should lead PATH");
assert(success.stdout.includes(success.home), "probe command should observe isolated HOME");

const failure = await runRuntimeReliabilitySpikeProbe({
  script: "console.error('forced failure'); process.exit(7)",
});
assert(failure.ok === false, "forced failure should produce a structured failure result");
assert(failure.failure.code === "probe-command-failed", `unexpected failure code ${failure.failure.code}`);
assert(failure.failure.status === 7, "structured failure should preserve process status");
assert(failure.failure.stderr?.includes("forced failure"), "structured failure should preserve stderr");
assert(typeof failure.root === "string", "failure result should include the temp root for cleanup evidence");
assert(!fs.existsSync(failure.root), "Effect acquireRelease should remove the temp root after command failure");

const timeout = await runRuntimeReliabilitySpikeProbe({
  timeoutMillis: 25,
  script: "setTimeout(() => console.log('late'), 1000)",
});
assert(timeout.ok === false, "slow command should produce a structured timeout result");
assert(timeout.failure.code === "probe-timeout", `unexpected timeout code ${timeout.failure.code}`);
assert(timeout.failure.message.includes("25ms"), "timeout failure should include duration");

const leakCheck = spawnSync("rg", ["-n", "from \"effect\"|from 'effect'", "scripts/lib", "scripts/commands"], {
  encoding: "utf8",
});
assert(leakCheck.status === 1, `Effect imports must not leak into runtime ports/application/domain surfaces:\n${leakCheck.stdout}\n${leakCheck.stderr}`);

console.log("Runtime reliability Effect spike tests passed");
