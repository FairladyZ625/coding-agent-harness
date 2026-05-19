# 验证器输出（Verifier）

## 验证器元信息（Verifier Metadata）

- template_id: harness-verifier/v1
- verifier: [agent / tool / human]
- target: [task / PR / release]
- verdict: pass / fail / inconclusive
- date: YYYY-MM-DD
- confidence_basis: `self-check | verifier-backed | adversarial-reviewed | human-approved`

## 检查范围

[说明本次 verifier 检查了什么、没有检查什么、哪些证据被视为有效依据。]

## 已检查的不变量

| 不变量 | 证据 | 结果 |
| --- | --- | --- |
| 没有未关闭的发布阻塞级 P0 / P1 / material-P2 | review、命令、fixture、PR 或运行时验证 | pass / fail / inconclusive |

## 发现记录

| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

允许的 `处理方式`：`open`、`mitigated`、`closed`、`deferred`、`accepted-risk`、`not-reproducible`、`out-of-scope`。
不要保留示例 finding。若无发现，只保留表头，并在 `Final Confidence Basis` 中说明无发现依据。

## 残余路由

| 残余 | 负责人 | 到期 / 复查条件 | 是否接受风险 | 路由位置 |
| --- | --- | --- | --- | --- |
| [风险或未验证项] | [负责人] | [日期或条件] | yes / no | [任务、SSoT、issue、PR 或 Harness ID] |

## 最终信心依据（Final Confidence Basis）

[用中文说明为什么当前 verdict 成立。必须引用实际证据；如果 verdict 是 `inconclusive`，写清缺少什么证据以及下一步由谁补齐。]
