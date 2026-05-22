# [Task Name] - Long-Running Task Contract

## Goal

[State the single main problem this loop must close.]

## Scope

### In Scope

- [Allowed directories, modules, or capability surfaces]

### Out of Scope

- [Items explicitly excluded from this loop]

### Shared Files and Conflict Risk

- [Shared files that may conflict with other work, or none]

## Primary Caller / Entry

- Primary caller: [CLI / local agent / UI / API / automation / integration / other]
- Entries this task must support: [list]
- Entries explicitly not required: [list]

## Permission Boundaries

- Continuous execution allowed: yes / no
- Automatic review/fix/test loop allowed: yes / no
- Reviewer or subagent allowed: yes / no
- Must pause before: [high-risk actions]

## Required Loop

1. Re-read the goal, scope, and current findings.
2. Choose the smallest complete fix for the current finding or phase.
3. Implement within the allowed write scope.
4. Run required verification.
5. Update `progress.md` and `findings.md`.
6. Run review when required and update `review.md`.
7. Continue, stop, or pause based on the stop and pause conditions below.

## Reviewer / Subagent Contract

- Reviewer scope: [files / modules / problem domain]
- Reviewer output: `review.md`
- Worker allowed to edit code: yes / no
- If a worker may edit, handoff must include worktree path, branch, commit SHA, checks, files changed, and residual risks.

## Evidence

- [ ] Static checks: [command]
- [ ] Unit tests: [command]
- [ ] Integration or smoke tests: [command]
- [ ] Runtime verification: [URL / command / log]
- [ ] Review report: `review.md` / n/a
- [ ] Residual risks recorded: yes / no
- [ ] Lesson candidate review recorded: `lesson_candidates.md` uses `no-candidate-accepted`, `needs-promotion`, `promoted`, or `rejected`

## Stop Conditions

- [ ] Goal is met.
- [ ] Scope was not exceeded.
- [ ] Required tests and regression gates pass or have documented waivers.
- [ ] Runtime, console, and request errors are clear or classified as accepted-risk with owner rationale.
- [ ] Review has no open P0/P1 material findings.
- [ ] Residual risks are routed to an owner and do not block the goal.

## Pause Conditions

- [ ] Goal or scope becomes invalid.
- [ ] High-risk product, architecture, security, or data decision is required.
- [ ] Unknown uncommitted changes conflict with this work.
- [ ] Environment, permission, quota, or external dependency blocks progress.
- [ ] Reviewer finding changes task direction.
