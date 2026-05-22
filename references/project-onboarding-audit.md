# 项目诊断（Onboarding Audit）

## 目的

在搭建 harness 之前，先了解项目现状，确定适合的 harness 规模和结构。

## 扫描清单

进入项目后，按以下清单逐项检查：

### 1. 仓库结构
- 单仓还是多仓？
- 是否是 monorepo（多包）？
- 有哪些子项目 / packages / apps？
- 有没有前后端分离？

### 2. 技术栈
- 主要语言和框架？
- 包管理器？（npm / pnpm / yarn / pip / cargo 等）
- 构建工具？
- 运行时环境？

### 3. 现有文档
- 有没有 AGENTS.md / CLAUDE.md / COPILOT.md？
- 有没有 docs/ 目录？结构如何？
- 有没有 README 以外的开发文档？
- 有没有架构设计文档？
- 如果项目属于微服务、多仓或前后端分仓，用户是否有外部服务文档、接口文档、架构图、会议纪要、链接或导出包？
- 外部资料能否复制进本仓？如果不能，是否需要只保存本地路径、URL、owner 和摘要？

### 4. 现有测试
- 有没有测试框架？（jest / vitest / pytest / go test 等）
- 有没有 CI/CD？
- CI workflow 是否实际存在？路径是什么？
- PR required checks 是哪些？是否和 workflow job 对齐？
- 主分支有没有 branch protection？能否用平台 API 验证？
- 测试覆盖率大概什么水平？
- 有没有端到端测试或集成测试？
- 有没有冒烟测试？

### 5. 现有任务管理
- 有没有任务追踪系统？（GitHub Issues / Linear / Jira 等）
- 有没有排期文档或 SSoT？
- 有没有 planning 目录或任务模板？
- 有没有 Harness Ledger 或类似上下文回写总账？

### 6. 协作模式
- 几个人在开发？
- 是否使用 Coding Agent？用哪些？
- 是否有多 agent 并行的需求？
- 是否使用 git worktree？
- 允许同时存在几个 active worktree？
- merge 顺序由谁决定？

### 6a. Delivery Operating Model
- 当前是单人主控、多 agent 并行，还是多人团队各自带 agent？
- 是否有 team lead / tech lead 负责拆 feature block？
- 是否是前后端分仓、app/service 分仓或 program 多仓？
- 前端 agent 是否只能看到 API 文档 / mock / schema？后端 agent 是否只能看到消费合同？
- 当前使用敏捷 sprint、kanban 连续流、瀑布 stage-gate，还是个人连续执行？
- 是否需要 `docs/09-PLANNING/Delivery-SSoT.md` 记录 feature block owner、依赖、集成顺序和 acceptance gates？

### 6b. Repo Governance
- repo platform 是 GitHub / GitLab / local-only / 其他？
- 是否有 PR template？
- 是否有 CODEOWNERS？
- 是否允许 direct push 到主分支？
- branch protection 状态是 designed / implemented / verified / blocked-with-owner？
- agent 是否有权限读取或设置 repo protection？

### 7. 关键 Surface
- 项目有哪些用户入口？（Web UI、API、CLI、Bot、插件等）
- 有哪些外部集成点？（第三方 API、数据库、消息队列等）
- 哪些 surface 最容易被改动破坏？

## 诊断报告模板

扫描完成后，输出以下格式的诊断报告：

```markdown
# Harness Onboarding Audit

## 项目概况
- 项目名：[名称]
- 仓库类型：[单仓 / monorepo / 多仓]
- 技术栈：[语言 / 框架 / 运行时]
- 团队规模：[人数 + agent 数]

## 现状评估

| 维度 | 现状 | 评级 |
|------|------|------|
| AGENTS.md | [有/无/需改造] | 🟢/🟡/🔴 |
| docs/ 目录 | [有/无/需改造] | 🟢/🟡/🔴 |
| Reference 标准 | [有/无/需改造] | 🟢/🟡/🔴 |
| Planning Loop | [有/无/需改造] | 🟢/🟡/🔴 |
| Delivery Operating Model | [solo/team/split-repo/program/waterfall/kanban/需确认] | 🟢/🟡/🔴 |
| Delivery SSoT | [有/无/不需要/需改造] | 🟢/🟡/🔴 |
| Feature SSoT | [有/无/需改造] | 🟢/🟡/🔴 |
| Regression 体系 | [有/无/需改造] | 🟢/🟡/🔴 |
| CI/CD | [有/无/需改造] | 🟢/🟡/🔴 |
| Repo Governance | [有/无/需改造] | 🟢/🟡/🔴 |
| External Source Intake | [无外部资料 / 少量 evidence 链接 / 需要 source pack / 需询问用户] | 🟢/🟡/🔴 |
| Branch Protection | [designed/implemented/verified/blocked] | 🟢/🟡/🔴 |
| Required Checks | [有/无/需改造] | 🟢/🟡/🔴 |
| Harness Ledger | [有/无/需改造] | 🟢/🟡/🔴 |
| Walkthrough 流程 | [有/无/需改造] | 🟢/🟡/🔴 |
| Worktree 规范 | [有/无/需改造] | 🟢/🟡/🔴 |

## 关键 Surface 清单
1. [Surface 1]：[描述]
2. [Surface 2]：[描述]
...

## 外部资料判断

- 是否属于微服务 / 多仓 / 前后端分仓：[是/否/不确定]
- 是否已询问用户外部资料：[是/否/不适用]
- 外部资料规模：[无 / 1-4 份 / 5+ 份 / 未知]
- 推荐处理：[仅作为 Source Evidence / 创建 external-source-packs/<source-key> / 暂停等待用户提供资料 / 不适用]

## 推荐 Harness 规模
[Lite / Standard / Full]（见下方项目类型分支）

## 落地方案
[具体说明需要创建哪些文件、改造哪些现有文件]

## 风险点
- [风险1]
- [风险2]
```

## 项目类型分支

根据项目规模和复杂度，harness 分三个规模：

### Lite（小型项目）
适用于：单仓、单人开发、代码量 < 1 万行、surface 少于 3 个

最小配置：
- AGENTS.md
- docs/11-REFERENCE/ 下 2-3 个标准文件
- Delivery Operating Model 标准，明确是否为 `solo-orchestrator`
- Planning task plan / findings / progress / review 模板
- repo governance / CI-CD 标准和 residual
- 简化版 Regression SSoT（可以只有 tests + local_smoke 两层）
- Harness Ledger（只记录 task closeout 行）
- Walkthrough 模板

可省略：
- Cadence Ledger（手动触发即可）
- Feature SSoT（用 AGENTS.md 里的简单列表替代）
- Worktree 规范（单人不需要并行）

### Standard（中型项目）
适用于：单仓或 monorepo、1-3 人 + agent、代码量 1-10 万行、surface 3-10 个

完整配置：
- 全部 Phase 1-12
- Delivery Operating Model；若多人协作则创建 Delivery SSoT
- Evidence Depth 至少覆盖到 L3（live 环境验证）
- Cadence Ledger
- Harness Ledger
- Worktree 规范
- repo governance / CI-CD workflow 或 blocked-with-owner residual

### Full（大型项目）
适用于：多仓或大型 monorepo、多人 + 多 agent 并行、代码量 > 10 万行、surface > 10 个

完整配置 + 额外要求：
- Program / split-repo operating model 和 Delivery SSoT
- 每个子仓库或重要子包有自己的 reference 文件
- Evidence Depth 要求覆盖到 L4 或 L5
- Shared Regression Batch 定期执行
- Harness Ledger 季度归档
- 多 agent 并行分工协议
- 跨仓库 surface 映射
