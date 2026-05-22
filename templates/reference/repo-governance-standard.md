# Repository Governance Standard

## Purpose

Define repository-level rules for branches, commits, pull requests, ownership, generated files, and merge safety.

## Rules

1. Respect the current worktree state. Do not revert or overwrite unrelated changes from other people or agents.
2. Use task-scoped branches and worktrees for non-trivial changes, especially when multiple workers are active.
3. Keep commits focused on the requested scope and avoid mixing unrelated cleanup with feature work.
4. Generated files, caches, build output, local runtime state, and secrets must be ignored or stored in the approved location.
5. Commit verified, meaningful slices proactively. Deferred commits require an explicit reason and owner.
6. Pull requests must describe intent, changed surfaces, checks run, checks not run, review status, and residual risk.
7. Required checks and material review findings block merge unless an approved exception is recorded.
8. Merge or release ownership must be explicit when several branches or workers contribute to the same outcome.

## Required Checklist

- Branch and worktree ownership are clear.
- Allowed and forbidden paths are respected.
- Dirty worktree state was checked before edits.
- Generated and private files are not accidentally staged.
- Verified slices have commit SHAs, or deferred commit rationale is recorded.
- PR summary includes evidence and residuals.
- Review findings are resolved or explicitly accepted.
- Merge strategy and rollback or revert path are understood.

## Closeout Expectations

Repository closeout must list changed paths, confirm scope boundaries were honored, report git status relevant to the task, cite relevant commit SHAs or deferred-commit rationale, summarize checks, and identify unrelated dirty files left untouched.
