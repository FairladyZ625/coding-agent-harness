#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  assert,
  node,
  repoRoot,
} from "./helpers/harness-test-utils.mjs";

type PackageSurfaceResult = {
  ok: boolean;
  exports: string[];
  internalRuntimeFiles: string[];
  packageFileClassification: {
    runtimeInternalTargets: string[];
    retiredFacadeTargets: string[];
    packedRetiredFacadeFiles: string[];
  };
  deniedDeepImportSmoke: Array<{
    specifier: string;
    denied: boolean;
  }>;
  findings: Array<{
    code: string;
    message: string;
  }>;
};

const result = spawnSync(node, ["dist/check-package-surface.mjs", "--json"], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

assert(result.status === 0, `package surface check should pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
const payload = JSON.parse(result.stdout) as PackageSurfaceResult;
assert(payload.ok === true, "package surface payload should report ok");
assert(payload.exports.length === 1 && payload.exports[0] === "./package.json", "package exports should only expose package metadata");
assert(payload.internalRuntimeFiles.includes("dist/lib/harness-core.mjs"), "harness-core should be classified as runtime-internal, not public export");
assert(!payload.internalRuntimeFiles.includes("dist/lib/task-semantic-projection.mjs"), "retired task semantic projection facade should not be packed");
assert(payload.packageFileClassification.retiredFacadeTargets.includes("dist/lib/task-operations.mjs"), "retired TaskOperations package facade should be classified separately from runtime internals");
assert(payload.packageFileClassification.packedRetiredFacadeFiles.length === 0, "current tarball should not ship retired package facades");
assert(payload.deniedDeepImportSmoke.some((smoke) => smoke.specifier === "coding-agent-harness" && smoke.denied), "package root import should be denied");
assert(payload.deniedDeepImportSmoke.some((smoke) => smoke.specifier.endsWith("/dist/lib/harness-core.mjs") && smoke.denied), "harness-core deep import should be denied");
assert(payload.deniedDeepImportSmoke.every((smoke) => smoke.denied), "all retired package deep imports should be denied");
assert(payload.findings.length === 0, `package surface check should have no findings: ${JSON.stringify(payload.findings)}`);

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-package-surface-test-"));
const retiredFacadePackJson = path.join(fixtureRoot, "retired-facade-pack.json");
fs.writeFileSync(retiredFacadePackJson, JSON.stringify([
  {
    files: [
      { path: "dist/harness.mjs" },
      { path: "dist/lib/harness-core.mjs" },
      { path: "dist/lib/task-operations.mjs" },
    ],
  },
]));

const retiredFacadeResult = spawnSync(node, ["dist/check-package-surface.mjs", "--json", "--skip-install-smoke", "--pack-json", retiredFacadePackJson], {
  cwd: repoRoot,
  encoding: "utf8",
  maxBuffer: 16 * 1024 * 1024,
});

assert(retiredFacadeResult.status !== 0, `fixture pack with retired facade should fail\nSTDOUT:\n${retiredFacadeResult.stdout}\nSTDERR:\n${retiredFacadeResult.stderr}`);
const retiredFacadePayload = JSON.parse(retiredFacadeResult.stdout) as PackageSurfaceResult;
assert(retiredFacadePayload.findings.some((finding) => finding.code === "retired-facade-packed"), "package surface check should reject retired facades in packed file lists");
assert(retiredFacadePayload.packageFileClassification.packedRetiredFacadeFiles.includes("dist/lib/task-operations.mjs"), "failure payload should identify the packed retired facade");

console.log("Package surface tests passed");
