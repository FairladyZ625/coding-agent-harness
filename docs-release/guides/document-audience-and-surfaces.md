# 文档受众与表面边界

English mirror: `docs-release/guides/document-audience-and-surfaces.en-US.md`

Coding Agent Harness 的文档不是一类东西。它同时服务三种读者：

- 人：需要理解产品、架构、迁移方式和项目状态。
- Agent：需要可执行的入口、规则、任务合同和证据路径。
- 发布系统：需要知道哪些文件可以进入公开包，哪些文件只是本地运行状态。

如果不区分受众，文档会变成一堆 Markdown。人看不出重点，Agent 也不知道应该信哪一份。

## 总原则

人读的文档解释意图和判断。

Agent 读的文档定义事实、路径、门禁和下一步动作。

发布文档说明方法论和产品能力，不携带某个团队的私有运行台账。

## 文档表面

| 表面 | 主要读者 | 放什么 | 不放什么 |
| --- | --- | --- | --- |
| `README.md` | 人 | 项目是什么、如何开始、关键链接 | 长任务状态、私有 ledger |
| `docs-release/` | 人和评估者 | 公开架构、指南、模式说明、迁移教程 | 私有任务计划、内部 review、客户现场状态 |
| `references/` | Agent 和维护者 | 可复用标准，例如 testing、workflow、review、worktree | 某个项目的当前排期 |
| `templates/` | CLI 和 Agent | 初始化目标项目时生成的文件 | 已经执行过的任务证据 |
| 目标项目 `AGENTS.md` | Agent | 入口、路由、硬规则、读文件矩阵 | 大段背景叙事 |
| 目标项目 `docs/09-PLANNING/` | Agent 和项目负责人 | Feature SSoT、任务计划、当前状态 | 通用营销材料 |
| 目标项目 `docs/05-TEST-QA/` | Agent、QA、人审 | Regression SSoT、Cadence Ledger、质量门禁 | 需求讨论草稿 |
| 目标项目 `docs/10-WALKTHROUGH/` | 人审、接手 Agent | 收口证据、残留项、人工确认 | 未验证的计划 |

## 人读文档

人读文档要回答：

- 这套方法解决什么问题？
- 我应该选择哪种仓库组织方式？
- 迁移旧项目时风险在哪里？
- 什么证据能让我相信 Agent 没有跑偏？

典型文件：

- `docs-release/architecture/overview.zh-CN.md`
- `docs-release/guides/repository-operating-models.md`
- `docs-release/guides/parent-control-repository-pattern.md`
- `docs-release/guides/migration-playbook.md`

人读文档可以讲取舍、例子和判断过程，但不能成为唯一事实源。真正的项目状态必须落到 SSoT、task、review、walkthrough 和 regression 文件里。

## Agent 读文档

Agent 读文档要回答：

- 我从哪里开始读？
- 哪些文件是事实源？
- 我可以改哪些路径？
- 改完要跑哪些检查？
- 什么条件下必须停下来问人？

典型文件：

- `AGENTS.md`
- `docs/09-PLANNING/Feature-SSoT.md`
- `docs/09-PLANNING/TASKS/<task>/task_plan.md`
- `docs/09-PLANNING/TASKS/<task>/progress.md`
- `docs/05-TEST-QA/Regression-SSoT.md`
- `docs/10-WALKTHROUGH/<date>-<task>.md`
- `docs/11-REFERENCE/*.md`

Agent 文档应该具体、短路径、可检查。不要把它写成文章，也不要让 Agent 从长篇叙事里猜执行合同。

## 发布文档

发布文档要解释 Coding Agent Harness 的公开能力，而不是记录维护者自己的开发过程。

可以发布：

- 架构总览。
- 安装和迁移指南。
- 单仓、多仓、主控仓库模式的选择指南。
- 给 Agent 使用的公开迁移 prompt。
- 可复用的工程方法论。

不应发布：

- 某个私有任务的进行中结论。
- 私有 review 草稿。
- 只对某台机器有效的路径。
- 客户或团队内部状态。
- 还没有脱敏的 ledger、handoff、walkthrough。

## 写作规则

1. 先判断读者，再写文件。
2. 人读文档负责解释为什么；Agent 文档负责定义怎么做。
3. 公开文档可以引用模式和结构，不要引用私有运行状态。
4. 任务状态只写在 SSoT、task、review、walkthrough 和 ledger 里。
5. 如果一个文档既要给人读又要给 Agent 执行，把它拆成两份：公开说明和执行合同。

## 一个判断问题

写文档前问一句：

> 这个文件被谁在什么时刻读取，并且读取后要做什么动作？

如果答案是“人用来理解”，放在公开指南或架构文档里。

如果答案是“Agent 用来执行”，放在目标项目的入口、任务、标准或回归文件里。

如果答案是“维护者记录当前仓库如何运转”，它不是公开发布文档。
