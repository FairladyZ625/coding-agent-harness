// Dashboard bundle aggregation is an explicit transport contract for the generated UI.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  readDashboardBundle,
} from "../application/dashboard/bundle-reader.mjs";
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
  parseTaskState,
  isActiveTaskState,
  createTaskStatusProjectionReader,
} from "./task-repository.mjs";
import { writeDashboardDirectory, writeDashboardFile } from "./dashboard-writer.mjs";
import { listPresetPackageLayers } from "./preset-registry.mjs";
import { validateGovernanceTableBoundaries } from "./governance-table-boundary.mjs";
import { summarizeGitState } from "./git-status-summary.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";
import type { DashboardBundleReader, DashboardBundleReadOptions } from "../application/dashboard/bundle-reader.mjs";
import type { TaskStatusProjection } from "./task-repository.mjs";
import type { CheckTarget } from "./types/check-profiles.js";

type DashboardTarget = CheckTarget & {
  harness: ResolvedHarnessPaths;
};

type DashboardOptions = {
  home?: string;
  localeOverride?: string;
  recoverGeneratedDashboard?: boolean;
  replaceExistingDashboardOutput?: boolean;
  skipLegacyCheck?: boolean;
  tasks?: DashboardTaskRef[];
  workbenchRuntime?: boolean;
} & Record<string, unknown>;

type DashboardDocumentPath = {
  file: string;
  virtualPath?: string;
  virtualContent?: string;
  virtualTitle?: string;
  partial?: boolean;
  partialReason?: string;
  taskId?: string;
};

type DashboardDocument = {
  id: string;
  path: string;
  title: string;
  type: string;
  content: string;
  partial?: boolean;
  partialReason?: string;
  taskId?: string;
};

type DashboardTable = ReturnType<typeof parseAllMarkdownTables>[number];
type DashboardTables = {
  tables: DashboardTable[];
};

type DashboardStatus = ReturnType<typeof buildStatusData>;
export const dashboardBundleSchemaVersion = "dashboard-bundle/v1";
type DashboardNode = Record<string, unknown> & {
  id: string;
  type: string;
  label?: string;
  state?: unknown;
};
type DashboardEdge = {
  from: string;
  to: string;
  type: string;
};
export type DashboardBundle = {
  schemaVersion: typeof dashboardBundleSchemaVersion;
  status: DashboardStatus;
  tables: DashboardTables;
  documents: { documents: DashboardDocument[] };
  graph: { nodes: DashboardNode[]; edges: DashboardEdge[] };
  modules: DashboardModuleSummary[];
  moduleSummary: Record<string, unknown>;
  adoption: ReturnType<typeof collectAdoption>;
  presetCatalog: ReturnType<typeof collectPresetCatalog>;
};
type DashboardTaskRef = Partial<TaskStatusProjection> & {
  closeoutStatus?: string;
  id?: string;
  taskPlanPath?: string;
};
type DashboardModuleSummary = Record<string, unknown> & {
  key: string;
  title?: string;
  source: string;
  counts: Record<string, number>;
  tasks: Array<Record<string, unknown>>;
  dashboardModuleView?: Record<string, unknown>;
  moduleProjection?: Record<string, unknown>;
};
type DashboardPhaseRef = {
  id: string;
  state?: string;
  completion?: number;
  kind?: string;
  actor?: string;
  exitCommand?: string;
  dependsOn?: string[];
};
type DashboardHandoffRef = {
  id: string;
  summary?: string;
  state?: string;
};

export function collectMarkdownDocuments(target: DashboardTarget, options: DashboardOptions = {}): DashboardDocument[] {
  const docs = collectDashboardDocumentPaths(target, options);
  return docs.map((entry, index) => {
    const file = entry.file;
    const content = sanitizeText(entry.virtualContent ?? readFileSafe(file));
    const source = entry.virtualPath || prefixedPath(target, file);
    return {
      id: `doc-${String(index + 1).padStart(4, "0")}-${slug(path.basename(file, ".md"))}`,
      path: source,
      title: entry.virtualTitle || titleFromMarkdown(content, path.basename(file)),
      type: documentKind(source),
      content,
      ...(entry.partial ? { partial: true, partialReason: entry.partialReason || "partial", taskId: entry.taskId || "" } : {}),
    };
  });
}

function collectDashboardDocumentPaths(target: DashboardTarget, options: DashboardOptions = {}): DashboardDocumentPath[] {
  const harnessPaths = target.harness || resolveHarnessPaths(target);
  const selected = new Set<string>();
  const partial = new Map<string, Omit<DashboardDocumentPath, "file">>();
  const addAbsolutePath = (file: string) => {
    if (file && fs.existsSync(file)) selected.add(file);
  };
  const addDocsPath = (relativePath: string) => {
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
  const tasks = options.tasks || createTaskStatusProjectionReader(target, { strictReviewGitAudit: true }).listStatusTasks();
  const tasksByPlanPath = new Map(tasks.map((task) => [
    targetAbsolutePath(target, String(task.taskPlanPath || "")),
    task,
  ]));
  for (const listedTask of tasks) {
    const taskPlanPath = targetAbsolutePath(target, String(listedTask.taskPlanPath || ""));
    if (!taskPlanPath || !fs.existsSync(taskPlanPath)) continue;
    const taskDir = path.dirname(taskPlanPath);
    const progress = readFileSafe(path.join(taskDir, "progress.md"));
    const state = parseTaskState(progress);
    const active = isActiveTaskState(state);
    const taskRef = tasksByPlanPath.get(taskPlanPath);
    const historicalClosed = !active && taskRef?.closeoutStatus === "closed";
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
            taskId: taskRef?.id || path.basename(taskDir),
          });
        }
      }
    }
    if (!historicalClosed) {
      for (const file of collectTaskLocalMaterialMarkdown(taskDir)) selected.add(file);
      const artifactManifest = taskArtifactManifestDocument(target, taskDir);
      if (artifactManifest) selected.add(JSON.stringify(artifactManifest));
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
    .map((entry) => parseSelectedDocumentEntry(entry))
    .filter((entry) => !isArchivedHarnessPath(entry.file))
    .filter((entry) => !entry.file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((entry) => !entry.file.includes(`${path.sep}_optional-structures${path.sep}`))
    .sort((a, b) => (a.virtualPath || a.file).localeCompare(b.virtualPath || b.file))
    .map((entry) => ({ ...entry, ...(partial.get(entry.file) || {}) }));
}

function parseSelectedDocumentEntry(entry: string): DashboardDocumentPath {
  if (!entry.startsWith("{")) return { file: entry };
  try {
    const parsed = JSON.parse(entry) as DashboardDocumentPath;
    if (parsed.file && parsed.virtualPath && parsed.virtualContent) return parsed;
  } catch {
    return { file: entry };
  }
  return { file: entry };
}

function collectTaskLocalMaterialMarkdown(taskDir: string): string[] {
  const files: string[] = [];
  for (const folderName of ["references", "artifacts"]) {
    const folder = path.join(taskDir, folderName);
    for (const file of walkFiles(folder)) {
      if (file.endsWith(".md")) files.push(file);
    }
  }
  return files;
}

function taskArtifactManifestDocument(target: DashboardTarget, taskDir: string): DashboardDocumentPath | null {
  const artifactsRoot = path.join(taskDir, "artifacts");
  if (!fs.existsSync(artifactsRoot)) return null;
  const artifactFiles = walkFiles(artifactsRoot)
    .filter((file) => !file.endsWith(".md"))
    .filter((file) => !path.basename(file).startsWith("."))
    .sort();
  if (!artifactFiles.length) return null;
  const taskPath = prefixedPath(target, taskDir);
  const virtualPath = `${taskPath}/artifacts/__dashboard_artifacts.md`;
  const rows = artifactFiles.map((file, index) => {
    const relative = toPosix(path.relative(taskDir, file));
    const stat = fs.statSync(file);
    return `| ART-${String(index + 1).padStart(3, "0")} | \`${relative}\` | ${stat.size} |`;
  });
  return {
    file: path.join(artifactsRoot, "__dashboard_artifacts.md"),
    virtualPath,
    virtualTitle: "Artifacts",
    virtualContent: [
      "# Artifacts",
      "",
      "Task-local artifact files discovered by the Dashboard bundle. Non-markdown files are listed here so task evidence is not hidden when `artifacts/INDEX.md` is missing.",
      "",
      "| ID | Path | Bytes |",
      "| --- | --- | ---: |",
      ...rows,
      "",
    ].join("\n"),
  };
}

function documentKind(source: string): string {
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
  if (lower.endsWith("/artifacts/__dashboard_artifacts.md")) return "task-artifacts";
  if (lower.includes("/references/")) return "task-references";
  if (lower.includes("/artifacts/")) return "task-artifacts";
  if (lower.endsWith("/execution_strategy.md")) return "execution-strategy";
  if (lower.endsWith("/visual_map.md")) return "visual-map";
  if (lower.endsWith("/visual_roadmap.md")) return "legacy-visual-roadmap";
  if (lower.endsWith("/module_plan.md")) return "module-plan";
  return "markdown-table";
}

export function collectTables(documents: DashboardDocument[]): DashboardTables {
  return {
    tables: documents.flatMap((document) => parseAllMarkdownTables(document.content, document.path, documentKind(document.path))),
  };
}

export function collectGraph(status: DashboardStatus, tables: DashboardTables = { tables: [] }, target: DashboardTarget | null = null) {
  const harnessPaths = target?.harness || null;
  const nodes: DashboardNode[] = [];
  const edges: DashboardEdge[] = [];
  const seenNodes = new Map<string, DashboardNode>();
  const addNode = (node: DashboardNode) => {
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
  const addEdge = (edge: DashboardEdge) => {
    if (!edge.from || !edge.to || edge.from === edge.to) return;
    edges.push(edge);
  };
  for (const task of status.tasks) {
    addNode({ id: `task:${task.id}`, type: "task", label: task.title, state: task.state, completion: task.completion });
    for (const phase of dashboardTaskPhases(task)) {
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
    for (const handoff of dashboardTaskHandoffs(task)) {
      const handoffId = `handoff:${handoff.id}`;
      addNode({ id: handoffId, type: "handoff", label: handoff.summary, state: handoff.state });
      addEdge({ from: `task:${task.id}`, to: handoffId, type: "handoff" });
    }
  }
  for (const module of Array.isArray((status as Record<string, unknown>).modules) ? (status as Record<string, unknown>).modules as Array<Record<string, unknown>> : []) {
    const key = String(module.key || "");
    if (!key) continue;
    const moduleId = `module:${key}`;
    const currentStep = String(module.currentStep || "");
    const state = module.status || "planned";
    addNode({
      id: moduleId,
      type: "module",
      label: String(module.title || key),
      state,
      currentStep,
      ...moduleDocumentPaths(target, key),
    });
    if (currentStep) {
      const stepId = `step:${currentStep}`;
      if (!seenNodes.has(stepId)) addNode({ id: stepId, type: "step", label: currentStep, state, module: key });
      addEdge({ from: moduleId, to: stepId, type: "current_step" });
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
          label: getCell(row.cells, ["Title", "Name", "Module", "模块名称", "模块"], key),
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

function dashboardTaskPhases(task: Record<string, unknown>): DashboardPhaseRef[] {
  return Array.isArray(task.phases) ? task.phases as DashboardPhaseRef[] : [];
}

function dashboardTaskHandoffs(task: Record<string, unknown>): DashboardHandoffRef[] {
  return Array.isArray(task.handoffs) ? task.handoffs as DashboardHandoffRef[] : [];
}

function moduleKeyFromPlanSource(source: string, target: DashboardTarget | null): string {
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

function targetAbsolutePath(target: DashboardTarget, targetPath: string): string {
  const withoutPrefix = String(targetPath || "").replace(/^TARGET:/, "");
  if (!withoutPrefix) return "";
  if (path.isAbsolute(withoutPrefix)) return withoutPrefix;
  return path.join(target.projectRoot, withoutPrefix.replace(/^\/+/, ""));
}

function moduleDocumentPaths(target: DashboardTarget | null, moduleKey: string) {
  if (!target?.harness?.modulesRoot || !moduleKey) return {};
  const brief = path.join(target.harness.modulesRoot, moduleKey, "brief.md");
  const modulePlan = path.join(target.harness.modulesRoot, moduleKey, "module_plan.md");
  return {
    ...(fs.existsSync(brief) ? { briefPath: prefixedPath(target, brief) } : {}),
    ...(fs.existsSync(modulePlan) ? { modulePlanPath: prefixedPath(target, modulePlan) } : {}),
  };
}

function collectDashboardModules(status: DashboardStatus, target: DashboardTarget): { modules: DashboardModuleSummary[]; summary: Record<string, unknown> } {
  const tasks = Array.isArray(status.tasks) ? status.tasks as Array<Record<string, unknown>> : [];
  const registered = Array.isArray((status as Record<string, unknown>).modules)
    ? (status as Record<string, unknown>).modules as Array<Record<string, unknown>>
    : [];
  const modules = new Map<string, DashboardModuleSummary>();
  for (const module of registered) {
    const key = String(module.key || "").trim();
    if (!key) continue;
    modules.set(key, {
      ...module,
      key,
      title: String(module.title || key),
      source: "registry",
      ...moduleDocumentPaths(target, key),
      counts: emptyModuleCounts(),
      tasks: [],
    });
  }
  for (const task of tasks) {
    if (isArchivedDashboardTask(task)) continue;
    const key = dashboardTaskModuleKey(task);
    if (key === "legacy-unclassified") continue;
    if (!modules.has(key)) {
      modules.set(key, {
        key,
        title: key,
        source: "inferred",
        status: String(task.classificationSource || "inferred"),
        ...moduleDocumentPaths(target, key),
        counts: emptyModuleCounts(),
        tasks: [],
      });
    }
    const module = modules.get(key);
    if (!module) continue;
    accumulateModuleTask(module, task);
  }
  const unclassifiedTasks = tasks.filter((task) => !isArchivedDashboardTask(task) && dashboardTaskModuleKey(task) === "legacy-unclassified");
  const moduleList = [...modules.values()].map(withDashboardModuleView).sort((left, right) => {
    const leftStatus = String(left.dashboardModuleView?.statusKey || left.status || "");
    const rightStatus = String(right.dashboardModuleView?.statusKey || right.status || "");
    if (leftStatus === "in_progress" && rightStatus !== "in_progress") return -1;
    if (rightStatus === "in_progress" && leftStatus !== "in_progress") return 1;
    return left.key.localeCompare(right.key);
  });
  return {
    modules: moduleList,
    summary: {
      total: moduleList.length,
      registered: registered.length,
      inferred: moduleList.filter((module) => module.source === "inferred").length,
      active: moduleList.filter((module) => Number(module.counts.active || 0) > 0).length,
      risk: moduleList.reduce((sum, module) => sum + Number(module.counts.risk || 0), 0),
      unclassifiedTasks: unclassifiedTasks.length,
    },
  };
}

function withDashboardModuleView(module: DashboardModuleSummary): DashboardModuleSummary {
  const sourceKind = normalizedModuleSourceKind(module.source);
  const statusKey = normalizedModuleStatusKey(module.status || (Number(module.counts.active || 0) > 0 ? "in_progress" : "planned"));
  const view = {
    key: module.key,
    title: module.title || module.key,
    sourceKind,
    sourceLabelKey: moduleSourceLabelKey(sourceKind),
    statusKey,
    statusLabelKey: moduleStatusLabelKey(statusKey),
    statusTone: moduleStatusTone(statusKey),
    counts: module.counts,
  };
  return {
    ...module,
    dashboardModuleView: view,
    moduleProjection: view,
  };
}

function normalizedModuleSourceKind(value: unknown): string {
  const source = String(value || "").trim();
  if (source === "registry" || source === "inferred" || source === "structure" || source === "graph") return source;
  return source || "unknown";
}

function moduleSourceLabelKey(sourceKind: string): string {
  const map: Record<string, string> = {
    registry: "moduleSourceRegistry",
    inferred: "moduleSourceInferred",
    structure: "moduleSourceStructure",
    graph: "moduleSourceGraph",
    unknown: "moduleSourceUnknown",
  };
  return map[sourceKind] || "moduleSourceUnknown";
}

function normalizedModuleStatusKey(value: unknown): string {
  const status = String(value || "").trim().replaceAll("-", "_");
  if (status === "in_progress" || status === "planned" || status === "active" || status === "blocked" || status === "done" || status === "unknown") return status;
  if (status === "registry" || status === "structure" || status === "inferred") return "planned";
  return status || "unknown";
}

function moduleStatusLabelKey(statusKey: string): string {
  const map: Record<string, string> = {
    active: "active",
    in_progress: "state_in_progress",
    planned: "state_planned",
    blocked: "state_blocked",
    done: "state_done",
    unknown: "state_unknown",
  };
  return map[statusKey] || `state_${statusKey}`;
}

function moduleStatusTone(statusKey: string): string {
  if (statusKey === "blocked") return "fail";
  if (statusKey === "planned" || statusKey === "unknown") return "warn";
  if (statusKey === "active" || statusKey === "in_progress" || statusKey === "done") return "pass";
  return "";
}

function emptyModuleCounts(): Record<string, number> {
  return {
    total: 0,
    active: 0,
    in_progress: 0,
    review: 0,
    blocked: 0,
    done: 0,
    planned: 0,
    not_started: 0,
    unknown: 0,
    risk: 0,
    missingDocs: 0,
  };
}

function accumulateModuleTask(module: DashboardModuleSummary, task: Record<string, unknown>): void {
  const state = dashboardTaskStateValue(task);
  module.counts.total += 1;
  module.counts[state] = (module.counts[state] || 0) + 1;
  if (["active", "missing-materials", "blocked", "review", "lessons"].includes(state)) module.counts.active += 1;
  if (dashboardTaskHasRisk(task)) module.counts.risk += 1;
  if (dashboardTaskMissingDocs(task)) module.counts.missingDocs += 1;
  if (module.tasks.length < 16) {
    module.tasks.push({
      id: task.id,
      shortId: task.shortId,
      title: task.title,
      state,
      completion: task.completion,
      reviewStatus: task.reviewStatus,
      closeoutStatus: task.closeoutStatus,
      lifecycleState: task.lifecycleState,
      taskLifecycleProjection: task.taskLifecycleProjection,
      dashboardTaskView: task.dashboardTaskView,
      reviewWorkbenchQueueView: task.reviewWorkbenchQueueView,
      semanticProjection: task.semanticProjection,
      taskQueues: task.taskQueues,
      queueReasons: task.queueReasons,
      visualMapStatus: task.visualMapStatus,
      briefSource: task.briefSource,
      path: task.path,
    });
  }
}

function dashboardTaskModuleKey(task: Record<string, unknown>): string {
  return String(task.module || task.inferredModule || "legacy-unclassified");
}

function isArchivedDashboardTask(task: Record<string, unknown>): boolean {
  const archiveState = String((task.archiveMetadata as Record<string, unknown> | undefined)?.state || "").toLowerCase();
  return task.deletionState === "archived" || archiveState === "archived";
}

function dashboardTaskHasRisk(task: Record<string, unknown>): boolean {
  const reviewView = dashboardTaskReviewWorkbenchQueueView(task);
  const lifecycle = dashboardTaskLifecycleProjection(task);
  if (reviewView.blocked === true || reviewView.needsMaterials === true) return true;
  if (Array.isArray(reviewView.reasonCodes) && reviewView.reasonCodes.length > 0) return true;
  if (dashboardTaskStateValue(task) === "blocked") return true;
  if (String(lifecycle.reviewStatus || "").includes("blocked")) return true;
  if (Array.isArray(task.materialIssues) && task.materialIssues.length > 0) return true;
  if (Array.isArray(task.queueReasons) && task.queueReasons.length > 0) return true;
  if (String(task.visualMapStatus || "") === "missing") return true;
  return false;
}

function dashboardTaskStateValue(task: Record<string, unknown>): string {
  const reviewView = dashboardTaskReviewWorkbenchQueueView(task);
  if (reviewView.primaryQueue) return String(reviewView.primaryQueue);
  const queues = Array.isArray(reviewView.queues) ? reviewView.queues : [];
  if (queues.length) return String(queues[0]);
  return "active";
}

function dashboardTaskLifecycleProjection(task: Record<string, unknown>): Record<string, unknown> {
  const direct = task.taskLifecycleProjection;
  if (direct && typeof direct === "object") return direct as Record<string, unknown>;
  const projection = task.semanticProjection;
  if (projection && typeof projection === "object") {
    const nested = (projection as Record<string, unknown>).taskLifecycleProjection;
    if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  }
  return {};
}

function dashboardTaskReviewWorkbenchQueueView(task: Record<string, unknown>): Record<string, unknown> {
  const direct = task.reviewWorkbenchQueueView;
  if (direct && typeof direct === "object") return direct as Record<string, unknown>;
  const projection = task.semanticProjection;
  if (projection && typeof projection === "object") {
    const nested = (projection as Record<string, unknown>).reviewWorkbenchQueueView;
    if (nested && typeof nested === "object") return nested as Record<string, unknown>;
  }
  return {};
}

function dashboardTaskMissingDocs(task: Record<string, unknown>): boolean {
  return task.briefSource !== "standalone" || String(task.visualMapStatus || "") === "missing";
}

export function categorizeWarning(message: string): string {
  if (/governance-table-entropy/i.test(message)) return "Governance Table Boundary";
  if (/missing execution_strategy\.md|missing visual_(?:map|roadmap)\.md|Visual (?:Map|Roadmap)/i.test(message)) return "Plan Contract Missing";
  if (new RegExp(`${legacyCompatMode}|adoption-needed|legacy check`, "i").test(message)) return "Adoption Advice";
  if (/Evidence|evidence/i.test(message)) return "Missing Evidence";
  if (/schema|missing .*columns|invalid/i.test(message)) return "Schema Drift";
  return "Review Finding";
}

function warningType(message: string): string {
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

function warningScope(message: string): string {
  if (/(?:docs\/09-PLANNING\/TASKS|coding-agent-harness\/planning\/tasks)\//i.test(message)) return "task";
  if (/(?:docs\/09-PLANNING\/MODULES|coding-agent-harness\/planning\/modules)\//i.test(message)) return "module";
  if (/review\.md|findings table/i.test(message)) return "review";
  if (/docs\/11-REFERENCE\//i.test(message)) return "reference";
  if (new RegExp(`\\.harness-capabilities\\.json|capability|${legacyCompatMode}`, "i").test(message)) return "capability";
  return "project";
}

function warningPhase(type: string, scope: string): string {
  if (type === "capability-adoption") return "baseline";
  if (type === "governance-table-entropy") return "global-table-boundary";
  if (type === "missing-brief" || type === "missing-execution-strategy" || type === "missing-visual-map" || type === "missing-visual-roadmap") return "active-task-contracts";
  if (scope === "module") return "module-classification";
  if (type === "review-schema-gap" || type === "missing-evidence") return "review-evidence";
  if (type === "legacy-reference-gap" || type === "schema-drift") return "strict-cutover";
  return "triage";
}

function warningFixability(type: string, scope: string): string {
  if (["missing-brief", "missing-execution-strategy", "missing-visual-map", "missing-visual-roadmap"].includes(type)) return "guided";
  if (type === "governance-table-entropy") return "manual";
  if (type === "legacy-reference-gap" || scope === "reference") return "template";
  if (type === "capability-adoption") return "decision";
  if (type === "review-schema-gap" || type === "missing-evidence") return "human-evidence";
  return "manual";
}

function warningPriority(type: string, scope: string, message: string): string {
  if (/fail|invalid|blocked/i.test(message) || type === "schema-drift") return "P1";
  if (type === "governance-table-entropy") return /legacy-report-only/i.test(message) ? "P3" : "P2";
  if (["missing-brief", "missing-execution-strategy", "missing-visual-map", "missing-visual-roadmap"].includes(type) && scope === "task") return "P2";
  if (type === "review-schema-gap" || type === "missing-evidence") return "P2";
  if (type === "capability-adoption") return "P3";
  return "P3";
}

function warningConfidence(message: string): string {
  if (/legacy|unknown|fallback/i.test(message)) return "medium";
  return "high";
}

function warningAffectedPaths(message: string): string[] {
  const matches = String(message).match(/(?:docs|\.harness-private|coding-agent-harness)\/[^\s:]+|\.harness-capabilities\.json|AGENTS\.md|CLAUDE\.md/g) || [];
  return [...new Set(matches.map((item) => item.replace(/[),.;]+$/, "")))];
}

function summarizeWarnings(warnings: Array<Record<string, unknown>>): Record<string, unknown> {
  const countBy = (field: string): Record<string, number> => {
    const counts: Record<string, number> = {};
    for (const warning of warnings) {
      const key = String(warning[field] || "unknown");
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  };
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

export function collectAdoption(status: DashboardStatus) {
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
  const existingBriefPaths = new Set(warnings.filter((warning) => warning.type === "missing-brief").map((warning) => warning.affected));
  const briefWarnings = (Array.isArray(status.tasks) ? status.tasks as Array<Record<string, unknown>> : [])
    .filter((task) => task.briefSource !== "standalone")
    .filter((task) => !existingBriefPaths.has(String(task.path || "")))
    .map((task, index) => {
      const state = dashboardTaskStateValue(task);
      return {
        id: `VB-${String(index + 1).padStart(3, "0")}`,
        category: "Visibility Layer",
        type: "missing-brief",
        scope: "task",
        priority: ["active", "missing-materials", "blocked", "review", "lessons"].includes(state) ? "P2" : "P3",
        phase: "active-task-contracts",
        fixability: "guided",
        status: "open",
        confidence: state === "unknown" ? "medium" : "high",
        severity: "advice",
        title: "Visibility brief missing",
        affected: String(task.path || ""),
        affectedPaths: [String(task.path || "")].filter(Boolean),
        requiredAction: "Add a human-readable brief before this task is treated as migrated.",
        detail: `${String(task.id || "")} ${String(task.title || "")}`.trim(),
      };
    });
  const warningQueue = [...warnings, ...briefWarnings];
  return {
    mode: status.mode,
    project: status.project,
    summary: {
      blockers: status.checkState.failures,
      advice: warningQueue.length,
      ...summarizeWarnings(warningQueue),
    },
    warnings: warningQueue,
    warningProjection: {
      queue: warningQueue,
    },
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

function governanceWarningRowKey(message: string): string {
  const match = String(message || "").match(/\brow\s+([^:]+)/i);
  return match ? match[1].trim() : "global-table";
}

function stableWarningIdPart(value: string): string {
  return String(value || "global-table")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "global-table";
}

export function splitWarningMessage(message: string): string[] {
  return String(message || "")
    .split(/\n-\s+/)
    .map((item, index) => (index === 0 ? item : `- ${item}`))
    .filter(Boolean);
}

function warningTitle(message: string): string {
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

function warningAffected(message: string): string {
  const target = String(message).match(/(?:docs|\.harness-private)\/[^\s:]+/);
  return target ? target[0] : "project";
}

function warningAction(message: string): string {
  if (/governance-table-entropy/i.test(message)) return "Move local detail to module/task docs; keep the global row to summary, state, route, and audit result.";
  if (/execution_strategy\.md/i.test(message)) return "Add standalone execution strategy file.";
  if (/visual_map\.md|Visual Map/i.test(message)) return "Add standalone visual map file.";
  if (/visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Rewrite legacy visual_roadmap.md into canonical visual_map.md.";
  if (/review\.md missing/i.test(message)) return "Update review.md to v1 review schema.";
  if (/legacy/i.test(message)) return "Review manually; do not auto-migrate.";
  return "Inspect source document and decide whether to adopt v1 contract.";
}

export function buildDashboardBundle(targetInput: string, options: DashboardOptions = {}): DashboardBundle {
  const target = normalizeTarget(targetInput) as DashboardTarget;
  const tasks = options.tasks || createTaskStatusProjectionReader(target, { strictReviewGitAudit: true }).listStatusTasks();
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
    tasks,
    legacy,
    failures: [...capabilityState.failures, ...governanceBoundaries.failures],
    warnings: [...capabilityState.warnings, ...legacyWarnings, ...governanceBoundaries.warnings, ...gitState.warnings],
  });
  const documents = { documents: collectMarkdownDocuments(target, { tasks: status.tasks as DashboardTaskRef[] }) };
  attachDocumentProjection(status, documents.documents);
  const tables = collectTables(documents.documents);
  const graph = collectGraph(status, tables, target);
  const modules = collectDashboardModules(status, target);
  const adoption = collectAdoption(status);
  const presetCatalog = collectPresetCatalog(targetInput, target, options);
  return sanitizeDeep({
    schemaVersion: dashboardBundleSchemaVersion,
    status,
    tables,
    documents,
    graph,
    modules: modules.modules,
    moduleSummary: modules.summary,
    adoption,
    presetCatalog,
  }) as DashboardBundle;
}

export function createDashboardBundleReader(): DashboardBundleReader<DashboardBundle> {
  return {
    readDashboardBundle(targetInput: string, options: DashboardBundleReadOptions = {}) {
      return buildDashboardBundle(targetInput, options as DashboardOptions);
    },
  };
}

function attachDocumentProjection(status: DashboardStatus, documents: DashboardDocument[]): void {
  const tasks = Array.isArray(status.tasks) ? status.tasks as Array<Record<string, unknown>> : [];
  for (const task of tasks) {
    const taskPath = String(task.path || "");
    if (!taskPath) continue;
    const byKey: Record<string, DashboardDocument> = {};
    for (const document of documents) {
      if (document.path !== taskPath && !document.path.startsWith(`${taskPath}/`)) continue;
      const key = documentKeyForTaskPath(taskPath, document.path);
      if (key) byKey[key] = document;
    }
    task.documentsByKey = byKey;
    task.documentProjection = { byKey };
  }
}

function documentKeyForTaskPath(taskPath: string, documentPath: string): string {
  const relative = documentPath.slice(taskPath.length).replace(/^\/+/, "");
  if (!relative) return "";
  return relative;
}

function runDashboardCompatibilityCheck(target: DashboardTarget) {
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

export function collectPresetCatalog(targetInput: string, target: DashboardTarget = normalizeTarget(targetInput) as DashboardTarget, options: DashboardOptions = {}) {
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
  const countSource = (source: string) => presets.filter((preset) => preset.source === source).length;
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

export function writeDashboardFolder(outDir: string, targetInput: string, options: DashboardOptions = {}, reader: DashboardBundleReader<DashboardBundle> = createDashboardBundleReader()) {
  const target = normalizeTarget(targetInput) as DashboardTarget;
  const registry = readCapabilityRegistry(target);
  const locale = options.localeOverride || registry.locale;
  const bundle = readDashboardBundle(reader, targetInput, options);
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

export function writeDashboardSingleFile(outFile: string, targetInput: string, options: DashboardOptions = {}, reader: DashboardBundleReader<DashboardBundle> = createDashboardBundleReader()) {
  const target = normalizeTarget(targetInput) as DashboardTarget;
  const registry = readCapabilityRegistry(target);
  const locale = options.localeOverride || registry.locale;
  const bundle = readDashboardBundle(reader, targetInput, options);
  return writeDashboardFile(outFile, bundle, { repoRoot, projectRoot: target.projectRoot, docsRoot: target.docsRoot, locale });
}
