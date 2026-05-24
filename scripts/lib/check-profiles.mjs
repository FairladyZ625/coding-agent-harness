import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  repoRoot,
  legacyChecker,
  visualMapFile,
  legacyVisualRoadmapFile,
  allowedReviewDispositions,
  allowedPhaseStates,
  allowedEvidenceStatus,
  normalizeTarget,
  toPosix,
  readFileSafe,
  walkFiles,
} from "./core-shared.mjs";
import {
  tableAfterHeading,
  getColumn,
  getColumnAny,
  splitList,
  firstColumn,
  contentHasAny,
} from "./markdown-utils.mjs";
import {
  capabilityDefinitions,
  validateCapabilities,
} from "./capability-registry.mjs";
import { readPresetPackage } from "./preset-registry.mjs";
import {
  collectTasks,
  listTaskPlanPaths,
  readVisualMapContractFile,
  parsePhases,
  taskCutoverCounters,
} from "./task-scanner.mjs";
import {
  normalizeReviewBoolean,
  reviewFindingColumns,
} from "./task-review-model.mjs";
import { validateTaskCompletionConsistency } from "./task-completion-consistency.mjs";
import { validatePlanContracts } from "./check-task-contracts.mjs";
import { validateGovernanceTableBoundaries } from "./governance-table-boundary.mjs";
import { validateSubagentAuthorization } from "./subagent-authorization-audit.mjs";
import { summarizeGitState } from "./git-status-summary.mjs";
export { renderDashboard } from "./status-dashboard-renderer.mjs";

export function runLegacyCheck(target) {
  const checkTarget = target.docsOnly ? target.projectRoot : target.input;
  const result = spawnSync(process.execPath, [legacyChecker, checkTarget], {
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

export function validateReviewSchema(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  const reviewPaths = walkFiles(target.docsRoot)
    .filter((file) => file.endsWith("review.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`));

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

export function validateVisualMaps(target) {
  const failures = [];
  const warnings = [];
  for (const taskPlanPath of listTaskPlanPaths(target)) {
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
    for (const phase of phases) {
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
    if (visualMap.source === "legacy" && fs.existsSync(legacyPath)) {
      warnings.push(`${relative} missing; legacy visual_roadmap.md is rewrite input only`);
    } else if (visualMap.source === "legacy" && phases.length > 0) {
      warnings.push(`${relative} missing; using legacy task_plan.md visual map fallback`);
    }
  }
  return { failures, warnings };
}

export function validateTaskPresetContracts(target) {
  const failures = [];
  const allowedMigrationLevels = new Set([
    "migration-baseline",
    "migration-current-cutover",
    "migration-full-cutover",
    "migration-deferred",
  ]);
  for (const task of collectTasks(target)) {
    if (!task.taskPreset || task.taskPreset === "none") continue;
    let presetPackage = null;
    try {
      presetPackage = readPresetPackage(task.taskPreset);
    } catch (error) {
      failures.push(`${task.path} unsupported Task Preset: ${task.taskPreset} (${error.message})`);
      continue;
    }
    if (presetPackage?.task?.kind && task.taskKind !== presetPackage.task.kind) {
      failures.push(`${task.path} ${task.taskPreset} preset Task Kind mismatch: expected ${presetPackage.task.kind}, got ${task.taskKind || "(missing)"}`);
    }
    if (String(task.presetVersion || "") !== String(presetPackage.version)) {
      failures.push(`${task.path} ${task.taskPreset} preset missing Preset Version ${presetPackage.version}`);
    }
    if (task.taskPreset !== "lesson-sedimentation" && (presetPackage.evidence?.bundleDir || presetPackage.audit?.evidenceFiles?.length || Object.keys(presetPackage.evidence?.files || {}).length)) {
      if (!task.evidenceBundle) failures.push(`${task.path} ${task.taskPreset} preset missing Evidence Bundle`);
      else if (!fs.existsSync(path.join(target.projectRoot, String(task.evidenceBundle).replace(/^TARGET:/, "").replace(/^\/+/, "")))) {
        failures.push(`${task.path} ${task.taskPreset} preset Evidence Bundle missing: ${task.evidenceBundle}`);
      }
    }
    if (task.taskPreset === "lesson-sedimentation") {
      if (!["standard", "complex"].includes(task.budget)) failures.push(`${task.path} lesson-sedimentation preset requires Selected budget: standard or complex`);
      if (!task.taskPlanPath) failures.push(`${task.path} lesson-sedimentation preset missing task plan`);
      continue;
    }
    if (task.taskPreset !== "legacy-migration") {
      continue;
    }
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
      const snapshot = task.migrationSnapshot || {};
      const blockers = [];
      if (!snapshot.sessionPresent) blockers.push("missing session evidence");
      if (snapshot.sessionResult !== "complete") blockers.push(`session result is ${snapshot.sessionResult || "(missing)"}`);
      if (snapshot.strictDeferred) blockers.push("strictDeferred is present");
      if (snapshot.strictStatus !== "pass") blockers.push(`strict status is ${snapshot.strictStatus || "(missing)"}`);
      for (const [field, value] of [
        ["warnings", snapshot.warnings],
        ["taskActions", snapshot.taskActions],
        ["reviewSchemaGaps", snapshot.reviewSchemaGaps],
        ["legacyReferenceGaps", snapshot.legacyReferenceGaps],
        ["legacyResiduals", snapshot.legacyResiduals],
      ]) {
        if (Number(value || 0) !== 0) blockers.push(`${field}=${value}`);
      }
      if (snapshot.fullCutoverEligible !== true) blockers.push("fullCutoverEligible is not true");
      if (blockers.length) {
        failures.push(`${task.path} migration-full-cutover is not proven: ${blockers.join("; ")}`);
      }
    }
  }
  return { failures, warnings: [] };
}

export function validateContextDocs(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  const contextRoots = ["03-ARCHITECTURE", "04-DEVELOPMENT", "06-INTEGRATIONS"];
  const files = contextRoots.flatMap((root) => walkFiles(path.join(target.docsRoot, root))).filter((file) => file.endsWith(".md"));
  for (const file of files) {
    if (file.includes(`${path.sep}_archive${path.sep}`)) continue;
    const relative = toPosix(path.relative(target.projectRoot, file));
    const content = readFileSafe(file);
    if (!/Context Doc Type:\s*\S+/i.test(content) && !/上下文文档类型[：:]\s*\S+/.test(content)) report(`${relative} missing Context Doc Type`);
    if (path.basename(file) === "README.md") continue;
    if (!contentHasAny(content, [/Source Evidence/i, "来源证据"])) report(`${relative} missing Source Evidence field`);
    if (!/Last Verified:\s*\S+|Last Verified\s*\|/i.test(content) && !/最近验证[：:]\s*\S+|最近验证\s*\|/.test(content)) report(`${relative} missing Last Verified field`);
    if (!/Confidence:\s*(high|medium|low|unknown)|Confidence\s*\|/i.test(content) && !/信心[：:]\s*(high|medium|low|unknown|高|中|低|未知)|信心\s*\|/.test(content)) report(`${relative} missing Confidence field`);
    if (/03-ARCHITECTURE\/service-catalog\.md$/.test(relative)) {
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
    if (/04-DEVELOPMENT\/external-context\/[^/]+\.md$/.test(relative)) {
      for (const [heading, ...aliases] of [
        ["Development Use", "开发用途"],
        ["Do Not Assume", "不要假设"],
        ["Mocks / Stubs", "Mock / Stub", "模拟 / 桩"],
      ]) {
        if (!contentHasAny(content, [heading, ...aliases])) report(`${relative} external context missing section: ${heading}`);
      }
    }
    if (/06-INTEGRATIONS\/(?:[^/_][^/]*|third-party\/[^/_][^/]*)\.md$/.test(relative)) {
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

export function buildStatus(targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const gitState = summarizeGitState(target);
  const capabilityState = validateCapabilities(target);
  const declaredCapabilities = new Set(capabilityState.registry.capabilities.map((capability) => capability.name));
  const safeAdoptionMode = declaredCapabilities.has("safe-adoption");
  const shouldRunLegacy = !options.skipLegacyCheck && (capabilityState.registry.mode === "legacy-compat" || safeAdoptionMode);
  const legacy = shouldRunLegacy ? runLegacyCheck(target) : { status: "skipped", code: 0, stdout: "", stderr: "" };
  const contractStrict = Boolean(options.strict) || (capabilityState.registry.mode !== "legacy-compat" && !safeAdoptionMode);
  const reviews = validateReviewSchema(target, { strict: contractStrict });
  const visualMaps = validateVisualMaps(target);
  const planContracts = validatePlanContracts(target, { strict: contractStrict });
  const presetContracts = validateTaskPresetContracts(target);
  const contextDocs = validateContextDocs(target, { strict: contractStrict });
  const governanceBoundaries = validateGovernanceTableBoundaries(target);
  const subagentAuthorization = validateSubagentAuthorization(target, { strict: contractStrict });
  const failures = [...capabilityState.failures, ...reviews.failures, ...visualMaps.failures, ...planContracts.failures, ...presetContracts.failures, ...contextDocs.failures, ...governanceBoundaries.failures, ...subagentAuthorization.failures];
  const warnings = [...capabilityState.warnings, ...reviews.warnings, ...visualMaps.warnings, ...planContracts.warnings, ...presetContracts.warnings, ...contextDocs.warnings, ...governanceBoundaries.warnings, ...subagentAuthorization.warnings, ...gitState.warnings];
  if (legacy.status === "fail") {
    if (options.strictLegacy) failures.push("legacy check failed");
    else warnings.push(`adoption-needed: legacy check failed: ${(legacy.stderr || legacy.stdout).trim()}`);
  }

  const tasks = collectTasks(target);
  const taskCompletionConsistency = validateTaskCompletionConsistency(tasks);
  failures.push(...taskCompletionConsistency.failures);
  warnings.push(...taskCompletionConsistency.warnings);
  const briefReady = tasks.filter((task) => task.briefSource === "standalone").length;
  const briefMissing = tasks.length - briefReady;
  for (const task of tasks) {
    if (task.stateSource === "invalid") {
      const message = `${task.path}/progress.md invalid task state: ${task.stateRaw}`;
      if (contractStrict || options.strictLegacy) failures.push(message);
      else warnings.push(`adoption-needed: ${message}`);
    }
  }
  const capabilityNames = new Map(capabilityState.registry.capabilities.map((capability) => [capability.name, capability]));
  for (const detected of capabilityState.detected) {
    if (!capabilityNames.has(detected)) capabilityNames.set(detected, { name: detected, state: "configured" });
  }
  const cutoverCounters = taskCutoverCounters(tasks);
  const fullCutoverEligible =
    failures.length === 0 &&
    warnings.length === 0 &&
    cutoverCounters.legacyVisualOnlyCount === 0 &&
    cutoverCounters.unknownClassificationCount === 0 &&
    cutoverCounters.weakBriefCount === 0 &&
    cutoverCounters.missingCanonicalVisualMapCount === 0;

  return {
    project: {
      name: path.basename(target.projectRoot),
      root: `TARGET:${target.docsOnly ? toPosix(path.relative(target.projectRoot, target.docsRoot)) : "."}`,
      docsOnly: target.docsOnly,
    },
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    mode: capabilityState.registry.mode,
    checkState: {
      status: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
      failures: failures.length,
      warnings: warnings.length,
      details: { failures, warnings },
      legacy,
    },
    git: gitState.summary,
    summary: {
      tasks: tasks.length,
      briefCoverage: {
        ready: briefReady,
        missing: briefMissing,
        total: tasks.length,
      },
      visualMapCoverage: {
        canonical: tasks.filter((task) => task.visualMapSource === "canonical").length,
        legacyOnly: cutoverCounters.legacyVisualOnlyCount,
        missing: tasks.filter((task) => task.visualMapStatus === "missing").length,
        total: tasks.length,
      },
      fullCutoverEligible,
      legacyVisualOnlyCount: cutoverCounters.legacyVisualOnlyCount,
      unknownClassificationCount: cutoverCounters.unknownClassificationCount,
      weakBriefCount: cutoverCounters.weakBriefCount,
      visualMapRequiredCount: cutoverCounters.visualMapRequiredCount,
      missingCanonicalVisualMapCount: cutoverCounters.missingCanonicalVisualMapCount,
    },
    capabilities: [...capabilityNames.values()].map((capability) => ({
      name: capability.name,
      state: capability.state || "configured",
      dependencyStatus: capabilityDefinitions[capability.name]?.dependencies.every((dependency) => capabilityNames.has(dependency))
        ? "valid"
        : "invalid",
      warnings: capabilityState.warnings.filter((warning) => warning.includes(capability.name)),
    })),
    tasks,
    handoffs: tasks.flatMap((task) => task.handoffs || []),
    recentActivity: tasks.slice(0, 8).map((task) => ({ at: new Date().toISOString(), type: "task", summary: task.title })),
  };
}
