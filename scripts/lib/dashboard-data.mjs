import fs from "node:fs";
import path from "node:path";
import {
  repoRoot,
  normalizeTarget,
  readFileSafe,
  sanitizeText,
  sanitizeDeep,
  slug,
  titleFromMarkdown,
  prefixedPath,
  toPosix,
  walkFiles,
  visualMapFile,
  legacyVisualRoadmapFile,
  lessonCandidatesFile,
  longRunningTaskContractFile,
} from "./core-shared.mjs";
import {
  parseAllMarkdownTables,
  getCell,
  splitDependencies,
} from "./markdown-utils.mjs";
import { readCapabilityRegistry } from "./capability-registry.mjs";
import { buildStatus } from "./check-profiles.mjs";
import {
  listTaskPlanPaths,
  parseTaskState,
  isActiveTaskState,
} from "./task-scanner.mjs";
import { writeDashboardDirectory, writeDashboardFile } from "./dashboard-writer.mjs";

export function collectMarkdownDocuments(target) {
  const docs = collectDashboardDocumentPaths(target);
  return docs.map((file, index) => {
    const content = sanitizeText(readFileSafe(file));
    const source = prefixedPath(target, file);
    return {
      id: `doc-${String(index + 1).padStart(4, "0")}-${slug(path.basename(file, ".md"))}`,
      path: source,
      title: titleFromMarkdown(content, path.basename(file)),
      type: documentKind(source),
      content,
    };
  });
}

function collectDashboardDocumentPaths(target) {
  const selected = new Set();
  const addDocsPath = (relativePath) => {
    const file = path.join(target.docsRoot, relativePath);
    if (fs.existsSync(file)) selected.add(file);
  };
  for (const relativePath of [
    "Harness-Ledger.md",
    "09-PLANNING/Module-Registry.md",
    "05-TEST-QA/Regression-SSoT.md",
    "05-TEST-QA/Cadence-Ledger.md",
    "01-GOVERNANCE/Lessons-SSoT.md",
    "10-WALKTHROUGH/Closeout-SSoT.md",
  ]) {
    addDocsPath(relativePath);
  }
  for (const file of walkFiles(path.join(target.docsRoot, "10-WALKTHROUGH"))) {
    if (!file.endsWith(".md")) continue;
    if (file.includes(`${path.sep}_archive${path.sep}`)) continue;
    if (path.basename(file).startsWith("_")) continue;
    selected.add(file);
  }
  for (const taskPlanPath of listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    const progress = readFileSafe(path.join(taskDir, "progress.md"));
    const state = parseTaskState(progress);
    const active = isActiveTaskState(state);
    const documentNames = active
      ? ["brief.md", "task_plan.md", "execution_strategy.md", visualMapFile, legacyVisualRoadmapFile, lessonCandidatesFile, longRunningTaskContractFile, "progress.md", "review.md", "findings.md"]
      : ["brief.md", "task_plan.md", "execution_strategy.md", visualMapFile, legacyVisualRoadmapFile, lessonCandidatesFile, longRunningTaskContractFile, "progress.md", "review.md", "findings.md"];
    for (const fileName of documentNames) {
      const file = path.join(taskDir, fileName);
      if (fs.existsSync(file)) selected.add(file);
    }
    for (const indexFile of ["references/INDEX.md", "artifacts/INDEX.md"]) {
      const file = path.join(taskDir, indexFile);
      if (fs.existsSync(file)) selected.add(file);
    }
  }
  for (const file of walkFiles(path.join(target.docsRoot, "09-PLANNING/MODULES"))) {
    if (file.endsWith("module_plan.md")) selected.add(file);
    if (/09-PLANNING[\\/]+MODULES[\\/]+[^\\/]+[\\/]brief\.md$/.test(file)) selected.add(file);
  }
  for (const file of walkFiles(path.join(target.docsRoot, "01-GOVERNANCE/lessons"))) {
    if (file.endsWith(".md")) selected.add(file);
  }
  return [...selected]
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .sort();
}

function documentKind(source) {
  const lower = source.toLowerCase();
  if (lower.includes("harness-ledger.md")) return "harness-ledger";
  if (lower.includes("module-registry.md")) return "module-registry";
  if (lower.includes("regression-ssot.md")) return "regression-ssot";
  if (lower.includes("cadence-ledger.md")) return "cadence-ledger";
  if (lower.includes("lessons-ssot.md")) return "lessons-ssot";
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

export function collectGraph(status, tables = { tables: [] }) {
  const nodes = [];
  const edges = [];
  const seenNodes = new Map();
  const addNode = (node) => {
    const existing = seenNodes.get(node.id);
    if (existing) {
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
      addNode({ id: phaseId, type: "phase", label: phase.id, state: phase.state, completion: phase.completion, taskId: task.id });
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
        addNode({ id: moduleId, type: "module", label: getCell(row.cells, ["Name", "Module", "模块名称", "模块"], key), state: status, currentStep });
        if (currentStep) {
          const stepId = `step:${currentStep}`;
          if (!seenNodes.has(stepId)) addNode({ id: stepId, type: "step", label: currentStep, state: status, module: key });
          addEdge({ from: moduleId, to: stepId, type: "current_step" });
        }
      }
    }
    if (table.kind === "module-plan") {
      const moduleMatch = table.source.match(/MODULES\/([^/]+)\/module_plan\.md$/);
      const moduleKey = moduleMatch ? moduleMatch[1] : slug(table.source);
      const moduleId = `module:${moduleKey}`;
      addNode({ id: moduleId, type: "module", label: moduleKey, state: "planned" });
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

export function categorizeWarning(message) {
  if (/missing execution_strategy\.md|missing visual_(?:map|roadmap)\.md|Visual (?:Map|Roadmap)/i.test(message)) return "Plan Contract Missing";
  if (/legacy-compat|adoption-needed|legacy check/i.test(message)) return "Adoption Advice";
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
  if (/Evidence|evidence/i.test(message)) return "missing-evidence";
  if (/missing required file/i.test(message)) return "legacy-reference-gap";
  if (/legacy-compat|legacy check|adoption-needed/i.test(message)) return "capability-adoption";
  if (/schema|missing .*columns|invalid/i.test(message)) return "schema-drift";
  return "review-finding";
}

function warningScope(message) {
  if (/docs\/09-PLANNING\/TASKS\//i.test(message)) return "task";
  if (/docs\/09-PLANNING\/MODULES\//i.test(message)) return "module";
  if (/review\.md|findings table/i.test(message)) return "review";
  if (/docs\/11-REFERENCE\//i.test(message)) return "reference";
  if (/\.harness-capabilities\.json|capability|legacy-compat/i.test(message)) return "capability";
  return "project";
}

function warningPhase(type, scope) {
  if (type === "capability-adoption") return "baseline";
  if (type === "missing-brief" || type === "missing-execution-strategy" || type === "missing-visual-map" || type === "missing-visual-roadmap") return "active-task-contracts";
  if (scope === "module") return "module-classification";
  if (type === "review-schema-gap" || type === "missing-evidence") return "review-evidence";
  if (type === "legacy-reference-gap" || type === "schema-drift") return "strict-cutover";
  return "triage";
}

function warningFixability(type, scope) {
  if (["missing-brief", "missing-execution-strategy", "missing-visual-map", "missing-visual-roadmap"].includes(type)) return "guided";
  if (type === "legacy-reference-gap" || scope === "reference") return "template";
  if (type === "capability-adoption") return "decision";
  if (type === "review-schema-gap" || type === "missing-evidence") return "human-evidence";
  return "manual";
}

function warningPriority(type, scope, message) {
  if (/fail|invalid|blocked/i.test(message) || type === "schema-drift") return "P1";
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
  const matches = String(message).match(/(?:docs|\.harness-private)\/[^\s:]+|\.harness-capabilities\.json|AGENTS\.md|CLAUDE\.md/g) || [];
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
  const warnings = status.checkState.details.warnings.flatMap((message) => splitWarningMessage(message)).map((message, index) => {
    const type = warningType(message);
    const scope = warningScope(message);
    const affectedPaths = warningAffectedPaths(message);
    return {
      id: `AD-${String(index + 1).padStart(3, "0")}`,
      category: categorizeWarning(message),
      type,
      scope,
      priority: warningPriority(type, scope, message),
      phase: warningPhase(type, scope),
      fixability: warningFixability(type, scope),
      status: "open",
      confidence: warningConfidence(message),
      severity: status.mode === "legacy-compat" ? "advice" : "warning",
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

export function splitWarningMessage(message) {
  return String(message || "")
    .split(/\n-\s+/)
    .map((item, index) => (index === 0 ? item : `- ${item}`))
    .filter(Boolean);
}

function warningTitle(message) {
  if (/missing execution_strategy\.md/i.test(message)) return "Missing execution strategy";
  if (/missing visual_map\.md|Visual Map/i.test(message)) return "Missing visual map";
  if (/missing visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Missing legacy visual roadmap";
  if (/legacy-compat/i.test(message)) return "Legacy compatibility mode";
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
  if (/execution_strategy\.md/i.test(message)) return "Add standalone execution strategy file.";
  if (/visual_map\.md|Visual Map/i.test(message)) return "Add standalone visual map file.";
  if (/visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Rewrite legacy visual_roadmap.md into canonical visual_map.md.";
  if (/review\.md missing/i.test(message)) return "Update review.md to v1 review schema.";
  if (/legacy/i.test(message)) return "Review manually; do not auto-migrate.";
  return "Inspect source document and decide whether to adopt v1 contract.";
}

export function buildDashboardBundle(targetInput, options = {}) {
  const status = buildStatus(targetInput, options);
  const target = normalizeTarget(targetInput);
  const documents = { documents: collectMarkdownDocuments(target) };
  const tables = collectTables(documents.documents);
  const graph = collectGraph(status, tables);
  const adoption = collectAdoption(status);
  return sanitizeDeep({ status, tables, documents, graph, adoption });
}

export function writeDashboardFolder(outDir, targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const registry = readCapabilityRegistry(target);
  const locale = options.localeOverride || registry.locale;
  const bundle = buildDashboardBundle(targetInput, options);
  return writeDashboardDirectory(outDir, bundle, { repoRoot, projectRoot: target.projectRoot, docsRoot: target.docsRoot, locale, workbenchRuntime: options.workbenchRuntime === true });
}

export function writeDashboardSingleFile(outFile, targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const registry = readCapabilityRegistry(target);
  const locale = options.localeOverride || registry.locale;
  const bundle = buildDashboardBundle(targetInput, options);
  return writeDashboardFile(outFile, bundle, { repoRoot, projectRoot: target.projectRoot, docsRoot: target.docsRoot, locale });
}
