# Delivery Operating Model Standard

## Purpose

Define how work is organized across owners, agents, branches, reviews, and release gates before implementation starts.

## Rules

1. Select the operating model before coding: solo owner, coordinator plus workers, review-only workers, or release steward model.
2. Work must have a named coordinator when multiple agents or humans touch related surfaces.
3. Shared files, global styles, build configuration, schemas, and release scripts require coordinator ownership. Workers must not make unplanned edits to shared surfaces.
4. Parallel work must be split by low-conflict boundaries such as module, route, package, document area, or test surface.
5. Each worker must have a scope statement, allowed paths, forbidden paths, expected artifacts, and handoff format.
6. The coordinator owns final merge, conflict resolution, evidence consolidation, and residual risk summary.
7. The operating model must identify which decisions can be made by workers and which require coordinator approval.

## Required Artifacts

- Delivery model statement in the task plan.
- Scope map for each owner or worker.
- Shared-surface ownership list.
- Handoff requirements for code, tests, review notes, and evidence.
- Merge and release gate checklist.
- Residual risk owner for unresolved items.

## Closeout Expectations

Closeout must show that all worker handoffs were reviewed, shared-surface changes were reconciled by the coordinator, required checks were run from the integration branch, and remaining residuals have owners.
