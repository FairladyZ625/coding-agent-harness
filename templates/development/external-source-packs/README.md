# External Source Packs

Context Doc Type: external-source-pack-registry
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Purpose

This directory is only for external source intake, indexing, and digests. Stable facts become Harness execution context only after they are projected into `03-ARCHITECTURE`, `04-DEVELOPMENT/external-context`, or `06-INTEGRATIONS`.

Read `docs/11-REFERENCE/external-source-intake-standard.md` before adding a source pack.

## Source Packs

| Source Key | External Project / Service | Raw Storage Mode | Source Count | Digest Status | Projected To 03/04/06 | Owner | Last Verified | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Placement Rule

- If there are fewer than 5 source documents, prefer linking them from `Source Evidence` in `03/04/06`; a source pack may be unnecessary.
- If the material is large, multi-topic, or expected to grow, create `<source-key>/README.md` and `digests/`.
- `raw/` may contain only commit-safe material with no secrets, personal data, or customer data.
- Non-committable material should be represented by external path, owner, access condition, and digest only.
