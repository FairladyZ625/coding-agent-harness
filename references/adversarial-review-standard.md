# Adversarial Review Standard

## 核心思路

对抗性审查不是普通总结，也不是 walkthrough。它是任务完成前的独立挑战环节：
主动寻找错误假设、边界遗漏、回归风险、证据缺口和过早收口。

每个需要 reviewer agent、subagent、外部审查者或多轮 hardening 的任务，都必须写
`review.md`。这是 reviewer 的一等交付物，不应只散落在 `progress.md` 或对话记录里。

## 存放位置

标准位置：

```text
coding-agent-harness/planning/tasks/<YYYY-MM-DD-任务名>/review.md
```

任务目录中的文件职责：

- `task_plan.md`：目标、范围、步骤、验收标准
- `findings.md`：研究发现和技术决策
- `progress.md`：执行过程和验证记录
- `review.md`：对抗性审查报告、findings、no-finding 结论和残余风险
- `long-running-task-contract.md`：连续执行合同（仅长程任务需要）

## 何时必须写

以下情况必须写 `review.md`：

- 使用 reviewer agent、subagent 或外部审查者
- 长程任务合同中包含 review loop
- 任务触及共享架构、数据、安全、权限、部署、迁移或跨模块契约
- regression gate、live smoke、browser inspection 或 release 前验证暴露过问题
- 用户明确要求“review”“审查”“对抗性审查”“再挑一遍问题”

轻量单文件修复可以在 `progress.md` 写自审结论，但如果发现 material risk，应升级为
`review.md`。

## 审查姿态

Reviewer 必须以找问题为目标，而不是证明实现正确。

每轮对抗性审查必须先使用 Confidence Challenge：

> 你对这个方案、实现和策略有 100% 的信心吗？如果没有，找出所有可能的漏洞，提出适当的修复建议，并运行这个循环，直到你对新策略事实上有 100% 的信心。

这里的“100% 信心”不是主观自信，而是基于当前 scope、证据和已知风险的工程判断：

- 不允许直接回答“有信心”来跳过审查。
- 如果存在任何可验证的漏洞、证据缺口或未处理的 material risk，必须写入 findings。
- 修复建议必须具体到代码、测试、文档、回归或后续任务路由。
- 每轮修复后必须重新运行 Confidence Challenge，直到没有 open material finding。

审查重点：

1. **Goal / Scope Drift**：实现是否偏离任务目标，是否偷偷扩大或遗漏 scope
2. **Behavioral Regression**：已有行为是否被破坏，尤其是调用方契约和状态流转
3. **Boundary / Security Risk**：权限、输入、路径、网络、数据边界是否有漏洞
4. **Evidence Gap**：测试、smoke、日志、截图或 trace 是否不足以支持结论
5. **Operational Risk**：部署、回滚、配置、迁移、并发、定时任务是否有未验证风险
6. **Maintainability Risk**：实现是否引入难以维护的耦合、重复或隐藏状态

## 报告结构

`review.md` 必须包含：

```markdown
# [任务名称] - Review

## Review Scope
- Reviewer:
- Review type:
- Reviewed refs:
- Out of scope:

## Confidence Challenge
- Question: 你对这个方案、实现和策略有 100% 的信心吗？
- Answer:
- If not 100%, remaining vulnerabilities:
- Fix loop count:
- Final confidence basis:

## Material Findings
| ID | Severity | Area | Finding | Evidence | Required Action | Status |
|----|----------|------|---------|----------|-----------------|--------|

## Non-Material Notes
- [不阻塞但值得记录的问题；如无写"无"]

## Evidence Checked
- [ ] [测试 / smoke / 日志 / 截图 / PR / diff / runtime evidence]

## No-Finding Statement
[如果没有 material finding，明确写：本轮未发现阻塞目标的 material finding。]

## Residual Risk
- [已知残余风险；如无写"无"]

## Follow-Up Routing
- Task Plan:
- Progress:
- Findings:
- Regression SSoT:
- Lesson Candidates / Detail Docs:
- Walkthrough:
```

## Severity 分级

| 级别 | 含义 | 处理规则 |
|------|------|----------|
| P0 | 会导致数据损坏、安全事故、生产不可用或错误发布 | 必须停下，不能继续收口 |
| P1 | 会破坏核心路径、关键契约或主要验收标准 | 必须修复并重跑证据 |
| P2 | 有明确回归或维护风险，但不阻塞主目标 | 记录并判断是否本轮修复 |
| P3 | 质量建议、命名、文档或轻微改进 | 可记录为 follow-up |

Material finding 指 P0/P1，以及任何会改变 stop condition 的 P2。

## 状态规则

每条 finding 的 `Status` 使用以下值：

- `open`
- `fixed`
- `accepted-residual`
- `not-reproducible`
- `out-of-scope`

`accepted-residual` 必须说明为什么不阻塞本轮目标，并路由到后续任务或 SSoT。

## Confidence Loop

Review loop 的固定执行形态：

1. 提出 Confidence Challenge。
2. 如果不是 100% 有信心，列出所有可能漏洞和证据缺口。
3. 将会影响 stop condition 的漏洞写入 Material Findings。
4. 提出具体修复建议，并路由到本轮修复、accepted residual 或后续任务。
5. 修复后重跑相关证据。
6. 再次提出 Confidence Challenge。
7. 直到没有 open material finding，才能写 no-finding statement 或 final confidence basis。

不能把“accepted residual”当作 100% 信心。accepted residual 只表示该风险不阻塞本轮目标，
仍然必须写明原因和后续路由。

## 与其他文档的关系

- `review-routing-standard.md` 决定 reviewer / subagent / external agent / human review 何时触发
- `progress.md` 记录审查发生的时间和处理结果摘要
- `findings.md` 记录审查中产生的技术决策或研究发现
- `Regression-SSoT.md` 记录新增或调整的 regression surface
- `lesson_candidates.md` 和 `coding-agent-harness/governance/lessons/*.md` 记录可复用的流程、架构或标准改进建议
- `walkthrough` 收口时引用 `review.md` 的 material finding 状态和 no-finding 结论
- `Harness Ledger` 记录本轮是否完成 review report

## 停止与收口规则

任务不能在以下状态收口：

- 存在 `open` 的 P0/P1 finding
- reviewer 没有写 `review.md`，但任务合同要求 review loop
- Confidence Challenge 缺失，或没有记录 final confidence basis
- no-finding statement 缺失
- material finding 修复后没有重跑对应证据
- accepted residual 没有后续路由

任务可以收口的最低条件：

- P0/P1 全部 `fixed`、`not-reproducible` 或有明确 `out-of-scope` 理由
- P2 material risk 已修复或 `accepted-residual` 并路由
- `Evidence Checked` 足以支撑 no-finding 或 residual 结论
- walkthrough 和 Harness Ledger 已引用 review report
