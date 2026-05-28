# Coding Agent Harness

[![skills.sh](https://skills.sh/b/FairladyZ625/coding-agent-harness)](https://skills.sh/FairladyZ625/coding-agent-harness)

[English](README.md) | 简体中文 | [日本語](docs-release/intl/ja-JP.md) | [한국어](docs-release/intl/ko-KR.md) | [Français](docs-release/intl/fr-FR.md) | [Español](docs-release/intl/es-ES.md) | [Deutsch](docs-release/intl/de-DE.md)

![Coding Agent Harness 架构图](docs-release/assets/harness-architecture.svg)

> 开源、文档驱动、开箱即用的 Agent Harness。让 Codex、Claude Code、Gemini CLI 等 Coding Agent 在长程开发中保持上下文清晰、过程透明、结果可审查。

![Coding Agent Harness Dashboard](docs-release/assets/dashboard-overview.png)

## 一眼看懂

Coding Agent Harness 不是另一个聊天提示词集合。它把 Agent 长程开发需要依赖的事实沉淀到仓库：入口协议、任务计划、执行证据、回归结果、Dashboard 和收口记录。

最小闭环是：

- 人提出目标，Agent 先读仓库里的 Harness 协议。
- Agent 按 Diagnose → Decide → Scaffold → Configure → Verify → Deliver 执行。
- CLI 和 Dashboard 把状态、风险、迁移计划和审查证据暴露出来。
- 下一个 Agent 不靠上一轮聊天记忆，而是从仓库事实继续。

![Harness 执行流程](docs-release/assets/harness-workflow.svg)

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

### 面向任务族的可复用 Preset

Preset 是一个可版本化、声明式的任务方法包。它不是安装一个新 Agent，也不是替代
Harness；它告诉 `harness new-task` 如何为某一类可重复工作创建任务：应该设置什么
Task Kind、需要询问哪些输入、要把哪些共享 Reference 或 Artifact 复制进任务、Agent
必须先读哪些文件，以及要生成哪些 audit / evidence 文件来证明任务创建正确。

当一组任务共享同一套启动上下文时，就适合用 Preset。比如多个接口任务都依赖同一个
上游微服务 contract、fixture packet、runbook 和验证清单，就不应该每次都把这些内容塞进
prompt；应该把它们放进 Preset，然后用
`harness new-task --preset <preset-id> ...` 创建每个任务。

Harness 自带内置 Preset，`harness init` 会把它们 seed 到目标项目，团队也可以在
`.coding-agent-harness/presets/` 下维护项目级 Preset。`preset-creator` Skill 用来制作
这些 Preset 包；真正检查、安装、列出和应用 Preset 的是 Harness CLI。

默认任务模板和模块模板来自当前安装的 npm 包，在命令运行时读取。目标项目不应该把
`planning/**/_task-template` 或 `planning/**/_module-template` 当作活跃状态；v2 结构迁移发现这些旧生成模板目录时会直接清理。

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

### 安装 Skills

如果你的 Agent 支持 Skills，可以用 `npx` 查看本仓库提供的 Skill。因为本仓库既有根
Skill，也有嵌套 Skill；要看到或安装 `preset-creator`，需要加 `--full-depth`：

```bash
npx skills add FairladyZ625/coding-agent-harness --list --full-depth
npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness
npx skills add FairladyZ625/coding-agent-harness --skill preset-creator --full-depth
```

两个 Skill 的用途不同：

- `coding-agent-harness`：用于在目标项目中安装、迁移、运行和审查 Harness。
- `preset-creator`：用于给一组重复任务制作可复用 Harness Preset。适合这些任务共享同一套方法、外部 Reference、Artifact、Evidence 要求，或需要在 Complex Task 骨架上叠加 Preset。这个 Skill 自带 Complex Task 骨架参考，所以 Agent 不需要预先理解 Harness 内部结构，也能做出正确的 Preset。

安装到 Codex 全局 Skill 目录：

```bash
npx skills add FairladyZ625/coding-agent-harness \
  --skill coding-agent-harness \
  --agent codex \
  --global \
  -y
```

安装 Preset Creator Skill：

```bash
npx skills add FairladyZ625/coding-agent-harness \
  --skill preset-creator \
  --full-depth \
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

npm 安装会把内置 Preset seed 到 `~/.coding-agent-harness/presets/`。
`harness init` 也会把这些 Preset seed 到目标项目的
`.coding-agent-harness/presets/`，所以 Agent 可以用
`harness preset list --json` 发现稳定的任务方法。

Agent 不应静默执行全局安装。只有用户明确同意修改全局 npm 环境后，Agent 才能运行 `npm install -g coding-agent-harness`；否则继续使用 `npx --yes coding-agent-harness ...`。

### Harness 状态目录

默认情况下，`harness init` 和 `harness migrate-structure --apply` 会把活跃
Harness 状态写到目标项目里的 `coding-agent-harness/`：

```text
coding-agent-harness/harness.yaml
coding-agent-harness/planning/tasks/
coding-agent-harness/governance/
```

检查和 Dashboard 不绑定这个固定目录名。项目可以把 Harness 状态放在自定义的项目相对目录里，只要在那个目录放 `harness.yaml`，并在 `structure.harnessRoot` 里声明同一个路径。例如：

```yaml
version: 2
locale: zh-CN
capabilities:
  - core
  - dashboard
structure:
  harnessRoot: .project-control/harness-state
  planningRoot: .project-control/harness-state/planning
  tasksRoot: .project-control/harness-state/planning/tasks
  governanceRoot: .project-control/harness-state/governance
  generatedRoot: .project-control/harness-state/governance/generated
```

只要项目里只有一个这样的 manifest，下面两种写法等价：

```bash
npx --yes coding-agent-harness status --json /path/to/project
npx --yes coding-agent-harness status --json /path/to/project/.project-control/harness-state
```

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

先检查当前环境是否有 harness 命令。

如果没有，不要静默全局安装。请先问我：
“当前环境没有 harness 命令。是否允许我运行 npm install -g coding-agent-harness？
这会修改全局 npm 环境，之后可以直接使用 harness。
如果不同意，我会用 npx --yes coding-agent-harness ... 临时执行，不写入项目依赖。”

只有我明确同意后，才运行：
npm install -g coding-agent-harness
harness preset list --json

如果我不同意或没有回复，后续 CLI 都用：
npx --yes coding-agent-harness <command>

在当前项目上搭建 Coding Agent Harness。
默认使用中文模板；如果项目明确是英文团队或英文文档，请先询问我是否改用英文。

请先诊断项目结构，再给出初始化计划。
如果项目是微服务、多仓、前后端分仓，或依赖外部系统，请主动询问我是否有外部架构文档、接口文档、流程图、会议纪要、链接或导出包。
外部资料很多时，请先建立 external-source-packs 索引和摘要，再把稳定结论投影到 coding-agent-harness/context/{architecture,development,integrations}。
确认后，按照 Diagnose → Decide → Scaffold → Configure → Verify → Deliver 六阶段执行。
执行初始化时使用：
npx --yes coding-agent-harness init --locale zh-CN --capabilities core,dashboard .
npx --yes coding-agent-harness preset list --json .

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

先检查当前环境是否有 harness 命令。

如果没有，不要静默全局安装。请先问我：
“当前环境没有 harness 命令。是否允许我运行 npm install -g coding-agent-harness？
这会修改全局 npm 环境，之后可以直接使用 harness。
如果不同意，我会用 npx --yes coding-agent-harness ... 临时执行，不写入项目依赖。”

只有我明确同意后，才运行：
npm install -g coding-agent-harness
harness preset list --json

如果我不同意或没有回复，后续 CLI 都用：
npx --yes coding-agent-harness <command>

这个项目已有旧版 Harness。先不要改文件。

请先执行详尽扫描，并给我一个迁移计划：
1. 检查当前 git 状态、Harness 状态、任务数量、brief 覆盖、visual_map 覆盖、warning/action/residual、strict 状态和 dashboard 可用性。
2. 如果项目是微服务、多仓、前后端分仓，或依赖外部系统，主动询问我是否有外部资料；资料很多时先建立 external-source-packs 索引和摘要，再投影到 context/{architecture,development,integrations}。
3. 根据项目证据主动推荐迁移模式：
   - baseline-preserve：先安全接入，只补必要结构和可见性。
   - status-aware-rewrite：按 SSoT、Ledger、progress、review、git 证据重写当前或重新打开的任务。
   - full-semantic-rewrite：全量重写任务的 brief / execution_strategy / visual_map，让旧项目整体变成 v1.0 可读项目。
4. 给出推荐模式、原因、预计改动范围、预计 token/时间成本、风险和是否需要 subagent。
5. 向我提出需要确认的问题，等我确认后再开始写文件。

扫描阶段至少运行：
npx --yes coding-agent-harness status --json .
npx --yes coding-agent-harness migrate-plan --json --limit 1000 .
npx --yes coding-agent-harness migrate-structure --plan --json .

等我确认迁移模式后，先把目录结构迁到 v2 manifest 布局，再执行迁移轨道并验证：
npx --yes coding-agent-harness migrate-structure --apply --json .
npx --yes coding-agent-harness check --profile target-project .
npx --yes coding-agent-harness migrate-run --locale zh-CN --session-dir /tmp/cah-migration-project --out-dir /tmp/cah-migration-project/dashboard .
npx --yes coding-agent-harness migrate-verify /tmp/cah-migration-project/session.json

然后用内置 preset 创建受控迁移任务：
npx --yes coding-agent-harness new-task --budget complex --preset legacy-migration --from-session /tmp/cah-migration-project/session.json .

不要跳过 `legacy-migration` preset 任务。它会把 migration session、证据包、preset audit 和后续 work queue 记录进项目 Harness；它不会自动重写历史任务正文。

最终迁移完成时，必须给出动态 workbench 入口或静态 dashboard HTML、session.json、normal/strict check、migrate-plan summary，以及 full-cutover 验证是否通过。需要人工确认审查时，必须通过本地网页 workbench 暴露确认操作；静态 dashboard 只作为只读证据快照。
```

## 参与贡献

外部贡献者请先阅读 [`CONTRIBUTING.md`](CONTRIBUTING.md)。它说明仓库结构、PR 要求、根包检查、Dashboard smoke test、npm package dry run 和 GUI 子模块验证。中文详细流程见 [`docs-release/guides/contributing.zh-CN.md`](docs-release/guides/contributing.zh-CN.md)。

如果你想让自己的 Coding Agent 帮你改这个仓库，可以把下面这段发给它：

```text
我想给 FairladyZ625/coding-agent-harness 贡献一个聚焦改动。

请从最新 main 分支开始，新建一个 feature branch。先阅读 README.md 和 CONTRIBUTING.md。改文件前，先检查相关代码/文档，并给我一个简短计划。

改动要保持聚焦。只使用公开仓库文件；不要依赖维护者本地状态、隐藏工作流、凭据、生成的 Dashboard、临时文件或被 ignore 的本地专用文件。

根据改动范围运行检查。仅文档改动至少运行 git diff --check。根包相关改动按需运行 npm install、npm test、npm run smoke:dashboard、npm run check、node dist/harness.mjs check --profile target-project examples/minimal-project、npm run pack:dry-run 和 git diff --check。如果改到 harness-gui，还要运行 cd harness-gui && npm ci && npm run typecheck && npm test && npm run build。

完成后，请总结改了什么，列出验证结果，说明任何未运行检查及原因，并按仓库 PR 模板准备 PR。
```

## 了解更多

- 贡献者指南：[`CONTRIBUTING.md`](CONTRIBUTING.md)
- 中文贡献者详细指南：[`docs-release/guides/contributing.zh-CN.md`](docs-release/guides/contributing.zh-CN.md)
- Agent 安装指南：[`docs-release/guides/agent-installation.md`](docs-release/guides/agent-installation.md)
- 新项目安装冒烟：[`examples/minimal-project/`](examples/minimal-project/)
- 旧项目迁移指南：[`docs-release/guides/migration-playbook.md`](docs-release/guides/migration-playbook.md)
- 完整旧项目迁移策略：[`docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`](docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md)
- 架构说明：[`docs-release/architecture/overview.md`](docs-release/architecture/overview.md)
- 深度架构解析（中文）：[`docs-release/architecture/system-explainer/`](docs-release/architecture/system-explainer/) — 系统设计、模块依赖、任务生命周期、检查体系、数据流、Preset 与迁移引擎，含设计决策背景
- Deep architecture explainer (en-US): [`docs-release/architecture/system-explainer/en-US/`](docs-release/architecture/system-explainer/en-US/)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FairladyZ625/coding-agent-harness&type=Date)](https://star-history.com/#FairladyZ625/coding-agent-harness&Date)

## License

AGPL-3.0-or-later，并附带 Generated Harness Materials 额外许可。

详见 [`LICENSE`](LICENSE) 和 [`LICENSE-EXCEPTION.md`](LICENSE-EXCEPTION.md)。
该额外许可确保 Harness 生成或安装到目标项目里的文件，不会仅仅因为由
Coding Agent Harness 创建或更新，就自动变成 AGPL 覆盖范围。
