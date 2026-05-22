# 仓库运行模式选择指南

English mirror: `docs-release/guides/repository-operating-models.en-US.md`

Coding Agent Harness 可以落在不同的仓库组织方式里。选择错了，后面最常见的问题不是“文档少”，而是 Harness 自己变成新的混乱源。

这份指南解释三种常见模式：

- 单仓模式：一个代码仓库，一套 Harness。
- 多仓独立模式：多个代码仓库，每个仓库有自己的 Harness。
- 主控仓库模式：一个父级控制仓库管理 Harness，多个子仓库只承载代码执行事实。

## 快速选择

| 模式 | 适合 | 不适合 | Harness 事实源 |
| --- | --- | --- | --- |
| 单仓模式 | 单产品、单代码仓库、团队边界清楚 | 已经拆成多个独立发布仓库 | 当前仓库 `AGENTS.md` + `docs/` |
| 多仓独立模式 | 前端、后端、SDK 等仓库长期独立迭代，跨仓任务少 | 大量跨仓 feature 和统一 release 计划 | 每个仓库自己的 `AGENTS.md` + `docs/` |
| 主控仓库模式 | 微服务、多子系统、多仓统一路线图、跨仓 release、Agent 需要从一个地方启动 | 小项目，或只有一个短期脚本仓库 | 父仓库 `AGENTS.md` + `docs/` |

## 单仓模式

单仓模式最简单。代码、计划、回归、walkthrough 都在同一个仓库里。

```text
product-repo/
  AGENTS.md
  docs/
    03-ARCHITECTURE/
    04-DEVELOPMENT/
    05-TEST-QA/
    09-PLANNING/
    10-WALKTHROUGH/
    11-REFERENCE/
  src/
  tests/
```

Agent 从仓库根目录启动，读 `AGENTS.md`，然后进入任务文件和代码。

### 什么时候选

- 应用、服务、脚本或库都在一个仓库里。
- Feature 通常只改这个仓库。
- 回归命令可以在一个 checkout 内完成。
- 团队希望快速接入 Harness，不想先改组织结构。

### 风险

当项目后来拆出多个仓库时，单仓 Harness 容易失去全局视野。前端、后端、SDK 各自都有状态，但没有一个地方能说明跨仓任务到底完成到哪一步。

## 多仓独立模式

多仓独立模式让每个仓库都有自己的 Harness。

```text
frontend-repo/
  AGENTS.md
  docs/

backend-repo/
  AGENTS.md
  docs/

sdk-repo/
  AGENTS.md
  docs/
```

每个仓库的 Agent 入口只管本仓库。前端任务在前端仓库计划和收口，后端任务在后端仓库计划和收口。

### 什么时候选

- 仓库之间组织上确实独立。
- 每个仓库有自己的 owner、release 节奏和 review 规则。
- 跨仓任务少，或者跨仓任务由人手动协调。
- 某个仓库的 Harness 不应该知道另一个仓库的内部状态。

### 必须补的外围文档

多仓独立模式不能只给每个仓库复制一套模板。否则跨仓上下文会断。

每个仓库至少要在这些位置写清楚外部边界：

- `docs/03-ARCHITECTURE/`：本仓库在整体系统中的位置。
- `docs/04-DEVELOPMENT/`：依赖哪些 sibling repo、本地联调怎么启动。
- `docs/06-INTEGRATIONS/`：API、事件、SDK、队列、数据库、鉴权等外部契约。
- `docs/05-TEST-QA/Regression-SSoT.md`：哪些检查只覆盖本仓库，哪些需要跨仓联调。
- `AGENTS.md`：遇到跨仓任务时，Agent 应该停下来、切仓库，还是交给人协调。

### 风险

多仓独立模式的风险是 Harness 分裂：

- 前端 Feature SSoT 认为任务完成，后端 Regression SSoT 仍是红灯。
- SDK 的 breaking change 没有投影到产品 shell。
- Agent 从子仓库启动后，只看到局部事实，误以为全局任务已经结束。

如果这种情况频繁发生，应升级到主控仓库模式。

## 主控仓库模式

主控仓库模式把 Harness 放在父仓库。子仓库只承载代码执行事实。

```text
product-control-repo/
  AGENTS.md
  docs/
    03-ARCHITECTURE/
    04-DEVELOPMENT/
    05-TEST-QA/
    06-INTEGRATIONS/
    09-PLANNING/
    10-WALKTHROUGH/
    11-REFERENCE/
  tools/
  frontend/   -> child repository
  backend/    -> child repository
  sdk/        -> child repository
  service-a/  -> child repository
  service-b/  -> child repository
```

父仓库是 control plane。它管理：

- 总体架构和 repo topology。
- 跨仓 Feature SSoT。
- 任务计划、review、walkthrough。
- Regression SSoT 和跨仓 cadence。
- Agent 启动入口和读文件矩阵。
- 子仓库 commit、分支、submodule pointer 或 release version 的证据。

子仓库是 execution plane。它们管理：

- 代码实现。
- 本仓库依赖和 lockfile。
- 本仓库局部测试和 CI。
- 本仓库局部 `AGENTS.md`。
- 具体提交和 PR。

### 什么时候选

- 一个产品由多个仓库共同交付。
- Feature 经常跨前端、后端、SDK、微服务。
- 你希望 Agent 永远从同一个入口启动。
- 你需要统一的任务状态、review 门禁和 release closeout。
- 微服务数量很多，不能让每个仓库各自维护一套全局计划。

### 核心好处

主控仓库模式把“全局事实”固定在一个地方。即使有 100 个子仓库，Agent 也先读父仓库的任务合同，然后再进入具体子仓库执行。

这能避免：

- 多个 Feature SSoT 互相冲突。
- 每个子仓库都声称自己已经完成，但 release 仍不能发。
- Agent 从错误仓库启动，只看到局部上下文。
- 跨仓 review 和 regression 证据散落在不同地方。

完整方法见 `docs-release/guides/parent-control-repository-pattern.md`。

## 从一种模式迁移到另一种

### 单仓到多仓

当一个单仓拆出前端、后端、SDK 时，不要直接复制 `docs/` 到每个仓库。

先决定：

- 哪些任务仍是全局任务？
- 哪些任务变成子仓库局部任务？
- 原来的 Regression SSoT 是保留在父层，还是拆成局部 gate？
- Agent 未来从哪里启动？

如果跨仓 feature 仍然很多，优先创建主控仓库。

### 多仓独立到主控仓库

迁移顺序：

1. 创建父仓库 `AGENTS.md` 和 repo topology。
2. 把全局 Feature SSoT、Regression SSoT、walkthrough index 收到父仓库。
3. 子仓库保留局部 `AGENTS.md`，但把全局计划指向父仓库。
4. 新跨仓任务只在父仓库创建 task。
5. 子仓库提交只作为父任务的 evidence。

不要一次性重写所有历史任务。先把当前 release 和活跃 feature 接到父仓库。

## 推荐默认值

- 新的小项目：单仓模式。
- 已经有多个强独立团队：多仓独立模式。
- 一个产品、多个代码仓库、一个 release 目标：主控仓库模式。
- 微服务很多但需要统一 Agent 协作：主控仓库模式。

真正的判断标准不是仓库数量，而是全局决策是否需要一个唯一事实源。
