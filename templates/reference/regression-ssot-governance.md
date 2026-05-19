# Regression SSoT Governance

## Purpose

Define how regression knowledge is added, maintained, retired, and used as release evidence.

## Rules

1. The Regression SSoT is the source of truth for critical surfaces, required checks, cadence, owners, and known gaps.
2. Add or update regression entries when a bug escapes, a user-facing workflow changes, a contract changes, or a new critical surface appears.
3. Each regression entry must name the risk it protects, the check that covers it, the cadence, and the evidence expected from a passing run.
4. Retire regression entries only when the protected behavior is removed or replaced by stronger coverage.
5. Do not mark a surface covered when the check only exercises a mock path that cannot catch the real failure.
6. Flaky, skipped, or manual-only coverage must be visible as residual risk.
7. Release closeout must use the current Regression SSoT rather than an ad hoc checklist.

## Required Checklist

- Critical surfaces are listed with owners.
- Required checks are mapped to surfaces and risk.
- Cadence is defined for local, PR, release, and post-deploy verification where relevant.
- Manual checks include exact steps and evidence format.
- Known gaps, flaky checks, and disabled checks are recorded as residuals.
- Changes to regression policy are reflected in the Harness Ledger when durable.

## Closeout Expectations

Regression closeout must cite the SSoT entries used, show fresh evidence for required checks, explain skipped checks, and record any new or changed residual risk.
