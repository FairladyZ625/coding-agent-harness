#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const distRoot = path.join(repoRoot, "dist");

type TaskKernelModule = {
  TASK_KERNEL_FRAME_VERSION: string;
  listTaskKernelLayers: () => readonly { id: string; path: string }[];
  taskKernelAdaptersBoundary: { layer: string };
  taskKernelApplicationBoundary: { layer: string };
  taskKernelDomainBoundary: { layer: string };
  taskKernelInfrastructureBoundary: { layer: string };
  taskKernelPortsBoundary: { layer: string };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const kernelModule = await import(pathToFileURL(path.join(distRoot, "kernel/task/index.mjs")).href) as TaskKernelModule;
const layerIds = kernelModule.listTaskKernelLayers().map((layer) => layer.id);

assert(kernelModule.TASK_KERNEL_FRAME_VERSION === "task-kernel-frame/2026-06-05-tk00", "Task Kernel frame version should be stable");
assert(JSON.stringify(layerIds) === JSON.stringify(["domain", "application", "ports", "infrastructure", "adapters"]), "Task Kernel layer order should be stable");
assert(kernelModule.taskKernelDomainBoundary.layer === "domain", "domain boundary export should be available");
assert(kernelModule.taskKernelApplicationBoundary.layer === "application", "application boundary export should be available");
assert(kernelModule.taskKernelPortsBoundary.layer === "ports", "ports boundary export should be available");
assert(kernelModule.taskKernelInfrastructureBoundary.layer === "infrastructure", "infrastructure boundary export should be available");
assert(kernelModule.taskKernelAdaptersBoundary.layer === "adapters", "adapters boundary export should be available");

const productionFiles = collectProductionFiles(path.join(repoRoot, "scripts/kernel/task"));
assert(productionFiles.length > 0, "Task Kernel production frame should contain source files");

for (const file of productionFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const specifier of localImportSpecifiers(source)) {
    const target = resolveLocalSpecifier(file, specifier);
    assert(
      !target || !toPosix(path.relative(repoRoot, target)).startsWith("scripts/lib/"),
      `${toPosix(path.relative(repoRoot, file))} must not import legacy production runtime ${specifier}`,
    );
  }
}

console.log("Task Kernel smoke test passed");

function collectProductionFiles(root: string): string[] {
  const files: string[] = [];
  walk(root, files);
  return files.filter((file) => /\.(mts|ts)$/.test(file)).sort();
}

function walk(current: string, files: string[]): void {
  const stat = fs.lstatSync(current);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(current)) walk(path.join(current, entry), files);
    return;
  }
  if (stat.isFile()) files.push(current);
}

function localImportSpecifiers(source: string): string[] {
  const specifiers = [];
  const importPattern = /\b(?:import|export)\b[\s\S]*?\bfrom\s+["']([^"']+)["']/g;
  const sideEffectImportPattern = /\bimport\s+["']([^"']+)["']/g;
  for (const match of source.matchAll(importPattern)) {
    if (match[1]?.startsWith(".")) specifiers.push(match[1]);
  }
  for (const match of source.matchAll(sideEffectImportPattern)) {
    if (match[1]?.startsWith(".")) specifiers.push(match[1]);
  }
  return specifiers;
}

function resolveLocalSpecifier(importer: string, specifier: string): string | undefined {
  const basePath = path.resolve(path.dirname(importer), specifier);
  for (const candidate of candidatePaths(basePath)) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

function candidatePaths(basePath: string): string[] {
  const extension = path.extname(basePath);
  if (extension) {
    const paths = [basePath];
    if (extension === ".js") paths.push(basePath.slice(0, -3) + ".ts", basePath.slice(0, -3) + ".mts", basePath.slice(0, -3) + ".mjs");
    if (extension === ".mjs") paths.push(basePath.slice(0, -4) + ".mts");
    return paths;
  }
  return [
    basePath,
    `${basePath}.mjs`,
    `${basePath}.mts`,
    `${basePath}.ts`,
    `${basePath}.js`,
    path.join(basePath, "index.mjs"),
    path.join(basePath, "index.mts"),
    path.join(basePath, "index.ts"),
  ];
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
