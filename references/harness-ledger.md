# Harness Ledger

## 核心思路

Harness Ledger 是任务生命周期的全局生成索引。它把任务目录、模块任务、review、lesson、closeout 和 residual 的可扫描状态汇总到一张表，方便 Agent 快速定位；人看当前状态优先使用 Dashboard。

一句话定义：

> 任务本地文件保存事实；Harness CLI 从这些事实生成 Harness Ledger。

## 文件位置

```text
docs/Harness-Ledger.md
```

放在 `docs/` 根目录，因为它横跨 planning、review、walkthrough、lessons 和模块索引。

## 职责边界

Harness Ledger 记录：

- task / module scope
- module key
- task title
- lifecycle state
- queue markers
- task plan 路径
- review 状态或路径
- Lessons Check 状态
- closeout 状态
- residual 摘要
- 生成日期

Harness Ledger 不记录：

- 每次 `progress.md` 的过程性更新
- 每条测试输出
- 每个 git diff 细节
- Regression / Delivery / Cadence / Closeout 的详细治理事实
- lesson 详情正文
- 可以从 git history 直接恢复的逐行变更

`Feature-SSoT.md` 和 `Private-Feature-SSoT.md` 是旧版任务生命周期投影。当前版本在 `harness governance rebuild --archive --apply` 中归档这些旧表，不再重新生成。

## 生成规则

触发任务生命周期变化时，优先使用 CLI：

```bash
harness new-task <task-id>
harness task-start <task-id>
harness task-phase <task-id> <phase-id> --state done
harness task-review <task-id>
harness task-complete <task-id>
harness governance rebuild --archive --apply
```

Agent 不应手写或机械更新 Ledger 的任务行。如果发现生成结果不对，应修复 scanner、generator 或任务本地事实，再重新生成。

## 与其他治理表的关系

- Delivery SSoT 仍管理交付 block、跨仓顺序、owner 和依赖。
- Regression SSoT 仍管理回归面、证据深度和 residual。
- Cadence Ledger 仍管理周期性验证节奏。
- Closeout SSoT 仍管理 walkthrough、closeout status 和受控 skip reason。
- Module Registry 仍管理模块边界、owner、worktree 和写入范围。

这些表不是任务生命周期小表。本版本只移除 `Feature-SSoT.md` / `Private-Feature-SSoT.md` 这类生命周期投影，不删除尚无等价 scanner/generator 的治理表。

## 归档规则

旧生命周期表切换时归档到：

```text
docs/09-PLANNING/_archive/<timestamp>/
```

归档不改变历史证据，也不要求迁移 Agent 删除旧快照。确认 Dashboard、`task-list`、`task-index` 和新 Ledger 都能表达当前任务后，项目 owner 再决定是否清理归档。

## Closeout 顺序

每个非平凡任务收口时按以下顺序：

1. 更新 `progress.md` 或等价任务本地事实。
2. 跑必要验证和 regression gate。
3. 完成 `review.md` 并处理 material findings（如适用）。
4. 回写 Repo Governance / CI-CD 状态（如适用）。
5. 回写 Regression SSoT / Cadence Ledger / Delivery SSoT 等本轮实际触达的非生命周期治理表（如适用）。
6. 写 walkthrough。
7. 更新 Closeout SSoT。
8. 执行 Lessons 检查；新任务先更新 `lesson_candidates.md`，如人工确认沉淀，再由维护命令写详情文档。
9. 运行 Harness CLI 生成或刷新 Harness Ledger。

最后刷新 Harness Ledger，是为了让它记录本轮任务本地事实和治理表维护结果的最终状态。

## Harness Update 记录

更新已有 harness 时，Ledger row 只记录本次 task lifecycle delta。具体标准、模板、reference 的合并细节由 task plan、progress、walkthrough 和 git history 保存。

## 常见反模式

- 手写 Ledger 任务行而不是修复任务事实或生成器
- 把 Regression / Delivery 的详细治理事实复制进 Ledger
- 每次测试或每次 progress 变动都追加 row
- 用自由文本状态导致无法快速扫描
- 旧 Feature 生命周期表归档后又重新创建
