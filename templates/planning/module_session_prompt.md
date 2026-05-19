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

## Shared Sync Rule

Do not update Module Registry, Harness Ledger, Closeout SSoT, Regression SSoT, or Cadence Ledger from a worker session unless the coordinator assigned the shared lock.

## Stop Rule

Pause and report if the requested change requires editing outside the assigned scope, resolving unrelated dirty files, making a product decision, or changing a shared contract.
