# 文档库标准

## 职责

本标准定义 `coding-agent-harness/` 文档库的目录、命名、归档和引用规则。文档库服务于 agent 执行，不是资料堆；每个文件都应有明确职责、当前事实和可追溯证据。

## 目录职责

| 位置 | 职责 |
| --- | --- |
| `coding-agent-harness/governance/generated/Harness-Ledger.md` | 全局上下文维护总账，记录非平凡任务是否完成计划、审查、回归、Lessons 和收口回写。 |
| `coding-agent-harness/governance/` | promoted lesson 详情、治理记录、归档。 |
| `coding-agent-harness/context/architecture/` | ADR、架构设计、接口决策、关键技术方案。 |
| `coding-agent-harness/context/development/` | 本地开发、代码地图、外部服务开发上下文、mock/stub、跨仓调试。 |
| `coding-agent-harness/governance/regression/` | Regression SSoT、Cadence Ledger、测试策略和回归证据索引。 |
| `coding-agent-harness/planning/` | Delivery SSoT、Module Registry、任务目录、模块计划。 |
| `coding-agent-harness/planning/tasks/` | 每个任务一个目录，包含 task plan、progress、findings、review。 |
| `coding-agent-harness/planning/tasks/<task>/` | 收口记录和 Closeout Index。 |
| `coding-agent-harness/governance/standards/` | agent 按需加载的标准文件，控制行为而不是记录流水账。 |
| `docs/99-TMP/` | 临时材料，定期清理，不作为长期事实来源。 |

## 03 / 04 / 06 路由规则

```text
03 = 它在系统里是什么
04 = 我开发当前仓时怎么面对它
06 = 我和它具体怎么对接
```

| 目录 | 负责 | 不负责 | 必需 schema 信号 |
| --- | --- | --- | --- |
| `coding-agent-harness/context/architecture/` | 系统结构、服务职责、owner、service catalog、critical flows、ADR | endpoint payload、mock 指南、任务日志 | `Context Doc Type`, `Source Evidence`, `Last Verified`, `Confidence` |
| `coding-agent-harness/context/development/` | local setup、codebase map、external development context、external source packs、mock/stub、cross-repo debugging | 长期架构事实、API payload 合同、未经摘要的外部资料堆 | `Context Doc Type`, `Development Use`, `Do Not Assume`, `Mocks / Stubs`, `Source Evidence`, `Last Verified`, `Confidence` |
| `coding-agent-harness/context/integrations/` | API/event/webhook/SDK/third-party contract、auth、payload、errors、contract tests | 全局拓扑、service ownership catalog、调试笔记 | `Context Doc Type`, `Contract Type`, `Auth`, `Payload`, `Errors`, `Contract Tests`, `Source Evidence`, `Last Verified`, `Confidence` |

具体分工：

- `coding-agent-harness/context/architecture/service-catalog.md` 只写服务摘要和链接。
- `coding-agent-harness/context/integrations/<service>-api-contract.md` 才写 payload、auth、errors、contract tests。
- `coding-agent-harness/context/development/external-context/<service>.md` 写 mock/stub、不安全假设和调试说明。
- `coding-agent-harness/context/development/external-source-packs/` 只写外部资料索引、digest 和投影状态；最终事实必须回写到 `context/{architecture,development,integrations}`。

## 外部资料摄取规则

如果目标项目属于微服务、多仓、前后端分仓或依赖外部团队文档，Agent 在 Diagnose / Decide 阶段必须询问用户是否有外部资料。资料少时直接作为 `Source Evidence` 链接；资料多时按 `external-source-intake-standard.md` 创建 source pack。

外部资料处理顺序固定为：

```text
Inventory -> Classify -> Sanitize -> Digest -> Project -> Verify -> Residual
```

未经 digest 和 projection 的原始资料不能直接作为执行事实。

## 命名规则

- 目录可使用编号前缀，例如 `coding-agent-harness/planning`、`coding-agent-harness/governance/standards`。
- 标准文件使用 kebab-case，例如 `testing-standard.md`。
- 时序文档使用日期前缀，例如 `2026-05-19-runtime-cleanup-walkthrough.md`。
- 模板目录或模板文件用 `_` 前缀，例如 `_task-template/`。
- ID、状态枚举、命令名、schema 字段可保留英文；可见标题和说明优先中文。

## 文档类型

| 类型 | 推荐位置 | 要求 |
| --- | --- | --- |
| 任务计划 | `coding-agent-harness/planning/tasks/<task>/task_plan.md` | 写目标、范围、证据、stop condition。 |
| 进度记录 | `coding-agent-harness/planning/tasks/<task>/progress.md` | 记录阶段状态、阻塞、决策和验证。 |
| 研究发现 | `coding-agent-harness/planning/tasks/<task>/findings.md` | 记录调查证据，不替代审查报告。 |
| 审查报告 | `coding-agent-harness/planning/tasks/<task>/review.md` | 记录 Confidence Challenge、material findings、evidence、residual。 |
| 收口记录 | `coding-agent-harness/planning/tasks/<task>/<date>-<name>.md` | 给下一轮 agent 的可追溯交接。 |
| Closeout Index | `coding-agent-harness/governance/generated/Closeout-Index.md` | closed task 的 walkthrough 路径和跳过原因索引。 |
| Regression SSoT | `coding-agent-harness/governance/regression/Regression-SSoT.md` | 管回归 surface、evidence depth、residual。 |
| Harness Ledger | `Harness-Ledger.md` | 管上下文维护合规性，不复制业务事实。 |
| Reference 标准 | `coding-agent-harness/governance/standards/*.md` | 管长期规则，避免写成任务日志。 |

## 归档规则

- 会持续增长的目录必须有同级 `_archive/`。
- 活跃文件只保留当前事实；历史事实移入 `_archive/`，不能无限追加在活跃表底部。
- 归档不删除原始 ID，不破坏 task plan、walkthrough、SSoT、Ledger 之间的引用。
- 活跃文件必须留下归档指针，说明历史记录在哪里。
- `review.md` 留在对应任务目录，不移动到 walkthrough 或根目录。
- `coding-agent-harness/governance/generated/Harness-Ledger.md` 由 CLI 生成，不应手写。
- `docs/99-TMP/` 下超过 7 天未更新的文件应清理或迁移到正式位置。

## 写作原则

1. 文档面向后续 agent 执行，必须可操作、可检索、可验证。
2. 标准文件写长期规则；任务文件写本轮事实；walkthrough 写交接结论。
3. 证据用路径、命令、日志、截图、PR、CI run 引用，不依赖聊天记录。
4. 表格用于状态和路由；段落用于解释判断和边界。
5. 更新 reference 或 template 时，必须在 Harness Ledger 记录本次上下文维护。
6. `context/{architecture,development,integrations}` 文档必须使用 schema 信号，发现内容错位时迁移到正确目录。
