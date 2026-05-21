import fs from "node:fs";
import path from "node:path";
import {
  repoRoot,
  visualMapFile,
  legacyVisualRoadmapFile,
  allowedTaskStates,
  allowedTaskBudgets,
  allowedPhaseStates,
  allowedEvidenceStatus,
  normalizeTarget,
  normalizeLocale,
  toPosix,
  readFileSafe,
  readBundledTemplate,
  localizedTemplateSource,
  todayDate,
  nowTimestamp,
  normalizeTaskId,
  renderTaskTemplate,
} from "./core-shared.mjs";
import { readCapabilityRegistry } from "./capability-registry.mjs";
import {
  collectTasks,
  collectReviewRisks,
  isBlockingReviewRisk,
  listTaskPlanPaths,
  parseTaskBudget,
  parseReviewConfirmation,
  taskIdForDirectory,
} from "./task-scanner.mjs";
import {
  getColumn,
  firstColumn,
  updateMarkdownTableRow,
} from "./markdown-utils.mjs";

function taskTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["brief.md", "templates/planning/brief.md"],
    ["task_plan.md", "templates/planning/task_plan.md"],
    ["execution_strategy.md", "templates/planning/execution_strategy.md"],
    [visualMapFile, "templates/planning/visual_map.md"],
    ["findings.md", "templates/planning/findings.md"],
    ["lesson_candidates.md", "templates/planning/lesson_candidates.md"],
    ["progress.md", "templates/planning/progress.md"],
    ["review.md", "templates/planning/review.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function simpleTaskTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["brief.md", "templates/planning/brief.md"],
    ["task_plan.md", "templates/planning/task_plan.md"],
    [visualMapFile, "templates/planning/visual_map.md"],
    ["progress.md", "templates/planning/progress.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function optionalTaskTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["references/INDEX.md", "templates/planning/optional/references/INDEX.md"],
    ["artifacts/INDEX.md", "templates/planning/optional/artifacts/INDEX.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function moduleTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["brief.md", "templates/planning/module_brief.md"],
    ["module_plan.md", "templates/planning/module_plan.md"],
    ["execution_strategy.md", "templates/planning/execution_strategy.md"],
    [visualMapFile, "templates/planning/visual_map.md"],
    ["session_prompt.md", "templates/planning/module_session_prompt.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function taskRoot(target, taskId, { moduleKey = "" } = {}) {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (moduleKey) return path.join(target.docsRoot, "09-PLANNING/MODULES", normalizeTaskId(moduleKey), normalizedTaskId);
  return path.join(target.docsRoot, "09-PLANNING/TASKS", normalizedTaskId);
}

function resolveTaskDirectory(target, taskRef) {
  const raw = String(taskRef || "").replace(/^docs\/09-PLANNING\//, "").replace(/^\/+/, "");
  if (!raw) throw new Error("Missing task id");
  const direct = raw.startsWith("TASKS/") || raw.startsWith("MODULES/") ? path.join(target.docsRoot, "09-PLANNING", raw) : "";
  if (direct && fs.existsSync(path.join(direct, "task_plan.md"))) return direct;
  const normalized = normalizeTaskId(raw);
  const candidates = listTaskPlanPaths(target)
    .map((taskPlanPath) => path.dirname(taskPlanPath))
    .filter((taskDir) => {
      const id = taskIdForDirectory(target, taskDir);
      return id === raw || id.endsWith(`/${raw}`) || path.basename(taskDir) === normalized;
    });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const options = candidates.map((taskDir) => `- ${taskIdForDirectory(target, taskDir)}`).join("\n");
    throw new Error(`Ambiguous task reference: ${taskRef}\n${options}`);
  }
  const legacy = taskRoot(target, normalized);
  if (fs.existsSync(path.join(legacy, "task_plan.md"))) return legacy;
  throw new Error(`Task not found: ${taskRef}`);
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

function taskFilesForBudget({ budget, locale }) {
  if (budget === "simple") return simpleTaskTemplateFiles({ locale });
  if (budget === "complex") return [...taskTemplateFiles({ locale }), ...optionalTaskTemplateFiles({ locale })];
  return taskTemplateFiles({ locale });
}

function validateLifecycleTransition({ event, currentState, budget, reviewContent = "" }) {
  if (event === "task-review" && currentState !== "in_progress") {
    throw new Error(`task-review requires current state in_progress; current state is ${currentState || "unknown"}`);
  }
  if (event === "task-complete" && budget !== "simple" && currentState !== "review") {
    throw new Error(`task-complete for ${budget} tasks requires current state review. Run task-review first.`);
  }
  if (event === "task-complete" && budget !== "simple") {
    const blockingRisks = collectReviewRisks(reviewContent).filter(isBlockingReviewRisk);
    if (blockingRisks.length > 0) {
      const ids = blockingRisks.map((risk) => risk.id || risk.severity).join(", ");
      throw new Error(`Open blocking review findings must be closed before task-complete: ${ids}`);
    }
    if (!parseReviewConfirmation(reviewContent)?.confirmed) {
      throw new Error("Human review must be confirmed before task-complete. Run review-confirm first.");
    }
  }
}

function validateHumanReviewConfirmation({ task, budget }) {
  if (budget === "simple") return;
  const state = task?.state || "unknown";
  const lifecycle = task?.lifecycleState || "";
  if (state !== "review" && !["in_review", "review-blocked"].includes(lifecycle)) {
    throw new Error(`Human review confirmation requires current state review; current state is ${state}. Run task-review first.`);
  }
  if (!task?.walkthroughPath) {
    throw new Error("Human review confirmation requires a walkthrough linked from Closeout SSoT before review-confirm.");
  }
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

function appendProgressLog(content, { event, message, evidence, actor = "coordinator" }) {
  const timestamp = nowTimestamp();
  const safeMessage = String(message || event).replace(/\r?\n/g, " ").trim();
  const safeEvidence = String(evidence || "n/a").replace(/\r?\n/g, " ").trim();
  if (/^##\s*Log\s*$/im.test(content)) {
    return content.replace(
      /(^##\s*Log\s*$[\s\S]*?\| --- \| --- \| --- \| --- \| --- \|\n)/im,
      `$1| ${timestamp} | ${actor} | ${event}: ${safeMessage} | ${safeEvidence} | ${event === "task-complete" ? "done" : "continue"} |\n`,
    );
  }
  if (/^##\s*进度记录\s*$/im.test(content)) {
    return `${content.trimEnd()}\n\n### [${timestamp}] - ${event}\n\n- 做了什么：${safeMessage}\n- 验证结果：已记录\n- 下一步：${event === "task-complete" ? "完成" : "继续执行"}\n- 证据：${safeEvidence}\n`;
  }
  return `${content.trimEnd()}\n\n## Log\n\n| Time | Actor | Action | Evidence | Next |\n| --- | --- | --- | --- | --- |\n| ${timestamp} | ${actor} | ${event}: ${safeMessage} | ${safeEvidence} | ${event === "task-complete" ? "done" : "continue"} |\n`;
}

export function createTask(targetInput, taskId, { title = "", locale = "en-US", dryRun = false, moduleKey = "", budget = "standard" } = {}) {
  const target = normalizeTarget(targetInput);
  const normalizedTaskId = normalizeTaskId(taskId);
  if (!normalizedTaskId) throw new Error("Missing task id");
  const normalizedModuleKey = moduleKey ? normalizeTaskId(moduleKey) : "";
  const normalizedLocale = normalizeLocale(locale || readCapabilityRegistry(target).locale);
  const normalizedBudget = normalizeTaskBudgetInput(budget);
  const taskTitle = title || normalizedTaskId;
  const directory = taskRoot(target, normalizedTaskId, { moduleKey: normalizedModuleKey });
  if (fs.existsSync(directory)) throw new Error(`Task already exists: ${normalizedTaskId}`);
  const changes = [];
  if (normalizedModuleKey) {
    const moduleDirectory = path.dirname(directory);
    for (const [destination, source] of moduleTemplateFiles({ locale: normalizedLocale })) {
      const destinationPath = path.join(moduleDirectory, destination);
      if (fs.existsSync(destinationPath)) continue;
      const sourcePath = path.join(repoRoot, source);
      changes.push({
        destination: toPosix(path.relative(target.projectRoot, destinationPath)),
        source,
        action: dryRun ? "would-create" : "create",
      });
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(
        destinationPath,
        renderTaskTemplate(readBundledTemplate(source), {
          taskId: normalizedModuleKey,
          title: normalizedModuleKey,
          locale: normalizedLocale,
          budget: normalizedBudget,
        }),
      );
    }
  }
  const files = taskFilesForBudget({ budget: normalizedBudget, locale: normalizedLocale });
  for (const [destination, source] of files) {
    const destinationPath = path.join(directory, destination);
    const sourcePath = path.join(repoRoot, source);
    changes.push({
      destination: toPosix(path.relative(target.projectRoot, destinationPath)),
      source,
      action: dryRun ? "would-create" : "create",
    });
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(
      destinationPath,
      renderTaskTemplate(readBundledTemplate(source), {
        taskId: normalizedTaskId,
        title: taskTitle,
        locale: normalizedLocale,
        budget: normalizedBudget,
      }),
    );
  }
  return {
    dryRun,
    task: {
      id: taskIdForDirectory(target, directory),
      shortId: normalizedTaskId,
      title: taskTitle,
      module: normalizedModuleKey || null,
      path: `TARGET:${toPosix(path.relative(target.projectRoot, directory))}`,
      locale: normalizedLocale,
      budget: normalizedBudget,
    },
    changes,
  };
}

export function updateTaskLifecycle(targetInput, taskId, { event = "task-log", state = "", message = "", evidence = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const taskDir = resolveTaskDirectory(target, taskId);
  const progressPath = path.join(taskDir, "progress.md");
  const registry = readCapabilityRegistry(target);
  const normalizedState = state ? String(state).toLowerCase().replaceAll("-", "_") : "";
  if (normalizedState && !allowedTaskStates.has(normalizedState)) throw new Error(`Invalid task state: ${state}`);
  const currentTask = findTaskByDirectory(target, taskDir);
  const budget = parseTaskBudget(readFileSafe(path.join(taskDir, "task_plan.md")));
  validateLifecycleTransition({
    event,
    currentState: currentTask?.state || "unknown",
    budget,
    reviewContent: readFileSafe(path.join(taskDir, "review.md")),
  });
  let content = readFileSafe(progressPath);
  if (normalizedState) content = updateProgressState(content, normalizedState, registry.locale);
  content = appendProgressLog(content, { event, message, evidence });
  fs.writeFileSync(progressPath, content.endsWith("\n") ? content : `${content}\n`);
  return {
    event,
    task: findTaskByDirectory(target, taskDir) || { id: taskIdForDirectory(target, taskDir), state: normalizedState || "unknown" },
  };
}

export function confirmTaskReview(targetInput, taskId, { reviewer = "Human Reviewer", message = "", confirmText = "", evidence = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const taskDir = resolveTaskDirectory(target, taskId);
  assertTaskDirectoryInsidePlanning(target, taskDir);
  const canonicalTaskId = taskIdForDirectory(target, taskDir);
  const shortId = path.basename(taskDir);
  if (confirmText && ![shortId, canonicalTaskId].includes(confirmText)) {
    throw new Error(`Review confirmation text must match task id: ${shortId}`);
  }
  if (!confirmText) throw new Error(`Missing review confirmation text: ${shortId}`);

  const reviewPath = path.join(taskDir, "review.md");
  const progressPath = path.join(taskDir, "progress.md");
  const reviewContent = readFileSafe(reviewPath);
  const blockingRisks = collectReviewRisks(reviewContent).filter(isBlockingReviewRisk);
  if (blockingRisks.length > 0) {
    const ids = blockingRisks.map((risk) => risk.id || risk.severity).join(", ");
    throw new Error(`Open blocking review findings must be closed before confirmation: ${ids}`);
  }
  validateHumanReviewConfirmation({
    task: findTaskByDirectory(target, taskDir),
    budget: parseTaskBudget(readFileSafe(path.join(taskDir, "task_plan.md"))),
  });

  const timestamp = nowTimestamp();
  const safeReviewer = markdownCell(reviewer || "Human Reviewer");
  const safeMessage = markdownCell(message || "Human review confirmed");
  const safeEvidence = markdownCell(evidence || `TARGET:docs/09-PLANNING/${canonicalTaskId}/review.md`);
  const confirmationBlock = [
    "## Human Review Confirmation",
    "",
    `Reviewer: ${safeReviewer}`,
    "",
    "| Confirmed At | Reviewer | Message | Evidence |",
    "| --- | --- | --- | --- |",
    `| ${timestamp} | ${safeReviewer} | ${safeMessage} | ${safeEvidence} |`,
    "",
  ].join("\n");
  const nextReview = replaceReviewConfirmation(reviewContent, confirmationBlock);
  fs.writeFileSync(reviewPath, nextReview.endsWith("\n") ? nextReview : `${nextReview}\n`);

  let progressContent = readFileSafe(progressPath);
  progressContent = appendProgressLog(progressContent, {
    event: "review-confirm",
    message: message || `Human review confirmed by ${reviewer}`,
    evidence: evidence || `TARGET:docs/09-PLANNING/${canonicalTaskId}/review.md`,
    actor: reviewer || "Human Reviewer",
  });
  fs.writeFileSync(progressPath, progressContent.endsWith("\n") ? progressContent : `${progressContent}\n`);

  return {
    event: "review-confirm",
    task: findTaskByDirectory(target, taskDir) || { id: canonicalTaskId, reviewStatus: "confirmed" },
  };
}

function assertTaskDirectoryInsidePlanning(target, taskDir) {
  const realTaskDir = fs.realpathSync(taskDir);
  const allowedRoots = [
    path.join(target.docsRoot, "09-PLANNING/TASKS"),
    path.join(target.docsRoot, "09-PLANNING/MODULES"),
  ].filter(fs.existsSync).map((root) => fs.realpathSync(root));
  if (!allowedRoots.some((root) => realTaskDir === root || realTaskDir.startsWith(`${root}${path.sep}`))) {
    throw new Error(`Task directory outside planning root: ${taskIdForDirectory(target, taskDir)}`);
  }
}

function markdownCell(value) {
  return String(value || "")
    .replace(/\r?\n/g, " ")
    .replaceAll("|", "\\|")
    .trim();
}

function replaceReviewConfirmation(content, block) {
  const trimmed = String(content || "").trimEnd();
  if (/^##\s*(?:Human Review Confirmation|人工审查确认)\s*$/im.test(trimmed)) {
    return trimmed.replace(/^##\s*(?:Human Review Confirmation|人工审查确认)\s*$[\s\S]*?(?=^##\s+|\s*$)/im, block.trimEnd());
  }
  return `${trimmed}\n\n${block}`;
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
  content = phaseUpdate.content;
  fs.writeFileSync(visualMapPath, content);
  return { event: "task-phase", task: findTaskByDirectory(target, taskDir), phaseId };
}

export function updateModuleStep(targetInput, moduleKey, stepId, { state = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const normalizedModuleKey = normalizeTaskId(moduleKey);
  const normalizedState = String(state || "done").toLowerCase().replaceAll("_", "-");
  if (!["planned", "in-progress", "done", "blocked", "superseded"].includes(normalizedState)) throw new Error(`Invalid module step state: ${state}`);
  const modulePlanPath = path.join(target.docsRoot, "09-PLANNING/MODULES", normalizedModuleKey, "module_plan.md");
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
  content = stepUpdate.content;
  fs.writeFileSync(modulePlanPath, content);

  const registryPath = path.join(target.docsRoot, "09-PLANNING/Module-Registry.md");
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
  return { event: "module-step", moduleKey: normalizedModuleKey, stepId, state: normalizedState };
}

export function listLifecycleTasks(targetInput, { state = "", moduleKey = "" } = {}) {
  const target = normalizeTarget(targetInput);
  let tasks = collectTasks(target);
  if (state) tasks = tasks.filter((task) => task.state === String(state).toLowerCase().replaceAll("-", "_"));
  if (moduleKey) tasks = tasks.filter((task) => task.module === normalizeTaskId(moduleKey));
  return { tasks };
}
