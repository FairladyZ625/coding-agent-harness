# {{TASK_TITLE}} - Task Package Index

Task Contract: harness-task/v1

## Task Identity

| Field | Value |
| --- | --- |
| Task ID | `{{TASK_ID}}` |
| Budget | `{{TASK_BUDGET}}` |
| Preset | `{{TASK_PRESET}}` |
| Module | `{{TASK_MODULE}}` |
| Long-running | `{{TASK_LONG_RUNNING}}` |
| Walkthrough Path | `walkthrough.md` |
| Created | {{DATE}} |

## Task Audit Metadata

| Field | Value |
| --- | --- |
| Created By | {{TASK_AUDIT_CREATED_BY}} |
| Created At | {{TASK_AUDIT_CREATED_AT}} |
| Command Shape | {{TASK_AUDIT_COMMAND_SHAPE}} |
| Budget | {{TASK_AUDIT_BUDGET}} |
| Template Source | {{TASK_AUDIT_TEMPLATE_SOURCE}} |
| Task Creator | {{TASK_AUDIT_TASK_CREATOR}} |
| Task Creator Source | {{TASK_AUDIT_TASK_CREATOR_SOURCE}} |
| Human Review Status | {{TASK_AUDIT_HUMAN_REVIEW_STATUS}} |
| Confirmation ID | {{TASK_AUDIT_CONFIRMATION_ID}} |
| Confirmed At | {{TASK_AUDIT_CONFIRMED_AT}} |
| Reviewer | {{TASK_AUDIT_REVIEWER}} |
| Reviewer Email | {{TASK_AUDIT_REVIEWER_EMAIL}} |
| Confirm Text | {{TASK_AUDIT_CONFIRM_TEXT}} |
| Evidence Checked | {{TASK_AUDIT_EVIDENCE_CHECKED}} |
| Review Commit SHA | {{TASK_AUDIT_REVIEW_COMMIT_SHA}} |
| Audit Source | {{TASK_AUDIT_AUDIT_SOURCE}} |
| Audit Status | {{TASK_AUDIT_AUDIT_STATUS}} |
| Exception Reason | {{TASK_AUDIT_EXCEPTION_REASON}} |
| Message | {{TASK_AUDIT_MESSAGE}} |
| Migration Status | {{TASK_AUDIT_MIGRATION_STATUS}} |
| Migrated From | {{TASK_AUDIT_MIGRATED_FROM}} |
| Legacy Extra Fields | {{TASK_AUDIT_LEGACY_EXTRA_FIELDS}} |
| Migration Notes | {{TASK_AUDIT_MIGRATION_NOTES}} |

## Core Contract Files

| File | Purpose |
| --- | --- |
| `brief.md` | Human-readable task summary and context entry. |
| `task_plan.md` | Current task goal, scope, selected budget, acceptance, and operating decisions. |
| `visual_map.md` | Phase map, evidence status, next lifecycle commands, and supporting diagrams. |
| `progress.md` | Execution log, verification evidence, decisions, and handoff notes. |
| `walkthrough.md` | Task-local closeout evidence and handoff record. |

## Standard Task Files

These files exist for standard and complex tasks.

| File | Purpose |
| --- | --- |
| `execution_strategy.md` | Execution mode, ownership, conflict control, and evidence strategy. |
| `findings.md` | Findings, research notes, accepted risks, and unresolved questions. |
| `lesson_candidates.md` | Task-local lesson candidate decisions before closeout. |
| `review.md` | Agent review submission, adversarial review, findings, evidence, and routing. |

## Optional Indexes

| Index | Purpose |
| --- | --- |
| `references/INDEX.md` | References and preset-provided required reads. |
| `artifacts/INDEX.md` | Generated outputs, evidence bundles, screenshots, reports, and command artifacts. |

## Preset Summary

This section is system-rendered. Presets may not add custom root-level files or arbitrary root `INDEX.md` content.

| Field | Value |
| --- | --- |
| Preset | `{{TASK_PRESET}}` |
| Preset Version | `{{TASK_PRESET_VERSION}}` |
| Evidence Bundle | `{{TASK_EVIDENCE_BUNDLE}}` |
| Resource Indexes | `references/INDEX.md`; `artifacts/INDEX.md` |

## Update Rules

- Update status and decisions in `progress.md`.
- Keep task-specific goals and acceptance in `task_plan.md`.
- Put large command output, screenshots, reports, and generated files in `artifacts/INDEX.md`.
- Put source material, external links, and preset required reads in `references/INDEX.md`.
