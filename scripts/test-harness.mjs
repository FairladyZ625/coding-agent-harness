#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const node = process.execPath;
const cli = path.join(repoRoot, "scripts/harness.mjs");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-v1-"));

function run(args, options = {}) {
  const result = spawnSync(node, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  });
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectPass(args) {
  const result = run(args);
  assert(result.status === 0, `${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function expectJson(args) {
  const result = expectPass(args);
  return JSON.parse(result.stdout);
}

expectPass(["check", "--profile", "source-package", "."]);
if (fs.existsSync(path.join(repoRoot, ".harness-private"))) {
  expectPass(["check", "--profile", "private-harness", ".harness-private"]);
}

const exampleStatus = expectJson(["status", "--json", "examples/minimal-project"]);
assert(exampleStatus.project.name === "minimal-project", "example status project name mismatch");
assert(Array.isArray(exampleStatus.tasks), "example status missing tasks array");
assert(exampleStatus.tasks[0].state === "in_progress", "task state was not normalized");
assert(Array.isArray(exampleStatus.tasks[0].phases[0].requiredEvidence), "requiredEvidence must be an array");
assert(exampleStatus.capabilities.some((capability) => capability.name === "core"), "example status missing core capability");

const dashboardPath = path.join(tmpRoot, "dashboard.html");
expectPass(["dashboard", "--out", dashboardPath, "examples/minimal-project"]);
assert(fs.existsSync(dashboardPath), "dashboard file was not created");
const dashboardHtml = fs.readFileSync(dashboardPath, "utf8");
assert(dashboardHtml.includes("Harness Dashboard"), "dashboard HTML missing title");
assert(dashboardHtml.includes("Evidence"), "dashboard HTML missing evidence section");
assert(dashboardHtml.includes("Recent Activity"), "dashboard HTML missing recent activity section");

const dryRunTarget = path.join(tmpRoot, "dry-run-target");
fs.mkdirSync(dryRunTarget);
const dryRun = expectJson(["init", "--dry-run", "--capabilities", "core,dashboard", dryRunTarget]);
assert(dryRun.dryRun === true, "init dry-run did not report dryRun true");
assert(!fs.existsSync(path.join(dryRunTarget, "AGENTS.md")), "init dry-run mutated target");

const capTarget = path.join(tmpRoot, "cap-target");
fs.mkdirSync(capTarget);
expectPass(["add-capability", "dashboard", capTarget]);
const registry = JSON.parse(fs.readFileSync(path.join(capTarget, ".harness-capabilities.json"), "utf8"));
assert(registry.capabilities.some((capability) => capability.name === "dashboard"), "add-capability missing dashboard");
assert(registry.capabilities.some((capability) => capability.name === "core"), "add-capability missing dependency core");

const mismatch = run(["init", "--capabilities", "core,module-parallel", capTarget]);
assert(mismatch.status !== 0, "init with mismatched existing capabilities should fail");

const invalidReviewTarget = path.join(tmpRoot, "invalid-review");
fs.mkdirSync(path.join(invalidReviewTarget, "docs/09-PLANNING/TASKS/bad"), { recursive: true });
fs.writeFileSync(
  path.join(invalidReviewTarget, ".harness-capabilities.json"),
  JSON.stringify({ version: 1, capabilities: [{ name: "core", state: "configured" }, { name: "review-contract", state: "configured" }] }, null, 2),
);
fs.writeFileSync(path.join(invalidReviewTarget, "docs/09-PLANNING/TASKS/bad/task_plan.md"), "# Bad\n");
fs.writeFileSync(
  path.join(invalidReviewTarget, "docs/09-PLANNING/TASKS/bad/review.md"),
  "# Review\n\n## Findings\n\n| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| R-001 | P1 | Missing sections | none | fix | no | mitigated | no | next |\n",
);
const invalidReview = run(["check", "--profile", "target-project", invalidReviewTarget]);
assert(invalidReview.status !== 0, "declared review missing required sections should fail");

const invalidVerifierTarget = path.join(tmpRoot, "invalid-verifier");
fs.mkdirSync(path.join(invalidVerifierTarget, "docs/09-PLANNING/TASKS/bad"), { recursive: true });
fs.writeFileSync(
  path.join(invalidVerifierTarget, ".harness-capabilities.json"),
  JSON.stringify({ version: 1, capabilities: [{ name: "core", state: "configured" }, { name: "review-contract", state: "configured" }] }, null, 2),
);
fs.writeFileSync(path.join(invalidVerifierTarget, "docs/09-PLANNING/TASKS/bad/task_plan.md"), "# Bad\n");
fs.writeFileSync(
  path.join(invalidVerifierTarget, "docs/09-PLANNING/TASKS/bad/review.md"),
  "# Review\n\n## Reviewer Identity\n\n| Reviewer | Type | Scope |\n| --- | --- | --- |\n| v1 | verifier | task |\n\n## Confidence Challenge\n\nVerifier reviewed this.\n\n## Evidence Checked\n\n| Evidence ID | Type | Path | Summary |\n| --- | --- | --- | --- |\n| E-001 | review | TARGET:docs/09-PLANNING/TASKS/bad/task_plan.md | checked |\n\n## Findings\n\n| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n| R-001 | P3 | Missing verifier schema | E-001 | fix | no | mitigated | no | next |\n\n## Final Confidence Basis\n\nexternal verifier reviewed this.\n",
);
const invalidVerifier = run(["check", "--profile", "target-project", invalidVerifierTarget]);
assert(invalidVerifier.status !== 0, "verifier review without template_id/verdict should fail");

const mingjingDocs = "/Users/lizeyu/Projects/mingjing-app/docs";
if (fs.existsSync(mingjingDocs)) {
  const mingjingRepo = path.dirname(mingjingDocs);
  const before = spawnSync("git", ["-C", mingjingRepo, "status", "--short", "--", "docs"], { encoding: "utf8" }).stdout;
  const mingjing = run(["status", "--json", mingjingDocs]);
  assert(mingjing.status === 0, "mingjing legacy status should be a safe-adoption warning, not a failure");
  const status = JSON.parse(mingjing.stdout);
  assert(status.project.docsOnly === true, "mingjing docs target was not detected as docsOnly");
  assert(status.mode === "legacy-compat", "mingjing docs should be legacy-compat without capability registry");
  assert(status.checkState.status === "warn", "mingjing legacy status should warn");
  expectPass(["check", "--profile", "target-project", mingjingDocs]);
  const strictStatus = run(["status", "--json", "--strict", mingjingDocs]);
  const strictCheck = run(["check", "--profile", "target-project", "--strict", mingjingDocs]);
  assert(strictStatus.status !== 0, "mingjing strict status should fail on legacy checker failures");
  assert(strictCheck.status !== 0, "mingjing strict check should fail on legacy checker failures");
  const mingjingDashboard = path.join(tmpRoot, "mingjing-dashboard.html");
  expectPass(["dashboard", "--out", mingjingDashboard, mingjingDocs]);
  assert(fs.existsSync(mingjingDashboard), "mingjing dashboard file was not created");
  const after = spawnSync("git", ["-C", mingjingRepo, "status", "--short", "--", "docs"], { encoding: "utf8" }).stdout;
  assert(before === after, "mingjing docs changed during status/check/dashboard smoke");
}

console.log("Harness v1 tests passed");
