# Planning Loop

## 核心思路

每个非平凡任务必须有独立的任务目录和三件套文件。这是 agent 在长时间执行过程中不偏离目标的锚点。

## 任务目录结构

```
docs/09-PLANNING/TASKS/<YYYY-MM-DD-任务名>/
├── task_plan.md    ← 计划：目标、范围、步骤、验收标准
├── findings.md     ← 发现：执行过程中的研究发现和技术决策
├── progress.md     ← 进度：每个阶段的状态更新和验证结果
└── long-running-task-contract.md ← 长程任务合同（仅长程任务需要）
```

## 执行规则

1. **每个阶段前读 task_plan.md** — agent 重新对齐目标
2. **每个阶段后更新 progress.md** — 记录做了什么、验证了什么
3. **研究发现写入 findings.md** — 不丢失中间产物
4. **禁止在项目根目录放过程文件** — task_plan.md、findings.md、progress.md 只能在任务目录内
5. **长程任务必须补合同** — 如果任务需要连续执行、多轮审查或子代理 review，先补 `long-running-task-contract.md`

## task_plan.md 模板

```markdown
# [任务名称]

## 目标
[一句话说清楚这个任务要达成什么]

## 范围
[做什么、不做什么]

## 步骤
1. [步骤1]
2. [步骤2]
...

## 验收标准
- [ ] [标准1]
- [ ] [标准2]

## Worktree
- 路径：[worktree 路径]
- 分支：[分支名]
- 若未开 worktree，原因：[说明]

## 长程任务判定
- 是否属于长程任务：[是 / 否]
- 若是，合同文件：`long-running-task-contract.md`
- Stop Condition 摘要：[什么时候可以停]
```

## 为什么这套东西有效

- agent 的上下文窗口有限，task_plan 是它在长任务中唯一稳定的锚点
- progress.md 让下一轮 agent（或同一个 agent 的下一个 session）能快速接上
- findings.md 避免重复研究同一个问题
- 强制目录结构让所有任务可追溯、可检索

## 与 Anthropic Long-running Agents 方案的对照

Anthropic 的方案用 Feature List JSON + progress file + git commit 做跨 session 交接。
三件套（task_plan + findings + progress）是同一思路的更细粒度表达。

## findings.md 模板

```markdown
# [任务名称] - Findings

## 研究发现

### [发现主题 1]
- 背景：[为什么要研究这个]
- 发现：[具体发现了什么]
- 影响：[对任务计划有什么影响]

### [发现主题 2]
...

## 技术决策

| 决策 | 选择 | 原因 | 替代方案 |
|------|------|------|----------|
| [决策1] | [选了什么] | [为什么] | [没选什么] |
```

## progress.md 模板

```markdown
# [任务名称] - Progress

## 状态：[未开始 / 进行中 / 已完成 / 已阻塞]

## 进度记录

### [YYYY-MM-DD HH:MM] - [阶段名称]
- 做了什么：[具体操作]
- 验证结果：[跑了什么测试，结果如何]
- 下一步：[接下来做什么]

### [YYYY-MM-DD HH:MM] - [阶段名称]
...

## Residual
- [遗留问题1]
- [遗留问题2]
```

## 任务目录命名规范

格式：`YYYY-MM-DD-任务名称`

示例：
- `2026-03-15-user-auth-refactor`
- `2026-03-18-ui-timeline-component`
- `2026-04-01-regression-gate-webhook-live`

## 状态流转

```
未开始 → 进行中 → 已完成
              ↓
          已阻塞 → 进行中
```

每次状态变更时，必须同时更新 progress.md 和 Feature SSoT。
