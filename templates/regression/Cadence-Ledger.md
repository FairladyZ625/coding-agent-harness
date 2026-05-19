# Cadence Ledger

## Purpose

Map change scopes to required regression gates and recurring check cadence. This file turns Regression SSoT gates into an operating schedule.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| active | Cadence rule is enforced. | Run when triggered and record evidence. |
| paused | Rule is temporarily disabled. | Record approver, reason, and resume date. |
| failing | Latest scheduled run failed. | Assign fix owner and block affected closeout. |
| replaced | Rule has a newer owner or gate. | Link replacement. |
| archived | Rule is historical. | Preserve final evidence and replacement pointer. |

## Cadence Rules

| ID | Change Scope or Trigger | Required Gates | Minimum Evidence Depth | Frequency | Owner | Status | Latest Run | Next Run or Trigger | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| C-000 | paths, modules, labels, release, or schedule | RG-000, RG-001 | E2 | per PR / daily / release | owner | active | YYYY-MM-DD evidence path | next trigger | none |

## Run Log

| Run ID | Date | Trigger | Gates Run | Result | Evidence | Follow-up |
| --- | --- | --- | --- | --- | --- | --- |
| CR-YYYY-MM-DD-001 | YYYY-MM-DD | PR, release, schedule, or manual | RG-000 | pass / fail / waived | path, CI run, log, or screenshot | none |

## Routing Rules

1. Every active Regression SSoT gate that must run repeatedly should have a cadence rule.
2. Path-based triggers must be specific enough for agents to choose the right checks without guessing.
3. Failed cadence runs remain visible until a passing replacement run or documented waiver exists.
4. Waived runs must link the corresponding Regression SSoT waiver.
5. Release closeout must cite the latest run log entries for release-blocking gates.

## Archive Rules

- Keep the current release cycle and any failing runs in this file.
- Archive older passing runs after their release or milestone is closed.
- Preserve run ID, trigger, result, and evidence link in archived records.
