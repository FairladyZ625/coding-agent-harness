# Module Registry

## Purpose

Track module ownership, write scope, branch or worktree assignment, and coordinator sync state for parallel agent work.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| unassigned | Module exists but has no active owner. | Assign owner before work starts. |
| reserved | Owner and scope are assigned. | Open worktree or begin planning. |
| active | Module work is in progress. | Keep branch, plan, and blockers current. |
| handoff | Worker has produced a reviewable result. | Coordinator reviews and integrates. |
| merged | Module changes are integrated. | Link merge evidence and close residuals. |
| blocked | Module cannot proceed. | Record blocker owner and unblock condition. |
| archived | Module assignment is historical. | Keep archive pointer if needed. |

## Active Modules

| ID | Module | Path Scope | Owner | Status | Branch or Worktree | Task Plan | Shared Files | Depends On | Handoff Evidence | Residual | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| M-000 | Module title | src/module/** or docs/area/** | owner | reserved | branch or worktree path | docs/09-PLANNING/TASKS/.../task_plan.md | none | none | pending | none | YYYY-MM-DD |

## Shared-File Register

| File | Current Owner | Coordination Rule | Active Consumers | Last Sync |
| --- | --- | --- | --- | --- |
| path/to/shared-file | coordinator | only coordinator edits, workers propose patches | M-000, M-001 | YYYY-MM-DD |

## Routing Rules

1. Define module path scope before assigning a worker.
2. Workers must not edit outside their assigned scope without coordinator approval.
3. Shared files need an explicit owner and sync rule before parallel work starts.
4. Move a module to `handoff` only when the worker provides evidence, residuals, and integration notes.
5. The coordinator owns final merge, shared-file reconciliation, and Delivery SSoT updates.

## Archive Rules

- Keep active, blocked, and handoff rows visible until integration completes.
- Archive merged module rows after the delivery or release closeout is stable.
- Preserve branch, worktree, task plan, and handoff evidence in the archive row.
