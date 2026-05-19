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

## Required Checklist

- Scope and ownership boundary are clear.
- Existing local patterns were followed or the departure is justified.
- User-facing or API-facing behavior has tests or documented verification.
- Error handling covers expected failure modes.
- Configuration and environment assumptions are documented.
- Security, privacy, and data-retention implications were considered when relevant.
- Residual technical debt is recorded with owner and reason.

## Closeout Expectations

Engineering closeout must name the changed surfaces, summarize the behavioral impact, list verification evidence, and identify any residual risk or follow-up that should not be hidden inside implementation notes.
