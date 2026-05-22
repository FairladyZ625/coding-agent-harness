# Docs Library Standard

## Purpose

Define how the project documentation library is organized so agents can find current standards, plans, evidence, and historical context without relying on chat history.

## Rules

1. Keep `AGENTS.md` as the routing and charter entry point. Store durable policy in reference documents, not in scattered prompts.
2. Keep active task plans under the planning area and stable operating standards under the reference area.
3. Each durable document must state its purpose, owner or maintenance rule, and when an agent should read it.
4. Link to source artifacts instead of copying long logs or duplicating facts across files.
5. Archive stale records instead of deleting them when they explain historical decisions.
6. Do not mix private runtime state, credentials, personal notes, or generated caches into the public docs library.
7. Documentation updates that change process or behavior must be reflected in the relevant index or routing file.

## Architecture / Development / Integration Routing

Use these directories as a low-entropy context system:

| Directory | Owns | Must Not Own | Required Schema Signals |
| --- | --- | --- | --- |
| `docs/03-ARCHITECTURE/` | system structure, service responsibility, ownership, service catalog, critical flows, ADRs | endpoint payloads, mock instructions, task logs | `Context Doc Type`, `Source Evidence`, `Last Verified`, `Confidence` |
| `docs/04-DEVELOPMENT/` | local setup, codebase map, external development context, external source packs, mocks, stubs, cross-repo debugging | long-lived architecture facts, API payload contracts, undigested external document dumps | `Context Doc Type`, `Development Use`, `Do Not Assume`, `Mocks / Stubs`, `Source Evidence`, `Last Verified`, `Confidence` |
| `docs/06-INTEGRATIONS/` | API/event/webhook/SDK/third-party contracts, auth, payloads, errors, contract tests | global topology, service ownership catalog, debugging notes | `Context Doc Type`, `Contract Type`, `Auth`, `Payload`, `Errors`, `Contract Tests`, `Source Evidence`, `Last Verified`, `Confidence` |

Concrete split:

- `03-ARCHITECTURE/service-catalog.md` gives only the service summary and links.
- `06-INTEGRATIONS/<service>-api-contract.md` owns payload bodies, auth, errors, and contract tests.
- `04-DEVELOPMENT/external-context/<service>.md` owns mocks, stubs, unsafe assumptions, and debug notes.
- `04-DEVELOPMENT/external-source-packs/` owns external source indexes, digests, and projection status only; final facts must be written back to `03/04/06`.

## External Source Intake

If the target project is a microservice, multi-repo system, split frontend/backend repository, or depends on external team documents, the agent must ask the user for external source material during Diagnose / Decide. Small source sets can be linked from `Source Evidence`; large source sets must use `external-source-intake-standard.md` and a source pack.

The fixed processing order is:

```text
Inventory -> Classify -> Sanitize -> Digest -> Project -> Verify -> Residual
```

Raw external material that has not been digested and projected must not become execution fact.

## Required Checklist

- Entry points identify current reference standards, planning templates, SSoT files, walkthroughs, and ledgers.
- Active documents have clear names and stable paths.
- Archive boundaries are documented.
- Generated or private artifacts are excluded or explicitly separated.
- Cross-links point to the source of truth for each subject.
- New standards include closeout and evidence expectations.
- `03/04/06` documents use the required schema signals and route misplaced content back to the correct directory.
- External source packs, when present, have a registry, digests, projection targets, and residuals.

## Closeout Expectations

Documentation closeout must list changed docs, state whether routing indexes were updated, identify any obsolete docs archived or left in place, and record residual documentation gaps.
