# 收口 SSoT - [项目名称]

> 任务收口证据的单一事实源。每个已关闭的 Harness Ledger 行都必须在这里有对应记录。

## 活跃收口

| Harness ID | 日期 | 任务 | 任务计划 | 审查报告 | 收口记录 | 证据 | 残余路由 | Lessons 检查 | 收口状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| HL-YYYY-MM-DD-001 | YYYY-MM-DD | [任务名称] | `docs/09-PLANNING/TASKS/[task]/task_plan.md` | `review.md` / `n/a: [原因]` | `docs/10-WALKTHROUGH/[file].md` / 允许的跳过原因 | [测试、命令、review、运行时证据] | `none` / [负责人 + 路由] | `checked-created: L-YYYY-MM-DD-001` / `checked-none: [原因]` | [open / closed / blocked] |

## 允许的 walkthrough 跳过原因

- `walkthrough skipped-with-reason: docs-only`
- `walkthrough skipped-with-reason: no-runtime`
- `walkthrough skipped-with-reason: superseded`
- `walkthrough skipped-with-reason: historical-backfill`
- `walkthrough skipped-with-reason: owner-deferred`

## 状态说明

- `open`：收口材料仍在整理。
- `closed`：证据、残余和 Lessons 检查已完成。
- `closed-with-residual`：收口完成，但仍有已路由残余。
- `blocked`：缺少必要证据或负责人决策，暂不能收口。
- `superseded`：被后续 closeout 行取代。

## 归档索引

> 活跃收口表超过 50 行，或 release / wave 完成后，将已关闭条目移入 `docs/10-WALKTHROUGH/_archive/Closeout-SSoT-archive-YYYY-QN.md`。

| 归档文件 | 覆盖 Harness ID | 移入日期 | 说明 |
| --- | --- | --- | --- |
| `docs/10-WALKTHROUGH/_archive/Closeout-SSoT-archive-YYYY-QN.md` | HL-... 至 HL-... | YYYY-MM-DD | [说明] |

## 路由规则

1. 每个 `closed`、`closed-with-residual` 或 `closed-local-only` 的 Harness Ledger 行都必须在本文件有一行。
2. 实现类任务应写 walkthrough；跳过原因只用于受限场景，不用于省略收口。
3. `证据` 必须列出实际检查、冒烟、review、运行时验证或发布证据。
4. `残余路由` 必须写 `none`，或指向负责人、任务、Regression SSoT、Harness Ledger、issue 或接受风险记录。
5. `Lessons 检查` 只能写 `checked-candidate: LC-...`、`queued-promotion: LC-...`、`checked-created: L-YYYY-MM-DD-NNN`，或旧任务兼容的 `checked-none: [原因]`。
6. `checked-created` 必须同时存在 Lessons SSoT 行和 lesson 详情文档；`queued-promotion` 必须能追溯到任务目录 `lesson_candidates.md`。
