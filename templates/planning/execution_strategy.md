# [Task Name] - Execution Strategy

## Strategy Summary

[Describe the execution approach, including why this operating model fits the risk and scope.]

## Subagent Authorization

Read this section at the start of the task and report the current authorization state before delegating.
This is an audit record, not an execution sandbox.

| Role | Status | Permission | Authorized By | Authorized At | Scope | Worktree / Branch | Reuse |
| --- | --- | --- | --- | --- | --- | --- | --- |
| reviewer subagent | allowed by default | read-only | harness task policy | task creation | current task review | n/a | allowed within this task |
| worker subagent | not authorized | write only after user approval | pending | pending | pending | pending | allowed only within approved task/scope |

## Subagent Delegation Decision

At task start, the coordinator must make this decision from the user's goal, even if the user never mentions subagents.
Do not expect the user to know what a subagent or worker is. If delegation would help, explain the benefit in plain language and ask for permission once.
It is fine to say "subagent" or "worker" to the user; the important rule is that the agent must not wait for the user to ask for them.
If the task is clearly split into independent slices, decide `ask-user` before implementation. If exact file paths are still unknown, first identify the paths, then immediately ask for the independent execution helper authorization.

| Question | Decision | Reason | Next Action |
| --- | --- | --- | --- |
| Should a reviewer subagent be used? | yes / no | [why reviewer review helps or is unnecessary] | If yes, call a read-only reviewer without asking for extra permission. |
| Would a worker subagent materially help? | no / ask-user / already-authorized | [parallel slice, independent implementation, focused investigation, or not useful] | If ask-user, ask directly: "This task is suitable for a worker subagent. Do you authorize me to assign one worker subagent to modify only [scope] in [worktree/branch] while I coordinate and review the result?" |

## User Authorization Decision

If the worker decision above is `ask-user`, implementation is blocked until this table records the user's answer.
Allowed resolved states are `authorized`, `denied`, or `not-needed`. Do not leave this as `pending` after choosing `ask-user`.

| Gate | State | Decided By | Decided At | Scope | Worktree / Branch | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| worker subagent | pending | pending | pending | pending | pending | Fill only after directly asking the user. |

## Operating Model

- Model: solo / team / split-repo / program / waterfall / kanban / module-parallel
- Primary executor: coordinator / worker / human
- Shared sync owner: coordinator
- Worktree required: yes / no
- Review required: yes / no

## Work Allocation

| Role | Input Package | Write Scope | Handoff Required | Owner |
| --- | --- | --- | --- | --- |
| coordinator | task plan, strategy, roadmap | shared ledgers and integration | yes | [owner] |
| worker | assigned slice | assigned files only | yes | [owner] |

## Coordination Rules

1. Shared files are coordinator-owned unless a lock is explicitly assigned.
2. Workers update only assigned files and route shared-table changes through handoff.
3. Parallel work must use non-overlapping write scopes.
4. Integration runs final checks after worker commits are merged or applied.

## Verification Strategy

| Check | Command or Evidence | Required | Owner |
| --- | --- | --- | --- |
| Static check | [command or path] | yes / no | [owner] |
| Unit test | [command or path] | yes / no | [owner] |
| Integration or smoke | [command, URL, or log] | yes / no | [owner] |
| Review | `review.md` / verifier output / n/a | yes / no | [owner] |

## Closeout Rule

Do not mark the task complete until required evidence is present, material findings are closed or accepted, and shared updates are either completed or assigned to the coordinator.
