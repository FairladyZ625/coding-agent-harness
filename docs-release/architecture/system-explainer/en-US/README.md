# Coding Agent Harness — Architecture Explainer

This set of documents helps you understand the system architecture of `coding-agent-harness`.
Whether you want to contribute code, integrate it into your own project, or just figure out
"how does this thing actually work" — this is the best place to start.

Each document uses a **top-down, layer-by-layer** approach: it gives you a big picture first
to build an overall mental model, then dives into each module. You can stop at any layer —
you don't need to read every detail.

---

## Why these docs exist

The `coding-agent-harness` codebase itself isn't complex, but its **design intent** isn't
easy to read directly from the code.

For example:
- Why is state stored in Markdown files instead of a database?
- Why are there three check profiles instead of one?
- What's the difference between `governance-sync` and `governance rebuild`, and why are they separate?
- Why must `review-confirm` be a manual operation — why can't it be automated?

The answers to these questions are scattered across design decisions, historical evolution,
and operating standards. These docs bring them together so you can understand the system's
"why" without digging through git log.

---

## Reading order

Reading in order works best, about 15-25 minutes per doc:

| File | Topic | What you'll understand |
| --- | --- | --- |
| [01-system-overview.md](01-system-overview.md) | System overview | What this is, what problem it solves, what the four main blocks do |
| [02-module-dependency.md](02-module-dependency.md) | Code modules | How the CLI dispatches, how the 30+ modules in lib/ are layered, dependency relationships |
| [03-task-lifecycle.md](03-task-lifecycle.md) | Task lifecycle | The full flow of a task from creation to closeout, gates, and the queue system |
| [04-check-and-governance.md](04-check-and-governance.md) | Check system | Three profiles, what each of the 9 validators checks, how governance indexes are rebuilt |
| [05-data-flow.md](05-data-flow.md) | Data flow | How Markdown files become a Dashboard, the boundary between two generation modes |
| [06-preset-and-migration.md](06-preset-and-migration.md) | Preset and migration | Preset package structure and entrypoint type system, three phases of legacy project migration |

---

## Document conventions

Each file uses `Level 0 / 1 / 2 / 3` to mark depth:

- **Level 0**: Highest level, 3-5 big blocks, builds overall understanding (required reading)
- **Level 1**: Expands the blocks, shows sub-modules (recommended)
- **Level 2**: Dives into sub-modules, explains internal logic (read as needed)
- **Level 3**: Most detailed, function-level flows (reference use)

You can stop at Level 1 and go deeper only when you need to.

---

## Quick lookup

If you have a specific question, jump directly to the relevant file:

| I want to know… | Go to |
| --- | --- |
| What problem this system solves | [01 — System overview](01-system-overview.md) |
| What `harness check` validates | [04 — Check system](04-check-and-governance.md) |
| What a task's `review` state means | [03 — Task lifecycle](03-task-lifecycle.md) |
| Where Dashboard data comes from | [05 — Data flow](05-data-flow.md) |
| How to write a Preset | [06 — Preset and migration](06-preset-and-migration.md) |
| What a module in the code does | [02 — Code modules](02-module-dependency.md) |
| How to migrate a legacy project | [06 — Preset and migration](06-preset-and-migration.md) |
