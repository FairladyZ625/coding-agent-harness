# 功能 SSoT - [项目名称]

> 功能、wave、用户可见改动和实现残余的单一事实源。开始非平凡功能前先读本文件，收口后必须回写。

## 使用约定

- 只记录当前仍需要决策、执行、验证或追踪的功能项。
- 每个条目必须能指向任务计划、分支或 worktree、验证证据和残余负责人。
- 不在这里记录逐行 diff；实现细节写在任务计划、review、walkthrough 或 PR 中。

## 活跃功能

| 功能 ID | 功能 / Wave | 负责人 | 状态 | 任务计划 | 分支 / Worktree | 验收依据 | 残余路由 | 更新时间 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F-001 | [功能名称] | [负责人] | planned | `docs/09-PLANNING/TASKS/[task]/task_plan.md` | `[branch 或 worktree]` | [验收标准、Regression Gate 或证据路径] | `none` / [负责人 + 后续动作] | YYYY-MM-DD |

## 已完成索引

> 完成项只保留最近一批，便于冷启动。超过 20 行、release 收束或模块并行切换时，移入 `docs/09-PLANNING/_archive/Feature-SSoT-archive-YYYY-QN.md`。

| 功能 ID | 功能 / Wave | 完成日期 | 收口记录 | 关联 Harness ID |
| --- | --- | --- | --- | --- |
| F-001 | [功能名称] | YYYY-MM-DD | `docs/10-WALKTHROUGH/[file].md` | HL-YYYY-MM-DD-001 |

## 归档索引

| 归档文件 | 覆盖范围 | 移入日期 | 说明 |
| --- | --- | --- | --- |
| `docs/09-PLANNING/_archive/Feature-SSoT-archive-YYYY-QN.md` | F-... 至 F-... | YYYY-MM-DD | [说明] |

## 状态说明

- `planned`：已确认进入计划，但尚未开始实现。
- `in-progress`：正在实现或验证。
- `blocked`：被依赖、决策、权限、环境或失败回归阻塞；残余路由必须写清。
- `ready-for-review`：实现完成，等待审查或验证。
- `ready-for-release`：审查和回归完成，等待合并、发布或上线。
- `completed`：已完成并收口，保留索引用于追溯。
- `paused`：暂缓推进，保留负责人和恢复条件。
- `cancelled`：明确取消，说明原因和替代方案。
- `superseded`：被其他功能项取代，必须指向新功能 ID。

## 路由规则

1. 新功能进入实现前，必须有任务计划或明确的轻量豁免原因。
2. 状态进入 `completed` 前，必须有验证证据、残余路由和 closeout 记录。
3. 回归失败或覆盖面变化写入 Regression SSoT，不只写在本表备注里。
4. 可复用流程经验写入 Lessons SSoT，不在本表长篇展开。
5. 多人并行时，只由功能负责人或协调者更新状态字段。
