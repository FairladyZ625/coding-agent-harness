# Coding Agent Harness

[![skills.sh](https://skills.sh/b/FairladyZ625/coding-agent-harness)](https://skills.sh/FairladyZ625/coding-agent-harness)

[English](README.md) | 简体中文 | [日本語](docs-release/intl/ja-JP.md) | [한국어](docs-release/intl/ko-KR.md) | [Français](docs-release/intl/fr-FR.md) | [Español](docs-release/intl/es-ES.md) | [Deutsch](docs-release/intl/de-DE.md)

AI 写代码不难。

难的是一个任务跑到第五个小时以后，谁还记得上一个 Agent 为什么这么改、哪些风险没处理、哪些证据是真的。

Coding Agent Harness 做的事很朴素：把这些东西放回仓库里，再用一个 Dashboard 展示出来。

![Coding Agent Harness Dashboard 总览](docs-release/assets/dashboard-overview-en.png)

## 先看它怎么玩

| 步骤 | 人看到什么 | Agent / CLI 做什么 |
| --- | --- | --- |
| 1. 安装入口 | 把 Harness 入口发给 Agent | `npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness` |
| 2. 初始化或迁移 | Agent 先诊断仓库，再给计划 | `init` / `migrate-plan` |
| 3. 打开 Dashboard | 看任务、风险、审查和证据 | `npx --yes coding-agent-harness dev .` |
| 4. 交付前检查 | 用检查结果证明状态 | `check --profile target-project` |

## 一眼看懂

Coding Agent Harness 不是另一个聊天提示词集合。它把 Agent 长程开发需要依赖的事实沉淀到仓库：入口协议、任务计划、执行证据、回归结果、Dashboard 和收口记录。

最小闭环是：

- 人提出目标，Agent 先读仓库里的 Harness 协议。
- Agent 按 Diagnose → Decide → Scaffold → Configure → Verify → Deliver 执行。
- CLI 和 Dashboard 把状态、风险、迁移计划和审查证据暴露出来。
- 下一个 Agent 不靠上一轮聊天记忆，而是从仓库事实继续。

## 这是什么

Coding Agent Harness 是一套给 AI Coding Agent 使用的项目工程框架。

它把清晰的工作协议、文档结构、任务生命周期、回归证据和审查流程放进你的仓库，让 Agent 可以直接读取、执行、更新和验证。

## 为什么需要

用 AI 写几千行代码并不难。真正难的是：任务跑了几天以后，Agent 还知道自己在做什么；多个 Agent 并行时不互相覆盖；新 Agent 接手项目时，不靠聊天记忆，而靠仓库里的事实继续工作。

Coding Agent Harness 的目标，是把这些事实变成项目的一部分。

## 核心特点

### 开源、简单、开箱即用

Harness 以普通项目文件运行：Markdown、模板、检查脚本、静态 Dashboard 快照和可选的本地动态 Workbench。核心包没有第三方运行时依赖，也不需要额外后台服务或数据库；需要网页操作时，用 `harness dev` 启动只绑定本机的临时操作台。

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

CLI 不会自动写进目标项目依赖。需要运行 Harness 命令时，用 `npx` 即可；第一次执行会从 npm 拉取包到本机 npm 缓存，不会写入目标项目：

```bash
npx --yes coding-agent-harness init --locale zh-CN --capabilities core,dashboard .
npx --yes coding-agent-harness dev .
npx --yes coding-agent-harness check --profile target-project .
```

如果你希望长期直接使用 `harness` 命令，可以全局安装：

```bash
npm install -g coding-agent-harness
harness --help
```

Agent 不应静默执行全局安装。只有用户明确同意修改全局 npm 环境后，Agent 才能运行 `npm install -g coding-agent-harness`；否则继续使用 `npx --yes coding-agent-harness ...`。

### 人看的常用命令

初始化一个中文 Harness：

```bash
npx --yes coding-agent-harness init --locale zh-CN --capabilities core,dashboard .
```

启动本地动态 Workbench：

```bash
npx --yes coding-agent-harness dev .
```

生成可离线打开的静态 Dashboard：

```bash
npx --yes coding-agent-harness dashboard --out-dir tmp/harness-dashboard .
open tmp/harness-dashboard/index.html
```

运行目标项目检查：

```bash
npx --yes coding-agent-harness check --profile target-project .
```

### 给 Agent 的提示词

把下面这段话发给目标项目里的 Agent：

```text
请先安装并读取 Coding Agent Harness：

npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness

注意：这一步会在目标仓写入 .agents/skills/coding-agent-harness/ 和 skills-lock.json。
如果本轮只允许零写入扫描，请先跳过本步，直接使用 npx --yes coding-agent-harness ... 扫描；获准写入后再安装 Skill。

先检查当前环境是否有 harness 命令。

如果没有，不要静默全局安装。请先问我：
“当前环境没有 harness 命令。是否允许我运行 npm install -g coding-agent-harness？
这会修改全局 npm 环境，之后可以直接使用 harness。
如果不同意，我会用 npx --yes coding-agent-harness ... 临时执行，不写入项目依赖。”

只有我明确同意后，才运行：
npm install -g coding-agent-harness

如果我不同意或没有回复，后续 CLI 都用：
npx --yes coding-agent-harness <command>
这是“全局 npm 安装确认”，和后面的“初始化计划确认”是两个不同确认点。

在当前项目上搭建 Coding Agent Harness。
默认使用中文模板；如果项目明确是英文团队或英文文档，请先询问我是否改用英文。

请先诊断项目结构，再给出初始化计划。
如果项目是微服务、多仓、前后端分仓，或依赖外部系统，请主动询问我是否有外部架构文档、接口文档、流程图、会议纪要、链接或导出包。
外部资料很多时，请先建立 external-source-packs 索引和摘要，再把稳定结论投影到 03-ARCHITECTURE / 04-DEVELOPMENT / 06-INTEGRATIONS。
确认后，按照 Diagnose → Decide → Scaffold → Configure → Verify → Deliver 六阶段执行。
这里的确认是“初始化计划确认”；如果我已经在本消息里明确要求直接搭建，可视为已确认。
执行初始化时使用：
npx --yes coding-agent-harness init --locale zh-CN --capabilities core,dashboard .

初始化完成后，日常查看和人工确认使用动态网页：
npx --yes coding-agent-harness dev .

如果只需要离线证据快照，再生成静态 dashboard：
npx --yes coding-agent-harness dashboard --out-dir tmp/harness-dashboard .

不要覆盖已有业务文档、历史任务、回归记录或用户改动。
完成后请给出创建文件、检查结果和下一步建议。
```

如果目标项目已经有旧版 Harness，用这段：

```text
请先安装并读取 Coding Agent Harness：

npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness

注意：这一步会在目标仓写入 .agents/skills/coding-agent-harness/ 和 skills-lock.json。
如果本轮只允许零写入扫描，请先跳过本步，直接使用 npx --yes coding-agent-harness ... 扫描；获准写入后再安装 Skill。

先检查当前环境是否有 harness 命令。

如果没有，不要静默全局安装。请先问我：
“当前环境没有 harness 命令。是否允许我运行 npm install -g coding-agent-harness？
这会修改全局 npm 环境，之后可以直接使用 harness。
如果不同意，我会用 npx --yes coding-agent-harness ... 临时执行，不写入项目依赖。”

只有我明确同意后，才运行：
npm install -g coding-agent-harness

如果我不同意或没有回复，后续 CLI 都用：
npx --yes coding-agent-harness <command>
这是“全局 npm 安装确认”，和后面的“迁移计划确认”是两个不同确认点。

这个项目已有旧版 Harness。除上面 Skill 安装可能产生的 .agents/skills/coding-agent-harness/ 和 skills-lock.json 外，先不要改业务文件或 Harness 文件。

请先执行详尽扫描，并给我一个迁移计划：
1. 检查当前 git 状态、Harness 状态、任务数量、brief 覆盖、visual_map 覆盖、warning/action/residual、strict 状态和 dashboard 可用性。
2. 如果项目是微服务、多仓、前后端分仓，或依赖外部系统，主动询问我是否有外部资料；资料很多时先建立 external-source-packs 索引和摘要，再投影到 03/04/06。
3. 根据项目证据主动推荐迁移模式：
   - baseline-preserve：先安全接入，只补必要结构和可见性。
   - status-aware-rewrite：按 SSoT、Ledger、progress、review、git 证据重写当前或重新打开的任务。
   - full-semantic-rewrite：全量重写任务的 brief / execution_strategy / visual_map，让旧项目整体变成 v1.0 可读项目。
4. 给出推荐模式、原因、预计改动范围、预计 token/时间成本、风险和是否需要 subagent。
5. 向我提出需要确认的问题，等我确认后再开始写文件。
这里的确认是“迁移计划确认”，不是全局 npm 安装确认。

扫描阶段至少运行：
npx --yes coding-agent-harness status --json .
npx --yes coding-agent-harness migrate-plan --json --limit 1000 .

确认执行迁移后，先生成并验证 baseline session，再创建 Complex Task preset：
npx --yes coding-agent-harness migrate-run --locale zh-CN --session-dir /tmp/cah-migration-project --out-dir /tmp/cah-migration-project/dashboard .
npx --yes coding-agent-harness migrate-verify /tmp/cah-migration-project/session.json
npx --yes coding-agent-harness new-task --budget complex --preset legacy-migration --from-session /tmp/cah-migration-project/session.json

这个 preset 只创建任务骨架和证据包，不会继续迁移、改写历史、stage 或 commit。后续迁移工作必须在这个 Complex Task 里推进。

最终迁移完成时，必须给出动态 workbench 入口或静态 dashboard HTML、session.json、normal/strict check、migrate-plan summary，以及 full-cutover 验证是否通过。需要人工确认审查时，必须通过本地网页 workbench 暴露确认操作；静态 dashboard 只作为只读证据快照。
```

## 了解更多

- Agent 安装指南：[`docs-release/guides/agent-installation.md`](docs-release/guides/agent-installation.md)
- 新项目安装冒烟：[`examples/minimal-project/`](examples/minimal-project/)
- 旧项目迁移指南：[`docs-release/guides/migration-playbook.md`](docs-release/guides/migration-playbook.md)
- 完整旧项目迁移策略：[`docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`](docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md)
- 架构说明：[`docs-release/architecture/overview.md`](docs-release/architecture/overview.md)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FairladyZ625/coding-agent-harness&type=Date)](https://star-history.com/#FairladyZ625/coding-agent-harness&Date)

## License

MIT
