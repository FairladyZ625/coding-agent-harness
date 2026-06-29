import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { beginGovernanceSync, commitGovernanceSync, GovernanceSyncError, inspectGit, releaseGovernanceSync } from "./governance-sync.mjs";
import { normalizeTarget, toPosix } from "./core-shared.mjs";
import { defaultGitRunner, gitCommandFailureSummary, parseGitStatus } from "./git-runner.mjs";
import type { ResolvedHarnessPaths } from "./harness-paths.mjs";

type HarnessTransactionTarget = {
  projectRoot: string;
  harness?: ResolvedHarnessPaths;
  [key: string]: unknown;
};

type GitInspection = ReturnType<typeof inspectGit>;
type GitStatusEntry = GitInspection["entries"][number];
type FingerprintedGitStatusEntry = GitStatusEntry & { fingerprint: string };
type GovernanceCommitSummary = ReturnType<typeof commitGovernanceSync>;

export type FileWrite = {
  path: string;
  content: string | Uint8Array;
  encoding?: BufferEncoding;
  mode?: number;
  action?: string;
  surface?: string;
};

export type FileDelete = {
  path: string;
  recursive?: boolean;
  force?: boolean;
  action?: string;
  surface?: string;
};

export type GeneratedSurface = {
  surface: string;
  paths?: string[];
};

export type TransactionCommitOptions = {
  message: string;
  defer?: boolean;
  allowDirtyWorktree?: boolean;
  allowDirtyWriteScope?: boolean;
};

export type TransactionMutationResult = {
  allowedPaths?: string[];
  generatedSurfaces?: Array<string | GeneratedSurface>;
  commit?: Partial<TransactionCommitOptions>;
};

export type TransactionMutationContext = {
  target: HarnessTransactionTarget;
  plan: TransactionPlan;
};

export type ChangeSet = {
  operation: string;
  writes?: FileWrite[];
  deletes?: FileDelete[];
  generatedSurfaces?: Array<string | GeneratedSurface>;
  allowedPaths?: string[];
  commit?: TransactionCommitOptions;
  dryRun?: boolean;
  apply?: (context: TransactionMutationContext) => TransactionMutationResult | void;
};

export type TransactionPlan = {
  changeSet: ChangeSet;
  operation: string;
  dryRun: boolean;
  targetRoot: string;
  allowedPaths: string[];
  generatedSurfaces: string[];
  git: GitInspection;
  conflicts: string[];
};

export type TransactionReleaseSummary = {
  attempted: boolean;
  completed: boolean;
  lockPath: string;
};

export type TransactionErrorSummary = {
  name: string;
  message: string;
  code?: string;
  details?: unknown;
  recovery?: unknown[];
};

export type TransactionSuccess = {
  success: true;
  operation: string;
  dryRun: boolean;
  allowedPaths: string[];
  generatedSurfaces: string[];
  git: GitInspection;
  writes: string[];
  deletes: string[];
  commit: GovernanceCommitSummary;
  release: TransactionReleaseSummary;
};

export type TransactionFailure = {
  success: false;
  operation: string;
  dryRun: boolean;
  allowedPaths: string[];
  generatedSurfaces: string[];
  git: GitInspection;
  writes: string[];
  deletes: string[];
  commit: GovernanceCommitSummary & { reason: "failed" };
  release: TransactionReleaseSummary;
  error: TransactionErrorSummary;
  cause: unknown;
};

export type TransactionResult = TransactionSuccess | TransactionFailure;

export type HarnessTransaction = {
  plan(changeSet: ChangeSet): TransactionPlan;
  apply(plan: TransactionPlan): TransactionResult;
};

export function createGovernanceHarnessTransaction(targetInput: string | HarnessTransactionTarget = "."): HarnessTransaction {
  const target = normalizeTransactionTarget(targetInput);
  return {
    plan(changeSet) {
      const git = inspectGit(target.projectRoot);
      const allowedPaths = normalizeAllowedPaths(target, pathsFromChangeSet(changeSet));
      const generatedSurfaces = generatedSurfaceNames(changeSet.generatedSurfaces || []);
      return {
        changeSet,
        operation: changeSet.operation || "harness-transaction",
        dryRun: changeSet.dryRun === true,
        targetRoot: target.projectRoot,
        allowedPaths,
        generatedSurfaces,
        git,
        conflicts: detectPlanConflicts(git, allowedPaths, changeSet.commit),
      };
    },
    apply(plan) {
      const lockPath = governanceLockPath(target);
      let release = releaseSummary(lockPath, false);
      let context: ReturnType<typeof beginGovernanceSync> | null = null;
      let allowedPaths = [...plan.allowedPaths];
      let generatedSurfaces = [...plan.generatedSurfaces];
      const writes = writePaths(target, plan.changeSet.writes || []);
      const deletes = deletePaths(target, plan.changeSet.deletes || []);
      try {
        const initialEntries = fingerprintEntries(target, transactionScopeEntries(target));
        context = beginGovernanceSync(target, {
          operation: plan.operation,
          dryRun: plan.dryRun,
          allowDirtyWorktree: plan.changeSet.commit?.allowDirtyWorktree === true,
          allowDirtyWriteScope: plan.changeSet.commit?.allowDirtyWriteScope === true,
          allowedRelativePaths: allowedPaths,
        });
        applyDeclarativeChanges(target, plan);
        const mutation = plan.dryRun ? {} : plan.changeSet.apply?.({ target, plan }) || {};
        const mutationGeneratedSurfaces = mutation.generatedSurfaces || [];
        const commitOptions = { ...(plan.changeSet.commit || {}), ...(mutation.commit || {}) };
        const mutationAllowedPaths = normalizeAllowedPaths(target, [...(mutation.allowedPaths || []), ...generatedSurfacePaths(mutationGeneratedSurfaces)]);
        assertLateAllowedPathsAreSafe(plan, mutationAllowedPaths, commitOptions);
        allowedPaths = normalizeAllowedPaths(target, [...allowedPaths, ...mutationAllowedPaths]);
        generatedSurfaces = [...new Set([...generatedSurfaces, ...generatedSurfaceNames(mutationGeneratedSurfaces)])].sort();
        assertNoOutOfScopeTransactionChanges(target, allowedPaths, initialEntries);
        const commit = commitOptions.defer === true
          ? { committed: false, reason: "deferred", allowedPaths }
          : commitGovernanceSync(context, allowedPaths, { message: commitOptions.message || "chore(harness): sync governance state" });
        release = releaseGovernanceContext(context, lockPath);
        return {
          success: true,
          operation: plan.operation,
          dryRun: plan.dryRun,
          allowedPaths,
          generatedSurfaces,
          git: plan.git,
          writes,
          deletes,
          commit,
          release,
        };
      } catch (error) {
        release = releaseGovernanceContext(context, lockPath);
        return {
          success: false,
          operation: plan.operation,
          dryRun: plan.dryRun,
          allowedPaths,
          generatedSurfaces,
          git: plan.git,
          writes,
          deletes,
          commit: { committed: false, reason: "failed", allowedPaths },
          release,
          error: summarizeError(error),
          cause: error,
        };
      }
    },
  };
}

export function assertTransactionSucceeded(result: TransactionResult): asserts result is TransactionSuccess {
  if (result.success) return;
  throw result.cause instanceof Error ? result.cause : new Error(result.error.message);
}

function normalizeTransactionTarget(targetInput: string | HarnessTransactionTarget): HarnessTransactionTarget {
  if (typeof targetInput === "string") return normalizeTarget(targetInput) as HarnessTransactionTarget;
  return targetInput;
}

function pathsFromChangeSet(changeSet: ChangeSet): string[] {
  return [
    ...(changeSet.allowedPaths || []),
    ...(changeSet.writes || []).map((write) => write.path),
    ...(changeSet.deletes || []).map((deleted) => deleted.path),
    ...generatedSurfacePaths(changeSet.generatedSurfaces || []),
  ];
}

function generatedSurfaceNames(surfaces: Array<string | GeneratedSurface>): string[] {
  return [...new Set(surfaces.map((surface) => typeof surface === "string" ? surface : surface.surface).filter(Boolean))].sort();
}

function generatedSurfacePaths(surfaces: Array<string | GeneratedSurface>): string[] {
  return surfaces.flatMap((surface) => typeof surface === "string" ? [] : surface.paths || []);
}

function normalizeAllowedPaths(target: HarnessTransactionTarget, rawPaths: string[]): string[] {
  return [...new Set(rawPaths.map((rawPath) => relativeTargetPath(target, rawPath)))].sort();
}

function detectPlanConflicts(git: GitInspection, allowedPaths: string[], commit: TransactionCommitOptions | undefined): string[] {
  if (!git.inGit || git.entries.length === 0) return [];
  if (commit?.allowDirtyWorktree !== true) return git.entries.map((entry) => `dirty git entry: ${entry.path}`);
  const allowed = new Set(allowedPaths);
  const conflicts: string[] = [];
  if (commit.allowDirtyWriteScope !== true) {
    conflicts.push(...git.entries.filter((entry) => allowed.has(entry.path)).map((entry) => `dirty allowed path: ${entry.path}`));
  }
  conflicts.push(...git.entries.filter((entry) => entry.index !== " " && entry.index !== "?" && !allowed.has(entry.path)).map((entry) => `staged outside transaction scope: ${entry.path}`));
  return conflicts;
}

function applyDeclarativeChanges(target: HarnessTransactionTarget, plan: TransactionPlan): void {
  if (plan.dryRun) return;
  for (const write of plan.changeSet.writes || []) {
    const destination = absoluteTargetPath(target, write.path);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (typeof write.content === "string") {
      fs.writeFileSync(destination, write.content, write.encoding || "utf8");
    } else {
      fs.writeFileSync(destination, write.content);
    }
    if (write.mode !== undefined) fs.chmodSync(destination, write.mode);
  }
  for (const deleted of plan.changeSet.deletes || []) {
    const destination = absoluteTargetPath(target, deleted.path);
    fs.rmSync(destination, { recursive: deleted.recursive === true, force: deleted.force !== false });
  }
}

function writePaths(target: HarnessTransactionTarget, writes: FileWrite[]): string[] {
  return writes.map((write) => relativeTargetPath(target, write.path));
}

function deletePaths(target: HarnessTransactionTarget, deletes: FileDelete[]): string[] {
  return deletes.map((deleted) => relativeTargetPath(target, deleted.path));
}

function relativeTargetPath(target: HarnessTransactionTarget, rawPath: string): string {
  return transactionPath(target, rawPath).relative;
}

function absoluteTargetPath(target: HarnessTransactionTarget, rawPath: string): string {
  return transactionPath(target, rawPath).absolute;
}

function transactionPath(target: HarnessTransactionTarget, rawPath: string): { absolute: string; relative: string } {
  const stripped = String(rawPath || "").replace(/^TARGET:/, "").replace(/^\.\//, "");
  if (!stripped || stripped === ".") throw transactionPathError(target, rawPath);
  const targetRoot = path.resolve(target.projectRoot);
  const absolute = path.isAbsolute(stripped) ? path.resolve(stripped) : path.resolve(targetRoot, stripped);
  const relative = path.relative(targetRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw transactionPathError(target, rawPath);
  const realTargetRoot = fs.realpathSync(targetRoot);
  const resolved = resolveExistingAncestorPath(absolute);
  const realRelative = path.relative(realTargetRoot, resolved);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw transactionPathError(target, rawPath);
  return { absolute, relative: toPosix(relative) };
}

function assertLateAllowedPathsAreSafe(plan: TransactionPlan, mutationAllowedPaths: string[], commitOptions: Partial<TransactionCommitOptions>): void {
  if (commitOptions.allowDirtyWorktree !== true && commitOptions.defer !== true) return;
  const predeclared = new Set(plan.allowedPaths);
  const late = mutationAllowedPaths.filter((allowedPath) => !predeclared.has(allowedPath));
  if (late.length === 0) return;
  throw new GovernanceSyncError("Callback-added transaction paths must be predeclared when dirty worktree or deferred commit mode is enabled.", {
    code: "transaction-late-paths-require-predeclaration",
    details: { latePaths: late, predeclaredAllowedPaths: plan.allowedPaths, operation: plan.operation },
    recovery: ["Add callback-discovered paths to ChangeSet.allowedPaths before planning the transaction."],
  });
}

function assertNoOutOfScopeTransactionChanges(target: HarnessTransactionTarget, allowedPaths: string[], initialEntries: FingerprintedGitStatusEntry[]): void {
  const allowed = new Set(allowedPaths);
  const initialOutside = new Map(initialEntries.filter((entry) => !allowed.has(entry.path)).map((entry) => [entry.path, entry]));
  const unexpected: FingerprintedGitStatusEntry[] = [];
  const changed: Array<{ before: FingerprintedGitStatusEntry; after: FingerprintedGitStatusEntry }> = [];
  for (const entry of fingerprintEntries(target, transactionScopeEntries(target))) {
    if (allowed.has(entry.path)) continue;
    const initial = initialOutside.get(entry.path);
    if (!initial) {
      unexpected.push(entry);
    } else if (initial.raw !== entry.raw || initial.fingerprint !== entry.fingerprint) {
      changed.push({ before: initial, after: entry });
    }
  }
  if (unexpected.length === 0 && changed.length === 0) return;
  throw new GovernanceSyncError("Transaction produced changes outside the transaction write scope.", {
    code: "transaction-write-scope-violation",
    details: { unexpected, changed, allowedPaths },
    recovery: ["Declare all transaction-owned paths before applying, or remove unintended side effects."],
  });
}

function fingerprintEntries(target: HarnessTransactionTarget, entries: GitStatusEntry[]): FingerprintedGitStatusEntry[] {
  return entries.map((entry) => ({ ...entry, fingerprint: fingerprintEntry(target, entry) }));
}

function transactionScopeEntries(target: HarnessTransactionTarget): GitStatusEntry[] {
  const git = inspectGit(target.projectRoot);
  if (!git.inGit) return fileSystemStatusEntries(target.projectRoot);
  const result = defaultGitRunner.run(target.projectRoot, ["status", "--porcelain=v1", "--untracked-files=all"]);
  if (result.status !== 0) {
    const summary = gitCommandFailureSummary(result);
    throw new GovernanceSyncError(`git status failed while inspecting transaction write scope: ${summary}`, {
      code: "transaction-git-status-failed",
      details: {
        summary,
        errorCode: (result.error as NodeJS.ErrnoException | undefined)?.code || "",
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      },
      recovery: ["Inspect the Git error and retry after resolving it."],
    });
  }
  return parseGitStatus(result.stdout)
    .filter((entry) => entry.path !== ".harness/locks/governance-sync.lock");
}

function fileSystemStatusEntries(root: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];
  const visit = (directory: string): void => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = toPosix(path.relative(root, absolute));
      if (relative === ".harness/locks/governance-sync.lock") continue;
      if (entry.name === ".git") continue;
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      entries.push({ index: "?", worktree: "?", path: relative, raw: `?? ${relative}` });
    }
  };
  visit(root);
  return entries;
}

function fingerprintEntry(target: HarnessTransactionTarget, entry: GitStatusEntry): string {
  const absolute = path.join(target.projectRoot, entry.path);
  try {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) return `symlink:${fs.readlinkSync(absolute)}`;
    if (stat.isFile()) return `file:${stat.size}:${crypto.createHash("sha256").update(new Uint8Array(fs.readFileSync(absolute))).digest("hex")}`;
    if (stat.isDirectory()) return "directory";
    return `${stat.mode}:${stat.size}`;
  } catch {
    return "missing";
  }
}

function transactionPathError(target: HarnessTransactionTarget, rawPath: string): GovernanceSyncError {
  return new GovernanceSyncError("Transaction paths must be non-empty and stay inside the transaction target.", {
    code: "transaction-path-outside-target",
    details: { path: rawPath, targetRoot: target.projectRoot },
    recovery: ["Use a path inside the target project root."],
  });
}

function resolveExistingAncestorPath(absolutePath: string): string {
  const missingSegments: string[] = [];
  let current = path.resolve(absolutePath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    missingSegments.unshift(path.basename(current));
    current = parent;
  }
  const realAncestor = fs.realpathSync(current);
  return path.resolve(realAncestor, ...missingSegments);
}

function releaseGovernanceContext(context: ReturnType<typeof beginGovernanceSync> | null, lockPath: string): TransactionReleaseSummary {
  releaseGovernanceSync(context);
  return releaseSummary(lockPath, true);
}

function releaseSummary(lockPath: string, attempted: boolean): TransactionReleaseSummary {
  return {
    attempted,
    completed: !fs.existsSync(lockPath),
    lockPath,
  };
}

function governanceLockPath(target: HarnessTransactionTarget): string {
  return path.join(target.projectRoot, ".harness/locks/governance-sync.lock");
}

function summarizeError(error: unknown): TransactionErrorSummary {
  if (!(error instanceof Error)) return { name: "Error", message: String(error) };
  const candidate = error as Error & { code?: string; details?: unknown; recovery?: unknown[] };
  return {
    name: candidate.name || "Error",
    message: candidate.message,
    code: candidate.code,
    details: candidate.details,
    recovery: candidate.recovery,
  };
}
