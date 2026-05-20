# Agent Installation Guide

Chinese source: `docs-release/guides/agent-installation.md`

This guide is written for coding agents that install or upgrade Harness inside a target project. The README keeps only the human-facing positioning, quick start, and minimum commands. Operational details live here and in `SKILL.md`.

## Operating Contract

The main operator for this CLI is usually an agent inside the target project, not the end user. The agent should not ask the user to study command flags, template folders, or capability choices. Those decisions must happen during Diagnose / Decide and be explained in the delivery summary.

Commands in this guide are written with an installed `harness` command. If the target environment does not have `harness`, run the same CLI with `npx --yes coding-agent-harness <command>`. Maintainers debugging from the source checkout can replace the same command with `node scripts/harness.mjs`.

`harness init` does not add this npm package to the target project's dependencies. It only writes Harness docs, templates, and the registry. Delivery summaries must not imply that the target project now has an npm dependency installed. When CLI access is needed, keep using `npx --yes coding-agent-harness ...`, a global `harness`, or `node scripts/harness.mjs` from the source checkout.

Use the v1.0 six-phase flow:

1. Diagnose: scan project structure, language, existing docs, CI, collaboration model, and risk surfaces.
2. Decide: choose locale, delivery model, and capability packs.
3. Scaffold: run `harness init` or `harness add-capability`.
4. Configure: adapt generated docs to project facts. Do not present templates as customized standards.
5. Verify: run CLI checks and native project evidence.
6. Deliver: report residuals, owners, and next actions.

## Locale Rules

- When the user is present, ask whether Harness docs should use Chinese or English.
- Non-interactive installation must pass `--locale zh-CN` or `--locale en-US`; do not rely on the default.
- Use `zh-CN` for Chinese users or Chinese-first projects.
- Use `en-US` for English teams, English-first repositories, or explicit English requests.
- Do not mix `templates/` and `templates-zh-CN/` in one target project. Schema fields, filenames, status enums, commands, and cross-tool protocol tokens may remain English.

## New Project Initialization

Use this path when the target project has no legacy Harness:

```bash
harness init \
  --locale zh-CN \
  --capabilities core,dashboard \
  /path/to/project
```

If the target environment does not have `harness`:

```bash
npx --yes coding-agent-harness init \
  --locale zh-CN \
  --capabilities core,dashboard \
  /path/to/project
```

Choose capabilities conservatively:

| Capability | Default | When to choose |
| --- | --- | --- |
| `core` | Yes | Always install. This is the document kernel. |
| `dashboard` | No | A user or agent needs a local read-only status page. |
| `safe-adoption` | No | A legacy Harness project adopts v1.0 while preserving history. |
| `adversarial-review` | No | Release, architecture, security, data, or policy risk needs independent review artifacts. |
| `long-running-task` | No | An agent needs to execute across many turns without asking the user at every step. |
| `module-parallel` | No | Two or more independent modules need owners, a registry, and synchronization rules. |
| `subagent-worker` | No | Code-editing subagents need independent worktrees and commit-backed handoff; requires `module-parallel`. |

The JSON output from `init` includes a `report`. The delivery summary must include:

- locale
- selected capabilities and the reason for every optional capability
- created / skipped files
- project-specific edits made during Configure
- verification commands and results
- residual owner / action / status
- whether anything was committed, and whether dogfood artifacts were cleaned

## User-Level Registration

If the user already has the `harness` CLI from npm or source, register this skill into user-level agent directories so each project does not need a copied skill:

```bash
harness install-user --agent codex --global
harness doctor-user --agent codex
```

Supported agent targets:

| Agent | User directory |
| --- | --- |
| `codex` | `~/.codex/skills/coding-agent-harness` |
| `claude` | `~/.claude/skills/coding-agent-harness` |
| `gemini` | `~/.gemini/skills/coding-agent-harness` |
| `openclaw` | `~/.openclaw/skills/coding-agent-harness` |
| `agents` | `~/.agents/skills/coding-agent-harness` |
| `all` | install into every directory above |

Safety rules:

- Interactive confirmation is the default. Non-interactive runs must pass `--yes` or first use `--dry-run`.
- Existing files are not overwritten by default; only missing files are added.
- Use `--force` only for explicit forced updates.
- `doctor-user` checks that `SKILL.md`, templates, references, CLI scripts, and this guide exist.

## Legacy Harness Migration

Use this path when the target project already has an older Harness. Do not rebuild the old docs tree and do not hand-assemble the process with `add-capability`. Start with the verifiable migration rail:

```bash
harness migrate-run \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-project \
  --out-dir /tmp/cah-migration-project/dashboard \
  /path/to/old-project

harness migrate-verify \
  /tmp/cah-migration-project/session.json
```

Rules:

- Do not overwrite existing `AGENTS.md`, `CLAUDE.md`, `docs/Harness-Ledger.md`, SSoTs, walkthroughs, task progress, or historical task plans.
- When the old project mixes Chinese and English, explicitly pass `--locale zh-CN` or `--locale en-US`.
- Only add the missing v1.0 templates and capability registry.
- Existing project facts may be merged, appended, or recorded as residuals. They must not be replaced with generic templates.
- Historical contract gaps become `adoption-needed` warnings in normal mode.
- `--strict` must still fail on legacy checker failures or unresolved historical contract gaps.
- `migrate-verify` must pass before the migration output is reported as usable, and the dashboard path must be HTML.
- For detailed migration strategy, read `docs-release/guides/migration-playbook.md` or `docs-release/guides/migration-playbook.en-US.md`. If the user requires proof that the old project is fully migrated, also read `docs-release/guides/full-legacy-migration-subagent-strategy.md` or `docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`.

The agent must read `session.json` and `migrate-plan.json`, then migrate active tasks, current reviews, and truly adopted capabilities step by step. Subagent review must prove dashboard brief coverage, strict check, and final session all pass.

## Task Lifecycle

After initialization or migration, agents should not manually copy task folders. Use lifecycle commands:

```bash
harness new-task phase-2-lifecycle \
  --title "Phase 2 task lifecycle" \
  --locale en-US \
  /path/to/project

harness task-start phase-2-lifecycle \
  --message "Start lifecycle slice implementation" \
  /path/to/project

harness task-log phase-2-lifecycle \
  --message "Completed CLI and template updates" \
  --evidence "command:TARGET:npm-test:passed" \
  /path/to/project

harness task-complete phase-2-lifecycle \
  --message "Verification loop completed" \
  /path/to/project
```

Rules:

- `new-task` creates `brief.md`, `task_plan.md`, `execution_strategy.md`, `visual_map.md`, `findings.md`, `progress.md`, and `review.md`.
- Existing task directories are not overwritten. Renaming or continuing old tasks is a coordinator decision.
- `task-start`, `task-block`, and `task-complete` only update lifecycle status and logs in `progress.md`.
- `task-log` only appends execution records. Evidence uses `type:PATH:summary`, for example `command:TARGET:npm-test:passed`.
- `task-list --json` and `status --json` are the read entry points for dashboards, reviewers, and later agents.

## Verification Commands

Before closing installation or upgrade, run at least:

```bash
harness check --profile target-project /path/to/project
harness status --json /path/to/project
harness dashboard --out /tmp/harness-dashboard.html /path/to/project
```

For maintainers developing the v1.0 kernel in this source repo, the release gate is below. Normal target projects do not run `private-harness .harness-private`; that is this repository's private dogfood harness gate.

```bash
npm test
npm run smoke:dashboard
harness check --profile source-package .
harness check --profile private-harness .harness-private
harness check --profile target-project examples/minimal-project
```

## Mandatory Regression Paths

Every v1.0 kernel change must cover two paths:

| Path | Must prove |
| --- | --- |
| New project initialization | After `init --locale zh-CN\|en-US --capabilities core,...`, template language is consistent, registry is correct, and `status --json` does not falsely report `safe-adoption`. |
| Legacy Harness migration | After `migrate-run --locale ...`, old files are not overwritten, the registry declares `safe-adoption` and `dashboard`, `migrate-verify` passes, normal mode warns, and strict mode blocks historical gaps with `strictDeferred`. |

Real-project dogfood cleans test artifacts by default unless the user explicitly asks to keep and commit them.
