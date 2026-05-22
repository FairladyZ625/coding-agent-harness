# 仓库治理标准

## 职责

本标准定义仓库平台、分支模型、PR 策略、required checks、branch protection、worktree 并发和 merge 规则。它用于避免 agent 在没有仓库治理边界的情况下直接提交、跳过审查或把未验证状态当成已验证。

## 仓库画像

| 项 | 项目约定 |
| --- | --- |
| 平台 | GitHub / GitLab / local-only / 其他 |
| Remote | `owner/repo` 或 URL |
| 默认分支 | `main` / `master` / 其他 |
| 仓库类型 | single app / monorepo / multi-repo / library / service |
| agent 是否有管理权限 | yes / no / unknown |
| 受保护分支 | 默认分支、release branch 或其他 |

## 分支模型

| 分支类型 | 命名规则 | 用途 | merge 规则 |
| --- | --- | --- | --- |
| feature branch | 例如 `feat/<name>` 或 `codex/<name>` | 常规功能和修复 | PR 或项目约定流程 |
| fix branch | 例如 `fix/<name>` | 缺陷修复 | 跑 required checks 后合入 |
| release branch | 例如 `release/<version>` | 发布稳定线 | release owner 管理 |
| hotfix branch | 例如 `hotfix/<name>` | 生产紧急修复 | 必须记录验证和回滚路径 |
| worker branch | coordinator 指定 | subagent worker 独立交付 | 通过 commit / branch handoff 集成 |

直接推送策略必须写清：哪些分支禁止 direct push，哪些例外需要 owner 批准。

## PR 策略

| 项 | 项目约定 |
| --- | --- |
| 是否必须 PR | yes / no / local-only |
| PR 标题格式 | 通常与 commit 规范一致 |
| PR 描述要求 | 改动、原因、验证、residual、关联 task / SSoT / review |
| 必需审查者 | reviewer、外部 agent、人类 owner 或代码 owner |
| 必需审查类型 | self-review、subagent review、human review、security review |
| merge method | merge commit、squash、rebase、fast-forward |
| merge order owner | coordinator、maintainer、release owner |

## 必需检查

| 检查 | 命令或 workflow | 是否必需 | 证据 | residual 规则 |
| --- | --- | --- | --- | --- |
| lint | 项目命令或 CI job | yes/no | 日志或 workflow run | 失败需修复或 owner 接受 |
| typecheck | 项目命令或 CI job | yes/no | 日志或 workflow run | 不适用需说明 |
| build | 项目命令或 CI job | yes/no | 日志或 workflow run | 发布前必须明确 |
| test | 项目命令或 CI job | yes/no | 测试结果 | flaky 需记录 |
| smoke | 本地、browser 或 live smoke | yes/no | 截图、日志、trace | residual 路由到 Regression SSoT |

## 分支保护

| 项 | 项目约定 |
| --- | --- |
| 状态 | `designed` / `implemented` / `verified` / `blocked-with-owner` |
| 必需状态检查 | required status checks 列表 |
| 必需 PR 审查数量 | 数量和角色 |
| Dismiss stale reviews | yes / no |
| Require branches up to date | yes / no |
| Block force push | yes / no |
| Block deletion | yes / no |
| Bypass actors | 明确角色，不写个人密钥 |
| 验证命令 | `gh`、平台 UI 证据或 API 查询 |
| Manual setup residual | 不能自动配置时的 owner 和原因 |

## 工作树并发治理

| 项 | 项目约定 |
| --- | --- |
| 最大活跃 worktree 数 | 项目上限 |
| worktree 命名 | 目录模式 |
| branch 命名 | 分支模式 |
| owner 规则 | 谁创建、谁清理、谁集成 |
| subagent worker 规则 | 每个可写 worker 使用独立 worktree / branch，并 handoff commit SHA |
| 主动提交规则 | 已验证的、有意义的切片默认主动提交；暂不提交必须写明原因 |
| merge 顺序 | coordinator 或 release owner 决定 |
| 清理规则 | merge 后删除，保留需写原因 |

## 收口要求

- 非平凡任务的 PR 或 walkthrough 必须说明 required checks 的执行结果。
- branch protection 未 verified 时，不能声称仓库已受保护；只能写 `designed`、`implemented` 或 `blocked-with-owner`。
- worker 结果只能通过 commit / branch 集成，不能混入 coordinator 未提交改动。
- coordinator 自己执行时也要主动提交已验证切片；未提交状态必须有 owner、原因和下一步。
- repo governance 变化必须同步 CI/CD 标准、worktree 标准和 Harness Ledger。
