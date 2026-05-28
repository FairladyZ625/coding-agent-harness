// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  visualMapFile,
  legacyVisualRoadmapFile,
  lessonCandidatesFile,
  allowedTaskStates,
  allowedTaskBudgets,
  allowedPhaseStates,
  allowedEvidenceStatus,
  normalizeTarget,
  normalizeLocale,
  toPosix,
  readFileSafe,
  readBundledTemplate,
  todayDate,
  localDate,
  datePrefix,
  normalizeTaskId,
  renderTaskTemplate,
} from "./core-shared.mjs";
import { readCapabilityRegistry } from "./capability-registry.mjs";
import { readPresetPackage } from "./preset-registry.mjs";
import {
  assertPresetWriteScope,
  buildPresetContext,
  evaluateTemplateValues,
  resolvePresetInputs,
  renderPresetResourceIndex,
  renderPresetTaskTemplate,
} from "./preset-engine.mjs";
import {
  collectTasks,
  listTaskPlanPaths,
  parseTaskBudget,
  taskIdForDirectory,
} from "./task-scanner.mjs";
import { getColumn, firstColumn, updateMarkdownTableRow } from "./markdown-utils.mjs";
import { validateLifecycleTransition, validateReviewEntryGate } from "./task-lifecycle/review-gates.mjs";
import { advanceLifecyclePhase, autoRecordNoLessonCandidateDecision } from "./task-lifecycle/phase-sync.mjs";
import { confirmTaskReview as confirmTaskReviewWithContext, finalizeDeferredTaskReviewConfirmation as finalizeDeferredTaskReviewConfirmationWithContext } from "./task-lifecycle/review-confirm.mjs";
import { appendProgressLog, markWalkthroughClosed } from "./task-lifecycle/text-utils.mjs";
import { buildScaffoldProvenance } from "./task-lifecycle/scaffold-provenance.mjs";
import { buildCreationTaskAudit } from "./task-audit-metadata.mjs";
import {
  renderAgentReviewSubmission,
  replaceAgentReviewSubmission,
} from "./task-lifecycle/review-submission.mjs";
import {
  appendLongRunningContractFile,
  moduleTemplateFiles,
  taskFilesForBudget,
} from "./task-lifecycle/template-files.mjs";
import {
  planCreateTaskChanges,
  refreshPresetCommandAudit,
  resolveImplicitCreateTarget,
} from "./task-lifecycle/create-task-helpers.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  governanceRelativePaths,
  releaseGovernanceSync,
  syncModuleStepGovernance,
  syncTaskGovernance,
} from "./governance-sync.mjs";
import { taskRefPath } from "./harness-paths.mjs";

function taskRoot(target, taskId, { moduleKey = "" } = {}) {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (moduleKey) {
    const moduleRoot = path.join(target.harness.modulesRoot, normalizeTaskId(moduleKey));
    return target.harness.version === 2
      ? path.join(moduleRoot, "tasks", normalizedTaskId)
      : path.join(moduleRoot, normalizedTaskId);
  }
  return path.join(target.harness.tasksRoot, normalizedTaskId);
}

export function resolveTaskDirectory(target, taskRef) {
  const raw = String(taskRef || "")
    .replace(/^coding-agent-harness\/planning\//, "")
    .replace(/^planning\//, "")
    .replace(new RegExp(`^${legacyPlanningPrefix()}\\/`), "")
    .replace(/^\/+/, "");
  if (!raw) throw new Error("Missing task id");
  const direct = directTaskRefPath(target, raw);
  if (direct && fs.existsSync(path.join(direct, "task_plan.md"))) return direct;
  const normalized = normalizeTaskId(raw);
  const candidates = listTaskPlanPaths(target)
    .map((taskPlanPath) => path.dirname(taskPlanPath))
    .filter((taskDir) => {
      const id = taskIdForDirectory(target, taskDir);
      const dirName = path.basename(taskDir);
      return id === raw || id.endsWith(`/${raw}`) || dirName === normalized;
    });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const options = candidates.map((taskDir) => `- ${taskIdForDirectory(target, taskDir)}`).join("\n");
    throw new Error(`Ambiguous task reference: ${taskRef}\n${options}`);
  }
  // Try bare slug resolution: match normalized slug against dated directories
  if (!datePrefix.test(normalized)) {
    const datedCandidates = listTaskPlanPaths(target)
      .map((taskPlanPath) => path.dirname(taskPlanPath))
      .filter((taskDir) => {
        const dirName = path.basename(taskDir);
        return datePrefix.test(dirName) && dirName.replace(datePrefix, "") === normalized;
      });
    if (datedCandidates.length === 1) return datedCandidates[0];
    if (datedCandidates.length > 1) {
      const options = datedCandidates.map((taskDir) => `- ${taskIdForDirectory(target, taskDir)}`).join("\n");
      throw new Error(`Ambiguous task reference: ${taskRef}\n${options}`);
    }
  }
  const legacy = taskRoot(target, normalized);
  if (fs.existsSync(path.join(legacy, "task_plan.md"))) return legacy;
  throw new Error(`Task not found: ${taskRef}`);
}

function directTaskRefPath(target, raw) {
  return taskRefPath(target.harness, raw);
}

function legacyPlanningPrefix() {
  return "docs\\/09-PLANNING";
}

function findTaskByDirectory(target, taskDir) {
  const id = taskIdForDirectory(target, taskDir);
  return collectTasks(target).find((task) => task.id === id) || null;
}

function stateLabel(state, locale) {
  if (normalizeLocale(locale) !== "zh-CN") return state;
  return (
    {
      not_started: "未开始",
      planned: "未开始",
      in_progress: "进行中",
      review: "审查中",
      blocked: "已阻塞",
      done: "已完成",
    }[state] || state
  );
}

function normalizeTaskBudgetInput(budget) {
  const normalized = String(budget || "standard").trim().toLowerCase().replaceAll("_", "-");
  if (allowedTaskBudgets.has(normalized)) return normalized;
  throw new Error(`Invalid task budget: ${budget}. Expected one of: simple, standard, complex`);
}

function normalizeTaskPresetInput(preset, { targetInput = "" } = {}) {
  const normalized = String(preset || "none").trim().toLowerCase().replaceAll("_", "-");
  if (!normalized || normalized === "none") return "none";
  return readPresetPackage(normalized, { targetInput }).id;
}

function updateProgressState(content, state, locale) {
  const label = stateLabel(state, locale);
  if (/^##\s*状态[:：][^\n]*/im.test(content)) {
    return content.replace(/^##\s*状态[:：][^\n]*/im, `## 状态：${label}`);
  }
  if (/^##\s*(?:Current Status|Status)\s*\n+\s*[^\n]+/im.test(content)) {
    return content.replace(/^##\s*(Current Status|Status)\s*\n+\s*[^\n]+/im, `## $1\n\n${label}`);
  }
  return `${content.trimEnd()}\n\n## Status\n\n${label}\n`;
}

function ensureDatePrefix(slug) {
  if (datePrefix.test(slug)) return slug;
  return `${localDate()}-${slug}`;
}

function bareSlug(datedId) {
  if (datePrefix.test(datedId)) return datedId.replace(datePrefix, "");
  return datedId;
}

function automaticTaskSlug(seed) {
  return normalizeTaskId(seed || "task").slice(0, 48).replace(/-+$/g, "") || "task";
}

function randomTaskSuffix() {
  return crypto.randomBytes(4).toString("hex");
}

function resolveTaskIdentity({ target, taskId, title, presetPackage, moduleKey, automaticTaskId }) {
  if (!automaticTaskId) {
    const rawNormalized = normalizeTaskId(taskId || (presetPackage?.task?.defaultTaskId || ""));
    const normalizedTaskId = ensureDatePrefix(rawNormalized);
    if (!normalizedTaskId) throw new Error("Missing task id");
    return { normalizedTaskId, semanticSlug: bareSlug(normalizedTaskId) };
  }

  const semanticSlug = automaticTaskSlug(title || presetPackage?.task?.defaultTaskId || "task");
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const normalizedTaskId = `${localDate()}-${semanticSlug}-${randomTaskSuffix()}`;
    if (!fs.existsSync(taskRoot(target, normalizedTaskId, { moduleKey }))) return { normalizedTaskId, semanticSlug };
  }
  throw new Error(`Unable to allocate automatic task id for: ${semanticSlug}`);
}

export function createTask(targetInput, taskId, { title = "", locale = "en-US", dryRun = false, moduleKey = "", budget = "standard", longRunning = false, preset = "", fromSession = "", presetArgs = [], automaticTaskId = false, deferCommit = false, allowDirtyRelativePaths = [] } = {}) {
  const requestedPreset = preset || (moduleKey ? "module" : "");
  const presetTargetInput = resolveImplicitCreateTarget(targetInput, fromSession);
  const normalizedPreset = normalizeTaskPresetInput(requestedPreset, { targetInput: presetTargetInput });
  const presetPackage = normalizedPreset === "none" ? null : readPresetPackage(normalizedPreset, { targetInput: presetTargetInput });
  const presetInputs = presetPackage ? resolvePresetInputs(presetPackage, { cliArgs: presetArgs, fromSession, targetInput: presetTargetInput }) : null;
  const target = normalizeTarget(presetInputs?.targetInput || presetTargetInput || targetInput);
  if (presetInputs?.targetInput && targetInput && targetInput !== "." && path.resolve(targetInput) !== path.resolve(presetInputs.targetInput)) {
    throw new Error(`--from-session target mismatch: session target is ${presetInputs.targetInput}`);
  }
  const normalizedBudget = normalizeTaskBudgetInput(budget);
  if (presetPackage && !presetPackage.compatibleBudgets.includes(normalizedBudget)) throw new Error(`${normalizedPreset} preset requires --budget ${presetPackage.compatibleBudgets.join("|")}`);
  if (presetPackage?.task?.projectLevelOnly === true && moduleKey) throw new Error(`${normalizedPreset} preset is project-level and cannot be combined with --module`);
  if (presetPackage?.task?.requiresFromSession === true && !fromSession) throw new Error(`${normalizedPreset} preset requires --from-session`);
  const normalizedModuleKey = moduleKey ? normalizeTaskId(moduleKey) : "";
  const identity = resolveTaskIdentity({ target, taskId, title, presetPackage, moduleKey: normalizedModuleKey, automaticTaskId });
  const normalizedTaskId = identity.normalizedTaskId;
  const semanticSlug = identity.semanticSlug;
  const normalizedLocale = normalizeLocale(locale || readCapabilityRegistry(target).locale);
  const taskTitle = title || (normalizedPreset === "legacy-migration" ? "Harness v1 legacy migration" : semanticSlug);
  const directory = taskRoot(target, normalizedTaskId, { moduleKey: normalizedModuleKey });
  if (fs.existsSync(directory)) throw new Error(`Task already exists: ${normalizedTaskId}`);
  const scaffoldProvenance = buildScaffoldProvenance({
    taskId,
    normalizedTaskId,
    title,
    locale: normalizedLocale,
    budget: normalizedBudget,
    longRunning,
    moduleKey: normalizedModuleKey,
    preset: normalizedPreset,
    fromSession,
    targetInput: presetInputs?.targetInput || targetInput,
    automaticTaskId,
  });
  const baseTaskAudit = buildCreationTaskAudit(scaffoldProvenance, { projectRoot: target.projectRoot });
  const evaluatedPresetValues = presetPackage ? evaluateTemplateValues(presetPackage, presetInputs.inputs, { taskId: normalizedTaskId, taskTitle, moduleKey: normalizedModuleKey, target }) : null;
  const presetContext = presetPackage
    ? buildPresetContext({ ...presetPackage, task: { ...(presetPackage.task || {}), kind: presetPackage.task?.kind || "general" } }, {
        target,
        taskDir: directory,
        taskId: normalizedTaskId,
        taskTitle,
        resolvedInputs: presetInputs.inputs,
        evaluatedValues: evaluatedPresetValues,
      })
    : null;
  const task = {
    id: taskIdForDirectory(target, directory),
    shortId: normalizedTaskId,
    title: taskTitle,
    module: normalizedModuleKey || null,
    path: `TARGET:${toPosix(path.relative(target.projectRoot, directory))}`,
    locale: normalizedLocale,
    budget: normalizedBudget,
    kind: presetContext?.kind || "general",
    preset: normalizedPreset,
    presetVersion: presetContext?.presetVersion || "",
    presetAudit: presetContext?.audit || null,
    migrationTargetLevel: presetContext?.migrationTargetLevel || "",
    migrationAchievedLevel: presetContext?.migrationAchievedLevel || "",
    evidenceBundle: presetContext?.evidenceBundle || "",
    longRunning,
  };
  const plannedChanges = planCreateTaskChanges({
    target,
    directory,
    normalizedModuleKey,
    normalizedLocale,
    normalizedBudget,
    longRunning,
    presetContext,
    task,
  });
  const plannedGovernance = syncTaskGovernance(target, task, { event: "new-task", state: "planned", message: "task registered by CLI", dryRun: true });
  const plannedWriteScopes = governanceRelativePaths([...plannedChanges, ...plannedGovernance.changes]);
  const changes = [];
  const governanceContext = beginGovernanceSync(target, { operation: `new-task ${normalizedTaskId}`, dryRun, allowDirtyWorktree: true, allowedRelativePaths: [...plannedWriteScopes, ...(allowDirtyRelativePaths || [])], allowDirtyWriteScope: deferCommit });
  try {
  if (normalizedModuleKey) {
    const moduleDirectory = target.harness.version === 2
      ? path.join(target.harness.modulesRoot, normalizedModuleKey)
      : path.dirname(directory);
    for (const [destination, source] of moduleTemplateFiles({ locale: normalizedLocale })) {
      const destinationPath = path.join(moduleDirectory, destination);
      if (fs.existsSync(destinationPath)) continue;
      changes.push({
        destination: toPosix(path.relative(target.projectRoot, destinationPath)),
        source,
        action: dryRun ? "would-create" : "create",
      });
      if (presetPackage) assertPresetWriteScope(presetPackage, toPosix(path.relative(target.projectRoot, destinationPath)), target);
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(
        destinationPath,
        renderTaskTemplate(readBundledTemplate(source), {
          taskId: normalizedModuleKey,
          title: normalizedModuleKey,
          locale: normalizedLocale,
          budget: normalizedBudget,
          moduleKey: normalizedModuleKey,
          preset: normalizedPreset,
          presetVersion: presetContext?.presetVersion || "",
          evidenceBundle: presetContext?.evidenceBundle || "",
          longRunning,
          scaffoldProvenance,
          taskAudit: buildCreationTaskAudit({ ...scaffoldProvenance, templateSource: source }, { projectRoot: target.projectRoot }),
          target,
        }),
      );
    }
  }
  const files = appendLongRunningContractFile(taskFilesForBudget({ budget: normalizedBudget, locale: normalizedLocale }), {
    locale: normalizedLocale,
    longRunning,
  });
  for (const [destination, source] of files) {
    const destinationPath = path.join(directory, destination);
    changes.push({
      destination: toPosix(path.relative(target.projectRoot, destinationPath)),
      source,
      action: dryRun ? "would-create" : "create",
    });
    if (presetPackage) assertPresetWriteScope(presetPackage, toPosix(path.relative(target.projectRoot, destinationPath)), target);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(
      destinationPath,
      renderPresetTaskTemplate(destination, renderTaskTemplate(readBundledTemplate(source), {
        taskId: normalizedTaskId,
        title: taskTitle,
        locale: normalizedLocale,
        budget: normalizedBudget,
        moduleKey: normalizedModuleKey,
        preset: normalizedPreset,
        presetVersion: presetContext?.presetVersion || "",
        evidenceBundle: presetContext?.evidenceBundle || "",
        longRunning,
        scaffoldProvenance: {
          ...scaffoldProvenance,
          templateSource: source,
        },
        taskAudit: destination === "INDEX.md"
          ? buildCreationTaskAudit({ ...scaffoldProvenance, templateSource: source }, { projectRoot: target.projectRoot })
          : baseTaskAudit,
        target,
      }), presetContext),
    );
  }
  if (presetContext) {
    for (const evidence of presetContext.evidenceFiles) {
      const destinationPath = path.join(target.projectRoot, evidence.relativePath);
      changes.push({
        destination: toPosix(evidence.relativePath),
        source: evidence.source,
        action: dryRun ? "would-create" : "create",
      });
      assertPresetWriteScope(presetPackage, toPosix(evidence.relativePath), target);
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, evidence.content);
    }
    for (const resource of presetContext.resourceFiles || []) {
      const destinationPath = path.join(target.projectRoot, resource.relativePath);
      changes.push({
        destination: toPosix(resource.relativePath),
        source: resource.source,
        action: dryRun ? "would-create" : "create",
      });
      assertPresetWriteScope(presetPackage, toPosix(resource.relativePath), target);
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, resource.content);
    }
    for (const [kind, rows] of Object.entries(presetContext.resourceIndexRows || {})) {
      if (!rows.length) continue;
      const destination = kind === "references" ? "references/INDEX.md" : "artifacts/INDEX.md";
      const destinationPath = path.join(directory, destination);
      const relativePath = toPosix(path.relative(target.projectRoot, destinationPath));
      changes.push({
        destination: relativePath,
        source: `preset-${kind}-index`,
        action: dryRun ? "would-update" : "update",
      });
      assertPresetWriteScope(presetPackage, relativePath, target);
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      const existing = fs.existsSync(destinationPath) ? fs.readFileSync(destinationPath, "utf8") : "";
      fs.writeFileSync(destinationPath, renderPresetResourceIndex(existing, kind, rows));
    }
  }
  const governance = syncTaskGovernance(target, task, { event: "new-task", state: "planned", message: "task registered by CLI", dryRun });
  changes.push(...governance.changes);
  const commandWriteScopes = governanceRelativePaths(changes);
  if (presetContext) {
    refreshPresetCommandAudit(target, presetContext, { commandWriteScopes, dryRun });
    task.presetAudit = presetContext.audit;
  }
  const commit = deferCommit ? { committed: false, reason: "deferred", allowedPaths: commandWriteScopes } : commitGovernanceSync(governanceContext, commandWriteScopes, { message: `chore(harness): register task ${task.id}` });
  return {
    dryRun,
    task,
    changes,
    governance: { ...governance, commit },
  };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}

export function updateTaskLifecycle(targetInput, taskId, { event = "task-log", state = "", message = "", evidence = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const taskDir = resolveTaskDirectory(target, taskId);
  const progressPath = path.join(taskDir, "progress.md");
  const registry = readCapabilityRegistry(target);
  const normalizedState = state ? String(state).toLowerCase().replaceAll("-", "_") : "";
  if (normalizedState && !allowedTaskStates.has(normalizedState)) throw new Error(`Invalid task state: ${state}`);
  const currentTask = findTaskByDirectory(target, taskDir);
  const canonicalTaskId = taskIdForDirectory(target, taskDir);
  const budget = parseTaskBudget(readFileSafe(path.join(taskDir, "task_plan.md")));
  validateLifecycleTransition({
    event,
    currentState: currentTask?.state || "unknown",
    budget,
    reviewContent: readFileSafe(path.join(taskDir, "review.md")),
    indexContent: readFileSafe(path.join(taskDir, "INDEX.md")),
    reviewTaskKey: canonicalTaskId,
    projectRoot: target.projectRoot,
    taskDir,
  });
  if (event === "task-review") validateReviewEntryGate(taskDir, budget);
  const governanceContext = beginGovernanceSync(target, { operation: `${event} ${canonicalTaskId}` });
  try {
    let content = readFileSafe(progressPath);
    if (normalizedState) content = updateProgressState(content, normalizedState, registry.locale);
    content = appendProgressLog(content, { event, message, evidence });
    fs.writeFileSync(progressPath, content.endsWith("\n") ? content : `${content}\n`);
    const allowedPaths = [toPosix(path.relative(target.projectRoot, progressPath))];
    const advancedPhasePath = advanceLifecyclePhase(target, taskDir, event);
    if (advancedPhasePath) allowedPaths.push(advancedPhasePath);
    if (event === "task-review") {
      const reviewPath = path.join(taskDir, "review.md");
      const reviewContent = readFileSafe(reviewPath);
      fs.writeFileSync(
        reviewPath,
        replaceAgentReviewSubmission(
          reviewContent,
          renderAgentReviewSubmission({
            target,
            taskDir,
            canonicalTaskId,
            message,
            evidence,
          }),
        ),
      );
      allowedPaths.push(toPosix(path.relative(target.projectRoot, reviewPath)));
      const lessonDecisionPath = autoRecordNoLessonCandidateDecision(target, taskDir);
      if (lessonDecisionPath) allowedPaths.push(lessonDecisionPath);
    }
    if (event === "task-complete" && target.harness.version === 2) {
      const walkthroughPath = path.join(taskDir, "walkthrough.md");
      const currentWalkthrough = readFileSafe(walkthroughPath) || `# Walkthrough: ${canonicalTaskId}\n`;
      fs.writeFileSync(walkthroughPath, markWalkthroughClosed(currentWalkthrough));
      allowedPaths.push(toPosix(path.relative(target.projectRoot, walkthroughPath)));
    }
    const task =
      findTaskByDirectory(target, taskDir) ||
      {
        id: canonicalTaskId,
        shortId: path.basename(taskDir),
        title: canonicalTaskId,
        path: `TARGET:${toPosix(path.relative(target.projectRoot, taskDir))}`,
        state: normalizedState || currentTask?.state || "unknown",
      };
    const governanceState = normalizedState || task.state || currentTask?.state || "planned";
    const governance = syncTaskGovernance(target, task, { event, state: governanceState, message, dryRun: false });
    const commit = commitGovernanceSync(governanceContext, [...allowedPaths, ...governanceRelativePaths(governance.changes)], {
      message: `chore(harness): advance task ${canonicalTaskId} to ${governanceState}`,
    });
    return {
      event,
      task,
      governance: { ...governance, commit },
    };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}
export function confirmTaskReview(targetInput, taskId, { reviewer = "Human Reviewer", message = "", confirmText = "", evidence = "", deferCommit = false } = {}) {
  const target = normalizeTarget(targetInput);
  return confirmTaskReviewWithContext({ target, taskDir: resolveTaskDirectory(target, taskId), findTaskByDirectory }, { reviewer, message, confirmText, evidence, deferCommit });
}

export function finalizeDeferredTaskReviewConfirmation(targetInput, taskId, { commitSha = "" } = {}) {
  const target = normalizeTarget(targetInput);
  return finalizeDeferredTaskReviewConfirmationWithContext({ target, taskDir: resolveTaskDirectory(target, taskId), findTaskByDirectory }, { commitSha });
}
export function updateTaskPhase(targetInput, taskId, phaseId, { state = "", completion = "", evidenceStatus = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const taskDir = resolveTaskDirectory(target, taskId);
  const visualMapPath = path.join(taskDir, visualMapFile);
  const legacyPath = path.join(taskDir, legacyVisualRoadmapFile);
  if (!fs.existsSync(visualMapPath)) {
    if (fs.existsSync(legacyPath)) throw new Error(`Task has legacy visual_roadmap.md only; rewrite it to visual_map.md before task-phase: ${taskId}`);
    throw new Error(`Task visual map not found: ${taskId}`);
  }
  let content = readFileSafe(visualMapPath);
  const normalizedState = state ? String(state).toLowerCase().replaceAll("-", "_") : "";
  if (normalizedState && !allowedPhaseStates.has(normalizedState)) throw new Error(`Invalid phase state: ${state}`);
  const normalizedEvidence = evidenceStatus ? String(evidenceStatus).toLowerCase() : "";
  if (normalizedEvidence && !allowedEvidenceStatus.has(normalizedEvidence)) throw new Error(`Invalid evidence status: ${evidenceStatus}`);
  const nextCompletion = completion === "" ? "" : Number.parseInt(String(completion), 10);
  if (nextCompletion !== "" && (!Number.isInteger(nextCompletion) || nextCompletion < 0 || nextCompletion > 100)) {
    throw new Error(`Invalid completion: ${completion}`);
  }
  const phaseUpdate = updateMarkdownTableRow(content, /^Phase ID$/i, (header, row) => {
    const idIndex = getColumn(header, "Phase ID");
    if ((row[idIndex] || "") !== phaseId) return null;
    const next = [...row];
    const stateIndex = getColumn(header, "State");
    const completionIndex = getColumn(header, "Completion");
    const evidenceIndex = getColumn(header, "Evidence Status");
    if (normalizedState && stateIndex >= 0) next[stateIndex] = normalizedState;
    if (nextCompletion !== "" && completionIndex >= 0) next[completionIndex] = String(nextCompletion);
    if (normalizedEvidence && evidenceIndex >= 0) next[evidenceIndex] = normalizedEvidence;
    return next;
  });
  if (!phaseUpdate.matched) throw new Error(`Phase not found: ${phaseId}`);
  const governanceContext = beginGovernanceSync(target, { operation: `task-phase ${taskId} ${phaseId}` });
  try {
    content = phaseUpdate.content;
    fs.writeFileSync(visualMapPath, content);
    const commit = commitGovernanceSync(governanceContext, [toPosix(path.relative(target.projectRoot, visualMapPath))], {
      message: `chore(harness): update task phase ${taskId} ${phaseId}`,
    });
    return { event: "task-phase", task: findTaskByDirectory(target, taskDir), phaseId, governance: { commit } };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}

export function updateModuleStep(targetInput, moduleKey, stepId, { state = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const normalizedModuleKey = normalizeTaskId(moduleKey);
  const normalizedState = String(state || "done").toLowerCase().replaceAll("_", "-");
  if (!["planned", "in-progress", "done", "blocked", "superseded"].includes(normalizedState)) throw new Error(`Invalid module step state: ${state}`);
  const modulePlanPath = path.join(target.harness.modulesRoot, normalizedModuleKey, "module_plan.md");
  if (!fs.existsSync(modulePlanPath)) throw new Error(`Module plan not found: ${normalizedModuleKey}`);
  let content = readFileSafe(modulePlanPath);
  const stepUpdate = updateMarkdownTableRow(content, /^(Step ID|步骤 ID)$/i, (header, row) => {
    const idIndex = firstColumn(header, ["Step ID", "步骤 ID"]);
    if ((row[idIndex] || "") !== stepId) return null;
    const next = [...row];
    const statusIndex = firstColumn(header, ["Status", "状态"]);
    if (statusIndex >= 0) next[statusIndex] = normalizedState;
    return next;
  });
  if (!stepUpdate.matched) throw new Error(`Module step not found: ${stepId}`);
  const governanceContext = beginGovernanceSync(target, { operation: `module-step ${normalizedModuleKey} ${stepId}` });
  try {
    content = stepUpdate.content;
    fs.writeFileSync(modulePlanPath, content);

    const registryPath = path.join(target.harness.modulesRoot, "Module-Registry.md");
    if (fs.existsSync(registryPath)) {
      let registry = readFileSafe(registryPath);
      const registryUpdate = updateMarkdownTableRow(registry, /^(ID|模块 Key)$/i, (header, row) => {
        const moduleIndex = firstColumn(header, ["Module", "模块", "模块 Key"]);
        const taskPlanIndex = getColumn(header, "Task Plan");
        const matchesModule = normalizeTaskId(row[moduleIndex] || "") === normalizedModuleKey;
        const matchesPlan = taskPlanIndex >= 0 && String(row[taskPlanIndex] || "").includes(`/MODULES/${normalizedModuleKey}/`);
        if (!matchesModule && !matchesPlan) return null;
        const next = [...row];
        const statusIndex = firstColumn(header, ["Status", "状态"]);
        const updatedIndex = firstColumn(header, ["Updated", "更新时间"]);
        const currentStepIndex = firstColumn(header, ["Current Step", "当前步骤"]);
        const chineseRegistry = header.some((cell) => /模块 Key|模块名称|状态|更新时间/.test(cell));
        if (statusIndex >= 0) {
          next[statusIndex] = normalizedState === "done"
            ? chineseRegistry ? "completed" : "merged"
            : normalizedState === "in-progress" ? chineseRegistry ? "in-progress" : "active" : normalizedState;
        }
        if (currentStepIndex >= 0) next[currentStepIndex] = stepId;
        if (updatedIndex >= 0) next[updatedIndex] = todayDate();
        return next;
      });
      registry = registryUpdate.content;
      fs.writeFileSync(registryPath, registry);
    }
    const governance = syncModuleStepGovernance(target, { moduleKey: normalizedModuleKey, stepId, state: normalizedState });
    const commit = commitGovernanceSync(
      governanceContext,
      [
        toPosix(path.relative(target.projectRoot, modulePlanPath)),
        toPosix(path.relative(target.projectRoot, registryPath)),
        ...governanceRelativePaths(governance.changes),
      ],
      { message: `chore(harness): update module ${normalizedModuleKey} step ${stepId}` },
    );
    return { event: "module-step", moduleKey: normalizedModuleKey, stepId, state: normalizedState, governance: { ...governance, commit } };
  } finally {
    releaseGovernanceSync(governanceContext);
  }
}

export function listLifecycleTasks(targetInput, { state = "", moduleKey = "", queue = "", preset = "", review = "", lesson = "", search = "", missingMaterials = false, includeArchived = false } = {}) {
  const target = normalizeTarget(targetInput);
  let tasks = collectTasks(target);
  if (!includeArchived) tasks = tasks.filter((task) => task.deletionState === "active" && task.hiddenByDefault !== true);
  if (state) tasks = tasks.filter((task) => task.state === String(state).toLowerCase().replaceAll("-", "_"));
  if (moduleKey) tasks = tasks.filter((task) => task.module === normalizeTaskId(moduleKey));
  if (queue) {
    const normalizedQueue = queryToken(queue);
    tasks = tasks.filter((task) => (task.taskQueues || []).map(queryToken).includes(normalizedQueue));
  }
  if (preset) tasks = tasks.filter((task) => queryToken(task.taskPreset || "none") === queryToken(preset));
  if (review) tasks = tasks.filter((task) => queryToken(task.reviewStatus || "") === queryToken(review));
  if (lesson) {
    const needle = queryToken(lesson);
    tasks = tasks.filter((task) => [task.lessonCandidateStatus, task.lessonCandidateReviewDecision, task.lessonCandidatePromotionState].some((value) => queryToken(value) === needle));
  }
  if (missingMaterials) tasks = tasks.filter((task) => !task.materialsReady);
  if (search) {
    const needle = String(search).toLowerCase();
    tasks = tasks.filter((task) => [
      task.id,
      task.taskKey,
      task.shortId,
      task.title,
      task.currentPath,
      task.taskPlanPath,
      task.module,
      task.inferredModule,
    ].some((value) => String(value || "").toLowerCase().includes(needle)));
  }
  return { tasks };
}

function queryToken(value) {
  return String(value || "").trim().toLowerCase().replaceAll("_", "-");
}
