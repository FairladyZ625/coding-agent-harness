# Task Binding Schema

Status: v1 schema contract

`TaskBinding` records how one Harness task package relates to an optional
external work item. It is task-local metadata. Do not store task identity in
global `harness.yaml`.

Harness owns local execution artifacts. External systems own attached work-item
state. The adapter synchronizes selected state between them.

## Contract

The canonical TypeScript contract lives in
`scripts/kernel/task/domain/task-binding.mts`.

Minimum fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `task-binding/v1`. |
| `stateBackend` | Always `local` in v1. |
| `issueBackend` | `none` for local-only tasks, or a provider such as `multica`. |
| `syncMode` | `local-only`, `bound-optional`, or `bound-sync`. |
| `bindingRole` | `root`, `child`, `subtask`, or `evidence-only`. |
| `harnessTask.taskRef` | Stable Harness task reference. |
| `harnessTask.taskPackagePath` | Repository-relative task package path. |
| `externalTask` | Required only when `issueBackend` is not `none`. |
| `titleSnapshot` | Required only for external bindings. It is an audit snapshot, not a directory rename trigger. |
| `parentHarnessTaskRef` | Required when `bindingRole` is `subtask`. |
| `bindingCreatedAt` | ISO timestamp for the binding record. |

## Local-Only Example

```json
{
  "schemaVersion": "task-binding/v1",
  "stateBackend": "local",
  "issueBackend": "none",
  "syncMode": "local-only",
  "bindingRole": "root",
  "harnessTask": {
    "taskRef": "TASKS/2026-06-10-local-only-schema-task",
    "taskPackagePath": "coding-agent-harness/planning/tasks/2026-06-10-local-only-schema-task"
  },
  "bindingCreatedAt": "2026-06-10T05:44:19Z"
}
```

## Multica-Bound Example

```json
{
  "schemaVersion": "task-binding/v1",
  "stateBackend": "local",
  "issueBackend": "multica",
  "syncMode": "bound-optional",
  "bindingRole": "root",
  "externalTask": {
    "provider": "multica",
    "id": "f9e8e75b-739c-428c-824b-6efa71e2aad6",
    "identifier": "FAI-37",
    "projectId": "7470d226-891d-4d1e-9e17-7268d20ad310",
    "parentId": "d5bbfb25-0ce7-4dfb-94fd-5519a2c01304"
  },
  "harnessTask": {
    "taskRef": "TASKS/2026-06-10-fai-37-multica-taskbinding-schema",
    "taskPackagePath": "coding-agent-harness/planning/tasks/2026-06-10-fai-37-multica-taskbinding-schema"
  },
  "titleSnapshot": "Define Multica TaskBinding schema for Coding Agent Harness",
  "bindingCreatedAt": "2026-06-10T05:44:19Z"
}
```

## Task Package Block

Task packages should expose the binding in `INDEX.md` as a compact table:

| Field | Value |
| --- | --- |
| Binding Schema | `task-binding/v1` |
| State Backend | `local` |
| Issue Backend | `none` or provider name |
| Sync Mode | `local-only`, `bound-optional`, or `bound-sync` |
| Binding Role | `root`, `child`, `subtask`, or `evidence-only` |
| Harness Task Ref | `TASKS/...` |
| Task Package Path | repository-relative path |
| External Provider | provider name when bound |
| External ID | provider canonical id when bound |
| External Identifier | routable key such as `FAI-37` when bound |
| Title Snapshot | external title snapshot when bound |

## Metadata Key Decision

For Multica v0, use the simple key `harness_task_ref` as the reverse index.
Namespace it later only if multiple Harness-like integrations need to share the
same issue metadata bag.

Allowed Multica metadata keys:

- `harness_task_ref`
- `harness_artifact_index_ref`
- `pipeline_status`
- `pr_url`
- `pr_number`
- `deploy_url`
- `external_issue_url`
- `waiting_on`
- `blocked_reason`
- `decision`

Do not store title snapshots, long plans, evidence lists, raw run logs,
transcripts, progress history, agent attempts, credentials, or local auth state
in issue metadata.

## Title Snapshot Policy

The external title seeds `titleSnapshot` and may update display fields when
explicitly synchronized. It must not automatically rename the task directory.
The directory slug is the package identity and audit anchor.
