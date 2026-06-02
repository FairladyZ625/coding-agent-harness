import fs from "node:fs";
import path from "node:path";
import { toPosix, visualMapFile } from "../core-shared.mjs";
import type { LifecycleTarget } from "../types/task-lifecycle.js";

type LifecycleGateEvent = "task-start" | "task-review" | "task-complete" | "task-log" | "task-block" | string;

export function plannedLifecycleAllowedPaths(target: LifecycleTarget, taskDir: string, event: LifecycleGateEvent): string[] {
  const progressPath = path.join(taskDir, "progress.md");
  const allowedPaths = [toPosix(path.relative(target.projectRoot, progressPath))];
  const visualMapPath = previewLifecyclePhasePath(target, taskDir, event);
  if (visualMapPath) allowedPaths.push(visualMapPath);
  if (event === "task-review") {
    allowedPaths.push(toPosix(path.relative(target.projectRoot, path.join(taskDir, "review.md"))));
    const lessonCandidatesPath = path.join(taskDir, "lesson_candidates.md");
    if (fs.existsSync(lessonCandidatesPath)) {
      allowedPaths.push(toPosix(path.relative(target.projectRoot, lessonCandidatesPath)));
    }
  }
  if (event === "task-complete" && target.harness.version === 2) {
    allowedPaths.push(toPosix(path.relative(target.projectRoot, path.join(taskDir, "walkthrough.md"))));
  }
  return allowedPaths;
}

function previewLifecyclePhasePath(target: LifecycleTarget, taskDir: string, event: LifecycleGateEvent): string {
  if (!["task-start", "task-review", "task-complete"].includes(event)) return "";
  const visualMapPath = path.join(taskDir, visualMapFile);
  return fs.existsSync(visualMapPath) ? toPosix(path.relative(target.projectRoot, visualMapPath)) : "";
}
