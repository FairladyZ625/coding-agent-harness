# Architecture Overview

Coding Agent Harness is a document-governed operating layer for long-running coding
agent work. It uses repository-native files, state contracts, role boundaries, and
checks to keep agent sessions auditable and recoverable.

## Public Architecture

```mermaid
flowchart TB
  Skill["Skill / Agent Entry"]
  Docs["Public Standards<br/>references/"]
  Templates["Install Templates<br/>templates/"]
  Target["Target Project Docs<br/>AGENTS.md + docs/"]
  Check["Checker / Status CLI"]

  Skill --> Docs
  Skill --> Templates
  Templates --> Target
  Docs --> Target
  Check --> Target
```

## Operating Principle

The harness separates three concerns:

| Layer | Responsibility |
| --- | --- |
| Public package | Ships reusable standards, templates, and checker logic. |
| Target project docs | Store the project's live plans, SSoTs, ledgers, and evidence. |
| Private operations | Store repository-local review drafts, handoffs, and release decisions. |

The public package should describe the system. It should not publish private
operating ledgers from this repository or from any target project.

## Worker / Coordinator Boundary

```mermaid
flowchart LR
  Worker["Worker<br/>local module files"]
  Handoff["Coordinator Handoff"]
  Coordinator["Coordinator<br/>global facts"]
  Check["Strict Check"]

  Worker --> Handoff
  Handoff --> Coordinator
  Coordinator --> Check
```

Workers own local task and module facts. Coordinators own global projections such
as registries, ledgers, closeout indexes, and regression state.
