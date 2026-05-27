# 交付运行模型标准

## 职责

本标准用于在实现开始前选定交付模型，明确规划 owner、集成 owner、发布 owner、共享文件治理和多 agent 协作边界。没有运行模型，agent 容易把 solo 任务、多模块并行、多仓协作和阶段式交付混在一起，导致计划、审查和 merge 顺序不可控。

## 运行模型画像

| 项 | 项目约定 |
| --- | --- |
| 交付模型 | solo orchestrator / team feature lead / split-repo contract / program multi-repo / waterfall stage gate / kanban continuous |
| 团队形态 | 单 agent、主 agent + reviewer、coordinator + workers、多人团队 |
| 仓库拓扑 | 单仓、monorepo、多仓、前后端分离、库 + 应用 |
| 主要规划 owner | 负责维护 task plan、Delivery SSoT、Module Registry 的角色 |
| 集成 owner | 负责 merge、冲突解决、最终 gates 的角色 |
| 发布 owner | 负责 release、环境确认、回滚判断的角色 |
| agent 可见范围 | 哪些目录、文档、外部系统可读；哪些必须先确认 |

## 任务拆分规则

| 层级 | 负责人 | 主要产物 | 规则 |
| --- | --- | --- | --- |
| 路线图 | product / tech lead / owner | roadmap、release plan | 只放阶段目标，不替代任务计划。 |
| 功能块 | coordinator / feature lead | `coding-agent-harness/planning/Delivery-SSoT.md` 或功能 SSoT | 标明 owner、依赖、集成顺序。 |
| 任务 | task owner | `coding-agent-harness/planning/tasks/<task>/task_plan.md` | 每个任务有目标、范围、证据和 stop condition。 |
| 审查 | reviewer / subagent / human | `review.md` 或 PR review | 按审查路由执行，不只留在聊天里。 |
| 集成 | coordinator / maintainer | PR、integration branch、release branch | 由集成 owner 决定 merge 顺序和最终 gates。 |

## 已选模型合同

项目必须写清：

- 为什么当前交付模型适合本项目。
- feature block 如何分配，谁可以改状态。
- 共享文件如何加锁、排队或串行修改。
- merge 顺序如何决定，冲突由谁处理。
- 跨仓接口怎么变更，schema 或 API 的 source of truth 在哪里。
- reviewer 与 worker 的边界是什么。
- agent 可以读取哪些上下文，哪些上下文必须由 owner 提供。

## 交付单一事实源要求

以下任一条件成立时，必须维护 `coding-agent-harness/planning/Delivery-SSoT.md`：

- 多人或多 agent 并行开发。
- 多仓或前后端分离协作。
- 存在共享文件、跨模块契约或 release branch。
- 用户要求按阶段、模块或 feature block 管理交付。

不需要 Delivery SSoT 时，也要在任务计划里写明原因。

## 跨仓接口合同

跨仓、前后端或服务间协作必须记录：

| 项 | 要求 |
| --- | --- |
| API / schema source of truth | OpenAPI、GraphQL schema、protobuf、类型定义或文档路径。 |
| 请求与响应示例 | 至少覆盖成功、权限失败、校验失败。 |
| 错误语义 | 错误码、HTTP status、用户可见文案边界。 |
| 兼容策略 | breaking change、向后兼容、灰度策略。 |
| mock / stub 策略 | 本地开发和测试替身如何保持同步。 |
| breaking-change owner | 谁批准破坏性变更。 |
| 前端验证 | UI、e2e、contract test 或 smoke。 |
| 后端验证 | unit、integration、contract test、live smoke。 |

## 证据状态

| 项 | 状态 | 证据 | residual |
| --- | --- | --- | --- |
| 交付模型已选定 | `designed` / `implemented` / `verified` / `blocked-with-owner` | 任务计划或标准路径 | 未决项 |
| 规划 owner 已明确 | 同上 | Delivery SSoT 或 task plan | 未决项 |
| 集成 owner 已明确 | 同上 | PR、progress 或 Delivery SSoT | 未决项 |
| feature block 分配规则 | 同上 | Delivery SSoT | 未决项 |
| 共享文件和跨仓冲突规则 | 同上 | repo governance、worktree 标准或任务计划 | 未决项 |

## 收口要求

非 solo 任务收口前必须确认：Delivery SSoT、Module Registry、worker handoff、review、Regression SSoT 和 Harness Ledger 是否都已更新；不能只看单个 worker 的本地结果就宣布完成。
