# 审查路由标准

## 职责

本标准定义 planned task、wave、feature 或 release 在收口前如何触发 self-review、subagent review、外部 agent review 或人工审查。`adversarial-review-standard.md` 规定 `review.md` 怎么写；本文件规定谁来写、什么时候必须写、什么时候可以跳过。

## 默认规则

每个 planned task / wave / feature 收口前默认执行 closeout review：

1. 主 agent 完成 self-review。
2. 主 agent 调用 reviewer 或只读 subagent 做外部视角审查。
3. reviewer 按 `adversarial-review-standard.md` 写入或补全 `review.md`。
4. 主 agent 修复或路由 material findings。
5. 重跑对应证据。
6. 再次执行 `Confidence Challenge`，直到没有 open material findings。

当前环境无法调用 subagent 时，必须在 `review.md`、`progress.md` 或 walkthrough 写 `skipped-with-reason`，说明替代审查方式。

## 审查者层级

| 层级 | 审查者 | 适用场景 | 要求 |
| --- | --- | --- | --- |
| L0 | Self-review | 微小变更、只读分析、小文档修正 | 记录在 `progress.md` 或 `review.md`。 |
| L1 | Subagent reviewer | 默认非平凡任务 | 必须写 `review.md`。 |
| L2 | External agent reviewer | 用户或项目要求，例如 Claude Code、Gemini、Codex 另一实例 | 必须写 `review.md`，并记录 `Reviewer Identity`。 |
| L3 | Human reviewer | 高风险产品、架构、安全、数据、发布判断 | agent 完成内部审查后，明确请求人工判断。 |

## 可写执行者与只读审查者的区别

任务开始时，先读取当前任务 `execution_strategy.md` 的 Subagent Authorization 和 Subagent Delegation Decision，并向用户说明当前授权状态和分工判断。用户不需要知道或主动要求 subagent；coordinator 必须从用户目标主动评估。

审查路由默认把 subagent 当只读 reviewer。只要 subagent 被要求直接改代码、测试、产品文档或 harness 文档，它就不再是 reviewer，而是 worker。
Reviewer subagent 在单个任务内默认允许，可重复用于只读审查。

Worker 必须走 `worktree-standard.md`，并先在 `execution_strategy.md` 记录一次用户授权：

- coordinator 先分配独立 worktree / branch、任务目录和 write scope。
- worker 在自己的 worktree 内实现、验证并提交。
- worker handoff 写明 branch、commit SHA、checks、residual。
- coordinator 负责 merge、冲突处理、最终 gates 和 integration evidence。
- 同一任务、同一范围、同一 worktree/branch 内可复用该授权；范围变化时重新请求授权。
- 如果 worker subagent 对任务有明显帮助但尚未授权，coordinator 必须用白话主动向用户申请一次授权；可以直接说 worker subagent，但不要等用户知道或提醒使用 subagent。
- 如果独立切片已经明显但精确文件路径还不清楚，先确认文件路径，然后在 implementation 前立刻申请独立执行助手授权。
- 一旦 `Would a worker subagent materially help?` 的决策是 `ask-user`，必须暂停 implementation，直到 `User Authorization Decision` 记录 `authorized`、`denied` 或 `not-needed`。

禁止把多个 worker 的未提交改动混在 coordinator 当前 checkout，再由 coordinator 一次性提交。

## 项目级外部审查策略

如果项目长期使用 Claude Code、Gemini、Codex 另一实例或人工 reviewer，必须在本文件记录：

- 默认 reviewer。
- 触发条件。
- reviewer 是否只读。
- reviewer 输出写入位置。
- 主 agent 如何处理分歧。
- 哪些 finding 必须暂停并询问用户。
- 哪些检查必须由 reviewer 亲自看过，不能只听主 agent 摘要。

## 校准流程

引入新外部 reviewer 时，先做一次 calibration：

1. 主 agent 写出任务目标、scope、证据、当前策略和 residual。
2. 外部 reviewer 用 `Confidence Challenge` 挑战策略。
3. 双方对 severity、accepted-risk、stop condition 和 required checks 口径达成一致。
4. 将共识写入项目级 `review-routing-standard.md`。

## 可跳过审查的条件

只有以下情况可以跳过 L1 以上审查：

- 纯只读分析，没有修改仓库。
- 明确的小 typo 或格式修正。
- 用户明确要求不做外部审查。
- 当前环境确实没有可用 reviewer，且已记录替代 self-review 和 residual。

跳过必须写 `skipped-with-reason`，不能留空。

## 收口检查

- [ ] `review.md` 存在，或有明确 `skipped-with-reason`。
- [ ] L1 以上审查已执行，或环境限制已记录。
- [ ] `Reviewer Identity`、`Evidence Checked`、`Confidence Challenge`、`Final Confidence Basis` 已填写。
- [ ] open P0/P1 findings 为 0。
- [ ] material P2 已修复或 `accepted-risk` 并路由。
- [ ] 如使用 worker，已记录 branch、commit SHA、checks、residual 和 integration evidence。
- [ ] walkthrough、Closeout SSoT、Harness Ledger 引用了审查报告或跳过原因。
