# [任务名称]

## 目标
[一句话说清楚这个任务要达成什么]

## 范围
- 做什么：[具体范围]
- 不做什么：[明确排除]

## 步骤
1. [步骤1]
2. [步骤2]
3. [步骤3]

## 验收标准
- [ ] [标准1]
- [ ] [标准2]
- [ ] [标准3]

## Worktree
- 路径：[worktree 路径，如 `.worktrees/feat/xxx`]
- 分支：[分支名]
- Worker owner：[coordinator / subagent id / 不适用]
- Worker handoff commit required：[yes / no / 不适用]
- Coordinator integration branch：[分支名 / 不适用]
- 若未开 worktree，原因：[说明]

## 长程任务判定
- 是否属于长程任务：[是 / 否]
- 若是，合同文件：`long-running-task-contract.md`
- 连续执行权限：[已授权 / 未授权 / 不适用]
- Stop Condition 摘要：[一句话说明什么时候可以停]

## Review 判定
- 是否需要对抗性 review：[是 / 否]
- 若是，报告文件：`review.md`
- Reviewer：[self / subagent / external / human / 不适用]
- No-finding 要求：[例如 reviewer 无 material finding / 不适用]

## 关联
- Feature SSoT 条目：[引用]
- 相关 Regression Gate：[引用]
- Review Report：[路径 / 不适用]
- Harness Ledger 条目：[完成时填写 / HL-...]
- 前置任务：[引用，如无则写"无"]

## 模块关联（启用模块并行时填写）
- Module: [module key，如 reader / graph / 不适用]
- Step: [step ID，如 RDR-02 / 不适用]
- Module Plan: [link to module_plan.md / 不适用]
