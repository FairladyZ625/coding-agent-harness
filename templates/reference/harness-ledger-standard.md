# Harness Ledger Standard

## 职责

Harness Ledger 是 `docs/` 骨架的全局更新总账，位置固定为：

```text
docs/Harness-Ledger.md
```

它记录每个非平凡任务是否按 SOP 维护了 task plan、review report、Feature SSoT、
Regression SSoT、Walkthrough、Lessons SSoT 和 reference/template 文档。

## 何时更新

必须更新：

- 完成一个非平凡 task / wave / feature
- Bootstrap harness 完成
- 同步或升级最新版 coding-agent-harness
- 新增或修改 AGENTS.md / CLAUDE.md / reference / template
- 创建或更新 required review report
- 修改 Feature SSoT、Regression SSoT、Lessons SSoT 任一文件
- 创建 walkthrough
- Lessons approved 后合入正式 reference

不需要更新：

- 小 typo
- 单次 `progress.md` 过程性更新
- 普通测试输出粘贴
- 只读分析
- routine regression batch 只更新 `Last Verified` 且没有 residual /
  evidence depth 变化

## 写入规则

1. 只记录任务级 context update compliance
2. 不复制 Feature / Regression / Lessons 的业务事实
3. 不记录逐行 diff；逐行变化由 git history 负责
4. 状态值必须使用固定词，避免自由文本失控
5. 任务收口时最后更新 Harness Ledger，因为它记录本轮上下文维护的最终状态
6. closed row 必须有 Lessons Check 值；`checked-created` 必须引用 lesson ID

## 固定状态词

- `required`
- `updated`
- `created`
- `checked-none`
- `checked-created`
- `n/a`
- `skipped-with-reason`
- `missing`

## Closeout Checklist

任务完成前确认：

- [ ] `progress.md` 已更新
- [ ] `review.md` 已创建/更新，或标记 `n/a` / `skipped-with-reason`
- [ ] Closeout reviewer / subagent 已执行，或标记 `skipped-with-reason`
- [ ] Repo governance / CI-CD 已更新、验证或 residualized
- [ ] Feature SSoT 已更新或标记 `n/a`
- [ ] Regression SSoT / Cadence Ledger 已更新或标记 `n/a`
- [ ] Walkthrough 已创建或有明确跳过原因
- [ ] Closeout SSoT 已登记 walkthrough 路径或受控跳过原因
- [ ] Walkthrough 已包含 Lessons Reflection
- [ ] Lessons 检查已执行，结果为 `checked-none: <reason>` 或 `checked-created: L-YYYY-MM-DD-NNN`
- [ ] 如果是 `checked-created`，已创建 `docs/01-GOVERNANCE/lessons/` 详情文档，且 Lessons SSoT 的 `Detail Doc` 指向它
- [ ] Harness Ledger row 已更新为 `closed`，或 residual 已记录

## Harness Update Checklist

更新已有 harness 时确认：

- [ ] 已重新读取最新版 coding-agent-harness Skill
- [ ] 已列出 delta plan
- [ ] 只补齐新增标准和缺失结构，未覆盖历史 walkthrough、task progress 或 SSoT 事实
- [ ] 新增 reference/template 已写入入口索引
- [ ] Ledger row 记录了本次 delta merge 和 residual

## 归档

Active 表保留最近 50 条。更早的 `closed` 或 `superseded` 条目按季度归档：

```text
docs/01-GOVERNANCE/_archive/Harness-Ledger-archive-YYYY-QN.md
```
