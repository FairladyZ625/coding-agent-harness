# 项目总账

## 用途

本文件是自动生成的任务生命周期总索引。人类查看当前状态应优先使用 Dashboard；Agent 快速检索应使用 `task-list`、`task-index` 或这张 generated ledger。

本文件不是手写工作日志。不要手工编辑生命周期行。需要改变事实时，更新任务本地文件（`task_plan.md`、`progress.md`、`review.md`、`lesson_candidates.md`、closeout / walkthrough 证据），然后运行 `harness governance rebuild --archive --apply`。

Repo Governance / CI-CD 变化仍通过对应 reference 和任务证据路由。Regression gate、交付顺序、回归节奏、closeout 合同和模块所有权继续保留在各自治理文件中，除非未来提供等价的 scanner-supported fact。

## 活跃总表

| ID | Scope | Module | Task | State | Queues | Plan | Review | Lessons Check | Closeout | Residual | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HL-YYYY-MM-DD-001 | task | none | 短任务标题 | planned | none | docs/09-PLANNING/TASKS/.../task_plan.md | pending | pending | pending | none | YYYY-MM-DD |

## 字段规则

- `Scope`：根 planning 任务为 `task`，模块内任务为 `module`。
- `Module`：模块 key；非模块任务写 `none`。
- `Queues`：scanner 派生的生命周期队列；用 `harness task-list --queue` 查询。
- `Review`、`Lessons Check`、`Closeout`、`Residual`：scanner 派生摘要和路由；详细证据留在任务本地文件。
- `Updated`：生成日期，不是人工编辑时间。

## 旧表

`Feature-SSoT.md` 和 `Private-Feature-SSoT.md` 是旧任务生命周期投影。当前 Harness 版本在 `harness governance rebuild --archive --apply` 时归档它们，不再重新生成。
