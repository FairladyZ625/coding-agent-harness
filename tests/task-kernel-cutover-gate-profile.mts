#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const profileModule = await import(pathToFileURL(path.join(repoRoot, "dist/lib/task-kernel-cutover-gate-profile.mjs")).href) as typeof import("../scripts/lib/task-kernel-cutover-gate-profile.mts");
const {
  evaluateTaskKernelCutoverEvidenceEnvelope,
  getTaskKernelCutoverGateProfile,
} = profileModule;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const tk11Profile = getTaskKernelCutoverGateProfile("TK11");
const gateIds = tk11Profile.map((gate) => gate.id);

for (const required of [
  "git-diff-check",
  "typecheck",
  "no-production-legacy-dependency",
  "no-hidden-fallback",
  "projection-no-data-loss",
  "write-scope-transaction",
  "human-review-boundary",
  "package-facade-protection",
  "generated-surface-read-only",
  "adapter-thinness",
  "preset-migration-split",
  "test-runner-viability",
  "divergence-classification",
] as const) {
  assert(gateIds.includes(required), `TK11 profile should include ${required}`);
}

const adapterThinness = tk11Profile.find((gate) => gate.id === "adapter-thinness");
assert(adapterThinness?.commands.some((command) => command.includes("task-kernel-cli-adapter-comparison")), "adapter thinness should include CLI adapter comparison");
assert(adapterThinness?.commands.some((command) => command.includes("task-kernel-http-adapter")), "adapter thinness should include HTTP adapter coverage");

const projectionNoDataLoss = tk11Profile.find((gate) => gate.id === "projection-no-data-loss");
assert(projectionNoDataLoss?.commands.some((command) => command.includes("task-kernel-oracle-parity")), "projection gate should include oracle parity");
assert(projectionNoDataLoss?.commands.some((command) => command.includes("task-kernel-dashboard-gui-query-parity")), "projection gate should include Dashboard/GUI parity");

const presetSplit = tk11Profile.find((gate) => gate.id === "preset-migration-split");
assert(presetSplit?.commands.some((command) => command.includes("preset-action-runner")), "preset split should include preset action runner");
assert(presetSplit?.commands.some((command) => command.includes("runtime-reliability-spike")), "preset split should include runtime reliability Effect boundary");

const humanReviewBoundary = tk11Profile.find((gate) => gate.id === "human-review-boundary");
assert(humanReviewBoundary?.proves.includes("absent human confirmation is residual"), "human review boundary should not require human confirmation as a cutover blocker");

const passingEnvelope = {
  schemaVersion: "task-kernel-cutover-evidence-envelope/v1" as const,
  profile: "TK11" as const,
  results: tk11Profile.map((gate) => ({ gateId: gate.id, status: "pass" as const, evidence: `command:${gate.commands[0]}:passed` })),
  residuals: [
    {
      id: "human-review-confirmation",
      classification: "optional-human-review" as const,
      evidence: "User policy: human review may happen later and must not block Task Kernel cutover.",
    },
  ],
};
const passing = evaluateTaskKernelCutoverEvidenceEnvelope(passingEnvelope);
assert(passing.readyForTk12, `complete TK11 envelope should pass: ${JSON.stringify(passing.findings, null, 2)}`);

const missingGate = evaluateTaskKernelCutoverEvidenceEnvelope({
  ...passingEnvelope,
  results: passingEnvelope.results.filter((result) => result.gateId !== "projection-no-data-loss"),
});
assert(!missingGate.readyForTk12, "missing projection no-data-loss gate should fail");
assert(missingGate.findings.some((finding) => finding.code === "missing-required-gate" && finding.gateId === "projection-no-data-loss"), "missing gate should be reported");

const waivedGate = evaluateTaskKernelCutoverEvidenceEnvelope({
  ...passingEnvelope,
  results: passingEnvelope.results.map((result) => result.gateId === "human-review-boundary" ? { ...result, status: "waived" as const } : result),
});
assert(!waivedGate.readyForTk12, "human review boundary gate must be proven, not waived");
assert(waivedGate.findings.some((finding) => finding.code === "waived-required-gate" && finding.gateId === "human-review-boundary"), "waived human review boundary should be reported");

const badResidual = evaluateTaskKernelCutoverEvidenceEnvelope({
  ...passingEnvelope,
  residuals: [{ id: "tk12-delete-runtime", classification: "deferred-with-expiry" as const }],
});
assert(!badResidual.readyForTk12, "deferred residual without owner/expiry/close path should fail");
assert(badResidual.findings.some((finding) => finding.code === "residual-missing-owner"), "deferred residual owner should be required");
assert(badResidual.findings.some((finding) => finding.code === "residual-missing-expiry"), "deferred residual expiry should be required");
assert(badResidual.findings.some((finding) => finding.code === "residual-missing-close-path"), "deferred residual close path should be required");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task-kernel-cutover-gates-"));
try {
  const passingEnvelopePath = path.join(tmpRoot, "tk11-passing-envelope.json");
  const waivedEnvelopePath = path.join(tmpRoot, "tk11-waived-envelope.json");
  fs.writeFileSync(passingEnvelopePath, JSON.stringify(passingEnvelope, null, 2));
  fs.writeFileSync(waivedEnvelopePath, JSON.stringify({
    ...passingEnvelope,
    results: passingEnvelope.results.map((result) => result.gateId === "test-runner-viability" ? { ...result, status: "not-run" } : result),
  }, null, 2));

  const profileCli = spawnSync(process.execPath, ["dist/check-task-kernel-cutover-gates.mjs", "--profile", "TK11", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(profileCli.status === 0, `profile CLI should exit 0; stderr=${profileCli.stderr}`);
  assert(profileCli.stdout.includes("task-kernel-cutover-gate-profile/v1"), "profile CLI should emit the profile schema");
  assert(profileCli.stdout.includes("preset-migration-split"), "profile CLI should include preset split gate");

  const passingCli = spawnSync(process.execPath, ["dist/check-task-kernel-cutover-gates.mjs", "--envelope", passingEnvelopePath, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(passingCli.status === 0, `passing CLI envelope should exit 0; stderr=${passingCli.stderr}`);
  assert(passingCli.stdout.includes("\"readyForTk12\": true"), "passing CLI should mark TK12 readiness true");

  const failedCli = spawnSync(process.execPath, ["dist/check-task-kernel-cutover-gates.mjs", "--envelope", waivedEnvelopePath, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(failedCli.status !== 0, "not-run required gate should make CLI exit non-zero");
  assert(failedCli.stdout.includes("not-run-required-gate"), `failed CLI output should include not-run-required-gate; stdout=${failedCli.stdout}`);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log("Task Kernel cutover gate profile tests passed");
