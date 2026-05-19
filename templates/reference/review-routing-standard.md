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
