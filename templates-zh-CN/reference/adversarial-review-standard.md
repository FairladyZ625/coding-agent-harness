# 对抗性审查标准

## 职责

本标准规定 reviewer、只读 subagent、外部 agent 或人工审查者如何在任务收口前挑战方案、实现、证据和残余风险。审查报告不是进度记录，也不是 walkthrough；它的作用是把“还有没有会改变交付判断的问题”说清楚。

审查报告默认写入：

```text
{{paths.harnessRoot}}/planning/tasks/<YYYY-MM-DD-任务名>/review.md
```

审查路由由 `review-routing-standard.md` 决定；本文件只规定审查报告怎么写、什么结论可以收口。

## 必须触发的场景

- 长程任务合同包含 review loop。
- 任务触及架构、数据、安全、权限、部署、迁移、CI/CD 或跨模块契约。
- release 前验证、live smoke、browser inspection、回归 gate 或 required checks 暴露过问题。
- 使用 reviewer agent、subagent、外部 agent 或人工审查者。
- 用户明确要求审查、对抗性审查或独立复核。

## 审查核心问题

每轮审查都必须回答：

> 你对当前方案、实现、证据和收口策略是否有 100% 信心？如果没有，列出所有可能改变交付判断的漏洞，给出修复或路由建议，并继续循环，直到没有 open material findings。

这里的 100% 信心只表示在当前目标、范围和证据下没有发现阻塞性漏洞；不能用主观感觉替代证据。

## 报告字段

| 字段 | 中文说明 | 要求 |
| --- | --- | --- |
| `Reviewer Identity` | 审查者身份 | 写明 reviewer 类型、模型或人员、是否只读、审查时间。 |
| `Review Scope` | 审查范围 | 写明审查对象、目标、out of scope、输入材料。 |
| `Confidence Challenge` | 信心挑战 | 回答 100% 信心问题，列出挑战过程和循环次数。 |
| `Evidence Checked` | 已核验证据 | 列出实际看过的文件、命令、日志、截图、PR、CI 结果。 |
| `Material Findings` | 重要发现 | 记录 P0/P1 以及会改变 stop condition 的 P2。 |
| `Required Checks` | 必需检查 | 标明哪些检查必须重跑，哪些检查可 residual。 |
| `Final Confidence Basis` | 最终信心依据 | 说明为什么可以或不可以收口。 |
| `Residual` | 残余风险 | 写明已接受残余、owner、后续路由和不阻塞理由。 |

## 严重级别

| 级别 | 含义 | 收口规则 |
| --- | --- | --- |
| P0 | 数据损坏、安全事故、生产不可用、错误发布 | 必须停下，不能收口。 |
| P1 | 核心路径、关键契约或主要验收标准被破坏 | 必须修复并重跑证据。 |
| P2 | 明确回归、维护风险或验证不足 | 必须修复，或写成 `accepted-risk` 并路由。 |
| P3 | 质量建议、可读性问题、非阻塞改进 | 可作为后续任务，不阻塞本轮。 |

`material findings` 指 P0/P1，以及任何会改变 stop condition 的 P2。

## 发现状态

`review.md` 的 `Disposition` 只允许使用：

- `open`
- `mitigated`
- `closed`
- `deferred`
- `accepted-risk`
- `not-reproducible`
- `out-of-scope`

`accepted-risk` 必须写明为什么不阻塞本轮目标，并路由到 task、SSoT、Regression SSoT、lesson candidates/detail docs 或后续 PR。

## 无发现结论

没有 material findings 时，也必须显式写：

```text
No material findings. 当前证据覆盖了本轮 stop condition，未发现阻塞收口的问题。
```

如果证据不足，不能写无发现；应写成 residual 或 blocked。

## 收口门槛

任务不能在以下状态收口：

- 存在 `open` 的 P0/P1 finding。
- material P2 没有修复，也没有 `accepted-risk` 和后续路由。
- 长程任务合同要求 review loop，但没有 `review.md`。
- 缺少 `Confidence Challenge` 或 `Final Confidence Basis`。
- 缺少 `Evidence Checked`，或证据只来自聊天记录。
- finding 修复后没有重跑对应证据。
- walkthrough、Closeout Index 或 Harness Ledger 没有引用审查结果或跳过原因。
