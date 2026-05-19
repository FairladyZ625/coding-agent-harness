# Coding Agent Harness Docs Release

This directory is the public-facing documentation library for Coding Agent Harness.
It is separate from the repository's private self-hosted harness.

## Boundary

Public docs in this directory explain the product architecture, concepts, and release
roadmap. They must not contain private task ledgers, local review drafts, internal
handoffs, or user/project-specific operating state.

Private operating state for this repository lives in `.harness-private/`, which is
ignored by the open-source repository and versioned separately.

## Current Public Docs

- `architecture/overview.md` — public architecture overview.
- `architecture/release-roadmap.md` — v1.0 to v2.0 release line.
- `guides/agent-installation.md` — operational installation guide for target-project agents.
- `release/v1.0-document-kernel-plan.md` — public v1.0 execution scope.
- `release/v1.0-final-check-cn.md` — Chinese final-check walkthrough for v1.0.
- `release/v1.0-visual-roadmap-cn.md` — Chinese visual roadmap for final review.

## Rule

If a document tells users how the harness works, it belongs here or under
`references/`.

If a document records how this repository is being operated, reviewed, migrated, or
closed out, it belongs in `.harness-private/`.
