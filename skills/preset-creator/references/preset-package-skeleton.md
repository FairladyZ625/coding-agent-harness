# Preset Package Skeleton

Use this reference when creating a Coding Agent Harness preset package. Start from the smallest useful subset, then delete files and manifest sections the preset does not need.

## Copyable Package Tree

```text
my-preset/
  preset.yaml
  templates/
    task_plan.append.md
    references/
      upstream-contract.md
  resources/
    service-runbook.md
    artifacts/
      input-packet.md
```

## Complete Reference Bundle Manifest

```yaml
id: service-context
version: 1
purpose: Create tasks with shared upstream service context
compatibleBudgets: [complex]
localeSupport: [en-US]
task:
  kind: service-integration
  defaultTaskId: service-integration-task
entrypoints:
  newTask:
    type: template
    writes: [docs/09-PLANNING/TASKS/**]
    audit: true
    templates:
      taskPlanAppend: templates/task_plan.append.md
inputs:
  service:
    type: text
    flag: --service
    required: true
templateValues:
  service:
    from: inputs.service
metadata:
  UpstreamService:
    label: Upstream Service
    from: inputs.service
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
  artifacts:
    inputPacket:
      path: artifacts/input-packet.md
      source: resources/artifacts/input-packet.md
      index:
        id: ART-001
        type: fixture
        summary: Shared fixture packet copied by the preset.
        producedBy: preset
context:
  requiredReads: [REF-001, REF-002]
evidence:
  bundleDir: artifacts/preset
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json, preset-manifest.json, write-scope.json]
writeScopes:
  taskDocs:
    path: docs/09-PLANNING/TASKS/**
    access: write
```

## Starter Files

### `templates/task_plan.append.md`

```markdown
## Preset Context

This task depends on {{service}}. Read the preset required references before implementation and cite any behavior that changes the integration contract.
```

### `templates/references/upstream-contract.md`

```markdown
# {{service}} Contract

## Purpose

Record the contract details that every task created by this preset must understand before implementation.

## Required Context

- Service owner:
- Local path or repository:
- API, event, or data boundary:
- Compatibility constraints:
- Known test or smoke command:

## Open Questions

- [question]
```

### `resources/service-runbook.md`

```markdown
# Service Runbook

## Local Setup

- Command:
- Required environment:
- Health check:

## Verification Notes

- Integration smoke:
- Known failure mode:
```

### `resources/artifacts/input-packet.md`

```markdown
# Input Packet

## Fixture Purpose

Describe why this shared input packet exists and which tasks should use it.

## Contents

- [fixture or packet item]
```

## Minimal Non-Resource Preset

Use this smaller manifest when the preset only needs metadata, task-plan guidance, and audit evidence.

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
audit:
  manifestRequired: true
  evidenceFiles: [preset-audit.json, preset-manifest.json, write-scope.json]
writeScopes:
  taskDocs:
    path: docs/09-PLANNING/TASKS/**
    access: write
```

## File And Field Rules

- `id` uses lowercase letters, numbers, and hyphens only.
- `path` for references must stay under `references/`.
- `path` for artifacts must stay under `artifacts/`.
- Do not target `references/INDEX.md`, `artifacts/INDEX.md`, `task_plan.md`, or any canonical task contract file.
- `source` and `template` must point to files inside the preset package, not directories.
- Resource `index.id` values must be unique inside references or artifacts.
- Resource destination paths must be unique across references and artifacts.
- `context.requiredReads` can only list declared reference IDs.
- Keep `entrypoints.newTask.type` as `template`; do not add JavaScript for task creation.
- Keep `writeScopes` narrow and task-doc scoped.

## Verification Checklist

Run these commands in an isolated HOME or disposable target:

```bash
harness preset check ./my-preset
harness preset install ./my-preset --force
harness init --locale en-US --capabilities core /tmp/preset-target
harness new-task first-api --budget complex --preset service-context --service payment-service /tmp/preset-target
harness new-task second-api --budget complex --preset service-context --service payment-service /tmp/preset-target
harness status --json /tmp/preset-target
harness task-index --json /tmp/preset-target
harness check --profile target-project /tmp/preset-target
```

Manually inspect both created tasks:

- `task_plan.md` includes preset metadata and `## Preset Required Reads`.
- `references/INDEX.md` includes every `REF-*` row with a concrete `TARGET:` path.
- `artifacts/INDEX.md` includes every `ART-*` row with a concrete `TARGET:` path.
- The copied or rendered reference files exist under each task directory.
- Evidence bundles are independent per task.
