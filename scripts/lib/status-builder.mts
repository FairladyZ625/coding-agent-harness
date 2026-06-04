import path from "node:path";
import { normalizeTarget, toPosix } from "./core-shared.mjs";
import { capabilityDefinitions, readCapabilityRegistry } from "./capability-registry.mjs";
import { summarizeGitState } from "./git-status-summary.mjs";
import { createTaskStatusProjectionReader, taskStatusCutoverCounters } from "./task-repository.mjs";
import { readHarnessModules } from "./module-registry.mjs";
import { taskMatchesVisibilityScope } from "./task-semantic-projection.mjs";
import type { TaskStatusIssue, TaskStatusProjection } from "./types/task-repository.js";

type HarnessTarget = {
  projectRoot: string;
  docsOnly: boolean;
  docsRoot: string;
};

type StatusTask = TaskStatusProjection;
type StatusIssue = TaskStatusIssue;

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
  closeoutContent?: string;
  generatedAt?: string;
};

type CutoverCounters = {
  legacyVisualOnlyCount: number;
  unknownClassificationCount: number;
  weakBriefCount: number;
  visualMapRequiredCount: number;
  missingCanonicalVisualMapCount: number;
};

const taskCutoverCountersForStatus = taskStatusCutoverCounters as (tasks: StatusTask[]) => CutoverCounters;

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
  const tasks = options.tasks || createTaskStatusProjectionReader(target, {
    requireGeneratedScaffoldProvenance: options.requireGeneratedScaffoldProvenance === true,
    closeoutContent: options.closeoutContent,
    strictReviewGitAudit: true,
  }).listStatusTasks();
  const modules = harnessModulesForStatus(target);
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
      taskScopes: {
        all: tasks.length,
        activeCycle: tasks.filter((task) => taskMatchesVisibilityScope(task, "active-cycle")).length,
        reviewWorkbench: tasks.filter((task) => taskMatchesVisibilityScope(task, "review-workbench")).length,
        archiveHistory: tasks.filter((task) => taskMatchesVisibilityScope(task, "archive-history")).length,
        tombstoneHistory: tasks.filter((task) => taskMatchesVisibilityScope(task, "tombstone-history")).length,
        taskIndexDefault: tasks.filter((task) => taskMatchesVisibilityScope(task, "task-index-default")).length,
      },
      modules: modules.length,
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
    modules,
    handoffs: tasks.flatMap((task) => task.handoffs || []),
    recentActivity: tasks.slice(0, 8).map((task) => ({ at: new Date().toISOString(), type: "task", summary: task.title })),
  };
}

function harnessModulesForStatus(target: HarnessTarget): Array<Record<string, unknown>> {
  try {
    const registry = readHarnessModules(target);
    return Object.entries(registry.items || {}).map(([key, module]) => ({ key, ...module }));
  } catch {
    return [];
  }
}

function hasProjectRoot(value: unknown): value is HarnessTarget {
  return Boolean(value && typeof value === "object" && "projectRoot" in value);
}
