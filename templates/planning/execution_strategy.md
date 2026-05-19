# [Task Name] - Execution Strategy

## Strategy Summary

[Describe the execution approach, including why this operating model fits the risk and scope.]

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
