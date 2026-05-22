# 架构总览

[English](overview.md) | 简体中文

Coding Agent Harness 是一套面向长程 Coding Agent 工作的、仓库原生的运行层。它给 Agent 提供稳定的项目记忆、任务生命周期、审查门禁、迁移轨道，以及人可以检查的 Dashboard。

核心思路很简单：把重要状态放进 Agent 能读取的文件里，再用 CLI 从这些文件推导 status、check、migration plan 和 dashboard view。

## 心智模型

```mermaid
flowchart LR
  Prompt["Prompt engineering<br/>优化单次指令"]
  Context["Context engineering<br/>优化可见证据"]
  Harness["Harness engineering<br/>优化运行系统"]

  Prompt --> Context
  Context --> Harness

  Prompt --> P1["角色、任务、约束"]
  Context --> C1["文档、文件、历史输出"]
  Harness --> H1["状态、门禁、Dashboard、审查"]
```

Prompt engineering 改善一次模型调用。Context engineering 改善模型在任务中能看到什么。Harness engineering 改善 Agent 在多天执行、多人交接、审查和发布中的整体运行方式。

## 产品架构

```mermaid
flowchart TB
  Skill["Agent Skill<br/>SKILL.md"]
  CLI["Harness CLI<br/>scripts/harness.mjs"]
  Standards["标准<br/>references/"]
  Templates["脚手架<br/>templates/ + templates-zh-CN/"]
  Target["目标仓库<br/>AGENTS.md + docs/"]
  Scanner["扫描器与校验器<br/>status/check"]
  Dashboard["Dashboard / Workbench<br/>HTML + JSON"]
  Human["人工审查者<br/>批准与检查"]
  Agent["Coding Agent<br/>Codex / Claude / Gemini"]

  Agent --> Skill
  Skill --> Standards
  Skill --> CLI
  CLI --> Templates
  Templates --> Target
  Standards --> Target
  Target --> Scanner
  Scanner --> Dashboard
  Dashboard --> Human
  Scanner --> Agent
  Human --> Agent
```

这个包交付的是可复用部件：标准、模板、CLI 逻辑、Dashboard 资产、示例和公开文档。目标项目保存真实运行中的项目事实。

## 目标仓库模型

```mermaid
flowchart TB
  Entry["AGENTS.md<br/>Agent 入口与路由"]
  Registry[".harness-capabilities.json<br/>已启用能力"]
  Docs["docs/"]
  Architecture["03-ARCHITECTURE<br/>系统事实"]
  Development["04-DEVELOPMENT<br/>本地设置与代码地图"]
  QA["05-TEST-QA<br/>回归与节奏"]
  Integrations["06-INTEGRATIONS<br/>外部契约"]
  Planning["09-PLANNING<br/>任务与模块"]
  Walkthrough["10-WALKTHROUGH<br/>收口证据"]
  Reference["11-REFERENCE<br/>本地运行标准"]
  Ledger["Harness Ledger / SSoT / Lessons<br/>长期记忆"]

  Entry --> Docs
  Registry --> Docs
  Docs --> Architecture
  Docs --> Development
  Docs --> QA
  Docs --> Integrations
  Docs --> Planning
  Docs --> Walkthrough
  Docs --> Reference
  Docs --> Ledger
```

目标仓库是事实源。Agent 应该能从这些文件恢复上下文，而不是依赖上一轮聊天记忆。

## 仓库运行模式

目标项目可以采用三种仓库组织方式：

| 模式 | 控制面 | 执行面 |
| --- | --- | --- |
| 单仓模式 | 同一个仓库管理 `AGENTS.md`、`docs/`、代码、测试和收口。 | 同一个仓库。 |
| 多仓独立模式 | 每个仓库都有自己的局部 `AGENTS.md` 和 `docs/`。 | 每个仓库独立执行。 |
| 主控仓库模式 | 父仓库管理全局 Harness 控制面。 | 子仓库管理实现代码和局部检查。 |

如果一个产品拆成前端、后端、SDK、微服务和上游参考仓库，主控仓库模式可以把 Agent 启动入口、Feature SSoT、回归状态和收口证据固定在一个地方。详见 `docs-release/guides/repository-operating-models.md` 和 `docs-release/guides/parent-control-repository-pattern.md`。

## CLI 命令面

```mermaid
flowchart LR
  CLI["harness CLI"]

  CLI --> Init["init / add-capability<br/>创建或扩展 Harness 文件"]
  CLI --> Status["status / check<br/>推导健康状态与失败项"]
  CLI --> Dashboard["dashboard / dev<br/>渲染可读状态"]
  CLI --> Migration["migrate-plan / migrate-run / migrate-verify<br/>旧项目迁移"]
  CLI --> Task["new-task / task-* / review-confirm<br/>任务生命周期操作"]
  CLI --> UserSkill["install-user / doctor-user<br/>本机 Skill 设置"]

  Status --> Scanner["任务扫描器 + check profiles"]
  Dashboard --> Bundle["status、tables、docs、graph、adoption warnings"]
  Task --> Lifecycle["任务生命周期写入器"]
  Migration --> Planner["迁移规划器与验证器"]
```

所有命令族都读取同一份仓库事实，因此 CLI 输出、检查结果、迁移报告和 Dashboard 视图会保持一致。

## Dashboard 数据流

```mermaid
sequenceDiagram
  autonumber
  participant CLI as harness dashboard/dev
  participant Scanner as 扫描器 + 校验器
  participant Bundle as dashboard bundle
  participant Output as HTML 输出
  participant Browser as 浏览器
  participant Target as 目标 docs

  CLI->>Scanner: 读取 AGENTS.md、docs、tasks、SSoT
  Scanner->>Bundle: 构建 status、tables、documents、graph、warnings
  Bundle->>Output: 写入 index.html、assets、data/*.json
  Browser->>Output: 打开静态 Dashboard 快照
  alt 本地 Workbench 模式
    Browser->>CLI: 提交已批准动作
    CLI->>Target: 更新受限 Markdown 文件
    CLI->>Output: 重新生成快照
  end
```

静态 Dashboard 是可携带的证据快照。本地 Workbench 增加一个很小的可写操作面，用于人工确认过的动作，例如 review completion。

## 任务生命周期状态机

```mermaid
stateDiagram-v2
  [*] --> ready: new-task 或 planned docs
  ready --> active: task-start
  active --> active: task-log / task-phase
  active --> blocked: task-block
  blocked --> active: task-start
  active --> in_review: task-review
  in_review --> review_blocked: 存在 P0-P2 finding
  review_blocked --> in_review: finding 关闭或路由
  in_review --> closing: review-confirm + task-complete
  closing --> closed: 收口证据已链接
  closed --> [*]
```

扫描器会区分原始任务状态和派生生命周期状态：

| 原始任务状态 | 派生生命周期含义 |
| --- | --- |
| `not_started` / `planned` | `ready` |
| `in_progress` | `active` |
| `blocked` | `blocked` |
| `review` 且存在阻塞 finding | `review-blocked` |
| `review` 且无阻塞 finding | `in_review` |
| `done` 但缺少 closeout | `closing` |
| 任意状态且已有 closed closeout 证据 | `closed` |

这样可以避免一个文件里写了 `done`，任务就被误认为真正完成。

## Review 与 Closeout 门禁

```mermaid
flowchart TB
  Review["task-review"]
  Simple{"simple budget?"}
  Phase["Visual Map 进度<br/>或 phase evidence"]
  Lessons["lesson candidates<br/>review decision complete"]
  Findings{"存在 P0-P2 findings?"}
  Walkthrough["walkthrough / closeout evidence"]
  Confirm["human review confirmation"]
  Complete["task-complete"]
  Closed["closed lifecycle"]

  Review --> Simple
  Simple -- yes --> Findings
  Simple -- no --> Phase
  Phase --> Lessons
  Lessons --> Findings
  Findings -- yes --> Review
  Findings -- no --> Walkthrough
  Walkthrough --> Confirm
  Confirm --> Complete
  Complete --> Closed
```

standard 和 complex 任务必须具备进度、证据、lesson 决议、人工确认和收口链接，才会被视为真正关闭。

## 迁移轨道

```mermaid
flowchart LR
  Legacy["已有项目"]
  Scan["migrate-plan<br/>扫描事实"]
  Mode{"推荐模式"}
  Baseline["baseline-preserve<br/>安全接入"]
  StatusAware["status-aware-rewrite<br/>修复当前任务"]
  Full["full-semantic-rewrite<br/>完整可读迁移"]
  Run["migrate-run<br/>session + dashboard"]
  Verify["migrate-verify<br/>normal 或 full-cutover"]
  Evidence["最终证据<br/>dashboard + checks"]

  Legacy --> Scan
  Scan --> Mode
  Mode --> Baseline
  Mode --> StatusAware
  Mode --> Full
  Baseline --> Run
  StatusAware --> Run
  Full --> Run
  Run --> Verify
  Verify --> Evidence
```

迁移是 plan-first 的。Agent 先扫描项目、推荐模式，并在修改旧任务历史前等待确认。

## 文档表面

```mermaid
flowchart TB
  Readme["README<br/>第一印象与快速开始"]
  DocsRelease["docs-release<br/>公开架构与指南"]
  References["references<br/>可复用标准"]
  Templates["templates<br/>生成到目标仓库的文件"]
  Skill["SKILL.md<br/>Agent 运行入口"]
  CLI["harness CLI<br/>执行校验与渲染"]

  Readme --> DocsRelease
  DocsRelease --> References
  Skill --> References
  Skill --> Templates
  CLI --> Templates
  CLI --> References
```

`README` 介绍产品。`docs-release` 解释架构和用户工作流。`references` 定义可复用标准。`templates` 是安装到目标项目里的具体文件。

## 发布包表面

```mermaid
flowchart LR
  Source["source checkout"]
  Check["source-package check"]
  Test["npm test<br/>dashboard smoke"]
  Pack["npm pack --dry-run"]
  Tarball["npm tarball<br/>CLI + docs + templates + examples"]
  Publish["npm publish"]

  Source --> Check
  Check --> Test
  Test --> Pack
  Pack --> Tarball
  Tarball --> Publish
```

公开发布物是 npm package。`npm pack --dry-run` 是 publish 前的最终形态检查，因为它展示了会被发布出去的 docs、scripts、templates、examples 和 assets。

## Worker / Coordinator 边界

```mermaid
flowchart LR
  Worker["Worker agent<br/>局部模块或任务文件"]
  Handoff["handoff marker<br/>progress.md"]
  Coordinator["Coordinator agent<br/>全局投影"]
  Registry["registries / ledgers / SSoT"]
  Check["strict check"]

  Worker --> Handoff
  Handoff --> Coordinator
  Coordinator --> Registry
  Registry --> Check
```

Worker 负责局部任务与模块事实。Coordinator 负责全局投影：registries、ledgers、closeout indexes 和 regression state。
