# 模块注册表 - [项目名称]

> 并行模块开发的冷启动入口。它记录模块负责人、分支、写入范围、当前步骤和协调者同步状态。

## 使用约定

- 模块 worker 开始前先读本表，确认自己的写入范围和共享文件限制。
- worker 只更新自己模块内的计划、进度和交接文件；本注册表通常由协调者或明确的共享锁负责人更新。
- 写入范围必须互不重叠；有交集时先解决负责人和集成顺序，再启动开发。

## 活跃模块

| 模块 Key | 模块名称 | ID 前缀 | 分支 / Worktree | 当前步骤 | 状态 | 写入范围 | 负责人 | Coordinator 备注 | 更新时间 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| example | 示例模块 | EXM | `codex/example` | EXM-01 | planned | `src/features/example/` | [负责人] | [需要同步的总表项或共享风险] | YYYY-MM-DD |

## 共享范围 / 锁

| 范围 | 当前负责人 | 允许动作 | 释放条件 | 状态 |
| --- | --- | --- | --- | --- |
| `[共享文件或目录]` | [负责人] | [只读 / 可编辑 / coordinator-only] | [测试、合并或交接条件] | [open / released / blocked] |

## 归档索引

> 完成、取消或合并进其他模块的条目移入 `coding-agent-harness/planning/modules/_archive/Module-Registry-archive-YYYY-QN.md`。

| 归档文件 | 覆盖模块 | 移入日期 | 说明 |
| --- | --- | --- | --- |
| `coding-agent-harness/planning/modules/_archive/Module-Registry-archive-YYYY-QN.md` | [模块 Key 范围] | YYYY-MM-DD | [说明] |

## 状态说明

- `planned`：模块已规划，尚未启动。
- `in-progress`：有活跃 worker 正在开发。
- `blocked`：依赖、共享范围、测试或 review 阻塞。
- `ready-for-sync`：模块工作完成，等待协调者同步总表或集成。
- `integrating`：正在合并、解决冲突或跑集成验证。
- `completed`：模块完成并已收口，可归档。
- `paused`：暂停推进，保留恢复条件。
- `cancelled`：取消模块，必须说明替代路径。

## 路由规则

1. 共享基础设施修改走 `_shared` 任务或共享锁，不归入普通模块范围。
2. 模块状态变化要有对应的 module plan、progress、review 或 evidence 证据。
3. `ready-for-sync` 不能直接等同完成；协调者同步后才能标记 `completed`。
4. 写入范围变化必须先更新本表，再让 worker 修改文件。
5. 模块完成后，收口证据回写 Harness Ledger、Closeout Index 和必要的 Feature / Regression SSoT。
