# {{TASK_TITLE}} - 任务包索引

Task Contract: harness-task/v1

## 任务身份

| Field | Value |
| --- | --- |
| Task ID | `{{TASK_ID}}` |
| Budget | `{{TASK_BUDGET}}` |
| Preset | `{{TASK_PRESET}}` |
| Module | `{{TASK_MODULE}}` |
| Long-running | `{{TASK_LONG_RUNNING}}` |
| Created | {{DATE}} |

## 任务审计元数据

| Field | Value |
| --- | --- |
| Created By | {{TASK_AUDIT_CREATED_BY}} |
| Created At | {{TASK_AUDIT_CREATED_AT}} |
| Command Shape | {{TASK_AUDIT_COMMAND_SHAPE}} |
| Budget | {{TASK_AUDIT_BUDGET}} |
| Template Source | {{TASK_AUDIT_TEMPLATE_SOURCE}} |
| Task Creator | {{TASK_AUDIT_TASK_CREATOR}} |
| Task Creator Source | {{TASK_AUDIT_TASK_CREATOR_SOURCE}} |
| Human Review Status | {{TASK_AUDIT_HUMAN_REVIEW_STATUS}} |
| Confirmation ID | {{TASK_AUDIT_CONFIRMATION_ID}} |
| Confirmed At | {{TASK_AUDIT_CONFIRMED_AT}} |
| Reviewer | {{TASK_AUDIT_REVIEWER}} |
| Reviewer Email | {{TASK_AUDIT_REVIEWER_EMAIL}} |
| Confirm Text | {{TASK_AUDIT_CONFIRM_TEXT}} |
| Evidence Checked | {{TASK_AUDIT_EVIDENCE_CHECKED}} |
| Review Commit SHA | {{TASK_AUDIT_REVIEW_COMMIT_SHA}} |
| Audit Source | {{TASK_AUDIT_AUDIT_SOURCE}} |
| Audit Status | {{TASK_AUDIT_AUDIT_STATUS}} |
| Exception Reason | {{TASK_AUDIT_EXCEPTION_REASON}} |
| Message | {{TASK_AUDIT_MESSAGE}} |
| Migration Status | {{TASK_AUDIT_MIGRATION_STATUS}} |
| Migrated From | {{TASK_AUDIT_MIGRATED_FROM}} |
| Legacy Extra Fields | {{TASK_AUDIT_LEGACY_EXTRA_FIELDS}} |
| Migration Notes | {{TASK_AUDIT_MIGRATION_NOTES}} |

## 核心合同文件

| 文件 | 用途 |
| --- | --- |
| `brief.md` | 面向人和下一轮 agent 的任务摘要与上下文入口。 |
| `task_plan.md` | 当前任务目标、范围、所选预算、验收标准和执行决策。 |
| `visual_map.md` | 阶段图、证据状态、下一步生命周期命令和支持性图表。 |
| `progress.md` | 执行日志、验证证据、决策和交接记录。 |
| `walkthrough.md` | 任务本地 closeout 摘要、验证、审查处置、残余风险和链接。 |

## 标准任务文件

standard 和 complex 任务包含以下文件。

| 文件 | 用途 |
| --- | --- |
| `execution_strategy.md` | 执行模式、owner、冲突控制和证据策略。 |
| `findings.md` | 发现、研究记录、已接受风险和未解决问题。 |
| `lesson_candidates.md` | closeout 前的任务本地 lesson candidate 决策。 |
| `review.md` | Agent Review Submission、对抗审查、findings、evidence 和 routing。 |

## 可选索引

| 索引 | 用途 |
| --- | --- |
| `references/INDEX.md` | 参考资料和 preset 提供的 required reads。 |
| `artifacts/INDEX.md` | 生成产物、证据包、截图、报告和命令输出。 |

## Preset 摘要

本节由系统渲染。Preset 不能新增自定义根级文件，也不能任意追加根 `INDEX.md` 内容。

| Field | Value |
| --- | --- |
| Preset | `{{TASK_PRESET}}` |
| Preset Version | `{{TASK_PRESET_VERSION}}` |
| Evidence Bundle | `{{TASK_EVIDENCE_BUNDLE}}` |
| Resource Indexes | `references/INDEX.md`; `artifacts/INDEX.md` |

## 更新规则

- 状态和决策写入 `progress.md`。
- 任务专属目标和验收标准写入 `task_plan.md`。
- 大段命令输出、截图、报告和生成文件放入 `artifacts/INDEX.md`。
- 源材料、外部链接和 preset required reads 放入 `references/INDEX.md`。
