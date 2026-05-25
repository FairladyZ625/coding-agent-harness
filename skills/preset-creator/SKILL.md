---
name: preset-creator
description: Create a Coding Agent Harness preset package using the declarative YAML, template, evidence, and reference bundle format.
---

# Preset Creator

Use this skill when a user wants to create, review, improve, or install a Harness preset.

A good preset is not just a folder template. It is a reusable task method package: it captures when a class of tasks should exist, what inputs the agent must ask for, what task metadata must be visible, what shared references must be read, what evidence must be produced, and how the created task proves it is using the preset correctly.

## Preset Methodology

Create a preset when at least two future tasks should share the same method or context. Good examples:

- A group of API tasks all depend on the same upstream microservice contract.
- Migration tasks all need the same baseline session evidence and cutover rules.
- Review tasks all need the same reviewer input packet and required evidence.
- Repeated lesson-sedimentation tasks need the same prompt, metadata, and audit trail.

Do not create a preset for a one-off task. Do not use a preset to hide vague requirements. If the task family is not repeatable yet, write a normal task first and extract the preset after the second or third repetition.

## Design Questions

Before writing files, answer these in the task notes or your response:

1. What family of tasks will this preset create?
2. What task budget is required: `standard` or `complex`?
3. What `task.kind` should downstream scanners see?
4. What inputs must the user or agent provide as CLI flags?
5. What metadata lines must appear in `task_plan.md`?
6. What templates should be appended to task files?
7. What evidence or audit files should be generated?
8. What shared references should every preset-created task read first?
9. What write scopes are strictly necessary?
10. How will you prove a task created by this preset is recognized by `status --json` and `task-index --json`?

## Package Layout

Use the reference skeleton before writing files:

- `references/preset-package-skeleton.md`

That reference contains a copyable package tree, a complete `preset.yaml`, starter Markdown resources, and the verification checklist. Keep this `SKILL.md` focused on method and judgment; use the reference when the task has moved from design to file creation.

Use a simple package:

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

## Required Manifest Sections

- `id`: lowercase letters, numbers, and hyphens.
- `version`: integer; increment when generated task behavior changes.
- `purpose`: one sentence explaining the repeatable method.
- `compatibleBudgets`: usually `[complex]` when the preset creates references or artifacts.
- `task.kind`: stable scanner-facing task kind.
- `entrypoints.newTask`: always declarative for task creation.
- `inputs`: CLI flags when the preset needs user-provided values.
- `templateValues`: values used by templates.
- `metadata`: first-class `Label: value` lines in `task_plan.md`.
- `resources.references`: shared task-local reference files, when tasks share context.
- `resources.artifacts`: preset-provided fixtures or input packets, when needed.
- `context.requiredReads`: reference IDs the agent must read before implementation.
- `evidence.files`: generated audit/evidence files.
- `audit.manifestRequired`: must be `true`.
- `writeScopes`: narrow paths the preset may write.

## Manifest Format

Use the Harness manifest subset only: nested mappings, scalar strings/numbers/booleans, and inline arrays such as `[standard, complex]`. Do not use block strings or dash-list YAML forms.

`templateValues` and `metadata` may use literal `value`, `default`, or dot-path `from` references such as `inputs.subject` or `task.title`. Do not use expressions or inline code.

Templates and resource index summaries can use `{{valueName}}` placeholders from `templateValues`.

## Reference Bundle Pattern

Use `resources.references` when the preset should preload common context for a group of tasks.

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

Use `template` for Markdown that needs substitution. Use `source` for static files copied from the preset package. The created task should read like this: `task_plan.md` tells the agent which `REF-*` entries to read, `references/INDEX.md` explains why each file matters, and the actual `references/*.md` files contain the context.

## Artifact Bundle Pattern

Use `resources.artifacts` for preset-provided support material that is not a source reference:

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

Do not confuse artifacts with evidence. Artifacts can be input packets or fixtures. Evidence proves what happened, such as `preset-audit.json`, `preset-manifest.json`, command output, or verification results.

## Safety Rules

- `writeScopes` must be as narrow as possible.
- Generated files must stay under the created task directory.
- A preset must not mutate source code, Git state, or global governance tables during `new-task`.
- Do not add JavaScript for `new-task` behavior.
- If behavior needs code, identify the missing reusable built-in processor and stop for design review.
- Reference bundles are task-local snapshots. Do not silently mutate historical tasks when a preset package changes.
- User-installed presets live in `~/.coding-agent-harness/presets/<preset-id>/`.

## Creation Workflow

1. Ask or infer the preset purpose, task family, target budget, task kind, required inputs, shared references, and evidence needs.
2. Open `references/preset-package-skeleton.md` and copy only the files the preset actually needs.
3. Create the preset directory with `preset.yaml`, templates, and resources.
4. Keep task creation declarative: manifest inputs, `templateValues`, `metadata`, Markdown templates, `resources`, evidence declarations, and `writeScopes`.
5. Run `harness preset check <path>`.
6. Install with `harness preset install <path> --force` in a disposable or user-approved environment.
7. Smoke test with `harness new-task <id> --budget <budget> --preset <preset-id> ... <target>`.
8. For reference-bundle presets, create two different tasks from the same preset and verify both contain the same shared references but independent audit/evidence bundles.
9. Run `harness status --json <target>`, `harness task-index --json <target>`, and `harness check --profile target-project <target>`.
10. Inspect the generated `task_plan.md`, `references/INDEX.md`, and `artifacts/INDEX.md` manually before declaring success.

## Quality Checklist

- The preset name describes a task method, not a single task.
- The generated task can be understood from files alone, without the original chat.
- `task_plan.md` contains enough context for the next agent to know what to read first.
- Every required read points to a real `REF-*` row.
- Every `REF-*` row explains why that reference matters.
- Every generated artifact has an `ART-*` row when artifacts are used.
- The preset passes `preset check`, task creation, `status --json`, `task-index --json`, and target check.
- A downstream agent can create a valid preset from this skill without editing Harness source.
