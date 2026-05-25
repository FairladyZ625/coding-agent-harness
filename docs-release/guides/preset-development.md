# Preset Development

Harness presets are declarative task method packages. A preset can add task metadata, render Markdown templates, require CLI inputs, generate evidence files, and pre-load shared reference bundles without writing JavaScript.

Use a preset when multiple tasks should start from the same method, evidence contract, or shared context. Do not create a preset for one-off prose. Good presets encode repeatable task behavior: required inputs, task kind, review/evidence expectations, shared references, and a small amount of task-plan guidance that tells the next agent what to read first.

`preset.yaml` uses the Harness manifest subset: nested mappings, scalar strings/numbers/booleans, and inline arrays such as `[standard, complex]`. Do not use block strings or dash-list YAML forms in preset manifests.

## Install Location

Project presets live in:

```text
<target>/.coding-agent-harness/presets/<preset-id>/
```

User-installed presets live in:

```text
~/.coding-agent-harness/presets/<preset-id>/
```

When a target is supplied, Harness discovers project presets first, then user presets, then bundled presets under the package `presets/` directory. Use project presets when a repository needs to override or pin a task method. Use user presets for personal reusable methods across repositories.

## Package Layout

```text
my-preset/
  preset.yaml
  templates/
    task_plan.append.md
    references/
      upstream-contract.md
  resources/
    service-runbook.md
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

## Reference Bundles

Use `resources.references` when a family of tasks shares the same outside context, such as another microservice, API contract, migration packet, reviewer input, or local verification runbook. Harness copies or renders these files into each created task directory, appends `references/INDEX.md` rows, and can add a required-read section to `task_plan.md`.

```yaml
resources:
  references:
    upstreamContract:
      path: references/upstream-contract.md
      template: templates/references/upstream-contract.md
      index:
        id: REF-001
        type: code
        summary: Shared upstream {{service}} contract for every task created by this preset.
        usedBy: coordinator,worker,reviewer
    serviceRunbook:
      path: references/service-runbook.md
      source: resources/service-runbook.md
      index:
        id: REF-002
        type: runbook
        summary: Local verification notes for the shared upstream service.
        usedBy: worker
context:
  requiredReads: [REF-001, REF-002]
```

Use `template` when the file needs `{{valueName}}` substitution. Use `source` when the file should be copied as static Markdown. `path`, `source`, and `template` must stay inside the preset package and generated task directory boundaries.

## Artifact Bundles

Use `resources.artifacts` for preset-provided fixtures, generated input packets, or review material that supports the task but is not a reference source of truth. Harness writes these files into the task's `artifacts/` area and appends `artifacts/INDEX.md`.

```yaml
resources:
  artifacts:
    inputPacket:
      path: artifacts/input-packet.md
      source: resources/artifacts/input-packet.md
      index:
        id: ART-001
        type: fixture
        summary: Shared fixture packet copied by the preset.
        producedBy: preset
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
harness preset install ./my-preset --project /path/to/project
harness preset install legacy-migration --force
harness preset list --json /path/to/project
harness preset inspect custom-review --json /path/to/project
harness new-task custom-review-task --preset custom-review --subject "API contracts" /path/to/project
harness preset uninstall custom-review
```

## Validation Method

For every preset, prove both the manifest and downstream task behavior:

1. Run `harness preset check ./my-preset`.
2. Install into an isolated HOME or disposable environment.
3. Create at least one task with `harness new-task --preset`.
4. For reference bundles, create two different tasks from the same preset and verify both contain the same shared `references/` files and independent audit/evidence bundles.
5. Run `harness status --json`, `harness task-index --json`, and `harness check --profile target-project <target>`.
6. Inspect `task_plan.md` to confirm required reads are visible before implementation starts.

## Boundaries

- Presets cannot write outside declared `writeScopes`.
- Presets do not run arbitrary JavaScript during `new-task`.
- Reference bundles are task-local snapshots. If the shared upstream context changes later, create a new preset version or a follow-up task rather than silently mutating historical tasks.
- Script and check entrypoints may exist in bundled packages, but the task creation path is YAML + templates + built-in processors.
- Use a new built-in processor only when multiple presets need the same capability and the behavior can be tested centrally.
