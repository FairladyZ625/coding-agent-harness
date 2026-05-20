# Coding Agent Harness

[![skills.sh](https://skills.sh/b/FairladyZ625/coding-agent-harness)](https://skills.sh/FairladyZ625/coding-agent-harness)

简体中文 | [English](README.en-US.md)

> 开源、文档驱动、开箱即用的 Agent Harness。让 Codex、Claude Code、Gemini CLI 等 Coding Agent 在长程开发中保持上下文清晰、过程透明、结果可审查。

## 这是什么

Coding Agent Harness 是一套给 AI Coding Agent 使用的项目工程框架。

它把清晰的工作协议、文档结构、任务生命周期、回归证据和审查流程放进你的仓库，让 Agent 可以直接读取、执行、更新和验证。

## 为什么需要

用 AI 写几千行代码并不难。真正难的是：任务跑了几天以后，Agent 还知道自己在做什么；多个 Agent 并行时不互相覆盖；新 Agent 接手项目时，不靠聊天记忆，而靠仓库里的事实继续工作。

Coding Agent Harness 的目标，是把这些事实变成项目的一部分。

## 核心特点

### 开源、简单、开箱即用

Harness 以普通项目文件运行：Markdown、模板、检查脚本和静态 Dashboard。核心包没有第三方运行时依赖，也不需要额外后台服务或数据库。

你把安装提示发给 Agent，它就可以在目标项目里完成初始化、扫描、迁移和验证。

### 兼容主流 Coding Agent

只要 Agent 能读文件、写文件、执行命令，就可以使用这套 Harness。Codex、Claude Code、Gemini CLI、Cursor 风格 Agent、OpenClaw 等都可以接入。

### 文档驱动，过程透明

所有关键状态都在仓库里可见：

- 当前任务是什么
- 为什么做
- 执行策略是什么
- 证据在哪里
- 回归是否通过
- 有哪些残余风险
- 哪些任务已经完成，哪些还需要处理

人可以看 Brief、Dashboard 和迁移报告。Agent 可以看结构化文档、任务合同和检查结果。

### 为长程任务设计

Harness 覆盖长程开发里的持续性问题：任务生命周期、Brief、Execution Strategy、Visual Map、Progress Log、Review、Regression Evidence、Closeout 和 Lessons。

它让 Agent 每一步都有上下文、证据和收口标准。

### 旧项目也能迁移

旧项目迁移不是直接套模板。标准流程是：先扫描项目，生成迁移计划，推荐迁移模式，向用户提问确认，再执行迁移，最后用 Dashboard 和检查结果证明迁移状态。

## 适合什么项目

Coding Agent Harness 适合：

- 正在用 Coding Agent 做真实软件项目的团队。
- 任务会持续多天、多周、多轮迭代的项目。
- 需要多个 Agent 或多个开发者协作的项目。
- 已经积累大量任务文档、回归记录、迁移记录的项目。
- 希望 AI 开发过程可见、可审查、可复用的项目。

## 快速开始

### 安装 Skill

如果你的 Agent 支持 Skills，用 `npx` 安装本 Skill：

```bash
npx skills add FairladyZ625/coding-agent-harness --list
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

CLI 不会自动写进目标项目依赖。需要运行 Harness 命令时，用 `npx` 即可：

```bash
npx --yes coding-agent-harness init --locale zh-CN --capabilities core,dashboard .
npx --yes coding-agent-harness check --profile target-project .
```

如果你已经全局安装或通过 Skill 暴露了 `harness` 命令，也可以把上面的 `npx --yes coding-agent-harness` 换成 `harness`。

### 让 Agent 执行

把下面这段话发给目标项目里的 Agent：

```text
请先安装并读取 Coding Agent Harness：

npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness

如果当前环境没有 harness 命令，后续 CLI 都用：
npx --yes coding-agent-harness <command>

在当前项目上搭建 Coding Agent Harness。
默认使用中文模板；如果项目明确是英文团队或英文文档，请先询问我是否改用英文。

请先诊断项目结构，再给出初始化计划。
确认后，按照 Diagnose → Decide → Scaffold → Configure → Verify → Deliver 六阶段执行。
执行初始化时使用：
npx --yes coding-agent-harness init --locale zh-CN --capabilities core,dashboard .

不要覆盖已有业务文档、历史任务、回归记录或用户改动。
完成后请给出创建文件、检查结果和下一步建议。
```

如果目标项目已经有旧版 Harness，用这段：

```text
请先安装并读取 Coding Agent Harness：

npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness

如果当前环境没有 harness 命令，后续 CLI 都用：
npx --yes coding-agent-harness <command>

这个项目已有旧版 Harness。先不要改文件。

请先执行详尽扫描，并给我一个迁移计划：
1. 检查当前 git 状态、Harness 状态、任务数量、brief 覆盖、visual_map 覆盖、warning/action/residual、strict 状态和 dashboard 可用性。
2. 根据项目证据主动推荐迁移模式：
   - baseline-preserve：先安全接入，只补必要结构和可见性。
   - status-aware-rewrite：按 SSoT、Ledger、progress、review、git 证据重写当前或重新打开的任务。
   - full-semantic-rewrite：全量重写任务的 brief / execution_strategy / visual_map，让旧项目整体变成 v1.0 可读项目。
3. 给出推荐模式、原因、预计改动范围、预计 token/时间成本、风险和是否需要 subagent。
4. 向我提出需要确认的问题，等我确认后再开始写文件。

扫描阶段至少运行：
npx --yes coding-agent-harness status --json .
npx --yes coding-agent-harness migrate-plan --json --limit 1000 .

最终迁移完成时，必须给出 dashboard HTML、session.json、normal/strict check、migrate-plan summary，以及 full-cutover 验证是否通过。
```

## 了解更多

- Agent 安装指南：[`docs-release/guides/agent-installation.md`](docs-release/guides/agent-installation.md)
- 新项目安装冒烟：[`examples/minimal-project/`](examples/minimal-project/)
- 旧项目迁移指南：[`docs-release/guides/migration-playbook.md`](docs-release/guides/migration-playbook.md)
- 完整旧项目迁移策略：[`docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`](docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md)
- 架构说明：[`docs-release/architecture/overview.md`](docs-release/architecture/overview.md)

## License

MIT
