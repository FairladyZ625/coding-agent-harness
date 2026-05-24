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
| standard | Normal feature, fix, or documentation change | `brief.md`, `task_plan.md`, `execution_strategy.md`, `visual_map.md`, `findings.md`, `lesson_candidates.md`, `progress.md`, `review.md` |
| complex | Multi-hour work, L2/L3 evidence, subagent/reviewer, or optional artifact/reference indexes | Standard files plus `references/INDEX.md` and `artifacts/INDEX.md` |

Selected budget: {{TASK_BUDGET}}

## Context Packet

| ID | Type | Path | Why It Matters | Used By |
| --- | --- | --- | --- | --- |
| C-001 | public-doc / private-plan / external / code | PUBLIC:path or PRIVATE:path or TARGET:path or URL:https://example.com | [why this source matters] | coordinator / reviewer / worker |

## Required Files

Do not hand-copy this template to create task directories. Use `harness new-task`
so the selected budget creates the correct file set and `harness check` can
enforce it.

| Budget | Required Files |
| --- | --- |
| simple | `brief.md`, `task_plan.md`, `visual_map.md`, `progress.md` |
| standard | simple files plus `execution_strategy.md`, `findings.md`, `lesson_candidates.md`, `review.md` |
| complex | standard files plus `references/INDEX.md`, `artifacts/INDEX.md` |
| long-running add-on | `long-running-task-contract.md` when `--long-running` is selected |

Optional subdirectories are created only when triggered:

- `lessons/LC-*.md`: task-local detail artifacts for lesson candidates marked `needs-promotion`.
- `references/INDEX.md`: complex-task source package and reference index.
- `artifacts/INDEX.md`: complex-task generated evidence and artifact index.

File purposes:

| Contract File | Purpose |
| --- | --- |
| `brief.md` | Human-readable task summary and current context packet |
| `task_plan.md` | Goal, scope, budget, acceptance, and operating decisions |
| `execution_strategy.md` | Operating model, allocation, conflict control, and evidence strategy |
| `visual_map.md` | Diagram collection: phase map, optional architecture/sequence/data-flow/state diagrams, completion state, evidence state, and blocking risk |
| `progress.md` | Execution log, decisions, and handoff |
| `findings.md` | Findings, research notes, and unresolved risks |
| `lesson_candidates.md` | Task-local lesson candidate queue. Human review must accept no-candidate, reject candidates, or queue promotion before review confirmation |
| `lessons/LC-*.md` | Optional task-local lesson detail artifacts written while source context is fresh and linked from `Detail Artifact` |
| `review.md` | Agent review submission, adversarial review, or specialist review report |
| `references/INDEX.md` | Complex-task source package and reference index |
| `artifacts/INDEX.md` | Complex-task generated evidence and artifact index |
| `long-running-task-contract.md` | Continuous execution permission, loop rules, and stop conditions |

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
