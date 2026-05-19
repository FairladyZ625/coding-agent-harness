# Worktree Standard

## Purpose

Define how git worktrees are used to isolate implementation, support parallel agents, and protect unrelated work.

## Rules

1. Use a separate worktree for non-trivial feature work when the main checkout is dirty, multiple workers are active, or the task needs isolated verification.
2. Name branches and worktrees with task intent, not vague labels.
3. Before editing, record the current branch, worktree path, git status, allowed paths, and forbidden paths.
4. Workers must not edit outside their assigned scope unless the coordinator updates the plan.
5. Shared files must be owned by the coordinator or merged through an explicit integration pass.
6. Run verification from the worktree that contains the final integrated changes.
7. Clean up merged worktrees only after the branch state, commits, and any needed artifacts are confirmed.

## Required Checklist

- Worktree path and branch are recorded.
- Scope boundaries are documented.
- Dirty state and unrelated changes are noted before work.
- Dependencies are installed or verified in the worktree when needed.
- Handoff includes changed paths, checks, review notes, and residuals.
- Integration branch is verified after merging worker output.

## Closeout Expectations

Worktree closeout must identify the branch and worktree used, list changed paths, confirm unrelated changes were preserved, report verification from the final state, and state whether the worktree was retained or cleaned up.
