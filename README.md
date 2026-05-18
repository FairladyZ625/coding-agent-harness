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
└── templates/                        # 可直接写入项目的模板
    ├── AGENTS.md.template
    ├── CLAUDE.md.template            # Claude Code 兼容 shim，指向 AGENTS.md
    ├── planning/ (task_plan, execution_strategy, visual_roadmap, findings, progress, review, long-running-task-contract)
    ├── ledger/ (Harness-Ledger)
    ├── ssot/ (Feature-SSoT, Delivery-SSoT, Regression-SSoT)
    ├── regression/ (Cadence-Ledger)
    ├── walkthrough/ (walkthrough-template, Closeout-SSoT)
    └── reference/ (14 个标准文件模板)
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
node scripts/harness.mjs check --profile source-package .
node scripts/harness.mjs check --profile target-project examples/minimal-project
node scripts/harness.mjs status --json /path/to/project
node scripts/harness.mjs status --json --strict /path/to/project
node scripts/harness.mjs dashboard --out tmp/harness-dashboard.html /path/to/project
node scripts/harness.mjs init --dry-run --capabilities core,dashboard /path/to/project
node scripts/harness.mjs add-capability dashboard --dry-run /path/to/project
```

`status --json` 是 HTML dashboard 的唯一数据源。dashboard 不解析任意
Markdown，也不写项目文件。

### Capability Registry

项目可以声明 `.harness-capabilities.json`：

```json
{
  "version": 1,
  "capabilities": [
    {"name": "core", "state": "configured"},
    {"name": "review-contract", "state": "verified"},
    {"name": "dashboard", "state": "verified"}
  ]
}
```

没有 capability registry 的旧项目进入 `legacy-compat` 模式：CLI 会保留旧
checker 结果，同时把新 v1.0 review schema、visual roadmap、capability registry
差异作为 adoption warning，而不是自动改写项目历史。

需要把旧 checker 失败作为阻塞时，给 `status` 或 `check` 加 `--strict`。

### 让 Agent 直接执行

把下面这段话复制给你的 Agent（Claude Code / Codex / Gemini CLI / 任何支持
自定义指令的 Coding Agent），它就会自动帮你在当前项目上搭建完整的
harness 体系：

```text
请克隆 https://github.com/FairladyZ625/coding-agent-harness 到本地，
读取其中的 SKILL.md 作为执行协议，然后按照 12 Phase SOP 的顺序，
在我当前的项目上搭建完整的 harness 体系。
先从 Phase 1（项目诊断）开始，逐步执行到 Phase 12（输出 Bootstrap Summary）。
每完成一个 Phase 告诉我结果，再继续下一个。
```

### 其他使用方式

**作为 Skill 安装**：推荐使用
`npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness`
安装到兼容的 agent。也可以手动将本仓库克隆到 OpenClaw 或其他兼容平台的
skills 目录。当你说"帮我搭建 harness"时，agent 会自动触发完整的
12 Phase SOP。

**作为参考文档**：直接读 `references/` 下的方法论文档，了解每个模块的设计思路。

**作为模板库**：从 `templates/` 目录复制模板文件到你的项目中，按需修改。

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
