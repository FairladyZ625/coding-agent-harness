# Review Routing Standard

## Purpose

Define when work needs review, which reviewer identity is appropriate, and how review results are routed back into implementation and closeout.

## Rules

1. Route review based on risk, not habit. Architecture, security, data, release, UX, and test-risk changes need different reviewer identities.
2. Every routed review must name `Reviewer Identity`, review scope, expected evidence, and decision authority.
3. Use adversarial review when a normal pass/fail review would not sufficiently challenge assumptions.
4. Material findings must be routed to an owner and tracked until closed with evidence, mitigated, classified as accepted-risk, or moved to a follow-up with approval.
5. Reviewers must list `Evidence Checked`; unverified claims are questions, not conclusions.
6. The implementation owner is responsible for reconciling conflicting reviewer feedback.
7. Closeout must include the final review disposition and `Final Confidence Basis`.
8. At task start, read the current task `execution_strategy.md` Subagent Authorization and Subagent Delegation Decision sections, then report the state and delegation choice; users do not need to know or ask for subagents.
9. Reviewer subagents are allowed by default for read-only review within the current task.
10. If a worker subagent would materially help and is not authorized, proactively ask the user once in plain language for task/scope/worktree authorization; it is fine to say "worker subagent", but do not wait for the user to know or suggest subagents.
11. If independent slices are obvious but exact file paths are not, identify the file paths first and then immediately ask for independent-execution-helper authorization before implementation.
12. Worker subagents require one user authorization recorded in `execution_strategy.md`; reuse is limited to the same task, scope, and worktree/branch.

## Required Checklist

- Review trigger and reviewer identity are documented.
- Scope and files or artifacts under review are listed.
- Required evidence is available to the reviewer.
- Material findings are labeled and owner-routed.
- Non-material suggestions are separated from blockers.
- Residuals have rationale and owner.
- Final disposition is recorded.

## Closeout Expectations

Review routing is complete when all required reviewers have responded or an explicit residual explains the missing review, material findings are resolved or accepted, and final confidence is grounded in checked evidence.
