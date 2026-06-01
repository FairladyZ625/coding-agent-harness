#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  assert,
  acceptNoLessonCandidate,
  expectPass,
  run,
  sanitizeTemplateFixtureMaterials,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

function createReviewableTask(targetName: string, title: string): { target: string; taskDir: string } {
  const target = path.join(tmpRoot, targetName);
  expectPass(["init", "--locale", "zh-CN", "--capabilities", "core", target]);
  expectPass(["new-task", "--budget", "standard", "--title", title, target]);

  const tasksRoot = path.join(target, "coding-agent-harness/planning/tasks");
  const taskIds = fs.readdirSync(tasksRoot).filter((name) => fs.statSync(path.join(tasksRoot, name)).isDirectory());
  assert(taskIds.length === 1, `expected one generated task, got ${taskIds.length}`);
  const taskDir = path.join(tasksRoot, taskIds[0]);

  const progressPath = path.join(taskDir, "progress.md");
  let progress = fs.readFileSync(progressPath, "utf8");
  progress = progress.replace(/^##\s*状态：未开始/im, "## 状态：审查中");
  fs.writeFileSync(progressPath, progress);

  return { target, taskDir };
}

const defaultCore = createReviewableTask("task-material-template-default-core", "核心说明未改任务");
const defaultCoreCheck = run(["check", "--profile", "target-project", defaultCore.target]);
assert(defaultCoreCheck.status !== 0, "target-project check should fail when a reviewable standard task still contains default core explanatory text");
assert(
  defaultCoreCheck.stderr.includes("unedited-template-material"),
  `check should report unedited-template-material for default core text\nSTDOUT:\n${defaultCoreCheck.stdout}\nSTDERR:\n${defaultCoreCheck.stderr}`,
);

const earlyWalkthrough = createReviewableTask("task-material-template-early-walkthrough", "过早收口模板任务");
sanitizeTemplateFixtureMaterials(earlyWalkthrough.taskDir);
acceptNoLessonCandidate(earlyWalkthrough.taskDir);
fs.writeFileSync(path.join(earlyWalkthrough.taskDir, "walkthrough.md"), "# Walkthrough\n\n## Summary\n\nPending closeout.\n");
const earlyWalkthroughStatus = run(["status", "--json", earlyWalkthrough.target]);
assert(earlyWalkthroughStatus.status === 0, `status should render early walkthrough fixture\nSTDOUT:\n${earlyWalkthroughStatus.stdout}\nSTDERR:\n${earlyWalkthroughStatus.stderr}`);
const earlyWalkthroughTask = JSON.parse(earlyWalkthroughStatus.stdout).tasks[0];
const earlyWalkthroughMessages = JSON.stringify(earlyWalkthroughTask.materialIssues || []);
assert(
  !earlyWalkthroughMessages.includes("walkthrough.md: walkthrough-summary"),
  `pre-submission review repair should not demand closeout walkthrough content\n${earlyWalkthroughMessages}`,
);
assert(
  earlyWalkthroughMessages.includes("missing-review-submission"),
  `pre-submission review repair should still report the actual review entry blocker\n${earlyWalkthroughMessages}`,
);

const nonCoreOnly = createReviewableTask("task-material-template-non-core-placeholders", "非核心占位保留任务");
sanitizeTemplateFixtureMaterials(nonCoreOnly.taskDir);
acceptNoLessonCandidate(nonCoreOnly.taskDir);

const visualMapPath = path.join(nonCoreOnly.taskDir, "visual_map.md");
let visualMap = fs.readFileSync(visualMapPath, "utf8");
visualMap = visualMap.replace(
  /(\| EXEC-01 \|[^\n]*\| agent \| missing \| )fixture-concrete( \| )fixture-concrete( \|)/,
  "$1[risk]$2[owner]$3",
);
assert(visualMap.includes("| [risk] | [owner] |"), "fixture should retain non-core visual map placeholders");
fs.writeFileSync(visualMapPath, visualMap);

const nonCoreOnlyCheck = run(["check", "--profile", "target-project", nonCoreOnly.target]);
assert(
  nonCoreOnlyCheck.status === 0,
  `target-project check should pass when core explanatory text is concrete and only non-core placeholders remain\nSTDOUT:\n${nonCoreOnlyCheck.stdout}\nSTDERR:\n${nonCoreOnlyCheck.stderr}`,
);
assert(
  !nonCoreOnlyCheck.stderr.includes("unedited-template-material"),
  `non-core placeholders should not report unedited-template-material\nSTDOUT:\n${nonCoreOnlyCheck.stdout}\nSTDERR:\n${nonCoreOnlyCheck.stderr}`,
);

console.log("Task material template readiness tests passed");
