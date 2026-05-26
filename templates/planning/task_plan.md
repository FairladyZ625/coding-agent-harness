# [Task Name]

Task Contract: harness-task/v1
Task Package Index: required

## Goal

[State the outcome this task must deliver in one sentence.]

## Scope

- In scope: [specific files, modules, behavior, or docs]
- Out of scope: [explicit exclusions]

## Selected Budget

Selected budget: {{TASK_BUDGET}}

Rationale: [why this budget fits this task]

## Context Packet

| ID | Type | Path | Why It Matters | Used By |
| --- | --- | --- | --- | --- |
| C-001 | public-doc / private-plan / external / code | PUBLIC:path or PRIVATE:path or TARGET:path or URL:https://example.com | [why this source matters] | coordinator / reviewer / worker |

## Steps

1. [First concrete step]
2. [Second concrete step]
3. [Third concrete step]

## Acceptance Criteria

- [ ] [Observable criterion]
- [ ] [Verification criterion]
- [ ] [Documentation or handoff criterion]

## Worktree

- Path: [worktree path or n/a]
- Branch: [branch or n/a]
- Worker owner: coordinator / subagent id / n/a
- Worker handoff commit required: yes / no / n/a
- If no worktree, reason: [reason]

## Long-Running Task Decision

- Long-running task: yes / no
- Contract file if yes: `long-running-task-contract.md`
- Continuous execution permission: granted / not granted / n/a
- Stop condition summary: [one sentence]

## Review Decision

- Adversarial review required: yes / no
- Report file if yes: `review.md`
- Reviewer: self / subagent / external / human / n/a
- No-finding requirement: [requirement or n/a]

## Links

- Related Regression Gate: [reference]
- Review Report: [path / n/a]
- Generated Ledger: rebuilt by lifecycle CLI / `harness governance rebuild`
- Prerequisite tasks: [reference or none]

## Coordinator Handoff

- Global sync owner: coordinator / n/a
- Global sync status: pending-coordinator-pass / synced / n/a
- Shared updates needed: [Module Registry / Harness Ledger / Closeout SSoT / Regression SSoT / none]
