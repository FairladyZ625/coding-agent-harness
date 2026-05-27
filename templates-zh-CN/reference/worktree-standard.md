# 工作树标准

## 职责

本标准定义 git worktree 的使用规则，确保多 agent、长程任务和隔离开发不会污染主工作区。worktree 是执行隔离和交接边界，不是临时目录。

## 必须使用独立工作树的场景

- 跨多个模块的实现、重构或迁移。
- 会持续多轮迭代的任务。
- regression、smoke、checker、harness 语义改动。
- 当前主工作区已有未提交改动，且本轮任务不是继续这些改动。
- 使用可写 subagent worker。
- 多个任务需要并行推进。

## 可以不开的场景

- 纯只读分析。
- 明确的小文档修正。
- 用户明确要求直接在当前工作区修改。
- 当前任务就是接着本工作区已存在的同一批改动继续收尾。

不开 worktree 时，必须在 task plan 或 progress 中写明原因。

## 命名规则

worktree 目录推荐：

```text
.worktrees/<type>/<name>
```

分支名推荐：

```text
<type>/<name>
```

常用类型：

- `feat/`：新功能。
- `fix/`：缺陷修复。
- `refactor/`：重构。
- `test/`：测试相关。
- `coding-agent-harness/`：文档相关。
- `codex/`：agent 任务分支。

示例：

```text
.worktrees/feat/user-auth-oauth2 -> feat/user-auth-oauth2
.worktrees/fix/timeline-render-delay -> fix/timeline-render-delay
```

## 记录规则

开始实现前，在 `task_plan.md` 或 `progress.md` 记录：

- worktree 路径。
- 分支名。
- owner。
- 允许修改范围。
- 与主工作区或其他 worktree 的冲突风险。
- 未开 worktree 的原因。

## 多代理并行规则

1. 每个 agent 只操作自己的 worktree。
2. 会改代码、测试、产品文档或 harness 文档的 subagent 必须升级为 worker，并使用独立 worktree / branch。
3. reviewer subagent 默认只读；如要修改，必须重新分配 worker 合同。
4. 共享文件修改需要 coordinator 串行协调。
5. merge 顺序由 coordinator、maintainer 或 release owner 决定。
6. 复杂冲突必须记录并上报，不允许静默覆盖。

## 可写执行者交接

Coordinator 启动 worker 前必须给出：

- worktree 路径。
- 分支名。
- 任务目录。
- write scope。
- 允许触碰的共享文件。
- required checks。
- handoff 格式。

Worker 收口前必须：

- 只在自己的 worktree 内修改。
- 提交自己的改动。
- handoff 写明 worktree path、branch、commit SHA、checks、residual。

Coordinator 必须：

- 只通过 commit / branch 集成 worker 结果。
- 不让多个 worker 在 coordinator 当前 checkout 留下混合未提交改动。
- 集成后运行最终 regression / smoke / required checks。
- 将偏离 worktree 规则的原因写入 progress、walkthrough 或 Harness Ledger。

## 清理规则

- merge 完成后删除对应 worktree。
- 已 merge 的分支按项目规则删除。
- 长期保留 worktree 必须在 progress 或 Delivery SSoT 中写原因。
- 不允许堆积无 owner、无任务、无状态的 worktree。

## 并发上限

项目必须在 `repo-governance-standard.md` 的 worktree 并发部分定义：

- 最大活跃 worktree 数。
- merge ordering rule。
- cleanup owner。
- shared file lock 或串行规则。

未定义并发上限时，不应启动多 agent 并行开发。
