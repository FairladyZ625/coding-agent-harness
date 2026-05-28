#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["scripts", "tests"];
const importPattern = /\b(import|export)\s+(type\s+)?(?:[^'"]*?\s+from\s+)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
const tsEscapePattern = /@(ts-ignore|ts-expect-error)\b|(?:^|[^A-Za-z0-9_$])(?:as\s+any|:\s*any\b)/;
export function checkTypeBoundaries({ repoRoot = defaultRepoRoot } = {}) {
    const files = collectSourceFiles(repoRoot);
    const violations = [];
    for (const file of files) {
        const absolutePath = path.join(repoRoot, file);
        const content = fs.readFileSync(absolutePath, "utf8");
        const imports = parseImports(content);
        if (file.endsWith(".ts")) {
            const lines = content.split(/\r?\n/);
            for (const [index, line] of lines.entries()) {
                if (tsEscapePattern.test(line)) {
                    violations.push({
                        code: "ts-escape-hatch",
                        file,
                        line: index + 1,
                        message: `${file}:${index + 1} uses a TypeScript escape hatch that requires review`,
                    });
                }
            }
        }
        for (const imported of imports) {
            if (!isLocalSpecifier(imported.specifier))
                continue;
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
function collectSourceFiles(repoRoot) {
    const files = [];
    for (const root of sourceRoots) {
        const absoluteRoot = path.join(repoRoot, root);
        if (!fs.existsSync(absoluteRoot))
            continue;
        walk(absoluteRoot, files, repoRoot);
    }
    return files.sort();
}
function walk(current, files, repoRoot) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink())
        return;
    if (stat.isDirectory()) {
        const name = path.basename(current);
        if (name === "node_modules" || name === ".worktrees" || name === "tmp")
            return;
        for (const entry of fs.readdirSync(current))
            walk(path.join(current, entry), files, repoRoot);
        return;
    }
    if (stat.isFile() && /\.(mjs|mts|ts)$/.test(current)) {
        files.push(path.relative(repoRoot, current).split(path.sep).join("/"));
    }
}
function parseImports(content) {
    const imports = [];
    for (const match of content.matchAll(importPattern)) {
        imports.push({
            kind: match[1] || "import",
            typeOnly: match[2] === "type ",
            specifier: match[3] || match[4],
        });
    }
    return imports;
}
function isLocalSpecifier(specifier) {
    return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
}
function resolveLocalSpecifier(repoRoot, importer, specifier) {
    const importerDir = path.dirname(path.join(repoRoot, importer));
    const basePath = specifier.startsWith("/") ? path.join(repoRoot, specifier) : path.resolve(importerDir, specifier);
    const candidates = candidatePaths(basePath);
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return path.relative(repoRoot, candidate).split(path.sep).join("/");
    }
    const relative = path.relative(repoRoot, basePath).split(path.sep).join("/");
    return relative.startsWith("..") ? undefined : relative;
}
function candidatePaths(basePath) {
    const extension = path.extname(basePath);
    if (extension) {
        const paths = [basePath];
        if (extension === ".js")
            paths.push(basePath.slice(0, -3) + ".ts", basePath.slice(0, -3) + ".mts");
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
function isSharedTypesPath(relativePath) {
    return relativePath === "scripts/lib/types" || relativePath.startsWith("scripts/lib/types/");
}
function hasTypeScriptSourceExtension(filePath) {
    return typeof filePath === "string" && /\.(mts|ts)$/.test(filePath);
}
function isTypeOnlyTypeScriptImport(file, imported) {
    return file.endsWith(".ts") && imported.kind === "import" && imported.typeOnly;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const result = checkTypeBoundaries();
    if (!result.ok) {
        console.error(result.violations.map((violation) => violation.message).join("\n"));
        process.exit(1);
    }
    console.log("Type boundary guards passed");
}
