#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["scripts", "tests"];
const importPattern = /\b(import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const tsEscapePattern = /@(ts-ignore|ts-expect-error)\b|\bas\s+unknown\s+as\b|\bRecord\s*<\s*string\s*,\s*any\s*>|(?:^|[^A-Za-z0-9_$])(?:as\s+any|:\s*any\b)/;

type CheckTypeBoundariesOptions = {
  repoRoot?: string;
  escapeAllowlistPath?: string;
};

type ParsedImport = {
  kind: string;
  typeOnly: boolean;
  specifier: string;
};

type TypeBoundaryViolation = {
  code: string;
  file: string;
  line?: number;
  specifier?: string;
  message: string;
};

type EscapeAllowlistEntry = string | {
  file: string;
  line: number;
  code?: string;
};

export function checkTypeBoundaries({
  repoRoot = defaultRepoRoot,
  escapeAllowlistPath = path.join(repoRoot, "scripts/type-escape-allowlist.json"),
}: CheckTypeBoundariesOptions = {}): { ok: boolean; violations: TypeBoundaryViolation[] } {
  const files = collectSourceFiles(repoRoot);
  const violations: TypeBoundaryViolation[] = [];
  const escapeAllowlist = readEscapeAllowlist(escapeAllowlistPath);

  for (const file of files) {
    const absolutePath = path.join(repoRoot, file);
    const content = fs.readFileSync(absolutePath, "utf8");
    const imports = parseImports(content);

    if (file.endsWith(".ts") || file.endsWith(".mts")) {
      const lines = content.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        if (tsEscapePattern.test(line)) {
          const violation = {
            code: "ts-escape-hatch",
            file,
            line: index + 1,
            message: `${file}:${index + 1} uses a TypeScript escape hatch that requires review`,
          };
          if (!isEscapeAllowed(escapeAllowlist, violation)) violations.push(violation);
        }
      }
    }

    for (const imported of imports) {
      if (!isLocalSpecifier(imported.specifier)) continue;
      const target = resolveLocalSpecifier(repoRoot, file, imported.specifier);

      if (file.endsWith(".mjs") && (hasTypeScriptSourceExtension(imported.specifier) || hasTypeScriptSourceExtension(target))) {
        violations.push({
          code: "mjs-imports-ts",
          file,
          specifier: imported.specifier,
          message: `${file} imports TypeScript from runtime .mjs: ${imported.specifier}`,
        });
      }

      if (target && isSharedTypesPath(target) && !isTypeOnlyTypeScriptImport(file, imported)) {
        violations.push({
          code: "types-value-import",
          file,
          specifier: imported.specifier,
          message: `${file} value-imports shared type island: ${imported.specifier}`,
        });
      }
    }
  }

  return { ok: violations.length === 0, violations };
}

function collectSourceFiles(repoRoot: string): string[] {
  const files: string[] = [];
  for (const root of sourceRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absoluteRoot)) continue;
    walk(absoluteRoot, files, repoRoot);
  }
  return files.sort();
}

function walk(current: string, files: string[], repoRoot: string): void {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    const name = path.basename(current);
    if (name === "node_modules" || name === ".worktrees" || name === "tmp") return;
    for (const entry of fs.readdirSync(current)) walk(path.join(current, entry), files, repoRoot);
    return;
  }
  if (stat.isFile() && /\.(mjs|mts|ts)$/.test(current)) {
    files.push(path.relative(repoRoot, current).split(path.sep).join("/"));
  }
}

function parseImports(content: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  for (const match of content.matchAll(importPattern)) {
    imports.push({
      kind: match[1] || "import",
      typeOnly: match[2] === "type ",
      specifier: match[3] || match[4] || "",
    });
  }
  return imports;
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
}

function resolveLocalSpecifier(repoRoot: string, importer: string, specifier: string): string | undefined {
  const importerDir = path.dirname(path.join(repoRoot, importer));
  const basePath = specifier.startsWith("/") ? path.join(repoRoot, specifier) : path.resolve(importerDir, specifier);
  const candidates = candidatePaths(basePath);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return path.relative(repoRoot, candidate).split(path.sep).join("/");
  }
  const relative = path.relative(repoRoot, basePath).split(path.sep).join("/");
  return relative.startsWith("..") ? undefined : relative;
}

function candidatePaths(basePath: string): string[] {
  const extension = path.extname(basePath);
  if (extension) {
    const paths = [basePath];
    if (extension === ".js") paths.push(basePath.slice(0, -3) + ".ts", basePath.slice(0, -3) + ".mts");
    return paths;
  }
  return [
    basePath,
    `${basePath}.mjs`,
    `${basePath}.mts`,
    `${basePath}.ts`,
    `${basePath}.js`,
    path.join(basePath, "index.mjs"),
    path.join(basePath, "index.ts"),
  ];
}

function isSharedTypesPath(relativePath: string): boolean {
  return relativePath === "scripts/lib/types" || relativePath.startsWith("scripts/lib/types/");
}

function hasTypeScriptSourceExtension(filePath: unknown): boolean {
  return typeof filePath === "string" && /\.(mts|ts)$/.test(filePath);
}

function isTypeOnlyTypeScriptImport(file: string, imported: ParsedImport): boolean {
  return (file.endsWith(".ts") || file.endsWith(".mts")) && imported.kind === "import" && imported.typeOnly;
}

function readEscapeAllowlist(allowlistPath: string): Set<string> {
  if (!allowlistPath || !fs.existsSync(allowlistPath)) return new Set();
  const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf8")) as EscapeAllowlistEntry[] | { escapes?: EscapeAllowlistEntry[] };
  const entries = Array.isArray(parsed) ? parsed : parsed.escapes || [];
  return new Set(
    entries.map((entry) => {
      if (typeof entry === "string") return entry;
      return `${entry.file}:${entry.line}:${entry.code || "ts-escape-hatch"}`;
    }),
  );
}

function isEscapeAllowed(allowlist: Set<string>, violation: TypeBoundaryViolation): boolean {
  return allowlist.has(`${violation.file}:${violation.line}:${violation.code}`) || allowlist.has(`${violation.file}:${violation.line}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkTypeBoundaries();
  if (!result.ok) {
    console.error(result.violations.map((violation) => violation.message).join("\n"));
    process.exit(1);
  }
  console.log("Type boundary guards passed");
}
