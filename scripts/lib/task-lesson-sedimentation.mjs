import fs from "node:fs";
import path from "node:path";
import {
  lessonCandidatesFile,
  normalizeTarget,
  readFileSafe,
  toPosix,
  normalizeTaskId,
  localDate,
} from "./core-shared.mjs";
import { parseLessonCandidateStatus } from "./task-lesson-candidates.mjs";
import { createTask, resolveTaskDirectory } from "./task-lifecycle.mjs";
import { readPresetPackage, buildPresetAudit, renderPresetTemplate } from "./preset-registry.mjs";
import { firstColumn, updateMarkdownTableRow } from "./markdown-utils.mjs";
import { taskIdForDirectory } from "./task-scanner.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  governanceRelativePaths,
  releaseGovernanceSync,
} from "./governance-sync.mjs";

const presetId = "lesson-sedimentation";

export class LessonSedimentationError extends Error {
  constructor(message, { code = "lesson-sedimentation-failed", status = 400, details = {}, recovery = [] } = {}) {
    super(message);
    this.name = "LessonSedimentationError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.recovery = recovery;
  }
}

export function createLessonSedimentationTask(targetInput, taskRef, candidateId, { dryRun = false, title = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const sourceTaskDir = resolveTaskDirectory(target, taskRef);
  const sourceTaskId = taskIdForDirectory(target, sourceTaskDir);
  const sourceShortId = path.basename(sourceTaskDir);
  const candidatePath = path.join(sourceTaskDir, lessonCandidatesFile);
  const content = readFileSafe(candidatePath);
  const candidateStatus = parseLessonCandidateStatus(content);
  const candidate = candidateStatus.rows.find((row) => row.id === candidateId);
  if (!candidate) {
    throw new LessonSedimentationError(`Lesson candidate not found: ${candidateId}`, {
      code: "lesson-candidate-not-found",
      status: 404,
      details: { candidateId, sourceTask: sourceTaskId },
      recovery: [
        "Open the source task lesson_candidates.md and confirm the candidate ID.",
        "Refresh the Dashboard snapshot if the candidate was just added.",
      ],
    });
  }
  if (!["needs-promotion", "ready-for-review"].includes(candidate.status)) {
    throw new LessonSedimentationError(`Lesson candidate must be ready-for-review or needs-promotion; current status is ${candidate.status}`, {
      code: "lesson-candidate-not-actionable",
      status: 409,
      details: { candidateId, status: candidate.status, sourceTask: sourceTaskId },
      recovery: [
        "Set the candidate status to ready-for-review or needs-promotion after human review.",
        "Use Copy lesson prompt if you only need the prompt without creating a task.",
      ],
    });
  }
  if (candidate.followUpTask && !/^pending$/i.test(candidate.followUpTask)) {
    throw new LessonSedimentationError(`Lesson candidate already has follow-up task: ${candidate.followUpTask}`, {
      code: "lesson-follow-up-exists",
      status: 409,
      details: { candidateId, followUpTask: candidate.followUpTask, sourceTask: sourceTaskId },
      recovery: [
        "Open the existing follow-up task instead of creating a duplicate.",
        "If the existing task is wrong, edit the Follow-up Task cell back to pending after review.",
      ],
    });
  }

  const preset = readPresetPackage(presetId);
  const slug = normalizeTaskId(`lesson-${sourceShortId.replace(/^\d{4}-\d{2}-\d{2}-/, "")}-${candidate.id}`);
  const taskTitle = title || `Lesson sedimentation for ${candidate.id}`;
  let taskResult;
  try {
    taskResult = createTask(target.projectRoot, slug, {
      title: taskTitle,
      locale: "en-US",
      budget: "standard",
      longRunning: true,
      dryRun,
    });
  } catch (error) {
    if (/Task already exists:/i.test(error.message)) {
      const existingTask = `TASKS/${localDate()}-${slug}`;
      throw new LessonSedimentationError(error.message, {
        code: "lesson-follow-up-directory-exists",
        status: 409,
        details: { candidateId, existingTask, sourceTask: sourceTaskId },
        recovery: [
          "Open the existing task directory and confirm whether it is the intended follow-up.",
          "If it is valid, update the source candidate Follow-up Task cell to that task id.",
        ],
      });
    }
    throw error;
  }
  const followUpTaskId = taskResult.task.id;
  const followUpDir = path.join(target.projectRoot, taskResult.task.path.replace(/^TARGET:/, ""));
  const audit = buildPresetAudit(preset, {
    taskId: followUpTaskId,
    targetRoot: target.projectRoot,
    entrypoint: "newTask",
    writeScopes: ["docs/09-PLANNING/TASKS/**"],
  });
  const prompt = renderLessonSedimentationPrompt(preset, {
    sourceTaskId,
    sourceShortId,
    candidate,
    followUpTaskId,
  });
  const contextPacket = renderContextPacket({
    target,
    sourceTaskDir,
    sourceTaskId,
    candidate,
    followUpTaskId,
    audit,
  });
  const changes = [...taskResult.changes];

  if (!dryRun) {
    const governanceContext = beginGovernanceSync(target, { operation: `lesson-sediment ${sourceTaskId} ${candidate.id}` });
    try {
      appendToFollowUpTask({ followUpDir, sourceTaskId, candidate, prompt, contextPacket, audit });
      updateSourceFollowUpTask(candidatePath, candidate.id, followUpTaskId);
      changes.push(
        {
          destination: toPosix(path.relative(target.projectRoot, path.join(followUpDir, "task_plan.md"))),
          source: "lesson-sedimentation",
          action: "append-preset-context",
        },
        {
          destination: toPosix(path.relative(target.projectRoot, path.join(followUpDir, "progress.md"))),
          source: "lesson-sedimentation",
          action: "append-preset-progress",
        },
        {
          destination: toPosix(path.relative(target.projectRoot, path.join(followUpDir, "artifacts/lesson-sedimentation-prompt.md"))),
          source: "lesson-sedimentation",
          action: "create-prompt-artifact",
        },
        {
          destination: toPosix(path.relative(target.projectRoot, path.join(followUpDir, "artifacts/preset-audit.json"))),
          source: "lesson-sedimentation",
          action: "create-preset-audit",
        },
        {
          destination: toPosix(path.relative(target.projectRoot, candidatePath)),
          source: lessonCandidatesFile,
          action: "update-follow-up-task",
        },
      );
      taskResult.governance = {
        ...(taskResult.governance || {}),
        lessonSedimentationCommit: commitGovernanceSync(governanceContext, governanceRelativePaths(changes), {
          message: `chore(harness): record lesson sedimentation ${candidate.id}`,
        }),
      };
    } finally {
      releaseGovernanceSync(governanceContext);
    }
  }

  return {
    dryRun,
    event: "lesson-sedimentation-task",
    preset: presetId,
    sourceTask: sourceTaskId,
    candidate,
    followUpTask: {
      id: followUpTaskId,
      path: taskResult.task.path,
      title: taskTitle,
    },
    prompt,
    changes,
    governance: taskResult.governance || null,
  };
}

function renderLessonSedimentationPrompt(preset, values) {
  const prompt = renderPresetTemplate(preset, preset.entrypoints.newTask?.templates?.prompt, {
    sourceTaskId: values.sourceTaskId,
    sourceShortId: values.sourceShortId,
    candidateId: values.candidate.id,
    candidateTitle: values.candidate.title,
    candidateScope: values.candidate.scope,
    boundaryReason: values.candidate.boundaryReason,
    whyItMightMatter: values.candidate.whyItMightMatter,
    promotionTarget: values.candidate.promotionTarget,
    conflictCheck: values.candidate.conflictCheck,
    requiredStandardUpdate: values.candidate.requiredStandardUpdate,
    followUpTaskId: values.followUpTaskId,
  });
  return prompt.trim();
}

function renderContextPacket({ target, sourceTaskDir, sourceTaskId, candidate, followUpTaskId, audit }) {
  const sourceLessonPath = `TARGET:${toPosix(path.relative(target.projectRoot, path.join(sourceTaskDir, lessonCandidatesFile)))}`;
  const sourceReview = summarizeMarkdown(readFileSafe(path.join(sourceTaskDir, "review.md")));
  const sourceFindings = summarizeMarkdown(readFileSafe(path.join(sourceTaskDir, "findings.md")));
  const sourceProgress = summarizeMarkdown(readFileSafe(path.join(sourceTaskDir, "progress.md")));
  return [
    "## Lesson Sedimentation Context Packet",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Preset | ${presetId} |`,
    `| Follow-up Task | ${followUpTaskId} |`,
    `| Source Task | ${sourceTaskId} |`,
    `| Source Lesson Candidates | ${sourceLessonPath} |`,
    `| Candidate ID | ${candidate.id} |`,
    `| Candidate Title | ${markdownCell(candidate.title)} |`,
    `| Original Candidate Row | ${markdownCell(candidate.originalRow || "")} |`,
    `| Scope | ${markdownCell(candidate.scope || "unspecified")} |`,
    `| Boundary Reason | ${markdownCell(candidate.boundaryReason || "unspecified")} |`,
    `| Why It Might Matter | ${markdownCell(candidate.whyItMightMatter || "unspecified")} |`,
    `| Promotion Target | ${markdownCell(candidate.promotionTarget || "unspecified")} |`,
    `| Conflict Check | ${markdownCell(candidate.conflictCheck || "pending")} |`,
    `| Required Standard Update | ${markdownCell(candidate.requiredStandardUpdate || "pending")} |`,
    `| Review Summary | ${markdownCell(sourceReview)} |`,
    `| Findings Summary | ${markdownCell(sourceFindings)} |`,
    `| Evidence Summary | ${markdownCell(sourceProgress)} |`,
    `| Preset Manifest | ${audit.manifestPath} |`,
    "",
  ].join("\n");
}

function appendToFollowUpTask({ followUpDir, sourceTaskId, candidate, prompt, contextPacket, audit }) {
  const taskPlanPath = path.join(followUpDir, "task_plan.md");
  const progressPath = path.join(followUpDir, "progress.md");
  const artifactsDir = path.join(followUpDir, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, "lesson-sedimentation-prompt.md"), `${prompt}\n`);
  fs.writeFileSync(path.join(artifactsDir, "preset-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);

  const taskPlanAppend = [
    "",
    "## Lesson Sedimentation Preset",
    "",
    "Task Preset: lesson-sedimentation",
    "Preset Version: 1",
    "Task Kind: lesson-sedimentation",
    `Source Task: ${sourceTaskId}`,
    `Source Candidate: ${candidate.id}`,
    `Promotion Target: ${candidate.promotionTarget || "pending"}`,
    "",
    contextPacket.trimEnd(),
    "",
    "## Execution Prompt",
    "",
    "The copyable prompt for a new agent session is stored in `artifacts/lesson-sedimentation-prompt.md`.",
    "",
  ].join("\n");
  fs.appendFileSync(taskPlanPath, taskPlanAppend);
  fs.appendFileSync(
    progressPath,
    [
      "",
      "### Lesson sedimentation task created",
      "",
      `- Source task: ${sourceTaskId}`,
      `- Source candidate: ${candidate.id}`,
      "- Next: paste the execution prompt into a fresh agent session and require diff-first review before applying changes.",
      "",
    ].join("\n"),
  );
}

function updateSourceFollowUpTask(candidatePath, candidateId, followUpTaskId) {
  const content = readFileSafe(candidatePath);
  const update = updateMarkdownTableRow(content, /^ID$/i, (header, row) => {
    const idIndex = firstColumn(header, ["ID", "候选 ID"]);
    const followUpIndex = firstColumn(header, ["Follow-up Task", "Followup Task", "后续任务"]);
    if (idIndex < 0 || followUpIndex < 0 || row[idIndex] !== candidateId) return null;
    const next = [...row];
    next[followUpIndex] = followUpTaskId;
    return next;
  });
  if (!update.matched) throw new Error(`Could not update Follow-up Task column for ${candidateId}`);
  fs.writeFileSync(candidatePath, update.content.endsWith("\n") ? update.content : `${update.content}\n`);
}

function markdownCell(value) {
  return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}

function summarizeMarkdown(content) {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line && !/^\|?\s*-{3,}/.test(line));
  return lines.slice(0, 4).join(" / ") || "not recorded";
}
