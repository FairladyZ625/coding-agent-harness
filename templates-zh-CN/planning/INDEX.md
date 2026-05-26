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

## 核心合同文件

| 文件 | 用途 |
| --- | --- |
| `brief.md` | 面向人和下一轮 agent 的任务摘要与上下文入口。 |
| `task_plan.md` | 当前任务目标、范围、所选预算、验收标准和执行决策。 |
| `visual_map.md` | 阶段图、证据状态、下一步生命周期命令和支持性图表。 |
| `progress.md` | 执行日志、验证证据、决策和交接记录。 |

## 标准任务文件

standard 和 complex 任务包含以下文件。

| 文件 | 用途 |
| --- | --- |
| `execution_strategy.md` | 执行模式、owner、冲突控制和证据策略。 |
| `findings.md` | 发现、研究记录、已接受风险和未解决问题。 |
| `lesson_candidates.md` | closeout 前的任务本地 lesson candidate 决策。 |
| `review.md` | Agent Review Submission、对抗审查和人工确认区域。 |

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
