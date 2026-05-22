# Harness Ledger Standard

## Purpose

Define when and how the Harness Ledger records durable changes to the agent operating system for this project.

## Rules

1. Update the Harness Ledger when a task changes standards, routing, planning workflow, review workflow, regression gates, ownership boundaries, or reusable lessons.
2. The ledger is not a daily diary. It records durable operating context that future agents need in order to avoid repeating discovery work.
3. Each ledger entry must identify the task, date, changed harness surface, evidence, and follow-up owner if any.
4. Keep entries short and link to task plans, walkthroughs, pull requests, review records, or evidence files.
5. Do not store secrets, personal data, large logs, or raw generated output in the ledger.
6. If a lesson changes a reference standard, record both the lesson and the reference update.
7. If no ledger update is needed, closeout should say why.
8. New task closeout should route lesson review through `lesson_candidates.md`; record `checked-candidate:<LC-ID>`, `queued-promotion:<LC-ID>`, or `checked-created:<L-ID>` as the final lesson outcome.

## Required Artifacts

- Ledger entry for durable harness changes.
- Links to changed standards, SSoT files, walkthroughs, or PRs.
- Evidence reference for the change.
- Residual or follow-up owner when the harness change is partial.

## Closeout Expectations

Task closeout must state whether the Harness Ledger was updated. When updated, cite the entry. When not updated, explain that the task did not change durable harness behavior.
