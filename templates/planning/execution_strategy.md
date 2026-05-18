# Execution Strategy

## Decision Table

| Decision | Choice | Notes |
| --- | --- | --- |
| Primary executor | coordinator | The coordinator owns sequencing and final judgment. |
| Subagents | none / reviewer-only / worker-worktree | Choose the smallest mode that fits the task. |
| Review model | self-check / predefined verifier / adversarial review | Record why this level is enough. |
| Worktree strategy | same checkout / dedicated worktree | Code-writing subagents require dedicated worktree + commit handoff. |
| Conflict control | coordinator owns shared files | Subagents may not edit coordinator-owned global tables. |
| Evidence depth | L0 / L1 / L2 / L3 | Match evidence to risk. |

## Subagent / Worker Contract

If subagents or workers are used, record the allowed input packet, write scope,
handoff format, and final integration owner here.

| Role | Input Packet | Write Scope | Handoff Required | Owner |
| --- | --- | --- | --- | --- |
| reviewer / worker / n/a | C-001 | read-only / path list / n/a | report / commit SHA / n/a | coordinator |

## Stop / Escalation Conditions

- Required work crosses the approved write scope.
- Shared tables need updates and no coordinator lock exists.
- Verification depth needs to increase beyond the planned level.
- Reviewer finds a P0/P1/P2 issue that changes scope.
