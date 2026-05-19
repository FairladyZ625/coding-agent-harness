# 回归节奏总账 - [项目名称]

> 本文件定义“什么改动触发哪些回归 gate”。Regression SSoT 记录 gate 本身；本文件记录触发规则和批次执行历史。

## 使用约定

- 新增、删除或调整 Regression Gate 时，同步更新本文件。
- 改动范围命中多条规则时，按并集触发，不做最小化猜测。
- 如果因为时间、环境或权限跳过触发项，必须写入批次日志和残余路由。

## 触发规则

| 改动范围 | 必跑 Gate | 可选 / 条件 Gate | 触发说明 | 负责人 |
| --- | --- | --- | --- | --- |
| [范围1，如 API 路由层] | RG-001, RG-003 | RG-010（仅涉及鉴权时） | [为什么需要这些 gate] | [负责人] |
| [范围2，如前端关键流程] | RG-005 | RG-006（移动端布局变化时） | [说明] | [负责人] |
| [范围3，如数据库 schema] | RG-001, RG-002, RG-004 | `none` | [说明] | [负责人] |
| 任何 merge 到主干 | 全量共享批次 | [项目自定义] | 主干合并前或合并后固定批次 | [负责人] |

## 共享回归批次日志

| 批次 ID | 日期 | 范围 | 触发条件 | 执行 Gate | 结果 | 证据 | 残余路由 | 下一检查点 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| SRB-001 | YYYY-MM-DD | 全量 | 初始化基线 | RG-001, RG-002 | pass | [命令、报告或链接] | `none` | SRB-002 after [条件] |

## 归档索引

> 批次日志超过 50 行或完成阶段收口时，移入 `docs/05-TEST-QA/_archive/Cadence-Ledger-archive-YYYY-QN.md`。

| 归档文件 | 覆盖批次 | 移入日期 | 说明 |
| --- | --- | --- | --- |
| `docs/05-TEST-QA/_archive/Cadence-Ledger-archive-YYYY-QN.md` | SRB-... 至 SRB-... | YYYY-MM-DD | [说明] |

## 结果状态

- `pass`：触发 gate 全部通过。
- `pass-with-residual`：通过主判断，但有已路由残余。
- `fail`：至少一个必跑 gate 失败。
- `partial`：只执行了部分触发 gate，必须说明缺口。
- `skipped-with-reason`：未执行，必须写明原因、负责人和补跑条件。
- `inconclusive`：执行了但证据不足，不能作为通过依据。

## 路由规则

1. `fail`、`partial`、`skipped-with-reason`、`inconclusive` 都必须路由到 Regression SSoT、任务计划或 Harness Ledger。
2. 全量共享批次的定义变化必须经过负责人确认，并记录在 Harness Ledger。
3. 发布前采用最近一次相关批次作为依据；过期证据不能直接复用。
4. 批次日志只记录执行事实，具体失败分析写入 Regression SSoT 或 review。
