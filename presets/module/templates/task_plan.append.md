## Module Preset

This module task was created through the `module` preset.

| Field | Value |
| --- | --- |
| Module Key | {{moduleKey}} |

### Goal Alignment Challenge

Before implementation, answer from the original user request and module plan, not from the easiest local slice. Do not start implementation while this table contains placeholders.

| Question | Answer / Evidence |
| --- | --- |
| What original user outcome must remain true? | `[final state requested by the user; not the easiest local proxy]` |
| Does this module task directly make that outcome more true? | `yes/no; explain the causal link from this slice to the original outcome` |
| What easier substitute would be tempting? | `[adapter wiring, parity evidence, gate profile, comparison mode, partial shrink, docs-only claim, or other proxy]` |
| What must not be claimed when this task is done? | `[completion/cutover/rewrite/retirement claims that this slice cannot honestly support]` |
| If this is evidence-only/parity/comparison/gate-profile work, why is it not counted as cutover or completion? | `[reason or n/a]` |
| If this is rewrite/retirement/cutover work, what production/default path change or deletion evidence proves replacement? | `[default path, package/export, consumer removal, old-path deletion, no-production-dependency evidence, or n/a]` |

## Module Context Entry Points

Read these module-level entry points before changing shared module behavior. Continue into narrower context only when the task surface requires it.

| Reference | Path | Why / When |
| --- | --- | --- |
| Module brief | {{paths.harnessRoot}}/planning/modules/{{moduleKey}}/brief.md | Start here for the module purpose and current scope. |
| Module plan | {{paths.harnessRoot}}/planning/modules/{{moduleKey}}/module_plan.md | Use this for module steps, active task links, and handoff state. |
| Module visual map | {{paths.harnessRoot}}/planning/modules/{{moduleKey}}/visual_map.md | Inspect when the change affects module sequencing or dependencies. |
