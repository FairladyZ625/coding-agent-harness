## Legacy Migration Preset Strategy

This preset keeps migration inside the Complex Task contract.

| Area | Rule |
| --- | --- |
| Write boundary | Do not rewrite historical task bodies unless the user explicitly confirms that phase. |
| Evidence source | Use `{{evidenceBundle}}/` as the handoff bundle. Absolute session paths are origin data only. |
| Target level | `{{migrationTargetLevel}}` |
| Achieved level | `{{migrationAchievedLevel}}` |

## Subagent Lane Table

Declare lanes before dispatching workers.

| Lane ID | Allowed globs | Forbidden globs | Shared file owner | Worktree / branch | Handoff path | Merge order | Verification command |
| --- | --- | --- | --- | --- | --- | --- | --- |
| coordinator | docs/09-PLANNING/TASKS/** | AGENTS.md, CLAUDE.md, docs/Harness-Ledger.md until closeout | coordinator | current | progress.md | 1 | harness check --profile target-project . |
