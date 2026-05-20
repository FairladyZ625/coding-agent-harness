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
- Put payload bodies, endpoint parameters, event schemas, and SDK details in `docs/06-INTEGRATIONS/`.
- Put local setup, mocks, stubs, and cross-repo debugging notes in `docs/04-DEVELOPMENT/`.
