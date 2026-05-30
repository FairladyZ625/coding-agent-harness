# Lite Skill Overlay Source

Compatibility matrix version: `document-contract-kernel-v0.5`.

This source is for a future document-only Lite Skill. Lite keeps the shared
Document Contract Kernel concepts and removes runtime product surfaces.

## Positioning

Lite helps an agent set up and maintain a small project work protocol through
plain repository documents. It is document-only: the agent reads, writes, and
reviews project files directly.

## Required Lite Surfaces

- `AGENTS.md` as the agent entry protocol.
- `context/` for stable project facts.
- `tasks/` for reviewable task packages.
- `brief.md`, `task_plan.md`, `progress.md`, and `walkthrough.md` in each task.
- Optional `review.md`, `visual_map.md`, `regression.md`, and `lessons.md` when
  the project needs them.

## Lite Operating Rules

- Keep all state human-readable and hand-maintainable.
- Do not require a project manifest.
- Do not require machine-produced project state.
- Treat missing review or visual material as adoption-needed if the project
  later moves to the larger product.
- Keep upgrade notes short and link back to the compatibility matrix version.

## Upgrade Note

If the project later needs the larger Full Coding Agent Harness product, keep the
Lite documents as migration input. The shared document semantics are preserved so
an agent can map Lite task packages and context into the Full structure during an
explicit migration task.
