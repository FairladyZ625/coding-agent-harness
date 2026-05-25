# 模块会话提示词（Module Session Prompt）

用于为模块并行项目启动一个长程模块会话。交给新 agent 前，coordinator 必须先用真实项目事实替换占位符。

```text
你正在 <repo-path> 中处理 <module-key> 模块。

子代理 worker 不变量：
- 如果这个提示词被交给会改代码的 worker 子代理，coordinator 必须先分配独立 worktree 和分支。
- Worker 只能在 <worktree-path> 内编辑，必须提交自己的改动，并交接 worktree path、branch、commit SHA、checks、residual risks。
- Reviewer 子代理默认只读；除非明确升级为 worker，并遵守同一套 worktree 合同。
- Coordinator 负责集成 worker commit 并运行最终门禁；不要在一个 checkout 中混合多个 worker 的未提交改动。

目标：
- 执行 docs/09-PLANNING/Module-Registry.md 与 docs/09-PLANNING/MODULES/<module-key>/module_plan.md 中为 <module-key> 标记的当前步骤。
- 除非触发 stop condition，否则持续推进到该步骤已实现、已验证、已记录，并可进入审查。

冷启动：
1. 阅读 AGENTS.md。
2. 阅读 docs/09-PLANNING/Module-Registry.md。
3. 阅读 docs/09-PLANNING/MODULES/Session-Prompt-Pack.md 或 docs/09-PLANNING/MODULES/<module-key>/session_prompt.md。
4. 阅读 docs/09-PLANNING/MODULES/<module-key>/module_plan.md。
5. 按项目任务阅读矩阵读取本任务涉及文件对应的标准文档。

启动门禁：
- 确认 registry 中 <module-key> 的 branch、current step、status、write scope 与本 prompt 一致。
- 确认当前 checkout/worktree path 是 <worktree-path>，当前分支是 <branch-name>。
- 编辑前检查 dirty state，不要 revert 无关改动。
- 如果另一个活跃会话拥有该模块或必需共享文件，停止并记录冲突。
- 代码编辑前，基于项目 planning 模板创建或更新 docs/09-PLANNING/MODULES/<module-key>/TASKS/<current-step>-<short-name>/task_plan.md，写清范围、验收、验证、分支/worktree 和共享协调。
- 代码编辑前，确认模块任务目录含有 `execution_strategy.md` 与 `visual_map.md`。如缺失，先补齐再实现。
- 如果 docs/09-PLANNING/MODULES/<module-key>/ 缺少模块级 `execution_strategy.md` 或 `visual_map.md`，在派发 worker 前补齐或更新。

分支与工作树：
- Worktree path: <worktree-path>.
- Branch: <branch-name>.
- Base branch: <base-branch>.
- Remote: <remote-name>.
- 只在 <module-key> 的模块 worktree 中工作。若 worktree 不存在，按项目 worktree 标准创建。

写入范围：
- 允许：<module-write-scope>.
- 未明确协调前禁止：<shared-or-forbidden-scope>.
- 共享协调产物：docs/09-PLANNING/MODULES/_shared/TASKS/<id>/task_plan.md，或模块任务计划中的“共享协调”段，必须写明 owner、涉及文件、允许改动、reviewer 和 merge 顺序。
- 如果实现需要触碰允许范围之外的文件，停止并记录所需协调，不要直接编辑。

验证：
- Project harness check: <project-harness-check-command>.
- 运行模块 targeted checks: <targeted-checks>.
- 改动代码或 UI 行为时，运行 lint/build/smoke checks。
- 将精确命令和结果记录到模块任务 progress 或 walkthrough。

收口：
- 更新模块计划和模块任务进度。
- 除非 coordinator 明确分配共享锁，worker session 不得更新 docs/09-PLANNING/Module-Registry.md、docs/Harness-Ledger.md、Closeout SSoT、Regression SSoT 或 Cadence Ledger。
- 如果需要全局表更新，在 task_plan.md 或 progress.md 写 Coordinator 交接，并标记 `Global sync status: pending-coordinator-pass`。
- 只有 coordinator pass 或明确的 shared-lock owner 可以更新 docs/09-PLANNING/Module-Registry.md。
- 汇报状态时区分 `task.state`、`lifecycleState`、`reviewStatus` 和 `closeoutStatus`；`done` 只表示实现步骤完成，不等于 `closed`。
- 把当前任务 `visual_map.md` 阶段表作为生命周期地图。切片结束时检查当前 gate phase；只有 `Actor` 为 `agent` 的 `Exit Command` 才由 Agent 执行。
- 更新 docs/09-PLANNING/MODULES/<module-key>/module_plan.md。
- 写 review.md，或记录 review skipped-with-reason。需要人工确认审查完成时，必须通过本地 dashboard workbench，或由 coordinator 执行 `harness review-confirm`；存在开放 P0/P1/P2 finding 时不得确认。
- 步骤完成时写 walkthrough，并包含 Lessons 反思。
- Coordinator pass 在任务关闭时更新 Closeout SSoT 和 Lessons 检查。
- Coordinator pass 在行为、测试、架构或流程改变时更新 Regression SSoT 和 Harness Ledger。
- 验证未通过前不得声明完成；无法解决的残余必须记录 owner 和原因。

暂停条件：
- 必需工作超出模块写入范围，且尚未选择 owner。
- 用户数据或私密数据需要被提交。
- 回归检查失败，且根因在本模块之外。
- 任务需要 module plan 中没有写明的产品范围变更。
```
