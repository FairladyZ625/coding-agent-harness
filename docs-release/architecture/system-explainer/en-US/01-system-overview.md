# 01 — System Overview

## What this is and what problem it solves

Before AI coding tools (Codex, Claude Code, Gemini CLI) became widespread,
"task management" for developers meant Jira tickets or GitHub issues —
tools designed for humans that Agents can't read and can't derive verifiable state from.

**Coding Agent Harness** solves a core problem:

> When an Agent is working in your repository, how do you ensure its work is traceable,
> gated, and reviewable?

It's not an Agent itself, and it's not a task management tool for humans.
It's a **repository-native operating layer** — it gives Agents executable structured context
so they can resume execution from files without relying on previous chat memory.

The core design philosophy in one sentence:

> **Store important state in Markdown files that Agents can read, then use the CLI to derive
> status, checks, migration plans, and Dashboard views from those files.**

---

## Why it's called a "Harness"

"Harness" in an engineering context means a constraining device — something used to constrain,
guide, and measure a system's behavior without replacing it. Just like a "test harness" in
testing isn't the tests themselves, but the infrastructure that lets tests be organized,
executed, and verified.

Coding Agent Harness isn't a replacement for Agents — it's a harness for them:
- Tasks have a lifecycle (create → execute → review → closeout)
- Reviews have gates (Agents can't approve their own work)
- State is recorded (every change is written to Markdown, git-blammable)
- Humans have a review entry point (local Dashboard + Workbench review confirmation)

---

## The essential difference from Jira / Linear / GitHub Issues

| | Jira / Linear / GitHub Issues | Coding Agent Harness |
| --- | --- | --- |
| Designed for | Human collaboration | Agent execution + human review |
| State lives in | External SaaS database | Markdown files in the repository |
| Can Agents read it? | Requires API integration | Read files directly |
| Can you git diff it? | No | Yes |
| Works offline? | No | Yes |
| Can resume execution from files? | No | Yes |

---

## Level 0 — Four main blocks

Start at the highest level. The whole system is made up of four blocks:

```mermaid
flowchart LR
  A["📦 Package\nPublished npm package\n(CLI + templates + standards + Presets)"]
  B["📁 Target Repo\nUser's project repository\n(Harness workspace + state files)"]
  C["⚙️ Runtime\nRuntime engine\n(command registry + use cases + projection views)"]
  D["👤 Human\nHuman review entry point\n(Dashboard + review confirmation)"]

  A -->|"scaffold + validate"| B
  B -->|"read"| C
  C -->|"generate"| D
  D -->|"workbench confirmation"| B
```

- **Package**: What you `npm install` — contains the CLI, templates, standards docs, and Preset packages
- **Target Repo**: Your project, where harness creates a `coding-agent-harness/` workspace to record task state
- **Runtime**: The CLI runtime that uses command definitions, application use cases, repository ports, and semantic projections to produce reviewable views
- **Human**: Views the Dashboard in a browser, performs review confirmation in the Workbench

Note the direction of this loop: **Package writes to Target Repo, Runtime reads from Target Repo,
Human writes back to Target Repo through Workbench confirmation**.
The whole system is a read-write loop centered on Markdown files, with no hidden state.

---

## Level 1 — What's inside each block

### What's in the Package

```mermaid
flowchart TD
  PKG["📦 Package\ncoding-agent-harness@npm"]

  PKG --> CLI["harness CLI\ndist/harness.mjs\nSingle command entry point"]
  PKG --> Lib["Core library\nscripts/lib/\ncommand registry + application use cases + domain kernel"]
  PKG --> Templates["Templates\ntemplates/\nTask scaffolds + module-root templates"]
  PKG --> References["Operating standards\nreferences/\nSpec docs that can be copied to target repos"]
  PKG --> Presets["Preset packages\npresets/\nReusable task methods (legacy-migration / module etc.)"]
```

The Package is **read-only** — it provides tools and templates but stores no state.
All state lives in the Target Repo.

### What's in the Target Repo

```mermaid
flowchart TD
  REPO["📁 Target Repo\nYour project repository"]

  REPO --> Entry["AGENTS.md\nAgent entry point and routing\n(tells Agents where to find context)"]
  REPO --> Manifest["coding-agent-harness/harness.yaml\nEnabled capabilities and structure"]
  REPO --> Harness["coding-agent-harness/\nHarness workspace"]
  REPO -.-> LegacyDocs["docs/\nLegacy migration input\nnot current runtime state"]

  Harness --> Planning["planning/\nTask directory + module directory"]
  Harness --> Ledger["governance/generated/Harness-Ledger.md\nGlobal ledger (all tasks summarized)"]
  Harness --> Walkthrough["task-local walkthrough.md\nCloseout evidence"]
  Harness --> Reference["governance/standards/\nLocal operating standards (copied from Package)"]
  Harness --> Governance["governance/lessons/\nLesson library"]
  LegacyDocs -.-> Migration["legacy migration\nread only as migration evidence"]
```

Each task corresponds to a directory under `coding-agent-harness/planning/tasks/<task-id>/`,
containing files like `task_plan.md`, `progress.md`, `visual_map.md`, `review.md`, etc.
Modules are registered in `harness.yaml` `modules.items`. A module root owns
only `brief.md` and `module_plan.md` by default, while module tasks live under
`coding-agent-harness/planning/modules/<key>/tasks/<task-id>/`.

If the target repository still has a root `docs/` tree, treat it as legacy
migration input or historical evidence. It is not the v2 runtime source for
Reference docs or project standards.

### What the Runtime does

```mermaid
flowchart TD
  RT["⚙️ Runtime\nharness CLI runtime"]

  RT --> Commands["Command registry\nCommandDefinition[] binds CLI actions"]
  RT --> UseCases["Application use cases\nTaskOperations orchestrates lifecycle and review"]
  RT --> Ports["Ports\ninternal task readers / HarnessTransaction isolate filesystem writes"]
  RT --> Projection["Semantic projection\nTaskLifecycleProjection / DashboardTaskView"]
  RT --> Render["Generate\nOutput Dashboard HTML + JSON index\nOutput governance index tables"]
```

The Runtime is **stateless** — every run re-reads from Markdown files from scratch.
Dashboard, Workbench queues, and governance indexes are derived projection views
from task source files, not a second source of truth.
Runtime internals such as repository readers, scanner adapters, and generated
`dist/lib/*` modules are not the public package API. Public use goes through the
`harness` CLI, bundled presets, templates, and generated views.

---

## Level 2 — Core concept glossary

| Concept | One-line explanation | Where |
| --- | --- | --- |
| **Task** | A unit of work with a lifecycle | `coding-agent-harness/planning/tasks/<id>/` |
| **Budget** | Task complexity: `simple` / `standard` / `complex`, determines gate strictness | `task_plan.md` |
| **Phase** | An execution phase in the Visual Map, with state and completion | `visual_map.md` |
| **Capability** | Optional feature module, e.g. `dashboard`, `module-parallel` | `coding-agent-harness/harness.yaml` |
| **Module** | YAML-registered parallel work domain with owner, scope, dependencies, and task grouping | `harness.yaml modules.items` + `planning/modules/<key>/` |
| **Review Gate** | A review gate that blocks task completion, requires human confirmation to pass | `review.md` |
| **Governance Sync** | Atomic operation that auto-updates the global ledger on task state changes | `coding-agent-harness/governance/generated/Harness-Ledger.md` |
| **Preset** | A reusable task method package, e.g. `legacy-migration`, `module` | `presets/<id>/` |
| **Lesson** | Reusable knowledge distilled from a task | `coding-agent-harness/governance/lessons/` |
| **Tombstone** | Marker for soft-deleted / merged / superseded tasks | Special block in `task_plan.md` |
| **lifecycleState** | Queue classification derived from task state + review state combined | Derived at runtime, not stored in files |

---

## Level 2 — Design decisions

### Why Markdown instead of a database

This is the most frequently asked question.

**Reasons for choosing Markdown**:

1. **Agent-readable**: All major AI coding tools can read and write Markdown without special APIs
2. **Git-native**: State changes can be diffed, blamed, and rolled back — audit trail is built in
3. **Human-readable**: State can be viewed directly without tools, reducing tool dependency
4. **Works offline**: No external service dependency, works without network
5. **Portable**: Switching Agent tools doesn't require data migration
6. **Single source of truth**: Avoids drift between Markdown, JSON, and SQLite as three separate facts

**Trade-offs**:

- Parsing Markdown is slower than querying a database (but not a bottleneck at task management scale)
- Format constraints must be maintained by validators rather than enforced by database schema
- Concurrent writes need file locking (`governance-sync` lock mechanism)

**Alternatives considered and rejected**:
- **SQLite**: Not git-diff-friendly, introduces binary files, and current scale (hundreds of tasks) doesn't need it
- **JSON**: Good for machine parsing but not for Agents understanding narrative context
- **YAML/TOML**: Not suited for carrying long-form content like briefs and execution strategies

### Why an npm package instead of SaaS

Agents need to read and write state on the local filesystem. SaaS would introduce network
dependency, authentication, and latency, breaking Agents' autonomous execution capability.
An npm package lets any environment that can run Node.js use it directly, with no account
or network required. `package.json` `dependencies` is empty — zero runtime dependencies.

### Why human confirmation must stay in Workbench

Human confirmation is the **only operation in the system that is not exposed to Agents
as a regular CLI command**.

The reason:

> Agents cannot approve their own work.

This boundary wasn't there from the start. Initially the Dashboard workbench review action
had no Agent/Human distinction. Later, through competitive analysis (Taskr competitive intake),
"Agent auto-confirming review" was identified as a P0 risk, which led to introducing the
Workbench write endpoint and Git commit gate: Dashboard workbench writes human confirmation audit fields with Git
`user.name` / `user.email` to the task `INDEX.md`, and makes two atomic Git commits:
the first commits the confirmation fields, and the second commits the final audit
record containing the first commit's SHA.
This Git commit is an **auditable human signature** proving a real human reviewed the task.

### Why derived state isn't stored in files

`lifecycleState`, `taskQueues`, and `reviewQueueState` are derived state that gets
recalculated on every run and never written back to Markdown files. Three reasons:

1. **Avoid fact drift**: If derived state were also written to files, there would be two sources
   of truth, and either one going stale would cause false reports
2. **Prevent gate bypass**: If Agents could directly modify derived fields, they could bypass
   the human confirmation gate
3. **Governance rules as code**: The scanner's derivation rules are themselves a machine-readable
   expression of governance rules — recalculating on every run is equivalent to re-executing
   the governance check every time

---

## Next steps

- Want to understand how the code is organized → [02-module-dependency.md](02-module-dependency.md)
- Want to understand how a task flows from start to finish → [03-task-lifecycle.md](03-task-lifecycle.md)
- Want to understand what the validators check → [04-check-and-governance.md](04-check-and-governance.md)
- Want to understand where Dashboard data comes from → [05-data-flow.md](05-data-flow.md)
- Want to understand how Presets and migration work → [06-preset-and-migration.md](06-preset-and-migration.md)
