# Execution Strategy

| Decision | Choice | Notes |
| --- | --- | --- |
| Primary executor | coordinator | Example task only. |
| Subagents | none | No parallel work needed. |
| Review model | self-check | Demonstrates the contract shape. |
| Worktree strategy | same checkout | Public example fixture. |
| Conflict control | coordinator owns shared files | No shared-file contention. |
| Evidence depth | L0 | Fixture-level evidence only. |
