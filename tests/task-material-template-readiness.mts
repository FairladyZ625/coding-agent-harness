#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  assert,
  expectPass,
  run,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

const target = path.join(tmpRoot, "task-material-template-readiness-target");
expectPass(["init", "--locale", "zh-CN", "--capabilities", "core", target]);
expectPass(["new-task", "--budget", "standard", "--title", "模板未改写任务", target]);

const tasksRoot = path.join(target, "coding-agent-harness/planning/tasks");
const taskIds = fs.readdirSync(tasksRoot).filter((name) => fs.statSync(path.join(tasksRoot, name)).isDirectory());
assert(taskIds.length === 1, `expected one generated task, got ${taskIds.length}`);
const taskDir = path.join(tasksRoot, taskIds[0]);

const progressPath = path.join(taskDir, "progress.md");
let progress = fs.readFileSync(progressPath, "utf8");
progress = progress.replace(/^##\s*状态：未开始/im, "## 状态：审查中");
fs.writeFileSync(progressPath, progress);

const check = run(["check", "--profile", "target-project", target]);
assert(check.status !== 0, "target-project check should fail when a reviewable standard task still contains untouched scaffold templates");
assert(
  check.stderr.includes("unedited-template-material"),
  `check should report unedited-template-material\nSTDOUT:\n${check.stdout}\nSTDERR:\n${check.stderr}`,
);

console.log("Task material template readiness tests passed");
