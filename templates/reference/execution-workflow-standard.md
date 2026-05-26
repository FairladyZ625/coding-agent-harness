# Execution Workflow Standard

## Purpose

Define the standard lifecycle for non-trivial work from intake through planning, implementation, verification, review, and closeout.

## Rules

1. Start by identifying goal, scope, constraints, allowed paths, forbidden paths, acceptance criteria, and expected evidence.
2. Create or update a task plan before implementation when the work spans multiple files, multiple agents, external systems, or user-facing behavior.
3. Record important discoveries in the task artifacts instead of relying on transient chat context.
4. Implement in small reviewable slices and keep the plan current when scope changes.
5. Run checks that match the risk surface before claiming completion.
6. Route material findings through review and do not bury unresolved issues in summaries.
7. Proactively commit each verified, meaningful slice. A completed slice should not remain only as unstaged or staged working-tree state unless the user explicitly asked to defer commits, checks failed, dirty ownership is unclear, or a documented blocker prevents a clean commit. Deferred commits require a no-commit reason, owner, and next step.
8. Use CLI lifecycle commands for mechanical Harness writes whenever available. CLI-owned writes use locked, allowlisted auto-commit. `new-task` may preserve unrelated dirty files while committing only its own write scope; overlapping dirty paths or unrelated staged files still block the command. Other lifecycle commands may still require a clean tree. Agent-owned manual edits still need an explicit task commit or deferred-commit rationale.
9. Treat `visual_map.md` as the lifecycle phase map. `init` phases prepare work, `execution` phases define implementation completion, and `gate` phases define review, human confirmation, lesson routing, and closeout. Follow a phase `Exit Command` only when its `Actor` matches the current operator; agents must not perform `human` gates.
10. New task directories must carry a short machine-readable Scaffold Provenance table at the end of `brief.md`. The normal path is `Created By: harness new-task`; manual creation is allowed only as `manual-exception` with a concrete reason, and historical migration must use `historical-backfill`.
11. Close the loop by updating walkthrough, SSoT, regression, ledger, or docs artifacts when the work changes durable project knowledge. New non-simple tasks should keep `lesson_candidates.md` reviewable before human review confirmation.

## Task Package Structure

Use `harness new-task` instead of hand-copying task files. The CLI creates the selected budget file set and records provenance so `harness check` can validate it.

| Budget | Required Files |
| --- | --- |
| simple | `INDEX.md`, `brief.md`, `task_plan.md`, `visual_map.md`, `progress.md` |
| standard | simple files plus `execution_strategy.md`, `findings.md`, `lesson_candidates.md`, `review.md` |
| complex | standard files plus `references/INDEX.md`, `artifacts/INDEX.md` |
| long-running add-on | `long-running-task-contract.md` when `--long-running` is selected |

`INDEX.md` is the task package navigation page. It points to contract files and optional indexes but does not replace them.

Optional directories are created only when triggered:

- `references/INDEX.md`: task-local sources, external links, reviewer input packages, and preset-provided required reads.
- `artifacts/INDEX.md`: command output, screenshots, fixtures, generated reports, reviews, and other evidence.
- `lessons/LC-*.md`: task-local lesson detail artifacts for candidates marked `needs-promotion`.
- `slices/<slice-id>/`: multi-slice task material, when a task explicitly uses slice packets.

Preset packages must not add or replace root-level base scaffold documents. Presets may append controlled sections to fixed base documents or add isolated resources under `references/**` and `artifacts/**`. Resource rows belong only in `references/INDEX.md` and `artifacts/INDEX.md`; the root `INDEX.md` may show only system-rendered preset summary fields.

## Required Checklist

- Goal, scope, acceptance criteria, and constraints are written down.
- Task scaffold provenance is present, or the manual/historical exception reason is explicit.
- The task package `INDEX.md` is present for new generated tasks.
- Current repo state and ownership boundaries were checked.
- Implementation notes identify changed surfaces.
- Required checks and evidence are captured.
- Verified slices have commit SHAs, or the no-commit reason, owner, and next step are written down.
- The current lifecycle gate in `visual_map.md` has either been executed or has a recorded blocker.
- Review status and material findings are recorded.
- Residuals are explicit and assigned.
- Closeout artifacts are updated when required.

## Closeout Expectations

Closeout must provide a concise change summary, evidence checked, checks not run with reasons, review outcome, residual risk, relevant commit SHAs or deferred-commit rationale, and any durable docs or ledger updates made during the task.
