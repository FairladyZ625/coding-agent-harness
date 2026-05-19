# Execution Workflow Standard

## Purpose

Define the standard lifecycle for non-trivial work from intake through planning, implementation, verification, review, and closeout.

## Rules

1. Start by identifying goal, scope, constraints, allowed paths, forbidden paths, acceptance criteria, and expected evidence.
2. Create or update a task plan before implementation when the work spans multiple files, multiple agents, external systems, or user-facing behavior.
3. Record important discoveries in the task artifacts instead of relying on transient chat context.
4. Implement in small reviewable slices and keep the plan current when scope changes.
5. Run checks that match the risk surface before claiming completion.
6. Route material findings through review and do not bury unresolved issues in summaries.
7. Close the loop by updating walkthrough, SSoT, regression, ledger, or docs artifacts when the work changes durable project knowledge.

## Required Checklist

- Goal, scope, acceptance criteria, and constraints are written down.
- Current repo state and ownership boundaries were checked.
- Implementation notes identify changed surfaces.
- Required checks and evidence are captured.
- Review status and material findings are recorded.
- Residuals are explicit and assigned.
- Closeout artifacts are updated when required.

## Closeout Expectations

Closeout must provide a concise change summary, evidence checked, checks not run with reasons, review outcome, residual risk, and any durable docs or ledger updates made during the task.
