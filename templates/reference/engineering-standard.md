# Engineering Standard

## Purpose

Define baseline engineering expectations for code, configuration, tests, and maintainability in this repository.

## Rules

1. Prefer the repository's existing architecture, language, framework, and helper patterns over new abstractions.
2. Keep changes scoped to the task. Do not refactor unrelated code or clean up unrelated files during feature work.
3. Design changes around clear ownership boundaries: module, package, API, data contract, UI surface, or operational script.
4. Treat configuration, migrations, generated artifacts, and scripts as first-class engineering surfaces with review and tests where risk warrants it.
5. Make behavior explicit through typed contracts, structured data, schema validation, or tests rather than fragile string conventions.
6. Avoid hidden global state, broad side effects, and undocumented environment assumptions.
7. Include observability or diagnostics when a failure would otherwise be hard to explain.

## Goal Alignment And No Convenient Substitution

Engineering work must preserve the original user outcome. Do not redefine success around a smaller proxy simply because it is easier to implement, test, or merge.

Required rules:

- A task goal names the requested end state, not only the local engineering action.
- Scope may be narrowed into slices, but evidence-only, comparison-only, adapter-only, or gate-only slices must not be presented as completion of replacement, cutover, rewrite, or retirement work.
- For sidecar rewrites, old code may be used as behavior corpus, oracle fixture, or test comparison only. If active runtime, default paths, package exports, CLI, UI, or production consumers still depend on old code, the rewrite is not complete.
- Passing checks, parity fixtures, gate profiles, consumer scans, or partial deletion evidence proves only the local claim those checks cover.
- If implementation pressure pushes the task toward a bridge, compatibility layer, or transitional adapter that was not the requested outcome, return to planning and record the forbidden substitute before continuing.

## Required Checklist

- Scope and ownership boundary are clear.
- The original user outcome, tempting substitute, and unsupported completion claims are explicit.
- Existing local patterns were followed or the departure is justified.
- User-facing or API-facing behavior has tests or documented verification.
- Error handling covers expected failure modes.
- Configuration and environment assumptions are documented.
- Security, privacy, and data-retention implications were considered when relevant.
- Residual technical debt is recorded with owner and reason.

## Closeout Expectations

Engineering closeout must name the changed surfaces, summarize the behavioral impact, list verification evidence, and identify any residual risk or follow-up that should not be hidden inside implementation notes.
