# Historical 12-Phase Bootstrap

This document preserves the legacy bootstrap sequence used before the v1.0 capability-based installer. It is reference material for migration only. Agents should not use this as the default install protocol for new projects.

## When To Read

- You are migrating a project that was created with the older 12-phase harness flow.
- You need to map older documents into v1.0 capabilities and task contracts.
- You need to understand why a legacy project has broad reference files, embedded roadmap sections, or single-line phase planning.

## Legacy Sequence

1. Project diagnosis: read `references/project-onboarding-audit.md` and produce a project diagnosis.
2. Solution confirmation: decide harness scale from the diagnosis.
3. Delivery operating model: classify solo, team, split-repo, program, stage-gate, or kanban delivery.
4. Optional module registration: identify independent modules, write scopes, module registry rows, and module plans.
5. Directory structure: create or adapt `docs/` according to the docs directory standard.
6. AGENTS.md and CLAUDE.md: generate the root agent entrypoint and Claude Code shim.
7. Reference standards: generate project-specific reference files under `docs/11-REFERENCE/`.
8. Repository governance and CI/CD: define PR policy, required checks, branch protection, CI, and worktree concurrency.
9. Planning loop: create task templates and task directories.
10. Long-running task protocol: add long-running task standard and contract template.
11. SSoT, lessons, harness ledger, regression, cadence, walkthrough, and closeout files.
12. Bootstrap summary: report created files, purpose, first tasks, next actions, and checker status.

## v1.0 Mapping

| Legacy Area | v1.0 Destination |
| --- | --- |
| AGENTS.md / CLAUDE.md | Preserve existing files; merge only missing routing and residuals. |
| Task directory with only `task_plan.md` | Add `brief.md`, `execution_strategy.md`, `visual_roadmap.md`, `progress.md`, `findings.md`, and `review.md` only for active tasks. |
| Embedded roadmap in `task_plan.md` | Move active roadmap rows into standalone `visual_roadmap.md`; leave historical tasks untouched unless they are reopened. |
| Single-line progress status | Normalize active tasks through `harness task-start`, `task-block`, `task-log`, and `task-complete`. |
| Broad reference bundle | Declare only capabilities that are actually adopted in `.harness-capabilities.json`. |
| Long-running task artifacts | Add or declare `long-running-task` only when active work needs continuous autonomous execution. |
| Informal module lists | Adopt `module-parallel` only after modules have owners, write scopes, dependency rules, and registry maintenance. |
| Historical review notes | Do not rewrite all old review files. Upgrade active release-blocking reviews to the v1 review schema first. |

## Migration Rule

Do not mechanically rewrite the whole project. Use `harness add-capability safe-adoption` to add the v1.0 compatibility layer, then use `harness migrate-plan --json` to produce a staged action list. Migrate active or reopened work first; leave closed historical tasks as legacy evidence unless strict gates require them.
