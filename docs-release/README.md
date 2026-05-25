# Coding Agent Harness Docs Release

This directory is the public-facing documentation library for Coding Agent Harness.
It is separate from maintainer-only operating records for this source repository.

简体中文说明：这个目录只放可公开发布的方法论、架构和使用指南。它不记录本仓库自己的私有任务计划、审查草稿、ledger 或本地运行状态。

## Language Entry / 语言入口

English is the canonical public language for GitHub and npm discovery. Simplified Chinese is fully supported for README, guides, prompts, and executable templates. Other languages currently provide short introductions and route users to the English docs.

英文是 GitHub 和 npm 公开传播的主语言。简体中文保留完整支持，包括 README、指南、prompt 和可执行模板。其他语言目前提供简介入口，并引导用户阅读英文文档。

| Language | Entry | Support |
| --- | --- | --- |
| English | [`../README.md`](../README.md), [`intl/en-US.md`](intl/en-US.md) | Full docs and templates |
| 简体中文 | [`../README.zh-CN.md`](../README.zh-CN.md), [`intl/zh-CN.md`](intl/zh-CN.md) | Full docs and templates |
| 日本語 | [`intl/ja-JP.md`](intl/ja-JP.md) | Intro only |
| 한국어 | [`intl/ko-KR.md`](intl/ko-KR.md) | Intro only |
| Français | [`intl/fr-FR.md`](intl/fr-FR.md) | Intro only |
| Español | [`intl/es-ES.md`](intl/es-ES.md) | Intro only |
| Deutsch | [`intl/de-DE.md`](intl/de-DE.md) | Intro only |

## Boundary

Public docs in this directory explain the product architecture, concepts, and release
roadmap. They must not contain private task ledgers, local review drafts, internal
handoffs, or user/project-specific operating state.

Maintainer-only operating state for this repository is kept outside the public
documentation tree and outside the public release package.

## How To Read This Library / 如何阅读

Not every document is written for the same reader.

不是所有文档都给同一种读者看。先判断自己是要理解方法、执行迁移，还是给目标项目里的 Agent 建立合同。

| Reader / 读者 | Start here / 从这里开始 | Purpose / 用途 |
| --- | --- | --- |
| Product / engineering leaders 产品和工程负责人 | `guides/repository-operating-models.md` / `guides/repository-operating-models.en-US.md` | Choose single-repo, independent multi-repo, or parent-control repository mode. 选择单仓、多仓独立或主控仓库模式。 |
| Architects / tech leads 架构负责人 | `architecture/overview.md` / `architecture/overview.zh-CN.md` | Understand the product architecture and task lifecycle. 理解产品架构和任务生命周期。 |
| Review owners / maintainers 审查负责人和维护者 | `guides/task-state-machine.md` / `guides/task-state-machine.en-US.md` | Understand task state, review status, closeout, and review queue semantics. 理解任务状态、审查状态、收口和审查队列语义。 |
| External contributors 外部贡献者 | `../CONTRIBUTING.md`, `guides/contributing.md` / `guides/contributing.zh-CN.md` | Prepare a focused PR with the right local checks and CI expectations. 按正确的本地检查和 CI 预期提交聚焦 PR。 |
| Teams adopting Harness 项目接入团队 | `guides/agent-installation.md` / `guides/agent-installation.en-US.md` | Install and operate the agent entrypoint in a target project. 在目标项目中安装和运行 Agent 入口。 |
| Agents running a migration 执行迁移的 Agent | `guides/legacy-migration-agent-prompt.md` / `guides/legacy-migration-agent-prompt.zh-CN.md` | Follow an executable migration contract. 按可执行迁移合同工作。 |
| Maintainers deciding what to publish 维护者 | `guides/document-audience-and-surfaces.md` / `guides/document-audience-and-surfaces.en-US.md` | Separate human docs, agent docs, and private operating state. 区分人读文档、Agent 执行文档和私有运行状态。 |

## Public Docs / 公开文档

### International Intros / 多语言简介

- `intl/README.md` — language support matrix and intro page index. 语言支持矩阵和简介页索引。
- `intl/en-US.md`, `intl/zh-CN.md`, `intl/ja-JP.md`, `intl/ko-KR.md`, `intl/fr-FR.md`, `intl/es-ES.md`, `intl/de-DE.md` — short public introductions for global discovery. 面向国际传播的短简介入口。

### Architecture / 架构

- `architecture/overview.md` / `architecture/overview.zh-CN.md` — public architecture overview, including the CLI, dashboard, task lifecycle, migration rails, review gate, and release package surface. 公开架构总览，覆盖 CLI、Dashboard、任务生命周期、迁移轨道、审查门禁和发布包表面。

### Methodology / 方法论

- `guides/contributing.md` / `guides/contributing.zh-CN.md` — public contributor workflow, local checks, PR expectations, and GUI submodule validation. 公开贡献者流程、本地检查、PR 要求和 GUI 子模块验证。
- `guides/document-audience-and-surfaces.md` / `guides/document-audience-and-surfaces.en-US.md` — explains which docs are for humans, which docs are for agents, and which state must stay out of public release docs. 说明哪些文档给人看，哪些给 Agent 执行，以及哪些状态不能进入公开发布文档。
- `guides/repository-operating-models.md` / `guides/repository-operating-models.en-US.md` — compares single-repo, independent multi-repo, and parent-control repository operating models. 对比单仓、多仓独立、主控仓库三种运行模式。
- `guides/parent-control-repository-pattern.md` / `guides/parent-control-repository-pattern.en-US.md` — describes the control-plane pattern for products with many child repositories, services, SDKs, or upstream references. 解释多子仓库、多服务、SDK、上游参考仓库场景下的控制面模式。
- `guides/task-state-machine.md` / `guides/task-state-machine.en-US.md` — explains task state, derived lifecycle, review status, closeout, review queue buckets, and human confirmation flow. 解释任务状态、派生生命周期、审查状态、收口、审查队列分桶和人工确认流程。

### Adoption And Migration / 接入与迁移

- `guides/agent-installation.md` / `guides/agent-installation.en-US.md` — operational installation guide for target-project agents. 目标项目 Agent 的安装和运行指南。
- `guides/migration-playbook.md` / `guides/migration-playbook.en-US.md` — smooth migration guide for existing legacy harness projects. 旧 Harness 项目的平滑迁移指南。
- `guides/legacy-migration-agent-prompt.md` / `guides/legacy-migration-agent-prompt.zh-CN.md` — prompt contract for agents running baseline or full legacy migration. 给迁移 Agent 使用的执行合同。
- `guides/full-legacy-migration-subagent-strategy.md` / `guides/full-legacy-migration-subagent-strategy.zh-CN.md` — full readable cutover strategy with subagent roles, adversarial review, and dashboard/CLI proof gates. 完整可读迁移的 subagent 分工、对抗审查和 Dashboard/CLI 证据门禁。

## Repository Operating Models / 仓库运行模式

Coding Agent Harness supports three common repository shapes:

Coding Agent Harness 支持三种常见仓库形态：

| Model / 模式 | Summary / 摘要 | Primary doc / 主文档 |
| --- | --- | --- |
| Single-repo Harness 单仓模式 | One code repository owns code, plans, regression, and closeout. 一个代码仓库同时承载代码、计划、回归和收口。 | `guides/repository-operating-models.md` |
| Independent multi-repo Harness 多仓独立模式 | Each code repository owns its own local Harness; cross-repo context must be documented in architecture, development, and integration docs. 每个代码仓库有自己的局部 Harness，跨仓上下文必须写进 architecture、development、integration 文档。 | `guides/repository-operating-models.md` |
| Parent-control repository Harness 主控仓库模式 | One parent repository owns the Harness control plane; child repositories own implementation facts. 一个父仓库管理 Harness 控制面，子仓库只承载代码执行事实。 | `guides/parent-control-repository-pattern.md` |

The parent-control pattern is the recommended default when one product spans many repositories but still needs one release plan, one task source of truth, and one agent startup point.

当一个产品跨多个仓库，但仍然需要一个 release 计划、一个任务事实源和一个 Agent 启动入口时，推荐优先采用主控仓库模式。

Release roadmaps, staged plans, task execution strategy, final-check walkthroughs,
and maintainer publishing notes are project operating state. Keep them in
maintainer-only operating records, not in this public documentation tree.

## Release Rule

If a document tells users how the harness works, it belongs here or under
`references/`.

If a document records how this repository is being operated, reviewed, migrated, or
closed out, keep it outside the public documentation tree.
