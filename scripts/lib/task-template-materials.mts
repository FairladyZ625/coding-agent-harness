import path from "node:path";
import {
  lessonCandidatesFile,
  readFileSafe,
  toPosix,
  visualMapFile,
} from "./core-shared.mjs";
import type { TaskScannerTarget } from "./types/task-scanner.js";

type TemplateMaterialIssue = {
  code: string;
  severity: string;
  queue: string;
  sourcePath: string;
  sourceLine: number;
  owner: string;
  message: string;
  allowedWritePaths: string[];
  forbiddenActions: string[];
  validationCommands: string[];
  confidence: string;
  repairable: boolean;
  enforceFailure: boolean;
};

type TemplateMaterialInput = {
  briefContent: string;
  taskPlanContent: string;
  executionStrategyContent: string;
  visualMapContent: string;
  progressContent: string;
  findingsContent: string;
  reviewContent: string;
  lessonCandidatesContent: string;
  walkthroughPath: string;
  includeWalkthrough: boolean;
  humanReviewConfirmed: boolean;
};

export function collectUneditedTemplateMaterialIssues(target: TaskScannerTarget, taskDir: string, materials: TemplateMaterialInput): TemplateMaterialIssue[] {
  const issues: TemplateMaterialIssue[] = [];
  const files: Array<{ label: string; sourcePath: string; content: string }> = [
    { label: "brief.md", sourcePath: toPosix(path.relative(target.projectRoot, path.join(taskDir, "brief.md"))), content: materials.briefContent },
    { label: "task_plan.md", sourcePath: toPosix(path.relative(target.projectRoot, path.join(taskDir, "task_plan.md"))), content: materials.taskPlanContent },
    { label: "execution_strategy.md", sourcePath: toPosix(path.relative(target.projectRoot, path.join(taskDir, "execution_strategy.md"))), content: materials.executionStrategyContent },
    { label: visualMapFile, sourcePath: toPosix(path.relative(target.projectRoot, path.join(taskDir, visualMapFile))), content: materials.visualMapContent },
    { label: "progress.md", sourcePath: toPosix(path.relative(target.projectRoot, path.join(taskDir, "progress.md"))), content: materials.progressContent },
    { label: "findings.md", sourcePath: toPosix(path.relative(target.projectRoot, path.join(taskDir, "findings.md"))), content: materials.findingsContent },
    { label: "review.md", sourcePath: toPosix(path.relative(target.projectRoot, path.join(taskDir, "review.md"))), content: materials.reviewContent },
    { label: lessonCandidatesFile, sourcePath: toPosix(path.relative(target.projectRoot, path.join(taskDir, lessonCandidatesFile))), content: materials.lessonCandidatesContent },
  ];
  if (materials.includeWalkthrough && materials.walkthroughPath) {
    files.push({
      label: path.basename(materials.walkthroughPath),
      sourcePath: materials.walkthroughPath,
      content: readFileSafe(path.join(target.projectRoot, materials.walkthroughPath)),
    });
  }
  for (const file of files) {
    const markers = uneditedCoreTemplateSlots(file.label, file.content);
    if (markers.length === 0) continue;
    issues.push({
      code: "unedited-template-material",
      severity: "P2",
      queue: "missing-materials",
      sourcePath: `TARGET:${file.sourcePath}`,
      sourceLine: 0,
      owner: "agent",
      message: `[unedited-template-material] Reviewable task material still contains default core content in ${file.label}: ${markers.slice(0, 3).join(", ")}.`,
      allowedWritePaths: [`${toPosix(path.relative(target.projectRoot, taskDir))}/**`],
      forbiddenActions: ["human-confirm", "edit-unrelated-task", "fabricate-evidence"],
      validationCommands: ["node dist/harness.mjs check --profile target-project <target>"],
      confidence: "high",
      repairable: true,
      enforceFailure: materials.humanReviewConfirmed,
    });
  }
  return issues;
}

function uneditedCoreTemplateSlots(label: string, content: unknown): string[] {
  const text = String(content || "");
  const markers: string[] = [];
  if (label === "brief.md") {
    if (sectionHasDefault(text, ["Outcome Statement", "一句话结果"], [
      "One sentence stating the concrete result this task must produce.",
      "用一句话说明这个任务完成后会产生什么具体结果。",
      "说明这个任务完成后，用户或项目能直接看到的结果。",
    ])) markers.push("brief-outcome");
  } else if (label === "task_plan.md") {
    if (sectionHasDefault(text, ["Goal", "目标"], [
      "[State the outcome this task must deliver in one sentence.]",
      "[用一句话说明本任务完成后应达到的状态。]",
    ])) markers.push("task-plan-goal");
  } else if (label === "execution_strategy.md") {
    if (
      sectionHasDefault(text, ["Strategy Summary"], ["[Describe the execution approach, including why this operating model fits the risk and scope.]"]) ||
      /\|\s*L0\s*\|\s*\[静态检查\s*\/\s*小范围自检\]\s*\|\s*`?progress\.md`?\s*\|\s*\[通过标准\]\s*\|/i.test(text)
    ) {
      markers.push("execution-strategy-core-plan");
    }
  } else if (label === visualMapFile) {
    if (hasDefaultExecutionPhase(text)) markers.push("visual-map-execution-phase");
  } else if (label === "progress.md") {
    if (
      /^\|\s*YYYY-MM-DD HH:MM\s*\|\s*coordinator\s*\|\s*\[action taken\]\s*\|/im.test(text) ||
      /^###\s*\[YYYY-MM-DD HH:MM\]\s*-\s*\[阶段名称\]\s*$/im.test(text) ||
      /^-\s*做了什么：\[具体操作\]\s*$/im.test(text)
    ) {
      markers.push("progress-log-entry");
    }
  } else if (label === "review.md") {
    if (
      /\|\s*Evidence Summary\s*\|\s*\[(?:tests, diff, runtime, and review packet evidence|测试、diff、运行和审查材料证据)\]\s*\|/i.test(text) ||
      /\|\s*E-001\s*\|[^|\n]*\|[^|\n]*\|\s*\[(?:what was checked and what it showed|检查了什么，结论是什么)\]\s*\|/i.test(text)
    ) {
      markers.push("review-evidence");
    }
  } else if (label === lessonCandidatesFile) {
    if (
      /\|\s*Task-level status\s*\|\s*no-candidate-accepted\s*\|/i.test(text) &&
      /^(?:Not decided yet\. Fill this only when review accepts that the task produced no reusable lesson candidate\.|尚未判定。只有人工审查接受本任务没有可复用候选时，才填写这里。)\s*$/im.test(text)
    ) {
      markers.push("lesson-no-candidate-reason");
    }
  } else if (label === "walkthrough.md") {
    if (sectionHasDefault(text, ["Summary", "摘要"], ["Pending closeout.", "待收口。"])) markers.push("walkthrough-summary");
  }
  return markers;
}

function sectionHasDefault(text: string, headings: string[], defaults: string[]): boolean {
  const body = sectionBody(text, headings);
  if (!body) return false;
  return defaults.some((value) => body === value || body.split(/\r?\n/).map((line) => line.trim()).includes(value));
}

function sectionBody(text: string, headings: string[]): string {
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{2,6})\s+(.+?)\s*$/);
    if (!match) continue;
    if (!headings.includes(match[2].trim())) continue;
    const level = match[1].length;
    const body: string[] = [];
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const nextHeading = lines[bodyIndex].match(/^(#{2,6})\s+/);
      if (nextHeading && nextHeading[1].length <= level) break;
      if (lines[bodyIndex].trim()) body.push(lines[bodyIndex].trim());
    }
    return body.join("\n").trim();
  }
  return "";
}

function hasDefaultExecutionPhase(text: string): boolean {
  const rows = text.split(/\r?\n/).filter((line) => /^\|\s*EXEC-01\s*\|/.test(line));
  return rows.some((row) => {
    const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
    return cells.some((cell) => cell === "Scoped implementation, document update, and verification evidence" || cell === "有边界的实现、文档切片和验证证据") &&
      cells.some((cell) => cell === "diff, commands, worker handoff, or artifact path" || cell === "diff、commands、worker handoff 或 artifact path");
  });
}
