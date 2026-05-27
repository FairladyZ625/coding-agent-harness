# Cadence Ledger

## 目的

定义"什么情况下自动触发哪些回归面"。让 agent 在 merge 或改动后自动知道该跑什么回归，不依赖人的记忆。

## Cadence Ledger 结构

Cadence Ledger 是一个独立文件，放在 `coding-agent-harness/governance/regression/Cadence-Ledger.md`。

包含两个部分：

### 1. Trigger Rules（触发规则）

定义改动范围到回归面的映射：

```markdown
## Trigger Rules

| 改动范围 | 触发的 Regression Gates |
|----------|----------------------|
| [范围1，如 API 路由层] | RG-001, RG-003 |
| [范围2，如前端组件] | RG-005 |
| [范围3，如数据库 schema] | RG-001, RG-002, RG-004 |
| [范围4，如认证/权限] | RG-006, RG-007 |
| 任何 merge 到主干 | Full Shared Batch |
```

### 2. Shared Regression Batch Log（共享回归批次记录）

记录每一轮 shared batch 的执行情况：

```markdown
## Shared Regression Batch Log

| Batch | Date | Scope | Trigger | Result | Notes | Next Checkpoint |
|-------|------|-------|---------|--------|-------|-----------------|
| SRB-001 | YYYY-MM-DD | Full | Initial bootstrap | 3/5 🟢 2/5 🟡 | [备注] | SRB-002 after [条件] |
```

## 如何建立 Cadence Ledger

1. 从 Regression SSoT 中获取所有 active gate 的 ID 和 surface
2. 分析项目代码结构，识别哪些代码目录/模块对应哪些 surface
3. 建立"改动范围 → gate"的映射关系
4. 定义 merge 到主干时的 full batch 规则
5. 跑第一轮 shared batch，记录结果

## 维护规则

- 新增 regression gate 时，必须同步更新 trigger rules
- 每轮 shared batch 执行后，必须记录到 batch log
- 定期审查 trigger rules 是否还准确（代码结构可能变化）
- 如果本轮任务改变了 trigger rules、gate 结构或 evidence depth，收口时在 Harness Ledger 记录 `Regression=updated`
- routine batch 只更新 `Last Verified` 且无 residual / evidence depth 变化时，不强制写 Harness Ledger
