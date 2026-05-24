# Agent Installation Guide

Chinese source: `docs-release/guides/agent-installation.md`

This guide is written for coding agents that install or upgrade Harness inside a target project. The README keeps only the human-facing positioning, quick start, and minimum commands. Operational details live here and in `SKILL.md`.

## Operating Contract

The main operator for this CLI is usually an agent inside the target project, not the end user. The agent should not ask the user to study command flags, template folders, or capability choices. Those decisions must happen during Diagnose / Decide and be explained in the delivery summary.

Commands in this guide are written with an installed `harness` command. The agent must first check `command -v harness`. If the target environment does not have `harness`, do not silently install globally. Ask the user whether `npm install -g coding-agent-harness` is allowed. Run that global install only after explicit approval. If the user does not approve or does not respond, run the same CLI with `npx --yes coding-agent-harness <command>`. Maintainers debugging from the source checkout can replace the same command with `node scripts/harness.mjs`.

`harness init` does not add this npm package to the target project's dependencies. It only writes Harness docs, templates, and the registry. Delivery summaries must not imply that the target project now has an npm dependency installed. The first `npx` run downloads the package into npm cache; it is not a project dependency or a global command install. When CLI access is needed, keep using `npx --yes coding-agent-harness ...`, a user-approved global `harness`, or `node scripts/harness.mjs` from the source checkout.

`npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness`
is not a zero-write operation. It copies the Skill into `.agents/skills/coding-agent-harness/`
inside the target project and writes `skills-lock.json`. If the user asks for a strict
read-only scan, skip Skill installation first and use `npx --yes coding-agent-harness status`
/ `migrate-plan` for the scan; install the Skill or run write commands only after the user
confirms write access.

Use the v1.0 six-phase flow:

1. Diagnose: scan project structure, language, existing docs, CI, collaboration model, external dependencies, and risk surfaces.
2. Decide: choose locale, delivery model, capability packs, and whether external source intake is needed.
3. Scaffold: run `harness init` or `harness add-capability`.
4. Configure: adapt generated docs to project facts. Do not present templates as customized standards.
5. Verify: run CLI checks and native project evidence.
6. Deliver: report residuals, owners, and next actions.

If Diagnose finds a microservice, multi-repo, split frontend/backend, or platform subsystem, or the code references external services, SDKs, API gateways, message queues, webhooks, contracts, schemas, or mocks, the agent must ask the user whether external source material exists. Small source sets can be linked from `Source Evidence`; large source sets use `docs/11-REFERENCE/external-source-intake-standard.md` and `docs/04-DEVELOPMENT/external-source-packs/<source-key>/`, then project stable conclusions into `03/04/06`.

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

If the target environment does not have `harness`, ask the user whether global installation is allowed. If approved, run `npm install -g coding-agent-harness`. Without approval, use:

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
| `dashboard` | No | A user or agent needs a local status page, static evidence snapshot, or localhost dynamic workbench. |
| `safe-adoption` | No | A legacy Harness project adopts v1.0 while preserving history. |
| `adversarial-review` | No | Release, architecture, security, data, or policy risk needs independent review artifacts. |
| `long-running-task` | No | An agent needs to execute across many turns without asking the user at every step. |
| `module-parallel` | No | Two or more independent modules need owners, a registry, and synchronization rules. |
| `subagent-worker` | No | Code-editing subagents need independent worktrees and commit-backed handoff; requires `module-parallel`. |

The JSON output from `init` includes a `report`. The delivery summary must include:

- locale
- selected capabilities and the reason for every optional capability
- created / skipped files
- the recommended daily entry from `nextCommands`, such as `harness dev` or `npx --yes coding-agent-harness dev .`
- project-specific edits made during Configure
- verification commands and results
- residual owner / action / status
- whether anything was committed, and whether dogfood artifacts were cleaned

`init` does not modify `package.json` by default. Use `--add-npm-scripts` only when the user explicitly wants npm scripts in the target project. That option requires an existing `package.json` and does not overwrite existing `harness:dev` or `harness:dashboard` scripts.

## External Source Intake

When a project depends on external microservices, repositories, or external-team documents, agents should not drop those materials directly into `03-ARCHITECTURE`, `04-DEVELOPMENT`, or `06-INTEGRATIONS`. Use this order:

```text
Inventory -> Classify -> Sanitize -> Digest -> Project -> Verify -> Residual
```

Rules:

- Ask the user for external architecture docs, API docs, diagrams, meeting notes, links, source paths, or exported packets.
- Confirm whether the material may be copied into the repository; non-committable material is represented by path, URL, owner, access condition, and digest only.
- If there are more than 5 external documents, multiple topics, or continuing growth, create `docs/04-DEVELOPMENT/external-source-packs/<source-key>/`.
- `external-source-packs/` stores source indexes, digests, and projection status only.
- Stable facts must be written back to `03-ARCHITECTURE/services/<service-key>.md`, `04-DEVELOPMENT/external-context/<service-key>.md`, or `06-INTEGRATIONS/<contract>.md`.
- Unconfirmed or conflicting material stays in the source pack or `Do Not Assume`.

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
- Archive old global tables and module indexes first, then regenerate them with `harness governance rebuild --archive --apply`; those tables are agent indexes, while humans should use the Dashboard for status.
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

harness review-confirm TASKS/phase-2-lifecycle \
  --reviewer "Human Reviewer" \
  --confirm phase-2-lifecycle \
  /path/to/project

harness task-complete phase-2-lifecycle \
  --message "Verification loop completed" \
  /path/to/project
```

Rules:

- Do not manually copy task templates or create partial task folders. `harness check` enforces the file set created by `new-task`.
- `new-task --budget simple` creates `brief.md`, `task_plan.md`, `visual_map.md`, and `progress.md`.
- `new-task` defaults to `standard` and creates the simple files plus `execution_strategy.md`, `findings.md`, `lesson_candidates.md`, and `review.md`.
- `new-task --budget complex` creates the standard files plus `references/INDEX.md` and `artifacts/INDEX.md`.
- Existing task directories are not overwritten. Renaming or continuing old tasks is a coordinator decision.
- `task-start`, `task-block`, and `task-complete` only update lifecycle status and logs in `progress.md`.
- `task-log` only appends execution records. Evidence uses `type:PATH:summary`, for example `command:TARGET:npm-test:passed`.
- `review-confirm` appends a human review confirmation to `review.md` and a log entry to `progress.md`. It must reject open P0/P1/P2 findings marked `Open: yes` or `Blocks Release: yes`.
- CLI-owned lifecycle and lesson commands auto-commit allowlisted writes in a clean Git root. Dirty state appears in `status` / dashboard warnings and blocks those mechanical commits. Agent-owned manual edits still need proactive commits; deferred commits must record the no-commit reason, owner, and next step.
- `status --json` keeps old `task.state` for compatibility and adds `lifecycleState`, `reviewStatus`, `closeoutStatus`, and `stateConflicts`. `done` means implementation finished; it does not mean `closed`.
- For human operation, start the local HTML workbench with `harness dev /path/to/project`. It binds to `127.0.0.1`, chooses a port automatically, opens the browser, and refreshes when docs change. In headless or CI contexts, use `harness dev --no-open /path/to/project`.
- The lower-level compatible entry point remains `harness dashboard --workbench --out-dir /tmp/harness-workbench /path/to/project`. Static dashboard files remain read-only and must not host human confirmation actions.
- `task-list --json` and `status --json` are the read entry points for dashboards, reviewers, and later agents.

## Verification Commands

Before closing installation or upgrade, run at least:

```bash
harness check --profile target-project /path/to/project
harness status --json /path/to/project
harness dev --no-open --out-dir /tmp/harness-workbench /path/to/project
harness dashboard --out /tmp/harness-dashboard.html /path/to/project
```
