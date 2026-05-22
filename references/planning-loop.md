# Planning Loop

## 核心思路

每个非平凡任务必须有独立的任务目录和稳定的任务文件。这是 agent 在长时间执行过程中不偏离目标的锚点。

## 任务目录结构

任务信息架构预算决定默认脚手架：

| Budget | 适用场景 | 默认文件 |
| --- | --- | --- |
| `simple` | 单 owner、无 subagent、L0/L1 证据、可跳过正式 review gate | `brief.md`, `task_plan.md`, `visual_map.md`, `progress.md` |
| `standard` | 常规功能、修复、文档任务，需要完整可追溯记录 | 完整任务文件 |
| `complex` | L2/L3 证据、subagent/reviewer、外部参考、生成产物或 optional indexes | 完整任务文件 + 按需 optional structure |

`trivial` 不进入 CLI：小到不值得建立任务目录的修改，可以直接执行并在 commit 或交付说明中写清楚原因。

```
docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/
├── task_plan.md    ← 计划：目标、范围、步骤、验收标准
├── execution_strategy.md ← 执行策略：模式、subagent、冲突控制、验证深度、handoff
├── visual_map.md ← 图表集合：阶段图、架构图、时序图、数据流、状态机、完成度、证据状态
├── findings.md     ← 发现：执行过程中的研究发现和技术决策
├── progress.md     ← 进度：每个阶段的状态更新和验证结果
├── review.md       ← 对抗性审查报告（需要 reviewer / subagent / release review 时必填）
└── long-running-task-contract.md ← 长程任务合同（仅长程任务需要）
```

复杂任务可以启用 optional structure，但不能默认创建空目录：

```
references/INDEX.md        ← 任务本地参考、外部链接、reviewer packet
artifacts/INDEX.md         ← 命令输出、截图、fixture、review transcript
slices/<slice-id>/brief.md ← 多切片任务的单切片输入和范围
slices/<slice-id>/evidence.md
slices/<slice-id>/review.md
```

启用条件：

- reviewer/subagent 输入包需要复用：启用 `references/INDEX.md`
- 命令输出、截图、fixture、review transcript 会污染主文件：启用 `artifacts/INDEX.md`
- 超过 5 个 slice、多 worker、release gate、L2+ evidence：启用 `slices/`

## 执行规则

1. **每个阶段前读 task_plan.md** — agent 重新对齐目标
2. **每个阶段后更新 progress.md** — 记录做了什么、验证了什么
3. **研究发现写入 findings.md** — 不丢失中间产物
4. **禁止在项目根目录放过程文件** — task_plan.md、findings.md、progress.md 只能在任务目录内
5. **对抗性审查必须写 review.md** — 如果任务使用 reviewer / subagent / release review，按 `adversarial-review-standard.md` 写报告
6. **长程任务必须补合同** — 如果任务需要连续执行、多轮审查或子代理 review，先补 `long-running-task-contract.md`
7. **任务收口必须回写 Harness Ledger** — 只在任务完成或上下文回写状态变化时记录，不记录每次 `progress.md` 更新
8. **复杂任务必须记录 `execution_strategy.md`** — 是否使用 subagent、reviewer、worktree、handoff 都写入独立文件。
9. **非平凡任务必须记录 `visual_map.md`** — 这是任务图表集合，不只是 roadmap；HTML dashboard 从独立文件的 phase table 计算完成度、阻塞和证据状态。
10. **路径必须带来源前缀** — 使用 `PUBLIC:`, `PRIVATE:`, `TARGET:`, `EXTERNAL:`, `URL:`，避免脆弱相对路径。
11. **已验证切片必须主动提交** — 每个有意义的工作切片通过对应检查后，agent 默认主动 commit；只有用户明确要求暂不提交、检查失败、或 dirty diff 归属未清时才延期，并把原因写入 progress / handoff。

## task_plan.md 模板

```markdown
# [任务名称]

## 目标
[一句话说清楚这个任务要达成什么]

## 范围
[做什么、不做什么]

## Task IA Budget
[simple / complex；如果 complex，列出启用哪些 optional structure 和原因]

## Context Packet
| ID | Type | Path | Why It Matters | Used By |
| --- | --- | --- | --- | --- |

## Execution & Visualization Files
| Contract File | Required | Purpose |
| --- | --- | --- |
| `execution_strategy.md` | yes | Execution mode, subagent use, conflict control, evidence depth, handoff rules |
| `visual_map.md` | yes | Mermaid maps, phase table, architecture/sequence/data-flow/state diagrams when useful, completion, evidence status, blocking risk |

## 步骤
1. [步骤1]
2. [步骤2]
...

## 验收标准
- [ ] [标准1]
- [ ] [标准2]

## Worktree
- 路径：[worktree 路径]
- 分支：[分支名]
- Worker owner：[coordinator / subagent id / 不适用]
- Worker handoff commit required：[yes / no / 不适用]
- Coordinator integration branch：[分支名 / 不适用]
- 若未开 worktree，原因：[说明]

## 长程任务判定
- 是否属于长程任务：[是 / 否]
- 若是，合同文件：`long-running-task-contract.md`
- Stop Condition 摘要：[什么时候可以停]

## Review 判定
- 是否需要对抗性 review：[是 / 否]
- 若是，报告文件：`review.md`
- Reviewer：[self / subagent / external / human]
```

## 模块并行开发时的任务目录

当项目启用模块并行开发（见 `references/module-parallel-standard.md`）时：

- 任务目录位于模块内：`docs/09-PLANNING/MODULES/<key>/TASKS/<PREFIX>-NN-<name>/`
- 跨模块基础设施任务位于：`docs/09-PLANNING/MODULES/_shared/TASKS/YYYY-MM-DD-<name>/`
- task_plan.md 应填写"模块关联"段（Module、Step、Module Plan link）
- 会话结束时除了更新 progress.md，还需更新 module_plan.md。
- 模块 worker 不直接写 Module Registry / Harness Ledger / Closeout SSoT。需要总表同步时，在 task_plan.md 或 progress.md 的 `Coordinator Handoff` 段标记 `pending-coordinator-pass`，由 coordinator 串行同步。
- coordinator pass 完成后，才更新 Module Registry、Harness Ledger、必要的 Closeout / Regression 表，并把 handoff 标记为 `synced`。

## 为什么这套东西有效

- agent 的上下文窗口有限，task_plan 是它在长任务中唯一稳定的锚点
- progress.md 让下一轮 agent（或同一个 agent 的下一个 session）能快速接上
- findings.md 避免重复研究同一个问题
- 强制目录结构让所有任务可追溯、可检索

## 与 Anthropic Long-running Agents 方案的对照

Anthropic 的方案用 Feature List JSON + progress file + git commit 做跨 session 交接。
task_plan + findings + progress 是同一思路的更细粒度表达；`review.md` 负责保存
对抗性审查结论，避免 review 只留在对话里。

## findings.md 模板

```markdown
# [任务名称] - Findings

## 研究发现

### [发现主题 1]
- 背景：[为什么要研究这个]
- 发现：[具体发现了什么]
- 影响：[对任务计划有什么影响]

### [发现主题 2]
...

## 技术决策

| 决策 | 选择 | 原因 | 替代方案 |
|------|------|------|----------|
| [决策1] | [选了什么] | [为什么] | [没选什么] |
```

## progress.md 模板

```markdown
# [任务名称] - Progress

## 状态：[未开始 / 进行中 / 已完成 / 已阻塞]

## 进度记录

Evidence values use `type:path:summary`.

### [YYYY-MM-DD HH:MM] - [阶段名称]
- 做了什么：[具体操作]
- 验证结果：[跑了什么测试，结果如何]
- 下一步：[接下来做什么]
- Evidence：[type:path:summary]

### [YYYY-MM-DD HH:MM] - [阶段名称]
...

## Residual
- [遗留问题1]
- [遗留问题2]
```

## 任务目录命名规范

格式：`YYYY-MM-DD-任务名称`

示例：
- `2026-03-15-user-auth-refactor`
- `2026-03-18-ui-timeline-component`
- `2026-04-01-regression-gate-webhook-live`

## 状态流转

```
simple:
未开始 → 进行中 → 已完成
              ↓
          已阻塞 → 进行中

standard / complex:
未开始 → 进行中 → 审查中 → 已完成
              ↓
          已阻塞 → 进行中
```

`task-review` 是 standard / complex 任务进入执行审查的唯一 CLI 路径。`task-complete`
对 standard / complex 是硬门禁：当前状态不是 `review` 时必须拒绝。`simple`
可以直接从 `in_progress` 完成。

每次状态变更时，必须同时更新 progress.md 和 Feature SSoT。

任务完成时，必须在 `docs/Harness-Ledger.md` 中记录本轮 task plan、SSoT、
walkthrough、Lessons 检查等上下文回写结果。

## Commit Convention

非平凡任务不是等用户提醒才提交。每个已验证、有意义、范围清晰的切片都应形成 commit。
提交前只 stage 本任务范围内文件；无关 dirty 文件、私有文件和生成产物必须保留原样或按项目规则处理。

任务相关 commit 应在 message footer 中引用任务 ID：

```text
feat: implement task review gate

Harness: TASKS/2026-05-21-task-review-gate
```

格式：`Harness: <task-id>`，其中 task-id 是 `task-list --json` 输出的 `id` 字段。
不建目录的小修改可以使用 `Harness: trivial` 或省略 footer。1.0 只定义约定，不强制
扫描 git 历史；后续可通过 reconcile 命令补工具化检查。
