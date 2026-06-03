import fs from "node:fs";
import path from "node:path";
import {
  normalizeTarget,
  readFileSafe,
  slug,
  toPosix,
} from "./core-shared.mjs";
import { parseLessonCandidateStatus } from "./task-lesson-candidates.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  releaseGovernanceSync,
} from "./governance-sync.mjs";
import { createTaskLessonPromotionReader } from "./task-repository.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";
import type { TaskLessonPromotionReader, TaskLessonPromotionTask } from "./types/task-repository.js";

type LessonTarget = ReturnType<typeof normalizeTarget> & {
  projectRoot: string;
  harness: ResolvedHarnessPaths;
  lessonPromotionReader?: TaskLessonPromotionReader;
};

type PromotionChange = {
  action: string;
  path: string;
};

type PromoteLessonOptions = {
  dryRun?: boolean;
  apply?: boolean;
};

type LessonDetailInput = {
  lessonId: string;
  candidate: Record<string, string>;
  task: TaskLessonPromotionTask;
};

export function promoteLessonCandidate(targetInput: string, taskId: string, candidateId: string, { dryRun = false, apply = false }: PromoteLessonOptions = {}) {
  const target = normalizeTarget(targetInput) as LessonTarget;
  const lessonPromotionReader = target.lessonPromotionReader || createTaskLessonPromotionReader(target);
  const task = lessonPromotionReader.resolveLessonPromotionTask(taskId);
  if (!candidateId) throw new Error("Missing lesson candidate id");
  const candidatePath = task.paths.lessonCandidatePath;
  const candidateContent = readFileSafe(candidatePath);
  const parsed = parseLessonCandidateStatus(candidateContent);
  const row = parsed.rows.find((item) => item.id.toLowerCase() === candidateId.toLowerCase());
  if (!row) throw new Error(`Lesson candidate not found: ${candidateId}`);
  if (!["needs-promotion", "promoted"].includes(row.status)) {
    throw new Error(`Lesson candidate must be needs-promotion before promotion; current status is ${row.status}`);
  }

  const lessonId = lessonIdFromCandidate(row.id);
  const title = row.title || lessonId;
  const detailRoot = target.harness.version === 2
    ? toPosix(path.relative(target.projectRoot, path.join(target.harness.governanceRoot, "lessons")))
    : "docs/01-GOVERNANCE/lessons";
  const detailRelative = `${detailRoot}/${lessonId}-${slug(title)}.md`;
  const detailPath = path.join(target.projectRoot, detailRelative);

  const changes: PromotionChange[] = [];
  if (!fs.existsSync(detailPath)) changes.push({ action: dryRun ? "would-create" : "create", path: `TARGET:${detailRelative}` });
  if (row.status !== "promoted" || parsed.status !== "promoted") changes.push({ action: dryRun ? "would-update" : "update", path: `TARGET:${task.paths.relativeLessonCandidatePath || toPosix(path.relative(target.projectRoot, candidatePath))}` });

  const effectiveDryRun = dryRun || !apply;
  if (effectiveDryRun) {
    return {
      dryRun: true,
      applyRequired: true,
      taskId: task.id,
      candidateId: row.id,
      lessonId,
      detailDoc: `TARGET:${detailRelative}`,
      changes: changes.map((change) => ({ ...change, action: change.action.replace(/^(create|append|update)$/, "would-$1") })),
      nextCommand: `harness lesson-promote ${task.shortId} ${row.id} --apply`,
    };
  }

  const governanceContext = beginGovernanceSync(target, { operation: `lesson-promote ${task.id} ${row.id}` });
  try {
    fs.mkdirSync(path.dirname(detailPath), { recursive: true });
    if (!fs.existsSync(detailPath)) fs.writeFileSync(detailPath, renderLessonDetail({ lessonId, candidate: row, task }));
    fs.writeFileSync(candidatePath, markCandidatePromoted(candidateContent, row.id, lessonId));
    const commit = commitGovernanceSync(
      governanceContext,
      [
        detailRelative,
        task.paths.relativeLessonCandidatePath || toPosix(path.relative(target.projectRoot, candidatePath)),
      ],
      { message: `chore(harness): promote lesson ${row.id}` },
    );

    return { dryRun: false, taskId: task.id, candidateId: row.id, lessonId, detailDoc: `TARGET:${detailRelative}`, changes, governance: { commit } };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}

function lessonIdFromCandidate(candidateId: string): string {
  const match = String(candidateId || "").match(/^LC-(\d{4})(\d{2})(\d{2})-(\d+)$/i);
  if (!match) return `L-${slug(candidateId)}`;
  return `L-${match[1]}-${match[2]}-${match[3]}-${match[4].padStart(3, "0")}`;
}

function renderLessonDetail({ lessonId, candidate, task }: LessonDetailInput): string {
  return [
    `# ${lessonId} - ${candidate.title || "Lesson Candidate"}`,
    "",
    "## Source",
    "",
    `- Task: ${task.id}`,
    `- Candidate: ${candidate.id}`,
    `- Promotion target: ${candidate.promotionTarget || "not specified"}`,
    "",
    "## Summary",
    "",
    candidate.title || "Promoted lesson candidate.",
    "",
    "## Why It Matters",
    "",
    candidate.reviewDecision || "Human review marked this candidate for governance promotion.",
    "",
    "## Status",
    "",
    "- State: pending governance integration",
    "",
  ].join("\n");
}

function markCandidatePromoted(content: string, candidateId: string, lessonId: string): string {
  const lines = String(content || "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^\|\s*ID\s*\|/.test(line));
  if (headerIndex >= 0) {
    const header = splitSimpleRow(lines[headerIndex]);
    const statusIndex = header.findIndex((cell) => /^(Row Status|行状态|Status|状态)$/i.test(cell));
    const decisionIndex = header.findIndex((cell) => /^(Review Decision|审查决定)$/i.test(cell));
    for (let index = headerIndex + 2; index < lines.length && lines[index].trim().startsWith("|"); index += 1) {
      const cells = splitSimpleRow(lines[index]);
      if ((cells[0] || "").toLowerCase() !== candidateId.toLowerCase()) continue;
      if (statusIndex >= 0) cells[statusIndex] = "promoted";
      if (decisionIndex >= 0 && !cells[decisionIndex].includes(lessonId)) cells[decisionIndex] = `${cells[decisionIndex]} promoted:${lessonId}`.trim();
      lines[index] = `| ${cells.map(escapeCell).join(" | ")} |`;
    }
  }
  return `${lines.join("\n")
    .replace("| Task-level status | needs-promotion |", "| Task-level status | promoted |")
    .replace("| Promotion state | not-promoted |", "| Promotion state | promoted |")
    .replace("| Closeout token | pending |", `| Closeout token | checked-created:${lessonId} |`)
    .replace(/\| Closeout token \| queued-promotion:[^|]+ \|/, `| Closeout token | checked-created:${lessonId} |`)
    .trimEnd()}\n`;
}

function splitSimpleRow(line: string): string[] {
  return String(line || "").replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
}

function escapeCell(value: unknown): string {
  return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}
