# Closeout SSoT

## Purpose

Track whether planned work has completed the required closeout contract: implementation evidence, regression evidence, review disposition, walkthrough, residual routing, lessons check, and ledger update.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| open | Work is not ready for closeout. | Continue implementation or evidence collection. |
| evidence | Implementation is done but verification is incomplete. | Run required checks and attach evidence. |
| review | Evidence exists and review is pending. | Resolve findings or record `accepted-risk`. |
| closing | Final walkthrough and ledger updates are in progress. | Finish lessons check and routing. |
| closed | Closeout contract is complete. | Archive after the retention window. |
| blocked | Closeout cannot finish. | Record blocker owner and unblock condition. |
| archived | Closeout is historical. | Keep archive pointer. |

## Active Closeouts

| ID | Work Item | Owner | Status | Implementation Evidence | Regression Evidence | Review Disposition | Walkthrough | Lessons Check | Harness Ledger | Residual | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| CO-YYYY-MM-DD-001 | F-000 or D-000 title | owner | [open / closed / blocked] | path or pending | RG-000 or pending | pending | pending | pending | HL-000 | none | YYYY-MM-DD |

## Release-Blocking Residuals

| Residual | Source | Owner | Blocks Release? | Decision | Due |
| --- | --- | --- | --- | --- | --- |
| risk or unresolved finding | review, regression, or walkthrough | owner | yes / no | fix, accept, defer, or waive | YYYY-MM-DD |

## Routing Rules

1. Every shipped feature, delivery, release, and harness update needs a closeout row.
2. Move to `closed` only after walkthrough, regression evidence, review disposition, lessons check, and Harness Ledger link are complete.
3. `not run` verification is a residual, not a pass.
4. Release-blocking residuals must stay visible until fixed, accepted by an owner, or moved to a follow-up with a due date.
5. Closeout rows should link durable files rather than summarize chat decisions.

## Archive Rules

- Keep open, evidence, review, closing, and blocked rows in this file.
- Archive closed rows after the next release or maintenance cycle.
- Preserve final evidence, walkthrough, lessons check, residual decision, and archive date.
