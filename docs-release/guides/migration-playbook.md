# 旧 Harness 平滑迁移 Playbook

这份 playbook 写给目标项目里的 agent。目标不是把历史文档全部机械改写，而是让旧项目逐步进入 v1.0 的可检查合同。

## 迁移原则

- 先保护历史，再补新合同。不要覆盖 `AGENTS.md`、`CLAUDE.md`、历史 task、walkthrough、SSoT 或 ledger。
- 先迁移活跃任务，再处理历史任务。关闭很久的任务可以继续作为 legacy evidence。
- 先声明真实 capability，再补对应 reference。不要因为模板存在就声明能力已采用。
- 普通检查用于发现迁移 backlog；`--strict` 是最终 cutover gate。
- 单线旧项目要先识别工程组织形态，再决定是否升级为 `module-parallel`。

## 标准流程

1. 读取现状：

```bash
node scripts/harness.mjs status --json /path/to/project
node scripts/harness.mjs migrate-plan --json /path/to/project
```

2. 安装兼容层：

```bash
node scripts/harness.mjs add-capability safe-adoption \
  --locale zh-CN \
  /path/to/project
```

3. 生成迁移计划：

```bash
node scripts/harness.mjs migrate-plan --json --limit 50 /path/to/project
```

4. 按计划迁移：

- `MP-01`：确认兼容层和 locale，保证历史文档没有被覆盖。
- `MP-02`：选择 capability，只声明项目事实已经支持的能力。
- `MP-03`：给活跃任务补 `brief.md`、`execution_strategy.md`、`visual_roadmap.md`。
- `MP-04`：如果项目已经有多个独立功能域，再引入 `module-parallel`。
- `MP-05`：升级当前 release/architecture/security/data review，不重写所有历史 review。
- `MP-06`：普通检查 warning 都有 owner/action/status 后，再使用 strict 作为门禁。

5. 收口验证：

```bash
node scripts/harness.mjs check --profile target-project /path/to/project
node scripts/harness.mjs dashboard --out-dir /tmp/harness-dashboard /path/to/project
node scripts/harness.mjs check --profile target-project --strict /path/to/project
```

## 旧任务迁移策略

| 旧状态 | 处理方式 |
| --- | --- |
| 已关闭、只作历史证据 | 保持 legacy，不补文件。 |
| 活跃任务但只有 `task_plan.md` | 添加 `brief.md`、`execution_strategy.md`、`visual_roadmap.md`，用 `task-log` 记录迁移证据。 |
| 重新打开的旧任务 | 当作活跃任务迁移，不重写旧内容，新增 v1 文件承接当前事实。 |
| 有 review 但不是当前门禁 | 保留原样，迁移计划中记录为历史 review gap。 |
| 当前 release-blocking review | 升级到 v1 `review.md` schema，补 Evidence Checked 和 Final Confidence Basis。 |

## 从单线任务到模块并行

不要把大量历史 task 自动变成模块。只有满足这些条件才采用 `module-parallel`：

- 项目存在两个以上可独立演进的产品或工程域。
- 每个模块有 owner、write scope、依赖关系和集成规则。
- 共享文件由 coordinator 维护，worker 通过 handoff 请求更新。
- `Module-Registry.md` 和每个 `module_plan.md` 能被持续维护。

如果只是历史 task 很多，但没有稳定模块边界，先保持 `safe-adoption`，用 `migrate-plan` 输出 action list，等模块边界明确后再加 capability。

## 报错与行动

`migrate-plan --json` 会把 warning 转成三类行动：

- `taskActions`：活跃任务缺少 v1 task contract 文件。
- `reviewActions`：当前或历史 review 缺少 v1 review schema。
- `legacyActions`：旧 checker 要求的 reference 或治理文件缺口。

Agent 应该把这些行动分配 owner/action/status，而不是一次性改完整个仓库。对于不迁移的历史内容，在 closeout 中写明 residual 原因。
