# Harness Ledger

## Purpose

Track whether each meaningful task kept the harness contract intact: planning, scope control, SSoT updates, regression evidence, review, walkthrough, lessons, and reference routing.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| proposed | Work is identified but not accepted into active execution. | Assign an owner or reject with a reason. |
| planned | Scope, owner, and expected evidence are known. | Start execution or update schedule. |
| active | Work is in progress. | Keep task plan and evidence current. |
| review | Implementation is complete and waiting for review or verification. | Complete review and regression gates. |
| blocked | Work cannot proceed without a decision or dependency. | Record blocker owner and unblock condition. |
| closed | Work is complete and closeout evidence exists. | Archive only when no longer operationally useful. |
| archived | Entry is historical and no longer part of active coordination. | Keep a pointer to the archive location. |

## Active Ledger

| ID | Task or Change | Owner | Status | Plan | Feature or Delivery SSoT | Regression Evidence | Review Evidence | Walkthrough | Lessons Check | Residual | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HL-YYYY-MM-DD-001 | Short operational title | owner | planned | docs/09-PLANNING/TASKS/.../task_plan.md | F-000 or D-000 | RG-000 or n/a | review.md or n/a | pending | pending | none | YYYY-MM-DD |

## Routing Rules

1. Create or update one ledger row for every non-trivial feature, refactor, release, harness update, or multi-agent handoff.
2. Link to durable files and commands. Do not rely on chat history as evidence.
3. If a task changes product behavior, route it through Feature SSoT or Delivery SSoT.
4. If a task changes regression expectations, route it through Regression SSoT and Cadence Ledger.
5. If a task changes agent process, documentation standards, or repeatable checks, route it through Lessons SSoT.
6. A row can move to `closed` only when the walkthrough, regression evidence, review disposition, and lessons check are recorded.

## Archive Rules

- Keep active, blocked, review, and recently closed rows in this file.
- Move old closed rows to `docs/01-GOVERNANCE/archive/` or the project archive path when they no longer affect current coordination.
- Preserve the ledger ID, final status, closeout link, and archive date in any archive entry.
- Never delete a row to hide skipped verification, `accepted-risk`, or unresolved review feedback.
