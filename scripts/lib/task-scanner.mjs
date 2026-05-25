import fs from "node:fs";
import path from "node:path";
import {
  visualMapFile,
  legacyVisualRoadmapFile,
  lessonCandidatesFile,
  longRunningTaskContractFile,
  toPosix,
  readFileSafe,
  readJsonSafe,
  walkFiles,
  titleFromMarkdown,
} from "./core-shared.mjs";
import {
  tableAfterHeading,
  firstColumn,
  splitList,
  splitDependencies,
} from "./markdown-utils.mjs";
import {
  normalizePhaseActor,
  normalizePhaseKind,
  phaseCompletionAverage,
} from "./phase-kind.mjs";
import {
  parseScaffoldProvenance,
  scaffoldProvenanceMaterialIssues,
} from "./task-scaffold-provenance.mjs";
import {
  parseTaskBudget,
  parseTaskContractInfo,
  parseTaskMetadata,
  parseTaskStateInfo,
} from "./task-metadata.mjs";
import {
  isLessonCandidateDecisionComplete,
  parseLessonCandidateStatus,
  validateLessonCandidateDetailArtifacts,
} from "./task-lesson-candidates.mjs";
import {
  assessMaterialsReadiness,
  collectReviewRisks,
  collectStateConflicts,
  deriveLifecycleState,
  deriveReviewQueueState,
  deriveTaskQueues,
  isBlockingReviewRisk,
  parseAgentReviewSubmission,
  parseReviewConfirmation,
  parseTaskIdentity,
  parseTaskTombstone,
  requiresReviewMaterials,
  taskReviewStatus,
  taskScannerVersion,
} from "./task-review-model.mjs";
export {
  parseTaskBudget,
  parseTaskContractInfo,
  parseTaskMetadata,
  parseTaskState,
  parseTaskStateInfo,
} from "./task-metadata.mjs";
export {
  collectReviewRisks,
  deriveLifecycleState,
  deriveReviewQueueState,
  isBlockingReviewRisk,
  parseAgentReviewSubmission,
  parseReviewConfirmation,
  parseTaskIdentity,
  parseTaskTombstone,
  requiresReviewMaterials,
  taskReviewStatus,
  taskScannerVersion,
} from "./task-review-model.mjs";
export {
  parseScaffoldProvenance,
  scaffoldProvenanceMaterialIssues,
} from "./task-scaffold-provenance.mjs";
export {
  allowedLessonCandidateRowStatuses,
  allowedLessonCandidateTaskStatuses,
  isLessonCandidateDecisionComplete,
  parseLessonCandidateStatus,
  reviewCompleteLessonCandidateStatuses,
} from "./task-lesson-candidates.mjs";

export function parsePhases(taskPlanContent) {
  const { header, rows } = tableAfterHeading(taskPlanContent, /^Phase ID$/i);
  if (rows.length === 0) return [];
  const indexes = {
    id: firstColumn(header, ["Phase ID", "阶段 ID"]),
    kind: firstColumn(header, ["Kind", "阶段类型", "类型"]),
    dependsOn: firstColumn(header, ["Depends On", "依赖"]),
    state: firstColumn(header, ["State", "状态"]),
    completion: firstColumn(header, ["Completion", "完成度"]),
    output: firstColumn(header, ["Output", "产出"]),
    requiredEvidence: firstColumn(header, ["Required Evidence", "必要证据"]),
    exitCommand: firstColumn(header, ["Exit Command", "出口命令", "退出命令"]),
    actor: firstColumn(header, ["Actor", "执行者", "角色"]),
    evidenceStatus: firstColumn(header, ["Evidence Status", "证据状态"]),
    blockingRisk: firstColumn(header, ["Blocking Risk", "阻塞风险"]),
    owner: firstColumn(header, ["Owner / Handoff", "负责人 / 交接"]),
  };
  return rows.map((row) => ({
    id: row[indexes.id] || "",
    kind: normalizePhaseKind(row[indexes.kind]),
    dependsOn: splitDependencies(row[indexes.dependsOn] || ""),
    state: row[indexes.state] || "planned",
    completion: Number.parseInt(String(row[indexes.completion] || "0").replace("%", ""), 10) || 0,
    output: row[indexes.output] || "",
    requiredEvidence: splitList(row[indexes.requiredEvidence] || ""),
    exitCommand: row[indexes.exitCommand] || "",
    actor: normalizePhaseActor(row[indexes.actor]),
    evidenceStatus: row[indexes.evidenceStatus] || "missing",
    blockingRisk: row[indexes.blockingRisk] || "",
    owner: row[indexes.owner] || "",
  }));
}

export function readTaskContractFile(taskDir, fileName, legacyContent = "") {
  const filePath = path.join(taskDir, fileName);
  const content = readFileSafe(filePath);
  if (content.trim()) return { path: filePath, content, source: "standalone" };
  return { path: filePath, content: legacyContent, source: legacyContent.trim() ? "legacy" : "missing" };
}

export function readVisualMapContractFile(taskDir, legacyContent = "") {
  const canonicalPath = path.join(taskDir, visualMapFile);
  const canonical = readFileSafe(canonicalPath);
  if (canonical.trim()) return { path: canonicalPath, content: canonical, source: "canonical", status: "present" };
  const legacyPath = path.join(taskDir, legacyVisualRoadmapFile);
  const legacy = readFileSafe(legacyPath);
  if (legacy.trim()) return { path: legacyPath, content: legacy, source: "legacy", status: "legacy-only" };
  return {
    path: canonicalPath,
    content: legacyContent,
    source: legacyContent.trim() ? "legacy" : "missing",
    status: legacyContent.trim() ? "legacy-only" : "missing",
  };
}

export function isActiveTaskState(state) {
  return ["active", "planned", "not_started", "in_progress", "review", "blocked", "reopened", "current-evidence"].includes(state);
}

export function listTaskPlanPaths(target) {
  const taskRoots = [
    path.join(target.docsRoot, "09-PLANNING/TASKS"),
    path.join(target.docsRoot, "09-PLANNING/MODULES"),
  ];
  return taskRoots
    .flatMap(walkFiles)
    .filter((file) => file.endsWith("task_plan.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`));
}

export function taskIdForDirectory(target, taskDir) {
  return toPosix(path.relative(path.join(target.docsRoot, "09-PLANNING"), taskDir));
}

export function inferTaskClassification({ id, title, relative, explicitModule, legacyCandidate = false }) {
  if (explicitModule) {
    return {
      module: explicitModule,
      source: "explicit",
      bucket: "module",
    };
  }
  const text = `${id} ${title} ${relative}`.toLowerCase();
  const rules = [
    ["dashboard", /dashboard|visibility|cockpit|console|ui|frontend|view|页面|看板|驾驶舱/],
    ["migration", /migration|migrate|adoption|legacy|safe-adoption|迁移|历史|兼容/],
    ["task-lifecycle", /task|phase|lifecycle|planning|计划|任务|阶段/],
    ["review-quality", /review|finding|evidence|qa|test|regression|审查|证据|回归|测试/],
    ["release-docs", /docs-release|readme|guide|install|playbook|文档|安装|指南/],
    ["repo-governance", /git|ci|source-package|private|boundary|repo|branch|pr|仓库|边界/],
    ["automation-cli", /cli|command|script|harness\.mjs|自动化|命令/],
  ];
  const match = rules.find(([, pattern]) => pattern.test(text));
  return {
    module: match ? match[0] : legacyCandidate ? "legacy-unclassified" : "unclassified",
    source: match ? "inferred" : "fallback",
    bucket: legacyCandidate ? "legacy" : "current",
  };
}

export function assessBriefQuality(content, { source = "missing" } = {}) {
  const text = String(content || "").trim();
  const issues = [];
  if (source !== "standalone") issues.push("missing-standalone-brief");
  if (text.length < 120) issues.push("too-short");
  if (!/^##\s+/m.test(text)) issues.push("missing-sections");
  if (/\[(?:outcome|scope|risk|evidence|next|目标|范围|风险|证据|下一步)[^\]]*\]/i.test(text)) issues.push("unfilled-placeholder");
  return { status: issues.length ? "fail" : "pass", issues };
}

export function explicitVisualMapStatus(briefContent) {
  const match = String(briefContent || "").match(/^Visual Map Status:\s*(present|not-needed|missing|legacy-only)\s*$/im);
  return match ? match[1] : "";
}

export function taskMigrationClassification(state, visualMapStatus) {
  if (state === "unknown") return "unknown-needs-human";
  if (isActiveTaskState(state)) return "active";
  if (visualMapStatus === "present" || visualMapStatus === "legacy-only") return "historical-with-diagram";
  return "historical-no-map-needed";
}

export function requiresCanonicalVisualMap(task) {
  return ["active", "reopened", "current-evidence", "historical-with-diagram"].includes(task.migrationClassification);
}

export function taskCutoverCounters(tasks) {
  const legacyVisualOnlyCount = tasks.filter((task) => task.visualMapStatus === "legacy-only").length;
  const unknownClassificationCount = tasks.filter((task) => task.migrationClassification === "unknown-needs-human").length;
  const weakBriefCount = tasks.filter((task) => task.briefQuality?.status !== "pass").length;
  const visualMapRequiredCount = tasks.filter(requiresCanonicalVisualMap).length;
  const missingCanonicalVisualMapCount = tasks.filter((task) => requiresCanonicalVisualMap(task) && task.visualMapSource !== "canonical").length;
  return {
    legacyVisualOnlyCount,
    unknownClassificationCount,
    weakBriefCount,
    visualMapRequiredCount,
    missingCanonicalVisualMapCount,
  };
}

export function collectTasks(target, { requireGeneratedScaffoldProvenance = false, taskPlanPaths, closeoutContent } = {}) {
  const paths = taskPlanPaths || listTaskPlanPaths(target);
  const closeout = closeoutContent ?? readFileSafe(path.join(target.docsRoot, "10-WALKTHROUGH/Closeout-SSoT.md"));
  return paths.map((taskPlanPath) => {
    const taskDir = path.dirname(taskPlanPath);
    const taskPlan = readFileSafe(taskPlanPath);
    const brief = readTaskContractFile(taskDir, "brief.md", "");
    const executionStrategyPath = path.join(taskDir, "execution_strategy.md");
    const progressPath = path.join(taskDir, "progress.md");
    const reviewPath = path.join(taskDir, "review.md");
    const findingsPath = path.join(taskDir, "findings.md");
    const lessonCandidatesPath = path.join(taskDir, lessonCandidatesFile);
    const longRunningContractPath = path.join(taskDir, longRunningTaskContractFile);
    const visualMap = readVisualMapContractFile(taskDir, taskPlan);
    const progress = readFileSafe(progressPath);
    const review = readFileSafe(reviewPath);
    const parsedLessonCandidates = parseLessonCandidateStatus(readFileSafe(lessonCandidatesPath));
    const lessonDetailIssues = validateLessonCandidateDetailArtifacts(target, taskDir, parsedLessonCandidates);
    const lessonCandidates = lessonDetailIssues.length
      ? { ...parsedLessonCandidates, issues: [...parsedLessonCandidates.issues, ...lessonDetailIssues] }
      : parsedLessonCandidates;
    const phases = parsePhases(visualMap.content);
    const completion = phaseCompletionAverage(phases);
    const relative = toPosix(path.relative(target.projectRoot, taskDir));
    const id = taskIdForDirectory(target, taskDir);
    const identity = parseTaskIdentity(taskPlan, id);
    const tombstone = parseTaskTombstone(taskPlan);
    const title = titleFromMarkdown(brief.content || taskPlan, path.basename(taskDir));
    const stateInfo = parseTaskStateInfo(progress);
    const budget = parseTaskBudget(taskPlan);
    const metadata = parseTaskMetadata(taskPlan);
    const taskContract = parseTaskContractInfo(taskPlan);
    const scaffoldProvenance = parseScaffoldProvenance(brief.content, {
      required: requireGeneratedScaffoldProvenance && taskContract.generated,
    });
    const explicitModule = id.startsWith("MODULES/") ? id.split("/")[1] : null;
    const legacyCandidate = brief.source !== "standalone" || visualMap.status === "legacy-only" || !fs.existsSync(executionStrategyPath);
    const classification = inferTaskClassification({ id, title, relative, explicitModule, legacyCandidate });
    const briefVisualStatus = explicitVisualMapStatus(brief.content);
    const visualMapStatus = briefVisualStatus === "not-needed" && visualMap.status === "missing" ? "not-needed" : visualMap.status;
    const risks = collectReviewRisks(review);
    const reviewSubmission = parseAgentReviewSubmission(review, { taskKey: identity.taskKey });
    const reviewConfirmation = parseReviewConfirmation(review, {
      taskKey: identity.taskKey,
      projectRoot: target.projectRoot,
      taskDir,
      reviewPath,
      progressPath,
    });
    const reviewStatus = taskReviewStatus({ reviewContent: review, risks, confirmation: reviewConfirmation, submission: reviewSubmission });
    const closeoutInfo = taskCloseoutInfo(target, taskPlanPath, closeout);
    const effectiveCloseoutStatus = budget === "simple" && stateInfo.state === "done" && completion === 100
      ? "closed"
      : closeoutInfo.status;
    const lifecycleState = deriveLifecycleState({ state: stateInfo.state, reviewStatus, closeoutStatus: effectiveCloseoutStatus, budget });
    const materialReadiness = assessMaterialsReadiness({
      budget,
      taskDir,
      taskPlan,
      brief,
      visualMap,
      reviewSubmission,
      lessonCandidates,
      phases,
      longRunningContractPath,
      reviewSurfaceRequired: requiresReviewMaterials({
        state: stateInfo.state,
        lifecycleState,
        closeoutStatus: effectiveCloseoutStatus,
      }),
    });
    const materialIssues = [...materialReadiness.issues, ...scaffoldProvenanceMaterialIssues(target, taskDir, scaffoldProvenance)];
    const stateConflicts = collectStateConflicts({ state: stateInfo.state, reviewStatus, closeoutStatus: effectiveCloseoutStatus, lifecycleState, budget });
    const reviewQueueState = deriveReviewQueueState({
      state: stateInfo.state,
      lifecycleState,
      reviewStatus,
      closeoutStatus: effectiveCloseoutStatus,
      budget,
      walkthroughPath: closeoutInfo.walkthroughPath,
      lessonCandidateDecisionComplete: isLessonCandidateDecisionComplete(lessonCandidates),
      materialsReady: materialIssues.length === 0,
      deletionState: tombstone.deletionState,
    });
    const queueModel = deriveTaskQueues({
      id,
      title,
      state: stateInfo.state,
      budget,
      reviewStatus,
      reviewSubmission,
      reviewConfirmation,
      reviewQueueState,
      materialIssues,
      risks,
      stateConflicts,
      lessonCandidates,
      closeoutStatus: effectiveCloseoutStatus,
      tombstone,
      taskDir,
      target,
    });
    return {
      id,
      taskKey: identity.taskKey,
      currentPath: `TARGET:${relative}`,
      originalPath: `TARGET:${relative}`,
      aliases: [],
      identitySource: identity.identitySource,
      shortId: path.basename(taskDir),
      title,
      path: `TARGET:${relative}`,
      taskPlanPath: `TARGET:${toPosix(path.relative(target.projectRoot, taskPlanPath))}`,
      executionStrategyPath: `TARGET:${toPosix(path.relative(target.projectRoot, executionStrategyPath))}`,
      progressPath: `TARGET:${toPosix(path.relative(target.projectRoot, progressPath))}`,
      reviewPath: `TARGET:${toPosix(path.relative(target.projectRoot, reviewPath))}`,
      findingsPath: `TARGET:${toPosix(path.relative(target.projectRoot, findingsPath))}`,
      module: explicitModule,
      inferredModule: classification.module,
      classificationSource: classification.source,
      classificationBucket: classification.bucket,
      briefSource: brief.source,
      briefPath: `TARGET:${toPosix(path.relative(target.projectRoot, brief.path))}`,
      visualMapSource: visualMap.source,
      visualMapStatus,
      visualMapPath: `TARGET:${toPosix(path.relative(target.projectRoot, visualMap.path))}`,
      legacyVisualRoadmapPresent: fs.existsSync(path.join(taskDir, legacyVisualRoadmapFile)),
      briefQuality: assessBriefQuality(brief.content, { source: brief.source }),
      migrationClassification: taskMigrationClassification(stateInfo.state, visualMapStatus),
      roadmapSource: visualMap.source,
      state: stateInfo.state,
      budget,
      taskContractVersion: taskContract.version,
      taskContractGenerated: taskContract.generated,
      stateSource: stateInfo.source,
      stateRaw: stateInfo.raw,
      taskKind: metadata.kind,
      taskPreset: metadata.preset,
      presetVersion: metadata.presetVersion,
      migrationTargetLevel: metadata.migrationTargetLevel,
      migrationAchievedLevel: metadata.migrationAchievedLevel,
      evidenceBundle: formatEvidenceBundle(metadata.evidenceBundle),
      migrationSnapshot: collectMigrationSnapshot(target, metadata),
      scaffoldProvenance: scaffoldProvenance.summary,
      lifecycleState,
      reviewStatus,
      reviewSubmitted: Boolean(reviewSubmission?.submitted),
      reviewSubmission,
      reviewQueueState,
      reviewConfirmation,
      materialsReady: materialIssues.length === 0,
      materialIssues,
      taskQueues: queueModel.taskQueues,
      queueReasons: queueModel.queueReasons,
      repairPrompt: queueModel.repairPrompt,
      closeoutStatus: effectiveCloseoutStatus,
      walkthroughPath: closeoutInfo.walkthroughPath ? `TARGET:${closeoutInfo.walkthroughPath}` : "",
      lessonCandidatePath: fs.existsSync(lessonCandidatesPath)
        ? `TARGET:${toPosix(path.relative(target.projectRoot, lessonCandidatesPath))}`
        : "",
      lessonCandidateStatus: lessonCandidates.status,
      lessonCandidateReviewDecision: lessonCandidates.reviewDecision,
      lessonCandidatePromotionState: lessonCandidates.promotionState,
      lessonCandidateCloseoutToken: lessonCandidates.closeoutToken,
      lessonCandidateRowCount: lessonCandidates.rows.length,
      lessonCandidateRows: lessonCandidates.rows,
      lessonCandidateOpenCount: lessonCandidates.openCount,
      lessonCandidateIssues: lessonCandidates.issues,
      lessonCandidateDecisionComplete: isLessonCandidateDecisionComplete(lessonCandidates),
      longRunningContractPath: fs.existsSync(longRunningContractPath)
        ? `TARGET:${toPosix(path.relative(target.projectRoot, longRunningContractPath))}`
        : "",
      longRunningContractStatus: fs.existsSync(longRunningContractPath) ? "present" : "missing",
      deletionState: tombstone.deletionState,
      supersededBy: tombstone.supersededBy,
      supersedes: tombstone.supersedes,
      deleteReason: tombstone.deleteReason,
      hiddenByDefault: tombstone.hiddenByDefault,
      reopenEligible: tombstone.reopenEligible,
      archiveEligible: tombstone.archiveEligible,
      tombstoneSourcePath: tombstone.tombstoneSourcePath
        ? `TARGET:${toPosix(path.relative(target.projectRoot, path.join(taskDir, "task_plan.md")))}#Task Tombstone`
        : "",
      stateConflicts,
      completion,
      phases,
      risks,
      evidence: collectEvidence(progress),
      handoffs: collectHandoffs(progress, title),
      dependencies: [],
    };
  });
}

function collectMigrationSnapshot(target, metadata) {
  if (metadata.preset !== "legacy-migration") return null;
  const evidenceBundle = String(metadata.evidenceBundle || "").replace(/^TARGET:/, "").replace(/^\/+/, "");
  const bundlePath = evidenceBundle ? path.join(target.projectRoot, evidenceBundle) : "";
  const sessionPath = bundlePath ? path.join(bundlePath, "session.json") : "";
  const session = sessionPath && fs.existsSync(sessionPath) ? readJsonSafe(sessionPath, null) : null;
  const summary = session?.plan?.summary || {};
  return {
    targetLevel: metadata.migrationTargetLevel || "",
    achievedLevel: metadata.migrationAchievedLevel || "",
    evidenceBundle: evidenceBundle ? `TARGET:${evidenceBundle}` : "",
    evidencePresent: Boolean(bundlePath && fs.existsSync(bundlePath)),
    sessionPresent: Boolean(session),
    sessionResult: session?.result || "",
    normalStatus: session?.checks?.normal?.status || "",
    strictStatus: session?.checks?.strict?.status || "",
    strictDeferred: Boolean(session?.strictDeferred),
    warnings: Number(summary.warnings || 0),
    taskActions: Number(summary.taskActions || 0),
    reviewSchemaGaps: Number(summary.reviewSchemaGaps || 0),
    legacyReferenceGaps: Number(summary.legacyReferenceGaps || 0),
    legacyResiduals: Number(summary.legacyResiduals || 0),
    fullCutoverEligible: summary.fullCutoverEligible === true,
  };
}

function formatEvidenceBundle(value) {
  const normalized = String(value || "").replace(/^TARGET:/, "").replace(/^\/+/, "");
  return normalized ? `TARGET:${normalized}` : "";
}

function taskCloseoutInfo(target, taskPlanPath, closeout) {
  if (!closeout.trim()) return { status: "missing", walkthroughPath: "" };
  const docsRelative = `docs/${toPosix(path.relative(target.docsRoot, taskPlanPath))}`;
  const projectRelative = toPosix(path.relative(target.projectRoot, taskPlanPath));
  const line = closeout
    .split(/\r?\n/)
    .find((entry) => entry.includes(docsRelative) || entry.includes(projectRelative));
  if (!line) return { status: "missing", walkthroughPath: "" };
  const walkthroughPath = extractWalkthroughPath(target, line);
  const status = /\b(closed|complete|completed|done|skipped-with-reason|skipped|已关闭|已完成|跳过)\b/i.test(line) ? "closed" : "pending";
  return { status, walkthroughPath };
}

function extractWalkthroughPath(target, closeoutLine) {
  const matches = [...String(closeoutLine || "").matchAll(/`?((?:docs\/)?10-WALKTHROUGH\/[^`|\s]+\.md)`?/g)];
  const match = matches.find((entry) => !entry[1].endsWith("Closeout-SSoT.md") && !entry[1].includes("/_"));
  if (!match) return "";
  const projectRelative = match[1].startsWith("docs/") ? match[1] : `docs/${match[1]}`;
  if (!fs.existsSync(path.join(target.projectRoot, projectRelative))) return "";
  return projectRelative;
}

function collectHandoffs(progressContent, taskId) {
  if (!/Coordinator Handoff/i.test(progressContent) || !/pending-coordinator-pass/i.test(progressContent)) return [];
  return [{ id: `H-${taskId}`, from: "worker", to: "coordinator", state: "pending", summary: "Coordinator handoff pending" }];
}

function collectEvidence(progressContent) {
  const matches = [...progressContent.matchAll(/\b(command|diff|fixture|screenshot|review|report):((?:PUBLIC|PRIVATE|TARGET|EXTERNAL|URL):[^:\s|]+):([^\n|]+)/g)];
  return matches.map((match, index) => ({
    id: `E-${String(index + 1).padStart(3, "0")}`,
    type: match[1],
    path: match[2],
    status: "present",
    summary: match[3].trim(),
  }));
}
