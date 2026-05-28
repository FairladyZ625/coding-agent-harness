#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["scripts", "tests"];
const tsNocheckPattern = /^\s*\/\/\s*@ts-nocheck\b/;
export function checkNoTsNocheck({ repoRoot = defaultRepoRoot, allowlistPath = path.join(repoRoot, "scripts/ts-nocheck-allowlist.json"), } = {}) {
    const files = collectMtsFiles(repoRoot);
    const allowlist = readAllowlist(allowlistPath);
    const violations = [];
    const observed = new Set();
    for (const file of files) {
        const absolutePath = path.join(repoRoot, file);
        const lines = fs.readFileSync(absolutePath, "utf8").split(/\r?\n/);
        const lineIndex = lines.findIndex((line) => tsNocheckPattern.test(line));
        if (lineIndex === -1)
            continue;
        observed.add(file);
        if (!allowlist.has(file)) {
            violations.push({
                code: "unlisted-ts-nocheck",
                file,
                line: lineIndex + 1,
                message: `${file}:${lineIndex + 1} has @ts-nocheck but is not in scripts/ts-nocheck-allowlist.json`,
            });
        }
    }
    for (const file of allowlist) {
        if (!observed.has(file)) {
            violations.push({
                code: "stale-ts-nocheck-allowlist",
                file,
                message: `${file} is listed in scripts/ts-nocheck-allowlist.json but no longer has @ts-nocheck`,
            });
        }
    }
    return { ok: violations.length === 0, violations };
}
function collectMtsFiles(repoRoot) {
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
    if (stat.isFile() && current.endsWith(".mts")) {
        files.push(path.relative(repoRoot, current).split(path.sep).join("/"));
    }
}
function readAllowlist(allowlistPath) {
    if (!allowlistPath || !fs.existsSync(allowlistPath))
        return new Set();
    const parsed = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
    const files = normalizeAllowlistFiles(parsed);
    return new Set(files);
}
function normalizeAllowlistFiles(parsed) {
    if (Array.isArray(parsed))
        return parsed.filter((value) => typeof value === "string");
    if (typeof parsed !== "object" || parsed === null)
        return [];
    const files = parsed.files;
    return Array.isArray(files) ? files.filter((value) => typeof value === "string") : [];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const result = checkNoTsNocheck();
    if (!result.ok) {
        console.error(result.violations.map((violation) => violation.message).join("\n"));
        process.exit(1);
    }
    console.log("No @ts-nocheck gate passed");
}
