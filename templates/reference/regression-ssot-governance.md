# Regression SSoT Governance

## 职责

Regression SSoT 是回归控制塔，管理所有 regression surface 的状态、证据深度和残项。

## 维护规则

### 何时更新
- 新增 regression gate 时
- gate 的 evidence depth 提升时
- gate 状态变化时（通过/失败/暂停）
- 新增或解决 residual item 时
- 每轮 shared batch 执行后

### 谁来更新
- 执行回归测试的 agent 负责更新对应 gate 的状态和 last verified 日期
- 发现新 residual 的 agent 负责添加 residual item
- 解决 residual 的 agent 负责标记为已解决

## Gate 管理

### 新增 Gate
1. 在 Active Fixed Gates 表中添加新行
2. 分配唯一 ID（RG-XXX，递增）
3. 填写 surface、primary entrypoint、initial evidence depth
4. 同步更新 Cadence Ledger 的 trigger rules
5. 在当前任务的 Harness Ledger row 记录 `Regression=updated`

### 提升 Evidence Depth
1. 实现更高层级的测试（如从 local_smoke 到 live）
2. 验证通过后更新 evidence depth 字段
3. 记录到对应的 walkthrough
4. 在当前任务的 Harness Ledger row 记录 `Regression=updated`

### 废弃 Gate
1. 将 gate 从 Active 移到 `docs/05-TEST-QA/_archive/Regression-SSoT-archive-YYYY-QN.md`
2. 说明废弃原因
3. 同步更新 Cadence Ledger
4. 在当前任务的 Harness Ledger row 记录 `Regression=updated`

## Shared Batch 执行规范

1. 每轮 shared batch 必须覆盖所有 active gate
2. 执行结果记录到 Cadence Ledger 的 batch log
3. 失败的 gate 必须创建对应的 residual item
4. 下一轮 batch 的 checkpoint 条件必须明确

如果 shared batch 只更新 `Last Verified` 且没有 residual / evidence depth 变化，不强制写 Harness Ledger。

## 与 Feature SSoT 的关系

- Regression SSoT 不替代 Feature SSoT
- Feature SSoT 管进度，Regression SSoT 管正确性
- 两者互相引用但不吞并
