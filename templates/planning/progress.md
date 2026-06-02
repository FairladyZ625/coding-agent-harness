# [Task Name] - Progress

## Current Status

planned

Status is a controlled machine field. Use exactly one of:

- `not_started`
- `planned`
- `in_progress`
- `review`
- `blocked`
- `done`

Do not put fine-grained coordination states such as `planning review`,
`awaiting coordinator pass`, or `ready for local review` in this field. Record
those details in the log, decisions, residual, or coordinator handoff sections.

## Log

| Time | Actor | Action | Evidence | Next |
| --- | --- | --- | --- | --- |
| YYYY-MM-DD HH:MM | coordinator | [action taken] | type:path:summary | [next step] |

## Decisions

| Date | Decision | Reason | Owner |
| --- | --- | --- | --- |
| YYYY-MM-DD | [decision] | [reason] | [owner] |

## Evidence Ledger

| Evidence ID | Type | Path or Command | Result | Used For |
| --- | --- | --- | --- | --- |
| E-001 | command / file / runtime / review | [path or command] | pass / fail / observed / waived | [claim supported] |

## Residual

none

## Coordinator Handoff

- Global sync status: pending-coordinator-pass / synced / n/a
- Owner: coordinator / n/a
- Required shared updates: [none]
