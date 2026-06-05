import type { ModuleKey, TaskId } from "./identity.mjs";
import { assertUniqueTaskIds, assertUniqueValues } from "./identity.mjs";

export type Module = Readonly<{
  key: ModuleKey;
  title: string;
  scope: string;
  sharedPaths: readonly string[];
  dependencies: readonly ModuleKey[];
  activeTaskIds: readonly TaskId[];
}>;

export type GeneratedProjection = Readonly<{
  name: string;
  sourceTaskIds: readonly TaskId[];
  readOnly: true;
}>;

export type WriteScope = Readonly<{
  allowedPaths: readonly string[];
}>;

export function createModule(input: Module): Module {
  const sharedPaths = normalizeUniqueRelativePaths(input.sharedPaths, "Module.sharedPaths");
  assertUniqueValues(input.dependencies, "ModuleKey");
  assertUniqueTaskIds(input.activeTaskIds);
  return {
    key: input.key,
    title: requireNonEmpty(input.title, "Module.title"),
    scope: requireNonEmpty(input.scope, "Module.scope"),
    sharedPaths,
    dependencies: [...input.dependencies],
    activeTaskIds: [...input.activeTaskIds],
  };
}

export function createGeneratedProjection(input: { name: string; sourceTaskIds: readonly TaskId[] }): GeneratedProjection {
  assertUniqueTaskIds(input.sourceTaskIds);
  return {
    name: requireNonEmpty(input.name, "GeneratedProjection.name"),
    sourceTaskIds: [...input.sourceTaskIds],
    readOnly: true,
  };
}

export function createWriteScope(input: { allowedPaths: readonly string[] }): WriteScope {
  const allowedPaths = normalizeUniqueRelativePaths(input.allowedPaths, "WriteScope.allowedPaths");
  if (allowedPaths.length === 0) throw new Error("WriteScope.allowedPaths must not be empty");
  return { allowedPaths };
}

export function isPathAllowedByWriteScope(writeScope: WriteScope, candidatePath: string): boolean {
  const candidate = normalizeRelativePath(candidatePath, "candidatePath");
  return writeScope.allowedPaths.some((allowedPath) => candidate === allowedPath || candidate.startsWith(`${allowedPath}/`));
}

function normalizeUniqueRelativePaths(paths: readonly string[], label: string): readonly string[] {
  const normalized = paths.map((path) => normalizeRelativePath(path, label));
  assertUniqueValues(normalized, label);
  return normalized;
}

function normalizeRelativePath(raw: string, label: string): string {
  const value = requireNonEmpty(raw, label).replaceAll("\\", "/").replace(/\/+/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
  if (value.startsWith("/") || value === "." || value === ".." || value.includes("../") || value.includes("/..")) {
    throw new Error(`${label} must be a repository-relative path: ${raw}`);
  }
  return value;
}

function requireNonEmpty(raw: string, label: string): string {
  const value = raw.trim();
  if (value.length === 0) throw new Error(`${label} must not be empty`);
  return value;
}
