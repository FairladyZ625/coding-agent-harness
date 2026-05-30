# Full Skill Overlay Source

Compatibility matrix version: `document-contract-kernel-v0.5`.

The Full Skill keeps all Document Contract Kernel concepts and adds Full-only
automation, governance, migration, and runtime surfaces. Full must not copy or
fork the shared task semantics by hand.

## Shared Kernel Dependency

Full task packages, context documents, progress evidence, reviews,
walkthroughs, regression records, and lessons must stay compatible with the
Document Contract Kernel compatibility matrix.

## Full-only Surfaces

Full-only sections may describe package installation, CLI commands, Dashboard,
Workbench, Preset behavior, generated ledger files, Module Registry, lifecycle
commands, runtime checks, and source package requirements.

These sections must remain explicitly Full-only so later Lite generation can
exclude them without weakening Full's audit requirements.

## Coverage Rule

When a Full Skill edit changes the semantics of AGENTS, context, task package,
progress evidence, review, walkthrough, regression, or lessons, classify it as a
Kernel change and update the shared contract plus the Lite overlay in the same
task.
