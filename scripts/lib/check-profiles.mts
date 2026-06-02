import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  repoRoot,
  bundledCheckScript,
  visualMapFile,
  legacyVisualRoadmapFile,
  allowedReviewDispositions,
  allowedTaskStateValues,
  allowedZhTaskStateValues,
  allowedPhaseStates,
  allowedEvidenceStatus,
  normalizeTarget,
  toPosix,
  readFileSafe,
  walkFiles,
  isArchivedHarnessPath,
} from "./core-shared.mjs";
import {
  tableAfterHeading,
  getColumn,
  getColumnAny,
  splitList,
  firstColumn,
  contentHasAny,
} from "./markdown-utils.mjs";
import { validateCapabilities } from "./capability-registry.mjs";
import { readPresetPackage } from "./preset-registry.mjs";
import { validateRegularTaskPresetContract } from "./task-preset-contract-drift.mjs";
import { parseTaskBudget } from "./task-metadata.mjs";
import { createScannerTaskRepository, parsePhases, readVisualMapContractFile, taskPlanPathFromRecord } from "./task-repository.mjs";
import { normalizeReviewBoolean, reviewFindingColumns } from "./task-review-model.mjs";
import { allowedPhaseActors, allowedPhaseKinds } from "./phase-kind.mjs";
import { validateTaskCompletionConsistency } from "./task-completion-consistency.mjs";
import { validatePlanContracts } from "./check-task-contracts.mjs";
import { validateGovernanceTableBoundaries } from "./governance-table-boundary.mjs";
import { validateSubagentAuthorization } from "./subagent-authorization-audit.mjs";
import { summarizeGitState } from "./git-status-summary.mjs";
import { buildStatusData } from "./status-builder.mjs";
import {
  legacyCloseoutFile,
  legacyCompatMode,
  legacyLedgerFile,
  legacyPath,
  legacyPlanningRoot,
  legacyWalkthroughRoot,
  safeAdoptionCapability,
} from "./harness-paths.mjs";
import type {
  BuildStatusOptions,
  CheckTarget,
  PresetPackage,
  ScannedTask,
  ValidationResult,
} from "./types/check-profiles.js";
export { renderDashboard } from "./status-dashboard-renderer.mjs";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function runCompatibilityCheck(target: CheckTarget) {
  const checkTarget = target.docsOnly ? target.projectRoot : target.input;
  const result = spawnSync(process.execPath, [bundledCheckScript, checkTarget], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status === 0 ? "pass" : "fail",
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function validateReviewSchema(target: CheckTarget, { strict = true }: { strict?: boolean } = {}): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const report = (message: string) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  const reviewPaths = walkFiles(target.docsRoot)
    .filter((file) => file.endsWith("review.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !isArchivedHarnessPath(file));

  for (const reviewPath of reviewPaths) {
    const relative = toPosix(path.relative(target.projectRoot, reviewPath));
    const content = readFileSafe(reviewPath);
    const requiredSections = [
      ["Reviewer Identity", "Reviewer 身份", "审查者身份"],
      ["Confidence Challenge", "信心挑战"],
      ["Evidence Checked", "已检查 Evidence", "已检查证据"],
      ["Final Confidence Basis", "最终信心依据"],
    ];
    for (const [label, ...aliases] of requiredSections) {
      if (!contentHasAny(content, [label, ...aliases])) {
        if (strict) failures.push(`${relative} missing ${label}`);
        else warnings.push(`${relative} missing ${label}`);
      }
    }
    const evidenceTable = tableAfterHeading(content, /^(Evidence ID|证据 ID)$/i);
    if (strict && evidenceTable.rows.length === 0) {
      failures.push(`${relative} Evidence Checked table needs at least one evidence row`);
    }
    const usesVerifier = /verifier-backed|(^|\|)[^|\n]*\|\s*verifier\s*\|/im.test(content);
    if (usesVerifier) {
      if (!/template_id:\s*`?harness-verifier\/v1`?/i.test(content)) {
        report(`${relative} verifier-backed review missing template_id: harness-verifier/v1`);
      }
      if (!/verdict:\s*`?(pass|fail|inconclusive)`?/i.test(content)) {
        report(`${relative} verifier-backed review missing verdict`);
      }
    }
    const { header, rows } = tableAfterHeading(content, /^ID$/i);
    if (rows.length === 0) continue;
    const severityIndex = getColumnAny(header, reviewFindingColumns.severity);
    const openIndex = getColumnAny(header, reviewFindingColumns.open);
    const dispositionIndex = getColumnAny(header, reviewFindingColumns.disposition);
    const blocksIndex = getColumnAny(header, reviewFindingColumns.blocksRelease);
    const followUpIndex = getColumnAny(header, ["Follow-up", "跟进"]);
    const evidenceCheckedIndex = getColumnAny(header, ["Evidence Checked", "已检查证据"]);
    if ([severityIndex, openIndex, dispositionIndex, blocksIndex].some((index) => index < 0)) {
      report(`${relative} findings table missing Severity/Open/Disposition/Blocks Release columns`);
      continue;
    }
    for (const row of rows) {
      const id = row[0] || "";
      const severity = row[severityIndex] || "";
      if (!/^P[0-3]$/.test(severity) && !/^(R|SR)-\d+/i.test(id)) continue;
      const open = normalizeReviewBoolean(row[openIndex] || "");
      const disposition = (row[dispositionIndex] || "").toLowerCase();
      const blocks = normalizeReviewBoolean(row[blocksIndex] || "");
      const followUp = row[followUpIndex] || "";
      if (!/^P[0-3]$/.test(severity)) report(`${relative} ${id} invalid severity: ${severity}`);
      if (!["yes", "no"].includes(open)) report(`${relative} ${id} invalid Open value: ${open}`);
      if (!allowedReviewDispositions.has(disposition)) report(`${relative} ${id} invalid Disposition: ${disposition}`);
      if (!["yes", "no"].includes(blocks)) report(`${relative} ${id} invalid Blocks Release value: ${blocks}`);
      if ((open === "yes" || blocks === "yes") && /^P[01]$/.test(severity)) {
        report(`${relative} ${id} has release-blocking open ${severity}`);
      }
      if (["accepted-risk", "deferred"].includes(disposition) && (!followUp || /^none|无$/i.test(followUp))) {
        report(`${relative} ${id} ${disposition} requires follow-up routing`);
      }
      if (strict && evidenceCheckedIndex >= 0) {
        const refs = splitList(row[evidenceCheckedIndex] || "");
        const evidenceIds = new Set(evidenceTable.rows.map((evidenceRow) => evidenceRow[0]));
        for (const ref of refs) {
          if (ref !== "none" && /^E-\d+/i.test(ref) && !evidenceIds.has(ref)) {
            failures.push(`${relative} ${id} references missing evidence id: ${ref}`);
      }
    }
  }
}

  }
  return { failures, warnings };
}

export function validateVisualMaps(target: CheckTarget, { tasks }: { tasks?: ScannedTask[] } = {}): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const taskRecords = tasks || createScannerTaskRepository(target).list();
  for (const task of taskRecords) {
    const taskPlanPath = taskPlanPathFromRecord(target, task);
    const taskDir = path.dirname(taskPlanPath);
    const visualMapPath = path.join(taskDir, visualMapFile);
    const legacyPath = path.join(taskDir, legacyVisualRoadmapFile);
    const relative = toPosix(path.relative(target.projectRoot, visualMapPath));
    const taskPlan = readFileSafe(taskPlanPath);
    const visualMap = readVisualMapContractFile(taskDir, taskPlan);
    const { header, rows } = tableAfterHeading(visualMap.content, /^Phase ID$/i);
    if (rows.length > 0) {
      for (const column of ["Phase ID", "Depends On", "State", "Completion", "Output", "Required Evidence", "Evidence Status", "Blocking Risk", "Owner / Handoff"]) {
        if (getColumn(header, column) < 0) failures.push(`${relative} Visual Map missing column: ${column}`);
      }
    }
    const phases = parsePhases(visualMap.content);
    const budget = parseTaskBudget(taskPlan);
    for (const phase of phases) {
      if (!allowedPhaseKinds.has(phase.kind)) failures.push(`${relative} phase ${phase.id} invalid kind: ${phase.kind}`);
      if (!allowedPhaseActors.has(phase.actor)) failures.push(`${relative} phase ${phase.id} invalid actor: ${phase.actor}`);
      if (!allowedPhaseStates.has(phase.state)) failures.push(`${relative} phase ${phase.id} invalid state: ${phase.state}`);
      if (!allowedEvidenceStatus.has(phase.evidenceStatus)) {
        failures.push(`${relative} phase ${phase.id} invalid evidence status: ${phase.evidenceStatus}`);
      }
      if (!Number.isInteger(phase.completion) || phase.completion < 0 || phase.completion > 100) {
        failures.push(`${relative} phase ${phase.id} completion must be integer 0..100`);
      }
      if (phase.state === "done" && phase.completion !== 100) failures.push(`${relative} phase ${phase.id} done must be 100`);
      if (phase.state === "planned" && phase.completion !== 0) failures.push(`${relative} phase ${phase.id} planned must be 0`);
    }
    if (visualMap.source === "canonical" && !/Visual Map Contract:\s*v1\.0/i.test(visualMap.content)) {
      failures.push(`${relative} missing Visual Map Contract: v1.0`);
    }
    if (visualMap.source === "canonical" && phases.length === 0) warnings.push(`${relative} has no Visual Map phase table`);
    if (visualMap.source === "canonical" && budget !== "simple" && phases.length > 0 && !phases.some((phase) => phase.kind === "execution" && phase.state !== "skipped")) {
      failures.push(`${relative} requires at least one non-skipped execution phase`);
    }
    if (visualMap.source === "legacy" && fs.existsSync(legacyPath)) {
      warnings.push(`${relative} missing; legacy visual_roadmap.md is rewrite input only`);
    } else if (visualMap.source === "legacy" && phases.length > 0) {
      warnings.push(`${relative} missing; using legacy task_plan.md visual map fallback`);
    }
  }
  return { failures, warnings };
}

export function validateTaskPresetContracts(target: CheckTarget, { tasks }: { tasks?: ScannedTask[] } = {}): ValidationResult {
  const failures: string[] = [], warnings: string[] = [];
  const allowedMigrationLevels = new Set([
    "migration-baseline",
    "migration-current-cutover",
    "migration-full-cutover",
    "migration-deferred",
  ]);
  for (const task of tasks || createScannerTaskRepository(target).list()) {
    if (!task.taskPreset || task.taskPreset === "none") continue;
    let presetPackage: PresetPackage | null = null;
    try {
      presetPackage = readPresetPackage(task.taskPreset, { targetInput: target.projectRoot });
    } catch (error) {
      failures.push(`${task.path} unsupported Task Preset: ${task.taskPreset} (${errorMessage(error)})`);
      continue;
    }
    if (task.taskPreset !== "lesson-sedimentation") {
      const regularPreset = validateRegularTaskPresetContract(target, task, presetPackage);
      failures.push(...regularPreset.failures);
      warnings.push(...regularPreset.warnings);
    }
    if (task.taskPreset === "lesson-sedimentation") {
      if (!["standard", "complex"].includes(task.budget)) failures.push(`${task.path} lesson-sedimentation preset requires Selected budget: standard or complex`);
      if (!task.taskPlanPath) failures.push(`${task.path} lesson-sedimentation preset missing task plan`);
      continue;
    }
    if (task.taskPreset !== "legacy-migration") continue;
    if (task.budget !== "complex") failures.push(`${task.path} legacy-migration preset requires Selected budget: complex`);
    if (!allowedMigrationLevels.has(task.migrationTargetLevel)) {
      failures.push(`${task.path} legacy-migration preset invalid Migration Target Level: ${task.migrationTargetLevel || "(missing)"}`);
    }
    const achievedLevel = task.migrationAchievedLevel || "";
    if (achievedLevel !== "pending" && !allowedMigrationLevels.has(achievedLevel)) {
      failures.push(`${task.path} legacy-migration preset invalid Migration Achieved Level: ${achievedLevel || "(missing)"}`);
    }
    if (task.evidenceBundle && !task.migrationSnapshot?.evidencePresent) {
      failures.push(`${task.path} legacy-migration preset Evidence Bundle missing: ${task.evidenceBundle}`);
    } else if (!task.migrationSnapshot?.sessionPresent) {
      failures.push(`${task.path} legacy-migration preset Evidence Bundle missing session.json`);
    }
    if (achievedLevel === "migration-full-cutover") {
      const snapshot = task.migrationSnapshot;
      const blockers: string[] = [];
      if (!snapshot?.sessionPresent) blockers.push("missing session evidence");
      if (snapshot?.sessionResult !== "complete") blockers.push(`session result is ${snapshot?.sessionResult || "(missing)"}`);
      if (snapshot?.strictDeferred) blockers.push("strictDeferred is present");
      if (snapshot?.strictStatus !== "pass") blockers.push(`strict status is ${snapshot?.strictStatus || "(missing)"}`);
      for (const [field, value] of [
        ["warnings", snapshot?.warnings],
        ["taskActions", snapshot?.taskActions],
        ["reviewSchemaGaps", snapshot?.reviewSchemaGaps],
        ["legacyReferenceGaps", snapshot?.legacyReferenceGaps],
        ["legacyResiduals", snapshot?.legacyResiduals],
      ]) {
        if (Number(value || 0) !== 0) blockers.push(`${field}=${value}`);
      }
      if (snapshot?.fullCutoverEligible !== true) blockers.push("fullCutoverEligible is not true");
      if (blockers.length) {
        failures.push(`${task.path} migration-full-cutover is not proven: ${blockers.join("; ")}`);
      }
    }
  }
  return { failures, warnings };
}

export function validateContextDocs(target: CheckTarget, { strict = true }: { strict?: boolean } = {}): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const report = (message: string) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  const files = contextDocRoots(target).flatMap((root) => walkFiles(root)).filter((file) => file.endsWith(".md"));
  for (const file of files) {
    if (isArchivedHarnessPath(file)) continue;
    const relative = toPosix(path.relative(target.projectRoot, file));
    const content = readFileSafe(file);
    if (!/Context Doc Type:\s*\S+/i.test(content) && !/上下文文档类型[：:]\s*\S+/.test(content)) report(`${relative} missing Context Doc Type`);
    if (path.basename(file) === "README.md") continue;
    if (!contentHasAny(content, [/Source Evidence/i, "来源证据"])) report(`${relative} missing Source Evidence field`);
    if (!/Last Verified:\s*\S+|Last Verified\s*\|/i.test(content) && !/最近验证[：:]\s*\S+|最近验证\s*\|/.test(content)) report(`${relative} missing Last Verified field`);
    if (!/Confidence:\s*(high|medium|low|unknown)|Confidence\s*\|/i.test(content) && !/信心[：:]\s*(high|medium|low|unknown|高|中|低|未知)|信心\s*\|/.test(content)) report(`${relative} missing Confidence field`);
    if (/(^|\/)(?:03-ARCHITECTURE|context\/architecture)\/service-catalog\.md$/.test(relative)) {
      for (const [column, ...aliases] of [
        ["Service / Component", "服务 / 组件"],
        ["Interfaces", "接口"],
        ["Source Evidence", "来源证据"],
        ["Last Verified", "最近验证"],
        ["Confidence", "信心"],
      ]) {
        if (!contentHasAny(content, [column, ...aliases])) report(`${relative} service catalog missing column: ${column}`);
      }
    }
    if (/(^|\/)(?:04-DEVELOPMENT|context\/development)\/external-context\/[^/]+\.md$/.test(relative)) {
      for (const [heading, ...aliases] of [
        ["Development Use", "开发用途"],
        ["Do Not Assume", "不要假设"],
        ["Mocks / Stubs", "Mock / Stub", "模拟 / 桩"],
      ]) {
        if (!contentHasAny(content, [heading, ...aliases])) report(`${relative} external context missing section: ${heading}`);
      }
    }
    if (/(^|\/)(?:06-INTEGRATIONS|context\/integrations)\/(?:[^/_][^/]*|third-party\/[^/_][^/]*)\.md$/.test(relative)) {
      for (const [heading, ...aliases] of [
        ["Contract Type", "合同类型"],
        ["Auth", "认证"],
        ["Payload", "载荷"],
        ["Errors", "错误"],
        ["Contract Tests", "合同测试"],
      ]) {
        if (!contentHasAny(content, [heading, ...aliases])) report(`${relative} integration contract missing section: ${heading}`);
      }
    }
  }
  return { failures, warnings };
}

function contextDocRoots(target: CheckTarget): string[] {
  if (target.harness?.version === 2) {
    return [
      path.join(target.harness.harnessRoot, "context/architecture"),
      path.join(target.harness.harnessRoot, "context/development"),
      path.join(target.harness.harnessRoot, "context/integrations"),
    ];
  }
  return ["03-ARCHITECTURE", "04-DEVELOPMENT", "06-INTEGRATIONS"].map((root) => path.join(target.docsRoot, root));
}

export function buildStatus(targetInput: string | undefined, options: BuildStatusOptions = {}) {
  const target = normalizeTarget(targetInput) as CheckTarget;
  const gitState = summarizeGitState(target);
  const capabilityState = validateCapabilities(target);
  const declaredCapabilities = new Set(capabilityState.registry.capabilities.map((capability: { name: string }) => capability.name));
  const safeAdoptionMode = declaredCapabilities.has(safeAdoptionCapability);
  const shouldRunLegacy = target.harness?.version !== 2 && !options.skipLegacyCheck && (capabilityState.registry.mode === legacyCompatMode || safeAdoptionMode);
  const legacy = shouldRunLegacy ? runCompatibilityCheck(target) : { status: "skipped", code: 0, stdout: "", stderr: "" };
  const contractStrict = Boolean(options.strict) || (capabilityState.registry.mode !== legacyCompatMode && !safeAdoptionMode);
  const closeoutContent = target.harness?.version === 2 ? "" : readFileSafe(path.join(target.projectRoot, legacyPath(legacyCloseoutFile)));
  const tasks = createScannerTaskRepository(target, { requireGeneratedScaffoldProvenance: contractStrict, closeoutContent }).list();
  const reviews = validateReviewSchema(target, { strict: contractStrict });
  const visualMaps = validateVisualMaps(target, { tasks });
  const planContracts = validatePlanContracts(target, { strict: contractStrict, tasks });
  const presetContracts = validateTaskPresetContracts(target, { tasks });
  const contextDocs = validateContextDocs(target, { strict: contractStrict });
  const governanceBoundaries = validateGovernanceTableBoundaries(target);
  const subagentAuthorization = validateSubagentAuthorization(target, { strict: contractStrict });
  const failures = [...capabilityState.failures, ...reviews.failures, ...visualMaps.failures, ...planContracts.failures, ...presetContracts.failures, ...contextDocs.failures, ...governanceBoundaries.failures, ...subagentAuthorization.failures];
  const warnings = [...capabilityState.warnings, ...reviews.warnings, ...visualMaps.warnings, ...planContracts.warnings, ...presetContracts.warnings, ...contextDocs.warnings, ...governanceBoundaries.warnings, ...subagentAuthorization.warnings, ...gitState.warnings];
  if (target.harness?.version !== 2 && hasLegacyHarnessDocs(target) && !options.allowLegacyTarget) {
    failures.push("legacy harness structure is migration input only; run `harness migrate-structure --plan` then `harness migrate-structure --apply`");
  }
  if (legacy.status === "fail") {
    if (options.strictLegacy) failures.push("legacy check failed");
    else warnings.push(`adoption-needed: legacy check failed: ${(legacy.stderr || legacy.stdout).trim()}`);
  }

  const taskCompletionConsistency = validateTaskCompletionConsistency(tasks);
  failures.push(...taskCompletionConsistency.failures);
  warnings.push(...taskCompletionConsistency.warnings);
  const briefReady = tasks.filter((task) => task.briefSource === "standalone").length;
  const briefMissing = tasks.length - briefReady;
  for (const task of tasks) {
    for (const issue of task.materialIssues || []) {
      const forceFailure = Boolean((issue as { enforceFailure?: boolean }).enforceFailure);
      if (
        !String(issue.code || "").startsWith("missing-task-audit") &&
        !String(issue.code || "").startsWith("legacy-") &&
        issue.code !== "unedited-template-material"
      ) continue;
      const message = `${String(issue.sourcePath || task.path).replace(/^TARGET:/, "")} ${issue.message}`;
      if (forceFailure || contractStrict || options.strictLegacy) failures.push(message);
      else warnings.push(`adoption-needed: ${message}`);
    }
    if (task.stateSource === "invalid") {
      const message = `${task.path}/progress.md invalid task state: ${task.stateRaw}. Allowed values: ${allowedTaskStateValues.join(", ")}; zh-CN allowed values: ${allowedZhTaskStateValues.join(", ")}. Suggested fix: replace the ## 状态 / ## Current Status machine field with one allowed value and move fine-grained coordination status to the progress log or coordinator handoff.`;
      if (contractStrict || options.strictLegacy) failures.push(message);
      else warnings.push(`adoption-needed: ${message}`);
    }
  }
  return buildStatusData(target, {
    capabilityState,
    gitState,
    legacy,
    failures,
    warnings,
    tasks,
    validationMode: "validated",
  });
}

function hasLegacyHarnessDocs(target: CheckTarget): boolean {
  return [
    path.join(target.projectRoot, legacyPath(legacyPlanningRoot)),
    path.join(target.projectRoot, legacyPath(legacyWalkthroughRoot)),
    path.join(target.projectRoot, legacyPath(legacyLedgerFile)),
  ].some((candidate) => fs.existsSync(candidate));
}
