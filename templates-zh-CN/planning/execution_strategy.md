# 执行策略

## 决策表

| 决策 | 选择 | 说明 |
| --- | --- | --- |
| 主执行者 | coordinator | coordinator 负责编排顺序、冲突判断和最终收口。 |
| Subagent 模式 | none / reviewer-only / worker-worktree | 选择能满足任务的最小协作模式。 |
| 审查模型 | self-check / predefined verifier / adversarial review | 说明为什么该审查层级足够。 |
| Worktree 策略 | same checkout / dedicated worktree | 会改代码的 subagent 必须使用独立 worktree，并提交 handoff commit。 |
| 冲突控制 | coordinator owns shared files | subagent 不得直接编辑 coordinator 管理的全局表或共享文件，除非获得明确锁。 |
| 证据深度 | L0 / L1 / L2 / L3 | 按变更风险匹配证据深度。 |

## 子代理 / Worker 合同

如使用 subagent 或 worker，在这里写清楚输入包、写入范围、handoff 格式和最终集成 owner。

| 角色 | 输入包 | 写入范围 | 交接要求 | 负责人 |
| --- | --- | --- | --- | --- |
| reviewer / worker / n/a | C-001 | read-only / path list / n/a | report / commit SHA / n/a | coordinator |

## 证据计划

| 证据层级 | 计划命令或检查 | 记录位置 | 完成条件 |
| --- | --- | --- | --- |
| L0 | [静态检查 / 小范围自检] | `progress.md` | [通过标准] |
| L1 | [单元测试 / targeted check] | `progress.md` 或 `artifacts/INDEX.md` | [通过标准] |
| L2 | [集成 / 浏览器 / 真实数据冒烟] | `artifacts/INDEX.md` | [通过标准] |
| L3 | [发布前 / 生产等价验证 / 外部审查] | `review.md` 与 walkthrough | [通过标准] |

## 暂停 / 升级条件

- 所需工作超出已批准写入范围。
- 共享表需要更新，但没有 coordinator lock。
- 实际风险高于原计划，证据深度需要升级。
- reviewer 发现会改变范围或方案的 P0/P1/P2 问题。
- 环境无法提供关键证据，继续执行会变成猜测。
