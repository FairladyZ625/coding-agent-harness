#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const typescriptVersion = "5.9.3";

type BuildRuntimeDistOptions = {
  projectRoot?: string;
  configPath?: string;
  outDir?: string;
};

type BuildRuntimeDistResult =
  | { ok: true; outDir: string; files: string[] }
  | { ok: false; error: string; outDir?: string; files?: string[]; status?: number | null };

type BuildDistCliOptions = Required<BuildRuntimeDistOptions> & {
  json: boolean;
  quiet: boolean;
};

export function buildRuntimeDist({
  projectRoot = repoRoot,
  configPath = path.join(projectRoot, "tsconfig.dist.json"),
  outDir = path.join(projectRoot, "dist"),
}: BuildRuntimeDistOptions = {}): BuildRuntimeDistResult {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const absoluteConfig = path.resolve(configPath);
  const absoluteOutDir = path.resolve(outDir);
  const defaultDist = path.join(absoluteProjectRoot, "dist");
  const buildOutDir =
    absoluteOutDir === defaultDist
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
  fs.mkdirSync(buildOutDir, { recursive: true });

  const npmArgs = ["exec", "--yes", "--package", `typescript@${typescriptVersion}`, "--", "tsc", "-p", absoluteConfig, "--outDir", buildOutDir, "--noCheck"];
  const npmExecPath = process.env.npm_execpath;
  const command = npmExecPath ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const commandArgs = npmExecPath ? [npmExecPath, ...npmArgs] : npmArgs;
  const emit = spawnSync(
    command,
    commandArgs,
    {
      cwd: absoluteProjectRoot,
      encoding: "utf8",
    },
  );

  if (emit.status !== 0) {
    return {
      ok: false,
      error: `TypeScript dist build failed${emit.error ? `\nERROR:\n${emit.error.message}` : ""}\nSTDOUT:\n${emit.stdout ?? ""}\nSTDERR:\n${emit.stderr ?? ""}`,
      status: emit.status,
    };
  }

  if (buildOutDir !== absoluteOutDir) {
    syncDirectory(buildOutDir, absoluteOutDir);
    fs.rmSync(buildOutDir, { recursive: true, force: true });
  }

  restoreExecutableEntrypoints({
    outDir: absoluteOutDir,
    binRelativePaths: ["harness.mjs"],
  });

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

function isDangerousOutDir({ projectRoot, outDir }: { projectRoot: string; outDir: string }): boolean {
  const parsed = path.parse(outDir);
  if (outDir === parsed.root) return true;
  if (outDir === projectRoot) return true;
  const defaultDist = path.join(projectRoot, "dist");
  if (outDir === defaultDist || outDir.startsWith(`${defaultDist}${path.sep}`)) return false;

  const relativeToProject = path.relative(projectRoot, outDir);
  if (relativeToProject && !relativeToProject.startsWith("..") && !path.isAbsolute(relativeToProject)) return true;

  const tempRoot = fs.realpathSync.native(os.tmpdir());
  const outputParent = fs.existsSync(path.dirname(outDir)) ? fs.realpathSync.native(path.dirname(outDir)) : path.resolve(path.dirname(outDir));
  if (outputParent === tempRoot || outputParent.startsWith(`${tempRoot}${path.sep}`)) return false;

  return true;
}

function collectFiles(directory: string): string[] {
  const files: string[] = [];
  if (fs.existsSync(directory)) walk(directory, files);
  return files;
}

function walk(current: string, files: string[]): void {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(current)) walk(path.join(current, entry), files);
    return;
  }
  if (stat.isFile()) files.push(current);
}

function syncDirectory(sourceDir: string, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  const sourceEntries = new Set(fs.readdirSync(sourceDir));
  for (const entry of sourceEntries) {
    const source = path.join(sourceDir, entry);
    const target = path.join(targetDir, entry);
    const stat = fs.lstatSync(source);
    if (stat.isDirectory()) {
      syncDirectory(source, target);
    } else if (stat.isFile()) {
      const tempTarget = `${target}.tmp-${process.pid}`;
      fs.copyFileSync(source, tempTarget);
      fs.renameSync(tempTarget, target);
    }
  }
  for (const entry of fs.readdirSync(targetDir)) {
    if (sourceEntries.has(entry)) continue;
    if (entry.includes(".tmp-")) continue;
    fs.rmSync(path.join(targetDir, entry), { recursive: true, force: true });
  }
}

function restoreExecutableEntrypoints({ outDir, binRelativePaths }: { outDir: string; binRelativePaths: string[] }): void {
  for (const relativePath of binRelativePaths) {
    const file = path.join(outDir, relativePath);
    if (!fs.existsSync(file)) continue;
    const stat = fs.statSync(file);
    fs.chmodSync(file, stat.mode | 0o755);
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

function parseArgs(argv: string[]): BuildDistCliOptions {
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
    } else if (arg === "--quiet") {
      options.quiet = true;
    } else if (arg === "--out-dir") {
      options.outDir = path.resolve(options.projectRoot, requireValue(argv, index, arg));
      index += 1;
    } else if (arg === "--config") {
      options.configPath = path.resolve(options.projectRoot, requireValue(argv, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown build-dist option: ${arg}`);
    }
  }

  return options;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${option} requires a value`);
  return value;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync.native(fileURLToPath(import.meta.url)) === fs.realpathSync.native(process.argv[1]);
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (isMainModule()) {
  let options: BuildDistCliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const result = buildRuntimeDist(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok && !options.quiet) {
    console.log(`Runtime dist build completed: ${path.relative(repoRoot, result.outDir) || "."} (${result.files.length} files)`);
  } else if (!result.ok) {
    console.error(result.error);
  }

  if (!result.ok) process.exit(result.status || 1);
}
