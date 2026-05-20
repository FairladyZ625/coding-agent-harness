# 旧 Harness 平滑迁移 Playbook

这份 playbook 写给目标项目里的 agent。目标不是把历史文档全部机械改写，而是让旧项目逐步进入 v1.0 的可检查合同。

如果要把迁移任务交给另一个 agent 执行，先给它读：

- `docs-release/guides/legacy-migration-agent-prompt.md`

本文默认使用已安装的 `harness` 命令。维护者在本源码仓调试时，可以把同一命令替换为
`node scripts/harness.mjs`。

## 迁移原则

- 先保护历史，再补新合同。不要覆盖 `AGENTS.md`、`CLAUDE.md`、历史 task、walkthrough、SSoT 或 ledger。
- 先迁移活跃任务，再处理历史任务。关闭很久的任务可以继续作为 legacy evidence。
- 先声明真实 capability，再补对应 reference。不要因为模板存在就声明能力已采用。
- 普通检查用于发现迁移 backlog；`--strict` 是最终 cutover gate。
- 单线旧项目要先识别工程组织形态，再决定是否升级为 `module-parallel`。

## 标准流程

1. 读取现状并判断语言：

```bash
harness status --json /path/to/project
harness migrate-plan --json /path/to/project
```

如果项目中英文混杂，不要让 agent 猜模板语言。必须显式选择：

- 中文用户、中文项目上下文、中文对外文档：`--locale zh-CN`
- 英文团队、英文对外文档：`--locale en-US`

Agent 必须记录具体判断证据，例如 `AGENTS.md`、`CLAUDE.md`、`README.md`、`docs/Harness-Ledger.md`、活跃任务文档或产品对外文档。信号冲突时停止，让用户选择语言。

2. 运行迁移轨道：

```bash
harness migrate-run \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-project \
  --out-dir /tmp/cah-migration-project/dashboard \
  /path/to/project
```

`migrate-run` 会一次性完成兼容层声明、dashboard 生成、normal/strict 检查快照和 session 记录。它不会 stage 文件。目标仓库 dirty 时默认停止；只有确认 dirty 文件属于本次迁移上下文，才使用 `--allow-dirty`。

输出目录里必须有：

- `session.json`
- `report.md`
- `migrate-plan.json`
- `status-normal.json`
- `status-strict.json`
- `dashboard/index.html`

3. 验证迁移轨道：

```bash
harness migrate-verify /tmp/cah-migration-project/session.json
```

`migrate-verify` 会检查 capability registry、locale、dashboard HTML 路径、普通检查、strict deferred 元数据和 git index。它通过以后，才可以说迁移输出“可用”。

如果后续继续清理 warning 或补活跃任务合同，第一次 session 只能作为 baseline。最终交付前要重新运行 `migrate-run` 生成新 session/dashboard，或者明确列出 baseline session 与最终检查证据的差异。

4. 按计划继续人工/agent 清理：

- `MP-01`：确认兼容层和 locale，保证历史文档没有被覆盖。
- `MP-02`：选择 capability，只声明项目事实已经支持的能力。
- `MP-03`：给活跃任务补 `brief.md`、`execution_strategy.md`、`visual_roadmap.md`。
- `MP-04`：如果项目已经有多个独立功能域，再引入 `module-parallel`。
- `MP-05`：升级当前 release/architecture/security/data review，不重写所有历史 review。
- `MP-06`：普通检查 warning 都有 owner/action/status 后，再使用 strict 作为门禁。

5. 普通迁移验证：

```bash
harness check --profile target-project /path/to/project
harness dashboard --out-dir /tmp/harness-dashboard /path/to/project
```

6. 严格切换验证：

```bash
harness check --profile target-project --strict /path/to/project
```

`--strict` 通过才表示 strict cutover complete。如果用户接受剩余历史 residual，只能报告 `strict deferred`，并列出 owner、触发条件、下一步动作；不能说严格迁移完成。

## 旧任务迁移策略

旧项目迁移必须先看 SSoT，再看 warning。warning 只说明“v1 checker 看不懂”，不等于任务没有完成。

证据读取顺序：

1. `docs/Harness-Ledger.md`：任务是否已经收口、是否有 residual。
2. `docs/10-WALKTHROUGH/Closeout-SSoT.md`：是否有 walkthrough、Lessons Check 和 closeout status。
3. `docs/05-TEST-QA/Regression-SSoT.md` 及项目历史 regression SSoT：对应 surface 是否验证通过、是否仍有黄灯。
4. 任务自己的 `progress.md`、`review.md`、`findings.md`、walkthrough。
5. git history / PR / commit：代码或文档事实是否已经落地。

Subagent 应该围绕这个证据链互审：

| 角色 | 任务 | 输出 |
| --- | --- | --- |
| SSoT reviewer | 读 Ledger / Closeout / Regression SSoT | 判断任务是 current-active、closed-with-evidence、closed-with-residual、superseded 还是 unknown-history |
| Evidence reviewer | 读 task progress / review / walkthrough | 找到完成证据、阻塞证据或 residual 证据 |
| History reviewer | 读 git log / diff / PR 线索 | 判断任务是否已被提交历史或后续任务覆盖 |

只有 `current-active` 或 “仍被 SSoT 引用为当前证据”的任务，才补 `brief.md`、`execution_strategy.md`、`visual_roadmap.md`。其他历史任务要写 residual 路由，不要批量补模板制造假完成。

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

`migrate-plan --json` 会把 warning 转成四类行动：

- `taskActions`：活跃任务缺少 v1 task contract 文件。
- `reviewActions`：当前或历史 review 缺少 v1 review schema。
- `legacyActions`：旧 checker 要求的 reference 或治理文件缺口。
- `legacyResiduals`：历史任务或当前状态无法确认的任务仍缺文件；这是按“缺口文件”计数，不是按任务计数，不应机械迁移。

Agent 应该把这些行动分配 owner/action/status，而不是一次性改完整个仓库。对于 `legacyResiduals`，先判断任务是否重新打开或仍是当前证据；不迁移的历史内容要在 closeout 中写明 residual 原因。

## 迁移 Session 合同

`migrate-run` 的 `session.json` 是旧项目迁移的可审计交付物。后续 agent 不应该只凭口头总结接手，而应先读取 session：

| 字段 | 含义 |
| --- | --- |
| `localeDecision` | 本次选择的 `zh-CN` 或 `en-US`，以及中英文探测信号。 |
| `capabilities` | 已声明 capability，旧项目至少应有 `core`、`safe-adoption`、`dashboard`。 |
| `dashboard.indexPath` | 必须指向存在的 HTML dashboard。 |
| `checks.normal` | 普通迁移检查，用来判断当前输出是否可用。 |
| `checks.strict` | 最终切换门禁，旧项目早期可以失败。 |
| `strictDeferred` | strict 失败时必须存在 owner、trigger、nextAction 和 failureCount。 |
| `git.after.staged` | 必须为空，迁移轨道不能替用户 stage 文件。 |

如果 session 里 dashboard 指向 Markdown、缺少 `strictDeferred`、locale 和 registry 不一致，或者有 staged 文件，必须先修轨道，不要继续包装报告。

## Dashboard 迁移工作台

大项目不要用任务级 Mermaid 链路作为第一眼视图。任务数量很大或拓扑边不足时，dashboard 会切到聚合迁移跑道：

1. Baseline snapshot：确认当前历史任务、能力声明和检查状态。
2. Warning triage：把 warning 当成可分诊队列，而不是一次性报错列表。
3. Active task contracts：只先升级活跃或重新打开的任务合同。
4. Module classification：按真实产品/工程域分类；没有明确模块时使用 inferred module，不能伪造并行模块。
5. Strict cutover：当当前工作和门禁 review 都迁移后，再把 strict check 作为阻塞门禁。

Dashboard warning 每条都带这些字段：

| 字段 | 用途 |
| --- | --- |
| `type` | 稳定问题类型，例如 missing-brief、review-schema-gap、legacy-reference-gap。 |
| `scope` | 影响面：task、module、review、reference、capability、project。 |
| `priority` | 清理优先级。P1/P2 先处理，P3 可作为迁移 backlog。 |
| `phase` | 建议在哪个迁移阶段处理。 |
| `fixability` | 修复方式：template、guided、human-evidence、decision、manual。 |
| `status` | 当前队列状态，默认 open；清理后应转成 done/deferred/accepted-residual。 |
| `confidence` | 分类置信度，低置信度项需要人工确认。 |
| `affected` | 首要受影响路径，便于列表展示。 |
| `affectedPaths` | 相关文件路径，用于派发给 agent 或人工复核。 |
| `requiredAction` | 下一步动作文本，agent 派工时必须引用。 |
| `detail` | 原始 warning 摘要，用于复核分类是否正确。 |

对 400+ 历史任务的项目，正确的工作方式是：

- 用任务索引分页查看，不在一屏渲染全部任务。
- 先按 dashboard 的迁移分组找活跃任务、已有 brief 的任务和历史月份桶，再按 module 或 month 缩小范围。
- 对缺少 brief 的历史任务，不自动补模板；只有当任务重新打开或成为当前证据时才升级。
- 对 warning 队列按 category/type 分批修，修完一类再重新生成 dashboard。

## 模块分类决策

模块分类有三个层级，不能跳级：

1. `explicit module`：任务已经在 `docs/09-PLANNING/MODULES/<module>/` 下，或已有明确 `Module-Registry.md` 维护。
2. `inferred module`：dashboard 根据任务路径、标题、ID 关键字临时分组，仅用于浏览和分诊，不代表项目已经采用 `module-parallel`。
3. `legacy-unclassified`：无法稳定归类的历史任务，保持历史状态，不要批量改写。

创建 `Module-Registry.md` 前，必须先输出分类摘要：

- 候选模块名。
- 为什么这是产品/工程域，而不是文件夹或时间段。
- owner / write scope / shared-file coordinator 规则。
- 哪些任务仍保持 `legacy-unclassified`。

如果这些事实不成立，只使用 dashboard 的 inferred grouping 辅助清理，不声明 `module-parallel`。
