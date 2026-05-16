# Review Routing Standard

## 职责

本标准定义任务结束前如何触发 reviewer / subagent / external agent / human review。

`adversarial-review-standard.md` 定义 `review.md` 怎么写；本文件定义谁来写、什么时候必须写、外部 reviewer 怎么纳入项目规则。

## 默认规则

每个 planned task / wave / feature 收口前必须执行 closeout review：

1. 主 agent 完成 self-review。
2. 主 agent 调用 reviewer / subagent 做外部视角审查。
3. reviewer 按 `adversarial-review-standard.md` 写入或补全 `review.md`。
4. 主 agent 修复或路由 material findings。
5. 再次运行 Confidence Challenge，直到没有 open material finding。

若当前环境无法调用 subagent，必须在 `review.md` 或 `progress.md` 写
`skipped-with-reason`。

## Reviewer 层级

| 层级 | Reviewer | 适用场景 | 要求 |
|------|----------|----------|------|
| L0 | Self-review | 微小变更 | 写入 `progress.md` 或 `review.md` |
| L1 | Subagent reviewer | 默认非平凡任务 | 必须写 `review.md` |
| L2 | External agent reviewer | 用户或项目要求，如 Claude Code / Gemini / Codex 另一实例 | 必须写 `review.md`，并记录 reviewer identity |
| L3 | Human reviewer | 高风险产品、架构、安全、数据、发布判断 | Agent 必须在内部审查结束后明确询问是否需要人工审查 |

## Subagent Worker Routing

Review routing 默认把 subagent 当 reviewer。若 subagent 被要求直接改代码、测试、产品文档
或 harness 文档，它不再是 reviewer，而是 worker。

Worker 必须走 `worktree-standard.md`：

- coordinator 先分配独立 worktree / branch、任务目录和 write scope
- worker 在自己的 worktree 内实现、验证并提交
- worker handoff 写入 branch、commit SHA、checks、residual risks
- coordinator 负责 merge / conflict resolution / final gates

禁止把多个 worker 的未提交改动混在 coordinator 当前 checkout，再由 coordinator 一次性提交。

## 项目级外部 reviewer policy

如用户指定 Claude Code、Gemini、Codex 另一实例或人工作为长期 reviewer，必须在项目级本文件中记录：

- 默认 reviewer
- 触发条件
- reviewer 是否只读
- reviewer 输出写入位置
- 主 agent 如何处理分歧
- 哪些 finding 必须暂停并询问用户

## 校准流程

引入新外部 reviewer 时，先做一次 calibration：

1. 主 agent 写出任务目标、scope、证据和当前策略。
2. 外部 reviewer 用 Confidence Challenge 挑战策略。
3. 双方对 severity、accepted residual、stop condition 口径达成一致。
4. 将共识写入项目级 `review-routing-standard.md`。

## Closeout Checklist

- [ ] `review.md` 存在，或有明确 `skipped-with-reason`
- [ ] L1 subagent review 已执行，或环境限制已记录
- [ ] Confidence Challenge 已回答并记录 final confidence basis
- [ ] open P0/P1 findings 为 0
- [ ] material P2 已修复或 accepted residual 并路由
- [ ] 如使用 worker subagent，已记录 worker branch、commit SHA、checks 和 integration evidence
- [ ] walkthrough / Harness Ledger 引用了 review report 或 skip reason
