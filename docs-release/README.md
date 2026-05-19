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
- `guides/agent-installation.md` — operational installation guide for target-project agents.
- `guides/migration-playbook.md` — smooth migration guide for existing legacy harness projects.

Release roadmaps, staged plans, task execution strategy, final-check walkthroughs,
and maintainer publishing notes are project operating state. Keep them in
`.harness-private/`, not in this public documentation tree.

## Rule

If a document tells users how the harness works, it belongs here or under
`references/`.

If a document records how this repository is being operated, reviewed, migrated, or
closed out, it belongs in `.harness-private/`.
