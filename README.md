# Coding Agent Harness

> 用 AI 写 15 万行代码不难，难的是不让它跑偏。一套经过真实项目验证的工程方法论，帮你在任意项目上构建 Coding Agent 的 harness 体系。

## 这是什么

**Coding Agent Harness** 是一套开源的方法论和工具模板，用于规控 Coding Agent（Codex、Claude Code、Gemini CLI 等）在长程项目中的表现。

它解决的核心问题：当任务持续几天、几周、上百轮迭代的时候，怎么保证 agent 不跑偏。

## 核心理念

- **文档是写给 Agent 看的，不是写给人看的。**
- **上下文不是越多越好，是越准越好。**
- **单元测试只是底线，不是保障。**
- **严肃项目用顶级模型。**
- **强制流程优于口头约定。**

## 它包含什么

### 六大模块

| 模块 | 解决什么问题 |
|------|------------|
| AGENTS.md 设计模式 | 怎么让入口文件管住整个项目 |
| Planning Loop | 怎么让 agent 在长任务中不偏离目标 |
| SSoT 治理 | 怎么维护单一事实源 |
| Worktree 并行开发 | 怎么多 agent 并行不冲突 |
| Regression 体系 | 怎么保证改了 A 不破坏 B |
| Walkthrough 收口 | 怎么让每轮迭代有据可查 |

### 文件结构

```
coding-agent-harness/
├── SKILL.md                          # 执行协议（11 Phase SOP）
├── references/                       # 方法论详解
│   ├── project-onboarding-audit.md   # 项目诊断 + 三级规模分支
│   ├── agents-md-pattern.md          # AGENTS.md 设计模式
│   ├── docs-directory-standard.md    # docs/ 目录标准
│   ├── planning-loop.md              # 三件套 + 命名规范
│   ├── ssot-governance.md            # 双轨 SSoT 治理
│   ├── regression-system.md          # Evidence Depth 五级制
│   ├── cadence-ledger.md             # 触发规则 + batch log
│   ├── walkthrough-closeout.md       # 收口流程
│   └── worktree-parallel.md          # 命名/分支/操作 SOP
└── templates/                        # 可直接写入项目的模板
    ├── AGENTS.md.template
    ├── planning/ (task_plan, findings, progress)
    ├── ssot/ (Feature-SSoT, Regression-SSoT)
    ├── regression/ (Cadence-Ledger)
    ├── walkthrough/ (walkthrough-template)
    └── reference/ (7 个标准文件模板)
```

## 怎么用

### 作为 Skill 使用（推荐）

如果你使用 OpenClaw 或兼容的 agent 平台：

1. 将本仓库克隆到你的 skills 目录
2. 当你要求 agent "帮我搭建 harness" 时，它会自动按 11 Phase SOP 执行：
   - 项目诊断 → 确认方案 → 搭建目录 → 生成 AGENTS.md → 建立 Reference 标准 → 初始化 Planning Loop → 初始化 SSoT → 初始化 Regression 体系 → 初始化 Walkthrough → 初始化 Worktree 规范 → 输出总结

### 作为参考文档使用

直接读 `references/` 下的方法论文档，了解每个模块的设计思路和最佳实践。

### 作为模板库使用

从 `templates/` 目录复制模板文件到你的项目中，按需修改。

## Base Harness = 地基

这套 harness 是 **base 骨架**，管的是项目级的治理框架——文档怎么组织、任务怎么排期、回归怎么跑、worktree 怎么并行。

你可以在这个地基上叠加任何工作流：

- [gstack](https://github.com/garrytan/gstack) — Garry Tan 的虚拟工程团队（23 个 slash command）
- [everything-claude-code](https://github.com/affaan-m/everything-claude-code) — Agent harness 性能优化系统
- [Superpowers](https://github.com/anthropics/superpowers) — Anthropic 官方增强工具集

三者不冲突，可以自由组合。

## 起源

这套方法论来自一个真实的开源项目 [Agora](https://github.com/FairladyZ625/Agora)（Context Harness Platform for Human-Agent Teams）的开发实践。

一个人配合 AI，三周半快速开发期产生了近 40 万行代码和文档改动，15 万行源码，1284 次提交，413 篇 walkthrough，441 个任务计划。一行代码没写。

更多细节见文章：[《300 亿 Token，15 万行代码，我一行没写》](https://mp.weixin.qq.com/s/xxx)

## License

MIT
