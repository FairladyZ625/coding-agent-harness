# Development Context

Context Doc Type: development-index
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Purpose

This folder is the development input pack. It tells agents how to work in this repository, how to face external services during development, and what not to assume when the external repositories are unavailable.

## Boundary

- Put local setup, codebase map, external service development summaries, mocks, stubs, and cross-repo debugging here.
- Put long-lived system structure in `docs/03-ARCHITECTURE/`.
- Put concrete API/event/webhook contracts in `docs/06-INTEGRATIONS/`.

## Structure Contract

| File / Path | Facts to maintain | Write rule |
| --- | --- | --- |
| `local-setup.md` | Local startup, dependencies, environment variables, common failures | Development startup facts only; not production architecture |
| `codebase-map.md` | Local code entry points, directory responsibilities, read order | Agents read this before editing code |
| `external-context/<service-key>.md` | External service impact on local development, mocks/stubs, debug entry points | One external service per file |
| `external-source-packs/` | Large external source sets, indexes, digests, and projection status | Intake layer only; not the final fact layer |
| `stubs-and-mocks.md` | Available mock/stub strategies in this repository | Include executable paths or commands |
| `cross-repo-debugging.md` | Cross-repo debugging sequence and evidence | Debug workflow only; not a service responsibility overview |

## External Service Rule

If this repository depends on multiple microservices, do not write all external knowledge into one large document. For any external service that affects local development or testing, create:

- `docs/03-ARCHITECTURE/services/<service-key>.md`: what the service is and what it owns.
- `docs/04-DEVELOPMENT/external-context/<service-key>.md`: how this repository mocks, stubs, or debugs it.
- `docs/06-INTEGRATIONS/<contract>.md`: concrete API/event/webhook contracts.

`04-DEVELOPMENT` only answers how to work with the external service during development. Do not maintain full system topology here, and do not put payload schemas here.

## External Source Pack Rule

If an external team provides many documents, screenshots, exported packets, meeting notes, or links, do not place them directly into `03/04/06`. Read `docs/11-REFERENCE/external-source-intake-standard.md` first, then decide whether `external-source-packs/<source-key>/` is needed.

`external-source-packs/` owns source indexes, digests, and projection status only. Stable conclusions must be written back to:

- `docs/03-ARCHITECTURE/services/<service-key>.md`
- `docs/04-DEVELOPMENT/external-context/<service-key>.md`
- `docs/06-INTEGRATIONS/<contract>.md`

## External Context Index

| Service Key | Why It Matters To This Repo | Local Stub / Mock | Debug Entry | Architecture Link | Contract Link | Last Verified | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
