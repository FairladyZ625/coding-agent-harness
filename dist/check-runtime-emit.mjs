#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typescriptVersion = "5.9.3";
export function checkRuntimeEmitContract({ projectRoot = defaultRepoRoot, configPath = path.join(projectRoot, "tsconfig.runtime.json"), expectedDir, outDir, } = {}) {
    const violations = [];
    const absoluteConfig = path.resolve(configPath);
    const absoluteProjectRoot = path.resolve(projectRoot);
    const absoluteOutDir = outDir ? path.resolve(outDir) : fs.mkdtempSync(path.join(os.tmpdir(), "harness-runtime-emit-out-"));
    const absoluteExpectedDir = expectedDir ? path.resolve(expectedDir) : undefined;
    const sourceFiles = collectSourceFiles(absoluteProjectRoot, { roots: absoluteExpectedDir ? undefined : ["scripts"] });
    if (!fs.existsSync(absoluteConfig)) {
        return {
            ok: false,
            violations: [{ code: "missing-config", message: `runtime emit config not found: ${absoluteConfig}` }],
        };
    }
    if (absoluteExpectedDir && !fs.existsSync(absoluteExpectedDir)) {
        violations.push({
            code: "missing-expected-dir",
            message: `runtime emit expected directory not found: ${absoluteExpectedDir}`,
        });
    }
    for (const source of sourceFiles) {
        const content = fs.readFileSync(source, "utf8");
        for (const specifier of parseLocalImportSpecifiers(content)) {
            if (/\.(ts|mts)$/.test(specifier)) {
                violations.push({
                    code: "typescript-source-import",
                    file: toPosix(path.relative(absoluteProjectRoot, source)),
                    specifier,
                    message: `${toPosix(path.relative(absoluteProjectRoot, source))} imports TypeScript source specifier ${specifier}`,
                });
            }
        }
    }
    if (sourceFiles.length === 0 && !absoluteExpectedDir) {
        return {
            ok: violations.length === 0,
            violations,
            outDir: absoluteOutDir,
            expectedDir: absoluteExpectedDir,
            skippedEmit: true,
            sourceFiles: 0,
        };
    }
    const emit = runTypeScriptEmit({ projectRoot: absoluteProjectRoot, configPath: absoluteConfig, outDir: absoluteOutDir });
    if (emit.status !== 0) {
        violations.push({
            code: "emit-failed",
            message: `TypeScript runtime emit failed\nSTDOUT:\n${emit.stdout}\nSTDERR:\n${emit.stderr}`,
        });
    }
    if (absoluteExpectedDir && fs.existsSync(absoluteExpectedDir) && emit.status === 0) {
        compareDirectories({
            expectedDir: absoluteExpectedDir,
            actualDir: absoluteOutDir,
            violations,
        });
    }
    else if (!absoluteExpectedDir && emit.status === 0) {
        compareEmittedFilesToProject({
            projectRoot: absoluteProjectRoot,
            actualDir: absoluteOutDir,
            violations,
        });
    }
    return {
        ok: violations.length === 0,
        violations,
        outDir: absoluteOutDir,
        expectedDir: absoluteExpectedDir,
        skippedEmit: false,
        sourceFiles: sourceFiles.length,
    };
}
function runTypeScriptEmit({ projectRoot, configPath, outDir }) {
    return spawnSync("npm", ["exec", "--yes", "--package", `typescript@${typescriptVersion}`, "--", "tsc", "-p", configPath, "--outDir", outDir, "--noCheck"], {
        cwd: projectRoot,
        encoding: "utf8",
    });
}
function compareDirectories({ expectedDir, actualDir, violations }) {
    const expectedFiles = collectFiles(expectedDir).filter((file) => file.endsWith(".mjs")).sort();
    const actualFiles = collectFiles(actualDir).filter((file) => file.endsWith(".mjs")).sort();
    const expectedRelatives = expectedFiles.map((file) => toPosix(path.relative(expectedDir, file)));
    const actualRelatives = actualFiles.map((file) => toPosix(path.relative(actualDir, file)));
    for (const relative of expectedRelatives) {
        if (!actualRelatives.includes(relative)) {
            violations.push({
                code: "missing-emitted-file",
                file: relative,
                message: `expected emitted file missing: ${relative}`,
            });
        }
    }
    for (const relative of actualRelatives) {
        if (!expectedRelatives.includes(relative)) {
            violations.push({
                code: "unexpected-emitted-file",
                file: relative,
                message: `unexpected emitted file: ${relative}`,
            });
            continue;
        }
        const expected = fs.readFileSync(path.join(expectedDir, relative), "utf8");
        const actual = fs.readFileSync(path.join(actualDir, relative), "utf8");
        if (expected !== actual) {
            violations.push({
                code: "emit-drift",
                file: relative,
                message: `emitted .mjs drift detected: ${relative}`,
            });
        }
    }
}
function compareEmittedFilesToProject({ projectRoot, actualDir, violations }) {
    const actualFiles = collectFiles(actualDir).filter((file) => file.endsWith(".mjs")).sort();
    for (const actualFile of actualFiles) {
        const relative = toPosix(path.relative(actualDir, actualFile));
        const expectedFile = path.join(projectRoot, relative);
        if (!fs.existsSync(expectedFile)) {
            violations.push({
                code: "missing-checked-in-file",
                file: relative,
                message: `checked-in emitted file missing: ${relative}`,
            });
            continue;
        }
        const expected = fs.readFileSync(expectedFile, "utf8");
        const actual = fs.readFileSync(actualFile, "utf8");
        if (expected !== actual) {
            violations.push({
                code: "emit-drift",
                file: relative,
                message: `checked-in .mjs drift detected: ${relative}`,
            });
        }
    }
}
function collectSourceFiles(projectRoot, { roots } = {}) {
    const files = [];
    const sourceRoots = roots?.length ? roots.map((root) => path.join(projectRoot, root)) : [projectRoot];
    for (const sourceRoot of sourceRoots) {
        if (fs.existsSync(sourceRoot))
            walk(sourceRoot, files, (file) => file.endsWith(".mts"), projectRoot);
    }
    return files.sort();
}
function collectFiles(directory) {
    const files = [];
    if (fs.existsSync(directory))
        walk(directory, files, () => true);
    return files.sort();
}
function walk(current, files, predicate, sourceRoot) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink())
        return;
    if (stat.isDirectory()) {
        const name = path.basename(current);
        const topLevel = sourceRoot ? path.relative(sourceRoot, current).split(path.sep)[0] : "";
        if (name === "node_modules" || name === ".git" || name === ".worktrees" || name === "tmp" || topLevel === "fixtures")
            return;
        for (const entry of fs.readdirSync(current))
            walk(path.join(current, entry), files, predicate, sourceRoot);
        return;
    }
    if (stat.isFile() && predicate(current))
        files.push(current);
}
function parseLocalImportSpecifiers(content) {
    const specifiers = [];
    let index = 0;
    while (index < content.length) {
        const skipped = skipNonCode(content, index);
        if (skipped !== index) {
            index = skipped;
            continue;
        }
        if (isKeywordAt(content, index, "import")) {
            const afterKeyword = skipWhitespace(content, index + "import".length);
            if (content[afterKeyword] === "(") {
                const specifier = readFirstStringArgument(content, afterKeyword + 1);
                if (isLocalSpecifier(specifier))
                    specifiers.push(specifier);
                index = afterKeyword + 1;
                continue;
            }
            const statement = content.slice(index, findStatementEnd(content, index));
            const sideEffect = statement.match(/\bimport\s+["']([^"']+)["']/s);
            const fromImport = statement.match(/\bfrom\s*["']([^"']+)["']/s);
            const specifier = fromImport?.[1] || sideEffect?.[1];
            if (isLocalSpecifier(specifier))
                specifiers.push(specifier);
        }
        else if (isKeywordAt(content, index, "export")) {
            const statement = content.slice(index, findStatementEnd(content, index));
            const fromExport = statement.match(/\bfrom\s*["']([^"']+)["']/s);
            if (isLocalSpecifier(fromExport?.[1]))
                specifiers.push(fromExport[1]);
        }
        index += 1;
    }
    return specifiers;
}
function isLocalSpecifier(specifier) {
    return typeof specifier === "string" && (specifier.startsWith("./") || specifier.startsWith("../"));
}
function skipNonCode(content, index) {
    const char = content[index];
    const next = content[index + 1];
    if (char === "/" && next === "/") {
        const lineEnd = content.indexOf("\n", index + 2);
        return lineEnd === -1 ? content.length : lineEnd + 1;
    }
    if (char === "/" && next === "*") {
        const commentEnd = content.indexOf("*/", index + 2);
        return commentEnd === -1 ? content.length : commentEnd + 2;
    }
    if (char === "'" || char === '"' || char === "`")
        return skipString(content, index, char);
    return index;
}
function skipString(content, index, quote) {
    let cursor = index + 1;
    while (cursor < content.length) {
        if (content[cursor] === "\\") {
            cursor += 2;
            continue;
        }
        if (content[cursor] === quote)
            return cursor + 1;
        cursor += 1;
    }
    return content.length;
}
function isKeywordAt(content, index, keyword) {
    if (!content.startsWith(keyword, index))
        return false;
    const before = content[index - 1];
    const after = content[index + keyword.length];
    return !isIdentifierChar(before) && !isIdentifierChar(after);
}
function isIdentifierChar(char) {
    return typeof char === "string" && /[A-Za-z0-9_$]/.test(char);
}
function skipWhitespace(content, index) {
    let cursor = index;
    while (/\s/.test(content[cursor] || ""))
        cursor += 1;
    return cursor;
}
function findStatementEnd(content, index) {
    let cursor = index;
    while (cursor < content.length) {
        const skipped = skipNonCode(content, cursor);
        if (skipped !== cursor) {
            cursor = skipped;
            continue;
        }
        if (content[cursor] === ";")
            return cursor + 1;
        if (content[cursor] === "\n")
            return cursor;
        cursor += 1;
    }
    return content.length;
}
function readFirstStringArgument(content, index) {
    const start = skipWhitespace(content, index);
    const quote = content[start];
    if (quote !== "'" && quote !== '"')
        return undefined;
    let cursor = start + 1;
    let value = "";
    while (cursor < content.length) {
        const char = content[cursor];
        if (char === "\\") {
            value += content[cursor + 1] || "";
            cursor += 2;
            continue;
        }
        if (char === quote)
            return value;
        value += char;
        cursor += 1;
    }
    return undefined;
}
function toPosix(value) {
    return value.split(path.sep).join("/");
}
function parseArgs(argv) {
    const args = {};
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--project-root")
            args.projectRoot = argv[++index];
        else if (arg === "--config")
            args.configPath = argv[++index];
        else if (arg === "--expected-dir")
            args.expectedDir = argv[++index];
        else if (arg === "--out-dir")
            args.outDir = argv[++index];
        else
            throw new Error(`Unknown argument: ${arg}`);
    }
    return args;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        const result = checkRuntimeEmitContract(parseArgs(process.argv.slice(2)));
        if (!result.ok) {
            console.error(result.violations.map((violation) => violation.message).join("\n"));
            process.exit(1);
        }
        if (result.skippedEmit) {
            console.log("Runtime emit contract passed (no runtime .mts sources)");
            process.exit(0);
        }
        console.log("Runtime emit contract passed");
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
