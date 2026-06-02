#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type LegacyFindingCode =
  | "legacy-raw-runtime-fallback"
  | "retired-facade-import"
  | "stale-package-export"
  | "private-package-leak"
  | "registry-class-out-of-range"
  | "registry-p13-illegal-class"
  | "registry-open-review-state";

export type LegacyFallbackFinding = {
  code: LegacyFindingCode;
  file: string;
  line: number;
  message: string;
  text: string;
};

export type LegacyFallbackReport = {
  schemaVersion: "legacy-fallback-detector/v1";
  scannedFiles: string[];
  findings: LegacyFallbackFinding[];
};

type DetectorOptions = {
  repoRoot?: string;
  scanRoots?: string[];
  registryPath?: string;
  packageJsonPath?: string;
  finalAudit?: boolean;
};

type CliArgs = DetectorOptions & {
  json: boolean;
};

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const textFilePattern = /\.(cjs|js|json|md|mjs|mts|template|ts|txt|yaml|yml)$/;
const allowedRegistryClasses = new Set([
  "unknown",
  "stable-kernel",
  "port-contract",
  "infrastructure-adapter",
  "migration-only-adapter",
  "test-only-compat",
  "bypass-to-migrate",
  "deletion-candidate",
  "deleted",
]);
const p13IllegalClasses = new Set(["unknown", "bypass-to-migrate", "deletion-candidate"]);
const retiredFacadePatterns = [
  /(?:^|[/\\])scripts[/\\]lib[/\\]task-operations\.mts$/,
  /(?:^|[/\\])dist[/\\]lib[/\\]task-operations\.mjs$/,
];

export function analyzeLegacyFallbackSurfaces(options: DetectorOptions = {}): LegacyFallbackReport {
  const repoRoot = path.resolve(options.repoRoot || defaultRepoRoot);
  const scannedFiles = collectScanFiles(repoRoot, options.scanRoots);
  const findings: LegacyFallbackFinding[] = [];

  for (const relativeFile of scannedFiles) {
    const absoluteFile = path.join(repoRoot, relativeFile);
    const content = fs.readFileSync(absoluteFile, "utf8");
    findings.push(...scanSourceText(relativeFile, content));
  }

  if (options.registryPath) findings.push(...scanRegistry(repoRoot, options.registryPath, Boolean(options.finalAudit)));
  if (options.packageJsonPath) findings.push(...scanPackageSurface(repoRoot, options.packageJsonPath));

  return { schemaVersion: "legacy-fallback-detector/v1", scannedFiles, findings };
}

function scanSourceText(relativeFile: string, content: string): LegacyFallbackFinding[] {
  const findings: LegacyFallbackFinding[] = [];
  const lines = content.split(/\r?\n/);
  const migrationOnly = /\bmigration-only\b|runtimeTruth["']?\s*:\s*false|legacy-migration-input\/v1/.test(content);
  const stableKernel = /\bstable-kernel\b|pure helper/i.test(content);
  const testOnlyCompat = /\btest-only-compat\b|test only compat/i.test(content);
  const exemptCompat = migrationOnly || stableKernel || testOnlyCompat;

  for (const [index, line] of lines.entries()) {
    if (!exemptCompat && /\binfer(?:Lifecycle|ReviewStatus|Queues|MaterialsReady|CloseoutStatus)\s*\(/.test(line)) {
      findings.push({
        code: "legacy-raw-runtime-fallback",
        file: relativeFile,
        line: index + 1,
        message: "Raw business fact inference must not remain active runtime fallback.",
        text: line.trim(),
      });
    }
    if (/\bLEGACY_RUNTIME_FALLBACK\b/.test(line) && !exemptCompat) {
      findings.push({
        code: "legacy-raw-runtime-fallback",
        file: relativeFile,
        line: index + 1,
        message: "Explicit illegal runtime fallback fixture detected.",
        text: line.trim(),
      });
    }
    if (/from\s+["'][^"']*(?:scripts\/lib\/task-operations|dist\/lib\/task-operations)/.test(line)) {
      findings.push({
        code: "retired-facade-import",
        file: relativeFile,
        line: index + 1,
        message: "Retired task-operations facade import is not allowed.",
        text: line.trim(),
      });
    }
    if (isPublishedText(relativeFile) && /(?:scripts\/lib\/task-operations\.mts|dist\/lib\/task-operations\.mjs)/.test(line)) {
      findings.push({
        code: "stale-package-export",
        file: relativeFile,
        line: index + 1,
        message: "Published text still points to a retired legacy facade.",
        text: line.trim(),
      });
    }
  }

  return findings;
}

function scanRegistry(repoRoot: string, registryPath: string, finalAudit: boolean): LegacyFallbackFinding[] {
  const absolutePath = path.resolve(repoRoot, registryPath);
  const relativePath = toPosix(path.relative(repoRoot, absolutePath));
  const content = fs.readFileSync(absolutePath, "utf8");
  const findings: LegacyFallbackFinding[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.startsWith("|") || line.includes("---")) continue;
    const cells = line.split("|").map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 3 || cells[0] === "Surface") continue;
    const registryClass = stripInlineCode(cells[1]);
    const reviewState = stripInlineCode(cells[2]);
    if (!allowedRegistryClasses.has(registryClass)) {
      findings.push({
        code: "registry-class-out-of-range",
        file: relativePath,
        line: index + 1,
        message: `Registry class ${registryClass} is outside the closed enum.`,
        text: line.trim(),
      });
    }
    if (finalAudit && p13IllegalClasses.has(registryClass)) {
      findings.push({
        code: "registry-p13-illegal-class",
        file: relativePath,
        line: index + 1,
        message: `Registry class ${registryClass} cannot pass P13 final audit.`,
        text: line.trim(),
      });
    }
    if (finalAudit && /^open\b|needs-|partial-|candidate/i.test(reviewState)) {
      findings.push({
        code: "registry-open-review-state",
        file: relativePath,
        line: index + 1,
        message: `Registry review state ${reviewState} is still open for final audit.`,
        text: line.trim(),
      });
    }
  }
  return findings;
}

function scanPackageSurface(repoRoot: string, packageJsonPath: string): LegacyFallbackFinding[] {
  const absolutePath = path.resolve(repoRoot, packageJsonPath);
  const relativePath = toPosix(path.relative(repoRoot, absolutePath));
  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as { files?: Array<{ path?: string } | string> };
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  const findings: LegacyFallbackFinding[] = [];
  for (const [index, entry] of files.entries()) {
    const filePath = typeof entry === "string" ? entry : String(entry.path || "");
    const normalized = toPosix(filePath);
    if (normalized.startsWith(".harness-private/") || normalized.includes("/.harness-private/")) {
      findings.push({
        code: "private-package-leak",
        file: relativePath,
        line: index + 1,
        message: "Package surface must not include private harness files.",
        text: normalized,
      });
    }
    if (retiredFacadePatterns.some((pattern) => pattern.test(normalized))) {
      findings.push({
        code: "stale-package-export",
        file: relativePath,
        line: index + 1,
        message: "Package surface includes a retired legacy facade.",
        text: normalized,
      });
    }
  }
  return findings;
}

function collectScanFiles(repoRoot: string, scanRoots?: string[]): string[] {
  const roots = scanRoots && scanRoots.length > 0 ? scanRoots : ["scripts", "tests", "templates", "templates-zh-CN", "docs-release", "examples", "presets", "README.md", "README.en-US.md", "README.zh-CN.md", "SKILL.md", "package.json"];
  const files: string[] = [];
  for (const root of roots) {
    const absolute = path.resolve(repoRoot, root);
    if (!fs.existsSync(absolute)) continue;
    files.push(...walkTextFiles(absolute, repoRoot));
  }
  return [...new Set(files)].sort();
}

function walkTextFiles(current: string, repoRoot: string): string[] {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) return textFilePattern.test(current) ? [toPosix(path.relative(repoRoot, current))] : [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(current)) files.push(...walkTextFiles(path.join(current, entry), repoRoot));
  return files;
}

function isPublishedText(relativeFile: string): boolean {
  return /^(README|SKILL|docs-release\/|examples\/|templates\/|templates-zh-CN\/|presets\/|references\/)/.test(relativeFile);
}

function stripInlineCode(value: string): string {
  return value.replace(/^`|`$/g, "").trim();
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { json: false };
  const scanRoots: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      args.json = true;
    } else if (arg === "--repo-root") {
      args.repoRoot = readArgValue(argv, ++index, arg);
    } else if (arg === "--scan-root") {
      scanRoots.push(readArgValue(argv, ++index, arg));
    } else if (arg === "--registry") {
      args.registryPath = readArgValue(argv, ++index, arg);
    } else if (arg === "--package-json") {
      args.packageJsonPath = readArgValue(argv, ++index, arg);
    } else if (arg === "--final-audit") {
      args.finalAudit = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (scanRoots.length > 0) args.scanRoots = scanRoots;
  return args;
}

function readArgValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { json, ...options } = parseArgs(process.argv.slice(2));
    const report = analyzeLegacyFallbackSurfaces(options);
    if (json) console.log(JSON.stringify(report, null, 2));
    if (report.findings.length > 0) {
      if (!json) {
        console.error([
          "Legacy fallback detector failed:",
          ...report.findings.map((finding) => `${finding.file}:${finding.line}: ${finding.code}: ${finding.message}: ${finding.text}`),
        ].join("\n"));
      }
      process.exit(1);
    }
    if (!json) console.log(`Legacy fallback detector passed (${report.scannedFiles.length} files scanned)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
