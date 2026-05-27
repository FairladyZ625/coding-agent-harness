# Harness Directory Standard

## Purpose

Define the v2 target-project Harness structure. Active Harness state lives under
`coding-agent-harness/`; old numbered document roots are legacy migration input
only and must be migrated with `harness migrate-structure --apply`.

## Canonical Structure

```text
coding-agent-harness/
├── harness.yaml
├── context/
│   ├── architecture/
│   ├── development/
│   └── integrations/
├── planning/
│   ├── tasks/
│   │   └── <task-id>/
│   │       ├── INDEX.md
│   │       ├── task_plan.md
│   │       ├── progress.md
│   │       ├── review.md
│   │       ├── findings.md
│   │       ├── visual_map.md
│   │       ├── lesson_candidates.md
│   │       └── walkthrough.md
│   ├── modules/
│   │   ├── Module-Registry.md
│   │   └── <module-key>/
│   │       ├── module_plan.md
│   │       └── tasks/<task-id>/
│   └── Delivery-SSoT.md
└── governance/
    ├── generated/
    │   ├── Harness-Ledger.md
    │   └── Closeout-Index.md
    ├── regression/
    ├── standards/
    ├── lessons/
    └── archive/
```

## Rules

- `harness.yaml` is the structure manifest and resolver source of truth.
- Root task packages live in `planning/tasks/<task-id>/`.
- Module task packages live in `planning/modules/<module-key>/tasks/<task-id>/`.
- `walkthrough.md` is task-local; global closeout state is generated into
  `governance/generated/Closeout-Index.md`.
- `Harness-Ledger.md` is generated into `governance/generated/`; do not edit it
  as a hand-written global table.
- Context docs are split by role:
  - `context/architecture/`: system facts, ownership, service catalog, ADRs.
  - `context/development/`: local setup, mocks, stubs, external source packs.
  - `context/integrations/`: API, event, webhook, SDK, auth, payload contracts.
- Regression and cadence tables live in `governance/regression/`.
- Long-lived operating standards live in `governance/standards/`.
- Reusable lessons live in `governance/lessons/`.
- Historical migrated material belongs under `governance/archive/`.

## Migration Boundary

Legacy directories are not active runtime locations. The only normal command
that should read them is migration planning/application:

```bash
harness migrate-structure --plan /path/to/project
harness migrate-structure --apply /path/to/project
```

After migration, `status`, `check`, `dashboard`, and task lifecycle commands
must use the v2 manifest paths above.
