# Harness Ledger

## 核心思路

Harness Ledger 是 `docs/` 骨架的全局更新总账。它不保存业务事实，也不替代
Delivery / Feature / Regression / Lessons 四张 SSoT；它只记录每个非平凡任务是否按 harness SOP
维护了应该维护的上下文。Closeout SSoT 则记录每个 closed 任务是否有 walkthrough 或受控 skip reason。

一句话定义：

> SSoT 保存当前事实；Harness Ledger 记录每轮任务是否维护了这些事实。

## 文件位置

```text
docs/Harness-Ledger.md
```

放在 `docs/` 根目录，而不是 `docs/01-GOVERNANCE/`。原因是它横跨 planning、
regression、walkthrough、reference、lessons 等多个目录，是全局审计索引。

## 职责边界

Harness Ledger 记录：

- 本任务是否创建或更新 task plan
- 是否创建或更新 review report（如任务需要对抗性审查）
- 是否更新或验证 Repo Governance / CI-CD guardrails
- 是否回写 Feature SSoT
- 是否更新 Regression SSoT 或 Cadence Ledger
- 是否创建 walkthrough
- 是否执行 Lessons 检查，是否产生 Lessons SSoT 条目
- 如果产生 Lessons SSoT 条目，是否已创建 `docs/01-GOVERNANCE/lessons/` 详情文档
- 本轮触碰了哪些 harness 文档
- 是否有 residual 或 skipped-with-reason

Harness Ledger 不记录：

- 每次 `progress.md` 的过程性更新
- 每条测试输出
- 每个 git diff 细节
- Feature / Regression / Lessons 的业务事实本身
- 可以从 git history 直接恢复的逐行变更

## 触发规则

必须更新 Harness Ledger：

1. 完成一个非平凡 task / wave / feature
2. Bootstrap harness 完成
3. 同步或升级最新版 coding-agent-harness
4. 新增或修改 AGENTS.md / CLAUDE.md / reference / template
5. 创建或更新 required review report
6. coordinator pass 同步模块任务的全局状态、review、closeout 或 regression 结果
7. 修改 Repo Governance / CI-CD / required checks / branch protection 状态
8. 修改 Feature SSoT、Regression SSoT、Lessons SSoT 任一文件
9. 创建 walkthrough
10. Lessons approved 后合入正式 reference

不需要更新 Harness Ledger：

1. 小 typo
2. 单次 `progress.md` 过程性更新
3. 普通测试输出粘贴
4. 只读分析
5. routine regression batch 只更新 `Last Verified` 且无 residual /
   evidence depth 变化

## 状态词

字段值必须使用固定词，避免自由文本失控：

- `required`
- `updated`
- `created`
- `checked-none`
- `checked-candidate`
- `queued-promotion`
- `checked-created`
- `n/a`
- `skipped-with-reason`
- `missing`

## ID 规则

格式：

```text
HL-YYYYMMDD-NNN
```

示例：

```text
HL-20260511-001
```

多 agent 并行时，每个 agent 只追加或更新自己负责的 row。冲突时保留双方 row，
不要重排全表。

## 归档规则

Active 表保留最近 50 条。更早的 `closed` 或 `superseded` 条目按季度归档：

```text
docs/01-GOVERNANCE/_archive/Harness-Ledger-archive-YYYY-QN.md
```

归档不改变 `HL-*` ID，也不删除 walkthrough、task plan 或四张 SSoT 中的引用。

## Closeout 顺序

每个非平凡任务收口时按以下顺序：

1. 更新 `progress.md`
2. 跑必要验证和 regression gate
3. 回写 Feature SSoT；模块并行 worker 只回写 module_plan 和 Coordinator Handoff，coordinator pass 再同步 Module Registry / Harness Ledger
4. 完成 `review.md` 并处理 material findings（如适用）
5. 回写 Repo Governance / CI-CD 状态（如适用）
6. 回写 Regression SSoT / Cadence Ledger（如适用）
7. 写 walkthrough
8. 更新 Closeout SSoT
9. 执行 Lessons 检查；新任务先更新 `lesson_candidates.md`，如人工确认沉淀，再由维护命令写详情文档并更新 Lessons SSoT
10. 更新 Harness Ledger

最后更新 Harness Ledger，是为了让它记录本轮所有上下文维护的最终状态。
如果 Harness Ledger row 进入 `closed` / `closed-with-residual` / `closed-local-only`，
必须同步在 `docs/10-WALKTHROUGH/Closeout-SSoT.md` 登记 walkthrough 或受控 skip reason。
同时必须登记 Lessons Check：`checked-candidate: LC-...`、`queued-promotion: LC-...`、
`checked-created: L-YYYY-MM-DD-NNN`，或旧任务兼容的 `checked-none: <reason>`。

## Harness Update 记录

更新已有 harness 时，Ledger row 只记录本次 delta merge：

- 读到了哪个最新版 Skill / reference / template
- 新增或修补了哪些 harness 骨架文件
- 哪些既有 SSoT / walkthrough / task history 被保留未覆盖
- 是否产生 residual，例如某个标准暂不适合当前项目

不要把模板全文、旧文档全文或逐行 diff 复制进 Ledger。细节由 git history 和
walkthrough 保存，Ledger 只回答"这次升级维护了哪些上下文入口"。

## 常见反模式

- 把 Harness Ledger 写成逐行 diff 日志
- 把 Feature / Regression / Lessons 的业务事实复制进 Ledger
- 每次测试或每次 progress 变动都追加 row
- 用自由文本状态导致无法快速扫描
- 任务完成但 Ledger 标记 `missing` 没有 residual 说明
