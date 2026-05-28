#!/usr/bin/env node
// @ts-nocheck

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { checkDistObservation } = await import(pathToFileURL(path.join(repoRoot, "dist/check-dist-observation.mjs")));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const observation = spawnSync("npm", ["run", "observe:dist", "--", "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
assert(observation.status === 0, `dist observation gate should pass\nSTDOUT:\n${observation.stdout}\nSTDERR:\n${observation.stderr}`);

const result = JSON.parse(extractLastJsonObject(observation.stdout));
assert(result.ok === true, "dist observation JSON should report ok");
assert(result.observations.packageRuntime.bin === "dist/harness.mjs", "package bin must be dist");
assert(result.observations.packageRuntime.scripts.postinstall === "node dist/postinstall.mjs", "postinstall must be dist");
assert(result.observations.packageRuntime.scripts["observe:dist"] === "node dist/check-dist-observation.mjs --skip-pack --skip-install-smoke", "observe:dist script must be dist");
assert(result.observations.inventory.scriptShims === 0, "historical scripts shims should be removed after PR-28");
assert(result.observations.inventory.testShims === 0, "historical tests shims should be removed after PR-28");
assert(result.observations.inventory.unpairedScriptShims === 0, "all historical script shims should have .mts source twins");
assert(result.observations.inventory.unpairedTestShims === 0, "all historical test shims should have .mts source twins");
assert(result.observations.commandMatrix.every((entry) => entry.status === 0), "dist command matrix should pass");

const releaseResult = checkDistObservation({ projectRoot: repoRoot });
assert(releaseResult.ok === true, `release observation should pass:\n${JSON.stringify(releaseResult.failures, null, 2)}`);
assert(releaseResult.observations.package.hasDistHarness === true, "package should include dist harness");
assert(releaseResult.observations.package.distHarnessExecutable === true, "package dist harness should be executable");
assert(releaseResult.observations.package.hasDistPostinstall === true, "package should include dist postinstall");
assert(releaseResult.observations.package.hasDistObservationGate === true, "package should include dist observation gate");
assert(releaseResult.observations.package.hasScriptsHarness === false, "package should not retain historical scripts harness shim after PR-28");
assert(releaseResult.observations.package.hasScripts === false, "package should not include scripts after PR-28");
assert(releaseResult.observations.package.hasTests === false, "package should not include tests");
assert(releaseResult.observations.installSmoke.bin === "dist/harness.mjs", "installed package bin must be dist");
assert(releaseResult.observations.installSmoke.binExecutable === true, "installed package bin must be executable");
assert(releaseResult.observations.installSmoke.nodeVersion.startsWith("v24."), "installed package smoke must run on Node 24");
assert(releaseResult.observations.installSmoke.postinstall === "node dist/postinstall.mjs", "installed postinstall must be dist");
assert(releaseResult.observations.installSmoke.observeDist === "node dist/check-dist-observation.mjs --skip-pack --skip-install-smoke", "installed observe:dist must be dist");
assert(releaseResult.observations.installSmoke.binTarget.includes("dist/harness.mjs"), "installed .bin/harness should point to dist harness");
assert(releaseResult.observations.installSmoke.hasTests === false, "installed package should not contain tests");
assert(releaseResult.observations.installSmoke.hasScripts === false, "installed package should not contain scripts");
assert(releaseResult.observations.installSmoke.scriptsDisabled.length === 0, "installed package should have no scripts tree to disable after PR-28");
assert(releaseResult.observations.installSmoke.steps.some((entry) => entry.id === "installed-source-check"), "installed command matrix should include source check");
assert(releaseResult.observations.installSmoke.steps.some((entry) => entry.id === "installed-target-check"), "installed command matrix should include target check");
assert(releaseResult.observations.installSmoke.steps.some((entry) => entry.id === "installed-migrate-structure-plan"), "installed command matrix should include migrate-structure plan");
assert(releaseResult.observations.installSmoke.steps.some((entry) => entry.id === "installed-dashboard"), "installed command matrix should include dashboard");
assert(releaseResult.observations.installSmoke.steps.every((entry) => entry.status === 0), "installed package smoke steps should pass");
assert(releaseResult.observations.installSmoke.observationOk === true, "installed dist observation should pass");

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dist-observation-fixture-"));
fs.writeFileSync(
  path.join(fixtureRoot, "package.json"),
  JSON.stringify({
    bin: { harness: "scripts/harness.mjs" },
    scripts: { postinstall: "node scripts/postinstall.mjs" },
  }, null, 2),
);
const failed = checkDistObservation({ projectRoot: fixtureRoot, runPack: false, runInstallSmoke: false, runCommandMatrix: false });
assert(failed.ok === false, "fixture with scripts runtime should fail observation gate");
assert(failed.failures.some((failure) => failure.code === "package-bin-not-dist"), "gate should reject non-dist bin");
assert(failed.failures.some((failure) => failure.code === "package-script-postinstall-not-dist"), "gate should reject non-dist postinstall");

console.log("Dist observation gate tests passed");

function extractLastJsonObject(stdout) {
  const start = stdout.lastIndexOf("\n{");
  const json = start === -1 ? stdout.trim() : stdout.slice(start + 1).trim();
  assert(json.startsWith("{"), `expected JSON object in stdout:\n${stdout}`);
  return json;
}
