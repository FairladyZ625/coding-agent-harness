# Worktree 并行开发

## 核心思路

所有非平凡代码任务，默认先开独立的 git worktree，再开始写代码。这样多个 agent 可以在各自的分支上独立工作，互不干扰。

但 worktree 只是 `solo-orchestrator` 或单仓并行的一种实现。若项目是多人团队、
前后端分仓、program 多仓或瀑布 stage-gate，必须先读
`docs/11-REFERENCE/delivery-operating-model-standard.md`，再决定使用 worktree、
feature branch、contract branch、release branch 或跨仓 paired PR。

## 什么时候必须开 worktree

- 跨多个子项目或多文件的实现/重构
- 会持续多轮迭代的任务
- regression / smoke / harness 语义改动
- 当前主工作区已经有未提交改动，且本轮任务不是在这些改动上继续

## 什么时候可以不开

- 纯只读分析
- 纯文档小修
- 用户明确要求直接在当前工作区修改
- 当前任务就是接着本工作区已存在的同一批改动继续收尾

## 为什么并行开发不会乱

1. **分支隔离** — 每个 worktree 有自己的分支，代码改动互不影响
2. **Planning 隔离** — 每个 worktree 对应的 agent 只看自己的 task_plan，不会被别的任务上下文污染
3. **Merge 时自动回归** — Cadence Ledger 定义了改什么就跑什么回归面
4. **Worktree 清理** — merge 完成后必须删除，不允许长期堆积

## Worktree 命名规范

格式：`<前缀>-<任务名称>`

前缀规则：
- `feat/` — 新功能
- `fix/` — Bug 修复
- `refactor/` — 重构
- `test/` — 测试相关
- `docs/` — 文档相关

示例：
- `feat/user-auth-oauth2`
- `fix/timeline-render-delay`
- `refactor/external-adapter-decouple`

## 分支命名规范

分支名与 worktree 名保持一致，使用同样的前缀和任务名。

## 操作流程

### 创建 Worktree

```bash
# 1. 确保主干是干净的
git status  # 应该是 clean

# 2. 创建 worktree
git worktree add .worktrees/<worktree-name> -b <branch-name>

# 3. 进入 worktree
cd .worktrees/<worktree-name>

# 4. 安装依赖（如需要）
npm install  # 或 pnpm install / yarn install
```

### Merge 回主干

```bash
# 1. 在 worktree 中确保所有改动已提交
git status  # 应该是 clean

# 2. 回到主工作区
cd /path/to/main/repo

# 3. Merge
git merge <branch-name>

# 4. 解决冲突（如有）
# ...

# 5. 跑回归测试（按 Cadence Ledger 规则）
```

### 清理 Worktree

```bash
# 1. 删除 worktree
git worktree remove .worktrees/<worktree-name>

# 2. 删除分支（如已 merge）
git branch -d <branch-name>

# 3. 确认清理完成
git worktree list  # 不应该再看到该 worktree
```

## 多 Agent 并行分工协议

当多个 agent 同时在不同 worktree 上工作时：

1. **任务分配必须明确** — 每个 agent 只负责自己的 worktree，不跨 worktree 操作
2. **共享文件的修改需要协调** — 如果两个 agent 都需要改同一个文件，必须串行执行
3. **Merge 顺序由人决定** — agent 不应自行决定 merge 顺序
4. **冲突解决需要人工确认** — agent 可以尝试自动解决简单冲突，但复杂冲突必须报告给人

## Subagent Worker Handoff / Coordinator Integration

当主 agent 作为 coordinator 调用 subagent 时，必须先区分角色：

- **reviewer**：只读审查，输出 `review.md` / findings / report，不改业务代码。
- **worker**：会改代码、测试、产品文档或 harness 文档，必须使用独立 worktree / branch。

Worker handoff 的最低字段：

- worktree path
- branch
- task directory
- write scope
- commit SHA
- checks run and result
- residual risks / shared-file conflicts

Coordinator 集成规则：

1. coordinator 先分配 worker 的 worktree、branch、任务目录和 write scope。
2. worker 只在自己的 worktree 内编辑并提交；不得把改动直接写进 coordinator 当前 checkout。
3. coordinator 通过 worker commit / branch 集成结果，解决冲突并运行最终 gates。
4. 若工具限制、用户要求或紧急情况导致未使用独立 worktree，必须在 progress、walkthrough
   或 Harness Ledger 记录 deviation reason、风险和补偿验证。

## 并发上限

项目必须在 `docs/11-REFERENCE/repo-governance-standard.md` 的 Worktree Concurrency
中定义 max active worktrees、merge ordering rule 和 cleanup owner。

未定义并发上限时，不应启动多 agent 并行开发。

## 保留旧 Worktree 的唯一合理理由

- 当前还有运行中的服务依赖该路径
- 仍在做未完成的验证或回滚比对
- 用户明确要求保留

若选择暂时保留，必须在 progress.md 里写明保留原因。

## 模块级 Worktree

当项目启用模块并行开发（见 `references/module-parallel-standard.md`）时，每个模块对应一个长期 worktree。这与上文的"任务级 worktree"（每个 task 一个，merge 后删除）共存不冲突。

### 命名

`codex/<module-key>`（如 `codex/reader`、`codex/graph`）

### 生命周期

- 模块注册时创建，模块完成时删除
- 步骤在模块 worktree 内顺序执行，每个步骤完成后提交并推送
- 不在每个步骤后删除 worktree

### Merge 策略（项目级决定）

- **频繁合并**：每个步骤完成后 merge 回 main。divergence 小，冲突少。推荐 solo-orchestrator 使用。
- **批量合并**：所有步骤完成后一次性 merge。main 始终是完整功能。适合有 CI/CD 发布流水线绑定 main 的项目。

### 定期 Rebase

无论哪种策略，模块 worktree 应定期 rebase 到最新 main：

- 频率：每周一次，或每次基础设施 task 完成后
- 目的：避免 divergence 过大导致 merge 困难

### 与任务级 Worktree 的区别

| 维度 | 任务级 Worktree | 模块级 Worktree |
|------|----------------|----------------|
| 命名 | `feat/<task-name>` | `codex/<module-key>` |
| 生命周期 | 一个 task，merge 后删除 | 模块活跃期间持续存在 |
| 适用场景 | 独立短期任务 | 长期演进的功能域 |
| 清理时机 | task 完成后立即清理 | 模块所有步骤完成后清理 |
