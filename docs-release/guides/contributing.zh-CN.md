# 贡献者指南

这份指南面向参与公开 `coding-agent-harness` 仓库的外部贡献者。

## 工作模型

Coding Agent Harness 不只是文档仓库。公开仓库包含：

- `scripts/` 下的 CLI 实现
- `tests/` 下的测试
- `templates/` 与 `templates-zh-CN/` 下的可安装模板
- `presets/` 下的内置 preset
- `docs-release/` 下的公开文档
- `examples/` 下的示例项目
- `harness-gui/` 下的可选 GUI 子模块

PR 尽量聚焦在一类改动上。文档、CLI 行为、目标项目模板、preset 和 GUI 有不同的验证路径。

## 本地准备

使用 Node.js 24 或更高版本。CI 应覆盖最低支持的 LTS 版本。

```bash
npm install
```

如果改动涉及 GUI 子模块：

```bash
cd harness-gui
npm ci
```

## 必要检查

根据改动范围运行相关检查。较大的 PR 或不确定范围时，运行完整根仓检查。

| 改动类型 | 最小本地检查 |
| --- | --- |
| 仅文档 | `git diff --check` |
| CLI / runtime | `npm test`, `npm run check`, `git diff --check` |
| 模板或示例 | `npm test`, `node dist/harness.mjs check --profile target-project examples/minimal-project`, `git diff --check` |
| Dashboard | `npm test`, `npm run smoke:dashboard`, `git diff --check` |
| Package surface | `npm test`, `npm run pack:dry-run`, `git diff --check` |
| GUI 子模块 | `cd harness-gui && npm ci && npm run typecheck && npm test && npm run build` |

完整根仓检查：

```bash
npm test
npm run smoke:dashboard
npm run check
node dist/harness.mjs check --profile target-project examples/minimal-project
npm run pack:dry-run
git diff --check
```

GUI 子模块安装和检查：

```bash
cd harness-gui
npm ci
npm run typecheck
npm test
npm run build
```

如果某个检查无法在本地运行，请在 PR 中说明原因。

## PR 要求

使用仓库 PR 模板，并填写：

- 摘要
- 改动内容
- 版本影响
- 验证证据
- 审查证据
- 残余风险
- 如有相关 issue、任务或设计材料，附上链接

文档或 CI-only 改动通常可以写“不改版本”。运行时、模板、preset 或 package surface 改动可能需要维护者决定版本策略。

## GUI 子模块改动

`harness-gui/` 是 Git submodule。GUI 改动应先提交到 GUI 仓库，再由父仓更新 submodule pointer。更新 pointer 的父仓 PR 应链接 GUI PR，并附上 GUI 验证结果。

## CI

GitHub Actions 会运行贡献者本地也应覆盖的主要 gate：

- 根包测试
- source/package boundary 检查
- minimal target project 检查
- dashboard 生成与 smoke test
- npm package dry run
- GUI 子模块 typecheck、测试和 build

GitHub branch protection 和 required checks 由仓库 owner 在 GitHub 上管理。贡献者只需要让 PR 聚焦、说明清楚并附上验证证据。
