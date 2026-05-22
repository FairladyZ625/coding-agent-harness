# {{TASK_TITLE}} - Lesson Candidates

This file is the task-local lesson candidate queue. It is not the Lessons SSoT. Human review decides whether any candidate should move into governance promotion.

## Candidate Status

| Field | Value |
| --- | --- |
| Schema version | lesson-candidate-v1 |
| Task-level status | pending-review |
| Review gate | candidate-file-present |
| Review decision | pending-human-review |
| Promotion state | not-promoted |
| Closeout token | pending |
| Source task | {{TASK_ID}} |
| Owner | coordinator |
| Last updated | {{DATE}} |

## Schema

Allowed task-level status:

- `missing`: candidate file is absent.
- `pending-review`: candidate file exists, but human decision is not complete.
- `no-candidate-accepted`: human accepted the agent's no-candidate reason.
- `needs-promotion`: at least one candidate is queued for governance promotion.
- `promoted`: all accepted candidates were promoted to Lessons SSoT.
- `rejected`: all candidates were rejected or archived with reasons.

Allowed row status:

- `ready-for-review`: agent believes this candidate may matter.
- `needs-promotion`: human marked the candidate worth preserving.
- `promoted`: maintenance CLI promoted the candidate to Lessons SSoT.
- `rejected`: human rejected the candidate with a reason.

Aggregation rule:

- Any `ready-for-review` row keeps task-level status `pending-review`.
- Any `needs-promotion` row sets task-level status `needs-promotion` unless another row is still `ready-for-review`.
- All rows `promoted` sets task-level status `promoted`.
- All rows `rejected` sets task-level status `rejected`.
- A no-candidate task must use task-level status `no-candidate-accepted` and fill `No-Candidate Reason`.

## Candidates

| ID | Row Status | Title | Why It Might Matter | Review Decision | Promotion Target |
| --- | --- | --- | --- | --- | --- |

## No-Candidate Reason

Not decided yet. Fill this only when review accepts that the task produced no reusable lesson candidate.

## Promotion Notes

- If human review decides a candidate is worth preserving, mark the row `needs-promotion` and record the target governance location.
- If human review rejects a candidate, mark the row `rejected` and keep the reason in the review decision.
- `needs-promotion` does not block task closeout, but it must remain visible in the maintenance queue and closeout record.
