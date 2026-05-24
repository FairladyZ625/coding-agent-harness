# Preset Development

Harness presets are declarative task method packages. A preset can add task metadata, render Markdown templates, require CLI inputs, and generate evidence files without writing JavaScript.

`preset.yaml` uses the Harness manifest subset: nested mappings, scalar strings/numbers/booleans, and inline arrays such as `[standard, complex]`. Do not use block strings or dash-list YAML forms in preset manifests.

## Install Location

User-installed presets live in:

```text
~/.coding-agent-harness/presets/<preset-id>/
```

Harness discovers user presets first, then falls back to bundled presets under the package `presets/` directory.

## Package Layout

```text
my-preset/
  preset.yaml
  templates/
    task_plan.append.md
```

## Minimal Manifest

```yaml
id: custom-review
version: 1
purpose: Create a review task with preset evidence.
compatibleBudgets: [standard, complex]
localeSupport: [en-US, zh-CN]
task:
  kind: review-task
  defaultTaskId: custom-review-task
entrypoints:
  newTask:
    type: template
    writes: [docs/09-PLANNING/TASKS/**]
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
  files:
    subject:
      path: subject.txt
      type: text
      value: inputs.subject
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json, preset-manifest.json, write-scope.json]
writeScopes:
  taskDocs:
    path: docs/09-PLANNING/TASKS/**
    access: write
```

## Template Rendering

Templates use `{{valueName}}` placeholders from `templateValues`. `templateValues` and `metadata` support literal `value`, `default`, and dot-path `from` references such as `inputs.subject` or `task.title`; they do not evaluate arbitrary expressions.

`metadata` entries render first-class task plan lines such as `Review Subject: API contracts`.

```md
## Custom Review

Subject: {{subject}}
```

## Inputs

Supported input types:

| Type | Use |
| --- | --- |
| `text` | Reads a CLI flag value such as `--subject "API"` |
| `flag` | Reads a boolean CLI flag |
| `json-file` | Reads and validates a JSON file such as `--from-session session.json` |

`json-file` inputs can validate `validateOperation`, reject `planOnly`, require a target path, and route the task target from the JSON session.

## Evidence

Evidence files are written under the task directory and must match `writeScopes`.

Supported evidence types:

| Type | Output |
| --- | --- |
| `text` | Plain text from a value path |
| `json` | JSON from a value path |
| `input-json` | Raw resolved JSON input |
| `preset-audit` | Manifest audit payload |
| `preset-manifest` | Manifest snapshot |
| `write-scope` | Declared write scopes |
| `migration-verify` | Built-in migrate session verification |
| `migration-ledger` | Built-in migration phase ledger |
| `dashboard-hash` | Hash of the migration dashboard snapshot |
| `target-git-status` | Target Git status from migration session |
| `target-commit` | Current target commit |
| `harness-version` | Current package version |
| `generated-at` | Generation timestamp |

## Commands

```bash
harness preset check ./my-preset
harness preset install ./my-preset
harness preset install legacy-migration --force
harness preset list --json
harness preset inspect custom-review --json
harness new-task custom-review-task --preset custom-review --subject "API contracts" /path/to/project
harness preset uninstall custom-review
```

## Boundaries

- Presets cannot write outside declared `writeScopes`.
- Presets do not run arbitrary JavaScript during `new-task`.
- Script and check entrypoints may exist in bundled packages, but the task creation path is YAML + templates + built-in processors.
- Use a new built-in processor only when multiple presets need the same capability and the behavior can be tested centrally.
