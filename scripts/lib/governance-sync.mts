// Governance sync spans dynamic target metadata and Git porcelain until the governance domain model PR.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import type { SpawnSyncReturns } from "node:child_process";
import { readBundledTemplate, readFileSafe, readJsonSafe, repoRoot, todayDate, toPosix } from "./core-shared.mjs";
import { createTaskGovernanceProjectionReader } from "./task-repository.mjs";
import { appendMarkdownTableRow, firstColumn, fitMarkdownTableRow, splitMarkdownRow, upsertMarkdownTableRow } from "./markdown-utils.mjs";
import { resolveHarnessPaths } from "./harness-paths.mjs";
import { moduleRegistryViewPath, renderModuleRegistryView } from "./module-registry.mjs";
import { projectModulePlanRows } from "../application/governance/generated-row-policy.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";
import type { TaskGovernanceProjection, TaskQuery } from "./types/task-repository.js";

type StringRecord = Record<string, unknown>;
type MarkdownRow = unknown[];

type HarnessTarget = {
  projectRoot: string;
  harness?: ResolvedHarnessPaths;
};

type GovernanceSyncErrorOptions = {
  code?: string;
  details?: StringRecord;
  recovery?: string[];
};

type GovernanceStatusEntry = {
  index: string;
  worktree: string;
  path: string;
  raw: string;
};

type FingerprintedStatusEntry = GovernanceStatusEntry & {
  fingerprint: string;
};

type GitInspection = {
  inGit: boolean;
  gitRoot: string;
  entries: GovernanceStatusEntry[];
};

type GovernanceSyncContext = {
  target: HarnessTarget;
  dryRun: boolean;
  operation: string;
  git: GitInspection;
  initialDirtyEntries?: FingerprintedStatusEntry[];
  lockPath: string;
  active: boolean;
};

type GovernanceChange = {
  destination: string;
  action: string;
  surface: string;
};

type GovernanceTask = TaskGovernanceProjection & {
  completion?: number;
};

type ModuleIndexSurface = {
  surface: string;
  absolute: string;
  relative: string;
  rows: MarkdownRow[];
  content: string;
};

export class GovernanceSyncError extends Error {
  code: string;
  details: StringRecord;
  recovery: string[];

  constructor(message: string, { code = "governance-sync-failed", details = {}, recovery = [] }: GovernanceSyncErrorOptions = {}) {
    super(message);
    this.name = "GovernanceSyncError";
    this.code = code;
    this.details = details;
    this.recovery = recovery;
  }
}

export function beginGovernanceSync(
  target: HarnessTarget,
  { operation = "governance-sync", dryRun = false, allowDirtyWorktree = false, allowedRelativePaths = [], allowDirtyWriteScope = false }: {
    operation?: string;
    dryRun?: boolean;
    allowDirtyWorktree?: boolean;
    allowedRelativePaths?: string[];
    allowDirtyWriteScope?: boolean;
  } = {},
): GovernanceSyncContext {
  if (dryRun) return { target, dryRun, operation, git: inspectGit(target.projectRoot), lockPath: "", active: false };
  const lockPath = path.join(target.projectRoot, ".harness/locks/governance-sync.lock");
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  acquireGovernanceSyncLock(lockPath, target, { operation });

  const gitState = inspectGit(target.projectRoot);
  const allowed = [...new Set((allowedRelativePaths || []).filter(Boolean).map(toPosix))].sort();
  if (gitState.inGit) {
    if (real(gitState.gitRoot) !== real(target.projectRoot)) {
      releaseGovernanceSync({ lockPath, active: true });
      throw new GovernanceSyncError("Governance sync requires the target argument to be the Git repository root.", {
        code: "governance-git-root-mismatch",
        details: { targetRoot: target.projectRoot, gitRoot: gitState.gitRoot },
        recovery: ["Run the harness command against the target repository root."],
      });
    }
    if (gitState.entries.length > 0 && !allowDirtyWorktree) {
      releaseGovernanceSync({ lockPath, active: true });
      throw new GovernanceSyncError("Governance sync requires a clean Git working tree before CLI-owned writes.", {
        code: "governance-git-dirty",
        details: { entries: gitState.entries },
        recovery: ["Commit or otherwise resolve unrelated changes before running this lifecycle command."],
      });
    }
    if (gitState.entries.length > 0 && allowDirtyWorktree) {
      try {
        assertDirtyCompatibleWithWriteScope(gitState.entries, allowed, { allowDirtyWriteScope });
      } catch (error) {
        releaseGovernanceSync({ lockPath, active: true });
        throw error;
      }
    }
    assertCommitIdentity(target.projectRoot);
  }
  const initialDirtyEntries = gitState.inGit ? gitState.entries.map((entry) => ({
    ...entry,
    fingerprint: fingerprintEntry(target.projectRoot, entry),
  })) : [];
  return { target, dryRun, operation, git: gitState, initialDirtyEntries, lockPath, active: true };
}

function acquireGovernanceSyncLock(lockPath: string, target: HarnessTarget, { operation }: { operation: string }): void {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let fd = null;
    try {
      fd = fs.openSync(lockPath, "wx");
      fs.writeFileSync(
        fd,
        `${JSON.stringify({
          operation,
          pid: process.pid,
          host: governanceLockHost(),
          branch: currentBranch(target.projectRoot),
          targetRoot: target.projectRoot,
          startedAt: new Date().toISOString(),
        }, null, 2)}\n`,
      );
      fs.closeSync(fd);
      return;
    } catch (error: unknown) {
      if (fd !== null) fs.closeSync(fd);
      if (isNodeError(error) && error.code === "EEXIST" && attempt === 0 && removeStaleGovernanceSyncLock(lockPath)) continue;
      throw governanceLockExistsError(lockPath, error);
    }
  }
}

function removeStaleGovernanceSyncLock(lockPath: string): boolean {
  const lockContent = readFileSafe(lockPath);
  const lock = readJsonSafe(lockPath, null) as Partial<{ host: string; pid: number }> | null;
  if (!lock) return false;
  if (lock.host !== governanceLockHost()) return false;
  const pid = lock.pid;
  if (!Number.isInteger(pid) || !pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return false;
  } catch (error: unknown) {
    if (!isNodeError(error) || error.code !== "ESRCH") return false;
  }
  if (readFileSafe(lockPath) !== lockContent) return false;
  fs.rmSync(lockPath);
  return true;
}

function governanceLockHost(): string {
  return process.env.HOSTNAME || os.hostname() || "";
}

function governanceLockExistsError(lockPath: string, error: unknown): GovernanceSyncError {
  return new GovernanceSyncError("Governance sync lock already exists; refusing concurrent registry writes.", {
    code: "governance-lock-exists",
    details: { lockPath, error: errorMessage(error) },
    recovery: [
      `Inspect ${lockPath}.`,
      "If no process owns the lock, remove it manually and retry.",
    ],
  });
}

export function releaseGovernanceSync(context: Partial<GovernanceSyncContext> | null | undefined): void {
  if (!context?.active || !context.lockPath) return;
  try {
    fs.unlinkSync(context.lockPath);
  } catch {
    // Best-effort cleanup; command errors report the original failure.
  }
}

export function commitGovernanceSync(
  context: GovernanceSyncContext | null | undefined,
  allowedRelativePaths: string[],
  { message = "chore(harness): sync governance state" }: { message?: string } = {},
): { committed: boolean; reason?: string; commitSha?: string; allowedPaths: string[] } {
  const allowed = [...new Set((allowedRelativePaths || []).filter(Boolean).map(toPosix))].sort();
  if (context?.dryRun || !context?.git?.inGit) return { committed: false, reason: context?.git?.inGit ? "dry-run" : "not-git", allowedPaths: allowed };
  if (allowed.length === 0) return { committed: false, reason: "no-allowed-paths", allowedPaths: allowed };
  assertNoUnexpectedOutsideChanges(context.target.projectRoot, allowed, context.initialDirtyEntries || []);
  git(context.target.projectRoot, ["add", "--", ...allowed]);
  assertOnlyAllowedStaged(context.target.projectRoot, allowed);
  const staged = git(context.target.projectRoot, ["diff", "--cached", "--name-only", "-z"]).stdout.split("\0").filter(Boolean);
  if (staged.length === 0) return { committed: false, reason: "no-changes", allowedPaths: allowed };
  const commitResult = git(context.target.projectRoot, ["-c", "core.hooksPath=/dev/null", "commit", "--no-verify", "-m", message], { allowFailure: true });
  if (commitResult.status !== 0) {
    let outsideChanges = null;
    try {
      assertNoUnexpectedOutsideChanges(context.target.projectRoot, allowed, context.initialDirtyEntries || []);
    } catch (error: unknown) {
      outsideChanges = error instanceof GovernanceSyncError ? error.details : null;
    }
    throw new GovernanceSyncError("Governance sync wrote files but Git commit failed.", {
      code: "governance-git-commit-failed",
      details: { stdout: commitResult.stdout.trim(), stderr: commitResult.stderr.trim(), allowedPaths: allowed, outsideChanges },
      recovery: [
        `Inspect files: ${allowed.join(", ")}`,
        `Then run: git add -- ${allowed.join(" ")} && git -c core.hooksPath=/dev/null commit --no-verify -m ${JSON.stringify(message)}`,
      ],
    });
  }
  assertLastCommitOnlyAllowed(context.target.projectRoot, allowed);
  assertNoUnexpectedOutsideChanges(context.target.projectRoot, allowed, context.initialDirtyEntries || []);
  assertWriteScopeClean(context.target.projectRoot, allowed);
  return { committed: true, commitSha: git(context.target.projectRoot, ["rev-parse", "HEAD"]).stdout.trim(), allowedPaths: allowed };
}

export function syncTaskGovernance(
  target: HarnessTarget,
  task: GovernanceTask,
  { event = "new-task", state = "planned", message = "", dryRun = false }: { event?: string; state?: string; message?: string; dryRun?: boolean } = {},
): { changes: GovernanceChange[] } {
  const changes: GovernanceChange[] = [];
  const planPath = stripTargetPrefix(task.path) + "/task_plan.md";
  const reviewPath = stripTargetPrefix(task.path) + "/review.md";
  const ledger = syncLedgerRow(target, task, { event, state, message, planPath, reviewPath, dryRun });
  if (ledger) changes.push(ledger);
  const moduleKey = task.module;
  if (moduleKey) {
    const taskWithModule = { ...task, module: moduleKey };
    const moduleRegistry = syncModuleRegistryView(target, { dryRun });
    if (moduleRegistry) changes.push(moduleRegistry);
    changes.push(...syncModuleGeneratedIndexes(target, moduleKey, { task: taskWithModule, dryRun }).changes);
  }
  return { changes };
}

export function syncModuleStepGovernance(
  target: HarnessTarget,
  { moduleKey, stepId, state, dryRun = false }: { moduleKey: string; stepId: string; state: string; dryRun?: boolean },
): { changes: GovernanceChange[] } {
  const changes: GovernanceChange[] = [];
  const harnessPaths = activeHarnessPaths(target);
  const ledgerPath = harnessPaths.ledgerPath;
  const ledgerRelative = toPosix(path.relative(target.projectRoot, ledgerPath));
  ensureFileFromTemplate(ledgerPath, "templates/ledger/Harness-Ledger.md", { dryRun });
  if (!dryRun) {
    const content = readFileSafe(ledgerPath);
    const modulePlan = toPosix(path.relative(target.projectRoot, path.join(harnessPaths.modulesRoot, moduleKey, "module_plan.md")));
    const row = [
      `HL-${todayDate().replaceAll("-", "")}-${Date.now().toString().slice(-6)}`,
      "module",
      moduleKey,
      `Module ${moduleKey} step ${stepId}`,
      state === "done" ? "review" : state === "in-progress" ? "active" : state,
      "none",
      modulePlan,
      "n/a",
      "checked-none:module-step",
      "pending",
      "module-step",
      todayDate(),
    ];
    fs.writeFileSync(ledgerPath, appendMarkdownTableRow(content, /^ID$/i, row));
  }
  changes.push({ destination: ledgerRelative, action: dryRun ? "would-sync-governance" : "sync-governance", surface: "harness-ledger" });
  return { changes };
}

export function governanceRelativePaths(changes: GovernanceChange[]): string[] {
  return [...new Set((changes || []).map((change) => change.destination).filter(Boolean).map(toPosix))];
}

function syncLedgerRow(
  target: HarnessTarget,
  task: GovernanceTask,
  { event, state, message, planPath, reviewPath, dryRun }: { event: string; state: string; message: string; planPath: string; reviewPath: string; dryRun: boolean },
): GovernanceChange {
  const ledgerPath = activeHarnessPaths(target).ledgerPath;
  ensureFileFromTemplate(ledgerPath, "templates/ledger/Harness-Ledger.md", { dryRun });
  const relative = toPosix(path.relative(target.projectRoot, ledgerPath));
  if (!dryRun) {
    const content = readFileSafe(ledgerPath);
    const row = [
      ledgerId(task),
      task.module ? "module" : "task",
      task.module || "none",
      task.title || task.shortId || task.id,
      mapLedgerState(state),
      "none",
      planPath,
      event === "task-review" || state === "review" ? reviewPath : "pending",
      "pending",
      "pending",
      message || "none",
      todayDate(),
    ];
    fs.writeFileSync(ledgerPath, upsertMarkdownTableRow(content, /^ID$/i, (header, existing) => rowMatchesPlan(header, existing, planPath), row));
  }
  return { destination: relative, action: dryRun ? "would-sync-governance" : "sync-governance", surface: "harness-ledger" };
}

function syncModuleRegistryView(target: HarnessTarget, { dryRun }: { dryRun: boolean }): GovernanceChange {
  const registryPath = moduleRegistryViewPath(target as HarnessTarget & { harness: ResolvedHarnessPaths });
  const relative = toPosix(path.relative(target.projectRoot, registryPath));
  if (!dryRun) {
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    fs.writeFileSync(registryPath, renderModuleRegistryView(target as HarnessTarget & { harness: ResolvedHarnessPaths }));
  }
  return { destination: relative, action: dryRun ? "would-sync-governance" : "sync-governance", surface: "module-registry" };
}

function syncModuleGeneratedIndexes(
  target: HarnessTarget,
  moduleKey: string,
  { task = null, dryRun = false }: { task?: GovernanceTask | null; dryRun?: boolean } = {},
): { changes: GovernanceChange[] } {
  const moduleTasks = collectModuleTasks(target, moduleKey, task);
  const surfaces = moduleGeneratedIndexSurfaces(target, moduleTasks);
  if (!dryRun) {
    for (const surface of surfaces) {
      fs.mkdirSync(path.dirname(surface.absolute), { recursive: true });
      fs.writeFileSync(surface.absolute, surface.content);
    }
  }
  return {
    changes: surfaces.map((surface) => ({
      destination: surface.relative,
      action: dryRun ? "would-sync-governance" : "sync-governance",
      surface: surface.surface,
    })),
  };
}

export function moduleGeneratedIndexSurfaces(target: HarnessTarget, tasks: GovernanceTask[] = collectGovernanceProjectionTasks(target)): ModuleIndexSurface[] {
  const harnessPaths = activeHarnessPaths(target);
  const modules = [...new Set((tasks || []).map((task) => task.module).filter(isNonEmptyString))].sort();
  const surfaces: ModuleIndexSurface[] = [];
  for (const moduleKey of modules) {
    const moduleTasks = (tasks || []).filter((task) => task.module === moduleKey);
    const moduleDir = path.join(harnessPaths.modulesRoot, moduleKey);
    const modulePlanPath = path.join(moduleDir, "module_plan.md");
    const stepRows: MarkdownRow[] = projectModulePlanRows(moduleTasks);
    surfaces.push({
      surface: "module-plan-index",
      absolute: modulePlanPath,
      relative: toPosix(path.relative(target.projectRoot, modulePlanPath)),
      rows: stepRows,
      content: replaceTableRows(existingOrTemplate(modulePlanPath, "templates/planning/module_plan.md"), /^(?:Step ID|步骤 ID)$/i, stepRows),
    });
  }
  return surfaces;
}

function collectModuleTasks(target: HarnessTarget, moduleKey: string, task: GovernanceTask | null): GovernanceTask[] {
  const tasks = collectGovernanceProjectionTasks(target, { module: moduleKey });
  const moduleTasks = tasks.filter((candidate) => candidate.module === moduleKey);
  if (task && !moduleTasks.some((candidate) => stripTargetPrefix(candidate.taskPlanPath) === `${stripTargetPrefix(task.path)}/task_plan.md`)) {
    moduleTasks.push({
      ...task,
      module: moduleKey,
      state: task.state || "planned",
      taskPlanPath: `${stripTargetPrefix(task.path)}/task_plan.md`,
      completion: 0,
    });
  }
  return moduleTasks;
}

function collectGovernanceProjectionTasks(target: HarnessTarget, query: Pick<TaskQuery, "module" | "includeArchived"> = {}): GovernanceTask[] {
  return createTaskGovernanceProjectionReader(target).listGovernanceTasks({ includeArchived: false, ...query });
}

function replaceTableRows(content: string, headerPattern: RegExp, rows: MarkdownRow[]): string {
  const lines = String(content || "").split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    const header = splitMarkdownRow(lines[index]);
    if (!header.some((cell) => headerPattern.test(cell))) continue;
    const separator = splitMarkdownRow(lines[index + 1]);
    if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    let end = index + 2;
    while (end < lines.length && lines[end].trim().startsWith("|")) end += 1;
    lines.splice(index + 2, end - index - 2, ...rows.map((row) => `| ${fitMarkdownTableRow(row, header.length).join(" | ")} |`));
    return `${lines.join("\n").trimEnd()}\n`;
  }
  return `${String(content || "").trimEnd()}\n\n${rows.map((row) => `| ${fitMarkdownTableRow(row, row.length).join(" | ")} |`).join("\n")}\n`;
}

function existingOrTemplate(filePath: string, templateSource: string): string {
  return fs.existsSync(filePath) ? readFileSafe(filePath) : readBundledTemplate(templateSource);
}

function ensureFileFromTemplate(destinationPath: string, templateSource: string, { dryRun = false }: { dryRun?: boolean } = {}): void {
  if (fs.existsSync(destinationPath) || dryRun) return;
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, readBundledTemplate(templateSource));
}

function rowMatchesPlan(header: string[], row: string[], planPath: string): boolean {
  const planIndex = firstColumn(header, ["Task Plan", "Plan", "当前产物"]);
  return planIndex >= 0 && String(row[planIndex] || "").includes(planPath);
}

function rowMatchesModule(header: string[], row: string[], moduleKey: string, modulePlan: string): boolean {
  const moduleIndex = firstColumn(header, ["Module", "模块", "模块 Key"]);
  const taskPlanIndex = firstColumn(header, ["Task Plan", "当前产物"]);
  return String(row[moduleIndex] || "").toLowerCase() === String(moduleKey).toLowerCase() || String(row[taskPlanIndex] || "").includes(modulePlan);
}

function ledgerId(task: GovernanceTask): string {
  return `HL-${String(task.shortId || task.id || "task").replace(/^TASKS\//, "").replace(/^MODULES\//, "").replace(/[^A-Za-z0-9-]+/g, "-").slice(0, 72)}`;
}

function stripTargetPrefix(value: unknown): string {
  return String(value || "").replace(/^TARGET:/, "").replace(/\/$/, "");
}

function mapLedgerState(state: string): string {
  if (state === "in_progress") return "active";
  if (state === "review") return "review";
  if (state === "done") return "closed";
  if (state === "blocked") return "blocked";
  return "planned";
}

function activeHarnessPaths(target: HarnessTarget): ResolvedHarnessPaths {
  return target.harness || resolveHarnessPaths(target);
}

export function inspectGit(root: string): GitInspection {
  const gitRootResult = git(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (gitRootResult.status !== 0) return { inGit: false, gitRoot: "", entries: [] };
  const gitRoot = path.resolve(gitRootResult.stdout.trim());
  return { inGit: true, gitRoot, entries: statusEntries(root) };
}

function currentBranch(root: string): string {
  const result = git(root, ["branch", "--show-current"], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : "";
}

function assertCommitIdentity(root: string): void {
  const name = git(root, ["config", "--get", "user.name"], { allowFailure: true }).stdout.trim();
  const email = git(root, ["config", "--get", "user.email"], { allowFailure: true }).stdout.trim();
  if (!name || !email) {
    throw new GovernanceSyncError("Governance sync auto-commit requires Git user.name and user.email.", {
      code: "governance-git-identity-missing",
      details: { hasName: Boolean(name), hasEmail: Boolean(email) },
      recovery: ["Configure a local Git identity for the target repository."],
    });
  }
}

function assertDirtyCompatibleWithWriteScope(
  entries: GovernanceStatusEntry[],
  allowedPaths: string[],
  { allowDirtyWriteScope = false }: { allowDirtyWriteScope?: boolean } = {},
): void {
  const allowed = new Set(allowedPaths);
  const overlapping = entries.filter((entry) => allowed.has(entry.path));
  if (overlapping.length > 0 && !allowDirtyWriteScope) {
    throw new GovernanceSyncError("Governance sync owned path in write scope is already dirty; refusing to overwrite user-owned changes.", {
      code: "governance-write-scope-dirty",
      details: { overlapping, allowedPaths },
      recovery: ["Commit, move, or remove the overlapping files before retrying this lifecycle command."],
    });
  }
  const outsideStaged = entries.filter((entry) => entry.index !== " " && entry.index !== "?" && !allowed.has(entry.path));
  if (outsideStaged.length > 0) {
    throw new GovernanceSyncError("Git index contains staged files outside the governance sync write scope.", {
      code: "governance-index-outside-write-scope",
      details: { disallowed: outsideStaged, allowedPaths },
      recovery: ["Unstage unrelated files before retrying the lifecycle command."],
    });
  }
}

function assertOnlyAllowedStaged(root: string, allowedPaths: string[]): void {
  const outside = statusEntries(root).filter((entry) => entry.index !== " " && entry.index !== "?" && !allowedPaths.includes(entry.path));
  if (outside.length > 0) {
    throw new GovernanceSyncError("Git index contains staged files outside the governance sync allowlist.", {
      code: "governance-index-allowlist-violation",
      details: { disallowed: outside, allowedPaths },
      recovery: ["Unstage unrelated files before retrying the lifecycle command."],
    });
  }
}

function assertNoUnexpectedOutsideChanges(root: string, allowedPaths: string[], initialDirtyEntries: FingerprintedStatusEntry[]): void {
  const allowed = new Set(allowedPaths);
  const initialByPath = new Map(
    (initialDirtyEntries || [])
      .filter((entry) => !allowed.has(entry.path))
      .map((entry) => [entry.path, entry]),
  );
  const unexpected: FingerprintedStatusEntry[] = [];
  const changed: Array<{ before: FingerprintedStatusEntry; after: FingerprintedStatusEntry }> = [];
  for (const entry of statusEntries(root)) {
    if (allowed.has(entry.path)) continue;
    const current = { ...entry, fingerprint: fingerprintEntry(root, entry) };
    const initial = initialByPath.get(entry.path);
    if (!initial) {
      unexpected.push(current);
    } else if (initial.raw !== current.raw || initial.fingerprint !== current.fingerprint) {
      changed.push({ before: initial, after: current });
    }
  }
  if (unexpected.length > 0 || changed.length > 0) {
    throw new GovernanceSyncError("Governance sync produced changes outside its write scope.", {
      code: "governance-allowlist-violation",
      details: { unexpected, changed, allowedPaths },
      recovery: ["Inspect the extra paths; the CLI will not stage or commit unrelated files."],
    });
  }
}

function assertLastCommitOnlyAllowed(root: string, allowedPaths: string[]): void {
  const committed = git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", "-z", "HEAD"]).stdout
    .split("\0")
    .filter(Boolean)
    .map(toPosix);
  const outside = committed.filter((file) => !allowedPaths.includes(file));
  if (outside.length > 0) {
    throw new GovernanceSyncError("Governance sync commit contains files outside its write scope.", {
      code: "governance-commit-allowlist-violation",
      details: { disallowed: outside, committed, allowedPaths },
      recovery: ["Inspect the last commit and remove any files that are not owned by the lifecycle command."],
    });
  }
}

function assertWriteScopeClean(root: string, allowedPaths: string[]): void {
  const entries = statusEntries(root);
  const remaining = entries.filter((entry) => allowedPaths.includes(entry.path));
  if (remaining.length > 0) {
    throw new GovernanceSyncError("Governance sync commit completed but write scope is not clean.", {
      code: "governance-post-commit-dirty",
      details: { entries: remaining, allowedPaths },
      recovery: ["Inspect remaining write-scope files before continuing."],
    });
  }
}

function fingerprintEntry(root: string, entry: GovernanceStatusEntry): string {
  const absolute = path.join(root, entry.path);
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) return `symlink:${fs.readlinkSync(absolute)}`;
    if (stat.isFile()) {
      return `file:${stat.size}:${crypto.createHash("sha256").update(new Uint8Array(fs.readFileSync(absolute))).digest("hex")}`;
    }
    if (stat.isDirectory()) return "directory";
    return `${stat.mode}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function statusEntries(root: string): GovernanceStatusEntry[] {
  return git(root, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      index: line.slice(0, 1),
      worktree: line.slice(1, 2),
      path: toPosix(parseStatusPath(line.slice(3))),
      raw: line,
    }))
    .filter((entry) => entry.path !== ".harness/locks/governance-sync.lock");
}

function parseStatusPath(value: string): string {
  const unquoted = value.replace(/^"|"$/g, "");
  return unquoted.includes(" -> ") ? unquoted.split(" -> ").pop() ?? unquoted : unquoted;
}

function git(cwd: string, args: string[], { allowFailure = false }: { allowFailure?: boolean } = {}): SpawnSyncReturns<string> {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new GovernanceSyncError(`git ${args.join(" ")} failed`, {
      code: "governance-git-command-failed",
      details: { stdout: result.stdout.trim(), stderr: result.stderr.trim() },
      recovery: ["Inspect the Git error and retry after resolving it."],
    });
  }
  return result;
}

function real(filePath: string): string {
  return fs.realpathSync(filePath);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
