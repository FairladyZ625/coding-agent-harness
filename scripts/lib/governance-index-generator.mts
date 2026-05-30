// Governance index rendering stays behavior-first until task/governance surface types are modeled.

import fs from "node:fs";
import path from "node:path";
import {
  normalizeTarget,
  readBundledTemplate,
  todayDate,
  toPosix,
} from "./core-shared.mjs";
import { splitMarkdownRow } from "./markdown-utils.mjs";
import { collectTasks } from "./task-scanner.mjs";
import { buildTaskIndex } from "./task-index.mjs";
import {
  beginGovernanceSync,
  commitGovernanceSync,
  moduleGeneratedIndexSurfaces,
  releaseGovernanceSync,
} from "./governance-sync.mjs";
import { markdownCell } from "./task-lifecycle/text-utils.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";

type GovernanceTarget = ReturnType<typeof normalizeTarget> & {
  projectRoot: string;
  harness: ResolvedHarnessPaths;
};

type GovernanceTask = ReturnType<typeof collectTasks>[number];

type GovernanceSurface = {
  surface: string;
  absolute: string;
  relative: string;
  rows: readonly unknown[];
  content: string;
  archiveOnly?: boolean;
};

type GeneratedGovernanceSurface = ReturnType<typeof moduleGeneratedIndexSurfaces>[number];
type RebuildSurface = GovernanceSurface | GeneratedGovernanceSurface;

type GovernanceRebuildOptions = {
  dryRun?: boolean;
  archive?: boolean;
  apply?: boolean;
};

type MarkdownRow = readonly unknown[];

export function rebuildGovernanceIndexes(targetInput: string, { dryRun = false, archive = false, apply = false }: GovernanceRebuildOptions = {}) {
  const target = normalizeTarget(targetInput) as GovernanceTarget;
  const effectiveApply = Boolean(apply && !dryRun);
  const context = beginGovernanceSync(target, { operation: "governance rebuild", dryRun: !effectiveApply });
  try {
    const tasks = collectTasks(target)
      .filter((task) => task.deletionState !== "deleted")
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const surfaces: RebuildSurface[] = [...governanceSurfaces(target, tasks), ...taskIndexSurfaces(target, tasks), ...moduleGeneratedIndexSurfaces(target, tasks)];
    const archiveDir = archive ? uniqueArchiveDir(target) : "";
    const changes = surfaces.map((surface) => ({
      surface: surface.surface,
      destination: surface.relative,
      action: isArchiveOnlySurface(surface)
        ? effectiveApply ? "archive-legacy-governance-table" : "would-archive-legacy-governance-table"
        : effectiveApply ? "rebuild-governance-index" : "would-rebuild-governance-index",
      generatedRows: surface.rows.length,
      archive: archive ? `${archiveDir}/${surface.relative}` : "",
    }));

    if (!effectiveApply) {
      return { dryRun: true, archive, applied: false, archiveDir, changes };
    }

    const allowed = [];
    for (const surface of surfaces) {
      if (archive && fs.existsSync(surface.absolute)) {
        const archivePath = path.join(target.projectRoot, archiveDir, surface.relative);
        fs.mkdirSync(path.dirname(archivePath), { recursive: true });
        fs.copyFileSync(surface.absolute, archivePath);
        allowed.push(toPosix(path.relative(target.projectRoot, archivePath)));
      }
      if (isArchiveOnlySurface(surface)) {
        if (archive && fs.existsSync(surface.absolute)) {
          fs.rmSync(surface.absolute);
          allowed.push(surface.relative);
        }
        continue;
      }
      fs.mkdirSync(path.dirname(surface.absolute), { recursive: true });
      fs.writeFileSync(surface.absolute, surface.content);
      allowed.push(surface.relative);
    }

    const commit = commitGovernanceSync(context, allowed, { message: "chore(harness): rebuild generated governance indexes" });
    return { dryRun: false, archive, applied: true, archiveDir, changes, commit };
  } finally {
    releaseGovernanceSync(context);
  }
}

function isArchiveOnlySurface(surface: RebuildSurface): boolean {
  return "archiveOnly" in surface && surface.archiveOnly === true;
}

function governanceSurfaces(target: GovernanceTarget, tasks: GovernanceTask[]): GovernanceSurface[] {
  return [
    {
      surface: "harness-ledger",
      absolute: target.harness.ledgerPath,
      relative: toPosix(path.relative(target.projectRoot, target.harness.ledgerPath)),
      rows: tasks.map(ledgerRow),
      content: replaceTableRows(readBundledTemplate("templates/ledger/Harness-Ledger.md"), /^ID$/i, tasks.map(ledgerRow)),
    },
    ...legacyFeatureSurfaces(target),
  ];
}

function legacyFeatureSurfaces(target: GovernanceTarget): GovernanceSurface[] {
  return [
    ["legacy-feature-ssot", path.join(target.harness.planningRoot, "Feature-SSoT.md")],
    ["legacy-private-feature-ssot", path.join(target.harness.planningRoot, "Private-Feature-SSoT.md")],
  ].filter(([, absolute]) => fs.existsSync(absolute)).map(([surface, absolute]) => ({
    surface,
    absolute,
    relative: toPosix(path.relative(target.projectRoot, absolute)),
    rows: [],
    content: "",
    archiveOnly: true,
  }));
}

function taskIndexSurfaces(target: GovernanceTarget, tasks: GovernanceTask[]): GovernanceSurface[] {
  const planningGeneratedRoot = path.join(target.harness.planningRoot, "generated");
  const taskIndexJson = buildTaskIndex(target.projectRoot);
  const taskIndexRows = tasks.map((task) => [
    task.taskKey || task.id,
    task.title || task.shortId || task.id,
    task.state,
    task.lifecycleState,
    task.reviewStatus,
    task.closeoutStatus,
    task.walkthroughPath || "pending",
  ]);
  const surfaces = [
    {
      surface: "task-index-json",
      absolute: path.join(planningGeneratedRoot, "task-index.json"),
      relative: toPosix(path.relative(target.projectRoot, path.join(planningGeneratedRoot, "task-index.json"))),
      rows: tasks,
      content: `${JSON.stringify(taskIndexJson, null, 2)}\n`,
    },
    {
      surface: "task-index-md",
      absolute: path.join(planningGeneratedRoot, "task-index.md"),
      relative: toPosix(path.relative(target.projectRoot, path.join(planningGeneratedRoot, "task-index.md"))),
      rows: taskIndexRows,
      content: renderTaskIndexMarkdown(taskIndexRows),
    },
  ];
  if (target.harness.version === 2) {
    const closeoutRows = tasks.map((task) => [
      `CO-${taskSlug(task)}`,
      task.taskKey || task.id,
      task.closeoutStatus || "missing",
      stripTarget(task.walkthroughPath) || "pending",
      task.reviewStatus || "pending",
      task.lessonCandidateDecisionComplete ? "checked" : (task.lessonCandidateStatus || "pending"),
      residual(task),
      todayDate(),
    ]);
    surfaces.push({
      surface: "closeout-index",
      absolute: target.harness.closeoutIndexPath,
      relative: toPosix(path.relative(target.projectRoot, target.harness.closeoutIndexPath)),
      rows: closeoutRows,
      content: renderCloseoutIndexMarkdown(closeoutRows),
    });
  }
  return surfaces;
}

function renderTaskIndexMarkdown(rows: MarkdownRow[]): string {
  return `# Generated Task Index

Generated by \`harness governance rebuild\`. Do not edit by hand.

| Task Key | Title | State | Lifecycle | Review | Closeout | Walkthrough |
| --- | --- | --- | --- | --- | --- | --- |
${rows.map((row) => `| ${fitRow(row, 7).join(" | ")} |`).join("\n")}
`;
}

function renderCloseoutIndexMarkdown(rows: MarkdownRow[]): string {
  return `# Generated Closeout Index

Generated from task-local Walkthrough files by \`harness governance rebuild\`. Do not edit by hand.

| ID | Task Key | Closeout | Walkthrough | Review | Lessons Check | Residual | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows.map((row) => `| ${fitRow(row, 8).join(" | ")} |`).join("\n")}
`;
}

function replaceTableRows(content: string, headerPattern: RegExp, rows: readonly MarkdownRow[]): string {
  const lines = String(content || "").split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    const header = splitMarkdownRow(lines[index]);
    if (!header.some((cell) => headerPattern.test(cell))) continue;
    const separator = splitMarkdownRow(lines[index + 1]);
    if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    let end = index + 2;
    while (end < lines.length && lines[end].trim().startsWith("|")) end += 1;
    const fitted = rows.map((row) => fitRow(row, header.length));
    lines.splice(index + 2, end - index - 2, ...fitted.map((row) => `| ${row.join(" | ")} |`));
    return `${lines.join("\n").trimEnd()}\n`;
  }
  return `${String(content || "").trimEnd()}\n\n${rows.map((row) => `| ${row.join(" | ")} |`).join("\n")}\n`;
}

function fitRow(row: MarkdownRow, length: number): string[] {
  const next = row.map((cell) => markdownCell(cell));
  while (next.length < length) next.push("");
  return next.slice(0, length);
}

function ledgerRow(task: GovernanceTask): string[] {
  const plan = stripTarget(task.taskPlanPath || `${stripTarget(task.path)}/task_plan.md`);
  const scope = task.module ? "module" : "task";
  const moduleKey = task.module || "none";
  return [
    taskLedgerId(task),
    scope,
    moduleKey,
    task.title || task.shortId || task.id,
    mapLedgerState(task.state),
    Array.isArray(task.taskQueues) && task.taskQueues.length ? task.taskQueues.join(",") : "none",
    plan,
    task.reviewStatus === "confirmed" ? stripTarget(task.reviewPath) : (task.reviewStatus || "pending"),
    task.lessonCandidateDecisionComplete ? "checked" : (task.lessonCandidateStatus || "pending"),
    task.walkthroughPath ? stripTarget(task.walkthroughPath) : (task.closeoutStatus || "pending"),
    residual(task),
    todayDate(),
  ];
}

function residual(task: GovernanceTask): string {
  if (Array.isArray(task.stateConflicts) && task.stateConflicts.length) return `state-conflicts:${task.stateConflicts.length}`;
  if (Array.isArray(task.materialIssues) && task.materialIssues.length) return `material-issues:${task.materialIssues.length}`;
  return "none";
}

function taskLedgerId(task: GovernanceTask): string {
  return `HL-${taskSlug(task)}`;
}

function taskSlug(task: GovernanceTask): string {
  return String(task.shortId || task.id || "task").replace(/^TASKS\//, "").replace(/^MODULES\//, "").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 72);
}

function stripTarget(value: unknown): string {
  return String(value || "").replace(/^TARGET:/, "");
}

function mapLedgerState(state: unknown): string {
  if (state === "in_progress") return "active";
  if (state === "review") return "review";
  if (state === "done") return "closed";
  if (state === "blocked") return "blocked";
  return "planned";
}

function uniqueArchiveDir(target: GovernanceTarget): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "-");
  const base = target.harness.version === 2
    ? `coding-agent-harness/governance/archive/generated-governance-tables/${stamp}`
    : `docs/01-GOVERNANCE/archive/generated-governance-tables/${stamp}`;
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${String(index).padStart(2, "0")}`;
    if (!fs.existsSync(path.join(target.projectRoot, candidate))) return candidate;
  }
  throw new Error("Unable to allocate a unique governance table archive directory");
}
