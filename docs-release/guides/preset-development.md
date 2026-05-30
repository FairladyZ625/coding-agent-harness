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

Bundled presets are not only fallback files. `npm install -g coding-agent-harness`
and `harness install-user` seed them into the user preset root, while
`harness init` seeds them into the project preset root. Re-run
`harness preset seed` for the user root or `harness preset seed --project <target>`
for the project root when a preset root is missing or incomplete.
Use `harness preset audit --json` or `harness preset audit --project --json <target>`
to compare installed preset manifest hashes with bundled presets before deciding
whether to re-seed with `--force`.

## Task Provenance Drift

Preset audit hashes on a task are creation-time provenance. After a task is
created, the task directory is an independent document record, so later changes
to the currently discovered preset do not invalidate historical tasks by
default. Target checks report manifest, version, and resource drift as
`preset-drift-warning` messages so maintainers can see that a task came from an
older preset shape without treating that history as a release-blocking failure.

Current preset execution remains stricter. `harness preset check`,
`harness preset install`, `harness new-task --preset`, and
`harness preset action` still validate the current preset package and require an
explicit current-preset opt-in for sensitive reruns when a task's stored audit
no longer matches the preset being executed.

## Dashboard Management

The Dashboard exposes a Presets view for the target project. Static dashboards
show a read-only catalog of discovered project, user, and bundled presets,
including source, purpose, compatible budgets, task kind, manifest path, and
resource counts.

Use the local dynamic Workbench when you want to manage presets from the web UI:

```bash
harness dev /path/to/project
```

In Workbench mode, the Presets view can check presets, install a local preset
directory, `.zip` archive, or bundled preset id into the project or user scope,
seed bundled presets into either scope, and uninstall project/user presets.
Bundled package presets are immutable from the Dashboard: they can be inspected,
checked, and used as install or seed sources, but not edited or deleted.

The CLI and filesystem remain canonical. The Dashboard calls the same preset
registry operations as `harness preset ...`; it does not store independent preset
state.

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
    path: {{paths.tasksRoot}}/**
    access: write
```

## Task Actions

Use `actions` when a preset needs task-level commands after task creation, such
as closing a workflow stage or generating a preset-owned artifact. Actions run
through the namespaced CLI entrypoint:

```bash
harness preset action custom-review close-stage --task custom-review-task --stage PLAN /path/to/project
```

Action scripts are trusted local Node.js code, not a sandbox. Non-bundled
script actions require explicit trust when installed:

```bash
harness preset install ./custom-review --project --allow-scripts /path/to/project
```

```yaml
actions:
  close-stage:
    type: script
    command: scripts/close-stage.mjs
    taskRequired: true
    inputs:
      stage:
        type: text
        flag: --stage
        required: true
    reads: [{{task.paths.taskPlan}}, {{task.paths.artifacts}}/**]
    writes: [{{task.paths.artifacts}}/stages/**, {{task.paths.progress}}]
    audit: true
```

Action commands must be package-local `.mjs` files. Inputs are schema-only
(`text`, `flag`, or `json-file`), and writes should use `{{task.paths.*}}`
tokens so the action stays scoped to the current task.

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

Runtime paths must use the structure-aware `{{paths.*}}` context instead of
hard-coded `coding-agent-harness/...` strings. Supported path fields include
`harnessRoot`, `planningRoot`, `tasksRoot`, `modulesRoot`, `externalRoot`,
`governanceRoot`, `generatedRoot`, `regressionRoot`, `ledgerPath`, and
`closeoutIndexPath`. Harness resolves them from the target `harness.yaml`.

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
harness preset install ./my-preset.zip
harness preset install ./my-preset --project /path/to/project
harness preset install legacy-migration --force
harness preset seed
harness preset seed --project /path/to/project
harness preset audit --json
harness templates audit --json /path/to/project
harness templates refresh --apply --json /path/to/project
harness preset list --json /path/to/project
harness preset inspect custom-review --json /path/to/project
harness new-task --title "Custom review task" --preset custom-review --subject "API contracts" /path/to/project
harness preset uninstall custom-review
```

## Validation Method

For every preset, prove both the manifest and downstream task behavior:

1. Run `harness preset check ./my-preset`.
2. Install the folder and, if distributing an archive, install the `.zip` into an isolated HOME or disposable environment.
3. Create at least one task with `harness new-task --preset`.
4. For reference bundles, create two different tasks from the same preset and verify both contain the same shared `references/` files and independent audit/evidence bundles.
5. Run `harness status --json`, `harness task-index --json`, and `harness check --profile target-project <target>`.
6. Inspect `task_plan.md` to confirm required reads are visible before implementation starts.

## Boundaries

- Presets cannot write outside declared `writeScopes`.
- Presets do not run arbitrary JavaScript during `new-task`.
- Preset actions may run trusted `.mjs` scripts, but only through
  `harness preset action <preset> <action>` and task-local materialization.
- Reference bundles are task-local snapshots. If the shared upstream context changes later, create a new preset version or a follow-up task rather than silently mutating historical tasks.
- Script and check entrypoints may exist in bundled packages, but the task creation path is YAML + templates + built-in processors.
- Use a new built-in processor only when multiple presets need the same capability and the behavior can be tested centrally.
