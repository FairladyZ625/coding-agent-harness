# 项目 Harness 总账 - [项目名称]

> 本文件记录非平凡任务是否完成了必要的 harness 上下文回写。它不是变更日志，也不替代 Feature SSoT、Regression SSoT、Lessons SSoT 或 walkthrough。

## 使用约定

- 开始任务时，为需要跨文件、跨模块、跨会话或影响发布质量的工作创建一行。
- 收口任务时，更新任务计划、审查、回归、walkthrough、Lessons 检查和残余路由。
- 不把聊天记录当证据；证据必须指向文件、命令输出、测试报告、PR、commit 或运行时验证记录。
- 其他 worker 同时工作时，只更新自己负责的行；共享行由协调者或明确负责人更新。

## 活跃任务

| Harness ID | 日期 | 任务 | 负责人 | 任务计划 | 审查 | 回归 | Walkthrough / Closeout | Lessons 检查 | 证据 | 残余路由 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HL-YYYY-MM-DD-001 | YYYY-MM-DD | [任务名称] | [负责人] | `docs/09-PLANNING/TASKS/[task]/task_plan.md` | `review.md` / `n/a` | `Regression-SSoT: RG-...` / `n/a` | `docs/10-WALKTHROUGH/[file].md` / 允许的跳过原因 | `checked-created: L-YYYY-MM-DD-001` / `checked-none: [原因]` | [测试、命令、PR、commit 或运行时证据] | `none` / [负责人 + 路径] | [open / closed / blocked] |

## 归档索引

> 活跃表超过 50 行，或一次 release / wave 完成后，将 `closed`、`closed-with-residual`、`closed-local-only`、`superseded` 条目移入季度归档：`docs/01-GOVERNANCE/_archive/Harness-Ledger-archive-YYYY-QN.md`。

| 归档文件 | 覆盖范围 | 移入日期 | 说明 |
| --- | --- | --- | --- |
| `docs/01-GOVERNANCE/_archive/Harness-Ledger-archive-YYYY-QN.md` | HL-... 至 HL-... | YYYY-MM-DD | [说明] |

## 状态说明

- `open`：任务仍在进行，当前行可以继续更新。
- `blocked`：任务或上下文回写被阻塞，必须在“残余路由”写清负责人、下一步和证据。
- `closed`：任务完成，所需上下文和证据已回写，无未路由残余。
- `closed-with-residual`：任务完成，但仍有已接受或已路由的残余。
- `closed-local-only`：本地工作完成但尚未合并、发布或上线；必须写清后续负责人。
- `superseded`：本行被后续 Harness ID 取代，必须指向新行。

## 字段取值

- `任务计划`：填任务计划路径；轻量任务可写 `n/a: [原因]`。
- `审查`：填审查文件、PR review、人工确认，或 `n/a: [原因]`。
- `回归`：填触发的 Regression Gate、Cadence Ledger 批次，或 `n/a: [原因]`。
- `Walkthrough / Closeout`：已关闭任务必须对应 `Closeout-SSoT.md` 行；实现类任务应写 walkthrough。
- `Lessons 检查`：只能写 `checked-created: L-YYYY-MM-DD-NNN` 或 `checked-none: [一句话原因]`。
- `残余路由`：无残余写 `none`；否则写负责人、目标文件或任务、预期处理时间。

## 路由规则

1. 功能进度写入 Feature SSoT，不在本表展开。
2. 回归覆盖面、证据深度和失败项写入 Regression SSoT / Cadence Ledger。
3. 复用性流程经验写入 Lessons SSoT，并创建 lesson 详情文档。
4. 收口证据写入 `docs/10-WALKTHROUGH/Closeout-SSoT.md`。
5. 任意 `closed`、`closed-with-residual`、`closed-local-only` 行都必须能从本表追溯到任务计划、证据和 closeout。
