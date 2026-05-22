# [Task Name]

Task Contract: harness-task/v1

## Goal

[State the outcome this task must deliver in one sentence.]

## Scope

- In scope: [specific files, modules, behavior, or docs]
- Out of scope: [explicit exclusions]

## Task Budget

| Budget | Use When | Required Structure |
| --- | --- | --- |
| simple | One owner, no subagent, L0/L1 evidence, no formal review gate | `brief.md`, `task_plan.md`, `visual_map.md`, `progress.md` |
| standard | Normal feature, fix, or documentation change | Plan, strategy, roadmap, progress, findings, and review as needed |
| complex | Multi-hour work, L2/L3 evidence, subagent/reviewer, or optional artifact/reference indexes | Standard files plus optional structures as needed |

Selected budget: {{TASK_BUDGET}}

## Context Packet

| ID | Type | Path | Why It Matters | Used By |
| --- | --- | --- | --- | --- |
| C-001 | public-doc / private-plan / external / code | PUBLIC:path or PRIVATE:path or TARGET:path or URL:https://example.com | [why this source matters] | coordinator / reviewer / worker |

## Required Files

| Contract File | Required | Purpose |
| --- | --- | --- |
| `execution_strategy.md` | yes | Operating model, allocation, conflict control, and evidence strategy |
| `visual_map.md` | yes | Diagram collection: phase map, optional architecture/sequence/data-flow/state diagrams, completion state, evidence state, and blocking risk |
| `progress.md` | yes | Execution log, decisions, and handoff |
| `findings.md` | yes | Findings, research notes, and unresolved risks |
| `lesson_candidates.md` | yes for standard/complex | Task-local lesson candidate queue. Human review must accept no-candidate, reject candidates, or queue promotion before review confirmation |
| `review.md` | if needed | Adversarial or specialist review report |
| `long-running-task-contract.md` | if needed | Continuous execution permission, loop rules, and stop conditions |

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

- Feature SSoT entry: [reference]
- Related Regression Gate: [reference]
- Review Report: [path / n/a]
- Harness Ledger entry: [complete at closeout]
- Prerequisite tasks: [reference or none]

## Coordinator Handoff

- Global sync owner: coordinator / n/a
- Global sync status: pending-coordinator-pass / synced / n/a
- Shared updates needed: [Module Registry / Harness Ledger / Closeout SSoT / Regression SSoT / none]
