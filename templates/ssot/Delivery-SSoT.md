# Delivery SSoT

## Purpose

Coordinate cross-role, cross-repository, or multi-module delivery work. This file is the active contract for who is moving which slice, what must synchronize, and what blocks release.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| shaping | Delivery scope is being split or sequenced. | Define slices, owners, and integration points. |
| ready | Delivery plan is accepted. | Open worktrees, branches, or tickets as needed. |
| active | One or more slices are in progress. | Update sync points and blockers. |
| integration | Slices are being merged or reconciled. | Run integration checks and resolve conflicts. |
| blocked | Delivery cannot proceed. | Record blocker owner and unblock condition. |
| released | Delivery is complete and closeout exists. | Keep links until the release is no longer current. |
| archived | Delivery is historical. | Keep archive pointer and release evidence. |

## Active Deliveries

| ID | Delivery | Scope | Coordinator | Status | Slices | Integration Point | Release Gate | Closeout | Residual | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| D-000 | Short delivery title | repo, module, or release scope | owner | ready | M-000, M-001 | branch, PR, or merge window | RG-000 or release checklist | pending | none | YYYY-MM-DD |

## Sync Points

| ID | When | Participants | Required Input | Decision or Output | Owner |
| --- | --- | --- | --- | --- | --- |
| SYNC-000 | YYYY-MM-DD or trigger | owners | plans, diffs, evidence, or blockers | merge decision, split decision, or release decision | coordinator |

## Routing Rules

1. Use Delivery SSoT when work spans more than one owner, module, repository, or release gate.
2. Keep module ownership in Module Registry and link module IDs from delivery rows.
3. A delivery cannot move to `released` while any release-blocking slice remains unresolved.
4. Integration conflicts, shared-file edits, and `accepted-risk` decisions must be visible here even if detailed elsewhere.
5. The coordinator owns this file; individual workers own their slice plans and evidence.

## Archive Rules

- Archive released deliveries after their release evidence is stable and no active slice depends on them.
- Keep an archive pointer in the active table for recently released work if follow-up is expected.
- Preserve blocker history when archiving failed, canceled, or deferred deliveries.
