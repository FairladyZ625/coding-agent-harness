# Regression SSoT

## Purpose

Define the project regression gates and record their current evidence state. This file decides which checks are required before a feature, delivery, or release can close.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| draft | Gate is proposed but not enforced. | Define scope, command, owner, and pass criteria. |
| active | Gate is required for matching changes. | Run on cadence or when triggered. |
| failing | Latest required run failed. | Assign fix owner and block affected closeout. |
| waived | Gate is skipped for a specific reason. | Record approver, expiry, and compensating evidence. |
| retired | Gate is no longer valid. | Link replacement or retirement rationale. |
| archived | Gate is historical. | Preserve final state and replacement pointer. |

## Regression Gates

| ID | Gate | Applies To | Owner | Status | Command or Procedure | Evidence Depth | Pass Criteria | Latest Evidence | Blocks Closeout | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RG-000 | Gate title | feature, module, route, API, release | owner | active | command or manual procedure | E1/E2/E3 | objective pass condition | path, log, screenshot, or CI run | yes | YYYY-MM-DD |

## Evidence Depth

| Level | Meaning | Examples |
| --- | --- | --- |
| E0 | Declared only; not acceptable for closeout. | "Not run", unchecked assumption. |
| E1 | Static or local check. | Typecheck, lint, unit test, parser check. |
| E2 | Runtime behavior check. | Browser smoke, API probe, integration test, CLI dry run. |
| E3 | End-to-end or production-like check. | Full workflow, deployed environment, real data with redaction. |

## Waivers

| Gate | Scope | Reason | Approver | Compensating Evidence | Expires |
| --- | --- | --- | --- | --- | --- |
| RG-000 | feature, PR, or release | reason | owner | alternate command or review | YYYY-MM-DD |

## Routing Rules

1. Every active gate must have an owner, trigger scope, and pass criteria.
2. Any feature or delivery closeout must cite the gates it ran or the waiver that covers the gap.
3. Mark a gate `failing` when the latest required run fails, even if the failure is believed unrelated.
4. Waivers must be narrow, dated, and paired with compensating evidence.
5. Retire a gate only after its replacement or rationale is recorded.

## Archive Rules

- Keep active, failing, and waived gates in this file.
- Move retired gates to the archive after consumers have been updated.
- Preserve old gate IDs when archiving so historical walkthroughs remain traceable.
