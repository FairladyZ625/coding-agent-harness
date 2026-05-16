# Harness Ledger - [项目名称]

> 全局 harness 更新总账：记录每个非平凡任务是否按 SOP 维护了 docs 骨架。
> 本表不记录逐行 diff，只记录任务级 context update compliance。

## Active Task Updates

| ID | Date | Task | Task Plan | Review | Updates | Docs | Repo Governance / CI-CD | Lessons Check | Evidence | Residual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Archived

> 旧条目按季度归档到
> `docs/01-GOVERNANCE/_archive/Harness-Ledger-archive-YYYY-QN.md`。

| Archive | Range | Notes |
| --- | --- | --- |

## Status Legend

- `open` — 任务仍在进行，Ledger row 可继续更新
- `closed` — 任务已完成，所需上下文回写已完成或有明确 residual
- `blocked` — 任务无法完成上下文回写，原因写在 Residual
- `superseded` — 被后续 Ledger row 取代

## Update Value Legend

- `required` — 本任务必须更新，尚未完成
- `updated` — 已更新既有文件
- `created` — 已创建新文件或条目
- `checked-none` — 已检查，无需创建或更新
- `checked-created` — 已检查，并创建对应条目
- `n/a` — 本任务不适用
- `skipped-with-reason` — 跳过但 Residual 中有原因
- `missing` — 应做未做，必须有 residual

## Rules

1. 每个非平凡 task / wave / feature 收口时必须更新本表
2. 本表只记录任务级 context update compliance，不记录逐行 diff
3. Feature / Regression / Lessons 的事实保留在对应 SSoT，不复制到本表
4. Active 表超过 50 条时，归档 `closed` / `superseded` 条目
5. 任意 `closed` / `closed-with-residual` / `closed-local-only` 条目必须在 `docs/10-WALKTHROUGH/Closeout-SSoT.md` 有对应 row
6. Lessons Check 必须是 `checked-created: L-YYYY-MM-DD-NNN` 或 `checked-none: <reason>`；不能静默空缺
