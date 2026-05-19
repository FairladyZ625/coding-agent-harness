# Agent 安装指南

这份指南写给在目标项目里执行安装或升级的 coding agent。README 只保留给人看的定位、
快速开始和最小命令；安装细则放在这里和 `SKILL.md`。

## 操作合同

这套 CLI 的主要操作者通常是目标项目里的 agent，不是最终用户。Agent 不应该要求用户
研究命令参数、模板目录或 capability 选择；这些决策必须在 Diagnose / Decide 阶段完成，
并在交付 summary 中说明依据。

使用 v1.0 六阶段流程：

1. Diagnose：扫描项目结构、语言、现有文档、CI、协作方式和风险面。
2. Decide：确定 locale、delivery model 和 capability packs。
3. Scaffold：运行 `harness init` 或 `harness add-capability`。
4. Configure：把生成文档改成项目事实；不要把模板假装成已定制标准。
5. Verify：运行 CLI 检查和项目原生证据。
6. Deliver：输出 residual、owner 和下一步。

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
node scripts/harness.mjs init \
  --locale zh-CN \
  --capabilities core,dashboard \
  /path/to/project
```

Capability 要保守选择：

| Capability | 默认 | 何时选择 |
| --- | --- | --- |
| `core` | 是 | 永远安装。这是 document kernel。 |
| `dashboard` | 否 | 用户或 agent 需要本地只读状态页。 |
| `safe-adoption` | 否 | 旧 harness 项目接入 v1.0，需要保留历史文档。 |
| `adversarial-review` | 否 | 发布、架构、安全、数据或策略风险需要独立 review artifact。 |
| `long-running-task` | 否 | Agent 需要连续多轮执行，不能每步都询问用户。 |
| `module-parallel` | 否 | 两个以上独立模块需要 owner、registry 和同步规则。 |
| `subagent-worker` | 否 | 会改代码的 subagent 需要独立 worktree 和 commit-backed handoff；依赖 `module-parallel`。 |

`init` 的 JSON 输出会包含 `report`。交付 summary 必须包含：

- locale
- selected capabilities，以及每个可选 capability 的选择理由
- created / skipped files
- Configure 阶段做了哪些项目化改动
- verification commands 和结果
- residual owner / action / status
- 是否提交；如果只是 dogfood 测试，是否已清理测试产物

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

目标项目已经有旧版 harness 时使用这条路径。不要把旧文档重建一遍：

```bash
node scripts/harness.mjs add-capability safe-adoption \
  --locale zh-CN \
  /path/to/old-project

node scripts/harness.mjs migrate-plan --json \
  /path/to/old-project
```

规则：

- 不覆盖已有 `AGENTS.md`、`CLAUDE.md`、`docs/Harness-Ledger.md`、SSoT、
  walkthrough、task progress 和历史 task plan。
- 只补齐缺失的 v1.0 模板和 capability registry。
- 已有项目事实只能 merge、append 或记录 residual；不能用泛化模板替换。
- 历史合同缺口在普通模式下进入 `adoption-needed` warning。
- `--strict` 必须仍然能因为旧 checker 失败或历史合同缺口而失败。
- 详细迁移策略见 `docs-release/guides/migration-playbook.md`。Agent 应先读取
  `migrate-plan --json`，再逐步迁移活跃任务、当前 review 和真实采用的 capability。

## 任务生命周期

初始化或迁移完成后，agent 不应手工复制任务目录。使用生命周期命令创建和推进任务：

```bash
node scripts/harness.mjs new-task phase-2-lifecycle \
  --title "阶段二任务生命周期" \
  --locale zh-CN \
  /path/to/project

node scripts/harness.mjs task-start phase-2-lifecycle \
  --message "开始实现生命周期切片" \
  /path/to/project

node scripts/harness.mjs task-log phase-2-lifecycle \
  --message "完成 CLI 与模板更新" \
  --evidence "command:TARGET:npm-test:passed" \
  /path/to/project

node scripts/harness.mjs task-complete phase-2-lifecycle \
  --message "验证闭环完成" \
  /path/to/project
```

规则：

- `new-task` 创建 `brief.md`、`task_plan.md`、`execution_strategy.md`、
  `visual_roadmap.md`、`findings.md`、`progress.md` 和 `review.md`。
- 已存在的任务目录不会被覆盖；需要改名或继续旧任务时，由 coordinator 决定。
- `task-start`、`task-block`、`task-complete` 只更新 `progress.md` 的生命周期状态和日志。
- `task-log` 只追加执行记录；证据使用 `type:PATH:summary`，例如
  `command:TARGET:npm-test:passed`。
- `task-list --json` 和 `status --json` 是 dashboard、reviewer 和后续 agent 的读取入口。

## 验证命令

安装或升级收口前，至少运行：

```bash
node scripts/harness.mjs check --profile target-project /path/to/project
node scripts/harness.mjs status --json /path/to/project
node scripts/harness.mjs dashboard --out /tmp/harness-dashboard.html /path/to/project
```

开发本仓 v1.0 kernel 时，release gate 是：

```bash
npm test
npm run smoke:dashboard
node scripts/harness.mjs check --profile source-package .
node scripts/harness.mjs check --profile private-harness .harness-private
node scripts/harness.mjs check --profile target-project examples/minimal-project
```

## 必跑回归路径

任何 v1.0 kernel 改动都必须覆盖两条路径：

| 路径 | 必须证明 |
| --- | --- |
| 新项目初始化 | 空项目 `init --locale zh-CN\|en-US --capabilities core,...` 后，模板语言一致、registry 正确、`status --json` 不误报 `safe-adoption`。 |
| 旧 harness 迁移 | 旧项目 `add-capability safe-adoption --locale ...` 后，旧文件不被覆盖，缺失 v1.0 模板被补齐，普通模式 warning，strict 模式能阻塞历史缺口。 |

真实项目 dogfood 默认清理测试产物，除非用户明确要求保留并提交。
