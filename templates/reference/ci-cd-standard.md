# CI/CD Standard

## Purpose

Define the continuous integration and deployment expectations that protect the repository from unverified changes and unsafe releases.

## Rules

1. Required checks must cover the project's real risk surface: build, lint, type checks, unit tests, integration tests, smoke tests, security scans, packaging, and deployment validation where applicable.
2. CI configuration is product code. Changes to workflows, secrets, permissions, runners, release scripts, or deployment targets require review and evidence.
3. A failing required check blocks merge unless the owner records an approved exception with scope, reason, expiry, and residual risk.
4. Secrets must be referenced through the repository's approved secret store. Do not commit credentials, tokens, private keys, or generated environment dumps.
5. Deployment jobs must identify the target environment, artifact version, rollback path, and post-deploy verification.
6. Flaky checks must be tracked as defects. Re-running CI is not a substitute for diagnosis when the same failure pattern repeats.
7. CI evidence used for closeout must be fresh enough for the submitted change set.

## Required Checklist

- Required checks are named and mapped to the risks they cover.
- Branch protection or merge policy is documented.
- Secrets, permissions, and deployment environments have owners.
- Release artifacts are traceable to commit SHA or version.
- Rollback or remediation path is known before production deployment.
- CI failure exceptions include owner, expiry, evidence, and residual.

## Closeout Expectations

Closeout must list the required checks that passed, any checks not run, the reason for each omission, and the residual risk. Deployment closeout must include post-deploy evidence from the target environment.
