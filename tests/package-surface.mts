#!/usr/bin/env node

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
assert(payload.internalRuntimeFiles.includes("dist/lib/task-semantic-projection.mjs"), "task semantic projection facade should be classified as runtime-internal");
assert(payload.deniedDeepImportSmoke.some((smoke) => smoke.specifier === "coding-agent-harness" && smoke.denied), "package root import should be denied");
assert(payload.deniedDeepImportSmoke.some((smoke) => smoke.specifier.endsWith("/dist/lib/harness-core.mjs") && smoke.denied), "harness-core deep import should be denied");
assert(payload.deniedDeepImportSmoke.every((smoke) => smoke.denied), "all retired package deep imports should be denied");
assert(payload.findings.length === 0, `package surface check should have no findings: ${JSON.stringify(payload.findings)}`);

console.log("Package surface tests passed");
