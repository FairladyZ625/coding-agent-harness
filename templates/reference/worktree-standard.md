# Worktree Standard

## 职责

定义 git worktree 的使用规范，确保多 agent 并行开发时主干稳定。

## 何时必须开 Worktree

- 跨多个模块的实现或重构
- 会持续多轮迭代的任务
- regression / smoke / harness 语义改动
- 当前主工作区已有未提交改动，且本轮任务不是在这些改动上继续

## 何时可以不开

- 纯只读分析
- 纯文档小修
- 用户明确要求直接在当前工作区修改
- 当前任务就是接着本工作区已存在的同一批改动继续收尾

## 命名规范

### Worktree 目录
位置：`.worktrees/<type>/<name>`

### 分支名
格式：`<type>/<name>`

Type：
- `feat/` — 新功能
- `fix/` — Bug 修复
- `refactor/` — 重构
- `test/` — 测试相关
- `docs/` — 文档相关

示例：
- `.worktrees/feat/user-auth-oauth2` → 分支 `feat/user-auth-oauth2`
- `.worktrees/fix/timeline-render-delay` → 分支 `fix/timeline-render-delay`

## 记录规则

开始实现前，必须在 task_plan.md 或 progress.md 记录：
- worktree 路径
- 分支名
- 若未开 worktree，必须写明原因

## 清理规则

- merge 完成后，对应 worktree 必须删除
- 对应分支也应删除（如已 merge）
- 不允许长期堆积未使用的 worktree
- 保留旧 worktree 必须在 progress.md 写明原因

## 多 Agent 并行规则

1. 每个 agent 只操作自己的 worktree
2. 会改代码、测试或文档的 subagent worker 必须使用独立 worktree / branch
3. reviewer subagent 默认只读；如要改代码，必须升级为 worker 并分配 worktree
4. 共享文件的修改需要串行协调
5. merge 顺序由 coordinator 或人工决定
6. 复杂冲突必须报告给人

## Subagent Worker Handoff

Coordinator 启动 worker subagent 前，必须给出：

- worktree 路径
- 分支名
- 任务目录
- write scope
- 允许触碰的共享文件（如有）
- 必跑 checks

Worker 收口前必须：

- 只在自己的 worktree 内修改
- 提交自己的改动
- handoff 中写明 worktree path、branch、commit SHA、checks、residual risks

Coordinator 必须：

- 只通过 commit / branch 集成 worker 结果
- 不让多个 worker 在 coordinator 当前 checkout 里同时留下未提交改动
- 集成后运行最终 regression / smoke
- 把偏离 worktree 规则的原因写入 progress、walkthrough 或 Harness Ledger

## 并发上限

项目必须在 `repo-governance-standard.md` 的 Worktree Concurrency 中定义：

- Max active worktrees
- Merge ordering rule
- Cleanup owner

未定义并发上限时，不应启动多 agent 并行开发。
