# SSoT 治理

## 核心思路

SSoT（Single Source of Truth，单一事实源）保存当前事实。任务生命周期状态现在由任务本地文件承载，并由 Harness CLI 生成 `docs/Harness-Ledger.md`，避免 Agent 或人手写多张重复进度表。

## 当前治理表

### Delivery SSoT（交付排期表）

管理多人、多 agent、多仓或传统流程下的 feature block 分配、依赖和集成顺序。

- 文件：`docs/09-PLANNING/Delivery-SSoT.md`
- 职责：谁负责哪个 feature block、agent 能看哪些上下文、依赖和 merge 顺序是什么
- 规则：多人、多仓、split-repo、program、waterfall 或 kanban 团队流程必须维护

### Regression SSoT（回归控制塔）

管理所有 regression surface 的状态、证据深度和残项。

- 文件：`docs/05-TEST-QA/Regression-SSoT.md`
- 职责：哪些回归面存在、每条的标准入口、当前证据深度、residual
- 规则：新增固定 gate 或 evidence depth 变化时必须更新

### Cadence Ledger（周期验证表）

管理需要周期性复查的回归、release、migration 或环境检查。

- 文件：`docs/05-TEST-QA/Cadence-Ledger.md`
- 职责：哪些检查需要按节奏重跑、最近一次证据是什么、下一次应该何时触发
- 规则：新增或改变周期性 gate 时必须更新

### Module Registry（模块登记表）

管理模块边界、owner、worktree 和写入范围。

- 文件：`docs/09-PLANNING/Module-Registry.md`
- 职责：模块 key、路径范围、负责人、状态、worktree、模块计划和依赖
- 规则：启用模块并行时必须维护；模块内步骤进度由 module plan / module visual map 的生成索引表达

### Closeout SSoT（收口表）

管理任务是否有 walkthrough、Lessons Check 和受控 skip reason。

- 文件：`docs/10-WALKTHROUGH/Closeout-SSoT.md`
- 职责：任务收口状态、walkthrough 路径、lesson 结果和 residual
- 规则：非平凡任务完成或关闭时必须维护

### Lessons Governance（经验沉淀）

管理 Agent 在开发过程中发现的经验、改进建议和规范演进。

- 文件：任务本地 `lesson_candidates.md` 与 `docs/01-GOVERNANCE/lessons/*.md`
- 职责：哪些经验值得沉淀、人工如何判定、哪些 lesson 已提升为详情文档
- 规则：Walkthrough 收口后检查是否有沉淀建议；promotion 前必须查重 candidate 和 detail doc
- 详细治理规范：`references/lessons-governance.md`

### Harness Ledger（生成的任务生命周期总账）

管理任务生命周期的可扫描汇总。

- 文件：`docs/Harness-Ledger.md`
- 职责：从任务本地事实生成 scope、module、task、state、queues、plan、review、lesson、closeout、residual
- 规则：由 Harness CLI 生成；不要手写任务生命周期行
- 详细规范：`references/harness-ledger.md`

## Legacy 生命周期表

`Feature-SSoT.md` 和 `Private-Feature-SSoT.md` 是旧版任务生命周期投影。当前版本不再创建或重建这些表；迁移旧项目时先归档，再用 `harness governance rebuild --archive --apply` 生成新的 Harness Ledger。

## 分工规则

- Delivery SSoT 不替代 Regression SSoT；它管交付组织和集成顺序。
- Regression SSoT 不替代 Closeout SSoT；它管验证面和证据深度。
- Closeout SSoT 不替代 task-local `lesson_candidates.md`；它只记录收口状态。
- Module Registry 不替代 module plan；它登记模块边界和 owner。
- Harness Ledger 不替代上述治理表；它只生成任务生命周期索引。
- 任务生命周期状态不要同时维护在旧 Feature 表和新 Ledger 中。

## 模块并行分工

当项目启用模块并行开发（见 `references/module-parallel-standard.md`）时：

- Module Registry 管模块边界、owner、worktree 和写入范围。
- module plan / module visual map 管模块内步骤和拓扑索引。
- Harness Ledger 生成模块任务在全局任务生命周期中的位置。
- Delivery SSoT 只在需要跨模块、跨仓或多人交付编排时维护。

## 归档规则

每张治理表都必须区分 Active 与 Archive。Active 保存当前事实；Archive 保存可追溯历史。

| 表 | Active 保留 | 归档触发 | 归档位置 |
|------|-------------|----------|----------|
| Legacy Feature / Private Feature 生命周期表 | 不再作为 active 表保留 | 迁移到 ledger-only 版本 | `docs/09-PLANNING/_archive/` |
| Delivery SSoT | 当前交付 block、集成顺序和阻塞项 | wave 结束或 completed/superseded blocks 超过 20 条 | `docs/09-PLANNING/_archive/` |
| Module Registry | 活跃 / 暂停不久的模块 | 模块 completed 或 paused 超过 60 天 | `docs/09-PLANNING/MODULES/_archive/<key>/` |
| Regression SSoT | active gates | gate 废弃或长期不再运行 | `docs/05-TEST-QA/_archive/` |
| Cadence Ledger | active cadence checks | cadence 废弃或合并到其他 gate | `docs/05-TEST-QA/_archive/` |
| Closeout SSoT | 当前 closeout 索引 | closed/superseded 超过保留窗口 | `docs/10-WALKTHROUGH/_archive/` |
| Lesson detail docs | pending / approved / superseded 详情文档 | merged/rejected 超过 20 条 | `docs/01-GOVERNANCE/_archive/` |
| Harness Ledger | 当前生成索引 | 重新生成前 archive 旧快照 | `docs/01-GOVERNANCE/_archive/` 或迁移会话 archive |

归档不改变 ID，不删除证据文件；Active 文件必须留下 archive index 或指向归档文件。

## SSoT 与 Planning 的绑定

- 每个非平凡任务必须有任务本地 plan / progress / review / lesson / closeout 事实。
- Harness Ledger 从这些事实生成，不要求人手写任务生命周期表。
- 非任务生命周期治理表只在本轮实际触达对应事实时更新。
- 如果生成索引不对，修复 scanner、generator 或任务本地事实。

## 常见反模式

- 同时维护旧 Feature 生命周期表和生成 Ledger
- 只更新 task plan，不刷新生成索引
- 手写生成表来绕过 scanner 问题
- 把 Regression / Delivery / Closeout 的详细治理事实复制进 Harness Ledger
- 建多个平行的进度总览，导致 Agent 不知道哪张表可信
