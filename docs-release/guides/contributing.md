# Contributor Guide

This guide is for external contributors working on the public Coding Agent Harness repository.

## Working Model

Coding Agent Harness is more than documentation. The public repository includes:

- CLI implementation under `scripts/`
- tests under `tests/`
- installable templates under `templates/` and `templates-zh-CN/`
- bundled presets under `presets/`
- public documentation under `docs-release/`
- examples under `examples/`
- an optional GUI submodule under `harness-gui/`

Keep pull requests focused on one change family when possible. Documentation, CLI behavior, target-project templates, presets, and GUI work have different verification paths.

## Local Setup

Use Node.js 24 or newer. CI should run on the minimum supported LTS line.

```bash
npm install
```

If your change touches the GUI submodule:

```bash
cd harness-gui
npm ci
```

## Required Checks

Run the checks that match your change. For larger PRs or when you are unsure, run
the full root suite.

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

If a check cannot be run locally, say why in the PR.

## PR Requirements

Use the repository PR template and fill in:

- summary
- what changed
- version impact
- verification evidence
- review evidence
- residual risk
- related issue, task, or design reference when available

For docs-only or CI-only changes, "no version change" is usually correct. Runtime, template, preset, or package-surface changes may need a version decision from a maintainer.

## GUI Submodule Changes

`harness-gui/` is a Git submodule. GUI changes should be committed in the GUI repository first, then the parent repository should update the submodule pointer. A parent PR that updates the pointer should link to the GUI PR and include the GUI verification output.

## CI

GitHub Actions runs the same broad gates contributors should run locally:

- root package tests
- source/package boundary check
- minimal target project check
- dashboard generation and smoke test
- npm package dry run
- GUI submodule typecheck, tests, and build

Repository owners manage branch protection and required checks in GitHub. Contributors only need to keep their PRs focused, documented, and verified.
