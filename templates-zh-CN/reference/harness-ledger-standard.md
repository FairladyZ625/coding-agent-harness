# 工程总账标准

## 职责

Harness Ledger 是 `docs/` 骨架的全局上下文维护总账，固定位置为：

```text
docs/Harness-Ledger.md
```

它记录每个非平凡任务是否完成了 task plan、progress、review、功能 SSoT、Delivery SSoT、Regression SSoT、Lessons SSoT、walkthrough、Closeout SSoT、reference/template 和 CI/CD 治理回写。它不复制业务事实，只记录上下文维护是否合规。

## 必须更新的场景

- 完成一个非平凡 task、wave、feature 或 release。
- bootstrap、同步或升级 coding-agent-harness。
- 新增或修改 AGENTS.md、CLAUDE.md、reference、template、checker 或 dashboard。
- coordinator pass 汇总模块任务、worker handoff、review、closeout 或 regression 结果。
- 创建或更新 required review。
- 修改功能 SSoT、Delivery SSoT、Regression SSoT、Lessons SSoT、Closeout SSoT 任一文件。
- 创建 walkthrough 或接受受控跳过。
- Lessons approved 后合入正式 reference。

## 通常不需要更新的场景

- 单个错别字或排版小修。
- 单次 `progress.md` 过程性追加。
- 普通测试输出粘贴，且不改变 gate 状态。
- 只读分析，没有产生 repo 内上下文变化。
- routine regression batch 只更新“上次验证”，且没有 residual 或 evidence depth 变化。

## 写入规则

1. 每行对应一个任务级或治理级上下文维护事件。
2. 不复制 Feature、Regression、Lessons 的业务细节；只链接源文件。
3. 不记录逐行 diff；逐行变化由 git history 负责。
4. 状态值使用固定词，避免自由文本失控。
5. 任务收口时最后更新 Harness Ledger。
6. `closed` 行必须有 Lessons 检查结果。
7. 新任务默认引用 `lesson_candidates.md`，并使用 `checked-candidate`、`queued-promotion` 或 `checked-created` 记录人工判定。
8. `checked-created` 必须引用 lesson ID 和详情文档。
8. 如果 closeout、review 或 regression 被跳过，必须写 `skipped-with-reason`。

## 固定状态词

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
- `pending-coordinator-pass`

## 收口检查

任务完成前确认：

- [ ] `task_plan.md`、`progress.md` 已更新到当前事实。
- [ ] 启用模块并行时，worker 已更新 `module_plan.md` 并完成 handoff。
- [ ] coordinator pass 已同步 `Module-Registry.md`、Delivery SSoT 和 Harness Ledger，或记录 `pending-coordinator-pass`。
- [ ] `review.md` 已创建/更新，或标记 `n/a` / `skipped-with-reason`。
- [ ] closeout reviewer 已执行，或跳过原因受控。
- [ ] repo governance、CI/CD required checks 已验证、更新或 residualized。
- [ ] 功能 SSoT 或 Delivery SSoT 已更新，或标记 `n/a`。
- [ ] Regression SSoT / Cadence Ledger 已更新，或标记 `n/a`。
- [ ] walkthrough 已创建，或 Closeout SSoT 写明受控跳过原因。
- [ ] walkthrough 包含 Lessons 反思。
- [ ] Lessons 检查结果为 `checked-candidate: LC-...`、`queued-promotion: LC-...`、`checked-created: L-YYYY-MM-DD-NNN`，或旧任务兼容的 `checked-none: <reason>`。
- [ ] Harness Ledger 行已收口，或 residual 已写明 owner 和后续路径。

## 框架更新检查清单

更新已有 harness 时确认：

- [ ] 已读取最新版 coding-agent-harness Skill、reference、template 和 checker。
- [ ] 已列出 delta plan。
- [ ] 只补齐新增标准和缺失结构，没有覆盖历史 walkthrough、task progress、SSoT 事实。
- [ ] 新增 reference / template 已写入入口索引。
- [ ] checker 或 dashboard 的新增要求已有验证。
- [ ] Harness Ledger 记录本次 delta merge、证据和 residual。

## 归档

活跃表保留最近 50 条。更早的 `closed` 或 `superseded` 条目按季度归档：

```text
docs/01-GOVERNANCE/_archive/Harness-Ledger-archive-YYYY-QN.md
```

归档后，活跃表必须留下归档位置说明。
