# 交付 SSoT - [项目名称]

> 面向多人、多 agent、多仓或多模块交付的协调单一事实源。它回答“谁负责哪块、写哪里、依赖谁、按什么顺序集成”。

## 交付模型

| 字段 | 当前值 |
| --- | --- |
| 交付模型 | [solo-orchestrator / team-feature-lead / split-repo-contract / program-multi-repo / kanban-continuous / 其他] |
| 计划负责人 | [负责人] |
| 集成负责人 | [负责人] |
| 仓库拓扑 | [单仓 / 多仓 / 上下游仓 / 前后端分离] |
| 当前窗口 | [sprint、stage、release、日期范围] |
| 共享文件策略 | [coordinator-only / shared-lock-owner / contract-first / 其他] |

## 活跃交付块

| 工作块 ID | 功能 / 工作块 | 负责人 | Agent 范围 | 仓库 / 目录 | 依赖 | 共享文件 / 合同 | 集成顺序 | 验收 Gate | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| DB-001 | [工作块名称] | [负责人] | [允许编辑范围] | `[repo 或 path]` | [DB-...] / `none` | [共享文件、接口合同或锁负责人] | 1 | [测试、review、Regression Gate] | planned |

## 跨仓 / 跨模块合同

| 合同 ID | 生产方 | 消费方 | 事实源 | 兼容规则 | 验证方式 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| DC-001 | [repo/module] | [repo/module] | [OpenAPI、类型、schema、文档路径] | [向后兼容、版本策略、迁移规则] | [命令、测试、人工验收] | draft |

## 集成队列

| 顺序 | 工作块 ID | PR / Branch / Worktree | 合并前必需项 | 集成负责人 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | DB-001 | `[branch 或 PR]` | [review、测试、合同验证] | [负责人] | waiting |

## 归档索引

> 已完成交付块在 release 或阶段收口后移入 `{{paths.harnessRoot}}/planning/_archive/Delivery-SSoT-archive-YYYY-QN.md`，活跃表只保留当前仍会影响集成决策的内容。

| 归档文件 | 覆盖范围 | 移入日期 | 说明 |
| --- | --- | --- | --- |
| `{{paths.harnessRoot}}/planning/_archive/Delivery-SSoT-archive-YYYY-QN.md` | DB-... 至 DB-... | YYYY-MM-DD | [说明] |

## 状态说明

- `planned`：已纳入交付计划，尚未分配或启动。
- `assigned`：已分配负责人和写入范围。
- `in-progress`：正在实现或验证。
- `blocked`：依赖、合同、权限、环境或审查阻塞。
- `ready-for-integration`：工作块完成，等待集成负责人合并。
- `integrating`：正在合并、解决冲突或跑集成验证。
- `integrated`：已集成，等待 release / closeout。
- `closed`：已完成交付收口。
- `superseded`：被其他工作块或合同取代。

## 路由规则

1. 工作块范围必须互不重叠；共享文件必须指定唯一负责人或走合同优先。
2. 依赖未满足时不得标记 `ready-for-integration`。
3. 跨仓接口变化必须有合同条目，不能只靠聊天说明。
4. 集成队列是合并顺序来源；临时改顺序必须更新本文件。
5. 完成后的证据和残余同步回 Harness Ledger 与 Closeout Index。
