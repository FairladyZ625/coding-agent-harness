import path from "node:path";
import { readFileSafe, toPosix } from "./core-shared.mjs";
import { taskRefPath } from "./harness-paths.mjs";
import { readTaskContractFile, readVisualMapContractFile } from "./task-visual-map-contract.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";

type ReviewAuditTarget = {
  projectRoot: string;
  planningRoot?: string;
  tasksRoot?: string;
  modulesRoot?: string;
};

type ReviewAuditProvenance = {
  identity: { taskKey: string };
  locations: {
    current: string;
    original: string;
    historical: string[];
  };
  reviewAudit: {
    allowedPathGroups: string[][];
  };
  archive: {
    archived: boolean;
    currentPath: string;
  };
};

export function reviewAuditProvenanceProjection(target: ReviewAuditTarget, taskKey: string, { currentIndexPath, currentTaskDir, deletionState, originalTaskDir = "" }: { currentIndexPath: string; currentTaskDir: string; deletionState: string; originalTaskDir?: string }): ReviewAuditProvenance {
  const currentIndex = toPosix(path.relative(target.projectRoot, currentIndexPath));
  const historicalIndexes = new Set<string>();
  const activeTaskDir = originalTaskDir || activeTaskDirectoryForKey(target, taskKey);
  if (activeTaskDir) historicalIndexes.add(toPosix(path.relative(target.projectRoot, path.join(activeTaskDir, "INDEX.md"))));
  const historical = [...historicalIndexes].filter((item) => item !== currentIndex).sort();
  return {
    identity: { taskKey },
    locations: {
      current: toPosix(path.relative(target.projectRoot, currentTaskDir)),
      original: activeTaskDir ? toPosix(path.relative(target.projectRoot, activeTaskDir)) : "",
      historical,
    },
    reviewAudit: {
      allowedPathGroups: [
        [currentIndex],
        ...historical.map((item) => [item]),
      ],
    },
    archive: {
      archived: deletionState === "archived",
      currentPath: currentIndex.includes("/governance/archive/") ? currentIndex : "",
    },
  };
}

export function provenanceTaskDirectories(target: ReviewAuditTarget, provenance: { locations?: { current?: unknown; original?: unknown } } | null, fallbackTaskDir: string): string[] {
  const candidates = [
    typeof provenance?.locations?.current === "string" ? path.join(target.projectRoot, provenance.locations.current) : "",
    typeof provenance?.locations?.original === "string" ? path.join(target.projectRoot, provenance.locations.original) : "",
    fallbackTaskDir,
  ];
  return [...new Set(candidates.filter(Boolean))];
}

export function readFileFromTaskDirectories(taskDirs: string[], fileName: string): string {
  for (const taskDir of taskDirs) {
    const content = readFileSafe(path.join(taskDir, fileName));
    if (content) return content;
  }
  return "";
}

export function readContractFileFromTaskDirectories(taskDirs: string[], fileName: string, legacyContent = "") {
  for (const taskDir of taskDirs) {
    const contract = readTaskContractFile(taskDir, fileName, legacyContent);
    if (contract.content) return contract;
  }
  return readTaskContractFile(taskDirs[0] || "", fileName, legacyContent);
}

export function readVisualMapFromTaskDirectories(taskDirs: string[], legacyContent = "") {
  for (const taskDir of taskDirs) {
    const visualMap = readVisualMapContractFile(taskDir, legacyContent);
    if (visualMap.content) return visualMap;
  }
  return readVisualMapContractFile(taskDirs[0] || "", legacyContent);
}

function activeTaskDirectoryForKey(target: ReviewAuditTarget, taskKey: string): string {
  if (!taskKey || !target.planningRoot || !target.tasksRoot || !target.modulesRoot) return "";
  return taskRefPath(target as ResolvedHarnessPaths, taskKey) || "";
}
