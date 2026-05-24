# Lessons SSoT

## Purpose

Track reusable lessons discovered during closeout and route them into standards, templates, checkers, or explicit no-action decisions.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| approved | Human review approved the task-local candidate for durable governance work. | Keep the detail doc linked and assign the target change. |
| promoted | The approved candidate was promoted into a durable governance target. | Link changed file, checker, template, or follow-up task. |
| merged | The durable change has landed. | Link changed file, checker, or template. |
| superseded | A newer lesson replaces this one. | Link replacement. |
| archived | Lesson is historical. | Keep detail doc and final disposition. |

## Active Lessons

| ID | Lesson | Source | Type | Owner | Status | Target Change | Detail Doc | Evidence | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L-YYYY-MM-DD-001 | Short lesson title | walkthrough, review, incident, or verifier | ref-change / new-doc / arch-process-change | owner | approved | file, checker, template, or follow-up task | docs/01-GOVERNANCE/lessons/...md | source link | YYYY-MM-DD |

## Type Routing

| Type | Use When | Required Artifact |
| --- | --- | --- |
| ref-change | Existing standard, template, or checker needs an update. | `templates/lessons/lesson-ref-change.md` detail doc. |
| new-doc | A missing durable reference document is needed. | `templates/lessons/lesson-new-doc.md` detail doc. |
| arch-process-change | Operating model, phase gate, ownership, or architecture process needs to change. | `templates/lessons/lesson-arch-process-change.md` detail doc. |

## Routing Rules

1. Walkthrough closeout must record whether a lessons check was performed.
2. Keep undecided candidates in the task-local `lesson_candidates.md`; do not create a Lessons SSoT row until human review approves promotion.
3. Do not create a lesson for one-off trivia; create one only when a future agent could repeat the failure or benefit from the rule.
4. Approved lessons must name the durable target: reference doc, template, checker, workflow, or operating model.
5. `merged` requires evidence of the durable change, not just agreement in chat.

## Archive Rules

- Keep approved and promoted lessons in this file until resolved.
- Archive merged or superseded lessons after the next closeout cycle.
- Preserve the detail doc and source walkthrough link for every archived lesson.
