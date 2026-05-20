# Legacy Harness Smooth Migration Playbook

Chinese source: `docs-release/guides/migration-playbook.md`

This playbook is written for agents working inside a target project. The goal is not to mechanically rewrite all historical docs. The goal is to move an old project into the v1.0 checkable contract gradually.

If another agent will execute the migration, first give it:

- `docs-release/guides/legacy-migration-agent-prompt.md`
- `docs-release/guides/legacy-migration-agent-prompt.zh-CN.md`
- `docs-release/guides/full-legacy-migration-subagent-strategy.md`
- `docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`

This guide assumes the installed `harness` command. Maintainers debugging from the source checkout can replace it with `node scripts/harness.mjs`.

## Migration Principles

- Protect history first, then add the new contract. Do not overwrite `AGENTS.md`, `CLAUDE.md`, historical tasks, walkthroughs, SSoTs, or ledgers.
- Migrate active tasks before historical tasks. Long-closed tasks may remain legacy evidence in baseline mode.
- Declare real capabilities before adding corresponding references. A template file does not prove a capability is adopted.
- Normal checks expose migration backlog. `--strict` is the final cutover gate.
- For single-line legacy projects, identify the engineering operating model before adopting `module-parallel`.
- Separate baseline adoption from full readable cutover. Baseline may keep residuals. Full cutover requires dashboard and CLI zero counts.

## Standard Flow

1. Read current state and decide locale:

```bash
harness status --json /path/to/project
harness migrate-plan --json /path/to/project
```

If the project mixes Chinese and English, the agent must not guess template language. Choose explicitly:

- Chinese user, Chinese project context, or Chinese-facing docs: `--locale zh-CN`
- English team or English-facing docs: `--locale en-US`

The agent must record concrete evidence for the decision, such as `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/Harness-Ledger.md`, active task docs, or product-facing docs. If signals conflict, stop and ask the user.

2. Run the migration rail:

```bash
harness migrate-run \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-project \
  --out-dir /tmp/cah-migration-project/dashboard \
  /path/to/project
```

`migrate-run` creates the compatibility layer declaration, dashboard, normal/strict check snapshots, and session record. It does not stage files. It stops on a dirty target by default; use `--allow-dirty` only after the dirty files are accepted as part of the migration context.

The output directory must contain:

- `session.json`
- `report.md`
- `migrate-plan.json`
- `status-normal.json`
- `status-strict.json`
- `dashboard/index.html`

3. Verify the migration rail:

```bash
harness migrate-verify /tmp/cah-migration-project/session.json
```

`migrate-verify` checks the capability registry, locale, dashboard HTML path, normal check, strict deferred metadata, and git index. Only after it passes may the agent say the migration output is usable.

If later cleanup repairs warnings or active task contracts, the first session is only the baseline. Before final delivery, rerun `migrate-run` for a fresh session/dashboard or explicitly label the differences between baseline session and final evidence.

`migrate-verify` passing does not mean the full migration is complete. Full migration also requires:

- `migrate-plan` is `declared-capability`.
- `warnings=0`, `taskActions=0`, `reviewSchemaGaps=0`, `legacyReferenceGaps=0`, `legacyResiduals=0`, and `recommendedCapabilities=[]`.
- Normal and strict checks pass.
- Dashboard status has `summary.briefCoverage.ready == total` and `missing == 0`.
- Canonical task diagrams use `visual_map.md`. Legacy `visual_roadmap.md` is rewrite input only and does not count as full cutover coverage.
- The task index opens and shows all tasks.
- At least one adversarial subagent review round passes.

4. Continue cleanup from the plan:

- `MP-01`: confirm compatibility layer and locale; verify historical docs were not overwritten.
- `MP-02`: choose capabilities; only declare capabilities that project facts support.
- `MP-03`: add `brief.md`, `execution_strategy.md`, and `visual_map.md` to active tasks.
- `MP-04`: adopt `module-parallel` only if the project already has multiple independent domains.
- `MP-05`: upgrade current release/architecture/security/data reviews; do not rewrite every historical review.
- `MP-06`: only use strict as a gate after normal warnings have owner/action/status.

5. Normal migration verification:

```bash
harness check --profile target-project /path/to/project
harness dashboard --out-dir /tmp/harness-dashboard /path/to/project
```

6. Strict cutover verification:

```bash
harness check --profile target-project --strict /path/to/project
```

`--strict` passing means strict cutover is complete. If the user accepts remaining historical residuals, report `strict deferred` with owner, trigger, and next action. Do not call it complete.

## Historical Task Migration Strategy

Legacy migration must read SSoT before warnings. A warning means "the v1 checker cannot understand this," not "the task is unfinished."

There are two different goals:

- Baseline safe-adoption: long-closed tasks may remain legacy evidence.
- Full readable cutover: every task must be readable in the dashboard, so every task needs a standalone `brief.md`, and dashboard brief coverage must be `total/total`.

Do not use baseline strategy as full cutover strategy.

Evidence reading order:

1. `docs/Harness-Ledger.md`: whether the task was closed and whether residuals remain.
2. `docs/10-WALKTHROUGH/Closeout-SSoT.md`: walkthrough, Lessons Check, and closeout status.
3. `docs/05-TEST-QA/Regression-SSoT.md` and legacy regression SSoTs: whether the related surface passed and whether yellow lights remain.
4. The task's own `progress.md`, `review.md`, `findings.md`, and walkthrough.
5. Git history, PRs, and commits: whether code or docs landed or were superseded.

Subagents should review this evidence chain, not merely list files:

| Role | Task | Output |
| --- | --- | --- |
| SSoT reviewer | Read Ledger / Closeout / Regression SSoT | Classify the task as `current-active`, `closed-with-evidence`, `closed-with-residual`, `superseded`, or `unknown-history`. |
| Evidence reviewer | Read task progress / review / walkthrough | Find completion evidence, blockers, or residual evidence. |
| History reviewer | Read git log / diff / PR clues | Decide whether the task is proven by commits or superseded by later work. |

In baseline mode, only `current-active` tasks or tasks still referenced by SSoT as current evidence receive `brief.md`, `execution_strategy.md`, and `visual_map.md`. Other historical tasks should be routed as residuals instead of receiving fake completion templates.

In full readable cutover mode, every task needs a standalone `brief.md`, but the brief must not be an empty template. A historical task brief is a readable index card: task goal, first human read, evidence sources, status judgment, and residuals. Only active or reopened tasks need stronger execution strategy and visual map.

| Legacy state | Handling |
| --- | --- |
| Closed, historical evidence only | Baseline may keep legacy. Full cutover still adds readable `brief.md`, without faking current execution. |
| Active task with only `task_plan.md` | Add `brief.md`, `execution_strategy.md`, `visual_map.md`, and log migration evidence with `task-log`. |
| Reopened legacy task | Migrate as active. Preserve old content and add v1 files for current facts. |
| Review exists but is not a current gate | Preserve it and record historical review gap in the migration plan. |
| Current release-blocking review | Upgrade to v1 `review.md` schema with Evidence Checked and Final Confidence Basis. |

## From Single-Line Tasks to Module Parallel

Do not turn many historical tasks into modules automatically. Adopt `module-parallel` only when:

- the project has two or more independently evolving product or engineering domains;
- every module has an owner, write scope, dependency model, and integration rule;
- shared files are owned by the coordinator and worker changes flow through handoff;
- `Module-Registry.md` and each `module_plan.md` can be maintained after migration.

If the project merely has many historical tasks without stable module boundaries, keep `safe-adoption`, use `migrate-plan` as the action list, and add module capability later.

## Warnings and Actions

`migrate-plan --json` converts warnings into four action buckets:

- `taskActions`: active tasks missing v1 task contract files.
- `reviewActions`: current or historical reviews missing v1 review schema.
- `legacyActions`: older checker gaps for references or governance files.
- `legacyResiduals`: historical tasks or status-uncertain tasks still missing files. This is counted by missing files, not by tasks, and should not be mechanically migrated.

Agents should assign owner/action/status for these actions rather than rewriting the entire repository in one pass. For `legacyResiduals`, first decide whether the task is reopened or still current evidence. Historical content that is not migrated must have a residual reason in closeout.

## Migration Session Contract

`migrate-run` writes an auditable `session.json`. A later agent should read the session before relying on a verbal summary:

| Field | Meaning |
| --- | --- |
| `localeDecision` | Selected `zh-CN` or `en-US`, plus detected language signals. |
| `capabilities` | Declared capabilities. Legacy projects should at least have `core`, `safe-adoption`, and `dashboard`. |
| `dashboard.indexPath` | Must point to an existing HTML dashboard. |
| `checks.normal` | Normal migration check for usability. |
| `checks.strict` | Final cutover gate; early legacy migration may fail. |
| `strictDeferred` | Required when strict fails; must include owner, trigger, next action, and failure count. |
| `git.after.staged` | Must be empty. The migration rail must not stage files. |

If the session points the dashboard to Markdown, lacks `strictDeferred`, has locale/registry mismatch, or contains staged files, fix the rail before polishing the report.

## Dashboard Migration Workbench

Large projects should not use a task-level Mermaid chain as the first view. When task count is high or topology edges are sparse, the dashboard should switch to an aggregate migration runway:

1. Baseline snapshot: current historical tasks, capability declarations, and check status.
2. Warning triage: warnings as a queue, not a one-time error list.
3. Active task contracts: upgrade active or reopened task contracts first.
4. Module classification: group by real product/engineering domains; use inferred modules only for browsing when no module is explicit.
5. Strict cutover: after current work and gate reviews are migrated, strict check becomes blocking.

Each dashboard warning must carry:

| Field | Use |
| --- | --- |
| `type` | Stable issue type such as missing-brief, review-schema-gap, or legacy-reference-gap. |
| `scope` | Affected scope: task, module, review, reference, capability, or project. |
| `priority` | Cleanup priority. Handle P1/P2 first; P3 may stay migration backlog. |
| `phase` | Suggested migration phase. |
| `fixability` | Fix mode: template, guided, human-evidence, decision, or manual. |
| `status` | Queue status: open by default; after cleanup use done/deferred/accepted-residual. |
| `confidence` | Classification confidence; low confidence needs human confirmation. |
| `affected` | Primary affected path for list display. |
| `affectedPaths` | Related file paths for agent or human review. |
| `requiredAction` | Next action text; dispatch prompts must cite it. |
| `detail` | Original warning summary for classification review. |

For 400+ task projects, use the dashboard this way:

- Use paginated Task Index instead of rendering every task in one screen.
- First group by migration bucket to separate active/current work, brief-ready tasks, and historical month buckets; then narrow by module or month.
- In baseline mode, do not automatically template historical tasks missing briefs. In full readable cutover mode, split missing briefs by date range or module across subagents.
- Fix warnings by category/type batch, regenerate the dashboard, and compare counts.

Full cutover dashboard smoke must verify:

- first screen `Brief Coverage` is `total/total`;
- warning triage is `0 warnings`;
- active task contract count is `0`;
- strict cutover count is `0`;
- Task Index shows `total / total`;
- `dashboard/data/status.json` includes `summary.briefCoverage` with `missing=0`;
- every task has `briefPath` and `briefSource=standalone`.

If dashboard data lacks these fields, fix the Harness data contract or regenerate the dashboard. Do not make review agents guess field meanings.

## Subagent Orchestration

Full migration should not let one agent edit everything from start to finish. Use at least these workers:

| Worker | Write scope | Goal |
| --- | --- | --- |
| Task Contract Worker | `docs/09-PLANNING/TASKS/**/brief.md`, `execution_strategy.md`, `visual_map.md`, same-task `progress.md` append | Clear task contract gaps. |
| Review/Capability Worker | `.harness-capabilities.json`, current strict review files | Declare real capabilities and repair release-blocking review schema. |
| Legacy Governance Worker | `AGENTS.md`, PR template, `docs/11-REFERENCE/**`, Ledger, Closeout SSoT, Lessons SSoT, walkthrough template | Clear legacy checker aggregate failures. |
| Brief Coverage Workers | date or module slices, missing `brief.md` only | Bring dashboard brief coverage to 100 percent. |
| Quality Repair Worker | only files named by reviewers | Remove parser residue, empty templates, language mismatch, and weak evidence. |

Every worker prompt must state:

- target path;
- only allowed write scope;
- no git commit;
- no overwriting existing briefs or other workers' changes;
- derive content from task `task_plan.md` / `progress.md` / `findings.md` / `review.md` / walkthrough / SSoT;
- final report must include changed count, residuals, and verification command.

Only one worker should sequentially update capability registry. Do not run concurrent `add-capability` commands against the same target.

## Adversarial Review

Full migration needs at least three read-only review lanes:

1. CLI/session reviewer: rerun `migrate-plan`, normal, strict, `migrate-verify`; check final session/dashboard consistency.
2. Brief quality reviewer: scan all missing briefs and sample multiple dates/modules for empty templates, parser-failure text, missing evidence sources, or wrong language.
3. Boundary reviewer: confirm source repo, private Harness, and target legacy project boundaries and git states; no staged files and no private content in public repo.

Treat any FAIL as valid until disproven with evidence. After fixing, regenerate final session/dashboard and have the failed area reviewed again.

## Module Classification Decision

Module classification has three levels and must not skip levels:

1. `explicit module`: tasks already live under `docs/09-PLANNING/MODULES/<module>/`, or a maintained `Module-Registry.md` exists.
2. `inferred module`: dashboard temporary grouping from task path/title/ID keywords, for browsing and triage only. It does not mean the project adopted `module-parallel`.
3. `legacy-unclassified`: historical tasks that cannot be classified reliably. Preserve history and do not batch-rewrite them.

Before creating `Module-Registry.md`, produce a classification summary:

- candidate module name;
- why this is a product/engineering domain rather than a folder or date range;
- owner / write scope / shared-file coordinator rule;
- which tasks remain `legacy-unclassified`.

If these facts are not true, use dashboard inferred grouping only for cleanup and do not declare `module-parallel`.
