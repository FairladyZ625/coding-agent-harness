# Long-Running Task Standard

## 目的

本标准定义长程自主执行任务的任务合同、review loop、证据要求、暂停条件和停止条件。

它回答的是：

> 什么样的任务定义，才能支持 agent 在较少人工干预下连续推进？

它不替代 `execution-workflow-standard.md`。

- 本标准负责：任务怎么设计
- `execution-workflow-standard.md` 负责：任务开始后怎么跑

## 何时使用

使用本标准的场景：

- 多轮复杂修复、重构、交付收口
- 预计持续 2 小时以上
- 需要 reviewer agent / subagent / 外部审查者
- 需要多轮 evidence loop
- 用户授权 agent 连续执行，直到满足停止条件再汇报

通常不需要使用的场景：

- 单文件小修
- 一次性命令
- 纯只读分析
- 没有客观验收口径的轻量讨论

## 任务合同字段

每个长程任务开始前，必须在 task plan 或独立 contract 文件中写清：

### Goal

- 本轮只收掉一个主问题
- 不写“整体优化”“尽量改好”这类模糊目标

### Scope

- 允许修改的目录 / 模块 / 接口 / 文档
- 明确 out of scope
- 标出共享文件和冲突风险

### Primary Caller / Entry Surface

明确主要调用者：

- CLI / local agent
- UI / human user
- API / service
- automation / scheduler
- integration / adapter

### Execution Permission

- 是否允许连续执行，不用每轮确认
- 是否允许自动进入下一轮 review/fix/test
- 是否允许启动 reviewer agent 或 subagent
- 哪些动作必须暂停等人确认

### Review Loop

写清每轮闭环和 review report 落点：

1. implement
2. run locally
3. test / smoke / inspect
4. self-review with Confidence Challenge
5. reviewer / subagent review（如适用，并更新 `review.md`）
6. fix findings
7. rerun evidence
8. rerun Confidence Challenge until no open material finding

如使用 reviewer / subagent，必须写清：

- 只审查还是可改代码
- 负责的文件或问题域
- 输出格式
- no-finding 的判断口径
- 是否必须回答“你对这个方案、实现和策略有 100% 的信心吗？”

若 subagent 可改代码、测试、产品文档或 harness 文档，它必须按 worker 合同执行：

- 独立 worktree / branch
- 明确 task directory 和 write scope
- 自己运行 checks
- 提交自己的改动
- handoff 包含 branch、commit SHA、checks、residual risks
- coordinator 合并 worker commit 后运行最终 gates

如果使用 reviewer agent、subagent 或外部审查者，必须在任务目录写 `review.md`，
并按 `adversarial-review-standard.md` 记录 material findings、no-finding statement、
evidence checked 和 residual risk。

### Evidence

列出本轮要求的证据：

- lint / typecheck / build
- unit / integration / e2e tests
- local smoke
- browser or UI inspection
- live environment smoke
- logs / screenshots / traces
- reviewer findings
- `review.md` 中的 material finding 状态与 residual routing
- walkthrough / PR checks

### Stop Condition

停止条件必须可判断：

- 关键路径通过
- 目标 tests / regression gates 通过
- runtime / console / request errors 清零或有明确残项
- reviewer 无 material findings
- `review.md` 已完成，且无 open P0/P1 finding
- residual risks 已记录且不阻塞目标

### Deliverables

- code
- tests / regression evidence
- docs updates
- planning progress / findings
- review report（如适用）
- worker branch / commit SHA / integration evidence（如使用 worker subagent）
- walkthrough
- Harness Ledger
- PR / commit / release note
- residual risk summary

## 暂停条件

即使已授权连续执行，出现以下情况必须暂停并汇报：

- Goal 或 Scope 失效
- 需要高风险产品、架构、安全或数据决策
- 与未知未提交改动冲突
- stop condition 不再适用
- 环境、权限、配额、外部依赖阻塞
- reviewer finding 改变了任务方向

## 反模式

- “你先看看，能改多少改多少”
- “整体优化一下”
- “差不多就行”
- “不用测”
- “你自己把握什么时候完成”

长程任务的原则是：开放执行，封闭验收；多轮证据，不靠感觉。

## 项目落地规则

- `execution-workflow-standard.md` 在开始任务前要求判断是否属于长程任务
- `docs/09-PLANNING/TASKS/_task-template/` 包含 long-running task contract 模板
- `docs/09-PLANNING/TASKS/_task-template/` 包含 `review.md` 模板
- `docs/11-REFERENCE/adversarial-review-standard.md` 定义 reviewer 报告规范
- regression / testing 标准能提供可复查证据，而不是只依赖主观判断
- `docs/Harness-Ledger.md` 记录长程任务是否完成必要的上下文回写
