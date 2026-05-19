# 文档库标准

## 职责

本标准定义 `docs/` 文档库的目录、命名、归档和引用规则。文档库服务于 agent 执行，不是资料堆；每个文件都应有明确职责、当前事实和可追溯证据。

## 目录职责

| 位置 | 职责 |
| --- | --- |
| `docs/Harness-Ledger.md` | 全局上下文维护总账，记录非平凡任务是否完成计划、审查、回归、Lessons 和收口回写。 |
| `docs/01-GOVERNANCE/` | Lessons SSoT、经验详情、治理记录、归档。 |
| `docs/03-ARCHITECTURE/` | ADR、架构设计、接口决策、关键技术方案。 |
| `docs/05-TEST-QA/` | Regression SSoT、Cadence Ledger、测试策略和回归证据索引。 |
| `docs/09-PLANNING/` | Delivery SSoT、Module Registry、任务目录、模块计划。 |
| `docs/09-PLANNING/TASKS/` | 每个任务一个目录，包含 task plan、progress、findings、review。 |
| `docs/10-WALKTHROUGH/` | 收口记录和 Closeout SSoT。 |
| `docs/11-REFERENCE/` | agent 按需加载的标准文件，控制行为而不是记录流水账。 |
| `docs/99-TMP/` | 临时材料，定期清理，不作为长期事实来源。 |

## 命名规则

- 目录可使用编号前缀，例如 `09-PLANNING`、`11-REFERENCE`。
- 标准文件使用 kebab-case，例如 `testing-standard.md`。
- 时序文档使用日期前缀，例如 `2026-05-19-runtime-cleanup-walkthrough.md`。
- 模板目录或模板文件用 `_` 前缀，例如 `_task-template/`。
- ID、状态枚举、命令名、schema 字段可保留英文；可见标题和说明优先中文。

## 文档类型

| 类型 | 推荐位置 | 要求 |
| --- | --- | --- |
| 任务计划 | `09-PLANNING/TASKS/<task>/task_plan.md` | 写目标、范围、证据、stop condition。 |
| 进度记录 | `09-PLANNING/TASKS/<task>/progress.md` | 记录阶段状态、阻塞、决策和验证。 |
| 研究发现 | `09-PLANNING/TASKS/<task>/findings.md` | 记录调查证据，不替代审查报告。 |
| 审查报告 | `09-PLANNING/TASKS/<task>/review.md` | 记录 Confidence Challenge、material findings、evidence、residual。 |
| 收口记录 | `10-WALKTHROUGH/<date>-<name>.md` | 给下一轮 agent 的可追溯交接。 |
| Closeout SSoT | `10-WALKTHROUGH/Closeout-SSoT.md` | closed task 的 walkthrough 路径和跳过原因索引。 |
| Regression SSoT | `05-TEST-QA/Regression-SSoT.md` | 管回归 surface、evidence depth、residual。 |
| Harness Ledger | `Harness-Ledger.md` | 管上下文维护合规性，不复制业务事实。 |
| Reference 标准 | `11-REFERENCE/*.md` | 管长期规则，避免写成任务日志。 |

## 归档规则

- 会持续增长的目录必须有同级 `_archive/`。
- 活跃文件只保留当前事实；历史事实移入 `_archive/`，不能无限追加在活跃表底部。
- 归档不删除原始 ID，不破坏 task plan、walkthrough、SSoT、Ledger 之间的引用。
- 活跃文件必须留下归档指针，说明历史记录在哪里。
- `review.md` 留在对应任务目录，不移动到 walkthrough 或根目录。
- `docs/Harness-Ledger.md` 固定保留在 docs 根目录，是根目录过程文件禁令的唯一例外。
- `docs/99-TMP/` 下超过 7 天未更新的文件应清理或迁移到正式位置。

## 写作原则

1. 文档面向后续 agent 执行，必须可操作、可检索、可验证。
2. 标准文件写长期规则；任务文件写本轮事实；walkthrough 写交接结论。
3. 证据用路径、命令、日志、截图、PR、CI run 引用，不依赖聊天记录。
4. 表格用于状态和路由；段落用于解释判断和边界。
5. 更新 reference 或 template 时，必须在 Harness Ledger 记录本次上下文维护。
