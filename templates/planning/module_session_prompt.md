# Module Session Prompt

Use this template when starting a long-running session for one module in a module-parallel project. Fill it with project facts before handing it to a new agent session.

```text
You are working in <repo-path> on the <module-key> module.

Subagent Worker Invariant:
- If this prompt is handed to a code-changing worker subagent, the coordinator must assign a dedicated worktree and branch before edits begin.
- The worker must only edit inside <worktree-path>, commit its own changes, and hand off worktree path, branch, commit SHA, checks, and residual risks.
- Reviewer subagents are read-only unless explicitly upgraded to worker with the same worktree contract.
- The coordinator integrates worker commits and runs final gates; do not mix multiple workers' uncommitted edits in one checkout.

Goal:
- Execute the Current Step listed for <module-key> in docs/09-PLANNING/Module-Registry.md and docs/09-PLANNING/MODULES/<module-key>/module_plan.md.
- Continue until the step is implemented, verified, documented, and ready for review, unless a stop condition below is hit.

Cold start:
1. Read AGENTS.md.
2. Read docs/09-PLANNING/Module-Registry.md.
3. Read docs/09-PLANNING/MODULES/Session-Prompt-Pack.md or docs/09-PLANNING/MODULES/<module-key>/session_prompt.md.
4. Read docs/09-PLANNING/MODULES/<module-key>/module_plan.md.
5. Follow the project's task-type reading matrix for the files touched by the task.

Start gate:
- Confirm the registry row for <module-key> still matches this prompt: branch, current step, status, and write scope.
- Confirm the current checkout/worktree path is <worktree-path> and the current branch is <branch-name>.
- Inspect dirty state before editing and do not revert unrelated changes.
- If another active session owns this module or a required shared file, stop and record the conflict.
- Before code edits, create or update docs/09-PLANNING/MODULES/<module-key>/TASKS/<current-step>-<short-name>/task_plan.md from the project planning template. Record scope, acceptance criteria, verification, branch/worktree, and shared coordination.

Branch and worktree:
- Worktree path: <worktree-path>.
- Branch: <branch-name>.
- Base branch: <base-branch>.
- Remote: <remote-name>.
- Work only in the module worktree for <module-key>. If it is missing, create it according to the project worktree standard.

Write scope:
- Allowed: <module-write-scope>.
- Forbidden without explicit coordination: <shared-or-forbidden-scope>.
- Shared coordination artifact: either docs/09-PLANNING/MODULES/_shared/TASKS/<id>/task_plan.md or a "Shared Coordination" section in the module task plan naming owner, touched files, allowed change, reviewer, and merge order.
- If the implementation requires files outside the allowed scope, stop and record the needed coordination instead of editing those files.

Verification:
- Project harness check: <project-harness-check-command>.
- Run the module's targeted checks: <targeted-checks>.
- Run lint/build/smoke checks when code or UI behavior changes.
- Record exact commands and results in the module task progress or walkthrough.

Closeout:
- Update the module plan and module task progress.
- Update docs/09-PLANNING/Module-Registry.md only while holding the registry shared lock or in a coordinator pass.
- Update docs/09-PLANNING/MODULES/<module-key>/module_plan.md.
- Write review.md or record review skipped-with-reason.
- Write walkthrough with Lessons Reflection when the step is completed.
- Update Closeout SSoT and Lessons Check.
- Update Regression SSoT and Harness Ledger when behavior, tests, architecture, or process changed.
- Do not claim completion until verification passes or each residual is recorded with owner and reason.

Stop conditions:
- Required work crosses module write scope and no owner is selected.
- User/private data would need to be committed.
- A regression check fails and the root cause is outside this module.
- The task requires product scope changes not present in the module plan.
```
