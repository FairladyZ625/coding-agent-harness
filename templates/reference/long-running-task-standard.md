# Long-Running Task Standard

## Purpose

Define the contract required before an agent performs extended autonomous work across multiple steps, files, checks, or reviews.

## Rules

1. A long-running task requires an explicit contract before execution begins.
2. The contract must define goal, scope, allowed paths, forbidden paths, acceptance criteria, expected evidence, review cadence, pause conditions, and stop conditions.
3. The agent must keep progress in task artifacts, not only in chat messages.
4. Material scope changes require contract update or user confirmation before continuing.
5. The agent must preserve unrelated user or worker changes and must not revert files outside its scope.
6. Review checkpoints must challenge direction, evidence quality, and residual risk before final closeout.
7. Agent completion requires verification evidence and an agent-owned closeout record before Human Review, not just implementation completion. Human Review Confirmation and `task-complete` finalization are separate lifecycle gates.

## Required Artifacts

- Long-running task contract.
- Task plan with current state, active slice, and acceptance criteria.
- Progress log or checklist.
- Findings or review record with material findings.
- Evidence list with commands, test results, screenshots, logs, or affected paths.
- Residual risk and follow-up section.

## Closeout Expectations

Agent-owned closeout must confirm the contract scope was honored, list evidence checked, identify checks not run, resolve or record material findings, and state the final residual risk. If the task stopped early, closeout must explain the stop condition and next safe action.
