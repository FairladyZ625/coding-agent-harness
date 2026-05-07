# Lessons SSoT - [项目名称]

> 单一事实源：管理所有经验沉淀建议的生命周期。
> Agent 在 Walkthrough 收口后写入建议；人审批后决定是否合入正式 reference。
> **开始写新建议前，必须完整读一遍本表，了解当前所有 pending 状态的条目。**

## Active Lessons

| ID | Date | Source | Type | Target | Summary | Detail | Status | Conflict |
|----|------|--------|------|--------|---------|--------|--------|----------|
| | | | | | | | | |

## Archived (see archive/ for full history)

| ID | Date | Resolution | Resolved |
|----|------|------------|----------|
| | | | |

## Status Legend

- 🟡 pending — 等待人审批
- 🟢 approved — 已批准，待合入
- ✅ merged — 已合入正式 reference
- ❌ rejected — 不采纳
- 🔀 superseded — 被后续条目取代

## Type Legend

- `ref-change` — 修改现有 reference 文档
- `new-doc` — 新增文档/规范
- `arch-change` — 架构层面的改动建议
- `process-change` — 流程/工作方式的改动建议

## Rules

1. Agent 写新建议前必须完整读本表
2. 副本始终基于正式版本，不基于其他 pending 副本
3. 如有冲突，以解决冲突方式编写，并在 Conflict 列互相标记
4. Active 表超过 20 条时归档已完结条目到 `archive/`
