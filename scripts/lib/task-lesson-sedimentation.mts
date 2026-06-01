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
import { readCapabilityRegistry } from "./capability-registry.mjs";
import { createTask, resolveTaskDirectory } from "./task-lifecycle.mjs";
import { readPresetPackage, buildPresetAudit, renderPresetTemplate } from "./preset-registry.mjs";
import { firstColumn, updateMarkdownTableRow } from "./markdown-utils.mjs";
import { listTaskPlanPaths, taskIdForDirectory } from "./task-scanner.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  governanceRelativePaths,
  releaseGovernanceSync,
} from "./governance-sync.mjs";
import type { LifecycleChange, LifecycleTarget } from "./types/task-lifecycle.js";
import type { PresetPackage } from "./types/preset.js";

const presetId = "lesson-sedimentation";

type LessonTarget = ReturnType<typeof normalizeTarget> & LifecycleTarget;
type LessonCandidateRow = ReturnType<typeof parseLessonCandidateStatus>["rows"][number];
type LessonSelection = {
  taskId: string;
  candidateId: string;
};
type LessonEntry = {
  sourceTaskDir: string;
  sourceTaskId: string;
  sourceShortId: string;
  candidatePath: string;
  candidate: LessonCandidateRow;
};
type LessonTaskDirectoryIndex = {
  byRef: Map<string, string>;
  directories: string[];
};
type LessonSedimentationErrorOptions = {
  code?: string;
  status?: number;
  details?: Record<string, unknown>;
  recovery?: string[];
};
type CreatedTaskResult = {
  task: {
    id: string;
    path: string;
  };
  changes: LifecycleChange[];
  governance?: Record<string, unknown> | null;
};
type GovernanceRelativeChange = Parameters<typeof governanceRelativePaths>[0][number];
type PresetAudit = ReturnType<typeof buildPresetAudit>;
type DetailArtifact = {
  path: string;
  prefixedPath: string;
};
type LessonPromptValues = {
  target: LessonTarget;
  sourceTaskDir: string;
  sourceTaskId: string;
  sourceShortId: string;
  candidate: LessonCandidateRow;
  followUpTaskId: string;
};

export class LessonSedimentationError extends Error {
  code: string;
  status: number;
  details: Record<string, unknown>;
  recovery: string[];

  constructor(message: string, { code = "lesson-sedimentation-failed", status = 400, details = {}, recovery = [] }: LessonSedimentationErrorOptions = {}) {
    super(message);
    this.name = "LessonSedimentationError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.recovery = recovery;
  }
}

export function createLessonSedimentationTask(
  targetInput: string,
  taskRef: string,
  candidateId: string,
  { dryRun = false, title = "", deferCommit = false, allowDirtyRelativePaths = [] }: {
    dryRun?: boolean;
    title?: string;
    deferCommit?: boolean;
    allowDirtyRelativePaths?: string[];
  } = {},
) {
  const target = normalizeTarget(targetInput) as LessonTarget;
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
  const locale = readCapabilityRegistry(target).locale;
  let taskResult: CreatedTaskResult;
  try {
    taskResult = createTask(target.projectRoot, slug, {
      title: taskTitle,
      locale,
      budget: "standard",
      longRunning: true,
      dryRun,
      deferCommit,
      allowDirtyRelativePaths,
    });
  } catch (error: unknown) {
    if (/Task already exists:/i.test(errorMessage(error))) {
      const existingTask = `TASKS/${localDate()}-${slug}`;
      throw new LessonSedimentationError(errorMessage(error), {
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
    writeScopes: [`${toPosix(path.relative(target.projectRoot, target.harness.tasksRoot))}/**`],
  });
  const prompt = renderLessonSedimentationPrompt(preset, {
    target,
    sourceTaskDir,
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
  const changes: Array<LifecycleChange | GovernanceRelativeChange> = [...taskResult.changes];

  if (!dryRun) {
    const deferredDirtyPaths = deferCommit
      ? [
        ...governanceRelativePaths(asGovernanceChanges(taskResult.changes)),
        toPosix(path.relative(target.projectRoot, candidatePath)),
        ...(allowDirtyRelativePaths || []),
      ]
      : [];
    const governanceContext = beginGovernanceSync(target, {
      operation: `lesson-sediment ${sourceTaskId} ${candidate.id}`,
      allowDirtyWorktree: deferCommit,
      allowedRelativePaths: deferredDirtyPaths,
      allowDirtyWriteScope: deferCommit,
    });
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
      const commit = deferCommit
        ? { committed: false, reason: "deferred", allowedPaths: governanceRelativePaths(asGovernanceChanges(changes)) }
        : commitGovernanceSync(governanceContext, governanceRelativePaths(asGovernanceChanges(changes)), {
          message: `chore(harness): record lesson sedimentation ${candidate.id}`,
        });
      taskResult.governance = {
        ...(taskResult.governance || {}),
        lessonSedimentationCommit: commit,
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

export function createAggregateLessonSedimentationTask(targetInput: string, selections: unknown, { dryRun = false, title = "" }: { dryRun?: boolean; title?: string } = {}) {
  const target = normalizeTarget(targetInput) as LessonTarget;
  const normalizedSelections = normalizeAggregateSelections(selections);
  if (normalizedSelections.length === 0) {
    throw new LessonSedimentationError("No lesson candidates selected", {
      code: "lesson-aggregate-empty",
      status: 400,
      recovery: ["Select at least one actionable lesson candidate."],
    });
  }
  const taskDirectoryIndex = buildLessonTaskDirectoryIndex(target);
  const entries = normalizedSelections.map((selection) => resolveLessonCandidate(target, selection.taskId, selection.candidateId, taskDirectoryIndex));
  const sourceShort = entries.length === 1
    ? entries[0].sourceShortId.replace(/^\d{4}-\d{2}-\d{2}-/, "")
    : commonSourceShort(entries) || "selected-lessons";
  const slug = normalizeTaskId(`lesson-${sourceShort}-aggregate-${Date.now().toString(36).slice(-6)}`);
  const taskTitle = title || `Aggregate lesson sedimentation for ${entries.length} candidates`;
  const locale = readCapabilityRegistry(target).locale;
  const preset = readPresetPackage(presetId);
  const taskResult = createTask(target.projectRoot, slug, {
    title: taskTitle,
    locale,
    budget: "standard",
    longRunning: true,
    dryRun,
    deferCommit: true,
  });
  const followUpTaskId = taskResult.task.id;
  const followUpDir = path.join(target.projectRoot, taskResult.task.path.replace(/^TARGET:/, ""));
  const audit = buildPresetAudit(preset, {
    taskId: followUpTaskId,
    targetRoot: target.projectRoot,
    entrypoint: "newTask",
    writeScopes: [`${toPosix(path.relative(target.projectRoot, target.harness.tasksRoot))}/**`],
  });
  const prompt = renderAggregateLessonSedimentationPrompt({ target, entries, followUpTaskId });
  const contextPacket = renderAggregateContextPacket({ target, entries, followUpTaskId, audit });
  const changes: Array<LifecycleChange | GovernanceRelativeChange> = [...taskResult.changes];
  if (!dryRun) {
    const candidatePaths = [...new Set(entries.map((entry) => toPosix(path.relative(target.projectRoot, entry.candidatePath))))];
    const governanceContext = beginGovernanceSync(target, {
      operation: `lesson-sediment-aggregate ${followUpTaskId}`,
      allowDirtyWorktree: true,
      allowedRelativePaths: [...governanceRelativePaths(asGovernanceChanges(taskResult.changes)), ...candidatePaths],
      allowDirtyWriteScope: true,
    });
    try {
      appendToAggregateFollowUpTask({ followUpDir, entries, prompt, contextPacket, audit });
      for (const entry of entries) updateSourceFollowUpTask(entry.candidatePath, entry.candidate.id, followUpTaskId);
      changes.push(
        {
          destination: toPosix(path.relative(target.projectRoot, path.join(followUpDir, "task_plan.md"))),
          source: "lesson-sedimentation-aggregate",
          action: "append-aggregate-context",
        },
        {
          destination: toPosix(path.relative(target.projectRoot, path.join(followUpDir, "progress.md"))),
          source: "lesson-sedimentation-aggregate",
          action: "append-aggregate-progress",
        },
        {
          destination: toPosix(path.relative(target.projectRoot, path.join(followUpDir, "artifacts/lesson-sedimentation-prompt.md"))),
          source: "lesson-sedimentation-aggregate",
          action: "create-aggregate-prompt-artifact",
        },
        {
          destination: toPosix(path.relative(target.projectRoot, path.join(followUpDir, "artifacts/preset-audit.json"))),
          source: "lesson-sedimentation-aggregate",
          action: "create-aggregate-preset-audit",
        },
        ...candidatePaths.map((destination) => ({
          destination,
          source: lessonCandidatesFile,
          action: "update-follow-up-task",
        })),
      );
      taskResult.governance = {
        ...(taskResult.governance || {}),
        commit: commitGovernanceSync(governanceContext, governanceRelativePaths(asGovernanceChanges(changes)), {
          message: `chore(harness): record aggregate lesson sedimentation ${followUpTaskId}`,
        }),
      };
    } finally {
      releaseGovernanceSync(governanceContext);
    }
  }
  return {
    dryRun,
    event: "lesson-sedimentation-aggregate",
    preset: presetId,
    candidates: entries.map((entry) => ({
      taskId: entry.sourceTaskId,
      candidateId: entry.candidate.id,
      title: entry.candidate.title,
      detailArtifact: resolveDetailArtifact(target, entry.sourceTaskDir, entry.candidate).prefixedPath || "",
    })),
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

function normalizeAggregateSelections(selections: unknown): LessonSelection[] {
  const seen = new Set<string>();
  const normalized: LessonSelection[] = [];
  for (const selection of Array.isArray(selections) ? selections : []) {
    const record = asRecord(selection);
    const taskId = String(record.taskId || "").trim();
    const candidateId = String(record.candidateId || "").trim();
    if (!taskId || !candidateId) continue;
    const key = `${taskId}\n${candidateId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ taskId, candidateId });
  }
  return normalized;
}

function resolveLessonCandidate(target: LessonTarget, taskRef: string, candidateId: string, taskDirectoryIndex?: LessonTaskDirectoryIndex): LessonEntry {
  const sourceTaskDir = taskDirectoryIndex
    ? resolveLessonTaskDirectory(target, taskDirectoryIndex, taskRef)
    : resolveTaskDirectory(target, taskRef);
  const sourceTaskId = taskIdForDirectory(target, sourceTaskDir);
  const sourceShortId = path.basename(sourceTaskDir);
  const candidatePath = path.join(sourceTaskDir, lessonCandidatesFile);
  const candidateStatus = parseLessonCandidateStatus(readFileSafe(candidatePath));
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
  return { sourceTaskDir, sourceTaskId, sourceShortId, candidatePath, candidate };
}

function buildLessonTaskDirectoryIndex(target: LessonTarget): LessonTaskDirectoryIndex {
  const byRef = new Map<string, string>();
  const directories = listTaskPlanPaths(target).map((taskPlanPath) => path.dirname(taskPlanPath));
  for (const taskDir of directories) {
    const sourceTaskId = taskIdForDirectory(target, taskDir);
    const sourceShortId = path.basename(taskDir);
    for (const ref of lessonTaskRefs(sourceTaskId, sourceShortId, taskDir, target.projectRoot)) {
      const normalized = normalizeLessonTaskRef(ref);
      if (!normalized || byRef.has(normalized)) continue;
      byRef.set(normalized, taskDir);
    }
  }
  return { byRef, directories };
}

function resolveLessonTaskDirectory(target: LessonTarget, index: LessonTaskDirectoryIndex, taskRef: string): string {
  const absolute = absoluteLessonTaskRef(target, taskRef);
  if (absolute && fs.existsSync(path.join(absolute, "task_plan.md"))) return absolute;
  const raw = normalizeLessonTaskRef(taskRef);
  const direct = raw ? index.byRef.get(raw) : undefined;
  if (direct) return direct;
  const normalized = normalizeTaskId(raw);
  const normalizedMatch = normalized ? index.byRef.get(normalized) : undefined;
  if (normalizedMatch) return normalizedMatch;
  const datedMatches = index.directories.filter((taskDir) => {
    const dirName = path.basename(taskDir);
    return /^\d{4}-\d{2}-\d{2}-/.test(dirName) && dirName.replace(/^\d{4}-\d{2}-\d{2}-/, "") === normalized;
  });
  if (datedMatches.length === 1) return datedMatches[0];
  if (datedMatches.length > 1) {
    const options = datedMatches.map((taskDir) => `- ${taskIdForDirectory(target, taskDir)}`).join("\n");
    throw new Error(`Ambiguous task reference: ${taskRef}\n${options}`);
  }
  throw new Error(`Task not found: ${taskRef}`);
}

function lessonTaskRefs(sourceTaskId: string, sourceShortId: string, taskDir: string, projectRoot: string): string[] {
  const relative = toPosix(path.relative(projectRoot, taskDir));
  const undatedShortId = sourceShortId.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const refs = [
    sourceTaskId,
    sourceShortId,
    normalizeTaskId(sourceShortId),
    undatedShortId,
    normalizeTaskId(undatedShortId),
    relative,
    `TARGET:${relative}`,
  ];
  const parts = sourceTaskId.split("/");
  if (parts.length > 1) refs.push(parts.at(-1) || "");
  return refs.filter(Boolean);
}

function absoluteLessonTaskRef(target: LessonTarget, taskRef: string): string {
  const withoutTarget = String(taskRef || "").replace(/^TARGET:/, "");
  if (!withoutTarget) return "";
  return path.isAbsolute(withoutTarget) ? withoutTarget : path.join(target.projectRoot, withoutTarget.replace(/^\/+/, ""));
}

function normalizeLessonTaskRef(taskRef: string): string {
  return String(taskRef || "")
    .replace(/^TARGET:/, "")
    .replace(/^coding-agent-harness\/planning\//, "")
    .replace(/^planning\//, "")
    .replace(/^docs\/09-PLANNING\//, "")
    .replace(/^\/+/, "");
}

function commonSourceShort(entries: LessonEntry[]): string {
  const unique = [...new Set(entries.map((entry) => entry.sourceShortId.replace(/^\d{4}-\d{2}-\d{2}-/, "")))];
  return unique.length === 1 ? unique[0] : "";
}

function renderLessonSedimentationPrompt(preset: PresetPackage, values: LessonPromptValues): string {
  const detailArtifact = resolveDetailArtifact(values.target, values.sourceTaskDir, values.candidate);
  const prompt = renderPresetTemplate(preset, preset.entrypoints.newTask?.templates?.prompt || "", {
    sourceTaskId: values.sourceTaskId,
    sourceShortId: values.sourceShortId,
    candidateId: values.candidate.id,
    candidateTitle: values.candidate.title,
    candidateScope: values.candidate.scope,
    candidateModuleKey: values.candidate.moduleKey || "n/a",
    detailArtifact: detailArtifact.prefixedPath || "not provided",
    boundaryReason: values.candidate.boundaryReason,
    whyItMightMatter: values.candidate.whyItMightMatter,
    promotionTarget: values.candidate.promotionTarget,
    conflictCheck: values.candidate.conflictCheck,
    requiredStandardUpdate: values.candidate.requiredStandardUpdate,
    followUpTaskId: values.followUpTaskId,
  });
  return prompt.trim();
}

function renderContextPacket({ target, sourceTaskDir, sourceTaskId, candidate, followUpTaskId, audit }: {
  target: LessonTarget;
  sourceTaskDir: string;
  sourceTaskId: string;
  candidate: LessonCandidateRow;
  followUpTaskId: string;
  audit: PresetAudit;
}): string {
  const sourceLessonPath = `TARGET:${toPosix(path.relative(target.projectRoot, path.join(sourceTaskDir, lessonCandidatesFile)))}`;
  const detailArtifact = resolveDetailArtifact(target, sourceTaskDir, candidate);
  const sourceReview = summarizeMarkdown(readFileSafe(path.join(sourceTaskDir, "review.md")));
  const sourceFindings = summarizeMarkdown(readFileSafe(path.join(sourceTaskDir, "findings.md")));
  const sourceProgress = summarizeMarkdown(readFileSafe(path.join(sourceTaskDir, "progress.md")));
  const sourceLessonDetail = summarizeMarkdown(detailArtifact.path ? readFileSafe(detailArtifact.path) : "");
  return [
    "## Lesson Sedimentation Context Packet",
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Preset | ${presetId} |`,
    `| Follow-up Task | ${followUpTaskId} |`,
    `| Source Task | ${sourceTaskId} |`,
    `| Source Lesson Candidates | ${sourceLessonPath} |`,
    `| Source Lesson Detail | ${detailArtifact.prefixedPath || "not provided"} |`,
    `| Candidate ID | ${candidate.id} |`,
    `| Candidate Title | ${markdownCell(candidate.title)} |`,
    `| Original Candidate Row | ${markdownCell(candidate.originalRow || "")} |`,
    `| Scope | ${markdownCell(candidate.scope || "unspecified")} |`,
    `| Module Key | ${markdownCell(candidate.moduleKey || "n/a")} |`,
    `| Detail Summary | ${markdownCell(sourceLessonDetail || "not recorded")} |`,
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

function renderAggregateLessonSedimentationPrompt({ target, entries, followUpTaskId }: { target: LessonTarget; entries: LessonEntry[]; followUpTaskId: string }): string {
  const candidateBlocks = entries.map((entry, index) => {
    const detailArtifact = resolveDetailArtifact(target, entry.sourceTaskDir, entry.candidate);
    return [
      `### ${index + 1}. ${entry.candidate.id} - ${entry.candidate.title || "Untitled lesson candidate"}`,
      "",
      `- Source task: ${entry.sourceTaskId}`,
      `- Candidate status: ${entry.candidate.status}`,
      `- Scope: ${entry.candidate.scope || "unspecified"}`,
      `- Module key: ${entry.candidate.moduleKey || "n/a"}`,
      `- Detail artifact: ${detailArtifact.prefixedPath || "not provided"}`,
      `- Boundary reason: ${entry.candidate.boundaryReason || "unspecified"}`,
      `- Why it might matter: ${entry.candidate.whyItMightMatter || "unspecified"}`,
      `- Promotion target: ${entry.candidate.promotionTarget || "unspecified"}`,
      `- Conflict check: ${entry.candidate.conflictCheck || "pending"}`,
      `- Required standard update: ${entry.candidate.requiredStandardUpdate || "pending"}`,
      "",
    ].join("\n");
  }).join("\n");
  return [
    "You are executing an aggregate lesson sedimentation follow-up task.",
    "",
    `Follow-up task: ${followUpTaskId}`,
    `Candidate count: ${entries.length}`,
    "",
    "Instructions:",
    "1. Read each source task, review, findings, progress, lesson_candidates.md, and task-local detail artifact.",
    "2. Preserve candidate boundaries; do not merge unrelated lessons into one vague generalization.",
    "3. Promote the smallest coherent set of reusable lessons, grouping only when candidates describe the same rule.",
    "4. Check conflicts against existing lessons and standards before proposing changes.",
    "5. Propose the smallest diff first.",
    "6. Do not write a shared Lessons table; use promoted detail docs or focused follow-up edits.",
    "",
    "Selected candidates:",
    "",
    candidateBlocks.trimEnd(),
    "",
  ].join("\n");
}

function renderAggregateContextPacket({ target, entries, followUpTaskId, audit }: { target: LessonTarget; entries: LessonEntry[]; followUpTaskId: string; audit: PresetAudit }): string {
  const rows = entries.map((entry) => {
    const detailArtifact = resolveDetailArtifact(target, entry.sourceTaskDir, entry.candidate);
    const sourceLessonPath = `TARGET:${toPosix(path.relative(target.projectRoot, path.join(entry.sourceTaskDir, lessonCandidatesFile)))}`;
    return [
      entry.candidate.id,
      entry.sourceTaskId,
      entry.candidate.title || "",
      entry.candidate.scope || "unspecified",
      entry.candidate.moduleKey || "n/a",
      detailArtifact.prefixedPath || "not provided",
      sourceLessonPath,
      entry.candidate.promotionTarget || "unspecified",
    ];
  });
  return [
    "## Aggregate Lesson Sedimentation Context Packet",
    "",
    "| Candidate | Source Task | Title | Scope | Module | Detail Artifact | Candidate Table | Promotion Target |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((row) => `| ${row.map(markdownCell).join(" | ")} |`),
    "",
    "| Field | Value |",
    "| --- | --- |",
    `| Preset | ${presetId} |`,
    `| Follow-up Task | ${followUpTaskId} |`,
    `| Candidate Count | ${entries.length} |`,
    `| Preset Manifest | ${audit.manifestPath} |`,
    "",
  ].join("\n");
}

function resolveDetailArtifact(target: LessonTarget, sourceTaskDir: string, candidate: LessonCandidateRow): DetailArtifact {
  const raw = String(candidate.detailArtifact || "").trim();
  if (!raw || /^(?:n\/a|none|pending)$/i.test(raw)) return { path: "", prefixedPath: "" };
  const absolute = raw.startsWith("TARGET:")
    ? path.resolve(target.projectRoot, raw.replace(/^TARGET:/, "").replace(/^\/+/, ""))
    : path.resolve(sourceTaskDir, raw.replace(/^\.?\//, ""));
  if (!absolute.startsWith(path.resolve(sourceTaskDir) + path.sep)) return { path: "", prefixedPath: "" };
  return {
    path: absolute,
    prefixedPath: `TARGET:${toPosix(path.relative(target.projectRoot, absolute))}`,
  };
}

function appendToFollowUpTask({ followUpDir, sourceTaskId, candidate, prompt, contextPacket, audit }: {
  followUpDir: string;
  sourceTaskId: string;
  candidate: LessonCandidateRow;
  prompt: string;
  contextPacket: string;
  audit: PresetAudit;
}): void {
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

function appendToAggregateFollowUpTask({ followUpDir, entries, prompt, contextPacket, audit }: {
  followUpDir: string;
  entries: LessonEntry[];
  prompt: string;
  contextPacket: string;
  audit: PresetAudit;
}): void {
  const taskPlanPath = path.join(followUpDir, "task_plan.md");
  const progressPath = path.join(followUpDir, "progress.md");
  const artifactsDir = path.join(followUpDir, "artifacts");
  fs.mkdirSync(artifactsDir, { recursive: true });
  fs.writeFileSync(path.join(artifactsDir, "lesson-sedimentation-prompt.md"), `${prompt}\n`);
  fs.writeFileSync(path.join(artifactsDir, "preset-audit.json"), `${JSON.stringify(audit, null, 2)}\n`);

  const candidateList = entries.map((entry) => `- ${entry.candidate.id}: ${entry.sourceTaskId} - ${entry.candidate.title || "Untitled lesson candidate"}`).join("\n");
  fs.appendFileSync(taskPlanPath, [
    "",
    "## Aggregate Lesson Sedimentation Preset",
    "",
    "Task Preset: lesson-sedimentation",
    "Preset Version: 1",
    "Task Kind: lesson-sedimentation",
    `Candidate Count: ${entries.length}`,
    "",
    "### Selected Candidates",
    "",
    candidateList,
    "",
    contextPacket.trimEnd(),
    "",
    "## Execution Prompt",
    "",
    "The copyable aggregate prompt for a new agent session is stored in `artifacts/lesson-sedimentation-prompt.md`.",
    "",
  ].join("\n"));
  fs.appendFileSync(progressPath, [
    "",
    "### Aggregate lesson sedimentation task created",
    "",
    `- Candidate count: ${entries.length}`,
    `- Source tasks: ${[...new Set(entries.map((entry) => entry.sourceTaskId))].join(", ")}`,
    "- Next: use the aggregate execution prompt, preserve candidate boundaries, and propose focused reusable lesson diffs.",
    "",
  ].join("\n"));
}

function updateSourceFollowUpTask(candidatePath: string, candidateId: string, followUpTaskId: string): void {
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

function markdownCell(value: unknown): string {
  return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "\\|").trim();
}

function summarizeMarkdown(content: unknown): string {
  const lines = String(content || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .filter((line) => line && !/^\|?\s*-{3,}/.test(line));
  return lines.slice(0, 4).join(" / ") || "not recorded";
}

function asGovernanceChanges(changes: Array<LifecycleChange | GovernanceRelativeChange>): GovernanceRelativeChange[] {
  return changes.map((change) => ({ surface: "task", ...change }));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
