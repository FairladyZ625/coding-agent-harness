# 05 — Data Flow: From Markdown to Dashboard

## Level 0 — Where data starts and ends

```mermaid
flowchart LR
  Source["Markdown source of truth\ncoding-agent-harness/"]
  Repository["Internal task readers\nadapter-owned read seam"]
  Status["status model\nscanner + validators"]
  Projection["Task semantic projection\nunified lifecycle / review / queue semantics"]
  Dashboard["Dashboard / Workbench / generated indexes"]

  Source --> Repository
  Repository --> Status
  Status --> Projection
  Projection --> Dashboard
```

Authoritative facts live only in Markdown files under `coding-agent-harness/`.
Scanner output, status JSON, Dashboard bundles, generated indexes, and
projections are rebuildable views. They may be cached or written to disk, but
they must not become a second source of truth.

---

## Level 1 — Which files are data sources

```mermaid
flowchart TD
  Sources["Data source files"]

  Sources --> IDX["INDEX.md\nTask Audit Metadata / review confirmation"]
  Sources --> TP["task_plan.md\nBudget / title / Tombstone / Preset info / Task Contract"]
  Sources --> PR["progress.md\nCurrent state / operation log"]
  Sources --> VM["visual_map.md\nPhase list / completion / evidence status"]
  Sources --> RV["review.md\nAgent review submission / findings"]
  Sources --> BR["brief.md\nTask summary"]
  Sources --> LC["lesson_candidates.md\nLesson candidates / decision state"]
  Sources --> ES["execution_strategy.md\nSubagent authorization state"]
  Sources --> WO["walkthrough.md\nCloseout evidence"]
```

Generated `Harness-Ledger.md`, task-index, module-index, Closeout index, and
Dashboard JSON are not hand-written sources. They support browsing, review, and
context recovery, but must be rebuildable from the source files.

---

## Level 2 — How internal task readers read tasks

```mermaid
flowchart TD
  Repo["Internal task readers"]
  List["list(query)"]
  Get["get(ref)"]
  Resolve["resolve(ref)"]
  Materials["readMaterials(ref)"]
  Scanner["legacy scanner\ncollectTasks / task discovery"]

  Repo --> List
  Repo --> Get
  Repo --> Resolve
  Repo --> Materials
  List --> Scanner
  Get --> Scanner
  Resolve --> Scanner
  Materials --> Scanner
```

Internal task readers wrap scanner-backed discovery where needed. Public and
application callers should see semantic task views and reviewable materials, not
`listTaskPlanPaths()`, directory exclusion rules, or legacy visual-map fallback
internals.

### Task discovery flow

```mermaid
flowchart TD
  CT["collectTasks()"]
  CT --> Discover["Scan\ncoding-agent-harness/planning/tasks/\ncoding-agent-harness/planning/modules/<key>/tasks/"]
  Discover --> Read["Read task package Markdown\nINDEX / task_plan / brief / progress / review / visual_map / lesson_candidates / findings / walkthrough"]
  Read --> Parse["Parse raw fields"]
  Parse --> Status["Assemble status task record"]
```

The scanner still parses Markdown tables, state, phases, review submission,
confirmation, lesson decisions, and tombstones as an infrastructure adapter. The
post-refactor boundary is that UI, command, and generated surfaces must not
re-interpret those raw fields on their own.

---

## Level 2 — What status output contains

`buildStatus()` assembles machine-readable state from repository/scanner output
and validator output:

```mermaid
flowchart TD
  Status["buildStatus()"]
  Status --> Tasks["tasks[]\nraw task records + semantic projection"]
  Status --> Failures["failures[]"]
  Status --> Warnings["warnings[]"]
  Status --> Caps["capabilities[]"]
  Status --> Git["git status summary"]
  Status --> Summary["summary metrics"]
```

Each task record still keeps raw fields such as `state`, `reviewStatus`,
`reviewQueueState`, `taskQueues`, `closeoutStatus`, `materialsReady`, and
`lessonCandidateDecisionComplete`. These fields are useful for debugging, but
Dashboard and generated governance rows should prefer semantic projection.

---

## Level 2 — Task Semantic Projection

```mermaid
flowchart TD
  Raw["raw task record"]
  Projection["buildTaskSemanticProjection()"]
  Lifecycle["TaskLifecycleProjection"]
  DashView["DashboardTaskView"]
  ReviewView["ReviewWorkbenchQueueView"]

  Raw --> Projection
  Projection --> Lifecycle
  Projection --> DashView
  Projection --> ReviewView
```

Projection wraps one raw task record into three explicit views:

| Projection | Core fields | Consumers |
| --- | --- | --- |
| `TaskLifecycleProjection` | `state`, `lifecycleState`, `reviewStatus`, `reviewQueueState`, `closeoutStatus`, `taskQueues`, `materialsReady`, `reviewSubmitted`, `deletionState` | status JSON, task-index, generated governance rows |
| `DashboardTaskView` | `visibleInSwimlane`, `swimlaneStage`, `needsEvidence`, `reasonCode`, `reasonMessage` | Dashboard task list, detail drawer, swimlane |
| `ReviewWorkbenchQueueView` | `primaryQueue`, `humanConfirmable`, `blocked`, `needsMaterials`, `confirmed`, `finalized`, `readyForCloseout`, `reasonCodes` | Review Workbench, bulk confirmation, review queue |

This boundary prevents the same task from having different meanings in top-line
stats, lifecycle workbench, swimlanes, and review tables. The frontend may decide
layout, color, and filtering, but it must not redefine whether a task is
review-ready, blocked, confirmed, or finalized.

---

## Level 3 — How the Dashboard bundle uses projection

```mermaid
flowchart TD
  Bundle["buildDashboardBundle()"]
  Bundle --> Status["status\nwith semanticProjection"]
  Bundle --> Documents["documents[]\nMarkdown document content"]
  Bundle --> Tables["tables[]\nMarkdown table structure"]
  Bundle --> Graph["graph\ntask / phase / module dependencies"]
  Bundle --> Adoption["adoption\nmigration adoption state"]

  Status --> UI["Dashboard UI"]
  Status --> Workbench["Workbench API responses"]
  Status --> Generated["generated task rows"]
```

Dashboard bundle adds documents, tables, graph, and adoption analysis on top of
status. Task lifecycle, review queue, swimlane stage, and confirmability should
come from projection, not from mixing raw `state`, `reviewStatus`, and
`taskQueues` again in `app.js` or Workbench handlers.

### documents collection scope

`collectMarkdownDocuments()` still collects fixed governance files, task package
files, module files, and lesson files. Those documents support human reading and
table browsing; they do not change task lifecycle semantics.

---

## Level 2 — Two Dashboard generation modes

```mermaid
flowchart LR
  subgraph "Static mode (read-only snapshot)"
    SC["harness dashboard\n--out-dir ./out"]
    SC --> SH["index.html\ninlined resources"]
    SC --> SJ["dashboard-data.json"]
    SC --> SF["status.json / tables.json\ndocuments.json / graph.json\nadoption.json"]
  end

  subgraph "Dynamic mode (Workbench)"
    DC["harness dev"]
    DC --> HTTP["Local HTTP server\n127.0.0.1"]
    HTTP --> Browser["Live view\nhuman confirmation and other writes"]
    Browser --> Ops["TaskOperations\nbusiness actions"]
    Ops --> Tx["HarnessTransaction / legacy writers\nscoped Markdown writes + Git commit"]
  end
```

The static Dashboard is a shareable evidence snapshot and cannot trigger writes.
Workbench is local-only. Writes must pass host/origin/CSRF checks,
TaskOperations business gates, and scoped write boundaries.

---

## Level 3 — Role of markdown-utils.mjs

`markdown-utils.mjs` remains the low-level Markdown table parsing foundation. It
extracts rows, locates columns, reads cells, splits lists, and splits dependencies.
It does not decide whether a task is confirmable, complete, or in the review queue.

---

## Level 2 — Design decisions

### Why projection is not source of truth

Projection is a named view over the raw task record. It eliminates semantic drift
across consumers, but it must not be hand-written and must not bypass task files.
After deleting generated JSON or Dashboard output, running scanner/status again
should produce an equivalent projection.

### Why Dashboard remains plain HTML + vanilla JS

harness is distributed through `npx`. Introducing React/Vite would make each run
pull build dependencies and break zero-dependency portability. Static HTML can
open from `file://` and can be shared as a CI evidence snapshot.

### Why the static Dashboard is read-only

Static Dashboard has no safety boundary and is meant for sharing and review.
Writes only run in local Workbench mode, where the server can validate host,
origin, CSRF, Git state, and allowed paths.
