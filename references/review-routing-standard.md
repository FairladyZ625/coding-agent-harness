# Review Routing Standard

## 核心思路

`adversarial-review-standard.md` 定义 review report 怎么写；本标准定义 review 怎么触发、谁来审、外部 reviewer 如何纳入项目规则。

每个 planned task / wave / feature 结束前，必须自动进入 closeout review。默认最低要求是：

1. 主 agent 完成 self-review。
2. 主 agent 调用 reviewer / subagent 做外部视角审查。
3. reviewer 按 `adversarial-review-standard.md` 写入或补全 `review.md`。
4. 主 agent 修复或路由 material findings。
5. 再次运行 Confidence Challenge，直到没有 open material finding。

## 触发规则

必须触发 closeout review：

- planned task / wave / feature 收口
- 长程任务每轮进入 stop condition 判断前
- 涉及架构、数据、安全、权限、部署、迁移、跨模块契约
- release / PR / merge 前
- 用户明确要求 review / 外部审查 / 人工审查

轻量单文件修复可以只做 self-review，但必须在 `progress.md` 写明跳过 subagent / external reviewer 的理由。

## Reviewer 层级

| 层级 | Reviewer | 适用场景 | 要求 |
|------|----------|----------|------|
| L0 | Self-review | 微小变更 | 写入 `progress.md` 或 `review.md` |
| L1 | Subagent reviewer | 默认非平凡任务 | 必须写 `review.md` |
| L2 | External agent reviewer | 用户或项目要求，如 Claude Code / Gemini / Codex 另一实例 | 必须写 `review.md`，并记录 reviewer identity |
| L3 | Human reviewer | 高风险产品、架构、安全、数据、发布判断 | Agent 必须在内部审查结束后明确询问是否需要人工审查 |

默认策略：planned task 至少 L1。若当前环境无法调用 subagent，必须记录
`skipped-with-reason`，并升级 self-review 的 Confidence Challenge 严格度。

## Subagent Worker Routing

本标准默认把 subagent 当 reviewer：只读审查、写 `review.md`、报告 material findings。

如果 subagent 被要求直接改代码、测试、产品文档或 harness 文档，它就不是 reviewer，
而是 worker。Worker 必须按 `worktree-parallel.md` / 项目级 `worktree-standard.md`
执行：

- coordinator 先分配独立 worktree / branch、任务目录和 write scope
- worker 只在自己的 worktree 内实现、验证并提交
- handoff 必须包含 worktree path、branch、commit SHA、checks、residual risks
- coordinator 负责 merge / conflict resolution / final gates

禁止把多个 worker 的未提交改动混在 coordinator 当前 checkout，再由 coordinator 一次性提交。

## 外部审查人工触发

如果用户要求外部审查或人工审查，Agent 不应把这当成一次聊天请求。它应转化为项目规则：

1. 在当前任务的 `review.md` 记录触发来源和审查范围。
2. 如果是一次性审查，按本轮任务执行。
3. 如果用户希望长期遵循，创建或更新项目级 `docs/11-REFERENCE/review-routing-standard.md`。
4. 在 `AGENTS.md` 的 Task-Type Reading Matrix 中加入 reviewer routing 入口。
5. 在 Harness Ledger 记录该规则变更。

## 项目级 reviewer policy

项目可以指定默认外部 reviewer，例如：

- Claude Code 负责架构和实现策略外部审查
- Gemini 负责 web / dependency / ecosystem research 交叉检查
- Codex subagent 负责代码 diff、测试缺口和回归风险
- Human reviewer 负责产品方向、安全和发布 gate

项目级 policy 必须写清：

- 默认 reviewer
- 触发条件
- reviewer 是否只读
- reviewer 输出写入位置
- 主 agent 如何处理分歧
- 哪些 finding 必须暂停并询问用户

## 两方校准

当引入新的外部 reviewer 时，应先执行一次 calibration：

1. 主 agent 写出任务目标、scope、证据和当前策略。
2. 外部 reviewer 用 Confidence Challenge 挑战策略。
3. 双方对 finding severity、accepted residual、stop condition 口径达成一致。
4. 将共识写入项目级 `review-routing-standard.md`。

校准不是长期讨论。它的目标是形成后续可执行规则。

## Closeout Checklist

任务收口前必须确认：

- [ ] `review.md` 存在，或有明确 `skipped-with-reason`
- [ ] L1 subagent review 已执行，或环境限制已记录
- [ ] Confidence Challenge 已回答并记录 final confidence basis
- [ ] open P0/P1 findings 为 0
- [ ] material P2 已修复或 accepted residual 并路由
- [ ] 如使用 worker subagent，已记录 worker branch、commit SHA、checks 和 integration evidence
- [ ] walkthrough / Harness Ledger 引用了 review report 或 skip reason
