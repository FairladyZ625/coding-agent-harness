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
export const legacyFallbackScanManifest = [
  "scripts",
  "tests",
  "templates",
  "templates-zh-CN",
  "docs-release",
  "examples",
  "presets",
  "references",
  ".github",
  "harness-gui",
  "README.md",
  "README.en-US.md",
  "README.zh-CN.md",
  "SKILL.md",
  "package.json",
  "postinstall.mjs",
  "run-dist.mjs",
];

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
  /(?:^|[/\\])lib[/\\]task-operations(?:\.[cm]?js|\.mts)?$/,
];
const retiredFacadeImportPattern = /(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)["'][^"']*(?:scripts\/lib\/task-operations|dist\/lib\/task-operations)/;
const rawInferencePattern = /\binfer(?:Lifecycle|ReviewStatus|Queues|MaterialsReady|CloseoutStatus)\s*\(/;
const legacyRuntimeFallbackToken = ["LEGACY", "RUNTIME", "FALLBACK"].join("_");
const rawFactFields = [
  "state",
  "lifecycleState",
  "reviewStatus",
  "reviewQueueState",
  "taskQueues",
  "materialsReady",
  "closeoutStatus",
  "lessonCandidateStatus",
  "lessonCandidateReviewDecision",
  "lessonCandidatePromotionState",
];
const rawFactFieldAlternation = rawFactFields.join("|");
const decisionTokenPattern = /\b(?:if|switch|return)\b|[?]|&&|\|\|/;
const rawFactDecisionPattern = new RegExp(`(?:\\b(?:if|switch|return)\\b|[?]|&&|\\|\\|).*?\\b(?:task|item|raw|record|entry)\\.(?:${rawFactFieldAlternation})\\b`);
const rawFactBracketDecisionPattern = new RegExp(`(?:\\b(?:if|switch|return)\\b|[?]|&&|\\|\\|).*?\\b(?:task|item|raw|record|entry)\\[["'](?:${rawFactFieldAlternation})["']\\]`);
const compatExemptionPattern = /\bmigration-only\b|runtimeTruth["']?\s*:\s*false|legacy-migration-input\/v1|\bstable-kernel\b|pure helper|\btest-only-compat\b|test only compat/i;

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
  const rawFactAliases = new Set<string>();

  for (const [index, line] of lines.entries()) {
    const exemptCompat = isCompatExemptLine(lines, index);
    collectRawFactAliases(line, rawFactAliases);
    if (!exemptCompat && rawInferencePattern.test(line)) {
      findings.push({
        code: "legacy-raw-runtime-fallback",
        file: relativeFile,
        line: index + 1,
        message: "Raw business fact inference must not remain active runtime fallback.",
        text: line.trim(),
      });
    }
    if (line.includes(legacyRuntimeFallbackToken) && !exemptCompat) {
      findings.push({
        code: "legacy-raw-runtime-fallback",
        file: relativeFile,
        line: index + 1,
        message: "Explicit illegal runtime fallback fixture detected.",
        text: line.trim(),
      });
    }
    if (!exemptCompat && (rawFactDecisionPattern.test(line) || rawFactBracketDecisionPattern.test(line) || hasRawFactAliasDecision(line, rawFactAliases))) {
      findings.push({
        code: "legacy-raw-runtime-fallback",
        file: relativeFile,
        line: index + 1,
        message: "Raw task fact field decision must be routed through the stable semantic contract.",
        text: line.trim(),
      });
    }
    if (retiredFacadeImportPattern.test(line)) {
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
  let headerMap: Map<string, number> | undefined;
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (!line.startsWith("|")) continue;
    const cells = parseMarkdownTableCells(line);
    if (cells.length === 0) continue;
    if (isMarkdownTableDivider(cells)) continue;
    if (!headerMap) {
      headerMap = buildHeaderMap(cells);
      continue;
    }
    const classIndex = headerMap.get("class");
    const reviewStateIndex = headerMap.get("review state");
    if (classIndex === undefined || reviewStateIndex === undefined) continue;
    const registryClass = stripInlineCode(cells[classIndex] || "");
    const reviewState = stripInlineCode(cells[reviewStateIndex] || "");
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
  const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8")) as unknown;
  const entries = collectPackageSurfaceEntries(parsed);
  const findings: LegacyFallbackFinding[] = [];
  for (const entry of entries) {
    const normalized = toPosix(entry.value);
    if (normalized.startsWith(".harness-private/") || normalized.includes("/.harness-private/")) {
      findings.push({
        code: "private-package-leak",
        file: relativePath,
        line: entry.line,
        message: "Package surface must not include private harness files.",
        text: normalized,
      });
    }
    if (retiredFacadePatterns.some((pattern) => pattern.test(normalized))) {
      findings.push({
        code: "stale-package-export",
        file: relativePath,
        line: entry.line,
        message: "Package surface includes a retired legacy facade.",
        text: normalized,
      });
    }
  }
  return findings;
}

function collectScanFiles(repoRoot: string, scanRoots?: string[]): string[] {
  const roots = scanRoots && scanRoots.length > 0 ? scanRoots : legacyFallbackScanManifest;
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

function collectRawFactAliases(line: string, aliases: Set<string>): void {
  const match = line.match(/\{\s*([^}]+?)\s*\}\s*=\s*(?:task|item|raw|record|entry)\b/);
  if (!match) return;
  for (const rawPart of match[1].split(",")) {
    const part = rawPart.trim();
    const aliasMatch = part.match(/^([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?$/);
    if (!aliasMatch) continue;
    const fieldName = aliasMatch[1];
    const localName = aliasMatch[2] || aliasMatch[1];
    if (rawFactFields.includes(fieldName)) aliases.add(localName);
  }
}

function hasRawFactAliasDecision(line: string, aliases: Set<string>): boolean {
  if (aliases.size === 0 || !decisionTokenPattern.test(line)) return false;
  return [...aliases].some((alias) => new RegExp(`\\b${escapeRegExp(alias)}\\b`).test(line));
}

function isCompatExemptLine(lines: string[], index: number): boolean {
  return compatExemptionPattern.test(lines[index]);
}

function isPublishedText(relativeFile: string): boolean {
  return /^(README|SKILL|docs-release\/|examples\/|templates\/|templates-zh-CN\/|presets\/|references\/)/.test(relativeFile);
}

function parseMarkdownTableCells(line: string): string[] {
  return line.split("|").slice(1, -1).map((cell) => cell.trim());
}

function buildHeaderMap(cells: string[]): Map<string, number> {
  return new Map(cells.map((cell, index) => [normalizeHeader(cell), index]));
}

function normalizeHeader(value: string): string {
  return stripInlineCode(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function isMarkdownTableDivider(cells: string[]): boolean {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

type PackageSurfaceEntry = {
  value: string;
  line: number;
};

function collectPackageSurfaceEntries(parsed: unknown): PackageSurfaceEntry[] {
  if (Array.isArray(parsed)) return parsed.flatMap((entry) => collectPackManifestEntries(entry));
  if (!isRecord(parsed)) return [];
  const entries: PackageSurfaceEntry[] = [];
  entries.push(...collectStringEntries(parsed.main, 1));
  entries.push(...collectStringEntries(parsed.types, 1));
  entries.push(...collectStringEntries(parsed.bin, 1));
  entries.push(...collectStringEntries(parsed.exports, 1));
  entries.push(...collectStringEntries(parsed.files, 1));
  return entries;
}

function collectPackManifestEntries(entry: unknown): PackageSurfaceEntry[] {
  if (!isRecord(entry)) return [];
  return collectStringEntries(entry.files, 1);
}

function collectStringEntries(value: unknown, line: number): PackageSurfaceEntry[] {
  if (typeof value === "string") return [{ value, line }];
  if (Array.isArray(value)) return value.flatMap((entry, index) => collectStringEntries(entry, index + 1));
  if (!isRecord(value)) return [];
  const pathValue = value.path;
  const ownEntry = typeof pathValue === "string" ? [{ value: pathValue, line }] : [];
  return [
    ...ownEntry,
    ...Object.entries(value).flatMap(([key, entry], index) => [
      { value: key, line: index + 1 },
      ...collectStringEntries(entry, index + 1),
    ]),
  ];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function stripInlineCode(value: string): string {
  return value.replace(/^`|`$/g, "").trim();
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
