# Long-Running Task Standard

## 核心思路

长程任务不是“让 agent 多跑一会儿”，而是把任务先设计成可连续执行、可审查、可停止的合同。

当任务需要持续数小时、多轮 hardening、多 agent 分工或子代理 review 时，必须先把合同写清楚，再开放连续执行权限。

## 适用场景

以下任务应使用本标准：

- 预计持续多轮迭代的复杂修复、重构、交付收口
- 需要连续推进 2 小时以上的任务
- 需要多轮测试、浏览器巡检、真实环境 smoke 或人工代理操作的任务
- 需要 reviewer agent、subagent、外部审查者交叉检查的任务
- 用户希望“不要每轮问我，直到满足停止条件再汇报”的任务

以下任务通常不需要：

- 单文件小修
- 一次性命令执行
- 纯只读分析
- 没有客观验收口径的轻量 brainstorming

## 四个前提

长程任务能稳定推进，需要四件事同时成立：

1. **开放执行权限**：agent 不需要每一轮都回来请求继续。
2. **封闭验收口径**：什么算完成、什么不算完成，事先定义。
3. **持续证据循环**：每一轮都能产生新的可验证证据。
4. **明确停止条件**：agent 知道什么时候继续，什么时候停。

缺任何一项，任务容易过早停下、跑偏、无限扩大 scope，或者在主观细节里打转。

## 任务合同

长程任务开始前，必须在 task plan 或独立 contract 文件中写清以下字段。

### Goal

只回答一个问题：本轮任务到底要收掉什么主问题？

要求：

- 只能有一个主目标
- 不能混入多个并列主目标
- 不能写成“整体优化一下”

### Scope

必须明确：

- 允许修改哪些目录、模块、接口、文档或流程
- 哪些能力面明确 out of scope
- 哪些共享文件需要避免并行冲突

### Primary Caller / Entry Surface

必须判断这轮能力主要面向谁：

- 本机 agent / CLI
- 人类用户 / UI
- 服务调用 / API
- 自动化系统 / scheduler
- 外部集成 / adapter

判断调用者不是为了提前做所有入口，而是避免把主入口设计错。

### Execution Permission

写清 agent 是否可以连续推进：

- 是否可以不用每轮确认
- 是否允许自动进入下一轮 review/fix/test
- 是否允许启动子代理或 reviewer
- 哪些动作仍需人工批准

### Review Loop

定义每一轮的闭环，并写清 review report 的落点。常见组合：

- implement -> test -> self-review -> fix
- implement -> browser/manual smoke -> reviewer agent -> fix
- split work -> independent reviewer -> integration pass -> regression

如果使用子代理，必须写清：

- reviewer 只审查还是可改代码
- reviewer 负责哪些文件或问题域
- 主 agent 如何吸收反馈
- reviewer 是否必须写 `review.md`
- reviewer 是否必须执行 Confidence Challenge：“你对这个方案、实现和策略有 100% 的信心吗？”
- 几轮 review 后才允许停止

如果子代理可改代码、测试、产品文档或 harness 文档，它必须按 worker 合同执行：

- coordinator 先分配独立 worktree / branch、任务目录和 write scope
- worker 只在自己的 worktree 内实现、验证并提交
- handoff 必须包含 worktree path、branch、commit SHA、checks、residual risks
- coordinator 负责 merge / conflict resolution / final gates

只读 reviewer 和可写 worker 不能混用同一个口径。若原本是 reviewer，后来需要改代码，
必须先升级为 worker 并补齐 worktree 合同。

如果 review loop 使用 reviewer agent、subagent 或外部审查者，必须在任务目录写
`review.md`，并按 `docs/11-REFERENCE/adversarial-review-standard.md` 记录 material findings、
no-finding statement、evidence checked 和 residual risk。

### Evidence Depth

写清任务需要哪些证据。常见证据：

- lint / typecheck / build
- unit / integration / e2e tests
- local smoke
- browser or UI inspection
- live environment smoke
- logs / screenshots / traces
- reviewer findings and no-finding confirmation
- `review.md` 中的 material finding 状态与 residual routing
- walkthrough / release notes / PR checks

证据必须能被后来的人复查，不能只写“看起来可以”。

### Stop Condition

停止条件必须是可判断的完成门。

推荐组合：

- 关键路径通过
- 目标 regression gate 通过
- console / request / page / runtime errors 清零或有明确残项
- reviewer 没有 material finding
- `review.md` 已完成，且无 open P0/P1 finding
- 自审没有明显不满意项
- residual items 已记录，且不阻塞本轮目标

### Deliverables

明确最终交付物：

- 代码改动
- 测试或 regression gate
- docs / task plan / progress / findings 回写
- review report（如适用）
- worker branch / commit SHA / integration evidence（如使用 worker subagent）
- walkthrough
- Harness Ledger
- PR / commit / release note
- residual risk summary

## 标准执行形态

推荐顺序：

1. 讨论并收敛任务合同
2. 建 planning 目录和 worktree
3. 做一轮可验证增量
4. 运行约定证据
5. 自审或 reviewer 审查
6. 根据发现继续修
7. 重跑证据
8. 直到 stop condition 达成
9. 写 walkthrough、Harness Ledger 和 residual risk

核心原则：

> 开放执行，封闭验收；多轮证据，不靠感觉。

## 暂停条件

即使用户授权连续执行，出现以下情况也必须停下来汇报：

- 主目标或 scope 变得不清楚
- 需要高风险产品、架构、安全或数据决策
- 当前任务与已有未提交改动直接冲突
- stop condition 已经不适用
- 外部环境、权限、配额、依赖阻塞，无法继续产生有效证据
- reviewer 发现的问题会改变任务目标

长程任务不是永远不问，而是在合同清楚时少问，在合同失效时及时停。

## 反模式

以下口径不适合作为长程任务合同：

- “你先看看，能改多少改多少”
- “整体优化一下”
- “差不多就行”
- “有问题再说”
- “不用测了，先做”
- “我也不知道什么时候算完成，你自己把握”

这些写法共同缺少 Goal、Scope、Evidence 或 Stop Condition。

## 项目落地规则

一个项目安装 harness 后，应做到：

- `AGENTS.md` 的 Task-Type Reading Matrix 指向 `docs/11-REFERENCE/long-running-task-standard.md`
- `docs/09-PLANNING/TASKS/_task-template/` 包含 long-running task contract 模板
- `docs/09-PLANNING/TASKS/_task-template/` 包含 `review.md` 模板
- `docs/11-REFERENCE/adversarial-review-standard.md` 定义 reviewer 报告规范
- `execution-workflow-standard.md` 在开始任务前要求判断是否属于长程任务
- regression / testing 标准能提供可复查证据，而不是只依赖主观判断
- `docs/Harness-Ledger.md` 记录长程任务是否完成必要的上下文回写
