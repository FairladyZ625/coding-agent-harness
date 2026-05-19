# Adversarial Review Standard

## Purpose

Define how plans, code changes, evidence, and closeout claims are challenged before work is accepted.

## Rules

1. Use adversarial review for high-risk changes, cross-cutting architecture, data migration, security-sensitive work, release blockers, and long-running tasks.
2. Reviewers must act from an explicit `Reviewer Identity`, such as product risk reviewer, architecture reviewer, security reviewer, testing reviewer, or operator reviewer.
3. Every review must include a `Confidence Challenge`: what assumption could be wrong, what evidence would disprove the claim, and what failure mode remains plausible.
4. Findings must be classified as material or non-material. Material findings block closeout until closed with evidence, mitigated, classified as accepted-risk with owner rationale, or routed to a scoped follow-up.
5. A reviewer may not accept a claim based only on implementation narration. The review must cite `Evidence Checked`.
6. The owner must respond to each material finding with fix evidence, explicit rejection rationale, or a scoped follow-up.
7. Closeout must include `Final Confidence Basis`, not just "review passed".

## Required Artifacts

- Review record with `Reviewer Identity`, review scope, and date.
- `Confidence Challenge` section.
- Findings table with severity, materiality, file or artifact reference, owner response, and status.
- `Evidence Checked` list containing commands, test runs, screenshots, logs, PR links, or document paths.
- Residual risk section for anything intentionally left open.
- Final reviewer disposition: closed, closed-with-residual, or blocked.

## Closeout Expectations

Adversarial review is complete only when material findings are resolved or explicitly carried as residuals, the checked evidence is reproducible, and the closeout record explains why the final confidence is adequate for the delivery risk.
