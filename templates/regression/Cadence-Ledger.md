# Cadence Ledger - [项目名称]

> 定义"什么情况下自动触发哪些回归面"。
> 新增 regression gate 时必须同步更新 trigger rules。

## Trigger Rules

| 改动范围 | 触发的 Regression Gates | 说明 |
|----------|----------------------|------|
| [范围1，如 API 路由层] | RG-001, RG-003 | [为什么这些 gate] |
| [范围2，如前端组件] | RG-005 | |
| [范围3，如数据库 schema] | RG-001, RG-002, RG-004 | |
| 任何 merge 到主干 | Full Shared Batch | |

## Shared Regression Batch Log

| Batch | Date | Scope | Trigger | Result | Notes | Next Checkpoint |
|-------|------|-------|---------|--------|-------|-----------------|
| SRB-001 | YYYY-MM-DD | Full | Initial bootstrap | [X/Y 🟢] | [备注] | SRB-002 after [条件] |
