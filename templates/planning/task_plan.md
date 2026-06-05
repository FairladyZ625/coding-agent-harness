# [Task Name]

Task Contract: harness-task/v1
Task Package Index: required

## Goal

[State the outcome this task must deliver in one sentence.]

## Scope

- In scope: [specific files, modules, behavior, or docs]
- Out of scope: [explicit exclusions]

## Goal Alignment Challenge

Before implementation, answer from the original user request, not from the easiest local slice. Do not start implementation while this table contains placeholders.

| Question | Answer / Evidence |
| --- | --- |
| What original user outcome must remain true? | [final state requested by the user; not the easiest local proxy] |
| Does this task directly make that outcome more true? | [yes/no; explain the causal link from this slice to the original outcome] |
| What easier substitute would be tempting? | [adapter wiring, parity evidence, gate profile, comparison mode, partial shrink, docs-only claim, or other proxy] |
| What must not be claimed when this task is done? | [completion/cutover/rewrite/retirement claims that this slice cannot honestly support] |
| If this is evidence-only, parity, comparison, or gate-profile work, why is it not counted as cutover or completion? | [reason or n/a] |
| If this is rewrite, retirement, or cutover work, what production/default path change or deletion evidence proves replacement? | [default path, package/export, consumer removal, old-path deletion, no-production-dependency evidence, or n/a] |

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
- Shared updates needed: [Module Registry / Harness Ledger / Closeout Index / Regression SSoT / none]
