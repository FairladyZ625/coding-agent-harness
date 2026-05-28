import path from "node:path";
import { normalizeTarget, toPosix } from "./core-shared.mjs";
import { capabilityDefinitions, readCapabilityRegistry } from "./capability-registry.mjs";
import { summarizeGitState } from "./git-status-summary.mjs";
import { collectTasks, taskCutoverCounters } from "./task-scanner.mjs";

type HarnessTarget = {
  projectRoot: string;
  docsOnly: boolean;
  docsRoot: string;
};

type StatusTask = {
  [key: string]: unknown;
  aliases?: string[];
  briefPath?: string;
  briefSource?: string;
  closeoutStatus?: string;
  completion?: number;
  currentPath?: string;
  deletionState?: string;
  documentRefs?: unknown[];
  evidenceBundle?: string;
  executionStrategyPath?: string;
  findingsPath?: string;
  handoffs?: unknown[];
  hiddenByDefault?: boolean;
  id?: string;
  identitySource?: string;
  inferredModule?: string;
  lessonCandidateIssues?: unknown[];
  lessonCandidatePath?: string;
  lessonCandidateRows?: unknown[];
  lessonCandidateStatus?: string;
  lifecycleState?: string;
  materialIssues?: StatusIssue[];
  materialsReady?: boolean;
  module?: string;
  namespace?: string;
  originalPath?: string;
  packageRole?: string;
  path?: string;
  presetVersion?: string;
  progressPath?: string;
  queueReasons?: StatusIssue[];
  repairPrompt?: string;
  reviewPath?: string;
  reviewStatus?: string;
  reviewSubmitted?: boolean;
  risks?: unknown[];
  shortId?: string;
  state?: string;
  stateConflicts?: unknown[];
  supersededBy?: string;
  supersedes?: unknown[];
  taskKind?: string;
  taskKey?: string;
  taskPlanPath?: string;
  taskPreset?: string;
  taskQueues?: unknown[];
  taskRootKind?: string;
  title?: string;
  visualMapPath?: string;
  visualMapSource?: string;
  visualMapStatus?: string;
  walkthroughPath?: string;
};

type StatusIssue = {
  code?: string;
  message?: string;
  sourcePath?: string;
};

type CapabilityStatus = {
  name: string;
  state?: string;
};

type CapabilityRegistry = {
  mode?: string;
  capabilities: CapabilityStatus[];
};

type BuildStatusOptions = {
  validationMode?: string;
  gitState?: { summary: unknown };
  capabilityState?: {
    registry?: CapabilityRegistry;
    detected?: string[];
    warnings?: string[];
  };
  failures?: string[];
  warnings?: string[];
  legacy?: unknown;
  tasks?: StatusTask[];
  requireGeneratedScaffoldProvenance?: boolean;
  taskPlanPaths?: string[];
  closeoutContent?: string;
  generatedAt?: string;
};

type CollectTasksOptions = {
  requireGeneratedScaffoldProvenance?: boolean;
  taskPlanPaths?: string[];
  closeoutContent?: string;
};

type CutoverCounters = {
  legacyVisualOnlyCount: number;
  unknownClassificationCount: number;
  weakBriefCount: number;
  visualMapRequiredCount: number;
  missingCanonicalVisualMapCount: number;
};

const collectTasksForStatus = collectTasks as (target: HarnessTarget, options?: CollectTasksOptions) => StatusTask[];
const taskCutoverCountersForStatus = taskCutoverCounters as (tasks: StatusTask[]) => CutoverCounters;

export function buildStatusData(targetInput: HarnessTarget | string | undefined, options: BuildStatusOptions = {}) {
  const target = hasProjectRoot(targetInput) ? targetInput : normalizeTarget(targetInput) as HarnessTarget;
  const validationMode = options.validationMode || "data-only";
  const gitState = options.gitState || summarizeGitState(target);
  const registry = (options.capabilityState?.registry || readCapabilityRegistry(target)) as CapabilityRegistry;
  const detected = options.capabilityState?.detected || [];
  const capabilityWarnings = options.capabilityState?.warnings || [];
  const failures = [...(options.failures || [])];
  const warnings = [...(options.warnings || [])];
  const legacy = options.legacy || { status: "skipped", code: 0, stdout: "", stderr: "" };
  const tasks = options.tasks || collectTasksForStatus(target, {
    requireGeneratedScaffoldProvenance: options.requireGeneratedScaffoldProvenance === true,
    taskPlanPaths: options.taskPlanPaths,
    closeoutContent: options.closeoutContent,
  });
  const briefReady = tasks.filter((task) => task.briefSource === "standalone").length;
  const briefMissing = tasks.length - briefReady;
  const capabilityNames = new Map(registry.capabilities.map((capability) => [capability.name, capability]));
  for (const capability of detected) {
    if (!capabilityNames.has(capability)) capabilityNames.set(capability, { name: capability, state: "configured" });
  }
  const cutoverCounters = taskCutoverCountersForStatus(tasks);
  const fullCutoverEligible =
    validationMode === "validated" &&
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
    generatedAt: options.generatedAt || new Date().toISOString(),
    mode: registry.mode,
    checkState: {
      status: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
      validationMode,
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
      dependencyStatus: capabilityDefinitions[capability.name as keyof typeof capabilityDefinitions]?.dependencies.every((dependency: string) => capabilityNames.has(dependency))
        ? "valid"
        : "invalid",
      warnings: capabilityWarnings.filter((warning) => warning.includes(capability.name)),
    })),
    tasks,
    handoffs: tasks.flatMap((task) => task.handoffs || []),
    recentActivity: tasks.slice(0, 8).map((task) => ({ at: new Date().toISOString(), type: "task", summary: task.title })),
  };
}

function hasProjectRoot(value: unknown): value is HarnessTarget {
  return Boolean(value && typeof value === "object" && "projectRoot" in value);
}
