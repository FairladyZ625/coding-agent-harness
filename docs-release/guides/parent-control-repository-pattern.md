# 主控仓库模式

English mirror: `docs-release/guides/parent-control-repository-pattern.en-US.md`

主控仓库模式是一种多仓库 Coding Agent Harness 组织方式。

它的核心判断是：

> 业务代码可以分散在很多仓库，但 Agent 的运行合同不能分散。

父仓库管理 Harness。子仓库管理代码执行事实。

## 为什么需要这个模式

多仓项目里，经常出现这些问题：

- 前端、后端、SDK、微服务各有自己的计划，没人知道全局 release 到底卡在哪里。
- Agent 从某个子仓库启动，只看到局部 `AGENTS.md`，忽略了跨仓架构约束。
- 每个仓库各自维护 Feature SSoT，状态互相冲突。
- Review 证据、测试证据、walkthrough 分散在不同仓库，最后无法证明一个跨仓任务真正完成。

主控仓库模式解决的是控制面问题。它不是要求把代码放回单仓，而是把 Harness 的事实源收回一个地方。

## 基本拓扑

```text
product-control-repo/
  AGENTS.md
  README.md
  docs/
    01-GOVERNANCE/
    02-PRODUCT/
    03-ARCHITECTURE/
    04-DEVELOPMENT/
    05-TEST-QA/
    06-INTEGRATIONS/
    09-PLANNING/
    10-WALKTHROUGH/
    11-REFERENCE/
  tools/
    check-harness.mjs
    internal-ci.mjs
  frontend/       -> child repository
  backend/        -> child repository
  sdk/            -> child repository
  services/auth/  -> child repository
  services/bill/  -> child repository
```

子仓库可以是 git submodule、git subtree、workspace checkout、固定路径约定，或由内部工具解析的 repo registry。关键不是技术形式，而是事实归属：

- 父仓库记录全局计划和证据。
- 子仓库记录代码和局部验证。

## 父仓库职责

父仓库是 control plane。

它应该包含：

- `AGENTS.md`：Agent 的唯一启动入口和读文件矩阵。
- `docs/03-ARCHITECTURE/repository-topology.md`：仓库拓扑、owner、边界、依赖方向。
- `docs/04-DEVELOPMENT/local-development.md`：跨仓本地启动、联调、依赖安装。
- `docs/06-INTEGRATIONS/`：跨服务 API、事件、SDK、数据库、权限、外部系统契约。
- `docs/09-PLANNING/Feature-SSoT.md`：全局 feature 和 release 状态。
- `docs/09-PLANNING/TASKS/`：跨仓任务合同。
- `docs/05-TEST-QA/Regression-SSoT.md`：跨仓 regression gates。
- `docs/05-TEST-QA/Cadence-Ledger.md`：哪些变更触发哪些检查。
- `docs/10-WALKTHROUGH/`：跨仓 closeout 和人工确认。
- `docs/11-REFERENCE/`：本项目使用 Harness 的本地标准。

父仓库还应该有一个检查命令，例如：

```bash
node tools/check-harness.mjs
```

这个命令至少检查：

- 必需 Harness 文件存在。
- `AGENTS.md` 含有 repo topology 和子仓库路由。
- 当前任务有计划、进度、review 或 closeout 状态。
- 跨仓 regression gate 有 owner 和 evidence。
- 子仓库 pointer、branch、commit 或 release version 已记录。

## 子仓库职责

子仓库是 execution plane。

它应该包含：

- 局部 `AGENTS.md`：本仓库规则、命令、技术栈、测试方式。
- 代码、依赖、lockfile、CI。
- 本仓库局部 review 或 PR。
- 本仓库局部测试证据。

子仓库不应该单独维护全局 Feature SSoT，也不应该自己决定跨仓 release 是否完成。

一个子仓库 `AGENTS.md` 可以很短：

````md
# Backend Agent Guide

This child repository owns the backend implementation.
Parent-level planning, architecture, and cross-repo closeout live in `../docs/`.

## Rules

1. Keep API contracts aligned with the parent task plan.
2. Do not change frontend or SDK assumptions without updating the parent integration docs.
3. Run `npm run typecheck` after TypeScript changes.

## Commands

```bash
npm install
npm run typecheck
npm test
```
````

## Agent 启动规则

主控仓库模式下，默认规则是：

1. Agent 从父仓库启动。
2. Agent 先读父仓库 `AGENTS.md`。
3. Agent 根据任务类型读取父仓库的 architecture、development、integration、planning、regression 文档。
4. Agent 进入一个或多个子仓库执行代码变更。
5. Agent 在子仓库跑局部检查。
6. Agent 回到父仓库记录全局证据、review、walkthrough、residual。

不要让 Agent 直接从随机子仓库启动跨仓任务。那样它会天然缺少全局上下文。

## 跨仓任务合同

跨仓任务应该在父仓库创建：

```text
docs/09-PLANNING/TASKS/2026-05-22-example-cross-repo-feature/
  brief.md
  task_plan.md
  execution_strategy.md
  visual_map.md
  progress.md
  review.md
```

任务计划至少说明：

- 哪些子仓库会被修改。
- 每个子仓库的 write scope。
- 共享契约在哪里，例如 API schema、SDK type、事件格式。
- 每个子仓库要跑哪些局部检查。
- 最终跨仓 regression gate 是什么。
- 谁负责更新父仓库的全局 SSoT 和 walkthrough。

子仓库提交不是独立任务的终点，而是父任务的 evidence。

## Architecture / Development / Integration 要写什么

主控仓库模式下，父仓库必须比单仓项目多写三类外围事实。

### Architecture

`docs/03-ARCHITECTURE/` 说明系统如何被拆成多个仓库：

- repo topology。
- 服务边界。
- 数据流。
- 依赖方向。
- 哪些仓库是产品代码，哪些是 upstream reference。
- 哪些接口不能跨边界直接调用。

### Development

`docs/04-DEVELOPMENT/` 说明如何跨仓工作：

- 如何 clone 或初始化所有子仓库。
- 如何安装依赖。
- 如何启动本地联调环境。
- 哪些端口、环境变量、账号或 fixture 是共享的。
- 如何在只改一个子仓库时仍然验证整体契约。

### Integration

`docs/06-INTEGRATIONS/` 说明仓库之间如何对接：

- API contract。
- SDK contract。
- event contract。
- database ownership。
- auth boundary。
- queue/topic ownership。
- external vendor integration。
- breaking change policy。

如果这些外围事实不写，主控仓库只会变成一个更大的任务列表，而不会真正控制多仓协作。

## 回归策略

父仓库的 `Regression-SSoT.md` 不应该复制所有子仓库测试。它应该定义分层 gate：

| Gate | 位置 | 目的 |
| --- | --- | --- |
| Repo-local gate | 子仓库 | 证明局部代码没有坏 |
| Contract gate | 父仓库或共享包 | 证明跨仓接口没有漂移 |
| Integration gate | 父仓库工具或 CI | 证明多个子仓库可以一起运行 |
| Release gate | 父仓库 | 证明当前 feature/release 可以收口 |

子仓库可以自己跑 `npm test`、`pytest`、`go test`。父仓库负责把这些结果投影成 release 能看懂的证据。

## 微服务很多时怎么做

如果有几十个或上百个仓库，不要给每个仓库手写大段文档。父仓库应该维护 repo registry：

```md
| Repo | Role | Owner | Local checks | Integration surface | Release critical |
| --- | --- | --- | --- | --- | --- |
| `services/auth` | auth service | platform | `go test ./...` | JWT, user session events | yes |
| `services/bill` | billing service | revenue | `npm test` | invoice events, payment API | yes |
| `frontend` | product shell | product | `npm run typecheck` | backend API, SDK client | yes |
```

Agent 不需要在启动时读 100 个仓库的所有文档。它先读父任务，再按 repo registry 进入本次相关的几个仓库。

## 反模式

避免这些做法：

- 每个子仓库各自维护全局 Feature SSoT。
- 父仓库只有 README，没有任务、回归和 closeout。
- 子仓库 `AGENTS.md` 复制父仓库大段内容，导致漂移。
- 跨仓任务从子仓库启动，最后再补父仓库记录。
- 父仓库直接承载所有业务代码，失去子仓库独立发布能力。
- 只记录子仓库测试通过，不记录跨仓 contract 和 release gate。

## 最小落地清单

采用主控仓库模式时，先做到这些：

- 父仓库 `AGENTS.md` 写清楚它是 control repo。
- `docs/03-ARCHITECTURE/repository-topology.md` 列出所有子仓库。
- `docs/09-PLANNING/Feature-SSoT.md` 成为全局 feature source of truth。
- `docs/05-TEST-QA/Regression-SSoT.md` 定义局部、契约、集成、发布 gate。
- 每个子仓库只有短的局部 `AGENTS.md`。
- 新跨仓任务只在父仓库创建。
- 子仓库 commit、PR、test output 都作为父任务 evidence。

## 一句话

主控仓库模式不是为了多建一个仓库，而是为了让多仓项目只有一个 Harness 大脑。
