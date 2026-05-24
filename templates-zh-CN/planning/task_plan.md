# [任务名称]

Task Contract: harness-task/v1

## 目标

[用一句话说明本任务完成后应达到的状态。]

## 范围

- 做什么：[本轮允许修改或交付的内容]
- 不做什么：[明确排除的内容，避免执行中扩大范围]
- 主要风险：[当前已知的技术、产品、协作或验证风险]

## 任务信息架构预算

| 预算 | 适用场景 | 必需结构 |
| --- | --- | --- |
| simple | 单 owner、无 subagent、证据深度为 L0/L1、不需要正式 review gate | `brief.md`、`task_plan.md`、`visual_map.md`、`progress.md` |
| standard | 常规功能、修复或文档改动 | `brief.md`、`task_plan.md`、`execution_strategy.md`、`visual_map.md`、`findings.md`、`lesson_candidates.md`、`progress.md`、`review.md` |
| complex | 需要 L2/L3 证据、subagent/reviewer、外部参考、生成产物，或超过 5 个切片 | standard 文件，并额外创建 `references/INDEX.md` 与 `artifacts/INDEX.md` |

选择预算：{{TASK_BUDGET}}

可选子目录按触发条件创建，不作为默认脚手架：

- `lessons/LC-*.md`：进入 `needs-promotion` 的 lesson candidate 的任务本地详情文件。
- `references/INDEX.md`：任务本地资料、外部链接、reviewer 输入包、跨仓上下文。
- `artifacts/INDEX.md`：命令输出、截图、fixture、生成报告、审查记录等证据。
- `slices/<slice-id>/`：多切片任务。每个切片使用 `brief.md`、`evidence.md`、`review.md`。

没有真实触发条件时，不创建可选目录；已创建则必须有 index 和明确用途。

## 上下文包（Context Packet）

| ID | 类型 | 路径 | 为什么需要 | 使用者 |
| --- | --- | --- | --- | --- |
| C-001 | public-doc / private-plan / external / code | PUBLIC:path 或 PRIVATE:path 或 TARGET:path 或 EXTERNAL:path 或 URL:https://example.com | [说明这份上下文如何影响任务] | coordinator / reviewer / worker |

路径前缀约定：

- `PUBLIC:`：公开源仓库中的文件。
- `PRIVATE:`：私有 harness 仓库中的文件。
- `TARGET:`：已安装目标项目中的文件。
- `EXTERNAL:` 或 `URL:`：外部资料。

## 执行与可视化文件

不要手工复制本模板来创建任务目录。必须使用 `harness new-task`，让所选预算自动
创建正确文件集，并让 `harness check` 能按同一契约校验。

`execution_strategy.md` 和 `visual_map.md` 是本任务的同级合同文件，不嵌入 `task_plan.md`。这样 dashboard 和 checker 可以稳定读取。

| 预算 | 必需文件 |
| --- | --- |
| simple | `brief.md`、`task_plan.md`、`visual_map.md`、`progress.md` |
| standard | simple 文件，加 `execution_strategy.md`、`findings.md`、`lesson_candidates.md`、`review.md` |
| complex | standard 文件，加 `references/INDEX.md`、`artifacts/INDEX.md` |
| long-running 附加项 | 选择 `--long-running` 时额外创建 `long-running-task-contract.md` |

文件职责：

| 合同文件 | 用途 |
| --- | --- |
| `brief.md` | 面向人和下一轮 agent 的任务摘要与上下文包 |
| `task_plan.md` | 目标、范围、预算、验收与执行决策 |
| `execution_strategy.md` | 执行模式、subagent 使用、冲突控制、证据深度、交接规则 |
| `visual_map.md` | 图表集合：阶段图、可选架构/时序/数据流/状态图、完成度、证据状态、阻塞风险 |
| `progress.md` | 执行日志、决策和交接 |
| `findings.md` | 发现、研究记录和未解决风险 |
| `lesson_candidates.md` | 任务本地教训候选队列。人工审查确认前必须接受无候选、拒绝候选，或排队 promotion |
| `lessons/LC-*.md` | 可选的任务本地 lesson 详情文件，趁源任务上下文还新鲜写出，并由 `Detail Artifact` 链接 |
| `review.md` | Agent Review Submission、对抗性审查、release review、外部 reviewer 结论 |
| `references/INDEX.md` | complex 任务的资料包和参考索引 |
| `artifacts/INDEX.md` | complex 任务的生成证据和产物索引 |
| `long-running-task-contract.md` | 连续执行权限、循环规则和停止条件 |

旧任务可以保留历史嵌入式段落作为 fallback；新任务必须使用独立文件。

## 产物索引（Artifact Index）

简单任务可在这里登记关键证据。产物较多时，创建 `artifacts/INDEX.md` 并在此引用 ID。

| Artifact ID | 类型 | 路径 | 摘要 |
| --- | --- | --- | --- |
| A-001 | command / diff / fixture / screenshot / review / report | PUBLIC:path 或 PRIVATE:path 或 TARGET:path 或 EXTERNAL:path 或 URL:https://example.com | [这份证据证明了什么] |

## 步骤

1. [步骤 1]
2. [步骤 2]
3. [步骤 3]

## 验收标准

- [ ] [标准 1]
- [ ] [标准 2]
- [ ] [标准 3]

## 工作树（Worktree）

- 路径：[worktree 路径，例如 `.worktrees/feat/xxx`]
- 分支：[分支名]
- Worker owner：[coordinator / subagent id / 不适用]
- Worker handoff commit required：[yes / no / 不适用]
- Coordinator integration branch：[分支名 / 不适用]
- 未使用 worktree 的原因：[说明]

## 长程任务判定

- 是否属于长程任务：[是 / 否]
- 若是，合同文件：`long-running-task-contract.md`
- 连续执行权限：[已授权 / 未授权 / 不适用]
- Stop Condition 摘要：[一句话说明什么时候必须停]

## 审查判定

- 是否需要对抗性审查：[是 / 否]
- 若是，报告文件：`review.md`
- Reviewer：[self / subagent / external / human / 不适用]
- No-finding 要求：[例如 reviewer 无重要发现 / 不适用]

## 关联

- 相关 Regression Gate：[引用]
- 审查报告：[路径 / 不适用]
- Generated Ledger：由 lifecycle CLI / `harness governance rebuild` 重建
- 前置任务：[引用；如无写“无”]

## 模块关联（启用模块并行时填写）

- Module：[module key，例如 reader / graph / 不适用]
- Step：[step ID，例如 RDR-02 / 不适用]
- Module Plan：[link to module_plan.md / 不适用]

## 协调者交接（Coordinator，启用模块并行时填写）

- Global sync owner：coordinator / 不适用
- Global sync status：pending-coordinator-pass / synced / n/a
- Registry update needed：[module key, step, status, branch, updated / 不适用]
- Harness Ledger update needed：[task plan path, review path, closeout status / 不适用]
- Closeout / Regression update needed：[路径或 n/a]
