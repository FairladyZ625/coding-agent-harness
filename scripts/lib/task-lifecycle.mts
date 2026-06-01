import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { visualMapFile, legacyVisualRoadmapFile, allowedTaskStates, allowedTaskBudgets, allowedPhaseStates, allowedEvidenceStatus, normalizeTarget, normalizeLocale, toPosix, readFileSafe, readBundledTemplate, todayDate, localDate, datePrefix, normalizeTaskId, renderTaskTemplate } from "./core-shared.mjs";
import { readCapabilityRegistry } from "./capability-registry.mjs";
import { readPresetPackage } from "./preset-registry.mjs";
import { renderPresetResourceIndex } from "./preset-engine.mjs";
import { parseTaskBudget } from "./task-metadata.mjs";
import { createScannerTaskRepository } from "./task-repository.mjs";
import { getColumn, firstColumn, updateMarkdownTableRow } from "./markdown-utils.mjs";
import { validateLifecycleTransition, validateReviewEntryGate } from "./task-lifecycle/review-gates.mjs";
import { advanceLifecyclePhase, autoRecordNoLessonCandidateDecision } from "./task-lifecycle/phase-sync.mjs";
import { confirmTaskReview as confirmTaskReviewWithContext, finalizeDeferredTaskReviewConfirmation as finalizeDeferredTaskReviewConfirmationWithContext } from "./task-lifecycle/review-confirm.mjs";
import { appendProgressLog, markWalkthroughClosed } from "./task-lifecycle/text-utils.mjs";
import { buildScaffoldProvenance } from "./task-lifecycle/scaffold-provenance.mjs";
import { buildCreationTaskAudit } from "./task-audit-metadata.mjs";
import { renderAgentReviewSubmission, replaceAgentReviewSubmission } from "./task-lifecycle/review-submission.mjs";
import { appendLongRunningContractFile, moduleTemplateFiles, taskFilesForBudget } from "./task-lifecycle/template-files.mjs";
import { planCreateTaskChanges, refreshPresetCommandAudit, resolveImplicitCreateTarget } from "./task-lifecycle/create-task-helpers.mjs";
import { beginGovernanceSync, commitGovernanceSync, governanceRelativePaths, releaseGovernanceSync, syncModuleStepGovernance, syncTaskGovernance } from "./governance-sync.mjs";
import { assertTransactionSucceeded, createGovernanceHarnessTransaction } from "./harness-transaction.mjs";
import { normalizeHarnessModuleKey, prepareModuleRegistration, prepareModuleStepRegistrationUpdate, readHarnessModules, registeredHarnessModule } from "./module-registry.mjs";
import { assertLifecyclePresetWriteScope, buildLifecyclePresetContext, evaluatePresetValues, renderLifecyclePresetTaskTemplate, resolveLifecyclePresetInputs } from "./task-lifecycle/preset-interop.mjs";
import { taskIdFromDirectory } from "./harness-paths.mjs";
import type { TaskBudget } from "./types/task-scanner.js";
import type { CreateTaskOptions, DeferredReviewConfirmOptions, LifecycleChange, LifecycleTarget, LifecycleTask, LifecycleUpdateOptions, ListLifecycleTasksOptions, ModuleStepOptions, PhaseUpdateOptions, PresetContext, PresetInputs, PresetPackage, ReviewConfirmOptions, TaskIdentity } from "./types/task-lifecycle.js";

type LifecycleGateEvent = "task-start" | "task-review" | "task-complete";

function asLifecycleTarget(target: ReturnType<typeof normalizeTarget>): LifecycleTarget {
  return target as LifecycleTarget;
}

function changeDestinations(changes: LifecycleChange[]): string[] {
  return changes.map((change) => change.destination).filter(Boolean);
}

function lifecycleGateEvent(event: string): LifecycleGateEvent {
  return String(event || "task-log") as LifecycleGateEvent;
}

function findReviewTaskByDirectory(target: { projectRoot: string }, taskDir: string): LifecycleTask | undefined {
  return findTaskByDirectory(asLifecycleTarget(normalizeTarget(target.projectRoot)), taskDir);
}

function taskRoot(target: LifecycleTarget, taskId: string, { moduleKey = "" }: { moduleKey?: string } = {}): string {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (moduleKey) {
    const moduleRoot = path.join(target.harness.modulesRoot, normalizeTaskId(moduleKey));
    return target.harness.version === 2
      ? path.join(moduleRoot, "tasks", normalizedTaskId)
      : path.join(moduleRoot, normalizedTaskId);
  }
  return path.join(target.harness.tasksRoot, normalizedTaskId);
}

export function resolveTaskDirectory(target: LifecycleTarget, taskRef: string): string {
  return createScannerTaskRepository(target).resolve({ id: taskRef }).directory;
}

function taskIdForDirectory(target: LifecycleTarget, taskDir: string): string {
  return taskIdFromDirectory(target.harness, taskDir);
}

function findTaskByDirectory(target: LifecycleTarget, taskDir: string): LifecycleTask | undefined {
  try {
    return createScannerTaskRepository(target).get({ path: taskDir }) as LifecycleTask;
  } catch {
    return undefined;
  }
}

function stateLabel(state: string, locale: string): string {
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

function normalizeTaskBudgetInput(budget: string): TaskBudget {
  const normalized = String(budget || "standard").trim().toLowerCase().replaceAll("_", "-");
  if (allowedTaskBudgets.has(normalized)) return normalized as TaskBudget;
  throw new Error(`Invalid task budget: ${budget}. Expected one of: simple, standard, complex`);
}

function normalizeTaskPresetInput(preset: string, { targetInput = "" }: { targetInput?: string } = {}): string {
  const normalized = String(preset || "none").trim().toLowerCase().replaceAll("_", "-");
  if (!normalized || normalized === "none") return "none";
  return (readPresetPackage(normalized, { targetInput }) as PresetPackage).id;
}

function updateProgressState(content: string, state: string, locale: string): string {
  const label = stateLabel(state, locale);
  if (/^##\s*状态[:：][^\n]*/im.test(content)) {
    return content.replace(/^##\s*状态[:：][^\n]*/im, `## 状态：${label}`);
  }
  if (/^##\s*(?:Current Status|Status)\s*\n+\s*[^\n]+/im.test(content)) {
    return content.replace(/^##\s*(Current Status|Status)\s*\n+\s*[^\n]+/im, `## $1\n\n${label}`);
  }
  return `${content.trimEnd()}\n\n## Status\n\n${label}\n`;
}

function ensureDatePrefix(slug: string): string {
  if (datePrefix.test(slug)) return slug;
  return `${localDate()}-${slug}`;
}

function bareSlug(datedId: string): string {
  if (datePrefix.test(datedId)) return datedId.replace(datePrefix, "");
  return datedId;
}

function automaticTaskSlug(seed: string): string {
  return normalizeTaskId(seed || "task").slice(0, 48).replace(/-+$/g, "") || "task";
}

function randomTaskSuffix(): string {
  return crypto.randomBytes(4).toString("hex");
}

function resolveTaskIdentity({ target, taskId, title, presetPackage, moduleKey, automaticTaskId }: { target: LifecycleTarget; taskId: string; title: string; presetPackage: PresetPackage | null; moduleKey: string; automaticTaskId: boolean }): TaskIdentity {
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

export function createTask(targetInput: string, taskId: string, { title = "", locale = "en-US", dryRun = false, moduleKey = "", budget = "standard", longRunning = false, preset = "", fromSession = "", presetArgs = [], automaticTaskId = false, deferCommit = false, allowDirtyRelativePaths = [], registerModule = false, moduleRegistration = {} }: CreateTaskOptions = {}) {
  const requestedPreset = preset || (moduleKey ? "module" : "");
  const presetTargetInput = resolveImplicitCreateTarget(targetInput, fromSession);
  const normalizedPreset = normalizeTaskPresetInput(requestedPreset, { targetInput: presetTargetInput });
  const presetPackage: PresetPackage | null = normalizedPreset === "none" ? null : readPresetPackage(normalizedPreset, { targetInput: presetTargetInput }) as PresetPackage;
  const presetInputs: PresetInputs | null = presetPackage ? resolveLifecyclePresetInputs(presetPackage, { cliArgs: presetArgs, fromSession, targetInput: presetTargetInput }) : null;
  const target = asLifecycleTarget(normalizeTarget(presetInputs?.targetInput || presetTargetInput || targetInput));
  if (presetInputs?.targetInput && targetInput && targetInput !== "." && path.resolve(targetInput) !== path.resolve(presetInputs.targetInput)) {
    throw new Error(`--from-session target mismatch: session target is ${presetInputs.targetInput}`);
  }
  const normalizedBudget = normalizeTaskBudgetInput(budget);
  if (presetPackage && !presetPackage.compatibleBudgets.includes(normalizedBudget)) throw new Error(`${normalizedPreset} preset requires --budget ${presetPackage.compatibleBudgets.join("|")}`);
  if (presetPackage?.task?.projectLevelOnly === true && moduleKey) throw new Error(`${normalizedPreset} preset is project-level and cannot be combined with --module`);
  if (presetPackage?.task?.requiresFromSession === true && !fromSession) throw new Error(`${normalizedPreset} preset requires --from-session`);
  const normalizedModuleKey = moduleKey ? normalizeHarnessModuleKey(moduleKey) : "";
  const plannedModuleRegistration = normalizedModuleKey && !registeredHarnessModule(target, normalizedModuleKey)
    ? registerModule
      ? prepareModuleRegistration(target, normalizedModuleKey, moduleRegistration, { dryRun: true })
      : null
    : null;
  if (normalizedModuleKey && !registeredHarnessModule(target, normalizedModuleKey) && !plannedModuleRegistration) {
    throw new Error(`Unknown module: ${normalizedModuleKey}. Register it first with: harness module register ${normalizedModuleKey} --title <title> --prefix <PREFIX> --scope <path> ${target.projectRoot}`);
  }
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
  const evaluatedPresetValues = presetPackage && presetInputs ? evaluatePresetValues(presetPackage, presetInputs.inputs, { taskId: normalizedTaskId, taskTitle, moduleKey: normalizedModuleKey, target }) : null;
  const presetContext: PresetContext | null = presetPackage && presetInputs && evaluatedPresetValues
    ? buildLifecyclePresetContext({ ...presetPackage, task: { ...(presetPackage.task || {}), kind: presetPackage.task?.kind || "general" } }, {
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
    presetContext: presetContext || undefined,
  });
  const plannedGovernance = syncTaskGovernance(target, task, { event: "new-task", state: "planned", message: "task registered by CLI", dryRun: true });
  const plannedWriteScopes = [...governanceRelativePaths(plannedModuleRegistration?.changes || []), ...changeDestinations(plannedChanges), ...governanceRelativePaths(plannedGovernance.changes)];
  const changes: LifecycleChange[] = [];
  const governanceContext = beginGovernanceSync(target, { operation: `new-task ${normalizedTaskId}`, dryRun, allowDirtyWorktree: true, allowedRelativePaths: [...plannedWriteScopes, ...(allowDirtyRelativePaths || [])], allowDirtyWriteScope: deferCommit });
  try {
  if (plannedModuleRegistration) {
    const moduleRegistrationResult = prepareModuleRegistration(target, normalizedModuleKey, moduleRegistration, { dryRun });
    changes.push(...moduleRegistrationResult.changes);
  }
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
      if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, toPosix(path.relative(target.projectRoot, destinationPath)), target);
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
    if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, toPosix(path.relative(target.projectRoot, destinationPath)), target);
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(
      destinationPath,
      renderLifecyclePresetTaskTemplate(destination, renderTaskTemplate(readBundledTemplate(source), {
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
    for (const evidence of presetContext.evidenceFiles || []) {
      const destinationPath = path.join(target.projectRoot, evidence.relativePath);
      changes.push({
        destination: toPosix(evidence.relativePath),
        source: evidence.source,
        action: dryRun ? "would-create" : "create",
      });
      if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, toPosix(evidence.relativePath), target);
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
      if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, toPosix(resource.relativePath), target);
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
      if (presetPackage) assertLifecyclePresetWriteScope(presetPackage, relativePath, target);
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      const existing = fs.existsSync(destinationPath) ? fs.readFileSync(destinationPath, "utf8") : "";
      fs.writeFileSync(destinationPath, renderPresetResourceIndex(existing, kind, rows));
    }
  }
  const governance = syncTaskGovernance(target, task, { event: "new-task", state: "planned", message: "task registered by CLI", dryRun });
  changes.push(...governance.changes);
  const commandWriteScopes = [...changeDestinations(changes), ...governanceRelativePaths(governance.changes)];
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

export function updateTaskLifecycle(targetInput: string, taskId: string, { event = "task-log", state = "", message = "", evidence = "" }: LifecycleUpdateOptions = {}) {
  const target = asLifecycleTarget(normalizeTarget(targetInput));
  const normalizedEvent = lifecycleGateEvent(event);
  const taskDir = resolveTaskDirectory(target, taskId);
  const progressPath = path.join(taskDir, "progress.md");
  const registry = readCapabilityRegistry(target);
  const normalizedState = state ? String(state).toLowerCase().replaceAll("-", "_") : "";
  if (normalizedState && !allowedTaskStates.has(normalizedState)) throw new Error(`Invalid task state: ${state}`);
  assertLifecycleEventStateConsistency(normalizedEvent, normalizedState);
  const currentTask = findTaskByDirectory(target, taskDir);
  const canonicalTaskId = taskIdForDirectory(target, taskDir);
  const budget = parseTaskBudget(readFileSafe(path.join(taskDir, "task_plan.md")));
  validateLifecycleTransition({
    event: normalizedEvent,
    currentState: currentTask?.state || "unknown",
    budget,
    reviewContent: readFileSafe(path.join(taskDir, "review.md")),
    indexContent: readFileSafe(path.join(taskDir, "INDEX.md")),
    reviewTaskKey: canonicalTaskId,
    projectRoot: target.projectRoot,
    taskDir,
  });
  if (event === "task-review") validateReviewEntryGate(taskDir, budget);
  type LifecycleTransactionPayload = {
    event: string;
    task: LifecycleTask | {
      id: string;
      shortId: string;
      title: string;
      path: string;
      state: string;
    };
    governance: ReturnType<typeof syncTaskGovernance>;
  };
  const lifecycleResultBox: { current: LifecycleTransactionPayload | null } = { current: null };
  const transaction = createGovernanceHarnessTransaction(target);
  const plan = transaction.plan({
    operation: `${event} ${canonicalTaskId}`,
    commit: { message: `chore(harness): advance task ${canonicalTaskId}` },
    apply() {
      let content = readFileSafe(progressPath);
      if (normalizedState) content = updateProgressState(content, normalizedState, registry.locale || "en-US");
      content = appendProgressLog(content, { event, message, evidence });
      fs.writeFileSync(progressPath, content.endsWith("\n") ? content : `${content}\n`);
      const allowedPaths = [toPosix(path.relative(target.projectRoot, progressPath))];
      const advancedPhasePath = advanceLifecyclePhase(target, taskDir, normalizedEvent);
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
      const governancePaths = governanceRelativePaths(governance.changes);
      lifecycleResultBox.current = { event, task, governance };
      return {
        allowedPaths: [...allowedPaths, ...governancePaths],
        generatedSurfaces: governance.changes.map((change) => ({ surface: change.surface, paths: [change.destination] })),
        commit: { message: `chore(harness): advance task ${canonicalTaskId} to ${governanceState}` },
      };
    },
  });
  const transactionResult = transaction.apply(plan);
  assertTransactionSucceeded(transactionResult);
  const lifecycleResult = lifecycleResultBox.current;
  if (!lifecycleResult) throw new Error(`Lifecycle transaction did not produce a result: ${canonicalTaskId}`);
  return {
    event: lifecycleResult.event,
    task: lifecycleResult.task,
    governance: { ...lifecycleResult.governance, commit: transactionResult.commit },
  };
}

function assertLifecycleEventStateConsistency(event: LifecycleGateEvent, state: string): void {
  if (!state) return;
  if (state === "done" && event !== "task-complete") {
    throw new Error(`State done must be written through task-complete, not ${event}.`);
  }
  if (state === "review" && event !== "task-review") {
    throw new Error(`State review must be written through task-review, not ${event}.`);
  }
}
export function confirmTaskReview(targetInput: string, taskId: string, { reviewer = "Human Reviewer", message = "", confirmText = "", evidence = "", deferCommit = false }: ReviewConfirmOptions = {}) {
  const target = asLifecycleTarget(normalizeTarget(targetInput));
  return confirmTaskReviewWithContext({ target, taskDir: resolveTaskDirectory(target, taskId), findTaskByDirectory: findReviewTaskByDirectory }, { reviewer, message, confirmText, evidence, deferCommit });
}

export function finalizeDeferredTaskReviewConfirmation(targetInput: string, taskId: string, { commitSha = "" }: DeferredReviewConfirmOptions = {}) {
  const target = asLifecycleTarget(normalizeTarget(targetInput));
  return finalizeDeferredTaskReviewConfirmationWithContext({ target, taskDir: resolveTaskDirectory(target, taskId), findTaskByDirectory: findReviewTaskByDirectory }, { commitSha });
}
export function updateTaskPhase(targetInput: string, taskId: string, phaseId: string, { state = "", completion = "", evidenceStatus = "" }: PhaseUpdateOptions = {}) {
  const target = asLifecycleTarget(normalizeTarget(targetInput));
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
  const visualMapRelative = toPosix(path.relative(target.projectRoot, visualMapPath));
  const transaction = createGovernanceHarnessTransaction(target);
  let taskAfterUpdate: LifecycleTask | undefined;
  const plan = transaction.plan({
    operation: `task-phase ${taskId} ${phaseId}`,
    allowedPaths: [visualMapRelative],
    commit: { message: `chore(harness): update task phase ${taskId} ${phaseId}` },
    apply() {
      content = phaseUpdate.content;
      fs.writeFileSync(visualMapPath, content);
      taskAfterUpdate = findTaskByDirectory(target, taskDir);
      return { allowedPaths: [visualMapRelative] };
    },
  });
  const transactionResult = transaction.apply(plan);
  assertTransactionSucceeded(transactionResult);
  return { event: "task-phase", task: taskAfterUpdate || findTaskByDirectory(target, taskDir), phaseId, governance: { commit: transactionResult.commit } };
}

export function updateModuleStep(targetInput: string, moduleKey: string, stepId: string, { state = "" }: ModuleStepOptions = {}) {
  const target = asLifecycleTarget(normalizeTarget(targetInput));
  const normalizedModuleKey = normalizeHarnessModuleKey(moduleKey);
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
  const modulePlanRelative = toPosix(path.relative(target.projectRoot, modulePlanPath));
  const plannedModuleRegistration = prepareModuleStepRegistrationUpdate(target, normalizedModuleKey, { stepId, state: normalizedState, dryRun: true });
  const plannedGovernance = syncModuleStepGovernance(target, { moduleKey: normalizedModuleKey, stepId, state: normalizedState, dryRun: true });
  const plannedGeneratedSurfaces = [...plannedModuleRegistration.changes, ...plannedGovernance.changes].map((change) => ({
    surface: change.surface,
    paths: [change.destination],
  }));
  const allowedPaths = [
    modulePlanRelative,
    ...governanceRelativePaths(plannedModuleRegistration.changes),
    ...governanceRelativePaths(plannedGovernance.changes),
  ];
  const governanceResultBox: { current?: ReturnType<typeof syncModuleStepGovernance> } = {};
  const transaction = createGovernanceHarnessTransaction(target);
  const plan = transaction.plan({
    operation: `module-step ${normalizedModuleKey} ${stepId}`,
    allowedPaths,
    generatedSurfaces: plannedGeneratedSurfaces,
    commit: { message: `chore(harness): update module ${normalizedModuleKey} step ${stepId}` },
    apply() {
      content = stepUpdate.content;
      fs.writeFileSync(modulePlanPath, content);
      const moduleRegistration = prepareModuleStepRegistrationUpdate(target, normalizedModuleKey, { stepId, state: normalizedState });
      const governance = syncModuleStepGovernance(target, { moduleKey: normalizedModuleKey, stepId, state: normalizedState });
      governanceResultBox.current = governance;
      return {
        allowedPaths: [
          modulePlanRelative,
          ...governanceRelativePaths(moduleRegistration.changes),
          ...governanceRelativePaths(governance.changes),
        ],
        generatedSurfaces: [...moduleRegistration.changes, ...governance.changes].map((change) => ({
          surface: change.surface,
          paths: [change.destination],
        })),
      };
    },
  });
  const transactionResult = transaction.apply(plan);
  assertTransactionSucceeded(transactionResult);
  const finalGovernance = governanceResultBox.current;
  if (!finalGovernance) throw new Error(`Module step transaction did not produce governance changes: ${normalizedModuleKey} ${stepId}`);
  return { event: "module-step", moduleKey: normalizedModuleKey, stepId, state: normalizedState, governance: { changes: finalGovernance.changes, commit: transactionResult.commit } };
}

export function listLifecycleTasks(targetInput: string, { state = "", moduleKey = "", queue = "", preset = "", review = "", lesson = "", search = "", missingMaterials = false, includeArchived = false }: ListLifecycleTasksOptions = {}) {
  const target = asLifecycleTarget(normalizeTarget(targetInput));
  const tasks = createScannerTaskRepository(target).list({
    includeArchived,
    state,
    module: moduleKey ? normalizeHarnessModuleKey(moduleKey) : "",
    queue,
    preset,
    review,
    lesson,
    missingMaterials,
    search,
  }) as LifecycleTask[];
  let modules: Array<Record<string, unknown>> = [];
  try {
    const registry = readHarnessModules(target);
    modules = Object.entries(registry.items || {}).map(([key, module]) => ({ key, ...module }));
  } catch {
    modules = [];
  }
  return { tasks, modules };
}
