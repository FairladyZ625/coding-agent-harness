# Visual Map

Visual Map Contract: v1.0

## Map Index

| ID | Type | Purpose | Required For Understanding | Source Evidence | Promotion Candidate |
| --- | --- | --- | --- | --- | --- |
| MAP-01 | phase | Show the demo task phase relationship | yes | `task_plan.md` | no |

```mermaid
flowchart LR
  P1["Plan"] --> P2["Verify"]
```

| Phase ID | Depends On | State | Completion | Output | Required Evidence | Evidence Status | Blocking Risk | Owner / Handoff |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| P1 | none | done | 100 | Example plan | review | present | none | coordinator |
| P2 | P1 | planned | 0 | Example verification | command | missing | none | coordinator |
