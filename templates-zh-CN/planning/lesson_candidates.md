# {{TASK_TITLE}} - 教训候选

本文件是任务本地 lesson candidate queue。它不是 Lessons SSoT；只有人工审查确认值得沉淀后，才进入治理 promotion。

## Candidate Status

| Field | Value |
| --- | --- |
| Schema version | lesson-candidate-v1 |
| Task-level status | pending-review |
| Review gate | candidate-file-present |
| Review decision | pending-human-review |
| Promotion state | not-promoted |
| Closeout token | pending |
| Source task | {{TASK_ID}} |
| Owner | coordinator |
| Last updated | {{DATE}} |

## Schema

允许的任务级状态：

- `missing`：候选文件不存在。
- `pending-review`：候选文件存在，但人工判定还没完成。
- `no-candidate-accepted`：人工接受本任务没有可复用候选的理由。
- `needs-promotion`：至少一个候选已排队等待治理沉淀。
- `promoted`：所有接受的候选都已写入 Lessons SSoT。
- `rejected`：所有候选都已带理由拒绝或归档。

允许的行级状态：

- `ready-for-review`：agent 认为这个候选可能有复用价值。
- `needs-promotion`：人工标记这个候选值得沉淀。
- `promoted`：维护 CLI 已把候选写入 Lessons SSoT。
- `rejected`：人工带理由拒绝这个候选。

聚合规则：

- 任意 `ready-for-review` 行会让任务级状态保持 `pending-review`。
- 任意 `needs-promotion` 行会让任务级状态变成 `needs-promotion`，除非仍有 `ready-for-review` 行。
- 全部行都是 `promoted` 时，任务级状态为 `promoted`。
- 全部行都是 `rejected` 时，任务级状态为 `rejected`。
- 没有候选的任务必须使用 `no-candidate-accepted`，并填写 `No-Candidate Reason`。

## Candidates

| ID | Row Status | Title | Why It Might Matter | Review Decision | Promotion Target |
| --- | --- | --- | --- | --- | --- |

## No-Candidate Reason

尚未判定。只有人工审查接受本任务没有可复用候选时，才填写这里。

## Promotion Notes

- 如果人工审查认为候选值得沉淀，把对应行标记为 `needs-promotion`，并记录目标治理位置。
- 如果人工审查拒绝候选，把对应行标记为 `rejected`，并在 review decision 中保留理由。
- `needs-promotion` 不阻止任务 closeout，但必须继续出现在维护队列和收口记录里。
