#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ForbiddenPattern = {
  source: string;
  pattern: RegExp;
};

type Violation = {
  file: string;
  line: number;
  pattern: string;
  text: string;
};

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv: string[]): { repoRoot: string } {
  let repoRoot = defaultRepoRoot;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--repo-root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--repo-root requires a value");
      repoRoot = path.resolve(value);
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { repoRoot };
}

export function checkLiteForbiddenSurfaces(repoRoot = defaultRepoRoot): { ok: boolean; violations: Violation[]; scannedFiles: string[] } {
  const forbiddenPath = path.join(repoRoot, "docs-release/architecture/document-contract-kernel/products/lite-forbidden-surfaces.txt");
  const patterns = readForbiddenPatterns(forbiddenPath);
  const scannedFiles = collectLiteProductFiles(repoRoot);
  const violations: Violation[] = [];

  for (const relativeFile of scannedFiles) {
    const absoluteFile = path.join(repoRoot, relativeFile);
    const lines = fs.readFileSync(absoluteFile, "utf8").split(/\r?\n/);
    for (const [lineIndex, line] of lines.entries()) {
      for (const pattern of patterns) {
        pattern.pattern.lastIndex = 0;
        if (pattern.pattern.test(line)) {
          violations.push({
            file: relativeFile,
            line: lineIndex + 1,
            pattern: pattern.source,
            text: line.trim(),
          });
        }
      }
    }
  }

  return { ok: violations.length === 0, violations, scannedFiles };
}

function readForbiddenPatterns(forbiddenPath: string): ForbiddenPattern[] {
  if (!fs.existsSync(forbiddenPath)) {
    throw new Error(`Missing Lite forbidden-surface list: ${path.relative(process.cwd(), forbiddenPath)}`);
  }
  const lines = fs.readFileSync(forbiddenPath, "utf8").split(/\r?\n/);
  return lines
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      if (line.startsWith("literal:")) {
        const literal = line.slice("literal:".length);
        return { source: line, pattern: new RegExp(escapeRegExp(literal), "i") };
      }
      if (line.startsWith("regex:")) {
        const source = line.slice("regex:".length);
        return { source: line, pattern: new RegExp(source, "i") };
      }
      return { source: line, pattern: new RegExp(escapeRegExp(line), "i") };
    });
}

function collectLiteProductFiles(repoRoot: string): string[] {
  const files = new Set<string>();
  const explicitFiles = [
    "docs-release/architecture/document-contract-kernel/products/lite-skill-overlay.md",
    "skills/coding-agent-harness-lite/SKILL.md",
  ];
  for (const relativeFile of explicitFiles) {
    if (fs.existsSync(path.join(repoRoot, relativeFile))) files.add(relativeFile);
  }

  for (const relativeDir of ["skill-sources/products/lite", "skill-sources/document-kernel/products/lite"]) {
    const absoluteDir = path.join(repoRoot, relativeDir);
    if (!fs.existsSync(absoluteDir)) continue;
    for (const relativeFile of walkTextFiles(absoluteDir, repoRoot)) files.add(relativeFile);
  }

  return [...files].sort();
}

function walkTextFiles(current: string, repoRoot: string): string[] {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) return [];
  if (stat.isFile()) {
    return /\.(md|txt|template)$/.test(current) ? [toPosix(path.relative(repoRoot, current))] : [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(current)) {
    files.push(...walkTextFiles(path.join(current, entry), repoRoot));
  }
  return files;
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { repoRoot } = parseArgs(process.argv.slice(2));
    const result = checkLiteForbiddenSurfaces(repoRoot);
    if (!result.ok) {
      console.error(
        [
          "Lite forbidden-surface check failed:",
          ...result.violations.map((violation) => `${violation.file}:${violation.line}: ${violation.pattern}: ${violation.text}`),
        ].join("\n"),
      );
      process.exit(1);
    }
    console.log(`Lite forbidden-surface check passed (${result.scannedFiles.length} files scanned)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
