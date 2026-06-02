import path from "node:path";
import {
  allowedTaskStateValues,
  allowedZhTaskStateValues,
  toPosix,
} from "./core-shared.mjs";
import type { TaskScannerTarget } from "./types/task-scanner.js";

type TaskStateInfo = {
  source: string;
  raw: string;
};

export function invalidTaskStateMaterialIssues(target: TaskScannerTarget, taskDir: string, stateInfo: TaskStateInfo) {
  if (stateInfo.source !== "invalid") return [];
  const allowed = allowedTaskStateValues.join(", ");
  const allowedZh = allowedZhTaskStateValues.join(", ");
  return [{
    code: "invalid-task-state",
    severity: "P2",
    queue: "missing-materials",
    sourcePath: "TARGET:progress.md",
    sourceLine: 0,
    owner: "agent",
    message: `Invalid task state "${stateInfo.raw}" in progress.md. Allowed values: ${allowed}. zh-CN allowed values: ${allowedZh}. Suggested fix: replace the ## 状态 / ## Current Status machine field with one allowed value; write fine-grained coordination status in the progress log or coordinator handoff.`,
    allowedWritePaths: [`${toPosix(path.relative(target.projectRoot, taskDir))}/progress.md`],
    forbiddenActions: ["human-confirm", "edit-unrelated-task", "fabricate-evidence", "add-task-state"],
    validationCommands: ["node dist/harness.mjs check --profile target-project <target>"],
    confidence: "exact",
    repairable: true,
  }];
}
