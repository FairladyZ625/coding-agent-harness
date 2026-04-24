# Regression 体系

## 核心思路

单元测试只是底线。长程项目需要多层证据来保证正确性。

## Evidence Depth 五级制

每条回归面都标注它的证据到了哪一层：

| 层级 | 名称 | 含义 | 可信度 |
|------|------|------|--------|
| L1 | tests | 只有单元测试 | 最低 |
| L2 | local_smoke | 本地冒烟测试通过 | 低 |
| L3 | live_e2e | 真实环境端到端验证 | 中 |
| L4 | browser_human_proxy | 浏览器模拟真人操作 | 高 |
| L5 | hard_gate | 结构化判定 + 非零退出 | 最高 |

越高层的证据越可信。L1 只能说明代码能编译和通过基本逻辑检查，L5 能自动告诉你"过了"还是"没过"。

## Regression SSoT 结构

```markdown
# Regression SSoT

## Active Fixed Gates

| ID | Status | Surface | Primary Entrypoint | Evidence Depth |
|----|--------|---------|-------------------|----------------|
| RG-001 | 🟢 | API Contract Smoke | `npm run smoke:api` | hard_gate |
| RG-002 | 🟢 | External Integration E2E | `npm run smoke:integration:live` | live_e2e |
| ...

## Residual Items

| ID | Surface | Issue | Priority |
|----|---------|-------|----------|
| R-001 | Frontend | Timeline 组件偶发渲染延迟 | P2 |
| ...

## Shared Regression Ledger

| Batch | Date | Scope | Result | Next Checkpoint |
|-------|------|-------|--------|-----------------|
| SRB-010 | 2026-04-12 | Full | 9/9 🟢 | SRB-011 after wave-14 |
| ...
```

## Cadence Ledger

定义什么情况下自动触发哪些回归面：

```markdown
## Cadence Rules

- 改了 API contract → 跑 RG-001 + RG-004
- 改了 external integration adapter → 跑 RG-002 + RG-003
- 改了 core domain logic → 跑 RG-008 + RG-009 + RG-010
- 改了 frontend user flow → 跑 RG-005（如有）
- 任何 merge 到 master → 跑 Full Shared Batch
```

不用人记住该跑什么，系统自己知道。

## 建立回归体系的步骤

1. 列出项目的所有关键 surface（用户入口、API 端点、集成点）
2. 为每个 surface 建一条 regression gate，写好命令行入口
3. 标注每条 gate 的当前 Evidence Depth
4. 定义 Cadence Rules
5. 跑第一轮 Shared Batch，记录结果
6. 持续迭代：每次新增 surface 或 evidence depth 提升时更新 SSoT
