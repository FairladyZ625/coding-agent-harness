# Walkthrough Standard

## Purpose

Define the closeout walkthrough that converts implementation work into durable project memory and reviewable evidence.

## Rules

1. Write a walkthrough for non-trivial tasks, long-running tasks, releases, cross-cutting changes, or work that future agents will need to understand.
2. A walkthrough must explain what changed, why it changed, how it was verified, what review found, and what residual risk remains.
3. Do not paste large raw logs. Link to evidence files, commands, PRs, screenshots, or CI runs.
4. Material findings and their resolution must be visible.
5. Lessons that change future behavior must first be routed through `lesson_candidates.md`; accepted candidates are then routed to the appropriate SSoT, reference standard, or Harness Ledger.
6. Walkthroughs must be written from the final integrated state, not from a single worker's partial view.
7. If work is incomplete, the walkthrough must identify the next safe action and stop reason.

## Required Artifacts

- Walkthrough record with date, owner, task, changed surfaces, and links.
- Evidence summary with checks run and checks not run.
- Review summary with material findings and disposition.
- Residual risk section.
- Lesson or follow-up section.
- Lesson candidate decision: `checked-candidate:<LC-ID>`, `queued-promotion:<LC-ID>`, `checked-created:<L-ID>`, or legacy `checked-none:<reason>`.
- Links to updated SSoT, Regression SSoT, or Harness Ledger entries when applicable.

## Closeout Expectations

Walkthrough closeout is complete when a future agent can understand the delivery state, reproduce the important evidence trail, and know which residuals or lessons still matter.
