import fs from "node:fs";
import path from "node:path";
import {
  legacyVisualRoadmapFile,
  lessonCandidatesFile,
  longRunningTaskContractFile,
  toPosix,
  readFileSafe,
  readJsonSafe,
  walkFiles,
  isArchivedHarnessPath,
  titleFromMarkdown,
} from "./core-shared.mjs";
import {
  phaseCompletionAverage,
} from "./phase-kind.mjs";
import {
  legacyAuditIssues,
  parseTaskAuditMetadata,
  scaffoldProvenanceSummaryFromTaskAudit,
  taskAuditMaterialIssues,
} from "./task-audit-metadata.mjs";
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
import { collectUneditedTemplateMaterialIssues } from "./task-template-materials.mjs";
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
import { attachTaskSemanticProjection } from "./task-semantic-projection.mjs";
import { invalidTaskStateMaterialIssues } from "./task-state-materials.mjs";
import {
  parsePhases,
} from "./task-visual-map-contract.mjs";
import {
  provenanceTaskDirectories,
  readContractFileFromTaskDirectories,
  readFileFromTaskDirectories,
  readVisualMapFromTaskDirectories,
  reviewAuditProvenanceProjection,
} from "./task-review-provenance.mjs";
import {
  resolveHarnessPaths,
  safeAdoptionCapability,
  taskIdFromDirectory,
  taskLocalWalkthrough,
} from "./harness-paths.mjs";
import { archiveTaskRoots, taskIdFromArchiveStoragePath } from "./task-archive-storage.mjs";
import { isExcludedTaskPlanPath } from "./task-discovery-contract.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";
import type {
  BriefQuality,
  CloseoutInfo,
  CollectTasksOptions,
  EvidenceRef,
  HandoffRef,
  LessonCandidateStatus,
  MigrationSnapshot,
  TaskClassification,
  TaskPhase,
  TaskScannerTarget,
} from "./types/task-scanner.js";

function asLessonCandidateStatus(value: unknown): LessonCandidateStatus {
  const candidate = isRecord(value) ? value : {};
  const rows = Array.isArray(candidate.rows) ? candidate.rows.filter(isRecord).map((row) => Object.fromEntries(Object.entries(row).map(([key, item]) => [key, String(item || "")]))) : [];
  const issues = Array.isArray(candidate.issues) ? candidate.issues.map((item) => String(item)) : [];
  return {
    status: String(candidate.status || ""),
    declaredStatus: candidate.declaredStatus === undefined ? undefined : String(candidate.declaredStatus || ""),
    schemaVersion: candidate.schemaVersion === undefined ? undefined : String(candidate.schemaVersion || ""),
    reviewDecision: String(candidate.reviewDecision || ""),
    promotionState: String(candidate.promotionState || ""),
    closeoutToken: String(candidate.closeoutToken || ""),
    rows,
    openCount: Number(candidate.openCount || 0),
    issues,
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function nestedRecord(value: unknown, key: string): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const nested = value[key];
  return isRecord(nested) ? nested : {};
}
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
export { parseTaskAuditMetadata } from "./task-audit-metadata.mjs";
export {
  allowedLessonCandidateRowStatuses,
  allowedLessonCandidateTaskStatuses,
  isLessonCandidateDecisionComplete,
  parseLessonCandidateStatus,
  reviewCompleteLessonCandidateStatuses,
} from "./task-lesson-candidates.mjs";

export { parsePhases, readTaskContractFile, readVisualMapContractFile } from "./task-visual-map-contract.mjs";

export function isActiveTaskState(state: string): boolean { return ["active", "planned", "not_started", "in_progress", "review", "blocked", "reopened", "current-evidence"].includes(state); }

export function listTaskPlanPaths(target: TaskScannerTarget, { includeArchived = false }: { includeArchived?: boolean } = {}): string[] {
  const harnessPaths = (target.harness || resolveHarnessPaths(target)) as ResolvedHarnessPaths;
  const activePaths = harnessPaths.taskRoots
    .flatMap((root) => walkFiles(root))
    .filter((file) => file.endsWith("task_plan.md"))
    .filter((file) => !isExcludedTaskPlanPath(file, harnessPaths))
    .filter((file) => !isArchivedHarnessPath(file));
  if (!includeArchived) return activePaths;
  return [...activePaths, ...archiveTaskRoots(harnessPaths).flatMap((root) => walkFiles(root)).filter((file) => file.endsWith("task_plan.md"))].sort();
}

export function taskIdForDirectory(target: TaskScannerTarget, taskDir: string): string { return taskIdFromDirectory((target.harness || resolveHarnessPaths(target)) as ResolvedHarnessPaths, taskDir); }

export function inferTaskClassification({ id, title, relative, explicitModule, legacyCandidate = false }: {
  id: string;
  title: string;
  relative: string;
  explicitModule: string | null;
  legacyCandidate?: boolean;
}): TaskClassification {
  if (explicitModule) {
    return {
      module: explicitModule,
      source: "explicit",
      bucket: "module",
    };
  }
  if (id.startsWith("TASKS/")) {
    return {
      module: "base",
      source: "structure",
      bucket: legacyCandidate ? "legacy" : "current",
    };
  }
  const text = `${id} ${title} ${relative}`.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["dashboard", /dashboard|visibility|cockpit|console|ui|frontend|view|页面|看板|驾驶舱/],
    ["migration", new RegExp(`migration|migrate|adoption|legacy|${escapeRegExp(safeAdoptionCapability)}|迁移|历史|兼容`)],
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

function escapeRegExp(value: unknown): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assessBriefQuality(content: unknown, { source = "missing" }: { source?: string } = {}): BriefQuality {
  const text = String(content || "").trim();
  const issues: string[] = [];
  if (source !== "standalone") issues.push("missing-standalone-brief");
  if (text.length < 120) issues.push("too-short");
  if (!/^##\s+/m.test(text)) issues.push("missing-sections");
  if (/\[(?:outcome|scope|risk|evidence|next|目标|范围|风险|证据|下一步)[^\]]*\]/i.test(text)) issues.push("unfilled-placeholder");
  return { status: issues.length ? "fail" : "pass", issues };
}

export function explicitVisualMapStatus(briefContent: unknown): "" | "present" | "not-needed" | "missing" | "legacy-only" {
  const match = String(briefContent || "").match(/^Visual Map Status:\s*(present|not-needed|missing|legacy-only)\s*$/im);
  return match ? match[1] as "present" | "not-needed" | "missing" | "legacy-only" : "";
}

export function taskMigrationClassification(state: string, visualMapStatus: string): string {
  if (state === "unknown") return "unknown-needs-human";
  if (isActiveTaskState(state)) return "active";
  if (visualMapStatus === "present" || visualMapStatus === "legacy-only") return "historical-with-diagram";
  return "historical-no-map-needed";
}

export function requiresCanonicalVisualMap(task: { migrationClassification: string }): boolean {
  return ["active", "reopened", "current-evidence", "historical-with-diagram"].includes(task.migrationClassification);
}

export function taskCutoverCounters(tasks: Array<{ visualMapStatus: string; migrationClassification: string; briefQuality?: BriefQuality; visualMapSource: string }>) {
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

export function collectTasks(target: TaskScannerTarget, { requireGeneratedScaffoldProvenance = false, includeArchived = false, taskPlanPaths, closeoutContent }: CollectTasksOptions = {}) {
  const harnessPaths = (target.harness || resolveHarnessPaths(target)) as ResolvedHarnessPaths;
  const paths = taskPlanPaths || listTaskPlanPaths(target, { includeArchived });
  const closeout = closeoutContent ?? (harnessPaths.version === 2 ? "" : readFileSafe(harnessPaths.legacy.closeoutPath));
  return paths.map((taskPlanPath) => {
    const taskDir = path.dirname(taskPlanPath);
    const taskPlan = readFileSafe(taskPlanPath);
    const directoryId = taskIdForDirectory(target, taskDir);
    const id = taskIdFromArchiveStoragePath(target.projectRoot, taskDir) || directoryId;
    const indexPath = path.join(taskDir, "INDEX.md");
    const indexContent = readFileSafe(indexPath);
    const identity = parseTaskIdentity(taskPlan, id);
    const tombstone = parseTaskTombstone(taskPlan);
    const reviewAuditProvenance = reviewAuditProvenanceProjection(target, identity.taskKey, {
      currentIndexPath: indexPath,
      currentTaskDir: taskDir,
      deletionState: tombstone.deletionState,
    });
    const materialTaskDirs = provenanceTaskDirectories(target, reviewAuditProvenance, taskDir);
    const brief = readContractFileFromTaskDirectories(materialTaskDirs, "brief.md", "");
    const executionStrategyPath = path.join(taskDir, "execution_strategy.md");
    const progressPath = path.join(taskDir, "progress.md");
    const reviewPath = path.join(taskDir, "review.md");
    const findingsPath = path.join(taskDir, "findings.md");
    const lessonCandidatesPath = path.join(taskDir, lessonCandidatesFile);
    const longRunningContractPath = path.join(taskDir, longRunningTaskContractFile);
    const visualMap = readVisualMapFromTaskDirectories(materialTaskDirs, taskPlan);
    const progress = readFileFromTaskDirectories(materialTaskDirs, "progress.md");
    const review = readFileFromTaskDirectories(materialTaskDirs, "review.md");
    const parsedLessonCandidates = asLessonCandidateStatus(parseLessonCandidateStatus(readFileFromTaskDirectories(materialTaskDirs, lessonCandidatesFile)));
    const lessonDetailIssues = validateLessonCandidateDetailArtifacts(target, taskDir, parsedLessonCandidates);
    const lessonCandidates = lessonDetailIssues.length
      ? { ...parsedLessonCandidates, issues: [...parsedLessonCandidates.issues, ...lessonDetailIssues] }
      : parsedLessonCandidates;
    const phases = parsePhases(visualMap.content);
    const completion = phaseCompletionAverage(phases);
    const relative = toPosix(path.relative(target.projectRoot, taskDir));
    const title = titleFromMarkdown(brief.content || taskPlan, path.basename(taskDir));
    const stateInfo = parseTaskStateInfo(progress);
    const budget = parseTaskBudget(taskPlan);
    const metadata = parseTaskMetadata(taskPlan);
    const taskContract = parseTaskContractInfo(taskPlan);
    const taskAudit = parseTaskAuditMetadata(indexContent, {
      required: requireGeneratedScaffoldProvenance && taskContract.generated,
    });
    const scaffoldProvenance = { summary: scaffoldProvenanceSummaryFromTaskAudit(taskAudit) };
    const explicitModule = id.startsWith("MODULES/") ? id.split("/")[1] ?? null : null;
    const legacyCandidate = brief.source !== "standalone" || visualMap.status === "legacy-only" || !fs.existsSync(executionStrategyPath);
    const classification = inferTaskClassification({ id, title, relative, explicitModule, legacyCandidate });
    const briefVisualStatus = explicitVisualMapStatus(brief.content);
    const visualMapStatus = briefVisualStatus === "not-needed" && visualMap.status === "missing" ? "not-needed" : visualMap.status;
    const risks = collectReviewRisks(review);
    const reviewSubmission = parseAgentReviewSubmission(review, { taskKey: identity.taskKey });
    const reviewConfirmation = parseReviewConfirmation(review, {
      taskKey: identity.taskKey,
      taskAudit,
      projectRoot: target.projectRoot,
      taskDir,
      indexPath,
      reviewPath,
      progressPath,
      reviewAuditProvenance,
    });
    const reviewStatus = taskReviewStatus({ reviewContent: review, risks, confirmation: reviewConfirmation, submission: reviewSubmission });
    const closeoutInfo = taskCloseoutInfo(target, taskPlanPath, closeout);
    const effectiveCloseoutStatus = budget === "simple" && stateInfo.state === "done" && completion === 100
      ? "closed"
      : closeoutInfo.status;
    const lifecycleState = deriveLifecycleState({ state: stateInfo.state, reviewStatus, closeoutStatus: effectiveCloseoutStatus, budget, lessonCandidates, reviewConfirmation });
    const reviewSurfaceRequired = requiresReviewMaterials({
      state: stateInfo.state,
      lifecycleState,
      closeoutStatus: effectiveCloseoutStatus,
    });
    const materialReadiness = assessMaterialsReadiness({
      budget,
      taskDir,
      brief,
      visualMap,
      reviewSubmission,
      lessonCandidates,
      phases,
      longRunningContractPath,
      reviewSurfaceRequired,
    });
    const templateMaterialIssues = reviewSurfaceRequired
      ? collectUneditedTemplateMaterialIssues(target, taskDir, {
        briefContent: brief.content,
        taskPlanContent: taskPlan,
        executionStrategyContent: readFileFromTaskDirectories(materialTaskDirs, "execution_strategy.md") || readFileSafe(executionStrategyPath),
        visualMapContent: visualMap.content,
        progressContent: progress,
        findingsContent: readFileFromTaskDirectories(materialTaskDirs, "findings.md") || readFileSafe(findingsPath),
        reviewContent: review,
        lessonCandidatesContent: readFileFromTaskDirectories(materialTaskDirs, lessonCandidatesFile) || readFileSafe(lessonCandidatesPath),
        walkthroughPath: closeoutInfo.walkthroughPath,
        includeWalkthrough: Boolean(reviewSubmission?.submitted || reviewConfirmation?.confirmed || effectiveCloseoutStatus === "closed"),
        humanReviewConfirmed: taskAudit.summary.humanReviewStatus === "confirmed",
      })
      : [];
    const materialIssues = [
      ...invalidTaskStateMaterialIssues(target, taskDir, stateInfo),
      ...materialReadiness.issues,
      ...templateMaterialIssues,
      ...taskAuditMaterialIssues(target, taskDir, taskAudit),
      ...legacyAuditIssues(target, taskDir, { briefContent: brief.content, reviewContent: review }),
    ];
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
    return attachTaskSemanticProjection({
      id,
      taskKey: identity.taskKey,
      currentPath: `TARGET:${relative}`,
      originalPath: `TARGET:${relative}`,
      aliases: [],
      identitySource: identity.identitySource,
      shortId: id.split("/").at(-1) || path.basename(taskDir),
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
      taskAudit: taskAudit.summary,
      lifecycleState,
      reviewStatus,
      reviewSubmitted: Boolean(reviewSubmission?.submitted),
      reviewSubmission,
      reviewQueueState,
      reviewConfirmation,
      reviewAuditProvenance,
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
      archiveMetadata: tombstone.archiveMetadata || {},
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
    });
  });
}

function collectMigrationSnapshot(target: TaskScannerTarget, metadata: { preset: string; evidenceBundle: string; migrationTargetLevel: string; migrationAchievedLevel: string }): MigrationSnapshot | null {
  if (metadata.preset !== "legacy-migration") return null;
  const evidenceBundle = String(metadata.evidenceBundle || "").replace(/^TARGET:/, "").replace(/^\/+/, "");
  const bundlePath = evidenceBundle ? path.join(target.projectRoot, evidenceBundle) : "";
  const sessionPath = bundlePath ? path.join(bundlePath, "session.json") : "";
  const session = sessionPath && fs.existsSync(sessionPath) ? readJsonSafe(sessionPath, null) : null;
  const plan = nestedRecord(session, "plan");
  const checks = nestedRecord(session, "checks");
  const normal = nestedRecord(checks, "normal");
  const strict = nestedRecord(checks, "strict");
  const summary = nestedRecord(plan, "summary");
  return {
    targetLevel: metadata.migrationTargetLevel || "",
    achievedLevel: metadata.migrationAchievedLevel || "",
    evidenceBundle: evidenceBundle ? `TARGET:${evidenceBundle}` : "",
    evidencePresent: Boolean(bundlePath && fs.existsSync(bundlePath)),
    sessionPresent: Boolean(session),
    sessionResult: isRecord(session) ? String(session.result || "") : "",
    normalStatus: String(normal.status || ""),
    strictStatus: String(strict.status || ""),
    strictDeferred: isRecord(session) ? Boolean(session.strictDeferred) : false,
    warnings: Number(summary.warnings || 0),
    taskActions: Number(summary.taskActions || 0),
    reviewSchemaGaps: Number(summary.reviewSchemaGaps || 0),
    legacyReferenceGaps: Number(summary.legacyReferenceGaps || 0),
    legacyResiduals: Number(summary.legacyResiduals || 0),
    fullCutoverEligible: summary.fullCutoverEligible === true,
  };
}

function formatEvidenceBundle(value: unknown): string {
  const normalized = String(value || "").replace(/^TARGET:/, "").replace(/^\/+/, "");
  return normalized ? `TARGET:${normalized}` : "";
}

function taskCloseoutInfo(target: TaskScannerTarget, taskPlanPath: string, closeout: string): CloseoutInfo {
  const localWalkthrough = taskLocalWalkthrough((target.harness || resolveHarnessPaths(target)) as ResolvedHarnessPaths, path.dirname(taskPlanPath));
  if (localWalkthrough) {
    const content = readFileSafe(path.join(target.projectRoot, localWalkthrough));
    const status = /^Closeout Status\s*:\s*(closed|complete|completed|done|已关闭|已完成)\s*$/im.test(content)
      ? "closed"
      : "pending";
    return { status, walkthroughPath: localWalkthrough };
  }
  if (!closeout.trim()) return { status: "missing", walkthroughPath: "" };
  const docsRelative = `docs/${toPosix(path.relative(target.docsRoot || path.join(target.projectRoot, "docs"), taskPlanPath))}`;
  const projectRelative = toPosix(path.relative(target.projectRoot, taskPlanPath));
  const line = closeout
    .split(/\r?\n/)
    .find((entry) => entry.includes(docsRelative) || entry.includes(projectRelative));
  if (!line) return { status: "missing", walkthroughPath: "" };
  const walkthroughPath = extractWalkthroughPath(target, line);
  const status = /\b(closed|complete|completed|done|skipped-with-reason|skipped|已关闭|已完成|跳过)\b/i.test(line) ? "closed" : "pending";
  return { status, walkthroughPath };
}

function extractWalkthroughPath(target: TaskScannerTarget, closeoutLine: string): string {
  const matches = [...String(closeoutLine || "").matchAll(/`?((?:docs\/)?10-WALKTHROUGH\/[^`|\s]+\.md)`?/g)];
  const match = matches.find((entry) => !entry[1].endsWith("Closeout-SSoT.md") && !entry[1].includes("/_"));
  if (!match) return "";
  const projectRelative = match[1].startsWith("docs/") ? match[1] : `docs/${match[1]}`;
  if (!fs.existsSync(path.join(target.projectRoot, projectRelative))) return "";
  return projectRelative;
}

function collectHandoffs(progressContent: string, taskId: string): HandoffRef[] {
  if (!/Coordinator Handoff/i.test(progressContent) || !/pending-coordinator-pass/i.test(progressContent)) return [];
  return [{ id: `H-${taskId}`, from: "worker", to: "coordinator", state: "pending", summary: "Coordinator handoff pending" }];
}

function collectEvidence(progressContent: string): EvidenceRef[] {
  const matches = [...progressContent.matchAll(/\b(command|diff|fixture|screenshot|review|report):((?:PUBLIC|PRIVATE|TARGET|EXTERNAL|URL):[^:\s|]+):([^\n|]+)/g)];
  return matches.map((match, index) => ({
    id: `E-${String(index + 1).padStart(3, "0")}`,
    type: match[1],
    path: match[2],
    status: "present",
    summary: match[3].trim(),
  }));
}
