# Lessons SSoT

## Purpose

Track reusable lessons discovered during closeout and route them into standards, templates, checkers, or explicit no-action decisions.

## Status Legend

| Status | Meaning | Required Next Step |
| --- | --- | --- |
| candidate | Lesson was proposed during review or walkthrough. | Decide whether it is reusable. |
| accepted | Lesson is valid and needs a durable change. | Assign implementation target and owner. |
| applied | Durable change has landed. | Link changed file, checker, or template. |
| rejected | Lesson is not reusable or not worth adopting. | Record reason. |
| superseded | A newer lesson replaces this one. | Link replacement. |
| archived | Lesson is historical. | Keep detail doc and final disposition. |

## Active Lessons

| ID | Lesson | Source | Type | Owner | Status | Target Change | Detail Doc | Evidence | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L-YYYY-MM-DD-001 | Short lesson title | walkthrough, review, incident, or verifier | ref-change / new-doc / arch-process-change | owner | candidate | file, checker, template, or no-action | docs/01-GOVERNANCE/lessons/...md | source link | YYYY-MM-DD |

## Type Routing

| Type | Use When | Required Artifact |
| --- | --- | --- |
| ref-change | Existing standard, template, or checker needs an update. | `templates/lessons/lesson-ref-change.md` detail doc. |
| new-doc | A missing durable reference document is needed. | `templates/lessons/lesson-new-doc.md` detail doc. |
| arch-process-change | Operating model, phase gate, ownership, or architecture process needs to change. | `templates/lessons/lesson-arch-process-change.md` detail doc. |

## Routing Rules

1. Walkthrough closeout must record whether a lessons check was performed.
2. Do not create a lesson for one-off trivia; create one only when a future agent could repeat the failure or benefit from the rule.
3. Accepted lessons must name the durable target: reference doc, template, checker, workflow, or operating model.
4. `applied` requires evidence of the durable change, not just agreement in chat.
5. Rejected lessons must explain why no durable change is needed.

## Archive Rules

- Keep candidate and accepted lessons in this file until resolved.
- Archive applied, rejected, or superseded lessons after the next closeout cycle.
- Preserve the detail doc and source walkthrough link for every archived lesson.
