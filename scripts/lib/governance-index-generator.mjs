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
import {
  beginGovernanceSync,
  commitGovernanceSync,
  moduleGeneratedIndexSurfaces,
  releaseGovernanceSync,
} from "./governance-sync.mjs";
import { markdownCell } from "./task-lifecycle/text-utils.mjs";

export function rebuildGovernanceIndexes(targetInput, { dryRun = false, archive = false, apply = false } = {}) {
  const target = normalizeTarget(targetInput);
  const effectiveApply = Boolean(apply && !dryRun);
  const context = beginGovernanceSync(target, { operation: "governance rebuild", dryRun: !effectiveApply });
  try {
    const tasks = collectTasks(target)
      .filter((task) => task.deletionState !== "deleted")
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const surfaces = [...governanceSurfaces(target, tasks), ...moduleGeneratedIndexSurfaces(target, tasks)];
    const archiveDir = archive ? uniqueArchiveDir(target) : "";
    const changes = surfaces.map((surface) => ({
      surface: surface.surface,
      destination: surface.relative,
      action: surface.archiveOnly
        ? apply ? "archive-legacy-governance-table" : "would-archive-legacy-governance-table"
        : apply ? "rebuild-governance-index" : "would-rebuild-governance-index",
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
      if (surface.archiveOnly) {
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

function governanceSurfaces(target, tasks) {
  return [
    {
      surface: "harness-ledger",
      absolute: path.join(target.docsRoot, "Harness-Ledger.md"),
      relative: toPosix(path.relative(target.projectRoot, path.join(target.docsRoot, "Harness-Ledger.md"))),
      rows: tasks.map(ledgerRow),
      content: replaceTableRows(readBundledTemplate("templates/ledger/Harness-Ledger.md"), /^ID$/i, tasks.map(ledgerRow)),
    },
    ...legacyFeatureSurfaces(target),
  ];
}

function legacyFeatureSurfaces(target) {
  return [
    ["legacy-feature-ssot", path.join(target.docsRoot, "09-PLANNING/Feature-SSoT.md")],
    ["legacy-private-feature-ssot", path.join(target.docsRoot, "09-PLANNING/Private-Feature-SSoT.md")],
  ].filter(([, absolute]) => fs.existsSync(absolute)).map(([surface, absolute]) => ({
    surface,
    absolute,
    relative: toPosix(path.relative(target.projectRoot, absolute)),
    rows: [],
    content: "",
    archiveOnly: true,
  }));
}

function replaceTableRows(content, headerPattern, rows) {
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

function fitRow(row, length) {
  const next = row.map((cell) => markdownCell(cell));
  while (next.length < length) next.push("");
  return next.slice(0, length);
}

function ledgerRow(task) {
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

function residual(task) {
  if (Array.isArray(task.stateConflicts) && task.stateConflicts.length) return `state-conflicts:${task.stateConflicts.length}`;
  if (Array.isArray(task.materialIssues) && task.materialIssues.length) return `material-issues:${task.materialIssues.length}`;
  return "none";
}

function taskLedgerId(task) {
  return `HL-${taskSlug(task)}`;
}

function taskSlug(task) {
  return String(task.shortId || task.id || "task").replace(/^TASKS\//, "").replace(/^MODULES\//, "").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 72);
}

function stripTarget(value) {
  return String(value || "").replace(/^TARGET:/, "");
}

function mapLedgerState(state) {
  if (state === "in_progress") return "active";
  if (state === "review") return "review";
  if (state === "done") return "closed";
  if (state === "blocked") return "blocked";
  return "planned";
}

function uniqueArchiveDir(target) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "-");
  const base = `docs/01-GOVERNANCE/archive/generated-governance-tables/${stamp}`;
  for (let index = 0; index < 100; index += 1) {
    const candidate = index === 0 ? base : `${base}-${String(index).padStart(2, "0")}`;
    if (!fs.existsSync(path.join(target.projectRoot, candidate))) return candidate;
  }
  throw new Error("Unable to allocate a unique governance table archive directory");
}
