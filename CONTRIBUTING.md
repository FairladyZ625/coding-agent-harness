# Contributing

Thanks for helping improve Coding Agent Harness. This repository contains the public CLI, templates, presets, Skills, examples, documentation, and the optional GUI submodule.

## Before You Start

- Use Node.js 18 or newer. CI currently runs on Node.js 20.
- Install root dependencies with `npm install` from the repository root.
- If you change `harness-gui`, also run `npm ci` inside `harness-gui/`.
- Keep pull requests focused. Separate documentation, CLI/runtime, template, preset, and GUI work when the changes are independent.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `scripts/` | Public CLI and implementation modules. |
| `tests/` | Root package tests and dashboard smoke tests. |
| `templates/`, `templates-zh-CN/` | Harness templates installed into target projects. |
| `presets/` | Bundled Harness preset packages. |
| `skills/`, `SKILL.md` | Agent Skill entrypoints and nested Skills. |
| `docs-release/` | Public documentation for users and maintainers. |
| `examples/` | Minimal target projects and fixtures used by tests. |
| `harness-gui/` | Optional GUI submodule with its own package and checks. |

Do not commit local generated dashboards, temporary output directories, credentials, editor files, or machine-specific environment files.

## Branches And Commits

- Create a branch from the latest `main`.
- Use a descriptive branch name such as `codex/fix-task-state-docs` or `feat/preset-validation`.
- Keep commit messages short and concrete.
- Do not include unrelated formatting churn or generated artifacts in the same PR.

## What To Run

Run the checks that match your change. For a small docs-only PR, start with the
docs row. For larger PRs or when you are unsure, run the full root suite.

| Change type | Minimum local checks |
| --- | --- |
| Docs only | `git diff --check` |
| CLI/runtime | `npm test`, `npm run check`, `git diff --check` |
| Templates or examples | `npm test`, `node dist/harness.mjs check --profile target-project examples/minimal-project`, `git diff --check` |
| Dashboard | `npm test`, `npm run smoke:dashboard`, `git diff --check` |
| Package surface | `npm test`, `npm run pack:dry-run`, `git diff --check` |
| GUI submodule | `cd harness-gui && npm ci && npm run typecheck && npm test && npm run build` |

Full root suite:

```bash
npm install
npm test
npm run smoke:dashboard
npm run check
node dist/harness.mjs check --profile target-project examples/minimal-project
npm run pack:dry-run
git diff --check
```

GUI submodule setup and checks:

```bash
cd harness-gui
npm ci
npm run typecheck
npm test
npm run build
```

If a check is not relevant or cannot run in your environment, explain that in the PR template.

## Change-Specific Guidance

- CLI/runtime changes usually need root tests in `tests/` and source-package validation.
- Template changes should prove that a target project still passes `check --profile target-project`.
- Dashboard changes should run `npm run smoke:dashboard`.
- Preset changes should include preset validation and at least one task creation path when behavior changes.
- Documentation-only changes should still run `git diff --check` and any targeted link or spelling checks you use.
- GUI changes must be made in the `harness-gui` submodule and validated with the GUI commands above.

## Pull Requests

Every PR should include:

- What changed and why.
- The user or maintainer impact.
- Whether the package version changes. Use "no version change" for docs, CI-only, and internal maintenance unless release behavior changes.
- Verification commands and outcomes.
- Any checks not run, with a reason.
- Known residual risk.

Use draft PRs for work that still needs design review, incomplete checks, or follow-up fixes. Mark the PR ready only after the relevant checks pass and review feedback is addressed.

## CI Expectations

GitHub Actions validates the root package, source/package boundary, minimal target project, dashboard smoke path, npm package dry run, and GUI submodule typecheck/test/build path. A local run should match the CI commands closely enough that failures are reproducible.

Repository owners may configure branch protection and required checks separately in GitHub. Contributors do not need to manage those settings.
