# [任务名称]

## 目标
[一句话说清楚这个任务要达成什么]

## 范围
- 做什么：[具体范围]
- 不做什么：[明确排除]

## Task IA Budget

| Budget | Use When | Required Structure |
| --- | --- | --- |
| simple | One owner, no subagent, L0/L1 evidence | Standard five task files only |
| complex | L2/L3 evidence, subagent/reviewer, external references, generated artifacts, or more than 5 slices | Enable only the needed optional indexes |

Optional task subdirectories are trigger-based, not default scaffold:

- `references/INDEX.md` for task-local source notes, external links, reviewer packets, or cross-repo context.
- `artifacts/INDEX.md` for command output, screenshots, fixtures, generated reports, or review transcripts.
- `slices/<slice-id>/` for multi-slice work. Each slice uses `brief.md`, `evidence.md`, and `review.md`.

Do not create optional directories without an index and a real trigger.

## Context Packet

| ID | Type | Path | Why It Matters | Used By |
| --- | --- | --- | --- | --- |
| C-001 | public-doc / private-plan / external / code | PUBLIC:path or PRIVATE:path or TARGET:path or EXTERNAL:path or URL:https://example.com | Reason this context is needed | coordinator / reviewer / worker |

Use repo-root prefixes instead of fragile relative paths:

- `PUBLIC:` for files in the public source repository.
- `PRIVATE:` for files in the private harness repository.
- `TARGET:` for files in an installed target project.
- `EXTERNAL:` or `URL:` for outside references.

## Execution & Visualization Files

Execution strategy and visual roadmap are sibling files, not embedded sections.
This keeps the dashboard parser stable and lets task detail pages render each
view directly.

| Contract File | Required | Purpose |
| --- | --- | --- |
| `execution_strategy.md` | yes | Execution mode, subagent use, conflict control, evidence depth, handoff rules |
| `visual_roadmap.md` | yes | Mermaid route, phase table, completion, evidence status, blocking risk |

For legacy tasks only, dashboard/checker may read old `task_plan.md` sections as
a fallback. New tasks must use the standalone files.

## Artifact Index

Use this inline table for simple tasks. For larger artifacts, create
`artifacts/INDEX.md` and reference its IDs here.

| Artifact ID | Type | Path | Summary |
| --- | --- | --- | --- |
| A-001 | command / diff / fixture / screenshot / review / report | PUBLIC:path or PRIVATE:path or TARGET:path or EXTERNAL:path or URL:https://example.com | What this proves |

## 步骤
1. [步骤1]
2. [步骤2]
3. [步骤3]

## 验收标准
- [ ] [标准1]
- [ ] [标准2]
- [ ] [标准3]

## Worktree
- 路径：[worktree 路径，如 `.worktrees/feat/xxx`]
- 分支：[分支名]
- Worker owner：[coordinator / subagent id / 不适用]
- Worker handoff commit required：[yes / no / 不适用]
- Coordinator integration branch：[分支名 / 不适用]
- 若未开 worktree，原因：[说明]

## 长程任务判定
- 是否属于长程任务：[是 / 否]
- 若是，合同文件：`long-running-task-contract.md`
- 连续执行权限：[已授权 / 未授权 / 不适用]
- Stop Condition 摘要：[一句话说明什么时候可以停]

## Review 判定
- 是否需要对抗性 review：[是 / 否]
- 若是，报告文件：`review.md`
- Reviewer：[self / subagent / external / human / 不适用]
- No-finding 要求：[例如 reviewer 无 material finding / 不适用]

## 关联
- Feature SSoT 条目：[引用]
- 相关 Regression Gate：[引用]
- Review Report：[路径 / 不适用]
- Harness Ledger 条目：[完成时填写 / HL-...]
- 前置任务：[引用，如无则写"无"]

## 模块关联（启用模块并行时填写）
- Module: [module key，如 reader / graph / 不适用]
- Step: [step ID，如 RDR-02 / 不适用]
- Module Plan: [link to module_plan.md / 不适用]

## Coordinator Handoff（启用模块并行时填写）
- Global sync owner: coordinator / 不适用
- Global sync status: pending-coordinator-pass / synced / n/a
- Registry update needed: [module key, step, status, branch, updated / 不适用]
- Harness Ledger update needed: [task plan path, review path, closeout status / 不适用]
- Closeout / Regression update needed: [路径或 n/a]
