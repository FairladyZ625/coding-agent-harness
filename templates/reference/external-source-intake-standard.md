# External Source Intake Standard

## Purpose

This standard defines how agents receive, filter, organize, and project large external documentation sets from other projects, microservice teams, or platform owners. The goal is executable context, not a document dump.

## Core Model

```text
external source material -> source pack index -> digest -> 03/04/06 execution projection
```

`03-ARCHITECTURE`, `04-DEVELOPMENT`, and `06-INTEGRATIONS` only hold facts that have been distilled enough to guide work. Raw external files, long documents, screenshots, exported chats, diagrams, and historical packets first go through `docs/04-DEVELOPMENT/external-source-packs/`.

## When To Ask The User

During Diagnose / Decide, the agent must ask whether external source material exists when any of these signals appear:

- The repository is part of a multi-repo, microservice, split frontend/backend, or platform system.
- The code references external services, SDKs, API gateways, message queues, webhooks, contracts, schemas, or mocks.
- The user mentions other repositories, upstream/downstream services, interface docs, business knowledge, or system-level design.
- The agent cannot determine service responsibility, integration contracts, or local debugging behavior from the current repository alone.

Recommended questions:

1. Does this project depend on external services or other repositories?
2. Do you have architecture docs, API docs, diagrams, meeting notes, source links, code paths, or exported packets from those teams?
3. Can those materials be copied into this repository? If not, should the Harness store only local paths or URLs?
4. Which sources are authoritative, and which are historical references only?

## Storage Rules

| Case | Storage |
| --- | --- |
| Only 1-4 stable external documents | No separate source pack is required; link them from `Source Evidence` in the relevant `03/04/06` docs |
| More than 5 documents, multiple topics, or continuing growth | Create `docs/04-DEVELOPMENT/external-source-packs/<source-key>/` |
| Material contains secrets, customer data, private links, or cannot be committed | Do not copy raw files; record external location, owner, access condition, and digest only |
| Material is safe to commit | Raw files may go under `raw/`, but only digested facts may be projected into execution docs |

Recommended structure:

```text
docs/04-DEVELOPMENT/external-source-packs/<source-key>/
├── README.md              # source index and projection status
├── digests/               # digest for each source or source group
├── raw/                   # commit-safe raw material only
└── raw-index.md           # path/URL/owner index when raw material cannot be committed
```

Do not replicate a full `03/04/06` tree for every microservice. The source pack is the intake layer. The stable execution entries remain:

- `docs/03-ARCHITECTURE/service-catalog.md`
- `docs/03-ARCHITECTURE/services/<service-key>.md`
- `docs/04-DEVELOPMENT/external-context/<service-key>.md`
- `docs/06-INTEGRATIONS/<contract>.md`

## Intake Flow

1. **Inventory**: list sources, owners, dates, trust level, and commit eligibility.
2. **Classify**: tag each source as architecture, development, integration, security, operations, product, or unknown.
3. **Sanitize**: check for secrets, tokens, customer data, personal information, internal accounts, and private links; keep non-committable material as references only.
4. **Digest**: extract facts, questions, unsafe assumptions, and evidence with the digest template.
5. **Project**: move stable facts into `03/04/06`, then mark the source as projected in the source pack README.
6. **Verify**: use code evidence, contract tests, owner confirmation, or runtime checks where feasible; update `Last Verified` and `Confidence`.
7. **Residual**: keep unverified or conflicting facts in the source pack or in `Do Not Assume`; do not treat them as execution facts.

## Projection Rules

| Source Content | Projection Target |
| --- | --- |
| Service responsibility, upstream/downstream relationship, owner, data ownership, topology | `03-ARCHITECTURE/service-catalog.md` or `services/<service-key>.md` |
| Local mocks, stubs, startup, debugging, cross-repo development behavior | `04-DEVELOPMENT/external-context/<service-key>.md` |
| Endpoint, payload, auth, error, event, webhook, SDK, contract test | `06-INTEGRATIONS/<contract>.md` |
| Unconfirmed, conflicting, stale, or background-only material | Keep in source pack README / digest; do not project into execution docs |

## Prohibited

- Do not copy large external document sets directly into `03-ARCHITECTURE`, `04-DEVELOPMENT`, or `06-INTEGRATIONS`.
- Do not treat an external-source digest as verified fact without `Source Evidence`, `Last Verified`, and `Confidence`.
- Do not keep long raw excerpts, chat logs, or meeting transcripts inside execution docs.
- Do not commit secrets, production tokens, customer data, personal information, or non-public raw material.
- Do not create one full directory tree per microservice for completeness; create source packs only for large external source sets.
