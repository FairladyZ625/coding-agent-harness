# Coding Agent Harness

[![skills.sh](https://skills.sh/b/FairladyZ625/coding-agent-harness)](https://skills.sh/FairladyZ625/coding-agent-harness)

> 用 AI 写 15 万行代码不难，难的是不让它跑偏。一套经过真实项目验证的工程方法论，帮你在任意项目上构建 Coding Agent 的 harness 体系。

## 这是什么

**Coding Agent Harness** 是一套开源的方法论和工具模板，用于规控
Coding Agent（Codex、Claude Code、Gemini CLI 等）在长程项目中的表现。

它解决的核心问题：当任务持续几天、几周、上百轮迭代的时候，怎么保证 agent 不跑偏。

## 核心理念

- **文档是写给 Agent 看的，不是写给人看的。**
- **上下文不是越多越好，是越准越好。**
- **单元测试只是底线，不是保障。**
- **Repo 护栏是地基。**
- **长程任务先设计合同，再开放执行。**
- **对抗性审查必须有报告落点和信心挑战循环。**
- **严肃项目用顶级模型。**
- **强制流程优于口头约定。**

## 它包含什么

### 十四大模块

| 模块 | 解决什么问题 |
| ------ | ------------ |
| AGENTS.md / CLAUDE.md 入口设计模式 | 怎么让入口文件管住整个项目，同时兼容 Claude Code |
| Delivery Operating Model | 怎么识别一人多 agent、多人团队、前后端分仓、program 多仓、敏捷/瀑布等交付形态 |
| Repository Governance | 怎么定制 PR policy、branch protection、required checks、worktree concurrency |
| CI/CD Standard | 怎么把项目技术栈映射成实际 workflow 和 required checks |
| Planning Loop | 怎么让 agent 在长任务中不偏离目标 |
| Long-Running Task Protocol | 怎么把多轮任务设计成可连续执行、可审查、可停止的合同 |
| Adversarial Review Report | 怎么让 reviewer agent 把“100% 信心”挑战、material findings 和 no-finding 结论落盘 |
| Review Routing | 怎么强制任务收口前自动触发 subagent / reviewer / 外部审查 |
| SSoT 治理 | 怎么维护单一事实源 |
| Harness Ledger | 怎么让每轮任务的上下文回写透明可查 |
| Worktree 并行开发 | 怎么多 agent 并行不冲突 |
| Regression 体系 | 怎么保证改了 A 不破坏 B |
| Walkthrough 收口 | 怎么让每轮迭代有据可查 |
| Closeout SSoT | 怎么强制 closed 任务必须有 walkthrough 或受控 skip reason |

### 文件结构

```text
coding-agent-harness/
├── SKILL.md                          # 执行协议（12 Phase SOP）
├── references/                       # 方法论详解
│   ├── project-onboarding-audit.md   # 项目诊断 + 三级规模分支
│   ├── agents-md-pattern.md          # AGENTS.md / CLAUDE.md 入口设计模式
│   ├── docs-directory-standard.md    # docs/ 目录标准
│   ├── delivery-operating-model-standard.md # 工程组织/交付模型识别
│   ├── repo-governance-standard.md   # PR / branch protection / required checks
│   ├── ci-cd-standard.md             # CI profile / workflow / release residual
│   ├── planning-loop.md              # 任务文件 + 命名规范
│   ├── long-running-task-standard.md # 长程任务合同 + review loop + stop condition
│   ├── adversarial-review-standard.md # review.md 报告落点 + finding 分级
│   ├── review-routing-standard.md    # reviewer / subagent / external review 路由
│   ├── ssot-governance.md            # 四张 SSoT + 全局 Ledger 治理
│   ├── harness-ledger.md             # 全局上下文回写总账
│   ├── regression-system.md          # Evidence Depth 五级制
│   ├── cadence-ledger.md             # 触发规则 + batch log
│   ├── walkthrough-closeout.md       # 收口流程
│   └── worktree-parallel.md          # 命名/分支/操作 SOP
├── scripts/
│   └── check-harness.mjs             # 可执行 harness 完成度检查
├── docs/plans/                       # 本仓本地 review 草稿；默认被 .gitignore 忽略
├── templates/                        # English templates written directly into target projects
    ├── AGENTS.md.template
    ├── CLAUDE.md.template            # Claude Code 兼容 shim，指向 AGENTS.md
    ├── planning/ (task_plan, execution_strategy, visual_roadmap, findings, progress, review, long-running-task-contract)
    ├── ledger/ (Harness-Ledger)
    ├── ssot/ (Feature-SSoT, Delivery-SSoT, Regression-SSoT)
    ├── regression/ (Cadence-Ledger)
    ├── walkthrough/ (walkthrough-template, Closeout-SSoT)
    └── reference/ (14 个标准文件模板)
└── templates-zh-CN/                  # 中文模板，文件结构与 templates/ 完全一致
```

## 快速开始

### 使用 npx 安装为 Agent Skill

本仓库已经按开放 Agent Skills 生态的 `SKILL.md` 格式发布，可以通过
[`skills`](https://github.com/vercel-labs/skills) CLI 安装到 Codex、Claude Code、
Cursor、OpenClaw、Gemini CLI 等兼容 agent。

先预览仓库里可安装的 Skill：

```bash
npx skills add FairladyZ625/coding-agent-harness --list
```

安装到当前项目：

```bash
npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness
```

安装到 Codex 全局 Skill 目录：

```bash
npx skills add FairladyZ625/coding-agent-harness \
  --skill coding-agent-harness \
  --agent codex \
  --global \
  -y
```

安装后可用下面的命令确认：

```bash
npx skills list --global --agent codex
```

`skills` CLI 支持的常见安装位置包括：

| Agent | Project 目录 | Global 目录 |
| ------ | -------------- | ------------- |
| Codex | `.agents/skills/` | `~/.codex/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| OpenClaw | `skills/` | `~/.openclaw/skills/` |
| Gemini CLI | `.agents/skills/` | `~/.gemini/skills/` |

### 更新已有 Harness

如果一个项目已经按旧版 harness 搭好了，不需要重新生成一遍，也不应该用模板覆盖现有
`docs/`。更新方式是让 Agent 重新读取最新版 Skill，然后对现有项目做增量同步。

先把 Skill 更新到最新版本：

```bash
npx skills add FairladyZ625/coding-agent-harness \
  --skill coding-agent-harness \
  --agent codex \
  --global \
  -y
```

然后把下面这段话发给目标项目里的 Agent：

```text
请重新读取最新版 coding-agent-harness Skill。
对比本项目现有 AGENTS.md / CLAUDE.md / docs/ 与最新版 harness 的 SKILL.md、
references/、templates/，只做增量更新：
1. 列出缺失或过期的 harness 骨架、reference、template、SSoT、Ledger 项。
2. 先给出 delta plan，不要重写已有业务事实、历史 walkthrough、task progress 或 SSoT 内容。
3. 只补齐新增标准和缺失结构；已有项目事实只能合并、追加或加 residual，不能用模板覆盖。
4. 如果新增了 Lessons SSoT、Harness Ledger 或相关 reference/template，
   同步更新 AGENTS.md / CLAUDE.md / docs 索引。
5. 收口时写 walkthrough，并在 docs/Harness-Ledger.md 记录本次 harness update 做了哪些增量同步。
```

判断标准：**重装 Skill 不会删除项目历史；更新 Harness 是一次 delta merge，不是重建文档库。**

### Agent 安装语言规则

这套 CLI 主要给目标项目里的 agent 使用。Agent 不能把语言选择丢给用户自己研究命令：

- 如果用户在场，先询问中文还是英文，然后显式运行
  `harness init --locale zh-CN|en-US --capabilities ...`。
- 如果是非交互安装，不要依赖 CLI 默认值；agent 必须根据用户语境或项目语言显式传
  `--locale`。无法判断时先问。
- 中文用户或中文项目默认 `zh-CN`；英文团队、英文文档项目或用户明确要求英文时用
  `en-US`。
- 安装后检查 `.harness-capabilities.json`、task template、review template 和 dashboard
  是否来自同一套 locale 模板。
- 如果只是 dogfood 测试，默认清理目标项目里的测试产物，不提交。

### 校验 Harness 完成度

bootstrap 或 harness update 收口前，运行：

```bash
node scripts/check-harness.mjs /path/to/project
```

这个检查不是只看文件是否存在。它会检查 `AGENTS.md` 索引、delivery operating model、repo governance、
CI/CD、PR template、workflow 或 residual、review template、Harness Ledger、Closeout SSoT、Lessons 双写，以及
reference 文档里是否还残留泛化占位符。检查失败时不能声称 harness complete。

## v1.0 CLI

v1.0 额外提供一个无依赖 CLI。旧入口 `scripts/check-harness.mjs` 继续保留；
新入口用于能力声明、只读状态、可视化 dashboard 和安全 scaffold。

```bash
npm test
npm run smoke:dashboard
node scripts/harness.mjs check --profile source-package .
node scripts/harness.mjs check --profile target-project examples/minimal-project
node scripts/harness.mjs status --json /path/to/project
node scripts/harness.mjs status --json --strict /path/to/project
node scripts/harness.mjs dashboard --out tmp/harness-dashboard.html /path/to/project
node scripts/harness.mjs dashboard --out-dir tmp/harness-dashboard /path/to/project
node scripts/harness.mjs init --capabilities core,dashboard /path/to/project
node scripts/harness.mjs init --dry-run --locale zh-CN --capabilities core,dashboard /path/to/project
node scripts/harness.mjs add-capability dashboard --dry-run /path/to/project
```

`dashboard --out` 保留旧的单文件 HTML 输出。`dashboard --out-dir` 生成静态
dashboard 文件夹，包含 `index.html`、`assets/`、`data/status.json`、
`data/tables.json`、`data/documents.json`、`data/graph.json` 和
`data/adoption.json`。

`status --json` 仍是基础状态源；文件夹 dashboard 会额外生成规范化表格、
Markdown 文档快照、任务/模块图数据和 legacy adoption 建议。dashboard 只读，
不写项目文件。

### Capability Registry

项目可以声明 `.harness-capabilities.json`：

```json
{
  "version": 1,
  "locale": "zh-CN",
  "capabilities": [
    {"name": "core", "state": "configured"},
    {"name": "adversarial-review", "state": "verified"},
    {"name": "dashboard", "state": "verified"}
  ]
}
```

`locale` 支持 `zh-CN` 和 `en-US`。`harness init` 在交互式终端中未传
`--locale` 时会询问初始化语言；非交互场景默认 `en-US`，脚本和 Agent 可用
`--locale zh-CN|en-US` 显式指定。`templates/` 是纯英文模板树，
`templates-zh-CN/` 是同构中文模板树；CLI 按 locale 选择整棵模板树，不能在同一
模板内混用中英文。CLI scaffold 只创建模板、空表和索引；项目级 reference standards
需要 Agent 在 Configure 阶段根据项目事实和用户讨论后定制。

`init` 和 `add-capability` 的 JSON 输出包含 `report`。面向 agent 的安装流程必须读取
这份 report，并在交付 summary 中复述：

- locale
- selected capabilities
- created / skipped files
- agentInstructions
- verificationCommands

这避免 agent 只看命令成功就声称安装完成。

### Capability 选择规则

| Capability | 默认 | 何时选择 |
| --- | --- | --- |
| `core` | 是 | 永远安装，提供任务、回归、walkthrough、Lessons 和 Harness Ledger 内核。 |
| `dashboard` | 否 | 需要本地只读状态页时安装。 |
| `safe-adoption` | 否 | 只在旧 harness 项目接入 v1.0 且需要保留历史文档时安装；新项目不要为了消 warning 乱装。 |
| `adversarial-review` | 否 | 发布、架构、安全、数据或策略风险需要独立 review artifact 时安装。 |
| `long-running-task` | 否 | agent 会连续多轮执行且不能每步确认时安装。 |
| `module-parallel` | 否 | 有 2 个以上独立模块并需要模块 registry / owner / 同步规则时安装。 |
| `subagent-worker` | 否 | 会改代码的 subagent 需要独立 worktree 和 commit-backed handoff 时安装；依赖 `module-parallel`。 |

没有 capability registry 的旧项目进入 `legacy-compat` 模式：CLI 会保留旧
checker 结果，同时把新 v1.0 review schema、visual roadmap、capability registry
差异作为 adoption warning，而不是自动改写项目历史。

已声明 `safe-adoption` 的旧项目同样按平滑迁移处理：CLI 会补齐缺失的 v1.0
模板和 `.harness-capabilities.json`，但不会覆盖已有 `AGENTS.md`、`CLAUDE.md`、
`Harness-Ledger` 或历史 task。历史任务缺少 `execution_strategy.md`、
`visual_roadmap.md`、新版 review 段落时，默认进入 `adoption-needed` warning。

需要把旧 checker 失败作为阻塞时，给 `status` 或 `check` 加 `--strict`。

### 必跑回归路径

v1.0 内核改动必须同时覆盖两条回归路径：

| 路径 | 验收重点 |
| --- | --- |
| 新项目初始化 | 从空项目运行 `init --locale zh-CN|en-US --capabilities core,...`；检查模板语言一致、registry 正确、`status --json` 不误报 `safe-adoption`。 |
| 老项目迁移 | 在已有旧 harness 文档的项目上运行 `add-capability safe-adoption --locale ...`；确认旧文件不被覆盖、缺失模板被补齐、普通检查只给 adoption warning、`--strict` 仍可阻塞历史缺口。 |

### 让 Agent 直接执行

把下面这段话复制给你的 Agent（Claude Code / Codex / Gemini CLI / 任何支持
自定义指令的 Coding Agent），它就会自动帮你在当前项目上搭建完整的
harness 体系：

```text
请克隆 https://github.com/FairladyZ625/coding-agent-harness 到本地，
读取其中的 SKILL.md 作为执行协议，然后按照 v1.0 六阶段流程
Diagnose → Decide → Scaffold → Configure → Verify → Deliver，
在我当前的项目上搭建 harness 体系。
先询问我使用中文还是英文模板；运行 init 时必须显式传
`--locale zh-CN` 或 `--locale en-US`，不要依赖默认值。
再根据项目诊断推荐 capability packs。
每完成一个 Phase 告诉我结果，再继续下一个。
```

### 其他使用方式

**作为 Skill 安装**：推荐使用
`npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness`
安装到兼容的 agent。也可以手动将本仓库克隆到 OpenClaw 或其他兼容平台的
skills 目录。当你说"帮我搭建 harness"时，agent 会自动触发完整的
六阶段安装流程。

**作为参考文档**：直接读 `references/` 下的方法论文档，了解每个模块的设计思路。

**作为模板库**：英文项目使用 `templates/`，中文项目使用 `templates-zh-CN/`。

## Base Harness = 地基

这套 harness 是 **base 骨架**，管的是项目级的治理框架——文档怎么组织、
任务怎么排期、回归怎么跑、worktree 怎么并行。

它用四张 SSoT 和一张全局 Ledger 维持上下文透明：

- **Feature SSoT**：保存 feature / wave / implementation 的当前事实
- **Delivery SSoT**：保存多人、多 agent、多仓或传统流程下的 feature block 分配、依赖和集成顺序
- **Regression SSoT**：保存 regression surface、证据深度和 residual 的当前事实
- **Lessons SSoT**：保存经验沉淀建议和规范演进审批状态
- **Lesson Detail Docs**：每条 pending lesson 的完整说明，位于 `docs/01-GOVERNANCE/lessons/`
- **Harness Ledger**：记录每轮任务是否按 SOP 维护了这些事实
- **Closeout SSoT**：记录每个 closed 任务的 walkthrough、evidence、residual 或受控 skip reason
- **Review Report**：保存在任务目录的 `review.md`，记录对抗性审查的 findings、no-finding 结论和残余风险
- **Repo Governance**：保存 PR、branch protection、required checks、worktree concurrency 的当前 contract
- **CI/CD Standard**：保存 workflow、required checks、release/CD residual 的当前事实

你可以在这个地基上叠加任何工作流：

- [gstack](https://github.com/garrytan/gstack) — Garry Tan 的虚拟工程团队
  （23 个 slash command）
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code) —
  Agent harness 性能优化系统
- [Superpowers](https://github.com/anthropics/superpowers) — Anthropic 官方增强工具集

三者不冲突，可以自由组合。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FairladyZ625/coding-agent-harness&type=Date)](https://star-history.com/#FairladyZ625/coding-agent-harness&Date)

## License

MIT
