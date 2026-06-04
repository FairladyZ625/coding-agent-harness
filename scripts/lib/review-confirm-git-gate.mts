import path from "node:path";
import fs from "node:fs";
import { toPosix } from "./core-shared.mjs";
import { defaultGitRunner, type GitCommandResult, type GitStatusEntry } from "./git-runner.mjs";

type AnyRecord = Record<string, unknown>;

type ReviewConfirmGate = {
  gitRoot: string;
  allowedPaths: string[];
  baselineOutsideEntries: GitStatusEntry[];
};

export class ReviewConfirmGitGateError extends Error {
  code: string;
  status: number;
  details: AnyRecord;
  recovery: string[];

  constructor(message: string, { code = "review-confirm-git-gate-failed", status = 409, details = {}, recovery = [] }: { code?: string; status?: number; details?: AnyRecord; recovery?: string[] } = {}) {
    super(message);
    this.name = "ReviewConfirmGitGateError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.recovery = recovery;
  }
}

export function prepareReviewConfirmGitGate(projectRoot: string, allowedFilesAbs: string[]): ReviewConfirmGate {
  const root = path.resolve(projectRoot);
  const resolvedGitRoot = requireGitRoot(root);
  if (real(resolvedGitRoot) !== real(root)) {
    throw new ReviewConfirmGitGateError("Target must be the Git repository root for review confirmation auto-commit.", {
      code: "git-root-mismatch",
      details: { targetRoot: root, gitRoot: resolvedGitRoot },
      recovery: [
        "Run review-confirm from the repository root for the target task.",
        "For private harness tasks, run against the private harness repository root, not the public parent.",
      ],
    });
  }
  const gitRoot = root;
  const allowedPaths = allowedFilesAbs.map((filePath) => toPosix(path.relative(gitRoot, path.resolve(filePath))));
  assertAllowedPaths(allowedPaths);
  const baselineEntries = statusEntries(gitRoot);
  assertOwnedPathsClean(allowedPaths, baselineEntries);
  assertOnlyAllowedStaged(gitRoot, allowedPaths);
  assertCommitIdentity(gitRoot);
  return {
    gitRoot,
    allowedPaths,
    baselineOutsideEntries: outsideEntries(baselineEntries, allowedPaths),
  };
}

export function commitReviewConfirmationGate(
  gate: ReviewConfirmGate,
  { taskId, reviewPath, writeFinalAudit, message = "" }: { taskId: string; reviewPath: string; writeFinalAudit: (commitSha: string) => void; message?: string },
): AnyRecord {
  const subjectSuffix = taskId.replace(/[^A-Za-z0-9._/-]+/g, "-");
  assertOutsideStatusUnchanged(gate.gitRoot, gate.allowedPaths, gate.baselineOutsideEntries);
  git(gate.gitRoot, ["add", "--", ...gate.allowedPaths]);
  assertOutsideStatusUnchanged(gate.gitRoot, gate.allowedPaths, gate.baselineOutsideEntries);
  const confirmCommit = commitOnly(gate.gitRoot, `chore: confirm review ${subjectSuffix}`, gate.allowedPaths, {
    recovery: [
      "Review confirmation files were written but not committed.",
      `Inspect and either fix hooks then run: git add -- ${gate.allowedPaths.join(" ")} && git commit --only -- ${gate.allowedPaths.join(" ")}`,
      "Or manually revert the written review confirmation files if the confirmation should not proceed.",
    ],
  });
  assertOwnedPathsClean(gate.allowedPaths, statusEntries(gate.gitRoot));

  writeFinalAudit(confirmCommit);
  const reviewRelativePath = toPosix(path.relative(gate.gitRoot, path.resolve(reviewPath)));
  git(gate.gitRoot, ["add", "--", reviewRelativePath]);
  assertOutsideStatusUnchanged(gate.gitRoot, gate.allowedPaths, gate.baselineOutsideEntries);
  const auditCommit = commitOnly(gate.gitRoot, `chore: record review confirmation audit ${subjectSuffix}`, gate.allowedPaths, {
    recovery: [
      "The confirmation commit was created, but final audit metadata could not be committed.",
      `Confirmation commit SHA: ${confirmCommit}`,
      `Fix hooks, then stage ${reviewRelativePath} and commit --only -- ${reviewRelativePath}.`,
    ],
  });
  assertOwnedPathsClean(gate.allowedPaths, statusEntries(gate.gitRoot));
  assertOutsideStatusUnchanged(gate.gitRoot, gate.allowedPaths, gate.baselineOutsideEntries);
  return {
    commitSha: confirmCommit,
    auditCommitSha: auditCommit,
    auditStatus: "committed",
    allowedPaths: gate.allowedPaths,
    message,
  };
}

export function validateReviewConfirmationGitAudit({ projectRoot, taskId, reviewPath, progressPath, commitSha, expectedPathGroups = [] }: {
  projectRoot?: string;
  taskId?: string;
  reviewPath?: string;
  progressPath?: string;
  commitSha?: string;
  expectedPathGroups?: string[][];
}): AnyRecord {
  const issues: string[] = [];
  const addIssue = (code: string) => issues.push(code);
  const root = projectRoot ? path.resolve(projectRoot) : "";
  const reviewRelativePath = root && reviewPath ? toPosix(path.relative(root, path.resolve(reviewPath))) : "";
  const progressRelativePath = root && progressPath ? toPosix(path.relative(root, path.resolve(progressPath))) : "";
  const defaultExpectedPaths = [reviewRelativePath, progressRelativePath].filter(Boolean).sort();
  const expectedPathCandidates = normalizeExpectedPathGroups(root, expectedPathGroups, defaultExpectedPaths);
  if (!root) addIssue("git-audit-context-missing");
  if (!commitSha) addIssue("git-audit-commit-missing");
  if (issues.length > 0) return { valid: false, issues };

  const gitRootResult = git(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (gitRootResult.status !== 0) {
    return { valid: false, issues: ["git-audit-repository-missing"] };
  }
  const gitRoot = path.resolve(gitRootResult.stdout.trim());
  if (!sameRealPath(gitRoot, root)) addIssue("git-audit-root-mismatch");

  const commitResult = defaultGitRunner.verifyCommit(root, commitSha || "");
  if (commitResult.status !== 0) {
    return { valid: false, issues: [...issues, "git-audit-commit-missing"] };
  }
  const fullCommitSha = commitResult.stdout.trim();
  if (!defaultGitRunner.isAncestor(root, fullCommitSha)) addIssue("git-audit-commit-not-reachable");

  const subject = defaultGitRunner.commitSubject(root, fullCommitSha);
  const expectedSubject = `chore: confirm review ${String(taskId || "").replace(/[^A-Za-z0-9._/-]+/g, "-")}`;
  const batchSubject = subject === "chore: confirm selected reviews";
  if (subject !== expectedSubject && !batchSubject) addIssue("git-audit-subject-mismatch");

  const changedPaths = defaultGitRunner.commitChangedPaths(root, fullCommitSha);
  if (expectedPathCandidates.length === 0) addIssue("git-audit-allowlist-missing");
  let matchedExpectedPaths: string[] = expectedPathCandidates[0] || [];
  if (batchSubject) {
    const matched = expectedPathCandidates.find((expectedPaths) => expectedPaths.every((expectedPath) => changedPaths.includes(expectedPath)));
    if (matched) matchedExpectedPaths = matched;
    const batchPathsAllowed = changedPaths.every((changedPath) => /(^|\/)coding-agent-harness\/planning\/(?:tasks|modules)\/.+\/INDEX\.md$/.test(changedPath));
    if (!matched || !batchPathsAllowed) addIssue("git-audit-allowlist-mismatch");
  } else {
    const matched = expectedPathCandidates.find((expectedPaths) => changedPaths.join("\n") === expectedPaths.join("\n"));
    if (matched) matchedExpectedPaths = matched;
    else addIssue("git-audit-allowlist-mismatch");
  }

  return {
    valid: issues.length === 0,
    issues,
    commitSha: fullCommitSha,
    changedPaths,
    expectedPaths: matchedExpectedPaths,
    expectedPathGroups: expectedPathCandidates,
    subject,
  };
}

function normalizeExpectedPathGroups(root: string, groups: string[][], fallback: string[]): string[][] {
  const normalized = [...groups, fallback]
    .map((group) => [...new Set((group || []).map((item) => normalizeExpectedPath(root, item)).filter(Boolean))].sort())
    .filter((group) => group.length > 0);
  const seen = new Set<string>();
  return normalized.filter((group) => {
    const key = group.join("\n");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeExpectedPath(root: string, item: string): string {
  const raw = String(item || "").trim();
  if (!raw) return "";
  if (!root || path.isAbsolute(raw)) return toPosix(path.relative(root, path.resolve(raw)));
  return toPosix(raw);
}

function requireGitRoot(root: string): string {
  const result = git(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (result.status !== 0) {
    throw new ReviewConfirmGitGateError("Review confirmation auto-commit requires a Git repository.", {
      code: "git-repository-missing",
      details: { root, stderr: result.stderr.trim() },
      recovery: ["Initialize Git for the target project or run review-confirm from the correct repository root."],
    });
  }
  return path.resolve(result.stdout.trim());
}

function assertAllowedPaths(paths: string[]): void {
  const disallowed = paths.filter((relativePath) => {
    if (!relativePath || relativePath.startsWith("../") || path.isAbsolute(relativePath)) return true;
    return !/(^|\/)coding-agent-harness\/planning\/(?:tasks|modules)\/.+\/INDEX\.md$/.test(relativePath);
  });
  if (disallowed.length > 0) {
    throw new ReviewConfirmGitGateError("Review confirmation write allowlist contains forbidden paths.", {
      code: "git-allowlist-forbidden-path",
      details: { disallowed },
      recovery: ["Limit review-confirm writes to the current task INDEX.md file."],
    });
  }
}

function assertCleanWorkingTree(gitRoot: string): void {
  const entries = statusEntries(gitRoot);
  if (entries.length > 0) {
    throw new ReviewConfirmGitGateError("Git working tree is not clean; refusing review confirmation auto-commit.", {
      code: "git-dirty-working-tree",
      details: { entries },
      recovery: [
        "Commit, move, or intentionally discard unrelated changes before review-confirm.",
        "Do not stash/reset automatically; resolve ownership of the dirty files first.",
      ],
    });
  }
}

function assertOwnedPathsClean(allowedPaths: string[], entries: GitStatusEntry[]): void {
  const ownedDirty = entries.filter((entry) => allowedPaths.includes(entry.path));
  if (ownedDirty.length > 0) {
    throw new ReviewConfirmGitGateError("Review confirmation owned path is already dirty; refusing to overwrite existing task confirmation state.", {
      code: "git-owned-path-dirty",
      details: { entries: ownedDirty, allowedPaths },
      recovery: [
        "Commit or resolve the existing task INDEX.md edits before retrying review-confirm.",
        "Unrelated dirty files may remain; only the review-confirm owned paths must be clean.",
      ],
    });
  }
}

function outsideEntries(entries: GitStatusEntry[], allowedPaths: string[]): GitStatusEntry[] {
  return entries.filter((entry) => !allowedPaths.includes(entry.path));
}

function assertOutsideStatusUnchanged(gitRoot: string, allowedPaths: string[], baselineOutsideEntries: GitStatusEntry[]): void {
  const currentOutside = outsideEntries(statusEntries(gitRoot), allowedPaths);
  if (statusSignature(currentOutside) !== statusSignature(baselineOutsideEntries)) {
    throw new ReviewConfirmGitGateError("Review confirmation changed files outside the write allowlist.", {
      code: "git-outside-status-changed",
      details: { before: baselineOutsideEntries, after: currentOutside, allowedPaths },
      recovery: [
        "Inspect the extra files and do not commit them through review-confirm.",
        "Revert only unintended review-confirm side effects, then retry.",
      ],
    });
  }
}

function statusSignature(entries: GitStatusEntry[]): string {
  return entries
    .map((entry) => `${entry.index}${entry.worktree} ${entry.path}`)
    .sort()
    .join("\n");
}

function assertCommitIdentity(gitRoot: string): void {
  const { name, email } = defaultGitRunner.identity(gitRoot);
  if (!name || !email) {
    throw new ReviewConfirmGitGateError("Git commit identity is missing; refusing review confirmation auto-commit.", {
      code: "git-identity-missing",
      details: { hasName: Boolean(name), hasEmail: Boolean(email) },
      recovery: [
        "Set a local Git identity for this repository:",
        "git config user.name \"Your Name\"",
        "git config user.email \"you@example.com\"",
      ],
    });
  }
}

function assertOnlyAllowedChanged(gitRoot: string, allowedPaths: string[]): void {
  const entries = statusEntries(gitRoot);
  const outside = entries.filter((entry) => !allowedPaths.includes(entry.path));
  if (outside.length > 0) {
    throw new ReviewConfirmGitGateError("Review confirmation produced changes outside the write allowlist.", {
      code: "git-allowlist-violation",
      details: { entries, allowedPaths },
      recovery: [
        "Inspect the extra files and do not commit them through review-confirm.",
        "Revert only the unintended review-confirm side effects, then retry.",
      ],
    });
  }
}

function assertOnlyAllowedStaged(gitRoot: string, allowedPaths: string[]): void {
  const entries = statusEntries(gitRoot);
  const stagedOutside = entries.filter((entry) => entry.index !== " " && entry.index !== "?" && !allowedPaths.includes(entry.path));
  if (stagedOutside.length > 0) {
    throw new ReviewConfirmGitGateError("Git index contains staged files outside the review confirmation allowlist.", {
      code: "git-index-allowlist-violation",
      details: { stagedOutside, allowedPaths },
      recovery: ["Unstage unrelated files before retrying review-confirm."],
    });
  }
}

function commit(gitRoot: string, message: string, { recovery }: { recovery: string[] }): string {
  const result = git(gitRoot, ["commit", "-m", message], { allowFailure: true });
  if (result.status !== 0) {
    throw new ReviewConfirmGitGateError("Git commit failed during review confirmation auto-commit.", {
      code: "git-commit-failed",
      details: { stdout: result.stdout.trim(), stderr: result.stderr.trim() },
      recovery,
    });
  }
  return git(gitRoot, ["rev-parse", "HEAD"]).stdout.trim();
}

function commitOnly(gitRoot: string, message: string, paths: string[], { recovery }: { recovery: string[] }): string {
  const result = git(gitRoot, ["commit", "--only", "-m", message, "--", ...paths], { allowFailure: true });
  if (result.status !== 0) {
    throw new ReviewConfirmGitGateError("Git commit failed during review confirmation auto-commit.", {
      code: "git-commit-failed",
      details: { stdout: result.stdout.trim(), stderr: result.stderr.trim() },
      recovery,
    });
  }
  return git(gitRoot, ["rev-parse", "HEAD"]).stdout.trim();
}

function statusEntries(gitRoot: string): GitStatusEntry[] {
  return defaultGitRunner.statusEntries(gitRoot);
}

function git(cwd: string, args: string[], { allowFailure = false } = {}): GitCommandResult {
  const result = args.join("\0") === "rev-parse\0--show-toplevel"
    ? defaultGitRunner.root(cwd)
    : defaultGitRunner.run(cwd, args);
  if (!allowFailure && result.status !== 0) {
    throw new ReviewConfirmGitGateError(`git ${args.join(" ")} failed`, {
      code: "git-command-failed",
      details: { stdout: result.stdout.trim(), stderr: result.stderr.trim() },
      recovery: ["Inspect the Git error and retry review-confirm after resolving it."],
    });
  }
  return result;
}

function real(filePath: string): string {
  return fs.realpathSync(filePath);
}

function sameRealPath(left: string, right: string): boolean {
  const leftReal = real(left);
  const rightReal = real(right);
  if (leftReal === rightReal) return true;
  if (process.platform === "darwin" || process.platform === "win32") return leftReal.toLowerCase() === rightReal.toLowerCase();
  return false;
}
