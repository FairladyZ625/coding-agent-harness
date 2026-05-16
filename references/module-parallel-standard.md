# 模块并行开发标准

## 核心思路

当项目有多个可独立演进的功能域时，用模块（Module）替代全局 Phase 作为工作单元。每个模块有自己的步骤序列、worktree、会话，互不干扰。Phase 降级为"发布事件"——从各模块已完成步骤中挑选打包。

## 何时启用

同时满足以下条件时启用模块并行：

- Operating Model 为 `solo-orchestrator` 或 `team-feature-lead`
- 项目有 2+ 个功能域可独立演进
- 各功能域的源文件几乎不重叠
- 开发者计划多会话 / 多 worktree 并行推进

不满足时继续使用 Feature SSoT + 线性 Phase 模型。

## 核心概念

| 概念 | 定义 | 生命周期 |
|------|------|----------|
| 模块（Module） | 长期存在的功能域 | 从注册到归档 |
| 步骤（Step） | 模块内一个可合并工作单元（≈ 一个 PR） | planned → in-progress → done |
| 发布（Release） | 从各模块已完成步骤中挑选打包的事件 | git tag |

## 模块注册表（Module Registry）

安装位置：`docs/09-PLANNING/Module-Registry.md`

使用模板：`templates/ssot/Module-Registry.md`

职责：
- 记录所有活跃模块的 key、PREFIX、scope、当前步骤、分支、状态
- 是新会话冷启动时的第一个读取文件（在 AGENTS.md 之后）
- 声明每个模块的 write scope，用于冲突检测

### Status 定义

- `planned` — 步骤已规划，尚未开始
- `in-progress` — 有活跃会话在开发
- `paused` — 暂停，无活跃会话
- `completed` — 所有步骤完成，待归档

## 模块计划（Module Plan）

安装位置：`docs/09-PLANNING/MODULES/<key>/module_plan.md`

使用模板：`templates/planning/module_plan.md`

职责：
- 记录该模块的步骤序列、当前进度、完成标准
- 每个步骤对应一个 task_plan（在模块的 TASKS/ 子目录下）

## 模块会话启动 Prompt（Module Session Prompt）

安装位置由项目选择，推荐二选一：

- 单文件 Prompt Pack：`docs/09-PLANNING/MODULES/Session-Prompt-Pack.md`
- 每模块 Prompt：`docs/09-PLANNING/MODULES/<key>/session_prompt.md`

使用模板：`templates/planning/module_session_prompt.md`

职责：

- 给用户提供可直接粘贴到新会话的模块启动文本
- 明确模块目标、读取顺序、branch/worktree、write scope、共享/禁止修改范围、验证命令、收口动作和 stop conditions
- 让多个模块会话能独立冷启动，而不是依赖上一轮聊天上下文

硬规则：

- 每个 Active Module 必须能在 Prompt Pack 或自己的 `session_prompt.md` 中找到对应启动 prompt。
- Prompt 必须写清楚 allowed scope 和 forbidden/shared scope。
- Prompt 必须写清楚至少一个项目级 check 和该模块的 targeted checks。
- Prompt 必须包含 start gate：校验 registry 当前步骤、branch/worktree、dirty state、共享锁和过期 prompt。
- Prompt 必须要求开始改代码前创建或更新模块 task_plan，并记录 scope、acceptance、verification、worktree 和 shared coordination。
- Prompt 必须包含 closeout：review.md 或 skipped-with-reason、walkthrough Lessons Reflection、Closeout SSoT、Lessons Check、Regression SSoT / Harness Ledger 条件更新。
- Prompt 中不得要求 agent 修改其他模块代码；需要跨模块文件时，必须先进入 `_shared` task 或指定单一 owner。

## 模块目录结构

```
docs/09-PLANNING/MODULES/<key>/
├── module_plan.md          ← 模块总览和步骤序列
├── session_prompt.md       ← 可选：该模块专用启动 prompt
└── TASKS/                  ← 该模块的所有 task
    ├── <PREFIX>-NN-<name>/
    │   ├── task_plan.md
    │   ├── progress.md
    │   ├── findings.md
    │   └── review.md (如需要)
    └── ...

docs/10-WALKTHROUGH/
├── <module-key>/
│   ├── <PREFIX>-NN-walkthrough.md
│   └── ...
└── _shared/               ← 跨模块基础设施 task 的 walkthrough

docs/09-PLANNING/MODULES/_shared/TASKS/
└── YYYY-MM-DD-<name>/     ← 跨模块/基础设施 task
    └── ...
```

## 步骤 ID 规则

- 格式：`<PREFIX>-NN`（如 `RDR-01`、`GRF-02`、`MOT-01`）
- PREFIX 在注册表中唯一分配，不可重复
- 步骤 ID 只在模块内有序，跨模块无顺序关系
- NN 从 01 开始递增，不跳号

## 会话冷启动协议

新会话的读取顺序：

1. `AGENTS.md` — 获取项目总览和模块并行指引
2. `docs/09-PLANNING/Module-Registry.md` — 了解全局模块状态
3. `docs/09-PLANNING/MODULES/Session-Prompt-Pack.md` 或目标模块的 `session_prompt.md` — 获取会话启动合同
4. 目标模块的 `docs/09-PLANNING/MODULES/<key>/module_plan.md` — 了解模块进度
5. 当前步骤的 `task_plan.md` — 了解具体任务

会话开始时，用户告知目标模块（如"做 Reader"），agent 据此定位。

会话结束时必须更新：
- module_plan.md 的步骤状态和"当前状态"段落
- 模块 TASKS 下的 progress / findings / review / walkthrough 相关引用
- Module Registry 的状态行（Status、Current Step、Updated）只有在持有 registry shared lock 或 coordinator pass 中更新

### AGENTS.md 必须包含的段落

```markdown
## 模块并行开发

本项目启用了模块并行开发。开始任何模块工作前：

1. 读 docs/09-PLANNING/Module-Registry.md 了解全局状态
2. 读 docs/09-PLANNING/MODULES/Session-Prompt-Pack.md 或目标模块的 session_prompt.md
3. 读目标模块的 docs/09-PLANNING/MODULES/<key>/module_plan.md
4. 在模块对应的 worktree 上工作
5. 不跨模块修改文件（不修改 write scope 之外的代码）
6. 如果作为 worker subagent 改代码/测试/文档，必须在 coordinator 分配的独立 worktree / branch 中工作，提交自己的 commit，并 handoff commit SHA / checks / residual risks
7. 会话结束时更新 module_plan.md；Module Registry 是 shared lock，只能在持锁或 coordinator pass 中更新
```

如果主 agent 作为 coordinator 启动多个模块 worker，禁止让它们共享 coordinator 当前 checkout。
每个 worker 必须有自己的模块 worktree 或任务 worktree；coordinator 只集成 worker commits。

## 发布打包

对 solo-orchestrator：

- 发布 = git tag + merge 到 main 的一批模块步骤
- 在 git tag message 中列出包含的步骤 ID
- 示例：`git tag -a v0.3.0 -m "Release 3: RDR-01, RDR-02, GRF-01, MOT-01"`
- 如需更正式的发布管理，可选创建 `docs/09-PLANNING/releases/` 目录

## 共享文件冲突规则

### Write Scope 声明

每个模块必须在 Module Registry 中声明 write scope（可修改的目录/文件范围）。

### 硬规则

如果两个模块的 write scope 有交集，必须在开发前解决。解决方式三选一：

1. **串行**：有交集的步骤不同时开发，一个完成后另一个再开始
2. **指定 owner**：将共享文件的修改权归属一个模块，另一个模块不碰
3. **提取**：将共享文件提取为独立的 `_shared` 模块或基础设施 task

### 共享基础设施

shell、data layer、design system 等共享基础设施的修改：
- 不属于任何模块
- 走独立的"基础设施 task"（见下文）
- 修改期间，其他模块暂停对该区域的修改

最小协调产物：

- `_shared` task：`docs/09-PLANNING/MODULES/_shared/TASKS/<id>/task_plan.md`
- 或模块 task_plan 中的 `Shared Coordination` 段落，必须写明 owner、touched files、allowed change、reviewer、merge order。

Module Registry 本身也是 shared lock。活跃模块会话默认更新自己的 module_plan 和 TASKS；Registry 的 Current Step / Status 只在持锁或 coordinator pass 中更新，避免多个会话同时改同一个表。

## 跨模块重构

当需要修改多个模块共享的代码（如改 shared type、重命名 utility）时：

1. 不走模块 worktree
2. 在主干上开普通 task worktree（命名：`refactor/<name>`）
3. 完成后 merge 回主干
4. 各模块 worktree rebase 到最新主干
5. 可选：在 Module Registry 标注 `infra-task-pending: true`，提醒各模块会话 rebase

基础设施 task 的文件放在 `docs/09-PLANNING/MODULES/_shared/TASKS/` 下。

## 模块级 Worktree

每个模块对应一个长期 worktree：

- 命名：`codex/<module-key>`（如 `codex/reader`、`codex/graph`）
- 生命周期：模块活跃期间持续存在，不在每个步骤后删除
- 步骤在模块 worktree 内顺序执行，每个步骤完成后提交并推送

### Merge 策略

项目级决定，二选一：

- **频繁合并**：每个步骤完成后 merge 回 main。divergence 小，冲突少。适合 solo-orchestrator（main 上有半成品不影响他人）。
- **批量合并**：所有步骤完成后一次性 merge。main 始终是完整功能。适合有 CI/CD 发布流水线绑定 main 的项目。

### 定期 Rebase

无论哪种策略，模块 worktree 应定期 rebase 到最新 main：
- 建议频率：每周一次，或每次基础设施 task 完成后
- 目的：避免 divergence 过大导致 merge 困难

## 与 Feature SSoT 的分工

启用模块并行后：

- **Module Registry + module_plan.md** 追踪模块内步骤进度
- **Feature SSoT** 只追踪：
  - 不属于任何模块的独立功能
  - 发布级汇总（哪个 release 包含了哪些模块步骤）

**禁止**：同一个工作项同时出现在 module_plan 和 Feature SSoT 中。

切换时必须收缩 Feature SSoT：

- Feature SSoT Active 表只保留非模块、未完成、仍需操作的 feature。
- Phase 历史和 completed 明细移到 `docs/09-PLANNING/_archive/<feature-ssot-name>-phase-<range>.md`。
- Feature SSoT 主文件保留 freeze notice、当前 active 指针、completed summary、archive index。
- 不允许把历史大表留在 Feature SSoT 主文件底部作为"文件内归档"；这会让 Active SSoT 继续膨胀。

## 归档与过期检测

### 归档

- 模块所有步骤完成后，状态改为 `completed`
- 将模块目录移入 `docs/09-PLANNING/MODULES/_archive/<key>/`
- 对应的 walkthrough 保留在 `docs/10-WALKTHROUGH/<key>/`（不归档）

### 过期检测

- 如果模块 Updated 字段超过 30 天未更新：checker 发出 warning
- 超过 60 天未更新：建议标记为 `paused`
- `paused` 模块可随时恢复为 `in-progress`

## 从线性 Phase 迁移

对已有线性 Phase 历史的项目：

1. 冻结 Feature SSoT 当前状态，标注"后续工作按模块推进"
2. 将 Feature SSoT 的历史 completed 明细移入 `docs/09-PLANNING/_archive/`，主文件只保留 active 指针、summary 和 archive index
3. 将历史 `docs/09-PLANNING/TASKS/` 移入 `docs/09-PLANNING/_archive/`
4. 将历史 walkthrough 移入 `docs/10-WALKTHROUGH/_archive/`
5. 从最后一个 Phase 的未完成项中识别模块
6. 创建 Module Registry 和各模块的 module_plan.md
7. 创建 Module Session Prompt Pack 或每模块 `session_prompt.md`
8. 定义切换日期，此后不再创建新 Phase

不做的事：
- 不回溯重写历史 Ledger 条目
- 不删除现有 Feature SSoT
- 不强制已完成的 Phase 工作重新归类
