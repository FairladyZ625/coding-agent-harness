import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
// @ts-ignore core-shared remains a JS runtime dependency until its migration PR.
import { toPosix } from "./core-shared.mjs";
export class ReviewConfirmGitGateError extends Error {
    code;
    status;
    details;
    recovery;
    constructor(message, { code = "review-confirm-git-gate-failed", status = 409, details = {}, recovery = [] } = {}) {
        super(message);
        this.name = "ReviewConfirmGitGateError";
        this.code = code;
        this.status = status;
        this.details = details;
        this.recovery = recovery;
    }
}
export function prepareReviewConfirmGitGate(projectRoot, allowedFilesAbs) {
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
    assertCleanWorkingTree(gitRoot);
    assertCommitIdentity(gitRoot);
    return { gitRoot, allowedPaths };
}
export function commitReviewConfirmationGate(gate, { taskId, reviewPath, writeFinalAudit, message = "" }) {
    const subjectSuffix = taskId.replace(/[^A-Za-z0-9._/-]+/g, "-");
    assertOnlyAllowedChanged(gate.gitRoot, gate.allowedPaths);
    git(gate.gitRoot, ["add", "--", ...gate.allowedPaths]);
    assertOnlyAllowedStaged(gate.gitRoot, gate.allowedPaths);
    const confirmCommit = commit(gate.gitRoot, `chore: confirm review ${subjectSuffix}`, {
        recovery: [
            "Review confirmation files were written but not committed.",
            `Inspect and either fix hooks then run: git add -- ${gate.allowedPaths.join(" ")} && git commit`,
            "Or manually revert the written review confirmation files if the confirmation should not proceed.",
        ],
    });
    writeFinalAudit(confirmCommit);
    const reviewRelativePath = toPosix(path.relative(gate.gitRoot, path.resolve(reviewPath)));
    git(gate.gitRoot, ["add", "--", reviewRelativePath]);
    assertOnlyAllowedStaged(gate.gitRoot, gate.allowedPaths);
    const auditCommit = commit(gate.gitRoot, `chore: record review confirmation audit ${subjectSuffix}`, {
        recovery: [
            "The confirmation commit was created, but final audit metadata could not be committed.",
            `Confirmation commit SHA: ${confirmCommit}`,
            `Fix hooks, then stage ${reviewRelativePath} and commit the audit metadata.`,
        ],
    });
    assertCleanWorkingTree(gate.gitRoot);
    return {
        commitSha: confirmCommit,
        auditCommitSha: auditCommit,
        auditStatus: "committed",
        allowedPaths: gate.allowedPaths,
        message,
    };
}
export function validateReviewConfirmationGitAudit({ projectRoot, taskId, reviewPath, progressPath, commitSha }) {
    const issues = [];
    const addIssue = (code) => issues.push(code);
    const root = projectRoot ? path.resolve(projectRoot) : "";
    const reviewRelativePath = root && reviewPath ? toPosix(path.relative(root, path.resolve(reviewPath))) : "";
    const progressRelativePath = root && progressPath ? toPosix(path.relative(root, path.resolve(progressPath))) : "";
    const expectedPaths = [reviewRelativePath, progressRelativePath].filter(Boolean).sort();
    if (!root)
        addIssue("git-audit-context-missing");
    if (!commitSha)
        addIssue("git-audit-commit-missing");
    if (issues.length > 0)
        return { valid: false, issues };
    const gitRootResult = git(root, ["rev-parse", "--show-toplevel"], { allowFailure: true });
    if (gitRootResult.status !== 0) {
        return { valid: false, issues: ["git-audit-repository-missing"] };
    }
    const gitRoot = path.resolve(gitRootResult.stdout.trim());
    if (real(gitRoot) !== real(root))
        addIssue("git-audit-root-mismatch");
    const commitResult = git(root, ["rev-parse", "--verify", `${commitSha}^{commit}`], { allowFailure: true });
    if (commitResult.status !== 0) {
        return { valid: false, issues: [...issues, "git-audit-commit-missing"] };
    }
    const fullCommitSha = commitResult.stdout.trim();
    const reachable = git(root, ["merge-base", "--is-ancestor", fullCommitSha, "HEAD"], { allowFailure: true });
    if (reachable.status !== 0)
        addIssue("git-audit-commit-not-reachable");
    const subject = git(root, ["show", "-s", "--format=%s", fullCommitSha], { allowFailure: true }).stdout.trim();
    const expectedSubject = `chore: confirm review ${String(taskId || "").replace(/[^A-Za-z0-9._/-]+/g, "-")}`;
    if (subject !== expectedSubject)
        addIssue("git-audit-subject-mismatch");
    const changedPaths = git(root, ["diff-tree", "--no-commit-id", "--name-only", "-r", fullCommitSha], { allowFailure: true }).stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map(toPosix)
        .sort();
    if (expectedPaths.length === 0)
        addIssue("git-audit-allowlist-missing");
    if (changedPaths.join("\n") !== expectedPaths.join("\n"))
        addIssue("git-audit-allowlist-mismatch");
    return {
        valid: issues.length === 0,
        issues,
        commitSha: fullCommitSha,
        changedPaths,
        expectedPaths,
        subject,
    };
}
function requireGitRoot(root) {
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
function assertAllowedPaths(paths) {
    const disallowed = paths.filter((relativePath) => {
        if (!relativePath || relativePath.startsWith("../") || path.isAbsolute(relativePath))
            return true;
        if (relativePath === "AGENTS.md" || relativePath === "CLAUDE.md")
            return true;
        if (relativePath === "docs" || relativePath.startsWith("docs/"))
            return false;
        if (relativePath === ".harness-private" || relativePath.startsWith(".harness-private/"))
            return true;
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
function assertCleanWorkingTree(gitRoot) {
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
function assertCommitIdentity(gitRoot) {
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
function assertOnlyAllowedChanged(gitRoot, allowedPaths) {
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
function assertOnlyAllowedStaged(gitRoot, allowedPaths) {
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
function commit(gitRoot, message, { recovery }) {
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
function statusEntries(gitRoot) {
    const output = git(gitRoot, ["status", "--porcelain=v1", "--untracked-files=all"]).stdout;
    return output.split(/\r?\n/).filter(Boolean).map((line) => ({
        index: line.slice(0, 1),
        worktree: line.slice(1, 2),
        path: parseStatusPath(line.slice(3)),
        raw: line,
    }));
}
function parseStatusPath(value) {
    const unquoted = value.replace(/^"|"$/g, "");
    const renamed = unquoted.includes(" -> ") ? unquoted.split(" -> ").pop() : unquoted;
    return renamed || "";
}
function git(cwd, args, { allowFailure = false } = {}) {
    const result = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (!allowFailure && result.status !== 0) {
        throw new ReviewConfirmGitGateError(`git ${args.join(" ")} failed`, {
            code: "git-command-failed",
            details: { stdout: result.stdout.trim(), stderr: result.stderr.trim() },
            recovery: ["Inspect the Git error and retry review-confirm after resolving it."],
        });
    }
    return result;
}
function real(filePath) {
    return fs.realpathSync(filePath);
}
