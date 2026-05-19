# CI/CD 标准

## 职责

本标准定义项目的 CI/CD 入口、required checks、密钥边界、发布路径和证据状态。它的目标不是描述理想流水线，而是让 agent 能判断：本轮改动需要跑哪些检查、哪些检查已经验证、哪些仍是 residual。

## 项目 CI 画像

| 项 | 项目约定 |
| --- | --- |
| CI 平台 | GitHub Actions / GitLab CI / 本地脚本 / 其他 |
| 主要运行时 | Node / Python / Go / Rust / Java / mixed / 其他 |
| 包管理器 | 项目实际使用的工具 |
| 安装命令 | 例如 `npm ci`、`pnpm install`、`uv sync` |
| lint 命令 | 项目标准命令 |
| typecheck 命令 | 如适用，写明命令；不适用时写 `n/a` 和原因 |
| test 命令 | 单元、集成或项目默认测试 |
| build 命令 | 构建或打包命令 |
| smoke / regression 命令 | 本地冒烟、浏览器检查、live smoke 或回归入口 |
| 缓存策略 | 依赖、构建产物、浏览器二进制等缓存边界 |
| 必需密钥 | 只写变量名和用途，不写密钥值 |
| 不支持的检查 | 写明原因、owner 和 residual |

## 工作流登记

| 工作流 | 路径 | 触发条件 | 必需 job | 证据 |
| --- | --- | --- | --- | --- |
| PR 检查 | `.github/workflows/...` | pull request | lint / typecheck / test / build | workflow run 或本地等价命令 |
| 主干检查 | `.github/workflows/...` | default branch push | 项目约定 | workflow run |
| 发布检查 | `.github/workflows/...` | tag / release / manual dispatch | build / smoke / deploy | release log |

如果项目暂时只有本地检查，也要写清本地命令、谁负责执行、何时升级为 CI。

## 必需检查

| 检查 | 命令或 job | 是否必需 | 何时运行 | 证据要求 | residual 规则 |
| --- | --- | --- | --- | --- | --- |
| lint | 项目命令或 CI job | yes/no | PR 前或收口前 | 通过日志或 workflow run | 失败必须修复或写 owner |
| typecheck | 项目命令或 CI job | yes/no | 类型相关改动后 | 通过日志 | 不适用需说明 |
| build | 项目命令或 CI job | yes/no | 构建面受影响时 | 通过日志 | 失败不能发布 |
| test | 项目命令或 CI job | yes/no | 非平凡改动后 | 测试结果 | flaky 需记录 |
| smoke / regression | 项目命令或手工脚本 | yes/no | merge、release 或关键面变更 | 截图、日志、trace 或回归记录 | residual 路由到 Regression SSoT |

## 发布与回滚

| 项 | 项目约定 |
| --- | --- |
| 发布触发 | tag、release branch、manual dispatch、外部平台 |
| 发布环境 | staging / production / local-only |
| 审批要求 | 自动、人工审批、owner approval |
| 回滚路径 | revert、重新部署旧版本、平台 rollback |
| 签名与凭证边界 | 密钥来源、可见范围、谁有权限 |
| 不在本轮范围内的发布能力 | 写明原因和后续 owner |

## 状态枚举

CI/CD 相关状态只使用：

- `designed`：规则已设计，但没有落地。
- `implemented`：脚本或 workflow 已存在，但未验证。
- `verified`：已用当前证据验证通过。
- `blocked-with-owner`：有阻塞，且已写明 owner。
- `n/a`：本项目或本轮不适用，并已说明原因。

禁止把 `designed` 或 `implemented` 写成 `verified`。

## 收口要求

- PR 或 walkthrough 必须列出本轮实际运行的 required checks。
- 跳过 required check 时，必须写 residual、owner 和不阻塞理由。
- 发布相关改动必须说明 release trigger、credential boundary 和 rollback path。
- CI/CD 标准变化必须同步 `repo-governance-standard.md`、Regression SSoT 或 Harness Ledger。
