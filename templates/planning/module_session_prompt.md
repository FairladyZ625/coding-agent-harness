# Module Worker Session Prompt

## Context Package

- Project: [project]
- Module key: [module]
- Task directory: [path]
- Module plan: [path]
- Assigned worktree: [path]
- Assigned branch: [branch]

## Goal

[State one concrete module outcome.]

## Write Scope

You may edit only:

- [path]

Do not edit shared SSoT files, coordinator-owned integration files, or unrelated modules unless the coordinator explicitly assigns that scope.

## Required Output

- Branch name
- Commit SHA
- Files changed
- Checks run and results
- Residual risks
- Coordinator updates needed

## Review And State Rule

- Keep `task.state`, `lifecycleState`, `reviewStatus`, and `closeoutStatus` separate when reporting progress.
- `done` means the implementation step finished. It is not `closed` until closeout evidence is recorded.
- Use the current task `visual_map.md` phase table as the lifecycle map. At the end of a slice, inspect the current gate phase and follow its `Exit Command` only when its `Actor` is `agent`.
- If review is required, update `review.md`. Human review completion must be confirmed through the local dashboard workbench or by the coordinator with `harness review-confirm`; do not mark it complete while open P0/P1/P2 findings remain.

## Shared Sync Rule

Do not update Module Registry, Harness Ledger, Closeout SSoT, Regression SSoT, or Cadence Ledger from a worker session unless the coordinator assigned the shared lock.

## Stop Rule

Pause and report if the requested change requires editing outside the assigned scope, resolving unrelated dirty files, making a product decision, or changing a shared contract.
