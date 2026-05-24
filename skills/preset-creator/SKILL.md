---
name: preset-creator
description: Create a Coding Agent Harness preset package using the declarative YAML and template format.
---

# Preset Creator

Use this skill when a user wants to create, review, or install a Harness preset.

## Workflow

1. Ask for the preset purpose, target task budget, task kind, and required CLI inputs.
2. Create a preset directory containing `preset.yaml` and any Markdown templates.
3. Keep task creation declarative: manifest inputs, `templateValues`, Markdown templates, evidence declarations, and `writeScopes`.
4. Do not add JavaScript for `new-task` behavior. If behavior needs code, identify the missing reusable built-in processor and stop for design review.
5. Run `harness preset check <path>` before installing.
6. Install with `harness preset install <path>`.
7. Smoke test with `harness new-task <id> --preset <preset-id> ... <target>`.

## Required Manifest Sections

- `id`
- `version`
- `purpose`
- `compatibleBudgets`
- `task.kind`
- `entrypoints.newTask`
- `inputs` when the preset needs CLI values
- `templateValues` when templates need resolved values
- `metadata` when task plans need first-class `Label: value` metadata lines
- `evidence.files`
- `audit.manifestRequired`
- `writeScopes`

## Manifest Format

Use the Harness manifest subset only: nested mappings, scalar strings/numbers/booleans, and inline arrays such as `[standard, complex]`. Do not use block strings or dash-list YAML forms.

`templateValues` and `metadata` may use literal `value`, `default`, or dot-path `from` references such as `inputs.subject` or `task.title`. Do not use expressions or inline code.

## Safety Rules

- `writeScopes` must be as narrow as possible.
- Evidence should live under the created task directory.
- A preset must not mutate source code, Git state, or global governance tables during `new-task`.
- User-installed presets live in `~/.coding-agent-harness/presets/<preset-id>/`.
