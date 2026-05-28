// @ts-nocheck
// Dashboard bundle aggregation stays behavior-first until dashboard domain types are modeled.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  bundledCheckScript,
  repoRoot,
  builtinPresetRoot,
  normalizeTarget,
  projectPresetRoot,
  readFileSafe,
  sanitizeText,
  sanitizeDeep,
  slug,
  titleFromMarkdown,
  prefixedPath,
  toPosix,
  walkFiles,
  isArchivedHarnessPath,
  visualMapFile,
  legacyVisualRoadmapFile,
  lessonCandidatesFile,
  longRunningTaskContractFile,
  userPresetRoot,
} from "./core-shared.mjs";
import {
  parseAllMarkdownTables,
  getCell,
  splitDependencies,
} from "./markdown-utils.mjs";
import { readCapabilityRegistry, validateCapabilities } from "./capability-registry.mjs";
import { resolveHarnessPaths } from "./harness-paths.mjs";
import {
  legacyCompatMode,
  safeAdoptionCapability,
} from "./harness-paths.mjs";
import { buildStatusData } from "./status-builder.mjs";
import {
  listTaskPlanPaths,
  parseTaskState,
  isActiveTaskState,
} from "./task-scanner.mjs";
import { writeDashboardDirectory, writeDashboardFile } from "./dashboard-writer.mjs";
import { listPresetPackageLayers } from "./preset-registry.mjs";
import { validateGovernanceTableBoundaries } from "./governance-table-boundary.mjs";
import { summarizeGitState } from "./git-status-summary.mjs";

export function collectMarkdownDocuments(target, options = {}) {
  const docs = collectDashboardDocumentPaths(target, options);
  return docs.map((entry, index) => {
    const file = typeof entry === "string" ? entry : entry.file;
    const content = sanitizeText(readFileSafe(file));
    const source = prefixedPath(target, file);
    return {
      id: `doc-${String(index + 1).padStart(4, "0")}-${slug(path.basename(file, ".md"))}`,
      path: source,
      title: titleFromMarkdown(content, path.basename(file)),
      type: documentKind(source),
      content,
      ...(entry.partial ? { partial: true, partialReason: entry.partialReason || "partial", taskId: entry.taskId || "" } : {}),
    };
  });
}

function collectDashboardDocumentPaths(target, options = {}) {
  const harnessPaths = target.harness || resolveHarnessPaths(target);
  const selected = new Set();
  const partial = new Map();
  const addAbsolutePath = (file) => {
    if (file && fs.existsSync(file)) selected.add(file);
  };
  const addDocsPath = (relativePath) => {
    const file = path.join(target.docsRoot, relativePath);
    if (fs.existsSync(file)) selected.add(file);
  };
  if (harnessPaths.version === 2) {
    addAbsolutePath(harnessPaths.ledgerPath);
    addAbsolutePath(harnessPaths.closeoutIndexPath);
    addAbsolutePath(path.join(harnessPaths.modulesRoot, "Module-Registry.md"));
    addAbsolutePath(path.join(harnessPaths.regressionRoot, "Regression-SSoT.md"));
    addAbsolutePath(path.join(harnessPaths.regressionRoot, "Cadence-Ledger.md"));
    for (const generatedRoot of [harnessPaths.generatedRoot, path.join(harnessPaths.planningRoot, "generated")]) {
      for (const file of walkFiles(generatedRoot)) {
        if (file.endsWith(".md")) selected.add(file);
      }
    }
  }
  if (harnessPaths.version !== 2) {
    for (const relativePath of [
      "Harness-Ledger.md",
      "09-PLANNING/Module-Registry.md",
      "05-TEST-QA/Regression-SSoT.md",
      "05-TEST-QA/Cadence-Ledger.md",
      "10-WALKTHROUGH/Closeout-SSoT.md",
    ]) {
      addDocsPath(relativePath);
    }
    for (const file of walkFiles(harnessPaths.legacy.walkthroughRoot)) {
      if (!file.endsWith(".md")) continue;
      if (file.includes(`${path.sep}_archive${path.sep}`)) continue;
      if (path.basename(file).startsWith("_")) continue;
      selected.add(file);
    }
  }
  const tasksByPlanPath = new Map((options.tasks || []).map((task) => [
    path.join(target.projectRoot, String(task.taskPlanPath || "").replace(/^TARGET:/, "")),
    task,
  ]));
  for (const taskPlanPath of options.taskPlanPaths || listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    const progress = readFileSafe(path.join(taskDir, "progress.md"));
    const state = parseTaskState(progress);
    const active = isActiveTaskState(state);
    const task = tasksByPlanPath.get(taskPlanPath);
    const historicalClosed = !active && task?.closeoutStatus === "closed";
    const documentNames = historicalClosed
      ? ["brief.md", "walkthrough.md"]
      : ["brief.md", "task_plan.md", "execution_strategy.md", visualMapFile, legacyVisualRoadmapFile, lessonCandidatesFile, longRunningTaskContractFile, "progress.md", "review.md", "findings.md", "walkthrough.md"];
    for (const fileName of documentNames) {
      const file = path.join(taskDir, fileName);
      if (fs.existsSync(file)) {
        selected.add(file);
        if (historicalClosed) {
          partial.set(file, {
            partial: true,
            partialReason: "historical-closed",
            taskId: task?.id || path.basename(taskDir),
          });
        }
      }
    }
    if (!historicalClosed) {
      for (const indexFile of ["references/INDEX.md", "artifacts/INDEX.md"]) {
        const file = path.join(taskDir, indexFile);
        if (fs.existsSync(file)) selected.add(file);
      }
    }
  }
  for (const file of walkFiles(harnessPaths.modulesRoot)) {
    if (file.endsWith("module_plan.md")) selected.add(file);
    if (file.endsWith(`${path.sep}brief.md`) && path.dirname(file) !== harnessPaths.modulesRoot) selected.add(file);
  }
  const lessonsRoot = harnessPaths.version === 2
    ? path.join(harnessPaths.governanceRoot, "lessons")
    : path.join(target.docsRoot, "01-GOVERNANCE/lessons");
  for (const file of walkFiles(lessonsRoot)) {
    if (file.endsWith(".md")) selected.add(file);
  }
  return [...selected]
    .filter((file) => !isArchivedHarnessPath(file))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .sort()
    .map((file) => ({ file, ...(partial.get(file) || {}) }));
}

function documentKind(source) {
  const lower = source.toLowerCase();
  if (lower.includes("harness-ledger.md")) return "harness-ledger";
  if (lower.includes("module-registry.md")) return "module-registry";
  if (lower.includes("regression-ssot.md")) return "regression-ssot";
  if (lower.includes("cadence-ledger.md")) return "cadence-ledger";
  if (/\/(?:01-governance|governance)\/lessons\/[^/]+\.md$/i.test(lower)) return "lesson-detail";
  if (lower.endsWith("/progress.md")) return "task-progress";
  if (lower.endsWith("/brief.md")) return "task-brief";
  if (lower.endsWith("/review.md")) return "task-review";
  if (lower.endsWith("/lesson_candidates.md")) return "lesson-candidates";
  if (lower.endsWith("/long-running-task-contract.md")) return "long-running-contract";
  if (lower.endsWith("/references/index.md")) return "task-references";
  if (lower.endsWith("/artifacts/index.md")) return "task-artifacts";
  if (lower.endsWith("/execution_strategy.md")) return "execution-strategy";
  if (lower.endsWith("/visual_map.md")) return "visual-map";
  if (lower.endsWith("/visual_roadmap.md")) return "legacy-visual-roadmap";
  if (lower.endsWith("/module_plan.md")) return "module-plan";
  return "markdown-table";
}

export function collectTables(documents) {
  return {
    tables: documents.flatMap((document) => parseAllMarkdownTables(document.content, document.path, documentKind(document.path))),
  };
}

export function collectGraph(status, tables = { tables: [] }, target = null) {
  const harnessPaths = target?.harness || null;
  const nodes = [];
  const edges = [];
  const seenNodes = new Map();
  const addNode = (node) => {
    const existing = seenNodes.get(node.id);
    if (existing) {
      if (existing.type === "module" && node.type === "module" && node.state === "planned" && existing.state && existing.state !== "planned") {
        const { state: _state, currentStep: _currentStep, ...rest } = node;
        Object.assign(existing, rest);
        return;
      }
      Object.assign(existing, node);
      return;
    }
    seenNodes.set(node.id, node);
    nodes.push(node);
  };
  const addEdge = (edge) => {
    if (!edge.from || !edge.to || edge.from === edge.to) return;
    edges.push(edge);
  };
  for (const task of status.tasks) {
    addNode({ id: `task:${task.id}`, type: "task", label: task.title, state: task.state, completion: task.completion });
    for (const phase of task.phases || []) {
      const phaseId = `phase:${task.id}:${phase.id}`;
      addNode({
        id: phaseId,
        type: "phase",
        label: phase.id,
        state: phase.state,
        completion: phase.completion,
        kind: phase.kind,
        actor: phase.actor,
        exitCommand: phase.exitCommand,
        taskId: task.id,
      });
      addEdge({ from: `task:${task.id}`, to: phaseId, type: "contains" });
      for (const dependency of phase.dependsOn || []) {
        addEdge({ from: `phase:${task.id}:${dependency}`, to: phaseId, type: "depends_on" });
      }
    }
    for (const handoff of task.handoffs || []) {
      const handoffId = `handoff:${handoff.id}`;
      addNode({ id: handoffId, type: "handoff", label: handoff.summary, state: handoff.state });
      addEdge({ from: `task:${task.id}`, to: handoffId, type: "handoff" });
    }
  }
  for (const table of tables.tables || []) {
    if (table.kind === "module-registry") {
      for (const row of table.rows) {
        const key = getCell(row.cells, ["Key", "Module", "模块 Key", "模块"]) || "";
        if (!key) continue;
        const moduleId = `module:${key}`;
        const status = getCell(row.cells, ["Status", "状态"], "unknown");
        const currentStep = getCell(row.cells, ["Current Step", "当前步骤"], "");
        addNode({
          id: moduleId,
          type: "module",
          label: getCell(row.cells, ["Name", "Module", "模块名称", "模块"], key),
          state: status,
          currentStep,
          ...moduleDocumentPaths(target, key),
        });
        if (currentStep) {
          const stepId = `step:${currentStep}`;
          if (!seenNodes.has(stepId)) addNode({ id: stepId, type: "step", label: currentStep, state: status, module: key });
          addEdge({ from: moduleId, to: stepId, type: "current_step" });
        }
      }
    }
    if (table.kind === "module-plan") {
      const moduleKey = moduleKeyFromPlanSource(table.source, target) || slug(table.source);
      const moduleId = `module:${moduleKey}`;
      addNode({ id: moduleId, type: "module", label: moduleKey, state: "planned", ...moduleDocumentPaths(target, moduleKey) });
      for (const row of table.rows) {
        const step = getCell(row.cells, ["Step ID", "步骤 ID"]);
        if (!step) continue;
        const stepId = `step:${step}`;
        addNode({ id: stepId, type: "step", label: `${step} ${getCell(row.cells, ["Name", "名称"]) || ""}`.trim(), state: getCell(row.cells, ["Status", "状态"], "unknown"), module: moduleKey });
        addEdge({ from: moduleId, to: stepId, type: "contains" });
        for (const dependency of splitDependencies(getCell(row.cells, ["Depends On", "依赖"]) || "")) {
          addEdge({ from: `step:${dependency}`, to: stepId, type: "depends_on" });
        }
      }
    }
  }
  for (const edge of edges) {
    if (edge.type === "depends_on" && !seenNodes.has(edge.from)) {
      addNode({ id: edge.from, type: "external-dependency", label: edge.from.replace(/^(phase:[^:]+:|step:)/, ""), state: "external" });
    }
  }
  return { nodes, edges: edges.filter((edge) => seenNodes.has(edge.from) && seenNodes.has(edge.to)) };
}

function moduleKeyFromPlanSource(source, target) {
  if (!target?.projectRoot || !target?.harness?.modulesRoot) {
    const moduleMatch = source.match(/(?:MODULES|modules)\/([^/]+)\/module_plan\.md$/);
    return moduleMatch ? moduleMatch[1] : "";
  }
  const relativeSource = String(source || "").replace(/^TARGET:/, "");
  const absoluteSource = path.join(target.projectRoot, relativeSource);
  const relative = toPosix(path.relative(target.harness.modulesRoot, absoluteSource));
  const match = relative.match(/^([^/]+)\/module_plan\.md$/);
  if (match) return match[1];
  const legacyMatch = source.match(/(?:MODULES|modules)\/([^/]+)\/module_plan\.md$/);
  return legacyMatch ? legacyMatch[1] : "";
}

function moduleDocumentPaths(target, moduleKey) {
  if (!target?.harness?.modulesRoot || !moduleKey) return {};
  const brief = path.join(target.harness.modulesRoot, moduleKey, "brief.md");
  const modulePlan = path.join(target.harness.modulesRoot, moduleKey, "module_plan.md");
  return {
    ...(fs.existsSync(brief) ? { briefPath: prefixedPath(target, brief) } : {}),
    ...(fs.existsSync(modulePlan) ? { modulePlanPath: prefixedPath(target, modulePlan) } : {}),
  };
}

export function categorizeWarning(message) {
  if (/governance-table-entropy/i.test(message)) return "Governance Table Boundary";
  if (/missing execution_strategy\.md|missing visual_(?:map|roadmap)\.md|Visual (?:Map|Roadmap)/i.test(message)) return "Plan Contract Missing";
  if (new RegExp(`${legacyCompatMode}|adoption-needed|legacy check`, "i").test(message)) return "Adoption Advice";
  if (/Evidence|evidence/i.test(message)) return "Missing Evidence";
  if (/schema|missing .*columns|invalid/i.test(message)) return "Schema Drift";
  return "Review Finding";
}

function warningType(message) {
  if (/missing brief\.md|briefSource|brief/i.test(message) && /missing|缺少/i.test(message)) return "missing-brief";
  if (/missing execution_strategy\.md/i.test(message)) return "missing-execution-strategy";
  if (/missing visual_map\.md|Visual Map/i.test(message)) return "missing-visual-map";
  if (/missing visual_roadmap\.md|Visual Roadmap/i.test(message)) return "missing-visual-roadmap";
  if (/Reviewer Identity|Confidence Challenge|Final Confidence Basis|Evidence Checked/i.test(message)) return "review-schema-gap";
  if (/governance-table-entropy/i.test(message)) return "governance-table-entropy";
  if (/Evidence|evidence/i.test(message)) return "missing-evidence";
  if (/missing required file/i.test(message)) return "legacy-reference-gap";
  if (new RegExp(`${legacyCompatMode}|legacy check|adoption-needed`, "i").test(message)) return "capability-adoption";
  if (/schema|missing .*columns|invalid/i.test(message)) return "schema-drift";
  return "review-finding";
}

function warningScope(message) {
  if (/(?:docs\/09-PLANNING\/TASKS|coding-agent-harness\/planning\/tasks)\//i.test(message)) return "task";
  if (/(?:docs\/09-PLANNING\/MODULES|coding-agent-harness\/planning\/modules)\//i.test(message)) return "module";
  if (/review\.md|findings table/i.test(message)) return "review";
  if (/docs\/11-REFERENCE\//i.test(message)) return "reference";
  if (new RegExp(`\\.harness-capabilities\\.json|capability|${legacyCompatMode}`, "i").test(message)) return "capability";
  return "project";
}

function warningPhase(type, scope) {
  if (type === "capability-adoption") return "baseline";
  if (type === "governance-table-entropy") return "global-table-boundary";
  if (type === "missing-brief" || type === "missing-execution-strategy" || type === "missing-visual-map" || type === "missing-visual-roadmap") return "active-task-contracts";
  if (scope === "module") return "module-classification";
  if (type === "review-schema-gap" || type === "missing-evidence") return "review-evidence";
  if (type === "legacy-reference-gap" || type === "schema-drift") return "strict-cutover";
  return "triage";
}

function warningFixability(type, scope) {
  if (["missing-brief", "missing-execution-strategy", "missing-visual-map", "missing-visual-roadmap"].includes(type)) return "guided";
  if (type === "governance-table-entropy") return "manual";
  if (type === "legacy-reference-gap" || scope === "reference") return "template";
  if (type === "capability-adoption") return "decision";
  if (type === "review-schema-gap" || type === "missing-evidence") return "human-evidence";
  return "manual";
}

function warningPriority(type, scope, message) {
  if (/fail|invalid|blocked/i.test(message) || type === "schema-drift") return "P1";
  if (type === "governance-table-entropy") return /legacy-report-only/i.test(message) ? "P3" : "P2";
  if (["missing-brief", "missing-execution-strategy", "missing-visual-map", "missing-visual-roadmap"].includes(type) && scope === "task") return "P2";
  if (type === "review-schema-gap" || type === "missing-evidence") return "P2";
  if (type === "capability-adoption") return "P3";
  return "P3";
}

function warningConfidence(message) {
  if (/legacy|unknown|fallback/i.test(message)) return "medium";
  return "high";
}

function warningAffectedPaths(message) {
  const matches = String(message).match(/(?:docs|\.harness-private|coding-agent-harness)\/[^\s:]+|\.harness-capabilities\.json|AGENTS\.md|CLAUDE\.md/g) || [];
  return [...new Set(matches.map((item) => item.replace(/[),.;]+$/, "")))];
}

function summarizeWarnings(warnings) {
  const countBy = (field) =>
    warnings.reduce((acc, warning) => {
      const key = warning[field] || "unknown";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  return {
    total: warnings.length,
    byCategory: countBy("category"),
    byType: countBy("type"),
    byPriority: countBy("priority"),
    byPhase: countBy("phase"),
    byFixability: countBy("fixability"),
    activeTaskWarnings: warnings.filter((warning) => warning.scope === "task" && warning.phase === "active-task-contracts").length,
    strictCutoverWarnings: warnings.filter((warning) => warning.phase === "strict-cutover").length,
  };
}

export function collectAdoption(status) {
  const dashboardMessages = [
    ...(status.checkState.details.warnings || []),
    ...(status.checkState.details.failures || []).filter((message) => /governance-table-entropy/i.test(message)),
  ];
  const warnings = dashboardMessages.flatMap((message) => splitWarningMessage(message)).map((message, index) => {
    const type = warningType(message);
    const scope = warningScope(message);
    const affectedPaths = warningAffectedPaths(message);
    const stableSuffix = type === "governance-table-entropy" ? `-${stableWarningIdPart(governanceWarningRowKey(message))}` : "";
    return {
      id: `AD-${String(index + 1).padStart(3, "0")}${stableSuffix}`,
      category: categorizeWarning(message),
      type,
      scope,
      priority: warningPriority(type, scope, message),
      phase: warningPhase(type, scope),
      fixability: warningFixability(type, scope),
      status: /legacy-report-only/i.test(message) ? "legacy-report-only" : "open",
      confidence: warningConfidence(message),
      severity: status.mode === legacyCompatMode ? "advice" : "warning",
      title: warningTitle(message),
      affected: affectedPaths[0] || warningAffected(message),
      affectedPaths,
      requiredAction: warningAction(message),
      detail: sanitizeText(message),
    };
  });
  return {
    mode: status.mode,
    project: status.project,
    summary: {
      blockers: status.checkState.failures,
      advice: warnings.length,
      ...summarizeWarnings(warnings),
    },
    warnings,
    manualSteps: {
      zh: [
        "先查看升级建议，决定当前项目要采用哪些 v1.0 能力合同。",
        "为仍在活跃的任务手工补齐 execution_strategy.md 和 visual_map.md。",
        "只有在项目明确声明 v1.0 capability 后，再把 strict check 当成阻塞门禁。",
      ],
      en: [
        "Review adoption advice and decide which v1.0 capability contracts should be adopted.",
        "Manually add execution_strategy.md and visual_map.md for active tasks.",
        "Treat strict check as blocking only after the project intentionally declares v1.0 capabilities.",
      ],
    },
  };
}

function governanceWarningRowKey(message) {
  const match = String(message || "").match(/\brow\s+([^:]+)/i);
  return match ? match[1].trim() : "global-table";
}

function stableWarningIdPart(value) {
  return String(value || "global-table")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "global-table";
}

export function splitWarningMessage(message) {
  return String(message || "")
    .split(/\n-\s+/)
    .map((item, index) => (index === 0 ? item : `- ${item}`))
    .filter(Boolean);
}

function warningTitle(message) {
  if (/governance-table-entropy/i.test(message)) return "Global table boundary";
  if (/missing execution_strategy\.md/i.test(message)) return "Missing execution strategy";
  if (/missing visual_map\.md|Visual Map/i.test(message)) return "Missing visual map";
  if (/missing visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Missing legacy visual roadmap";
  if (new RegExp(legacyCompatMode, "i").test(message)) return "Legacy compatibility mode";
  if (/legacy check failed/i.test(message)) return "Legacy checker finding";
  if (/review\.md missing/i.test(message)) return "Review schema gap";
  if (/findings table missing/i.test(message)) return "Review findings schema gap";
  return String(message).split(":")[0].slice(0, 96);
}

function warningAffected(message) {
  const target = String(message).match(/(?:docs|\.harness-private)\/[^\s:]+/);
  return target ? target[0] : "project";
}

function warningAction(message) {
  if (/governance-table-entropy/i.test(message)) return "Move local detail to module/task docs; keep the global row to summary, state, route, and audit result.";
  if (/execution_strategy\.md/i.test(message)) return "Add standalone execution strategy file.";
  if (/visual_map\.md|Visual Map/i.test(message)) return "Add standalone visual map file.";
  if (/visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Rewrite legacy visual_roadmap.md into canonical visual_map.md.";
  if (/review\.md missing/i.test(message)) return "Update review.md to v1 review schema.";
  if (/legacy/i.test(message)) return "Review manually; do not auto-migrate.";
  return "Inspect source document and decide whether to adopt v1 contract.";
}

export function buildDashboardBundle(targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const taskPlanPaths = listTaskPlanPaths(target);
  const capabilityState = validateCapabilities(target);
  const gitState = summarizeGitState(target);
  const declaredCapabilities = new Set(capabilityState.registry.capabilities.map((capability) => capability.name));
  const shouldRunLegacy = target.harness?.version !== 2 && !options.skipLegacyCheck && (capabilityState.registry.mode === legacyCompatMode || declaredCapabilities.has(safeAdoptionCapability));
  const legacy = shouldRunLegacy ? runDashboardCompatibilityCheck(target) : { status: "skipped", code: 0, stdout: "", stderr: "" };
  const legacyWarnings = legacy.status === "fail" ? [`adoption-needed: legacy check failed: ${(legacy.stderr || legacy.stdout).trim()}`] : [];
  const governanceBoundaries = validateGovernanceTableBoundaries(target);
  const status = buildStatusData(target, {
    ...options,
    capabilityState,
    gitState,
    taskPlanPaths,
    legacy,
    failures: [...capabilityState.failures, ...governanceBoundaries.failures],
    warnings: [...capabilityState.warnings, ...legacyWarnings, ...governanceBoundaries.warnings, ...gitState.warnings],
  });
  const documents = { documents: collectMarkdownDocuments(target, { taskPlanPaths, tasks: status.tasks }) };
  const tables = collectTables(documents.documents);
  const graph = collectGraph(status, tables, target);
  const adoption = collectAdoption(status);
  const presetCatalog = collectPresetCatalog(targetInput, target, options);
  return sanitizeDeep({ status, tables, documents, graph, adoption, presetCatalog });
}

function runDashboardCompatibilityCheck(target) {
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

export function collectPresetCatalog(targetInput, target = normalizeTarget(targetInput), options = {}) {
  const home = options.home || "";
  const presets = listPresetPackageLayers({ targetInput: target.projectRoot, home }).map((preset) => ({
    key: `${preset.source}:${preset.id}`,
    id: preset.id,
    version: preset.version,
    source: preset.source,
    effective: preset.effective === true,
    purpose: preset.purpose,
    compatibleBudgets: preset.compatibleBudgets,
    manifestPath: preset.manifestRelativePath,
    manifestSha256: preset.manifestSha256,
    taskKind: preset.task?.kind || "",
    inputCount: Object.keys(preset.inputs || {}).length,
    referenceCount: Object.keys(preset.resources?.references || {}).length,
    artifactCount: Object.keys(preset.resources?.artifacts || {}).length,
    writeScopeCount: Object.keys(preset.writeScopes || {}).length,
    evidenceFileCount: Object.keys(preset.evidence?.files || {}).length,
    requiredReadCount: Array.isArray(preset.context?.requiredReads) ? preset.context.requiredReads.length : 0,
    checkStatus: "unknown",
  }));
  const countSource = (source) => presets.filter((preset) => preset.source === source).length;
  return {
    summary: {
      total: presets.length,
      project: countSource("project"),
      user: countSource("user"),
      builtin: countSource("builtin"),
    },
    roots: [
      { source: "project", path: projectPresetRoot(target.projectRoot) },
      { source: "user", path: home ? path.join(path.resolve(home), ".coding-agent-harness/presets") : userPresetRoot },
      { source: "builtin", path: builtinPresetRoot },
    ],
    presets,
  };
}

export function writeDashboardFolder(outDir, targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const registry = readCapabilityRegistry(target);
  const locale = options.localeOverride || registry.locale;
  const bundle = buildDashboardBundle(targetInput, options);
  return writeDashboardDirectory(outDir, bundle, {
    repoRoot,
    projectRoot: target.projectRoot,
    docsRoot: target.docsRoot,
    locale,
    workbenchRuntime: options.workbenchRuntime === true,
    recoverGeneratedDashboard: options.recoverGeneratedDashboard === true,
    replaceExistingDashboardOutput: options.replaceExistingDashboardOutput === true,
  });
}

export function writeDashboardSingleFile(outFile, targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const registry = readCapabilityRegistry(target);
  const locale = options.localeOverride || registry.locale;
  const bundle = buildDashboardBundle(targetInput, options);
  return writeDashboardFile(outFile, bundle, { repoRoot, projectRoot: target.projectRoot, docsRoot: target.docsRoot, locale });
}
