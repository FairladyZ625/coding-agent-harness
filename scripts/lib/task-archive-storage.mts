import fs from "node:fs";
import path from "node:path";
import { toPosix } from "./core-shared.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";

export function archiveTaskRoots(harnessPaths: ResolvedHarnessPaths): string[] {
  const archiveRoot = path.join(harnessPaths.governanceRoot, "archive");
  const releaseRoot = path.join(archiveRoot, "releases");
  return [
    path.join(archiveRoot, "tasks"),
    path.join(archiveRoot, "soft-deleted", "tasks"),
    ...releaseTaskRoots(releaseRoot),
  ].filter((root) => fs.existsSync(root));
}

export function tombstoneStorageRoot(harnessPaths: ResolvedHarnessPaths, deletionState: string, release = ""): string {
  const archiveRoot = path.join(harnessPaths.governanceRoot, "archive");
  if (deletionState === "soft-deleted") return path.join(archiveRoot, "soft-deleted", "tasks");
  if (release) return path.join(archiveRoot, "releases", release, "tasks");
  return path.join(archiveRoot, "tasks");
}

export function taskIdFromArchiveStoragePath(projectRoot: string, directory: string): string {
  const relative = toPosix(path.relative(projectRoot, directory));
  return relative.match(/(?:^|\/)governance\/archive\/(?:(?:releases\/[^/]+\/)|(?:soft-deleted\/))?tasks\/((?:TASKS|MODULES|EXTERNAL)\/.+)$/)?.[1] || "";
}

function releaseTaskRoots(releaseRoot: string): string[] {
  if (!fs.existsSync(releaseRoot)) return [];
  return fs.readdirSync(releaseRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(releaseRoot, entry.name, "tasks"));
}
