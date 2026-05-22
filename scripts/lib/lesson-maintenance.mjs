import fs from "node:fs";
import path from "node:path";
import {
  datePrefix,
  lessonCandidatesFile,
  normalizeTarget,
  readFileSafe,
  slug,
  toPosix,
} from "./core-shared.mjs";
import {
  collectTasks,
  parseLessonCandidateStatus,
} from "./task-scanner.mjs";

export function promoteLessonCandidate(targetInput, taskId, candidateId, { dryRun = false } = {}) {
  const target = normalizeTarget(targetInput);
  const normalizedRef = slug(taskId);
  const matchesBareSlug = (item) => {
    if (!datePrefix.test(normalizedRef)) {
      const shortBase = datePrefix.test(item.shortId) ? item.shortId.replace(datePrefix, "") : item.shortId;
      if (shortBase === normalizedRef) return true;
    }
    return false;
  };
  const candidates = collectTasks(target).filter((item) => item.id === taskId || item.shortId === taskId || item.id.endsWith(`/${taskId}`) || matchesBareSlug(item));
  if (candidates.length > 1) {
    const options = candidates.map((item) => `- ${item.id}`).join("\n");
    throw new Error(`Ambiguous task reference: ${taskId}\n${options}`);
  }
  const task = candidates[0];
  if (!task) throw new Error(`Task not found: ${taskId}`);
  if (!candidateId) throw new Error("Missing lesson candidate id");
  const taskDir = path.join(target.projectRoot, task.path.replace(/^TARGET:/, ""));
  const candidatePath = path.join(taskDir, lessonCandidatesFile);
  const candidateContent = readFileSafe(candidatePath);
  const parsed = parseLessonCandidateStatus(candidateContent);
  const row = parsed.rows.find((item) => item.id.toLowerCase() === candidateId.toLowerCase());
  if (!row) throw new Error(`Lesson candidate not found: ${candidateId}`);
  if (!["needs-promotion", "promoted"].includes(row.status)) {
    throw new Error(`Lesson candidate must be needs-promotion before promotion; current status is ${row.status}`);
  }

  const lessonId = lessonIdFromCandidate(row.id);
  const title = row.title || lessonId;
  const detailRelative = `docs/01-GOVERNANCE/lessons/${lessonId}-${slug(title)}.md`;
  const detailPath = path.join(target.projectRoot, detailRelative);
  const ssotPath = path.join(target.docsRoot, "01-GOVERNANCE/Lessons-SSoT.md");
  const ssotContent = readFileSafe(ssotPath);
  if (!ssotContent.trim()) throw new Error("Lessons SSoT not found");

  const changes = [];
  if (!fs.existsSync(detailPath)) changes.push({ action: dryRun ? "would-create" : "create", path: `TARGET:${detailRelative}` });
  if (!ssotContent.includes(lessonId)) changes.push({ action: dryRun ? "would-append" : "append", path: "TARGET:docs/01-GOVERNANCE/Lessons-SSoT.md" });
  if (row.status !== "promoted" || parsed.status !== "promoted") changes.push({ action: dryRun ? "would-update" : "update", path: task.lessonCandidatePath || `TARGET:${toPosix(path.relative(target.projectRoot, candidatePath))}` });

  if (dryRun) return { dryRun: true, taskId: task.id, candidateId: row.id, lessonId, detailDoc: `TARGET:${detailRelative}`, changes };

  fs.mkdirSync(path.dirname(detailPath), { recursive: true });
  if (!fs.existsSync(detailPath)) fs.writeFileSync(detailPath, renderLessonDetail({ lessonId, candidate: row, task, detailRelative }));
  if (!ssotContent.includes(lessonId)) fs.writeFileSync(ssotPath, appendLessonSsotRow(ssotContent, { lessonId, candidate: row, task, detailRelative }));
  fs.writeFileSync(candidatePath, markCandidatePromoted(candidateContent, row.id, lessonId));

  return { dryRun: false, taskId: task.id, candidateId: row.id, lessonId, detailDoc: `TARGET:${detailRelative}`, changes };
}

function lessonIdFromCandidate(candidateId) {
  const match = String(candidateId || "").match(/^LC-(\d{4})(\d{2})(\d{2})-(\d+)$/i);
  if (!match) return `L-${slug(candidateId)}`;
  return `L-${match[1]}-${match[2]}-${match[3]}-${match[4].padStart(3, "0")}`;
}

function renderLessonDetail({ lessonId, candidate, task }) {
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

function appendLessonSsotRow(content, { lessonId, candidate, task, detailRelative }) {
  const lines = String(content || "").split(/\r?\n/);
  const headerIndex = lines.findIndex((line) => /^\|\s*(ID|Lesson ID)\s*\|/.test(line));
  if (headerIndex < 0) throw new Error("Lessons SSoT active table not found");
  const columnCount = splitSimpleRow(lines[headerIndex]).length;
  const date = lessonId.match(/^L-(\d{4}-\d{2}-\d{2})-/)?.[1] || new Date().toISOString().slice(0, 10);
  const detail = `\`${detailRelative}\``;
  const source = `\`${task.path.replace(/^TARGET:/, "docs/").replace(/^docs\/docs\//, "docs/")}/task_plan.md\``;
  const row =
    columnCount === 10
      ? `| ${lessonId} | ${escapeCell(candidate.title || lessonId)} | ${source} | process-change | coordinator | candidate | ${escapeCell(candidate.promotionTarget || "governance review")} | ${detail} | ${escapeCell(candidate.id)} | ${date} |`
      : `| ${lessonId} | ${date} | ${source} | process-change | ${escapeCell(candidate.promotionTarget || "governance review")} | ${escapeCell(candidate.title || lessonId)} | ${detail} | pending | ${escapeCell(candidate.id)} |`;
  let insertAt = headerIndex + 1;
  while (insertAt < lines.length && lines[insertAt].trim().startsWith("|")) insertAt += 1;
  lines.splice(insertAt, 0, row);
  return `${lines.join("\n").trimEnd()}\n`;
}

function markCandidatePromoted(content, candidateId, lessonId) {
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

function splitSimpleRow(line) {
  return String(line || "").replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((cell) => cell.trim());
}

function escapeCell(value) {
  return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}
