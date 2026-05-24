# docs/ 目录标准

## 目的

定义项目文档目录的标准结构。所有文档按职责分层，agent 按 Task-Type Reading Matrix 按需加载。

## 标准目录结构

```
docs/
├── Harness-Ledger.md           ← CLI 生成的任务生命周期总账
├── 00-RAW-PRDS/              ← 原始需求文档、PRD、用户故事
│   └── _archive/              ← 本层历史文档归档（如该层会增长）
├── 01-GOVERNANCE/             ← 项目治理规则、决策记录、经验沉淀
│   ├── lessons/               ← promoted lesson 详情文档
│   └── _archive/              ← 已处理条目归档
├── 02-PRODUCT/                ← 产品设计、用户流程、功能规格
│   └── _archive/              ← 本层历史文档归档（如该层会增长）
├── 03-ARCHITECTURE/           ← 系统结构事实源：本仓架构、外部系统结构、服务地图、关键跨服务流、ADR
│   └── _archive/              ← 本层历史文档归档（如该层会增长）
├── 04-DEVELOPMENT/            ← 开发上下文输入包：本地开发、外部服务摘要、外部资料包、mock/stub、跨仓调试
│   └── _archive/              ← 本层历史文档归档（如该层会增长）
├── 05-TEST-QA/                ← 测试策略、Regression SSoT、Cadence Ledger
│   └── _archive/              ← 废弃 regression gate / 旧 evidence pack 归档
├── 06-INTEGRATIONS/           ← 接口合同层：API、event、webhook、SDK、第三方接入细节
│   └── _archive/              ← 本层历史文档归档（如该层会增长）
├── 07-OPERATIONS/             ← 部署、运维、监控、告警
│   └── _archive/              ← 本层历史文档归档（如该层会增长）
├── 08-SECURITY/               ← 安全策略、权限模型、审计日志
│   └── _archive/              ← 本层历史文档归档（如该层会增长）
├── 09-PLANNING/               ← 排期、任务计划
│   ├── TASKS/                 ← 任务目录（每个任务一个子目录）
│   │   └── _task-template/    ← 任务模板
│   ├── MODULES/               ← 模块并行开发计划（启用时）
│   │   └── _archive/          ← 已完成 / 暂停过久模块归档
│   ├── _archive/              ← 历史任务、旧生命周期表明细、过期排期归档
│   ├── Delivery-SSoT.md       ← 多人 / 多仓 / 传统流程下的交付排期和集成顺序
├── 10-WALKTHROUGH/            ← Walkthrough 收口记录与 Closeout SSoT
│   └── _archive/              ← 历史 walkthrough 批量归档（迁移 / 年度收束时）
├── 11-REFERENCE/              ← 标准文件（agent 按需加载）
│   └── _archive/              ← 旧版标准归档
└── 99-TMP/                    ← 临时文件（定期清理）
```

## 裁剪规则

不是每个项目都需要全部目录。根据诊断结果裁剪：

| 目录 | 何时可省略 |
|------|-----------|
| 00-RAW-PRDS | 没有正式 PRD 流程的小项目 |
| 01-GOVERNANCE | 仅实验性 Lite 项目且明确不启用 Lessons / 归档时 |
| 02-PRODUCT | 纯技术项目（库、CLI 工具） |
| 06-INTEGRATIONS | 没有第三方集成 |
| 07-OPERATIONS | 没有部署需求（纯库） |
| 08-SECURITY | 没有安全敏感场景 |
| 99-TMP | 可选 |

以下目录是 harness 的核心，不可省略：
- 01-GOVERNANCE
- 03-ARCHITECTURE
- 05-TEST-QA
- 09-PLANNING（含 TASKS/）
- 10-WALKTHROUGH
- 11-REFERENCE

`docs/Harness-Ledger.md` 不是目录，但属于核心 harness 文件，不可省略。它是
`docs/` 根目录允许存在的全局控制文件；普通过程文件仍然不得放在根目录。

`docs/10-WALKTHROUGH/Closeout-SSoT.md` 是 closed task 的收口索引和硬门槛；
每个 closed Harness Ledger row 必须在这里登记 walkthrough 或受控 skip reason。

## 03 / 04 / 06 边界规则

这三个目录共同承载项目和外部系统知识，但职责不能重叠：

```text
03 = 它在系统里是什么
04 = 我开发当前仓时怎么面对它
06 = 我和它具体怎么对接
```

| 目录 | 放什么 | 不放什么 | 必需机器字段 |
| --- | --- | --- | --- |
| `03-ARCHITECTURE/` | system map、service catalog、service responsibility、ownership、critical flows、ADR | endpoint payload、错误码、mock/stub、任务日志 | `Context Doc Type`, `Source Evidence`, `Last Verified`, `Confidence` |
| `04-DEVELOPMENT/` | local setup、codebase map、external service development summary、external source packs、mocks/stubs、cross-repo debugging | 长期系统事实源、payload 合同、ADR、未经摘要的外部资料堆 | `Context Doc Type`, `Development Use`, `Do Not Assume`, `Mocks / Stubs`, `Source Evidence`, `Last Verified`, `Confidence` |
| `06-INTEGRATIONS/` | endpoint、payload、错误码、auth、event schema、webhook、SDK、contract tests | 全局拓扑、service ownership catalog、开发调试笔记 | `Context Doc Type`, `Contract Type`, `Auth`, `Payload`, `Errors`, `Contract Tests`, `Source Evidence`, `Last Verified`, `Confidence` |

示例：

- `03-ARCHITECTURE/service-catalog.md` 可以写“Billing API: owner=payments, interface=/v1/invoices, link=06-INTEGRATIONS/billing-api-contract.md”。
- `06-INTEGRATIONS/billing-api-contract.md` 才写 `/v1/invoices` 的 payload、错误码、鉴权和 contract test。
- `04-DEVELOPMENT/external-context/billing.md` 写本仓开发时如何 mock Billing、如何排查 Billing 失败、哪些 Billing 假设不安全。
- `04-DEVELOPMENT/external-source-packs/payments/` 只存外部团队资料的索引、摘要和投影状态；最终事实仍要回写到 `03/04/06`。

## 外部资料摄取规则

当项目属于微服务、多仓、前后端分仓或依赖外部团队文档时，Agent 在 Diagnose / Decide 阶段必须询问用户是否有外部资料。资料少时直接作为 `Source Evidence`；资料多、跨主题或持续增长时，按 `external-source-intake-standard.md` 创建 source pack。

外部资料的固定处理顺序：

```text
Inventory -> Classify -> Sanitize -> Digest -> Project -> Verify -> Residual
```

未经过 digest 和 projection 的原始资料不能进入执行事实层。

Checker 规则：

- 新增 `03/04/06` 文档必须声明 `Context Doc Type`。
- 结构事实必须有 `Source Evidence`、`Last Verified` 和 `Confidence`。
- `04-DEVELOPMENT/external-context/*.md` 必须包含 `Development Use`、`Do Not Assume`、`Mocks / Stubs`。
- `06-INTEGRATIONS/*.md` 必须包含 `Contract Type`、`Auth`、`Payload`、`Errors`、`Contract Tests`。
- 旧项目 safe-adoption 可先收到 warning；declared canonical 项目应修到 clean。

## 通用归档规则

归档是目录级基础设施，不是单张表的特例。任何会持续增长的目录都应该有同级
`_archive/` 目录；如果目录本身不会增长，可以暂不创建，但第一次归档前必须创建。

### 硬规则

- Active 文件只保存当前事实和最近需要操作的事实。
- 历史事实移入同级 `_archive/`，不要长期堆在 Active 表底部。
- 归档不改变原始 ID，不删除 task plan、walkthrough、SSoT 或 Ledger 的可追溯引用。
- 归档后 Active 文件必须留下归档索引或指针，说明历史在哪里。
- 归档文件必须按时间或范围命名：`<name>-archive-YYYY-QN.md`、`<name>-phase-1-11.md`、`YYYY-MM-DD-<name>.md`。
- 新增归档规则时，同步更新 `docs-library-standard.md` 和对应 checker。

### 推荐触发条件

| 对象 | 触发条件 | 归档位置 |
|------|----------|----------|
| Legacy Feature / Private Feature 生命周期表 | 迁移到 ledger-only 版本 | `09-PLANNING/_archive/` |
| Delivery SSoT | 集成 wave 结束或 completed/superseded blocks 超过 20 条 | `09-PLANNING/_archive/` |
| Module Registry / module_plan | 模块 completed 或 paused 超过 60 天 | `09-PLANNING/MODULES/_archive/<key>/` |
| Regression SSoT | gate 废弃或长期不再运行 | `05-TEST-QA/_archive/` |
| Lesson detail docs | merged/rejected/superseded 详情文档超过 20 条 | `01-GOVERNANCE/_archive/` |
| Harness Ledger | closed/superseded 超过 50 条 | `01-GOVERNANCE/_archive/` |
| Walkthrough | 年度/阶段迁移或目录过大 | `10-WALKTHROUGH/_archive/` |

## Reference 标准文件清单

`docs/11-REFERENCE/` 下的标准文件，按项目需要选择：

| 文件 | 职责 | 必需？ |
|------|------|--------|
| testing-standard.md | 测试规范、框架选择、覆盖率要求 | 是 |
| execution-workflow-standard.md | 开发执行流程、commit 规范、PR 流程 | 是 |
| delivery-operating-model-standard.md | 工程组织形态、feature block 拆分、跨仓/团队协作模型 | 是 |
| repo-governance-standard.md | repo platform、branch protection、PR policy、required checks、worktree concurrency | 是 |
| pull-request-standard.md | PR 描述结构、中英双语要求、版本影响、验证、审查证据、残余风险和引用 | 是 |
| ci-cd-standard.md | CI/CD profile、workflow、required checks、release/CD residual | 是 |
| long-running-task-standard.md | 长程任务合同、连续执行权限、review loop、停止条件 | 是 |
| adversarial-review-standard.md | 对抗性 review 报告、finding 分级、no-finding 结论、residual 路由 | 是 |
| review-routing-standard.md | reviewer / subagent / external agent / human review 触发和路由规则 | 是 |
| docs-library-standard.md | 文档治理规范、命名规则、归档规则 | 是 |
| external-source-intake-standard.md | 外部资料摄取、过滤、摘要和投影规则 | 是 |
| harness-ledger-standard.md | Harness Ledger 写入规范、closeout 检查 | 是 |
| regression-ssot-governance.md | Regression SSoT 治理规范 | Standard+ |
| walkthrough-standard.md | Walkthrough 写作规范 | 是 |
| worktree-standard.md | Worktree 命名、分支、清理规范 | Standard+ |
| engineering-standard.md | 工程规范、代码风格、架构约束 | 推荐 |
| frontend-standard.md | 前端规范（如有前端） | 按需 |
| api-standard.md | API 设计规范（如有 API） | 按需 |
| security-standard.md | 安全规范（如有安全需求） | 按需 |
| deployment-standard.md | 部署规范（如有部署需求） | 按需 |
| debugging-playbook.md | 调试经验手册 | 推荐 |
