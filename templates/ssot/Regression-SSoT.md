# Regression SSoT - [项目名称]

> 单一事实源：管理所有 regression surface 的状态、证据深度和残项。
> 新增固定 gate 或 evidence depth 变化时必须更新。

## Active Fixed Gates

| ID | Status | Surface | Primary Entrypoint | Evidence Depth | Last Verified | Notes |
|----|--------|---------|-------------------|----------------|---------------|-------|
| RG-001 | 🟢 | [Surface 名称] | `[命令行入口]` | [tests/local_smoke/live/browser/hard_gate] | YYYY-MM-DD | |

## Evidence Depth Legend

| Level | Name | Description |
|-------|------|-------------|
| L1 | tests | 只有单元测试 |
| L2 | local_smoke | 本地冒烟测试通过 |
| L3 | live | 真实环境端到端验证 |
| L4 | browser_human_proxy | 浏览器模拟真人操作 |
| L5 | hard_gate | 结构化判定 + 非零退出 |

## Residual Items

| ID | Surface | Issue | Priority | Created |
|----|---------|-------|----------|---------|
| R-001 | [Surface] | [问题描述] | P1/P2/P3 | YYYY-MM-DD |

## Status Legend

- 🟢 通过
- 🟡 部分通过 / 有已知残项
- 🔴 失败
- ⏸ 暂停
