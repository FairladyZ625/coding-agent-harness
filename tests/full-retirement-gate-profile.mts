#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const profileModule = await import(pathToFileURL(path.join(repoRoot, "dist/lib/full-retirement-gate-profile.mjs")).href) as typeof import("../scripts/lib/full-retirement-gate-profile.mts");
const {
  evaluateGateEvidenceEnvelope,
  getFullRetirementGateProfile,
} = profileModule;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const p10Profile = getFullRetirementGateProfile("P10");
const p11Profile = getFullRetirementGateProfile("P11");
const p13Profile = getFullRetirementGateProfile("P13");

assert(p10Profile.some((gate) => gate.id === "legacy-fallback-detector"), "P10 profile should include legacy fallback detector");
assert(p10Profile.some((gate) => gate.id === "import-graph"), "P10 profile should include import graph");
assert(p10Profile.some((gate) => gate.id === "dashboard-generation"), "P10 profile should include dashboard generation no-data-loss gate");
assert(p10Profile.some((gate) => gate.id === "pack-dry-run"), "P10 profile should include package dry-run gate");
assert(p11Profile.some((gate) => gate.id === "installed-package-smoke"), "P11 profile should include installed package smoke");
assert(p13Profile.some((gate) => gate.id === "legacy-fallback-final-audit"), "P13 profile should include final detector audit");
assert(p13Profile.some((gate) => gate.id === "reviewer-no-open-p0-p2"), "P13 profile should include reviewer no-open-P0/P1/P2 gate");

const passingP10 = evaluateGateEvidenceEnvelope({
  schemaVersion: "full-retirement-evidence-envelope/v1",
  phase: "P10",
  results: p10Profile.map((gate) => ({ gateId: gate.id, status: "pass", evidence: `command:${gate.command}:passed` })),
  residuals: [
    {
      id: "p11-package-facade-deletion",
      classification: "deferred-with-expiry",
      owner: "P11",
      expiryPhase: "P11",
      closePath: "P11 package facade deletion evidence",
    },
  ],
});
assert(passingP10.readyForAgentReview, `complete P10 envelope should pass: ${JSON.stringify(passingP10.findings, null, 2)}`);

const missingGate = evaluateGateEvidenceEnvelope({
  schemaVersion: "full-retirement-evidence-envelope/v1",
  phase: "P10",
  results: p10Profile.filter((gate) => gate.id !== "pack-dry-run").map((gate) => ({ gateId: gate.id, status: "pass", evidence: "passed" })),
});
assert(!missingGate.readyForAgentReview, "missing package gate should fail");
assert(missingGate.findings.some((finding) => finding.code === "missing-required-gate" && finding.gateId === "pack-dry-run"), "missing package gate should be reported");

const waivedGate = evaluateGateEvidenceEnvelope({
  schemaVersion: "full-retirement-evidence-envelope/v1",
  phase: "P10",
  results: p10Profile.map((gate) => ({ gateId: gate.id, status: gate.id === "legacy-fallback-detector" ? "waived" : "pass", evidence: "passed" })),
});
assert(!waivedGate.readyForAgentReview, "waived required detector gate should fail");
assert(waivedGate.findings.some((finding) => finding.code === "waived-required-gate" && finding.gateId === "legacy-fallback-detector"), "waiver cannot mark done should be reported");

const failedGate = evaluateGateEvidenceEnvelope({
  schemaVersion: "full-retirement-evidence-envelope/v1",
  phase: "P10",
  results: p10Profile.map((gate) => ({ gateId: gate.id, status: gate.id === "import-graph" ? "fail" : "pass", evidence: "passed" })),
});
assert(!failedGate.readyForAgentReview, "failed import graph gate should fail");
assert(failedGate.findings.some((finding) => finding.code === "failed-required-gate" && finding.gateId === "import-graph"), "failed import graph should be reported");

const badResidual = evaluateGateEvidenceEnvelope({
  schemaVersion: "full-retirement-evidence-envelope/v1",
  phase: "P10",
  results: p10Profile.map((gate) => ({ gateId: gate.id, status: "pass", evidence: "passed" })),
  residuals: [{ id: "p13-final-audit", classification: "deferred-with-expiry" }],
});
assert(!badResidual.readyForAgentReview, "deferred residual without owner/expiry/close path should fail");
assert(badResidual.findings.some((finding) => finding.code === "residual-missing-owner"), "deferred residual owner should be required");
assert(badResidual.findings.some((finding) => finding.code === "residual-missing-expiry"), "deferred residual expiry should be required");
assert(badResidual.findings.some((finding) => finding.code === "residual-missing-close-path"), "deferred residual close path should be required");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "full-retirement-gates-"));
try {
  const passingEnvelopePath = path.join(tmpRoot, "p10-passing-envelope.json");
  const waivedEnvelopePath = path.join(tmpRoot, "p10-waived-envelope.json");
  fs.writeFileSync(passingEnvelopePath, JSON.stringify({
    schemaVersion: "full-retirement-evidence-envelope/v1",
    phase: "P10",
    results: p10Profile.map((gate) => ({ gateId: gate.id, status: "pass", evidence: "passed" })),
  }, null, 2));
  fs.writeFileSync(waivedEnvelopePath, JSON.stringify({
    schemaVersion: "full-retirement-evidence-envelope/v1",
    phase: "P10",
    results: p10Profile.map((gate) => ({ gateId: gate.id, status: gate.id === "full-npm-test" ? "not-run" : "pass", evidence: "passed" })),
  }, null, 2));
  const passingCli = spawnSync(process.execPath, ["dist/check-full-retirement-gates.mjs", "--envelope", passingEnvelopePath, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(passingCli.status === 0, `passing CLI envelope should exit 0; stderr=${passingCli.stderr}`);
  const failedCli = spawnSync(process.execPath, ["dist/check-full-retirement-gates.mjs", "--envelope", waivedEnvelopePath, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert(failedCli.status !== 0, "not-run required gate should make CLI exit non-zero");
  assert(failedCli.stdout.includes("not-run-required-gate"), `failed CLI output should include not-run-required-gate; stdout=${failedCli.stdout}`);
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log("Full retirement gate profile tests passed");
