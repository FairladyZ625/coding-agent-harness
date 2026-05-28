# Structure-Aware Preset Paths

Use this reference before writing or reviewing any Harness `preset.yaml`.

## Core Rule

Do not hard-code Harness runtime paths such as
`coding-agent-harness/planning/tasks/**`. Repositories may move the Harness
folder, so runtime write/read scopes must use `{{paths.*}}`, resolved from the
target repository's `harness.yaml`.

For ordinary task-creating presets, use this pair:

```yaml
entrypoints:
  newTask:
    writes: [{{paths.tasksRoot}}/**]
writeScopes:
  taskDocs:
    path: {{paths.tasksRoot}}/**
    access: write
```

The `entrypoints.newTask.writes` entries must exactly match declared
`writeScopes.*.path` entries.

## Supported Fields

| Field | Use |
| --- | --- |
| `{{paths.harnessRoot}}` | Harness root for the target repository |
| `{{paths.planningRoot}}` | Planning root |
| `{{paths.tasksRoot}}` | Task directory root |
| `{{paths.modulesRoot}}` | Module planning root |
| `{{paths.externalRoot}}` | External context root |
| `{{paths.governanceRoot}}` | Governance root |
| `{{paths.generatedRoot}}` | Generated governance files |
| `{{paths.regressionRoot}}` | Regression records |
| `{{paths.ledgerPath}}` | Harness ledger path |
| `{{paths.closeoutIndexPath}}` | Closeout index path |

## Minimal Manifest

```yaml
id: custom-review
version: 1
purpose: Create a custom review task
compatibleBudgets: [standard, complex]
localeSupport: [en-US]
task:
  kind: review-task
  defaultTaskId: custom-review-task
entrypoints:
  newTask:
    type: template
    writes: [{{paths.tasksRoot}}/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
inputs:
  subject:
    type: text
    flag: --subject
    required: true
templateValues:
  subject:
    from: inputs.subject
metadata:
  ReviewSubject:
    label: Review Subject
    from: inputs.subject
evidence:
  bundleDir: artifacts/preset
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json, preset-manifest.json, write-scope.json]
writeScopes:
  taskDocs:
    path: {{paths.tasksRoot}}/**
    access: write
```

## Path Boundaries

- Use `{{paths.*}}` only for Harness runtime paths.
- Keep preset package paths package-relative: `templates/task_plan.append.md`,
  `resources/runbook.md`, `references/foo.md`.
- Keep generated task-local resource destinations task-relative:
  `references/foo.md`, `artifacts/foo.md`.
- Do not write default-layout examples as runtime instructions. If prose must
  mention `coding-agent-harness/`, label it as the default layout.
- Do not overwrite user-customized installed presets unless the user explicitly
  approved it.
- Do not overwrite project-authored files or user-modified template projections.

## Validation Commands

```bash
harness preset check ./my-preset
harness new-task --title "Smoke" --preset my-preset /path/to/project
harness check --profile target-project /path/to/project
harness preset audit --json
harness preset audit --project --json /path/to/project
harness templates audit --json /path/to/project
harness templates refresh --apply --json /path/to/project
```

`harness preset check` validates token syntax. Creating or installing against a
target validates resolved scopes against that target's actual structure.

Use `harness preset audit` before replacing installed user/project presets. Use
`harness templates audit` before refreshing generated project templates.
