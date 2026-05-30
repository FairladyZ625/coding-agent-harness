import path from "node:path";
import fs from "node:fs";
import { toPosix } from "./core-shared.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";

export function isExcludedTaskPlanPath(file: string, harnessPaths: ResolvedHarnessPaths): boolean {
  const relative = toPosix(path.relative(harnessPaths.projectRoot, file));
  const segments = relative.split("/").filter(Boolean);
  if (segments.includes("_task-template") || segments.includes("_optional-structures")) return true;
  if (isTaskLocalOptionalStructure(file, harnessPaths.projectRoot, segments)) return true;
  const generatedRoot = toPosix(path.relative(harnessPaths.projectRoot, harnessPaths.generatedRoot || ""));
  if (generatedRoot && (relative === `${generatedRoot}/task_plan.md` || relative.startsWith(`${generatedRoot}/`))) return true;
  const governanceRoot = toPosix(path.relative(harnessPaths.projectRoot, harnessPaths.governanceRoot || ""));
  return Boolean(governanceRoot && (
    relative.startsWith(`${governanceRoot}/releases/`) ||
    relative.startsWith(`${governanceRoot}/archive/`) ||
    relative.startsWith(`${governanceRoot}/generated/`)
  ));
}

function isTaskLocalOptionalStructure(file: string, projectRoot: string, segments: string[]): boolean {
  const taskPlanFile = path.basename(file) === "task_plan.md";
  if (!taskPlanFile) return false;
  for (const segmentName of ["artifacts", "references"]) {
    const segmentIndex = segments.indexOf(segmentName);
    if (segmentIndex < 1) continue;
    const ancestorDir = path.join(projectRoot, ...segments.slice(0, segmentIndex));
    if (fs.existsSync(path.join(ancestorDir, "task_plan.md"))) return true;
  }
  return false;
}
