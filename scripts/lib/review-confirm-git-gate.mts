import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
// @ts-ignore core-shared remains a JS runtime dependency until its migration PR.
import { toPosix } from "./core-shared.mjs";

type AnyRecord = Record<string, any>;

type GitStatusEntry = {
  index: string;
  worktree: string;
  path: string;
  raw: string;
};

type ReviewConfirmGate = {
  gitRoot: string;
  allowedPaths: string[];
  baselineOutsideEntries: GitStatusEntry[];
};

type GitResult = ReturnType<typeof spawnSync> & {
  stdout: string;
  stderr: string;
  status: number | null;
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

export function validateReviewConfirmationGitAudit({ projectRoot, taskId, reviewPath, progressPath, commitSha }: { projectRoot?: string; taskId?: string; reviewPath?: string; progressPath?: string; commitSha?: string }): AnyRecord {
  const issues: string[] = [];
  const addIssue = (code: string) => issues.push(code);
  const root = projectRoot ? path.resolve(projectRoot) : "";
  const reviewRelativePath = root && reviewPath ? toPosix(path.relative(root, path.resolve(reviewPath))) : "";
  const progressRelativePath = root && progressPath ? toPosix(path.relative(root, path.resolve(progressPath))) : "";
  const expectedPaths = [reviewRelativePath, progressRelativePath].filter(Boolean).sort();
  if (!root) addIssue("git-audit-context-missing");
  if (!commitSha) addIssue("git-audit-commit-missing");
  if (issues.length > 0) return { valid: false, issues };

  const gitRootResult = git(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
  if (gitRootResult.status !== 0) {
    return { valid: false, issues: ["git-audit-repository-missing"] };
  }
  const gitRoot = path.resolve(gitRootResult.stdout.trim());
  if (real(gitRoot) !== real(root)) addIssue("git-audit-root-mismatch");

  const commitResult = git(root, ["rev-parse", "--verify", `${commitSha}^{commit}`], { allowFailure: true });
  if (commitResult.status !== 0) {
    return { valid: false, issues: [...issues, "git-audit-commit-missing"] };
  }
  const fullCommitSha = commitResult.stdout.trim();
  const reachable = git(root, ["merge-base", "--is-ancestor", fullCommitSha, "HEAD"], { allowFailure: true });
  if (reachable.status !== 0) addIssue("git-audit-commit-not-reachable");

  const subject = git(root, ["show", "-s", "--format=%s", fullCommitSha], { allowFailure: true }).stdout.trim();
  const expectedSubject = `chore: confirm review ${String(taskId || "").replace(/[^A-Za-z0-9._/-]+/g, "-")}`;
  const batchSubject = subject === "chore: confirm selected reviews";
  if (subject !== expectedSubject && !batchSubject) addIssue("git-audit-subject-mismatch");

  const changedPaths = git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", fullCommitSha], { allowFailure: true }).stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(toPosix)
    .sort();
  if (expectedPaths.length === 0) addIssue("git-audit-allowlist-missing");
  if (batchSubject) {
    const expectedIncluded = expectedPaths.every((expectedPath) => changedPaths.includes(expectedPath));
    const batchPathsAllowed = changedPaths.every((changedPath) => /(^|\/)coding-agent-harness\/planning\/(?:tasks|modules)\/.+\/INDEX\.md$/.test(changedPath));
    if (!expectedIncluded || !batchPathsAllowed) addIssue("git-audit-allowlist-mismatch");
  } else if (changedPaths.join("\n") !== expectedPaths.join("\n")) addIssue("git-audit-allowlist-mismatch");

  return {
    valid: issues.length === 0,
    issues,
    commitSha: fullCommitSha,
    changedPaths,
    expectedPaths,
    subject,
  };
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
    if (relativePath === "AGENTS.md" || relativePath === "CLAUDE.md") return true;
    if (relativePath === "docs" || relativePath.startsWith("docs/")) return false;
    if (relativePath === ".harness-private" || relativePath.startsWith(".harness-private/")) return true;
    return false;
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
  const name = git(gitRoot, ["config", "--get", "user.name"], { allowFailure: true }).stdout.trim();
  const email = git(gitRoot, ["config", "--get", "user.email"], { allowFailure: true }).stdout.trim();
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
  const stagedOutside = entries.filter((entry) => entry.index !== " " && !allowedPaths.includes(entry.path));
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
  const output = git(gitRoot, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout;
  return output.split(/\r?\n/).filter(Boolean).map((line) => ({
    index: line.slice(0, 1),
    worktree: line.slice(1, 2),
    path: parseStatusPath(line.slice(3)),
    raw: line,
  }));
}

function parseStatusPath(value: string): string {
  const unquoted = value.replace(/^"|"$/g, "");
  const renamed = unquoted.includes(" -> ") ? unquoted.split(" -> ").pop() : unquoted;
  return renamed || "";
}

function git(cwd: string, args: string[], { allowFailure = false } = {}): GitResult {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (!allowFailure && result.status !== 0) {
    throw new ReviewConfirmGitGateError(`git ${args.join(" ")} failed`, {
      code: "git-command-failed",
      details: { stdout: result.stdout.trim(), stderr: result.stderr.trim() },
      recovery: ["Inspect the Git error and retry review-confirm after resolving it."],
    });
  }
  return result as GitResult;
}

function real(filePath: string): string {
  return fs.realpathSync(filePath);
}
