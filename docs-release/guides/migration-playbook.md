# 旧 Harness 平滑迁移 Playbook

English mirror: `docs-release/guides/migration-playbook.en-US.md`

这份 playbook 写给目标项目里的 agent。目标不是把历史文档全部机械改写，而是让旧项目逐步进入 v1.0 的可检查合同。

如果要把迁移任务交给另一个 agent 执行，先给它读：

- `docs-release/guides/legacy-migration-agent-prompt.md`
- `docs-release/guides/legacy-migration-agent-prompt.zh-CN.md`
- `docs-release/guides/full-legacy-migration-subagent-strategy.md`
- `docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`

本文默认使用已安装的 `harness` 命令。执行 agent 必须先检查 `command -v harness`。
如果目标环境没有 `harness`，不得静默全局安装；先询问用户是否允许运行
`npm install -g coding-agent-harness`。用户明确同意后才能安装。用户不同意或未回复时，
用 `npx --yes coding-agent-harness <command>` 运行同一条 CLI。维护者调试当前源码
checkout 改动时，可以在仓库根目录把同一命令替换为
`node run-dist.mjs harness.mjs <command>`。

## 目标路径和 v2 结构

v2 的默认活跃目录是目标项目里的 `coding-agent-harness/`，入口文件是
`coding-agent-harness/harness.yaml`。但检查目标不要求这个目录一定在仓库根目录下使用固定名称。
如果项目已经把 Harness 状态放在自定义目录，例如
`.project-control/harness-state/`，需要在该目录的 `harness.yaml` 中声明：

```yaml
structure:
  harnessRoot: .project-control/harness-state
  planningRoot: .project-control/harness-state/planning
  tasksRoot: .project-control/harness-state/planning/tasks
  governanceRoot: .project-control/harness-state/governance
  generatedRoot: .project-control/harness-state/governance/generated
```

之后可以从项目根运行：

```bash
harness status --json /path/to/project
harness check --profile target-project /path/to/project
```

也可以直接指向 Harness 根目录：

```bash
harness status --json /path/to/project/.project-control/harness-state
```

如果一个项目下存在多个 `harness.yaml`，不要让 agent 猜；必须把目标 Harness 根目录作为命令参数传入。

本文后续出现的 `docs/Harness-Ledger.md`、`docs/09-PLANNING/**`、
`docs/10-WALKTHROUGH/**`、`docs/11-REFERENCE/**`、`03-ARCHITECTURE`、
`04-DEVELOPMENT` 和 `06-INTEGRATIONS` 都是旧项目输入路径。它们表示需要读取或迁移的历史证据，
不是 v2 active runtime 布局。v2 目标位置是已声明的 Harness 根目录，通常是
`coding-agent-harness/`，生成视图位于 `coding-agent-harness/governance/generated/`。

## 迁移原则

- 先保护历史，再补新合同。不要覆盖 `AGENTS.md`、`CLAUDE.md`、历史 task、walkthrough、SSoT 或 ledger。
- 先迁移活跃任务，再处理历史任务。关闭很久的任务可以继续作为 legacy evidence。
- 先声明真实 capability，再补对应 reference。不要因为模板存在就声明能力已采用。
- 普通检查用于发现迁移 backlog；`--strict` 是最终 cutover gate。
- 单线旧项目要先识别工程组织形态，再决定是否升级为 `module-parallel`。
- 区分 baseline adoption 和 full readable cutover。baseline 可以保留历史 residual；full cutover 必须让 dashboard 和 CLI 都归零。
- 迁移 agent 必须先只读扫描、主动推荐迁移深度并询问用户；用户确认前不要写文件，也不要要求用户预先理解这些模式。

## 先扫描、再推荐、再确认

目标项目里的 agent 拿到迁移 prompt 后，第一步不是补文件，而是做只读诊断：

```bash
git -C /path/to/project status --short --branch
harness status --json /path/to/project
harness migrate-plan --json --limit 1000 /path/to/project
harness migrate-structure --plan --json /path/to/project
```

然后 agent 必须给用户一份迁移计划，并主动推荐迁移深度：

| 模式 | 何时推荐 | 写入策略 |
| --- | --- | --- |
| `baseline-preserve` | 用户只需要先安全接入 v1.0，历史任务很多且暂不追求 strict-clean。 | 不重写历史任务；只补 registry、dashboard、活跃任务、必要 metadata 和 warning 队列。 |
| `status-aware-rewrite` | 用户要迁移真实当前工作，且希望根据任务状态决定重写深度。 | 根据 SSoT / Ledger / progress / review / git 证据重写当前、重新打开、当前证据任务；历史任务写可读索引或 residual。 |
| `full-semantic-rewrite` | 用户要证明旧项目整体能重构成 v1.0 可读项目。 | 每个任务都重写为 v1.0 可读合同；已有 brief、execution strategy、visual map 如果不够清楚也要重写。 |

迁移计划必须说明任务总数、brief 覆盖、canonical `visual_map.md` 覆盖、warning/action/residual 计数、strict 状态、dirty 文件解释、推荐原因、预计写入范围、预计 token/时间成本、是否需要 subagent，以及需要用户确认的问题。

用户确认前，agent 只能报告计划，不能运行会写文件的迁移命令。用户确认后，才进入下面的标准流程。

## 标准流程

1. 读取现状、判断语言，并确认迁移深度：

```bash
harness status --json /path/to/project
harness migrate-plan --json /path/to/project
```

如果项目中英文混杂，不要让 agent 猜模板语言。必须显式选择：

- 中文用户、中文项目上下文、中文对外文档：`--locale zh-CN`
- 英文团队、英文对外文档：`--locale en-US`

Agent 必须记录具体判断证据，例如 `AGENTS.md`、`CLAUDE.md`、`README.md`、`docs/Harness-Ledger.md`、活跃任务文档或产品对外文档。信号冲突时停止，让用户选择语言。

如果本轮还没有用户确认的迁移深度，停在这里，不要写文件。

2. 运行迁移轨道：

先把旧 `docs/` 布局迁到 v2 manifest 布局。`--plan` 是只读预览；用户确认后才运行
`--apply`。默认迁移目标是 `coding-agent-harness/`，并会把旧 `docs/` 归档到
`coding-agent-harness/governance/archive/legacy-docs/`。旧版本遗留的
`planning/**/_task-template` 和 `planning/**/_module-template` 是 npm 包内模板的生成副本，
迁移时会从目标项目中移除。新模块模板来自 npm 包内的 `templates/modules/**`；
目标项目只保留真实模块文档和 YAML 注册数据：

```bash
harness migrate-structure --plan --json /path/to/project
harness migrate-structure --apply --json /path/to/project
harness check --profile target-project /path/to/project
```

目录迁移通过后，再运行 session 迁移轨道：

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

4. 基于验证通过的 session 创建迁移任务：

```bash
harness new-task \
  --budget complex \
  --preset legacy-migration \
  --from-session /tmp/cah-migration-project/session.json \
  /path/to/project
```

`legacy-migration` preset 任务是后续迁移工作的可审计交接点。它会记录 session、证据包、preset audit、write scope 和 migration follow-up queue；不会自动重写历史任务正文。

如果后续继续清理 warning 或补活跃任务合同，第一次 session 只能作为 baseline。最终交付前要重新运行 `migrate-run` 生成新 session/dashboard，或者明确列出 baseline session 与最终检查证据的差异。

`migrate-verify` 通过不等于 full migration complete。完整迁移还必须满足：

- `migrate-plan` 是 `declared-capability` 或 `v2-manifest`。这些 mode 只表示项目有资格进入
  full-cutover 验证，不能单独证明 full migration complete。
- `warnings=0`、`taskActions=0`、`reviewSchemaGaps=0`、`legacyReferenceGaps=0`、`legacyResiduals=0`、`recommendedCapabilities=[]`。
- normal 和 strict check 都通过。
- dashboard status 里 `summary.briefCoverage.ready == total` 且 `missing == 0`。
- 任务图表 canonical 文件是 `visual_map.md`。旧 `visual_roadmap.md` 只能作为重写输入，不算 full cutover 覆盖。
- 任务索引页面能打开并显示全量任务。
- 至少一轮 subagent 对抗审查 PASS。

4. 按计划继续人工/agent 清理：

- `MP-01`：确认兼容层和 locale，保证历史文档没有被覆盖。
- `MP-02`：选择 capability，只声明项目事实已经支持的能力。
- `MP-03`：给活跃任务补 `brief.md`、`execution_strategy.md`、`visual_map.md`。
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

这里有三个不同目标：

- Baseline safe-adoption：允许关闭很久的任务继续作为 legacy evidence。
- Status-aware rewrite：根据 SSoT / Ledger / progress / review / git 证据判断每个任务是当前、重开、已关闭、有残余还是被后续任务覆盖；只重写真正需要迁移的任务表面。
- Full semantic rewrite：每个任务都必须能被 dashboard 给人读懂，因此每个任务都需要 standalone `brief.md`，并且 dashboard brief coverage 必须是 `total/total`。

不要把 baseline 策略误用成 full cutover 策略，也不要在没有用户确认时默认全量重写。

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

Baseline 模式下，只有 `current-active` 或 “仍被 SSoT 引用为当前证据”的任务，才补 `brief.md`、`execution_strategy.md`、`visual_map.md`。其他历史任务要写 residual 路由，不要批量补模板制造假完成。

Status-aware rewrite 模式下，已有 `brief.md`、`execution_strategy.md`、`visual_map.md` 不是自动保留；如果证据显示它们只是旧模板、解析残留、语言错误或不能让人判断当前状态，就重写。历史任务可以只写可读索引卡或 residual，但这个判断必须有证据。

全局表和模块索引迁移不是人工重填。新版本只把任务生命周期汇总生成到 `Harness-Ledger.md`；旧的 `Feature-SSoT.md` 和 `Private-Feature-SSoT.md` 是 legacy 生命周期投影，切换时应先归档，不再重建。模块注册数据写在根 `harness.yaml` 的 `modules.items`，`Module-Registry.md` 是生成视图。模块根目录默认只维护 `brief.md` 和 `module_plan.md`；`execution_strategy.md`、`visual_map.md`、`review.md`、`walkthrough.md` 属于具体任务目录。人看当前状态应优先看 Dashboard，Agent 需要快速定位时用 `task-list` / `task-index` 查询。旧项目切换前，先把旧生命周期表归档，再用生成器从任务文件重建当前索引：

```bash
harness governance rebuild --dry-run --archive /path/to/project
harness governance rebuild --archive --apply /path/to/project
harness task-list --json --search "keyword" /path/to/project
```

归档目录会保留旧生命周期表快照。确认 Dashboard、`task-list` / `task-index` 查询和新生成 Ledger 都能反映当前任务后，再由项目 owner 决定是否删除旧归档；迁移 agent 不应直接删除历史表证据。Delivery、Regression、Cadence、Closeout、Module Registry 等非任务生命周期治理表不是本步骤的删除对象，除非后续版本提供等价 scanner 和生成器。

Full semantic rewrite 模式下，所有任务都需要 standalone `brief.md`，但不能写空模板。历史任务的 brief 应该是“可读索引卡”：说明任务目标、第一眼应该看什么、证据来自哪里、状态判断和 residual。`visual_map.md` 是图表集合，不是路线图模板；只画能提高理解速度的 phase flow、sequence、architecture、data-flow、state、topology 或 decision map，不能为了过检查生成空图。

如果旧项目属于微服务、多仓、前后端分仓或依赖外部系统，迁移计划还必须询问用户是否有外部资料。不要把外部团队给的几十份文档直接迁入 `03/04/06`。先按 `external-source-intake-standard.md` 建立 `docs/04-DEVELOPMENT/external-source-packs/<source-key>/`，完成 source index 和 digest，再把稳定事实投影到 service profile、external context 和 integration contract。

| 旧状态 | 处理方式 |
| --- | --- |
| 已关闭、只作历史证据 | Baseline 可保持 legacy；full cutover 仍需补可读 `brief.md`，但不伪造当前执行状态。 |
| 活跃任务但只有 `task_plan.md` | 添加 `brief.md`、`execution_strategy.md`、`visual_map.md`，用 `task-log` 记录迁移证据。 |
| 重新打开的旧任务 | 当作活跃任务迁移；在用户确认的 rewrite 模式下，可以重写旧 v1 表面来承接当前事实。 |
| 有 review 但不是当前门禁 | 保留原样，迁移计划中记录为历史 review gap。 |
| 当前 release-blocking review | 升级到 v1 `review.md` schema，补 Evidence Checked 和 Final Confidence Basis。 |

## 从单线任务到模块并行

不要把大量历史 task 自动变成模块。只有满足这些条件才采用 `module-parallel`：

- 项目存在两个以上可独立演进的产品或工程域。
- 每个模块有 owner、write scope、依赖关系和集成规则。
- 共享文件由 coordinator 维护，worker 通过 handoff 请求更新。
- 根 `harness.yaml` 的 `modules.items` 能作为注册表持续维护，生成的 `Module-Registry.md` 只作为视图阅读。
- 每个模块根目录只需要真实的 `brief.md` 和 `module_plan.md`；不要为了启用模块而批量创建模块级任务合同文件。

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

需要人工确认、审查完成标记或其他网页操作时，使用动态本地入口：

```bash
harness dev /path/to/project
```

静态 dashboard 仍用于 CI、迁移交付和离线证据快照；它不能承载 review confirm 之类的写入动作。

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
- Baseline 模式下，对缺少 brief 的历史任务不自动补模板；status-aware rewrite 模式下只改写有证据支持的当前/重开/当前证据任务；full semantic rewrite 模式下，按日期段或模块分配 subagent 补齐或重写所有需要可读化的 brief。
- 对 warning 队列按 category/type 分批修，修完一类再重新生成 dashboard。

Full cutover 的 dashboard smoke 必须验证：

- 第一屏 `Brief 覆盖` 是 `total/total`。
- `警告分诊` 是 `0 警告`。
- `活跃任务合同` 是 `0 项`。
- `严格切换` 是 `0 项`。
- 任务索引显示 `total / total`。
- `dashboard/data/status.json` 包含 `summary.briefCoverage`，且 `missing=0`。
- 每个 task 有 `briefPath` 且 `briefSource=standalone`。

如果 dashboard 数据缺少这些字段，先修 harness 数据契约或重新生成 dashboard，不要让审查 agent 猜字段语义。

## Subagent 编排

完整迁移不要让一个 agent 从头改到尾。推荐至少拆成这些 worker：

| Worker | 写入范围 | 目标 |
| --- | --- | --- |
| Task Contract Worker | `docs/09-PLANNING/TASKS/**/brief.md`、`execution_strategy.md`、`visual_map.md`、同任务 `progress.md` 追加 | 清掉 task contract 缺口；在已确认 rewrite 模式下重写薄弱旧表面。 |
| Review/Capability Worker | `.harness-capabilities.json`、当前 strict review 文件 | 声明真实 capability，修 release-blocking review schema。 |
| Legacy Governance Worker | `AGENTS.md`、PR template、`docs/11-REFERENCE/**`、Ledger、Closeout SSoT、lesson candidates/detail docs、walkthrough template | 清掉 legacy checker 聚合错误。 |
| Brief Coverage Workers | 按日期段或模块划分，写缺失或被点名薄弱的 `brief.md` | 把 dashboard brief coverage 变成 100%，并移除空模板。 |
| Quality Repair Worker | 只写 reviewer 点名的问题文件 | 修掉自动解析痕迹、空模板、语言不一致和证据薄弱。 |

所有 worker prompt 必须写清：

- 目标路径。
- 唯一允许写入范围。
- 不能提交 git。
- 不能在未授权 rewrite scope 下覆盖已有 brief，也不能覆盖其他 worker 的改动。
- 必须从本任务 `task_plan.md` / `progress.md` / `findings.md` / `review.md` / walkthrough / SSoT 提炼。
- 结束时必须报告修改数量、残余、验证命令。

Capability registry 必须由一个 worker 顺序写，不能多个 worker 并发运行 `add-capability`。

## 对抗审查

完整迁移至少需要三类只读审查：

1. CLI/session reviewer：复跑 `migrate-plan`、normal、strict、`migrate-verify`，检查 final session/dashboard 数据是否一致。
2. Brief quality reviewer：全量扫描缺失 brief，抽样多日期、多模块 brief，找空模板、解析失败文本、无证据来源、语言不一致。
3. Boundary reviewer：确认公开源仓库、私有 harness、目标旧项目的边界和 git 状态，没有 staged 文件，没有私有内容污染公开仓库。

任一 reviewer 给 FAIL，都要先当成有效信号处理。修复后重新生成 final session/dashboard，并让失败项复审通过。

## 模块分类决策

模块分类有三个层级，不能跳级：

1. `explicit module`：任务已经在 v2 `planning/modules/<module>/tasks/` 下，或根 `harness.yaml` 的 `modules.items` 已注册该模块。
2. `inferred module`：dashboard 根据任务路径、标题、ID 关键字临时分组，仅用于浏览和分诊，不代表项目已经采用 `module-parallel`。
3. `legacy-unclassified`：无法稳定归类的历史任务，保持历史状态，不要批量改写。

注册模块前，必须先输出分类摘要：

- 候选模块名。
- 为什么这是产品/工程域，而不是文件夹或时间段。
- owner / write scope / shared-file coordinator 规则。
- 哪些任务仍保持 `legacy-unclassified`。

如果这些事实不成立，只使用 dashboard 的 inferred grouping 辅助清理，不声明 `module-parallel`。
