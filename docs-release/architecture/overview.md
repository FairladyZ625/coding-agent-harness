# Architecture Overview

English | [简体中文](overview.zh-CN.md)

Coding Agent Harness is a repository-native operating layer for long-running
coding agent work. It gives agents a stable project memory, a task lifecycle,
review gates, migration rails, and a dashboard that humans can inspect.

The core idea is simple: keep the important state in files the agent can read,
then use the CLI to derive status, checks, migration plans, and dashboard views
from those files.

## Mental Model

```mermaid
flowchart LR
  Prompt["Prompt engineering<br/>better instruction"]
  Context["Context engineering<br/>better evidence loaded"]
  Harness["Harness engineering<br/>better operating system"]

  Prompt --> Context
  Context --> Harness

  Prompt --> P1["role, task, constraints"]
  Context --> C1["docs, files, prior outputs"]
  Harness --> H1["state, gates, dashboard, review"]
```

Prompt engineering improves a single model call. Context engineering improves
what the model sees across a task. Harness engineering improves how the whole
agent workflow runs over days, handoffs, reviews, and releases.

## Product Architecture

```mermaid
flowchart TB
  Skill["Agent skill<br/>SKILL.md"]
  CLI["Harness CLI<br/>scripts/harness.mjs"]
  Standards["Standards<br/>references/"]
  Templates["Scaffolds<br/>templates/ + templates-zh-CN/"]
  Target["Target repository<br/>AGENTS.md + docs/"]
  Scanner["Scanner and validators<br/>status/check"]
  Dashboard["Dashboard / Workbench<br/>HTML + JSON"]
  Human["Human reviewer<br/>approval and inspection"]
  Agent["Coding agent<br/>Codex / Claude / Gemini"]

  Agent --> Skill
  Skill --> Standards
  Skill --> CLI
  CLI --> Templates
  Templates --> Target
  Standards --> Target
  Target --> Scanner
  Scanner --> Dashboard
  Dashboard --> Human
  Scanner --> Agent
  Human --> Agent
```

The package ships the repeatable pieces: standards, templates, CLI logic,
dashboard assets, examples, and public docs. Target projects hold the live
project facts.

## Target Repository Model

```mermaid
flowchart TB
  Entry["AGENTS.md<br/>agent entry and routing"]
  Registry[".harness-capabilities.json<br/>enabled capabilities"]
  Docs["docs/"]
  Architecture["03-ARCHITECTURE<br/>system facts"]
  Development["04-DEVELOPMENT<br/>local setup and code map"]
  QA["05-TEST-QA<br/>regression and cadence"]
  Integrations["06-INTEGRATIONS<br/>external contracts"]
  Planning["09-PLANNING<br/>tasks and modules"]
  Walkthrough["10-WALKTHROUGH<br/>closeout evidence"]
  Reference["11-REFERENCE<br/>local operating standards"]
  Ledger["Harness Ledger / SSoTs / Lessons<br/>long-lived memory"]

  Entry --> Docs
  Registry --> Docs
  Docs --> Architecture
  Docs --> Development
  Docs --> QA
  Docs --> Integrations
  Docs --> Planning
  Docs --> Walkthrough
  Docs --> Reference
  Docs --> Ledger
```

The target repository is the source of truth. The agent should be able to resume
from these files without relying on previous chat memory.

## Repository Operating Models

The target repository can be organized in three ways:

| Model | Control surface | Execution surface |
| --- | --- | --- |
| Single repo | The same repository owns `AGENTS.md`, `docs/`, code, tests, and closeout. | The same repository. |
| Independent multi-repo | Each repository owns its own local `AGENTS.md` and `docs/`. | Each repository runs independently. |
| Parent-control repository | A parent repository owns the global Harness control plane. | Child repositories own implementation code and local checks. |

For products split across frontend, backend, SDKs, services, and upstream references,
the parent-control model keeps the agent startup point, Feature SSoT, regression
state, and closeout evidence in one place. See
`docs-release/guides/repository-operating-models.en-US.md` and
`docs-release/guides/parent-control-repository-pattern.en-US.md`.

## CLI Command Surface

```mermaid
flowchart LR
  CLI["harness CLI"]

  CLI --> Init["init / add-capability<br/>create or extend harness files"]
  CLI --> Status["status / check<br/>derive health and failures"]
  CLI --> Dashboard["dashboard / dev<br/>render human-readable state"]
  CLI --> Migration["migrate-plan / migrate-run / migrate-verify<br/>legacy project adoption"]
  CLI --> Task["new-task / task-* / review-confirm<br/>task lifecycle operations"]
  CLI --> UserSkill["install-user / doctor-user<br/>local skill setup"]

  Status --> Scanner["task scanner + check profiles"]
  Dashboard --> Bundle["status, tables, docs, graph, adoption warnings"]
  Task --> Lifecycle["task lifecycle writer"]
  Migration --> Planner["migration planner and verifier"]
```

All command families read the same repository facts. That keeps CLI output,
checks, migration reports, and dashboard views aligned.

## Dashboard Data Flow

```mermaid
sequenceDiagram
  autonumber
  participant CLI as harness dashboard/dev
  participant Scanner as scanner + validators
  participant Bundle as dashboard bundle
  participant Output as HTML output
  participant Browser as browser
  participant Target as target docs

  CLI->>Scanner: read AGENTS.md, docs, tasks, SSoTs
  Scanner->>Bundle: build status, tables, documents, graph, warnings
  Bundle->>Output: write index.html, assets, data/*.json
  Browser->>Output: open static dashboard snapshot
  alt local workbench mode
    Browser->>CLI: submit approved action
    CLI->>Target: update scoped markdown files
    CLI->>Output: regenerate snapshot
  end
```

The static dashboard is a portable evidence snapshot. The local workbench adds a
small writable surface for human-confirmed actions such as review completion.

## Task Lifecycle State Machine

```mermaid
stateDiagram-v2
  [*] --> ready: new-task or planned docs
  ready --> active: task-start
  active --> active: task-log / task-phase
  active --> blocked: task-block
  blocked --> active: task-start
  active --> in_review: task-review
  in_review --> review_blocked: open P0-P2 finding
  review_blocked --> in_review: finding closed or routed
  in_review --> closing: review-confirm + task-complete
  closing --> closed: closeout evidence linked
  closed --> [*]
```

The scanner keeps raw task state and derived lifecycle state separate:

| Raw task state | Derived lifecycle meaning |
| --- | --- |
| `not_started` / `planned` | `ready` |
| `in_progress` | `active` |
| `blocked` | `blocked` |
| `review` with open blocking findings | `review-blocked` |
| `review` without blocking findings | `in_review` |
| `done` without closeout | `closing` |
| any state with closed closeout evidence | `closed` |

This prevents a task from looking finished just because one file says `done`.

## Review And Closeout Gate

```mermaid
flowchart TB
  Review["task-review"]
  Simple{"simple budget?"}
  Phase["Visual Map progress<br/>or phase evidence"]
  Lessons["lesson candidates<br/>review decision complete"]
  Findings{"open P0-P2 findings?"}
  Walkthrough["walkthrough / closeout evidence"]
  Confirm["human review confirmation"]
  Complete["task-complete"]
  Closed["closed lifecycle"]

  Review --> Simple
  Simple -- yes --> Findings
  Simple -- no --> Phase
  Phase --> Lessons
  Lessons --> Findings
  Findings -- yes --> Review
  Findings -- no --> Walkthrough
  Walkthrough --> Confirm
  Confirm --> Complete
  Complete --> Closed
```

Standard and complex tasks must show progress, evidence, lesson resolution,
review confirmation, and closeout linkage before they are treated as closed.

## Migration Rails

```mermaid
flowchart LR
  Legacy["existing project"]
  Scan["migrate-plan<br/>scan facts"]
  Mode{"recommended mode"}
  Baseline["baseline-preserve<br/>safe adoption"]
  StatusAware["status-aware-rewrite<br/>current task repair"]
  Full["full-semantic-rewrite<br/>full readable cutover"]
  Run["migrate-run<br/>session + dashboard"]
  Verify["migrate-verify<br/>normal or full-cutover"]
  Evidence["final evidence<br/>dashboard + checks"]

  Legacy --> Scan
  Scan --> Mode
  Mode --> Baseline
  Mode --> StatusAware
  Mode --> Full
  Baseline --> Run
  StatusAware --> Run
  Full --> Run
  Run --> Verify
  Verify --> Evidence
```

Migration is plan-first. The agent scans the project, recommends a mode, and
waits for confirmation before changing old task history.

## Documentation Surface

```mermaid
flowchart TB
  Readme["README<br/>first impression and quick start"]
  DocsRelease["docs-release<br/>public architecture and guides"]
  References["references<br/>reusable standards"]
  Templates["templates<br/>files generated into target repos"]
  Skill["SKILL.md<br/>agent operating entry"]
  CLI["harness CLI<br/>enforces and renders"]

  Readme --> DocsRelease
  DocsRelease --> References
  Skill --> References
  Skill --> Templates
  CLI --> Templates
  CLI --> References
```

`README` introduces the product. `docs-release` explains architecture and user
workflows. `references` defines reusable standards. `templates` are the concrete
files installed into a target project.

## Release Package Surface

```mermaid
flowchart LR
  Source["source checkout"]
  Check["source-package check"]
  Test["npm test<br/>dashboard smoke"]
  Pack["npm pack --dry-run"]
  Tarball["npm tarball<br/>CLI + docs + templates + examples"]
  Publish["npm publish"]

  Source --> Check
  Check --> Test
  Test --> Pack
  Pack --> Tarball
  Tarball --> Publish
```

The public release artifact is the npm package. `npm pack --dry-run` is the
final shape check before publish because it shows exactly which docs, scripts,
templates, examples, and assets will be shipped.

## Worker / Coordinator Boundary

```mermaid
flowchart LR
  Worker["Worker agent<br/>local module or task files"]
  Handoff["handoff marker<br/>progress.md"]
  Coordinator["Coordinator agent<br/>global projection"]
  Registry["registries / ledgers / SSoTs"]
  Check["strict check"]

  Worker --> Handoff
  Handoff --> Coordinator
  Coordinator --> Registry
  Registry --> Check
```

Workers own local task and module facts. Coordinators own global projections:
registries, ledgers, closeout indexes, and regression state.
