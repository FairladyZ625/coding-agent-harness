# 回归单一事实源治理标准

## 职责

Regression SSoT 是项目回归控制塔，管理所有 regression surface 的 gate、证据深度、最后验证时间、失败状态和 residual。它管正确性，不管功能排期；功能进度由功能 SSoT 或 Delivery SSoT 管。

默认位置：

```text
docs/05-TEST-QA/Regression-SSoT.md
```

## 维护时机

必须更新 Regression SSoT：

- 新增、修改或废弃 regression gate。
- gate 的 evidence depth 提升或降低。
- gate 状态变化，例如 pass、fail、blocked、paused。
- 新增、解决或接受 residual。
- shared regression batch 执行后产生状态、证据或 residual 变化。
- release、重大 merge、架构改动、关键 UI/API surface 改动后。

如果 routine batch 只更新“上次验证”，且没有 residual 或 evidence depth 变化，不强制写 Harness Ledger；但 Regression SSoT 本身仍应保持当前。

## 负责人

- 执行回归的 agent 更新 gate 状态和 last verified。
- 发现 residual 的 agent 添加 residual item。
- 修复 residual 的 agent 标记解决，并链接证据。
- coordinator 负责 shared batch 的完整性和最终汇总。

## 回归门禁字段

| 字段 | 说明 |
| --- | --- |
| Gate ID | 唯一 ID，例如 `RG-001`。 |
| Surface | 被保护的功能面、接口、页面、流程或平台。 |
| Primary entrypoint | 主要入口，例如 URL、命令、API、job、用户路径。 |
| Evidence depth | 证据层级，例如 unit、integration、local_smoke、browser、live。 |
| Current status | 当前状态，例如 pass、fail、blocked、paused。 |
| Last verified | 最近一次有效验证日期。 |
| Required trigger | 哪些改动会触发此 gate。 |
| Evidence | 命令、日志、截图、trace、CI run 或 walkthrough 链接。 |
| Residual | 未解决风险、owner 和后续路径。 |

## 新增回归门禁

1. 在活跃 gate 表中添加新行。
2. 分配递增 ID。
3. 写明 surface、primary entrypoint、initial evidence depth 和 trigger。
4. 同步更新 Cadence Ledger 的触发规则。
5. 在当前任务的 walkthrough 和 Harness Ledger 记录 `Regression=updated`。

## 提升证据深度

1. 实现更高层级的测试或检查，例如从本地冒烟提升到浏览器检查或线上验证。
2. 验证通过后更新 evidence depth。
3. 在 walkthrough 中说明为什么证据深度提升。
4. 如果替代旧检查，说明旧检查是否保留、降级或废弃。

## 废弃回归门禁

1. 将 gate 移入 `docs/05-TEST-QA/_archive/Regression-SSoT-archive-YYYY-QN.md`。
2. 写明废弃原因、替代 gate 和最后状态。
3. 同步更新 Cadence Ledger。
4. 在 walkthrough 和 Harness Ledger 记录本次治理变化。

## 共享批次执行规范

- 每轮 shared batch 必须覆盖所有 active gate，除非明确写明跳过原因。
- 执行结果记录到 Cadence Ledger 的批次日志。
- 失败 gate 必须创建 residual。
- 下一轮 batch 的 checkpoint 条件必须明确。
- batch 不能只写“已跑”，必须有 evidence。

## 与其他文件的关系

- 功能 SSoT 管进度，Regression SSoT 管正确性。
- Cadence Ledger 管什么时候跑，Regression SSoT 管 gate 当前事实。
- walkthrough 记录本轮验证结论，Regression SSoT 保留当前回归控制面。
- Harness Ledger 记录本轮是否完成回归上下文回写。
