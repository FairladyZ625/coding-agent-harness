# 回归 SSoT - [项目名称]

> 回归覆盖面、固定 gate、证据深度和未关闭风险的单一事实源。新增 gate、改变触发规则或调整证据深度时必须更新。

## 活跃回归 Gate

| Gate ID | 覆盖面 | 主入口 | 触发场景 | 证据深度 | 上次验证 | 当前结果 | 负责人 | 残余路由 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RG-001 | [覆盖面名称] | `[命令、脚本、URL 或手工步骤]` | [哪些改动必须触发] | L2-local-smoke | YYYY-MM-DD | pass | [负责人] | `none` / [R-...] |

## 未关闭回归残余

| 残余 ID | Gate ID | 问题 | 严重级别 | 负责人 | 创建日期 | 路由 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |

不要保留示例残余。只有真实未关闭回归风险才新增行。

## 证据深度说明

| 等级 | 名称 | 说明 |
| --- | --- | --- |
| L1-tests | 自动化测试或静态检查通过，但没有运行时验证。 |
| L2-local-smoke | 本地环境完成关键路径冒烟。 |
| L3-live | 真实或准真实环境完成端到端验证。 |
| L4-browser-human-proxy | 浏览器或 UI 自动化覆盖接近真人操作的关键流程。 |
| L5-hard-gate | 结构化判定、可重复运行，并以非零退出或明确 verdict 阻断发布。 |

## 归档索引

> 废弃 gate、已关闭残余和历史批次移入 `coding-agent-harness/governance/regression/_archive/Regression-SSoT-archive-YYYY-QN.md`。活跃表只保留仍会影响当前开发和发布判断的内容。

| 归档文件 | 覆盖范围 | 移入日期 | 说明 |
| --- | --- | --- | --- |
| `coding-agent-harness/governance/regression/_archive/Regression-SSoT-archive-YYYY-QN.md` | RG-... / R-... | YYYY-MM-DD | [说明] |

## 结果状态

- `pass`：本次验证通过，无未路由问题。
- `pass-with-residual`：主路径通过，但存在已路由或已接受残余。
- `fail`：验证失败，阻塞相关合并、发布或收口。
- `inconclusive`：证据不足，不能作为通过依据。
- `paused`：gate 暂停执行，必须写清原因和恢复条件。
- `retired`：gate 已废弃，必须归档并说明替代覆盖面。

## 路由规则

1. Cadence Ledger 决定“什么时候触发哪些 gate”；本文件记录 gate 本身和当前事实。
2. 任何 `fail` 或 `inconclusive` 都必须写入未关闭回归残余，除非立即修复并有新证据。
3. 发布阻塞级问题必须同步到 Harness Ledger 和对应任务计划。
4. 接受风险必须有负责人、原因、期限或复查条件。
5. 提升或降低证据深度时，必须记录原因和最近一次验证证据。
