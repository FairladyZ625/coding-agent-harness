# Architecture

Context Doc Type: architecture-index
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Purpose

This folder is the system-structure source of truth. It explains what the current repository is, what larger system it belongs to, and which services, flows, and decisions matter before an agent changes code.

## Read Order

1. `Architecture-SSoT.md`
2. `local-repo-context.md`
3. `system-map.md`
4. `service-catalog.md`
5. `critical-flows.md`
6. `services/<service-key>.md`
7. `decisions/ADR-*.md`

## Boundary

- Put system structure, service responsibility, ownership, and critical flows here.
- Put payload bodies, endpoint parameters, event schemas, and SDK details in `coding-agent-harness/context/integrations/`.
- Put local setup, mocks, stubs, and cross-repo debugging notes in `coding-agent-harness/context/development/`.

## Structure Contract

| File / Path | Facts to maintain | Write rule |
| --- | --- | --- |
| `Architecture-SSoT.md` | Current architecture state, key decisions, known risks | Only long-lived system facts |
| `local-repo-context.md` | This repository's role and boundary in the wider system | Say what this repo owns and does not own |
| `system-map.md` | Service/module topology, upstream/downstream relationships, deployment boundaries | Use diagrams or tables for global relationships; do not write payload details |
| `service-catalog.md` | Service index; one row per service or microservice | Add a row first, then decide whether a profile file is needed |
| `services/<service-key>.md` | One service's responsibility, data, interface summary, and read-before links | One service per file; do not mix multiple services |
| `critical-flows.md` | Critical cross-service flows | Write business/system flow, not interface field details |

## Microservice Rule

For multi-service systems, `service-catalog.md` is the master index. Every known service should have at least one row. Create `services/<service-key>.md` for any service that affects development, debugging, integration, or task decisions in this repository.

Each `services/<service-key>.md` answers only three questions:

1. What does this service own, including data ownership.
2. How does it relate to this repository.
3. Which `context/development` and `context/integrations` docs must an agent read before changing this repository.

Do not put interface fields, mock instructions, or temporary debugging notes in `context/architecture`. Those belong in `context/integrations` and `context/development`.
