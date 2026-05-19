# Feature SSoT

## Purpose

Maintain the authoritative feature queue for agent-executed work. This file answers what is planned, who owns it, what evidence is required, and whether the work is safe to close.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| intake | Candidate feature is captured but not shaped. | Clarify goal, owner, and acceptance evidence. |
| ready | Scope and acceptance criteria are clear. | Create or link the task plan. |
| active | Implementation or review is in progress. | Keep plan, evidence, and residuals current. |
| blocked | Feature cannot proceed. | Record blocker owner and unblock condition. |
| verify | Work is implemented and waiting for evidence. | Run required checks and update Regression SSoT. |
| shipped | Feature is delivered and walkthrough is complete. | Keep row until no longer operationally relevant. |
| archived | Feature is historical. | Keep archive pointer and final evidence link. |

## Active Features

| ID | Feature | User Outcome | Owner | Status | Priority | Task Plan | Acceptance Evidence | Regression Gate | Walkthrough | Residual | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-000 | Short feature title | Observable user or operator result | owner | ready | P1 | docs/09-PLANNING/TASKS/.../task_plan.md | command, test, screenshot, or review path | RG-000 | pending | none | YYYY-MM-DD |

## Intake Queue

| Candidate | Source | Decision Needed | Owner | Due |
| --- | --- | --- | --- | --- |
| Short request title | issue, roadmap, user request, or review | accept, split, defer, or reject | owner | YYYY-MM-DD |

## Routing Rules

1. Add a feature row before implementation starts unless the task is a documented emergency fix.
2. Use one row per deliverable outcome, not one row per commit.
3. Link the task plan before moving a feature to `active`.
4. Link regression evidence before moving a feature to `shipped`.
5. Record `accepted-risk` explicitly; `none` means no known residual risk after verification.

## Archive Rules

- Keep shipped rows visible through the next release or verification cycle.
- Move older shipped rows to the project archive with their final walkthrough and regression evidence.
- Do not archive blocked rows until the blocker is resolved, accepted, or explicitly abandoned.
