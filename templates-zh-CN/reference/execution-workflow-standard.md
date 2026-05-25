# 执行工作流标准

## 职责

本标准规定非平凡任务从开始、执行到收口的固定路径。它把 task plan、Delivery SSoT、worktree、review、testing、Regression SSoT、walkthrough 和 Harness Ledger 串成一条可检查的交付链。

## 开始任务前

1. 读取 AGENTS.md 和与本任务相关的 reference 标准。
2. 读取功能 SSoT 或 Delivery SSoT，确认任务状态、owner 和依赖。
3. 读取 `task_plan.md`，确认目标、范围、证据、stop condition 和允许修改的路径。
4. 读取 `delivery-operating-model-standard.md`，判断本轮是 solo、team、split-repo、program、waterfall 还是 kanban 交付形态。
5. 多人、多 agent、多仓、共享文件或阶段交付任务必须更新 `docs/09-PLANNING/Delivery-SSoT.md`。
6. 判断是否属于长程任务；如属于，按 `long-running-task-standard.md` 补齐合同。
7. 判断是否需要对抗性审查；如需要，按 `adversarial-review-standard.md` 创建或更新 `review.md`。
8. planned task 默认需要 closeout review；先读取 `review-routing-standard.md`。
9. 触及 PR、branch protection、required checks、CI/CD 或 release 时，读取 `repo-governance-standard.md` 和 `ci-cd-standard.md`。
10. 按运行模型确认是否需要 worktree、feature branch、contract branch 或 release branch。
11. 如需调用可写 subagent worker，先分配独立 worktree / branch、任务目录、write scope 和必跑 checks。

## 执行过程中

1. 每完成一个阶段，更新 `progress.md`。
2. 调查事实、约束和异常写入 `findings.md`，不要只留在聊天记录。
3. 长程任务每轮执行 evidence loop 和 review loop。
4. reviewer 或 subagent 审查结果写入任务目录的 `review.md`。
5. 可写 worker 必须在自己的 worktree 内实现、验证、提交，并 handoff branch、commit SHA、checks、residual。
6. 遇到共享文件冲突，由 coordinator 或人工决定串行顺序。
7. 遇到目标失效、权限阻塞、高风险决策或 stop condition 不适用，立即暂停并记录。
8. 主动提交已验证的、有意义的中间成果；commit message 应说明变更类型和范围。除非用户明确要求暂不提交、检查失败、dirty 归属不清，或安全边界阻止干净提交，否则不要把已完成切片长期留在未提交状态；延期提交必须写明 no-commit reason、owner 和下一步。
9. 机械化 Harness 写入优先使用 CLI lifecycle 命令。CLI-owned 写入会加锁、限制 allowlist 并自动提交，也会拒绝 dirty Git 状态；agent-owned 手工编辑仍需要明确任务提交或延期提交理由。
10. 把 `visual_map.md` 当作生命周期阶段地图。`init` 阶段准备工作，`execution` 阶段定义实现完成度，`gate` 阶段定义审查、人工确认、lesson routing 和 closeout。只有当前操作者匹配阶段 `Actor` 时，才执行该阶段 `Exit Command`；Agent 不得执行 `human` gate。
11. 新任务目录的 `brief.md` 末尾必须保留短机器可读 Scaffold Provenance 表格。正常路径是 `Created By: harness new-task`；手工创建只能作为 `manual-exception`，并写清具体原因；历史迁移使用 `historical-backfill`。

## 完成任务后

1. 按 `testing-standard.md` 和 Regression SSoT 运行对应检查。
2. 确认 repo governance、CI/CD required checks 已执行、更新或 residualized。
3. 更新功能 SSoT；多人、多仓、多模块任务同时更新 Delivery SSoT 或 Module Registry。
4. 更新 Regression SSoT 和 Cadence Ledger（如适用）。
5. 确认 `review.md` 没有 open P0/P1 finding；material P2 已修复或写为 `accepted-risk` 并路由。
6. planned task 必须完成 closeout review，或写明 `skipped-with-reason`。
7. 写 walkthrough，引用 task plan、review、证据、residual、Regression SSoT 和 commit。
8. 确认当前 `visual_map.md` lifecycle gate 已执行，或已记录 blocker。
9. 执行 Lessons 检查：新任务默认先写 `lesson_candidates.md` 并交给人工审查；人工标记后可记录 `queued-promotion`，再由维护命令写 promoted lesson 详情文档。没有可复用候选时记录 `no-candidate-accepted`；旧任务兼容可记录 `checked-none: <reason>`。
10. 最后更新 Harness Ledger，因为它记录本轮上下文维护的最终状态。
11. 完成 commit / PR / release note，并确认本任务工作区没有未解释的遗留改动。
12. 如使用 worker，coordinator 集成 worker commit 后运行最终 gates，并记录 integration evidence。
13. 如使用 worktree，按 `worktree-standard.md` 清理或记录保留原因。

## 提交规范

推荐格式：

```text
<type>(<scope>): <description>
```

常用类型：

- `feat`：新功能。
- `fix`：缺陷修复。
- `refactor`：重构。
- `test`：测试相关。
- `docs`：文档。
- `chore`：构建、工具、配置或维护。

## PR 与合并规范

PR 描述必须包含：

- 改了什么，为什么改。
- 关联 task plan、SSoT、review 或 issue。
- 实际运行的检查和证据。
- residual、owner 和不阻塞理由。
- required checks、reviewer、merge method 是否满足 `repo-governance-standard.md`。

## 主动提交规则

- 每个已验证的、有意义的切片默认都要提交。
- 提交前只 stage 本任务范围内文件，不能顺手带入无关 dirty 文件、私有文件或生成产物。
- 如果用户明确说不要提交、检查失败、或 dirty 归属还没厘清，必须把 no-commit reason、owner 和下一步写入 `progress.md` 或交接说明。
- closeout 时必须列出相关 commit SHA；如果没有 commit，必须说明为什么这是安全的例外。

## 禁止事项

- 非平凡任务跳过 task plan 直接实现。
- 把 task plan、progress、review 等过程文件放在项目根目录。
- 需要对抗性审查时只在聊天里讨论，不写 `review.md`。
- 让多个可写 worker 在 coordinator 当前 checkout 混合未提交改动。
- 把 `designed` 或 `implemented` 的 CI/CD、branch protection 说成 `verified`。
- merge 后不跑回归、不写 walkthrough、不更新 Harness Ledger。
