// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import {
  lessonCandidatesFile,
  readFileSafe,
  todayDate,
  toPosix,
  visualMapFile,
} from "../core-shared.mjs";
import {
  firstColumn,
  updateMarkdownTableRow,
} from "../markdown-utils.mjs";
import {
  normalizePhaseActor,
  normalizePhaseKind,
} from "../phase-kind.mjs";
import { parseLessonCandidateStatus } from "../task-lesson-candidates.mjs";

export function advanceLifecyclePhase(target, taskDir, event) {
  const visualMapPath = path.join(taskDir, visualMapFile);
  if (!fs.existsSync(visualMapPath)) return "";
  const content = readFileSafe(visualMapPath);
  let updated = false;
  const phaseUpdate = updateMarkdownTableRow(content, /^Phase ID$/i, (header, row) => {
    if (updated || !phaseMatchesLifecycleEvent(header, row, event)) return null;
    updated = true;
    const next = [...row];
    const stateIndex = firstColumn(header, ["State", "状态"]);
    const completionIndex = firstColumn(header, ["Completion", "完成度"]);
    const evidenceIndex = firstColumn(header, ["Evidence Status", "证据状态"]);
    if (stateIndex >= 0) next[stateIndex] = "done";
    if (completionIndex >= 0) next[completionIndex] = "100";
    if (evidenceIndex >= 0) next[evidenceIndex] = "present";
    return next;
  });
  if (!updated || phaseUpdate.content === content) return "";
  fs.writeFileSync(visualMapPath, phaseUpdate.content);
  return toPosix(path.relative(target.projectRoot, visualMapPath));
}

export function autoRecordNoLessonCandidateDecision(target, taskDir) {
  const candidatePath = path.join(taskDir, lessonCandidatesFile);
  if (!fs.existsSync(candidatePath)) return "";
  const content = readFileSafe(candidatePath);
  const status = parseLessonCandidateStatus(content);
  if (status.rows.length > 0 || status.declaredStatus !== "pending-review") return "";
  const next = replaceNoLessonCandidateFields(content);
  if (next === content) return "";
  fs.writeFileSync(candidatePath, next);
  return toPosix(path.relative(target.projectRoot, candidatePath));
}

function phaseMatchesLifecycleEvent(header, row, event) {
  const kindIndex = firstColumn(header, ["Kind", "阶段类型", "类型"]);
  if (kindIndex < 0) return false;
  const actorIndex = firstColumn(header, ["Actor", "执行者", "角色"]);
  const exitCommandIndex = firstColumn(header, ["Exit Command", "出口命令", "退出命令"]);
  const outputIndex = firstColumn(header, ["Output", "产出"]);
  const kind = normalizePhaseKind(row[kindIndex]);
  const actor = actorIndex >= 0 ? normalizePhaseActor(row[actorIndex]) : "agent";
  const exitCommand = String(row[exitCommandIndex] || "");
  const output = String(row[outputIndex] || "");
  if (event === "task-start") return kind === "init" && actor === "agent";
  if (event === "task-review") {
    return kind === "gate" && actor === "agent" && (/\btask-review\b/.test(exitCommand) || /Agent Review Submission/i.test(output));
  }
  if (event === "task-complete") {
    return kind === "gate" && actor === "agent" && /\btask-complete\b/.test(exitCommand);
  }
  return false;
}

function replaceNoLessonCandidateFields(content) {
  let next = String(content || "");
  const replacements = [
    [/(\|\s*Task-level status\s*\|\s*)[^|]+(\|)/i, "$1no-candidate-accepted $2"],
    [/(\|\s*Review decision\s*\|\s*)[^|]+(\|)/i, "$1accepted-no-candidate $2"],
    [/(\|\s*Closeout token\s*\|\s*)[^|]+(\|)/i, "$1checked-none:auto-no-candidate $2"],
    [/(\|\s*Last updated\s*\|\s*)[^|]+(\|)/i, `$1${todayDate()} $2`],
  ];
  for (const [pattern, replacement] of replacements) next = next.replace(pattern, replacement);
  const reason = "Agent review found no reusable lesson candidates in this task; the empty candidate table is recorded as checked for closeout.";
  return next.replace(
    /(## No-Candidate Reason\s*\n)([\s\S]*?)(?=\n## |\s*$)/,
    `$1\n${reason}\n`,
  );
}
