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

- `SKILL.md`：给 Codex、Claude Code、Gemini CLI 等 agent 读取的执行协议。
- `templates/` 和 `templates-zh-CN/`：英文/中文两套完整项目模板。
- `references/`：AGENTS 入口、Planning Loop、回归、walkthrough、worktree 等方法论。
- `scripts/harness.mjs`：v1.0 CLI，支持初始化、能力声明、状态 JSON 和只读 dashboard。
- `examples/minimal-project/`：最小可检查示例。
- `docs-release/`：公开架构说明和 agent 安装指南。

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

把下面这段话发给目标项目里的 Agent（Codex / Claude Code / Gemini CLI 等）：

```text
请安装并读取 FairladyZ625/coding-agent-harness 的 coding-agent-harness Skill。
按照 Diagnose → Decide → Scaffold → Configure → Verify → Deliver 六阶段，
在当前项目上搭建 harness。先确认使用中文还是英文模板；运行 init 时显式传
--locale zh-CN 或 --locale en-US；如果项目已有旧 harness，只做增量迁移，不覆盖历史文档。
```

面向 agent 的完整安装细则见
[`docs-release/guides/agent-installation.md`](docs-release/guides/agent-installation.md)。

## v1.0 CLI 快速看

```bash
node scripts/harness.mjs init --locale zh-CN --capabilities core,dashboard /path/to/project
node scripts/harness.mjs install-user --agent codex --global
node scripts/harness.mjs doctor-user --agent codex
node scripts/harness.mjs add-capability safe-adoption --locale zh-CN /path/to/old-project
node scripts/harness.mjs migrate-plan --json /path/to/old-project
node scripts/harness.mjs new-task phase-2-lifecycle --title "Phase 2 lifecycle" /path/to/project
node scripts/harness.mjs task-start phase-2-lifecycle /path/to/project
node scripts/harness.mjs task-log phase-2-lifecycle --message "ran checks" --evidence "command:TARGET:npm-test:passed" /path/to/project
node scripts/harness.mjs task-complete phase-2-lifecycle /path/to/project
node scripts/harness.mjs status --json /path/to/project
node scripts/harness.mjs dashboard --out tmp/harness-dashboard.html /path/to/project
node scripts/harness.mjs check --profile target-project /path/to/project
```

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

详细模块说明见 [`references/`](references/)。

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
