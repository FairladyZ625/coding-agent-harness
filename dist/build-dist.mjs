#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typescriptVersion = "5.9.3";
export function buildRuntimeDist({ projectRoot = repoRoot, configPath = path.join(projectRoot, "tsconfig.dist.json"), outDir = path.join(projectRoot, "dist"), } = {}) {
    const absoluteProjectRoot = path.resolve(projectRoot);
    const absoluteConfig = path.resolve(configPath);
    const absoluteOutDir = path.resolve(outDir);
    const defaultDist = path.join(absoluteProjectRoot, "dist");
    const buildOutDir = absoluteOutDir === defaultDist
        ? fs.mkdtempSync(path.join(os.tmpdir(), "coding-agent-harness-dist-build-"))
        : absoluteOutDir;
    if (!fs.existsSync(absoluteConfig)) {
        return {
            ok: false,
            error: `dist build config not found: ${absoluteConfig}`,
        };
    }
    if (isDangerousOutDir({ projectRoot: absoluteProjectRoot, outDir: absoluteOutDir })) {
        return {
            ok: false,
            error: `refusing to clean unsafe dist output directory: ${absoluteOutDir}`,
        };
    }
    fs.rmSync(buildOutDir, { recursive: true, force: true });
    const emit = spawnSync("npm", ["exec", "--yes", "--package", `typescript@${typescriptVersion}`, "--", "tsc", "-p", absoluteConfig, "--outDir", buildOutDir, "--noCheck"], {
        cwd: absoluteProjectRoot,
        encoding: "utf8",
    });
    if (emit.status !== 0) {
        return {
            ok: false,
            error: `TypeScript dist build failed\nSTDOUT:\n${emit.stdout}\nSTDERR:\n${emit.stderr}`,
            status: emit.status,
        };
    }
    if (buildOutDir !== absoluteOutDir) {
        syncDirectory(buildOutDir, absoluteOutDir);
        fs.rmSync(buildOutDir, { recursive: true, force: true });
    }
    const files = collectFiles(absoluteOutDir).filter((file) => file.endsWith(".mjs")).sort();
    const relativeFiles = files.map((file) => toPosix(path.relative(absoluteOutDir, file)));
    const requiredFiles = [
        "harness.mjs",
        "postinstall.mjs",
        "lib/harness-core.mjs",
        "commands/task-command.mjs",
    ];
    const missingFiles = requiredFiles.filter((file) => !relativeFiles.includes(file));
    if (missingFiles.length > 0) {
        return {
            ok: false,
            error: `dist build missing required runtime files: ${missingFiles.join(", ")}`,
            outDir: absoluteOutDir,
            files: relativeFiles,
        };
    }
    return {
        ok: true,
        outDir: absoluteOutDir,
        files: relativeFiles,
    };
}
function isDangerousOutDir({ projectRoot, outDir }) {
    const parsed = path.parse(outDir);
    if (outDir === parsed.root)
        return true;
    if (outDir === projectRoot)
        return true;
    const defaultDist = path.join(projectRoot, "dist");
    if (outDir === defaultDist || outDir.startsWith(`${defaultDist}${path.sep}`))
        return false;
    const relativeToProject = path.relative(projectRoot, outDir);
    if (relativeToProject && !relativeToProject.startsWith("..") && !path.isAbsolute(relativeToProject))
        return true;
    const tempRoot = fs.realpathSync.native(os.tmpdir());
    const outputParent = fs.existsSync(path.dirname(outDir)) ? fs.realpathSync.native(path.dirname(outDir)) : path.resolve(path.dirname(outDir));
    if (outputParent === tempRoot || outputParent.startsWith(`${tempRoot}${path.sep}`))
        return false;
    return true;
}
function collectFiles(directory) {
    const files = [];
    if (fs.existsSync(directory))
        walk(directory, files);
    return files;
}
function walk(current, files) {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink())
        return;
    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(current))
            walk(path.join(current, entry), files);
        return;
    }
    if (stat.isFile())
        files.push(current);
}
function syncDirectory(sourceDir, targetDir) {
    fs.mkdirSync(targetDir, { recursive: true });
    const sourceEntries = new Set(fs.readdirSync(sourceDir));
    for (const entry of sourceEntries) {
        const source = path.join(sourceDir, entry);
        const target = path.join(targetDir, entry);
        const stat = fs.lstatSync(source);
        if (stat.isDirectory()) {
            syncDirectory(source, target);
        }
        else if (stat.isFile()) {
            const tempTarget = `${target}.tmp-${process.pid}`;
            fs.copyFileSync(source, tempTarget);
            fs.renameSync(tempTarget, target);
        }
    }
    for (const entry of fs.readdirSync(targetDir)) {
        if (sourceEntries.has(entry))
            continue;
        fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
    }
}
function toPosix(value) {
    return value.split(path.sep).join("/");
}
function parseArgs(argv) {
    const options = {
        projectRoot: repoRoot,
        configPath: path.join(repoRoot, "tsconfig.dist.json"),
        outDir: path.join(repoRoot, "dist"),
        json: false,
        quiet: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === "--json") {
            options.json = true;
        }
        else if (arg === "--quiet") {
            options.quiet = true;
        }
        else if (arg === "--out-dir") {
            options.outDir = path.resolve(options.projectRoot, requireValue(argv, index, arg));
            index += 1;
        }
        else if (arg === "--config") {
            options.configPath = path.resolve(options.projectRoot, requireValue(argv, index, arg));
            index += 1;
        }
        else {
            throw new Error(`Unknown build-dist option: ${arg}`);
        }
    }
    return options;
}
function requireValue(argv, index, option) {
    const value = argv[index + 1];
    if (!value)
        throw new Error(`${option} requires a value`);
    return value;
}
if (import.meta.url === `file://${process.argv[1]}`) {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    }
    catch (error) {
        console.error(error.message);
        process.exit(1);
    }
    const result = buildRuntimeDist(options);
    if (options.json) {
        console.log(JSON.stringify(result, null, 2));
    }
    else if (result.ok && !options.quiet) {
        console.log(`Runtime dist build completed: ${path.relative(repoRoot, result.outDir) || "."} (${result.files.length} files)`);
    }
    else if (!result.ok) {
        console.error(result.error);
    }
    if (!result.ok)
        process.exit(result.status || 1);
}
