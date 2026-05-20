# Full Legacy Migration Subagent Strategy

Chinese mirror: `docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`

This guide is for agents migrating a large pre-v1 Harness project all the way to a readable v1 cutover.

Use it when the user needs proof that another agent can migrate an old project, not just a baseline safe-adoption report.

## Definition of Done

A legacy migration is complete only when all of these are true:

- `migrate-plan` reports `mode=declared-capability`.
- `migrate-plan.summary.warnings=0`.
- `taskActions=0`, `reviewSchemaGaps=0`, `legacyReferenceGaps=0`, `legacyResiduals=0`.
- `recommendedCapabilities=[]`.
- `harness check --profile target-project` passes.
- `harness check --profile target-project --strict` passes.
- `migrate-verify <session.json>` passes on a fresh final session.
- The dashboard opens as HTML and the task index is usable.
- Dashboard status data reports `summary.briefCoverage.ready == total` and `missing == 0`.
- Every task has a readable standalone `brief.md`, not just a legacy `task_plan.md` fallback.
- Final adversarial reviews pass after any fixes.

If any item above is not true, report the migration as `baseline` or `strict deferred`, not complete.

## Two Modes

There are two valid migration modes. Do not confuse them.

| Mode | Purpose | Accepts residuals | Completion claim |
| --- | --- | --- | --- |
| Baseline safe-adoption | Preserve history, create registry, produce first dashboard, expose warning queue. | Yes | "usable baseline" |
| Full readable cutover | Make old project readable and strict-clean through v1 dashboard and CLI. | No, unless explicitly accepted by user. | "migration complete" |

Baseline mode may leave historical tasks in legacy format. Full readable cutover may not leave missing briefs, unresolved warnings, or strict failures.

## Coordinator Contract

The coordinator owns orchestration and verification. Subagents own bounded migration slices.

Coordinator rules:

- Do not fix target files manually unless a subagent is blocked and the user accepts coordinator intervention.
- Give each worker a disjoint write scope.
- Tell every worker that other agents are active and that they must not revert or overwrite other work.
- Use subagents for execution and separate subagents for adversarial review.
- Treat subagent reports as claims until the coordinator reruns checks.
- Regenerate the final `migrate-run` session after all cleanup. A baseline session is not final evidence.
- Keep the target git index unstaged unless the user asks to stage.

## Phase 0: Baseline

Run:

```bash
git -C /path/to/project status --short --branch
harness migrate-plan --json --limit 1000 /path/to/project > /tmp/cah-baseline-plan.json
```

Decide locale explicitly:

- Use `zh-CN` for Chinese users, Chinese operating docs, or Chinese project context.
- Use `en-US` for English teams or English-facing project docs.
- If mixed-language signals conflict, stop and ask the user.

Run the baseline rail:

```bash
harness migrate-run \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-baseline \
  --out-dir /tmp/cah-migration-baseline/dashboard \
  /path/to/project
```

If the target is already dirty, use `--allow-dirty` only after recording why the dirty files belong to this migration.

Then run:

```bash
harness migrate-verify /tmp/cah-migration-baseline/session.json
```

This proves the migration rail works. It does not prove full migration unless all completion gates are already zero.

## Phase 1: Work Queue

Read:

- `/tmp/cah-baseline-plan.json`
- `/tmp/cah-migration-baseline/session.json`
- `docs/Harness-Ledger.md`
- `docs/10-WALKTHROUGH/Closeout-SSoT.md`
- `docs/05-TEST-QA/Regression-SSoT.md`
- current task `progress.md`, `review.md`, `findings.md`
- git history when task status is unclear

Build the queue in this order:

1. Capability registry and locale.
2. Task contracts: `brief.md`, `execution_strategy.md`, `visual_map.md`.
3. Review schema.
4. Legacy governance and reference checker failures.
5. Dashboard readability briefs for every task.
6. Quality repair for weak briefs or stale dashboard data.

Do not move to final verification while any queue has open items.

## Phase 2: Execution Subagents

Use small, bounded worker roles. These roles can run sequentially or in parallel when write scopes do not overlap.

| Worker | Write scope | Goal |
| --- | --- | --- |
| Task Contract Worker | `docs/09-PLANNING/TASKS/**/brief.md`, `execution_strategy.md`, `visual_map.md`, optional same-task `progress.md` log | Remove task contract failures. |
| Review/Capability Worker | `.harness-capabilities.json`, current strict review files | Declare real capabilities and normalize release-blocking review schema. |
| Legacy Governance Worker | `AGENTS.md`, PR template or residual, `docs/11-REFERENCE/**`, Ledger, Closeout SSoT, Lessons SSoT, walkthrough template | Clear legacy checker failures. |
| Brief Coverage Workers | disjoint task-date or module ranges, only missing `brief.md` | Reach dashboard brief coverage 100 percent. |
| Quality Repair Worker | only files named by reviewer | Remove weak brief patterns and stale dashboard assumptions. |

Worker prompt requirements:

- State the exact target path.
- State the exact allowed write scope.
- Tell the worker not to submit git changes.
- Tell the worker not to overwrite existing user or other-agent changes.
- Require local evidence, not generic templates.
- Require a final self-check command or scan.
- Ask for changed path summary and residuals.

Example brief worker prompt:

```text
Your write scope is only docs/09-PLANNING/TASKS/2026-03-11* through 2026-03-31*/brief.md.
Only create missing brief.md. Do not edit progress.md, task_plan.md, review.md, execution_strategy.md, or visual_map.md.
Every brief must be Chinese-first if locale is zh-CN and must cite this task's task_plan.md/progress.md/findings.md/review evidence.
Do not leave parser-failure phrases such as "unknown", "could not parse", "若干", "未能解析", "未提供 Current Focus", or "无明确 Roadmap Binding".
```

## Phase 3: Capability Registry

Full cutover requires declared-capability mode.

Sequentially add capabilities. Do not run `add-capability` in parallel against the same target registry.

```bash
harness add-capability safe-adoption --locale zh-CN /path/to/project
harness add-capability dashboard --locale zh-CN /path/to/project
harness add-capability long-running-task --locale zh-CN /path/to/project
harness add-capability adversarial-review --locale zh-CN /path/to/project
```

Declare optional capabilities only when project facts justify them. If legacy artifacts prove the capability exists and strict migration adopts the corresponding standards, declare it.

Verify:

```bash
harness migrate-plan --json --limit 1000 /path/to/project
```

Expected:

- `mode=declared-capability`
- `recommendedCapabilities=[]`

## Phase 4: Task Contracts

For every task that must be readable in the dashboard:

- `brief.md` answers what the task is, why it matters, what a human should inspect first, current state, risks, residuals, and evidence sources.
- `execution_strategy.md` explains how an agent should resume or verify the task.
- `visual_map.md` gives a phase table or readable roadmap.

Full readable cutover requires every task to have a standalone `brief.md`. This is stricter than baseline safe-adoption.

Brief minimum structure:

```markdown
# Brief

## Task Goal

## First Human Read

## Execution and Evidence Flow

## Current Status Judgment

## Risks and Residuals

## Evidence Sources
```

For `zh-CN`, use Chinese headings:

```markdown
# Brief

## 任务目标

## 迁移后的第一眼

## 执行/证据流

## 当前状态判断

## 风险与残余

## 证据来源
```

Unacceptable brief content:

- Empty template text.
- Parser failure text such as `若干`, `未能解析`, `unknown`, `not parsed`.
- Claims of completion without evidence.
- A summary that does not cite local files.
- English stub headings in a Chinese migration.

## Phase 5: Legacy Governance

Strict cutover may still fail after task/review cleanup because old checker rules require governance surfaces.

Fix or route:

- `AGENTS.md` routes to all adopted standards and SSoTs.
- `repo-governance-standard.md` includes repo platform profile, PR policy, and branch protection.
- `delivery-operating-model-standard.md` defines operating model profile, agent visibility, and delivery SSoT.
- PR template exists or an explicit blocked-with-owner residual exists.
- `Harness-Ledger.md` includes repo governance / CI-CD and Lessons Check columns.
- `Closeout-SSoT.md` includes walkthrough, Lessons Check, and closeout status.
- `Lessons-SSoT.md` includes ID, status, and detail doc columns.
- `_walkthrough-template.md` includes Lessons Reflection.

Do not overwrite business facts. Merge missing columns or append a migration section when possible.

## Phase 6: Dashboard Smoke

Generate a fresh final dashboard after all fixes:

```bash
rm -rf /tmp/cah-migration-final
harness migrate-run \
  --allow-dirty \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-final \
  --out-dir /tmp/cah-migration-final/dashboard \
  /path/to/project
```

Then verify:

```bash
harness migrate-verify /tmp/cah-migration-final/session.json
```

Serve the dashboard when `file://` cannot be opened:

```bash
cd /tmp/cah-migration-final/dashboard
python3 -m http.server 55983 --bind 127.0.0.1
```

Dashboard smoke must check:

- First screen says status passed.
- Brief coverage is `total/total`.
- Warning count is 0.
- Strict cutover count is 0.
- Task index opens.
- Task index shows `total / total`.
- Search, status filter, and grouping controls render.
- At least one task detail opens.

Data smoke must check:

```bash
node -e '
const fs = require("fs");
const status = JSON.parse(fs.readFileSync("/tmp/cah-migration-final/dashboard/data/status.json", "utf8"));
console.log(status.summary.briefCoverage);
console.log(status.tasks.filter((task) => task.briefSource !== "standalone" || !task.briefPath).slice(0, 5));
'
```

Expected:

- `ready == total`
- `missing == 0`
- no task without `briefPath`

## Phase 7: Adversarial Review

Run at least three independent review lanes after the coordinator believes migration is done.

| Reviewer | Checks | Failure examples |
| --- | --- | --- |
| CLI/session reviewer | `migrate-plan`, normal, strict, `migrate-verify`, session fields, dashboard data. | `legacy-compat`, stale session, strict deferred, no brief coverage summary. |
| Brief quality reviewer | Missing brief scan and sampled brief quality across time ranges/modules. | Empty templates, parser-failure text, no evidence sources, wrong language. |
| Boundary reviewer | Source repo cleanliness, private/public boundary, target dirty whitelist, staged files. | Private docs staged publicly, target staged files, unexpected target paths. |

If any reviewer says FAIL:

1. Treat it as valid until disproven with evidence.
2. Fix the target or the harness data contract.
3. Regenerate final session and dashboard.
4. Re-run only the failed review plus the coordinator's full smoke.

Do not end with a known FAIL review.

## Final Report Template

Report:

- Target path.
- Final dashboard URL/path.
- Capability registry.
- `migrate-plan` zero counts.
- normal and strict check results.
- `migrate-verify` result.
- Dashboard brief coverage.
- Subagent worker roles used.
- Final adversarial review outcomes.
- Target git status: staged count and dirty path categories.
- Any accepted residuals. If none, say none.

Do not say "complete" unless all Definition of Done gates pass.
