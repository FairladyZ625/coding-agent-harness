import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  normalizeTarget,
  normalizeLocale,
  readFileSafe,
  readJsonSafe,
  existsInDocs,
  walkFiles,
  toPosix,
  sanitizeText,
  slug,
  visualMapFile,
  legacyVisualRoadmapFile,
  inferProjectLocale,
} from "./core-shared.mjs";
import {
  readCapabilityRegistry,
  detectCapabilities,
  addCapability,
} from "./capability-registry.mjs";
import { buildStatus } from "./check-profiles.mjs";
import { collectAdoption, categorizeWarning, splitWarningMessage } from "./dashboard-data.mjs";
import { writeDashboardFolder } from "./dashboard-data.mjs";
import {
  migrationSampleFiles,
  probeTargetLocale,
  inspectGitStatus,
  ensureSessionDir,
  statusCheckSummary,
  strictDeferredFromStatus,
  writeMigrationReport,
  validateFullCutoverSession,
  recommendedMigrationCapabilities,
  migrationPhases,
} from "./migration-support.mjs";
import { taskStatusCutoverCounters } from "./task-repository.mjs";
import type { TaskStatusCutoverProjection, TaskStatusProjection } from "./task-repository.mjs";
import type { CheckTarget } from "./types/check-profiles.js";

type MigrationTarget = CheckTarget;
type MigrationStatus = ReturnType<typeof buildStatus>;
type MigrationTask = TaskStatusProjection & {
  briefSource: string;
  migrationClassification: string;
  path: string;
  shortId: string;
  state: string;
  visualMapSource: string;
  visualMapStatus: string;
};
type FullCutoverSession = Parameters<typeof validateFullCutoverSession>[0];

type MigrationPlanOptions = {
  limit?: number;
};

type MigrationRunOptions = MigrationPlanOptions & {
  allowDirty?: boolean;
  locale?: string;
  assumeLocale?: boolean;
  sessionDir?: string;
  outDir?: string;
  planOnly?: boolean;
};

type TaskAction = {
  taskId: string;
  path: string;
  files: Set<string>;
  action: string;
};

type ReviewAction = {
  path: string;
  missing: Set<string>;
  action: string;
};

type LegacyAction = Record<string, unknown>;
type WarningGroup = {
  category: string;
  count: number;
  examples: string[];
};

function requiresCanonicalMigrationVisualMap(task: { migrationClassification: string }): boolean {
  return ["active", "reopened", "current-evidence", "historical-with-diagram"].includes(task.migrationClassification);
}

type MigrationSession = {
  operation?: string;
  version?: number;
  schemaVersion?: number;
  generatedAt?: string;
  result: string;
  target: string;
  sessionDir?: string;
  planOnly?: boolean;
  localeDecision: {
    selected: string;
    source?: string;
    probe: {
      confidence: string;
    };
  };
  dashboard?: {
    dir?: string;
    indexPath?: string;
  } | null;
  capabilities: Array<{
    name: string;
    state?: string;
  }>;
  plan: {
    operation?: string;
    mode?: string;
    nextCommands?: string[];
    summary?: Record<string, unknown>;
  };
  checks: {
    normal?: ReturnType<typeof statusCheckSummary>;
    strict?: ReturnType<typeof statusCheckSummary>;
  };
  strictDeferred?: {
    owner?: string;
    trigger?: string;
    nextAction?: string;
    failureCount?: number;
  } | null;
  git?: {
    before?: ReturnType<typeof inspectGitStatus>;
    after?: ReturnType<typeof inspectGitStatus>;
  };
};

export function buildMigrationPlan(targetInput: string, { limit = 20 }: MigrationPlanOptions = {}) {
  const target = normalizeTarget(targetInput) as MigrationTarget;
  const status = buildStatus(targetInput, { strict: false, strictLegacy: false, allowLegacyTarget: true });
  const registry = readCapabilityRegistry(target);
  const locale = registry.raw ? registry.locale : inferProjectLocale(target, registry.locale);
  const adoption = collectAdoption(status);
  const warnings = adoption.warnings.map((warning) => warning.detail).filter(Boolean);
  const taskActionsByTask = new Map<string, TaskAction>();
  const reviewActionsByPath = new Map<string, ReviewAction>();
  const legacyActions: LegacyAction[] = [];
  const legacyResiduals: LegacyAction[] = [];
  const warningGroups = new Map<string, WarningGroup>();
  const tasks = status.tasks as MigrationTask[];
  const tasksByShortId = new Map(tasks.map((task) => [task.shortId, task]));

  function addTaskAction(taskId: string, actionPath: string, fileName: string, actionText: string): TaskAction {
    const existing = taskActionsByTask.get(taskId) || {
      taskId,
      path: actionPath,
      files: new Set(),
      action:
        actionText ||
        "Rewrite this task into the v1 task contract by adapting the localized task template and preserving evidence links.",
    };
    existing.files.add(fileName);
    taskActionsByTask.set(taskId, existing);
    return existing;
  }

  for (const warning of warnings) {
    const category = categorizeWarning(warning);
    const group = warningGroups.get(category) || { category, count: 0, examples: [] };
    group.count += 1;
    if (group.examples.length < 3) group.examples.push(sanitizeText(warning));
    warningGroups.set(category, group);

    const taskContract = warning.match(/(?:adoption-needed:\s*)?(docs\/09-PLANNING\/TASKS\/([^/\s]+))\s+missing\s+(execution_strategy\.md|visual_map\.md|visual_roadmap\.md)/i);
    if (taskContract) {
      const key = taskContract[2];
      const task = tasksByShortId.get(key);
      const actionFile = taskContract[3] === legacyVisualRoadmapFile ? visualMapFile : taskContract[3];
      const visualGap = actionFile === visualMapFile;
      if (!task || (task.migrationClassification !== "active" && !(visualGap && requiresCanonicalMigrationVisualMap(task)))) {
        legacyResiduals.push({
          type: "legacy-task-contract-gap",
          taskId: key,
          path: `TARGET:${taskContract[1]}`,
          missing: taskContract[3],
          reason: "Historical or unknown-state task. Do not migrate mechanically; upgrade only if reopened or reused as current evidence.",
        });
        continue;
      }
      addTaskAction(
        key,
        `TARGET:${taskContract[1]}`,
        actionFile,
        "For active, reopened, or full-cutover tasks, add standalone v1 task contract files by adapting the localized task template and preserving evidence links.",
      );
      continue;
    }

    const reviewGap = warning.match(/(?:adoption-needed:\s*)?(docs\/[^\s]+\.md)\s+missing\s+(.+)/i);
    if (reviewGap && /Reviewer Identity|Confidence Challenge|Evidence Checked|Final Confidence Basis/i.test(reviewGap[2])) {
      const key = reviewGap[1];
      const existing = reviewActionsByPath.get(key) || {
        path: `TARGET:${key}`,
        missing: new Set(),
        action: "Upgrade this review only if it is active, release-blocking, or reused as current evidence. Otherwise keep it as historical material.",
      };
      existing.missing.add(reviewGap[2]);
      reviewActionsByPath.set(key, existing);
      continue;
    }

    const legacyRequired = warning.match(/-\s+missing required file:\s+([^\s]+)/i);
    if (legacyRequired) {
      legacyActions.push({
        type: "missing-reference",
        path: `TARGET:${legacyRequired[1]}`,
        action: "Create or adapt this reference only when the related capability is intentionally adopted.",
      });
    }
  }

  const legacyVisualOnlyTasks = [];
  const unknownClassificationTasks = [];
  const weakBriefTasks = [];
  for (const task of tasks) {
    if (task.visualMapStatus === "legacy-only") {
      legacyVisualOnlyTasks.push({
        taskId: task.shortId,
        path: task.path,
        classification: task.migrationClassification,
        action: "Rewrite legacy visual_roadmap.md into canonical visual_map.md. Do not keep it as the active task map.",
      });
    }
    if (task.migrationClassification === "unknown-needs-human") {
      unknownClassificationTasks.push({
        taskId: task.shortId,
        path: task.path,
        state: task.state,
        action: "Classify whether this is active, reopened, current evidence, historical-with-diagram, or historical-no-map-needed before full cutover.",
      });
    }
    if (task.briefQuality?.status !== "pass") {
      weakBriefTasks.push({
        taskId: task.shortId,
        path: task.path,
        issues: task.briefQuality?.issues || [],
        action: "Rewrite brief.md so a human can understand the goal, status, evidence, risks, and next action without opening the full task archive.",
      });
      addTaskAction(
        task.shortId,
        task.path,
        "brief.md",
        "Rewrite the human brief and preserve links to source task evidence.",
      );
    }
    if (requiresCanonicalMigrationVisualMap(task) && task.visualMapSource !== "canonical") {
      addTaskAction(
        task.shortId,
        task.path,
        visualMapFile,
        "Rewrite task diagrams into canonical visual_map.md. Legacy visual_roadmap.md is read-only migration input.",
      );
    }
    if (task.migrationClassification === "active" && task.briefSource !== "standalone") {
      addTaskAction(
        task.shortId,
        task.path,
        "brief.md",
        "For active or reopened tasks, add standalone v1 task contract files by adapting the localized task template and preserving evidence links.",
      );
    }
  }

  const taskActions = [...taskActionsByTask.values()].map((action) => ({
    ...action,
    files: [...action.files].sort(),
    commands: [
      ...[...action.files].sort().map((file) => `copy/adapt docs/09-PLANNING/TASKS/_task-template/${file} into ${action.path}`),
      `node dist/harness.mjs task-log ${action.taskId} --message "migrated active task contract" ${target.projectRoot}`,
    ],
  }));
  const reviewActions = [...reviewActionsByPath.values()].map((action) => ({
    ...action,
    missing: [...action.missing].sort(),
  }));
  const recommendedCapabilities = recommendedMigrationCapabilities(status, target, registry);
  const missingExecutionStrategy = taskActions.filter((action) => action.files.includes("execution_strategy.md")).length;
  const missingVisualMap = taskActions.filter((action) => action.files.includes(visualMapFile)).length;
  const cutoverCounters = taskStatusCutoverCounters(tasks as TaskStatusCutoverProjection[]);
  const visualMapActions = taskActions.filter((action) => action.files.includes(visualMapFile)).length;
  const fullCutoverEligible =
    status.checkState.status === "pass" &&
    taskActions.length === 0 &&
    reviewActions.length === 0 &&
    legacyActions.length === 0 &&
    legacyResiduals.length === 0 &&
    recommendedCapabilities.length === 0 &&
    cutoverCounters.legacyVisualOnlyCount === 0 &&
    cutoverCounters.unknownClassificationCount === 0 &&
    cutoverCounters.weakBriefCount === 0 &&
    cutoverCounters.missingCanonicalVisualMapCount === 0;

  return {
    operation: "migrate-plan",
    target: target.projectRoot,
    locale,
    mode: status.mode,
    compatibility: {
      preserves: [
        "AGENTS.md and CLAUDE.md are never overwritten by safe-adoption.",
        "Existing Harness-Ledger, SSoT, walkthrough, progress, review, and historical task plans are preserved.",
        "Closed historical tasks may remain in legacy format unless they become active evidence for a strict gate.",
      ],
      strictGate: "Normal migration mode reports adoption-needed warnings; --strict remains available as the final cutover gate.",
    },
    summary: {
      tasks: status.tasks.length,
      warnings: warnings.length,
      missingExecutionStrategy,
      missingVisualMap,
      missingVisualRoadmap: missingVisualMap,
      visualMapActions,
      legacyVisualOnly: legacyVisualOnlyTasks.length,
      unknownClassification: unknownClassificationTasks.length,
      weakBrief: weakBriefTasks.length,
      missingCanonicalVisualMap: cutoverCounters.missingCanonicalVisualMapCount,
      taskActions: taskActions.length,
      reviewSchemaGaps: reviewActions.length,
      legacyReferenceGaps: legacyActions.length,
      legacyResiduals: legacyResiduals.length,
      recommendedCapabilities: recommendedCapabilities.map((capability) => capability.name),
      fullCutoverEligible,
    },
    recommendedCapabilities,
    phases: migrationPhases({ locale, recommendedCapabilities: recommendedCapabilities.map((capability) => ({ ...capability, state: "recommended" })) }),
    taskActions: taskActions.slice(0, limit),
    visualMapActions: taskActions.filter((action) => action.files.includes(visualMapFile)).slice(0, limit),
    legacyVisualOnlyTasks: legacyVisualOnlyTasks.slice(0, limit),
    unknownClassificationTasks: unknownClassificationTasks.slice(0, limit),
    weakBriefTasks: weakBriefTasks.slice(0, limit),
    reviewActions: reviewActions.slice(0, limit),
    legacyActions: legacyActions.slice(0, limit),
    legacyResiduals: legacyResiduals.slice(0, limit),
    warningGroups: [...warningGroups.values()],
    warningQueue: adoption.warnings.slice(0, limit),
    nextCommands: [
      `harness migrate-structure --plan ${target.projectRoot}`,
      `harness migrate-structure --apply ${target.projectRoot}`,
      `harness check --profile target-project ${target.projectRoot}`,
      `harness dashboard --out-dir /tmp/cah-v2-dashboard-${slug(status.project.name)} ${target.projectRoot}`,
    ],
  };
}

export function runMigration(targetInput: string, options: MigrationRunOptions = {}) {
  const target = normalizeTarget(targetInput) as MigrationTarget;
  const targetLabel = target.projectRoot;
  const beforeGit = inspectGitStatus(target.projectRoot);
  if (beforeGit.error) throw new Error(`Could not inspect git status: ${beforeGit.error.trim()}`);
  if (beforeGit.dirty && !options.allowDirty) {
    throw new Error(`Target git worktree is dirty; rerun with --allow-dirty after reviewing changes.\n${beforeGit.entries.join("\n")}`);
  }

  const localeProbe = probeTargetLocale(target);
  if (!options.locale && localeProbe.mixedLanguageDetected && !options.assumeLocale) {
    throw new Error(
      `Target contains mixed Chinese/English harness text. Choose explicitly with --locale zh-CN or --locale en-US.\nProbe: ${JSON.stringify(localeProbe.totals)}`,
    );
  }
  const selectedLocale = normalizeLocale(options.locale || localeProbe.suggested);
  const baselineStatus = buildStatus(targetInput, { strict: false, strictLegacy: false, allowLegacyTarget: true });
  const initialPlan = buildMigrationPlan(targetInput, { limit: options.limit || 50 });
  const sessionDir = ensureSessionDir(path.basename(target.projectRoot), options.sessionDir || "");
  const dashboardDir = options.outDir ? path.resolve(options.outDir) : path.join(sessionDir, "dashboard");

  let safeAdoption: ReturnType<typeof addCapability> | null = null;
  let dashboardCapability: ReturnType<typeof addCapability> | null = null;
  const safeAdoptionDryRun = addCapability(targetInput, "safe-adoption", { dryRun: true, locale: selectedLocale });
  const dashboardDryRun = addCapability(targetInput, "dashboard", { dryRun: true, locale: selectedLocale });
  let dashboardIndex = "";
  if (!options.planOnly) {
    safeAdoption = addCapability(targetInput, "safe-adoption", { dryRun: false, locale: selectedLocale });
    dashboardCapability = addCapability(targetInput, "dashboard", { dryRun: false, locale: selectedLocale });
    const writtenDashboardDir = writeDashboardFolder(dashboardDir, targetInput);
    dashboardIndex = path.join(writtenDashboardDir, "index.html");
  }

  const normalStatus = buildStatus(targetInput, { strict: false, strictLegacy: false, allowLegacyTarget: true });
  const strictStatus = buildStatus(targetInput, { strict: true, strictLegacy: true, allowLegacyTarget: true });
  const finalPlan = buildMigrationPlan(targetInput, { limit: options.limit || 50 });
  const afterGit = inspectGitStatus(target.projectRoot);
  const finalTarget = normalizeTarget(targetInput) as MigrationTarget;
  const strictDeferred = strictDeferredFromStatus(strictStatus);
  const result = options.planOnly
    ? "plan-only"
    : normalStatus.checkState.status === "fail"
      ? "failed"
      : strictStatus.checkState.status === "fail"
        ? "adopted-with-strict-deferred"
        : "complete";
  const session = {
    operation: "migrate-run",
    version: 1,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    result,
    target: targetLabel,
    sessionDir,
    planOnly: Boolean(options.planOnly),
    localeDecision: {
      selected: selectedLocale,
      source: options.locale ? "explicit" : localeProbe.mixedLanguageDetected ? "assumed-from-probe" : "probe",
      probe: localeProbe,
    },
    capabilities: readCapabilityRegistry(finalTarget).capabilities,
    baseline: {
      statusPath: path.join(sessionDir, "baseline-status.json"),
      migratePlanPath: path.join(sessionDir, "migrate-plan.json"),
      taskCount: baselineStatus.tasks.length,
      warningCount: baselineStatus.checkState.warnings,
    },
    dryRun: {
      safeAdoption: safeAdoptionDryRun.report,
      dashboard: dashboardDryRun.report,
    },
    capabilityReports: {
      safeAdoption: safeAdoption?.report || null,
      dashboard: dashboardCapability?.report || null,
    },
    dashboard: dashboardIndex ? { dir: dashboardDir, indexPath: dashboardIndex, kind: "html-folder" } : null,
    plan: finalPlan,
    checks: {
      normal: statusCheckSummary(normalStatus),
      strict: statusCheckSummary(strictStatus),
    },
    strictDeferred,
    git: {
      before: beforeGit,
      after: afterGit,
    },
  };
  const sessionPath = path.join(sessionDir, "session.json");
  fs.writeFileSync(path.join(sessionDir, "baseline-status.json"), `${JSON.stringify(baselineStatus, null, 2)}\n`);
  fs.writeFileSync(path.join(sessionDir, "migrate-plan.json"), `${JSON.stringify(initialPlan, null, 2)}\n`);
  fs.writeFileSync(path.join(sessionDir, "status-normal.json"), `${JSON.stringify(normalStatus, null, 2)}\n`);
  fs.writeFileSync(path.join(sessionDir, "status-strict.json"), `${JSON.stringify(strictStatus, null, 2)}\n`);
  fs.writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`);
  const reportPath = path.join(sessionDir, "report.md");
  fs.writeFileSync(reportPath, writeMigrationReport(session as Parameters<typeof writeMigrationReport>[0]));
  return { ...session, sessionPath, reportPath };
}

export function verifyMigrationSession(sessionPathInput: unknown, { fullCutover = false }: { fullCutover?: boolean } = {}) {
  const sessionPath = path.resolve(String(sessionPathInput || ""));
  if (!sessionPath || !fs.existsSync(sessionPath)) {
    return { operation: "migrate-verify", status: "fail", failures: [`session file not found: ${sessionPathInput}`], warnings: [] };
  }
  const failures: string[] = [];
  const warnings: string[] = [];
  let readError: unknown = null;
  const session = readJsonSafe(sessionPath, null, { onError: (error: unknown) => { readError = error; } }) as MigrationSession | null;
  if (!session) return { operation: "migrate-verify", status: "fail", failures: [`invalid session json: ${errorMessage(readError)}`], warnings };
  if (session.operation !== "migrate-run") failures.push("session operation is not migrate-run");
  if (session.schemaVersion !== 1 && session.version !== 1) failures.push("session missing schema version");
  if (session.planOnly) failures.push("plan-only session is not completed migration evidence; rerun migrate-run without --plan-only");
  if (!session.generatedAt) failures.push("session missing generatedAt");
  if (!session.sessionDir || !fs.existsSync(session.sessionDir)) failures.push(`sessionDir missing: ${session.sessionDir || "(none)"}`);
  if (!session.plan?.operation) failures.push("session missing migration plan");
  if (!session.checks?.normal || !session.checks?.strict) failures.push("session missing recorded normal/strict checks");
  if (!session.git?.before || !session.git?.after) failures.push("session missing git audit metadata");
  if (session.git?.before && session.git.before.inGit !== true) failures.push("migration target was not recorded as a git worktree");
  if (session.git?.after && session.git.after.inGit !== true) failures.push("migration target after-state was not recorded as a git worktree");
  if (!session.target || !fs.existsSync(session.target)) failures.push(`target missing: ${session.target || "(none)"}`);
  if (!session.localeDecision?.selected) failures.push("session missing locale decision");
  if (session.git?.after?.staged?.length) failures.push(`migration left staged files: ${session.git.after.staged.join(", ")}`);

  if (session.target && fs.existsSync(session.target)) {
    const target = normalizeTarget(session.target) as MigrationTarget;
    const currentGit = inspectGitStatus(target.projectRoot);
    if (currentGit.error) failures.push(`could not inspect current git status: ${currentGit.error.trim()}`);
    if (currentGit.inGit !== true) failures.push("target is not currently a git worktree");
    if (currentGit.staged.length) failures.push(`target currently has staged files: ${currentGit.staged.join(", ")}`);
    if (!session.planOnly) {
      const registry = readCapabilityRegistry(target);
      const capabilities = new Set(registry.capabilities.map((capability) => capability.name));
      if (!registry.raw) failures.push(".harness-capabilities.json was not created");
      for (const required of ["safe-adoption", "dashboard"]) {
        if (!capabilities.has(required)) failures.push(`required capability missing: ${required}`);
      }
      if (session.localeDecision?.selected && registry.locale !== session.localeDecision.selected) {
        failures.push(`registry locale ${registry.locale} does not match session locale ${session.localeDecision.selected}`);
      }
    }
    const normal = buildStatus(target.projectRoot, { strict: false, strictLegacy: false, allowLegacyTarget: true });
    if (normal.checkState.status === "fail") failures.push(`normal check fails with ${normal.checkState.failures} failures`);
    const strict = buildStatus(target.projectRoot, { strict: true, strictLegacy: true, allowLegacyTarget: true });
    if (strict.checkState.status === "fail") {
      const deferred = session.strictDeferred;
      if (session.result === "complete") failures.push("session claims complete while current strict check fails");
      if (!deferred?.owner || !deferred?.trigger || !deferred?.nextAction || !deferred?.failureCount) {
        failures.push("current strict failures need strictDeferred owner, trigger, nextAction, and failureCount");
      } else {
        warnings.push(`current strict cutover deferred: ${strict.checkState.failures} failures`);
      }
    }
  }

  if (!session.planOnly) {
    const indexPath = session.dashboard?.indexPath || "";
    const dashboardDir = session.dashboard?.dir || "";
    if (!indexPath) failures.push("session missing dashboard index path");
    if (indexPath && !/\.html?$/i.test(indexPath)) failures.push(`dashboard index is not HTML: ${indexPath}`);
    if (indexPath && path.basename(indexPath) !== "index.html") failures.push(`dashboard index must be index.html: ${indexPath}`);
    if (indexPath && !fs.existsSync(indexPath)) failures.push(`dashboard index not found: ${indexPath}`);
    if (/\.md$/i.test(indexPath)) failures.push(`dashboard path points to Markdown: ${indexPath}`);
    if (indexPath && dashboardDir && path.resolve(indexPath) !== path.join(path.resolve(dashboardDir), "index.html")) {
      failures.push(`dashboard index is not inside dashboard dir: ${indexPath}`);
    }
    for (const required of ["assets/dashboard-data.js", "data/status.json", "data/adoption.json"]) {
      if (dashboardDir && !fs.existsSync(path.join(dashboardDir, required))) failures.push(`dashboard folder missing ${required}`);
    }
    const dashboardHtml = indexPath && fs.existsSync(indexPath) ? readFileSafe(indexPath) : "";
    if (dashboardHtml && !dashboardHtml.includes("dashboard-data.js")) failures.push("dashboard index does not load dashboard-data.js");
    const dataScriptPath = dashboardDir ? path.join(dashboardDir, "assets/dashboard-data.js") : "";
    const dataScript = dataScriptPath && fs.existsSync(dataScriptPath) ? readFileSafe(dataScriptPath) : "";
    const dataMatch = dataScript.match(/window\.__HARNESS_DASHBOARD__\s*=\s*([\s\S]*);\s*$/);
    if (!dataMatch) {
      failures.push("dashboard-data.js does not contain a generated dashboard bundle");
    } else {
      try {
        const dashboardBundle = JSON.parse(dataMatch[1]) as Record<string, unknown>;
        const dashboardStatus = asRecord(dashboardBundle.status);
        const dashboardProject = asRecord(dashboardStatus.project);
        const dashboardCheckState = dashboardStatus.checkState;
        const dashboardAdoption = asRecord(dashboardBundle.adoption);
        const expectedProjectName = session.target ? path.basename(session.target) : "";
        if (dashboardStatus.schemaVersion !== 2) failures.push("dashboard bundle missing status schemaVersion 2");
        if (expectedProjectName && dashboardProject.name !== expectedProjectName) {
          failures.push(`dashboard bundle project ${dashboardProject.name || "(none)"} does not match target ${expectedProjectName}`);
        }
        if (!dashboardCheckState) failures.push("dashboard bundle missing checkState");
        if (!Array.isArray(dashboardAdoption.warnings)) failures.push("dashboard bundle missing adoption warnings array");
      } catch (error) {
        failures.push(`dashboard-data.js contains invalid dashboard JSON: ${errorMessage(error)}`);
      }
    }
  }

  if (session.checks?.normal?.status === "fail") failures.push("recorded normal check failed");
  if (session.checks?.strict?.status === "fail") {
    const deferred = session.strictDeferred;
    if (!deferred?.owner || !deferred?.trigger || !deferred?.nextAction || !deferred?.failureCount) {
      failures.push("strict failures need strictDeferred owner, trigger, nextAction, and failureCount");
    } else {
      warnings.push(`strict cutover deferred: ${deferred.failureCount} failures`);
    }
  }

  if (fullCutover) {
    validateFullCutoverSession({ ...session, dashboard: session.dashboard || undefined } as FullCutoverSession, failures);
  }

  return {
    operation: "migrate-verify",
    status: failures.length ? "fail" : "pass",
    fullCutover: Boolean(fullCutover),
    sessionPath,
    target: session.target || "",
    result: session.result || "",
    dashboard: session.dashboard || null,
    strictDeferred: session.strictDeferred || null,
    failures,
    warnings,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown parse error";
}
