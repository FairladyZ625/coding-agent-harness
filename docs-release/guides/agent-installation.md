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

## 旧 Harness 迁移

目标项目已经有旧版 harness 时使用这条路径。不要把旧文档重建一遍：

```bash
node scripts/harness.mjs add-capability safe-adoption \
  --locale zh-CN \
  /path/to/old-project
```

规则：

- 不覆盖已有 `AGENTS.md`、`CLAUDE.md`、`docs/Harness-Ledger.md`、SSoT、
  walkthrough、task progress 和历史 task plan。
- 只补齐缺失的 v1.0 模板和 capability registry。
- 已有项目事实只能 merge、append 或记录 residual；不能用泛化模板替换。
- 历史合同缺口在普通模式下进入 `adoption-needed` warning。
- `--strict` 必须仍然能因为旧 checker 失败或历史合同缺口而失败。

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
