# Agent 安装指南

English mirror: `docs-release/guides/agent-installation.en-US.md`

这份指南写给在目标项目里执行安装或升级的 coding agent。README 只保留给人看的定位、
快速开始和最小命令；安装细则放在这里和 `SKILL.md`。

## 操作合同

这套 CLI 的主要操作者通常是目标项目里的 agent，不是最终用户。Agent 不应该要求用户
研究命令参数、模板目录或 capability 选择；这些决策必须在 Diagnose / Decide 阶段完成，
并在交付 summary 中说明依据。

本文命令默认写成已安装的 `harness`。Agent 开始前先检查 `command -v harness`。
如果目标环境没有 `harness` 命令，不得静默全局安装；先询问用户是否允许运行
`npm install -g coding-agent-harness`。只有用户明确同意后才能修改全局 npm 环境。
用户不同意或未回复时，用 `npx --yes coding-agent-harness <command>` 运行同一条 CLI。
维护者在本源码仓调试时，可以把同一命令替换为 `node scripts/harness.mjs`。

`harness init` 不会把 npm 包写进目标项目依赖；它只写 Harness 文档、模板和 registry。
因此 agent 交付时不能暗示目标项目已经安装了 npm dependency。`npx` 第一次运行会把包
下载到 npm 缓存；这不是项目依赖，也不是全局命令安装。需要 CLI 时继续用
`npx --yes coding-agent-harness ...`、用户批准后的全局 `harness`，或源码仓的
`node scripts/harness.mjs`。

`npx skills add FairladyZ625/coding-agent-harness --skill coding-agent-harness`
不是零写入操作。它会把 Skill 拷贝到目标项目的 `.agents/skills/coding-agent-harness/`
并写入 `skills-lock.json`。如果用户要求严格只读扫描，先跳过 Skill 安装，用
`npx --yes coding-agent-harness status` / `migrate-plan` 完成扫描；等用户确认允许写入后
再安装 Skill 或运行初始化/迁移写入命令。

使用 v1.0 六阶段流程：

1. Diagnose：扫描项目结构、语言、现有文档、CI、协作方式、外部依赖和风险面。
2. Decide：确定 locale、delivery model、capability packs，以及是否需要外部资料摄取。
3. Scaffold：运行 `harness init` 或 `harness add-capability`。
4. Configure：把生成文档改成项目事实；不要把模板假装成已定制标准。
5. Verify：运行 CLI 检查和项目原生证据。
6. Deliver：输出 residual、owner 和下一步。

如果 Diagnose 阶段发现项目属于微服务、多仓、前后端分仓、平台子系统，或代码里有外部服务、SDK、API gateway、message queue、webhook、contract、schema、mock，Agent 必须询问用户是否有外部资料。资料少时作为 `Source Evidence` 链接；资料多时按 `docs/11-REFERENCE/external-source-intake-standard.md` 建立 `docs/04-DEVELOPMENT/external-source-packs/<source-key>/`，再把稳定结论投影到 `03/04/06`。

## 语言规则

- 用户在场时，先问 harness 文档使用中文还是英文。
- 非交互安装必须显式传 `--locale zh-CN` 或 `--locale en-US`，不要依赖默认值。
- 中文用户或中文优先项目使用 `zh-CN`。
- 英文团队、英文优先仓库或用户明确要求英文时使用 `en-US`。
- 同一个目标项目不要混用 `templates/` 和 `templates-zh-CN/`；只有 schema 字段、
  文件名、状态枚举、命令和跨工具协议 token 可以保留英文。

## 新项目初始化

目标项目没有旧 harness 时使用这条路径：

```bash
harness init \
  --locale zh-CN \
  --capabilities core,dashboard \
  /path/to/project
```

如果目标环境没有 `harness` 命令，先询问用户是否允许全局安装；同意后运行
`npm install -g coding-agent-harness`。未获同意时使用：

```bash
npx --yes coding-agent-harness init \
  --locale zh-CN \
  --capabilities core,dashboard \
  /path/to/project
```

Capability 要保守选择：

| Capability | 默认 | 何时选择 |
| --- | --- | --- |
| `core` | 是 | 永远安装。这是 document kernel。 |
| `dashboard` | 否 | 用户或 agent 需要本地状态页、静态证据快照，或本机动态 workbench。 |
| `safe-adoption` | 否 | 旧 harness 项目接入 v1.0，需要保留历史文档。 |
| `adversarial-review` | 否 | 发布、架构、安全、数据或策略风险需要独立 review artifact。 |
| `long-running-task` | 否 | Agent 需要连续多轮执行，不能每步都询问用户。 |
| `module-parallel` | 否 | 两个以上独立模块需要 owner、registry 和同步规则。 |
| `subagent-worker` | 否 | 会改代码的 subagent 需要独立 worktree 和 commit-backed handoff；依赖 `module-parallel`。 |

`init` 的 JSON 输出会包含 `report`。交付 summary 必须包含：

- locale
- selected capabilities，以及每个可选 capability 的选择理由
- created / skipped files
- nextCommands 中推荐的 `harness dev` 或 `npx --yes coding-agent-harness dev .` 日常入口
- Configure 阶段做了哪些项目化改动
- verification commands 和结果
- residual owner / action / status
- 是否提交；如果只是 dogfood 测试，是否已清理测试产物

`init` 默认不会修改 `package.json`。只有用户明确希望目标项目保留 npm script 时，才使用
`--add-npm-scripts`；该选项要求目标项目已经存在 `package.json`，并且不会覆盖已有
`harness:dev` 或 `harness:dashboard` script。

## 外部资料摄取

当项目依赖外部微服务、外部仓库或外部团队文档时，Agent 不应该把外部资料直接塞进 `03-ARCHITECTURE`、`04-DEVELOPMENT` 或 `06-INTEGRATIONS`。正确顺序是：

```text
Inventory -> Classify -> Sanitize -> Digest -> Project -> Verify -> Residual
```

处理规则：

- 询问用户是否有外部架构文档、接口文档、流程图、会议纪要、链接或导出包。
- 确认资料是否能复制进仓；不能入仓的只保留路径、URL、owner、访问条件和 digest。
- 外部资料超过 5 份、跨多个主题或会持续增长时，创建 `docs/04-DEVELOPMENT/external-source-packs/<source-key>/`。
- `external-source-packs/` 只保存资料索引、digest 和投影状态。
- 稳定事实必须回写到 `03-ARCHITECTURE/services/<service-key>.md`、`04-DEVELOPMENT/external-context/<service-key>.md` 或 `06-INTEGRATIONS/<contract>.md`。
- 未确认或冲突的内容只能留在 source pack 或 `Do Not Assume`。

## 用户级注册

如果用户已经通过 npm 或源码拿到了 `harness` CLI，可以把本 Skill 注册到用户级
agent 目录，避免每个项目重复拷贝：

```bash
harness install-user --agent codex --global
harness doctor-user --agent codex
```

支持的 agent target：

| Agent | 用户级目录 |
| --- | --- |
| `codex` | `~/.codex/skills/coding-agent-harness` |
| `claude` | `~/.claude/skills/coding-agent-harness` |
| `gemini` | `~/.gemini/skills/coding-agent-harness` |
| `openclaw` | `~/.openclaw/skills/coding-agent-harness` |
| `agents` | `~/.agents/skills/coding-agent-harness` |
| `all` | 安装到以上所有目录 |

安全规则：

- 默认交互确认；非交互场景必须传 `--yes` 或先用 `--dry-run`。
- 默认不覆盖已有文件，只补缺失文件。
- 需要强制更新时显式传 `--force`。
- `doctor-user` 会检查 `SKILL.md`、模板、references、CLI scripts 和本指南是否存在。

## 旧 Harness 迁移

目标项目已经有旧版 harness 时使用这条路径。不要把旧文档重建一遍，也不要从
`add-capability` 手工拼流程；先用迁移轨道生成可验证 session：

```bash
harness migrate-run \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-project \
  --out-dir /tmp/cah-migration-project/dashboard \
  /path/to/old-project

harness migrate-verify \
  /tmp/cah-migration-project/session.json
```

规则：

- 不覆盖已有 `AGENTS.md`、`CLAUDE.md`、`docs/Harness-Ledger.md`、SSoT、
  walkthrough、task progress 和历史 task plan。
- 旧项目中英文混杂时，必须显式传 `--locale zh-CN` 或 `--locale en-US`。
- 只补齐缺失的 v1.0 模板和 capability registry。
- 已有项目事实只能 merge、append 或记录 residual；不能用泛化模板替换。
- 历史合同缺口在普通模式下进入 `adoption-needed` warning。
- `--strict` 必须仍然能因为旧 checker 失败或历史合同缺口而失败。
- 旧全局表和模块索引先归档，再用 `harness governance rebuild --archive --apply` 重新生成；这些表是 Agent 索引，人看状态优先用 Dashboard。
- `migrate-verify` 必须通过，才能报告迁移输出可用；dashboard 路径必须是 HTML。
- 详细迁移策略见 `docs-release/guides/migration-playbook.md` 或英文镜像
  `docs-release/guides/migration-playbook.en-US.md`。如果用户要求证明旧项目已经完整迁移，
  还必须读取 `docs-release/guides/full-legacy-migration-subagent-strategy.md` 或中文镜像
  `docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`。Agent 应读取
  `session.json` 和 `migrate-plan.json`，再逐步迁移活跃任务、当前 review、真实采用的 capability，
  并用 subagent 审查证明 dashboard brief 覆盖、strict check 和 final session 全部通过。

## 任务生命周期

初始化或迁移完成后，agent 不应手工复制任务目录。使用生命周期命令创建和推进任务：

```bash
harness new-task phase-2-lifecycle \
  --title "阶段二任务生命周期" \
  --locale zh-CN \
  /path/to/project

harness task-start phase-2-lifecycle \
  --message "开始实现生命周期切片" \
  /path/to/project

harness task-log phase-2-lifecycle \
  --message "完成 CLI 与模板更新" \
  --evidence "command:TARGET:npm-test:passed" \
  /path/to/project

harness review-confirm TASKS/phase-2-lifecycle \
  --reviewer "Human Reviewer" \
  --confirm phase-2-lifecycle \
  /path/to/project

harness task-complete phase-2-lifecycle \
  --message "验证闭环完成" \
  /path/to/project
```

规则：

- 不要手工复制任务模板，也不要创建不完整任务目录。`harness check` 会按
  `new-task` 创建的预算文件集校验。
- `new-task --budget simple` 创建 `brief.md`、`task_plan.md`、`visual_map.md`
  和 `progress.md`。
- `new-task` 默认 `standard`，创建 simple 文件，并额外创建
  `execution_strategy.md`、`findings.md`、`lesson_candidates.md` 和 `review.md`。
- `new-task --budget complex` 创建 standard 文件，并额外创建
  `references/INDEX.md` 和 `artifacts/INDEX.md`。
- 已存在的任务目录不会被覆盖；需要改名或继续旧任务时，由 coordinator 决定。
- `task-start`、`task-block`、`task-complete` 只更新 `progress.md` 的生命周期状态和日志。
- `task-log` 只追加执行记录；证据使用 `type:PATH:summary`，例如
  `command:TARGET:npm-test:passed`。
- `review-confirm` 会向 `review.md` 追加人工审查确认，并向 `progress.md` 追加日志；如果存在 `Open: yes` 或 `Blocks Release: yes` 的开放 P0/P1/P2 finding，必须拒绝确认。
- CLI-owned lifecycle 和 lesson 命令会在干净 Git root 中自动提交 allowlisted 写入；dirty 状态会出现在 `status` / dashboard 的警告里，并阻塞这些机械化提交。Agent 手工改动仍要主动提交，不能提交时记录 no-commit reason、owner 和下一步。
- `status --json` 保留旧 `task.state` 用于兼容，并新增 `lifecycleState`、`reviewStatus`、`closeoutStatus` 和 `stateConflicts`。`done` 只表示实现完成，不等于 `closed`。
- 人工操作入口使用本地 HTML workbench：`harness dev /path/to/project`。它会启动只绑定 `127.0.0.1` 的动态页面、自动选择端口、打开浏览器并随 docs 变更刷新。无 GUI 或 CI 场景使用 `harness dev --no-open /path/to/project`。
- 底层兼容入口仍是 `harness dashboard --workbench --out-dir /tmp/harness-workbench /path/to/project`。静态 dashboard 文件仍然只读，不能承载人工确认动作。
- `task-list --json` 和 `status --json` 是 dashboard、reviewer 和后续 agent 的读取入口。

## 验证命令

安装或升级收口前，至少运行：

```bash
harness check --profile target-project /path/to/project
harness status --json /path/to/project
harness dev --no-open --out-dir /tmp/harness-workbench /path/to/project
harness dashboard --out /tmp/harness-dashboard.html /path/to/project
```
