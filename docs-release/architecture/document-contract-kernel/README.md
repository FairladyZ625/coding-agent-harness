# Document Contract Kernel

The Document Contract Kernel is the product and Skill contract shared by the
Full Coding Agent Harness Skill and the future Lite Skill. It defines the stable
document semantics that both product surfaces must preserve without turning Lite
into a runtime mode or forcing Full to lower its automation and audit bar.

This contract is public source material. Full and Lite Skill text should be
generated from this shared source plus product overlays. Until a generator is
introduced, changes to the concepts or compatibility matrix must update this
file and the product overlays in the same change.

## Kernel Naming Boundary

| Name | Layer | Responsibility | Must not do |
| --- | --- | --- | --- |
| Document Contract Kernel | Product / Skill contract | Shared document semantics, Lite/Full compatibility matrix, change classification, and upgrade mapping | Implement runtime behavior, read or write files, or define git, markdown, or path utilities |
| Domain Kernel | Runtime domain | Task identity, policy, state transitions, module ownership, and preset model | Describe Skill installation copy, package manager commands, UI text, or git transport |
| Infrastructure Kernel | Runtime infrastructure | Filesystem, path, template, markdown, git, date, id, and locale helpers | Own business semantics or product distribution semantics |

Always write the full name "Document Contract Kernel" in source and docs. Do not
shorten it to a generic `kernel/` label; that collides with later runtime
refactoring work.

## Shared Concepts

| Concept | Kernel semantic | Lite expression | Full expression |
| --- | --- | --- | --- |
| Agent entry | The first project protocol an agent reads before acting | `AGENTS.md` | `AGENTS.md` plus optional `CLAUDE.md` shim |
| Project context | Durable project facts, separate from chat memory | `context/architecture`, `context/development`, `context/integrations` | Same directories, with optional source packs and generated indexes |
| Task package | The smallest reviewable unit of work for one objective | `tasks/<id>/brief.md`, `task_plan.md`, `progress.md`, `walkthrough.md` | `planning/tasks/<id>/` or module task package |
| Brief | Purpose, scope, and first-read entry for the task | Required | Required |
| Task plan | Goal, scope, steps, acceptance criteria, and verification intent | Required | Required |
| Progress evidence | Execution log with evidence references | Required, hand-maintained | Required, may be updated by lifecycle command |
| Review | Independent review or human confirmation material | Optional | Required for standard and complex work |
| Visual map | Phase, state, and structure aid | Optional for simple work | Required in CLI-created task packages |
| Walkthrough | Closeout summary, validation, residual risks, and lesson decision | Required | Required |
| Regression | The project's important validation surfaces | Simple checklist | Regression SSoT, cadence, and checks |
| Lessons | Reusable learning from the work | Optional `lessons.md` | Lesson candidates plus promoted lesson details |

## Compatibility Matrix

Compatibility matrix version: `document-contract-kernel-v0.5`.

| Surface | Lite | Full | Kernel classification |
| --- | --- | --- | --- |
| `AGENTS.md` | Required | Required | Shared |
| `CLAUDE.md` | Optional shim | Optional shim | Shared optional |
| `context/` | Required | Required | Shared |
| `brief.md` | Required | Required | Shared |
| `task_plan.md` | Required | Required | Shared |
| `progress.md` | Required | Required | Shared |
| `walkthrough.md` | Required | Required | Shared |
| `review.md` | Optional | Required for standard and complex work | Shared with profile differences |
| `visual_map.md` | Optional for simple work | Required in CLI-created task packages | Shared with profile differences |
| `regression.md` | Simple checklist | Regression SSoT and cadence | Shared with profile differences |
| `lessons.md` | Optional simple table | Lesson candidates and promoted details | Shared with profile differences |
| `harness.yaml` | Forbidden | Required | Full-only |
| Generated ledger | Forbidden | Supported | Full-only |
| Dashboard / Workbench | Forbidden | Supported | Full-only |
| Preset | Forbidden | Supported | Full-only |
| Module Registry | Forbidden | Supported | Full-only |
| Lifecycle CLI commands | Forbidden | Supported | Full-only |
| `npm install` / `npx coding-agent-harness` | Forbidden | Allowed with user consent | Full-only |
| Node.js version requirement | Forbidden | Required by the source package and runtime | Full-only |

## Change Classification

Every PR or task that edits Skill, template, or public product docs must be
classified before implementation.

| Change type | Definition | Must sync | Must not do |
| --- | --- | --- | --- |
| Kernel change | Changes the base semantics of AGENTS, context, task package, progress, walkthrough, review, regression, or lessons | Lite overlay, Full overlay, and this compatibility matrix | Update only the Full Skill |
| Full-only change | CLI, Dashboard, Preset, module registry, generated ledger, transaction, migration, or runtime automation | Full Skill, runtime docs, and Full overlay | Leak into Lite source |
| Lite-only change | Document-only scaffold, lower cognitive load wording, and hand-maintained task material | Lite overlay | Weaken Full audit or automation requirements |
| Migration bridge | Maps Lite project material into a Full Harness project | Full migration docs and Lite upgrade note | Promise that Lite supports Full surfaces in place |

PR checklist:

- [ ] Does this change alter the Document Contract Kernel?
- [ ] If yes, did Lite and Full overlays both change?
- [ ] If yes, did the compatibility matrix version or content change?
- [ ] If Full-only, does the Lite forbidden-surface check still pass?
- [ ] If Lite-only, did Full retain its review, regression, and automation requirements?

## Lite Forbidden Surfaces

Lite is a document-only Skill surface. It must not contain product or runtime
surfaces that imply package installation, CLI operation, dashboard operation,
preset execution, generated governance, module registry ownership, lifecycle
commands, or a Node.js runtime requirement.

The canonical blocked pattern list is
`docs-release/architecture/document-contract-kernel/products/lite-forbidden-surfaces.txt`.
Run the guard with:

```bash
node scripts/check-lite-forbidden-surfaces.mts
```

The guard scans Lite product source files only. It intentionally does not scan
this contract document or the forbidden pattern list, because those files must
name Full-only surfaces to define the boundary.

## Lite to Full Upgrade Path

A Lite project can be used as migration input for Full Harness adoption. Lite
does not promise that Full runtime adapters can read or update its files in
place.

1. Read Lite `AGENTS.md`, `context/`, `tasks/`, `regression.md`, and `lessons.md`.
2. Create the Full harness manifest and v2 directory structure.
3. Map `tasks/<id>/` into Full `planning/tasks/<id>/`.
4. If `review.md` or `visual_map.md` is missing, create adoption-needed follow-up
   work or fill it within an approved migration budget.
5. Project Lite `regression.md` into Regression SSoT.
6. Project Lite `lessons.md` into lesson candidates, not promoted lesson details.
7. Run Full migration and check evidence before claiming Full adoption.

## Source, Overlay, Generator Path

The maintainable target is shared source plus product overlays:

```text
docs-release/architecture/document-contract-kernel/
  README.md
  products/
    lite-skill-overlay.md
    full-skill-overlay.md
    lite-forbidden-surfaces.txt
```

Future generator shape:

1. Render this shared Document Contract Kernel source.
2. Apply the Full or Lite product overlay.
3. Stamp the compatibility matrix version into the generated Skill.
4. Run Lite forbidden-surface checks after Lite render.
5. Run Full concept coverage checks after Full render.

Generated targets should be:

```text
SKILL.md
skills/coding-agent-harness-lite/SKILL.md
```

The Lite target is not created in Phase 0.5. This phase establishes the public
contract and drift guard that a later Lite implementation must use.
