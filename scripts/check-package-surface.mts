#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

type PackageJson = {
  name?: string;
  exports?: unknown;
};

type PackFile = {
  path: string;
};

type Finding = {
  code: string;
  message: string;
};

type DeepImportSmoke = {
  specifier: string;
  denied: boolean;
  evidence: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageName = "coding-agent-harness";
const allowedExportKeys = new Set(["./package.json"]);
const deniedDeepImports = [
  `${packageName}`,
  `${packageName}/dist/lib/harness-core.mjs`,
  `${packageName}/dist/lib/task-semantic-projection.mjs`,
  `${packageName}/dist/lib/task-tombstone-commands.mjs`,
  `${packageName}/dist/lib/task-archive-eligibility.mjs`,
  `${packageName}/dist/lib/task-operation-subjects.mjs`,
];
const runtimeInternalPackageFiles = [
  "dist/lib/harness-core.mjs",
  "dist/lib/task-semantic-projection.mjs",
  "dist/lib/task-tombstone-commands.mjs",
  "dist/lib/task-archive-eligibility.mjs",
];
const retiredFacadePackageFiles = [
  "dist/lib/task-operations.mjs",
];

const options = parseArgs(process.argv.slice(2));
const findings: Finding[] = [];
const packageJson = readPackageJson();
const exportKeys = exportedSubpaths(packageJson.exports);

if (packageJson.name !== packageName) {
  findings.push({
    code: "unexpected-package-name",
    message: `Expected package name ${packageName}, got ${packageJson.name || "missing"}.`,
  });
}

if (exportKeys.length === 0) {
  findings.push({
    code: "missing-package-exports",
    message: "package.json must define an exports map so package deep imports are not public by default.",
  });
}

for (const key of exportKeys) {
  if (!allowedExportKeys.has(key)) {
    findings.push({
      code: "unsupported-public-export",
      message: `Unsupported package public export ${key}; P11 allows only ${[...allowedExportKeys].join(", ")}.`,
    });
  }
}

const packFiles = packDryRunFiles();
const internalRuntimeFiles = runtimeInternalPackageFiles.filter((file) => packFiles.includes(file));
if (internalRuntimeFiles.length === 0) {
  findings.push({
    code: "missing-internal-runtime-classification-target",
    message: `Expected at least one runtime-internal file candidate in the tarball for P11 classification.`,
  });
}

const packedRetiredFacadeFiles = retiredFacadePackageFiles.filter((file) => packFiles.includes(file));
if (packedRetiredFacadeFiles.length > 0) {
  findings.push({
    code: "retired-facade-packed",
    message: `Retired package facade(s) must not be shipped in the tarball: ${packedRetiredFacadeFiles.join(", ")}.`,
  });
}

const installSmoke = options.skipInstallSmoke ? [] : runInstalledPackageSmoke();
for (const smoke of installSmoke) {
  if (!smoke.denied) {
    findings.push({
      code: "retired-deep-import-public",
      message: `${smoke.specifier} is still importable from an installed package.`,
    });
  }
}

const result = {
  schemaVersion: "package-surface-check/v1",
  ok: findings.length === 0,
  packageName: packageJson.name || "",
  exports: exportKeys,
  packFileCount: packFiles.length,
  internalRuntimeFiles,
  packageFileClassification: {
    runtimeInternalTargets: runtimeInternalPackageFiles,
    retiredFacadeTargets: retiredFacadePackageFiles,
    packedRetiredFacadeFiles,
  },
  deniedDeepImportSmoke: installSmoke,
  findings,
};

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else if (result.ok) {
  console.log(`Package surface check passed: ${packFiles.length} packed files; retired deep imports denied`);
} else {
  console.error(`Package surface check failed:\n${findings.map((finding) => `- ${finding.code}: ${finding.message}`).join("\n")}`);
}

if (!result.ok) process.exit(1);

function parseArgs(argv: string[]) {
  const parsed = {
    json: false,
    skipInstallSmoke: false,
    packJsonPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
    } else if (arg === "--skip-install-smoke") {
      parsed.skipInstallSmoke = true;
    } else if (arg === "--pack-json") {
      const value = argv[index + 1];
      if (!value) throw new Error("--pack-json requires a path");
      parsed.packJsonPath = value;
      index += 1;
    } else {
      throw new Error(`Unknown check-package-surface option: ${arg}`);
    }
  }
  return parsed;
}

function readPackageJson(): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as PackageJson;
}

function exportedSubpaths(exportsValue: unknown): string[] {
  if (!exportsValue || typeof exportsValue !== "object" || Array.isArray(exportsValue)) return [];
  return Object.keys(exportsValue as Record<string, unknown>).sort();
}

function packDryRunFiles(): string[] {
  if (options.packJsonPath) {
    const packJsonPath = path.resolve(repoRoot, options.packJsonPath);
    return parsePackJsonFiles(fs.readFileSync(packJsonPath, "utf8"));
  }
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) {
    findings.push({
      code: "pack-dry-run-failed",
      message: result.stderr || result.stdout || "npm pack --dry-run --json failed",
    });
    return [];
  }
  return parsePackJsonFiles(result.stdout);
}

function parsePackJsonFiles(content: string): string[] {
  return (JSON.parse(content) as Array<{ files: PackFile[] }>)[0].files.map((file) => file.path).sort();
}

function runInstalledPackageSmoke(): DeepImportSmoke[] {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-package-surface-"));
  const packDestination = path.join(tempRoot, "pack");
  const installRoot = path.join(tempRoot, "install");
  fs.mkdirSync(packDestination, { recursive: true });
  fs.mkdirSync(installRoot, { recursive: true });

  const pack = spawnSync("npm", ["pack", "--json", "--pack-destination", packDestination], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (pack.status !== 0) {
    findings.push({
      code: "pack-for-install-smoke-failed",
      message: pack.stderr || pack.stdout || "npm pack --json failed",
    });
    return [];
  }

  const tarballName = (JSON.parse(pack.stdout) as Array<{ filename: string }>)[0].filename;
  const tarballPath = path.join(packDestination, tarballName);
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarballPath], {
    cwd: installRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (install.status !== 0) {
    findings.push({
      code: "install-smoke-failed",
      message: install.stderr || install.stdout || "npm install tarball failed",
    });
    return [];
  }

  const harnessHelp = spawnSync(process.execPath, ["node_modules/coding-agent-harness/dist/harness.mjs", "--help"], {
    cwd: installRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (harnessHelp.status !== 0 || !harnessHelp.stdout.includes("Usage:")) {
    findings.push({
      code: "installed-bin-runtime-failed",
      message: `installed dist harness help failed\nSTDOUT:\n${harnessHelp.stdout}\nSTDERR:\n${harnessHelp.stderr}`,
    });
  }

  return deniedDeepImports.map((specifier) => {
    const probe = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(specifier)})`], {
      cwd: installRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const combined = `${probe.stdout}\n${probe.stderr}`;
    return {
      specifier,
      denied: probe.status !== 0 && /ERR_PACKAGE_PATH_NOT_EXPORTED|No "exports" main defined|Package subpath/.test(combined),
      evidence: combined.trim().split(/\r?\n/).find((line) => /ERR_PACKAGE_PATH_NOT_EXPORTED|No "exports" main defined|Package subpath/.test(line)) || combined.trim(),
    };
  });
}
