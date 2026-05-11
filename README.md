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
- **长程任务先设计合同，再开放执行。**
- **严肃项目用顶级模型。**
- **强制流程优于口头约定。**

## 它包含什么

### 八大模块

| 模块 | 解决什么问题 |
| ------ | ------------ |
| AGENTS.md / CLAUDE.md 入口设计模式 | 怎么让入口文件管住整个项目，同时兼容 Claude Code |
| Planning Loop | 怎么让 agent 在长任务中不偏离目标 |
| Long-Running Task Protocol | 怎么把多轮任务设计成可连续执行、可审查、可停止的合同 |
| SSoT 治理 | 怎么维护单一事实源 |
| Harness Ledger | 怎么让每轮任务的上下文回写透明可查 |
| Worktree 并行开发 | 怎么多 agent 并行不冲突 |
| Regression 体系 | 怎么保证改了 A 不破坏 B |
| Walkthrough 收口 | 怎么让每轮迭代有据可查 |

### 文件结构

```text
coding-agent-harness/
├── SKILL.md                          # 执行协议（12 Phase SOP）
├── references/                       # 方法论详解
│   ├── project-onboarding-audit.md   # 项目诊断 + 三级规模分支
│   ├── agents-md-pattern.md          # AGENTS.md / CLAUDE.md 入口设计模式
│   ├── docs-directory-standard.md    # docs/ 目录标准
│   ├── planning-loop.md              # 三件套 + 命名规范
│   ├── long-running-task-standard.md # 长程任务合同 + review loop + stop condition
│   ├── ssot-governance.md            # 三张 SSoT + 全局 Ledger 治理
│   ├── harness-ledger.md             # 全局上下文回写总账
│   ├── regression-system.md          # Evidence Depth 五级制
│   ├── cadence-ledger.md             # 触发规则 + batch log
│   ├── walkthrough-closeout.md       # 收口流程
│   └── worktree-parallel.md          # 命名/分支/操作 SOP
└── templates/                        # 可直接写入项目的模板
    ├── AGENTS.md.template
    ├── CLAUDE.md.template            # Claude Code 兼容 shim，指向 AGENTS.md
    ├── planning/ (task_plan, findings, progress, long-running-task-contract)
    ├── ledger/ (Harness-Ledger)
    ├── ssot/ (Feature-SSoT, Regression-SSoT)
    ├── regression/ (Cadence-Ledger)
    ├── walkthrough/ (walkthrough-template)
    └── reference/ (9 个标准文件模板)
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

它用三张 SSoT 和一张全局 Ledger 维持上下文透明：

- **Feature SSoT**：保存 feature / wave / implementation 的当前事实
- **Regression SSoT**：保存 regression surface、证据深度和 residual 的当前事实
- **Lessons SSoT**：保存经验沉淀建议和规范演进审批状态
- **Harness Ledger**：记录每轮任务是否按 SOP 维护了这些事实

你可以在这个地基上叠加任何工作流：

- [gstack](https://github.com/garrytan/gstack) — Garry Tan 的虚拟工程团队
  （23 个 slash command）
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code) —
  Agent harness 性能优化系统
- [Superpowers](https://github.com/anthropics/superpowers) — Anthropic 官方增强工具集

三者不冲突，可以自由组合。

## 起源

这套方法论来自一个真实的开源项目
[Agora](https://github.com/FairladyZ625/Agora)（Context Harness Platform for
Human-Agent Teams）的开发实践。

一个人配合 AI，三周半快速开发期产生了近 40 万行代码和文档改动，
15 万行源码，1284 次提交，413 篇 walkthrough，441 个任务计划。一行代码没写。

更多细节见文章：
[《一个月300亿Token，30万行代码，30万字烧出来的Harness实践，我开源了》](https://mp.weixin.qq.com/s/kX0yhBpvZyqI0NXlHv8KhQ)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FairladyZ625/coding-agent-harness&type=Date)](https://star-history.com/#FairladyZ625/coding-agent-harness&Date)

## License

MIT
