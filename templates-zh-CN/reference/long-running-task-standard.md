# 长程任务标准

## 目的

本标准定义长程自主执行任务的任务合同、review loop、证据要求、暂停条件和停止条件。它回答的是：什么样的任务定义，才能支持 agent 在较少人工干预下连续推进，同时不丢失边界、证据和收口判断。

本标准负责“任务怎么设计”；`execution-workflow-standard.md` 负责“任务开始后怎么跑”。

## 适用场景

使用本标准：

- 多轮复杂修复、重构、迁移、交付收口。
- 预计持续 2 小时以上。
- 需要 reviewer agent、subagent、外部 agent 或人工审查。
- 需要多轮 evidence loop 或 live smoke。
- 用户授权 agent 连续执行，直到满足 stop condition 再汇报。

通常不需要：

- 单文件小修。
- 一次性命令。
- 纯只读分析。
- 没有客观验收口径的轻量讨论。

## 任务合同字段

### 目标

- 只定义本轮要收掉的主问题。
- 避免“整体优化”“尽量改好”“看情况处理”这类不可验收目标。

### 范围

- 写明允许修改的目录、模块、接口、文档和配置。
- 写明 out of scope。
- 标出共享文件、跨仓契约和冲突风险。
- 当前工作树有他人改动时，必须说明如何避开或协同。

### 主要调用者和入口

明确本轮覆盖哪些 primary caller / entry：

- CLI / local agent
- UI / human user
- API / service
- automation / scheduler
- integration / adapter
- CI/CD / release workflow

### 执行权限

写清：

- 是否允许连续执行，不用每轮确认。
- 是否允许自动进入下一轮 review / fix / test。
- 是否允许启动 reviewer、subagent 或外部 agent。
- 哪些动作必须暂停等人确认，例如生产数据、权限、安全、费用、发布。

### 审查循环

每轮闭环至少包含：

1. 实现当前切片。
2. 本地运行或启动对应目标。
3. 执行测试、冒烟检查或人工检查。
4. 用 `Confidence Challenge` 做自审。
5. 触发 reviewer / subagent review（如适用，并更新 `review.md`）。
6. 修复重要发现。
7. 重新收集证据。
8. 重跑 `Confidence Challenge`，直到没有 open 重要发现。

如使用 reviewer 或 subagent，必须写清：

- 只读审查还是可改代码。
- 负责的文件、模块或问题域。
- 输出格式和落点。
- no-finding 的判断口径。
- 是否必须回答 100% 信心挑战。

可写 subagent worker 必须走 worker 合同：

- 独立 worktree / branch。
- 明确 task directory 和 write scope。
- 自己运行 required checks。
- 提交自己的改动。
- handoff 包含 branch、commit SHA、checks、residual。
- coordinator 合并 worker commit 后运行最终 gates。

### 证据

列出本轮要求的证据：

- lint / typecheck / build
- unit / integration / e2e tests
- 本地冒烟
- 浏览器或 UI 检查
- 线上环境冒烟
- 日志、截图、trace
- 审查者发现
- `review.md` 中的重要发现状态与残余路由
- PR 检查或 workflow 运行记录
- walkthrough 和 Harness Ledger 更新

### 停止条件

stop condition 必须可判断：

- 关键路径通过。
- 目标 tests / regression gates 通过。
- runtime、console、request errors 清零，或有明确 residual。
- reviewer 无 open material findings。
- `review.md` 已完成，且无 open P0/P1 finding。
- residual 已记录 owner、后续路径和不阻塞理由。

### 交付物

- code
- tests / regression evidence
- docs updates
- `progress.md` / `findings.md`
- `review.md`（如适用）
- worker branch / commit SHA / integration evidence（如使用 worker）
- walkthrough
- Harness Ledger
- PR / commit / release note
- residual summary

## 暂停条件

即使已授权连续执行，出现以下情况也必须暂停并汇报：

- 目标、范围或 stop condition 失效。
- 需要高风险产品、架构、安全、数据或发布决策。
- 与未知未提交改动冲突。
- 权限、配额、外部依赖、环境阻塞。
- reviewer finding 改变了任务方向。
- required evidence 无法获得，且没有可接受替代证据。

## 反模式

- “你先看看，能改多少改多少。”
- “整体优化一下。”
- “差不多就行。”
- “不用测。”
- “你自己把握什么时候完成。”

长程任务的原则是：开放执行，封闭验收；多轮证据，不靠感觉。

## 项目落地要求

- 开始任务前必须判断是否属于长程任务。
- 任务模板应包含 long-running task contract 和 `review.md` 模板。
- reviewer 报告按 `adversarial-review-standard.md` 写。
- 回归和测试标准必须提供可复查证据。
- Harness Ledger 必须记录长程任务是否完成必要上下文回写。
