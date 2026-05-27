# CI/CD Standard

## 核心思路

每个 project harness 必须 define a project-specific CI/CD profile. Generic CI text is not enough.

CI/CD design must connect the project's real stack to required merge evidence:

- package manager
- lint / typecheck / build / test commands
- smoke or regression commands
- workflow trigger
- required status checks
- residuals when a command or environment is missing

## 存放位置

```text
coding-agent-harness/governance/standards/ci-cd-standard.md
```

Workflow files usually live under:

```text
.github/workflows/
```

For non-GitHub platforms, use the native workflow location and document it here.

## CI Profile

Required fields:

- Platform: [GitHub Actions / GitLab CI / local-only / other]
- Runtime: [Node / Python / Go / Rust / Java / mixed / other]
- Package manager: [npm / pnpm / yarn / uv / pip / cargo / go / other]
- Install command
- Lint command
- Typecheck command
- Test command
- Build command
- Smoke / regression command
- Cache strategy
- Required secrets
- Unsupported checks and residuals

## Workflow Requirements

At minimum, CI must define:

- `pull_request` trigger
- default branch push trigger, unless explicitly residualized
- install step
- at least one verification step matching the project stack
- artifact or log strategy for smoke / screenshots when relevant

CI must not be a generic placeholder. Commands must either exist in the project or be marked
`blocked-with-owner`.

## Required Checks

The required checks list must match actual job names in the workflow.

Example:

| Required check | Workflow job | Source |
|----------------|--------------|--------|
| lint | `ci / lint` | `.github/workflows/ci.yml` |
| build | `ci / build` | `.github/workflows/ci.yml` |

## CD / Release

If the project deploys or packages artifacts, document:

- release trigger
- environment
- approval requirement
- rollback path
- signing / notarization / credential boundary

If deployment is out of scope, write `n/a` with a reason. Do not leave deployment undecided.

## Completion Rule

CI/CD setup is complete only when one is true:

1. Workflow exists and required checks are documented.
2. Platform cannot support CI yet, and the blocker has owner/action/status.

Generic text without workflow or residual is incomplete.
