# 完整旧 Harness 迁移 Subagent 策略

English source: `docs-release/guides/full-legacy-migration-subagent-strategy.md`

这份指南用于把大型 pre-v1 Harness 项目完整迁移到可读的 v1 cutover。

当用户需要证明“另一个 agent 能迁移旧项目”，而不只是拿到 baseline safe-adoption 报告时，使用这份指南。

## 完成定义

只有全部满足时，legacy migration 才算完成：

- `migrate-plan` 报告 `mode=declared-capability`。
- `migrate-plan.summary.warnings=0`。
- `taskActions=0`、`reviewSchemaGaps=0`、`legacyReferenceGaps=0`、`legacyResiduals=0`。
- `recommendedCapabilities=[]`。
- `harness check --profile target-project` 通过。
- `harness check --profile target-project --strict` 通过。
- 在全新 final session 上 `migrate-verify <session.json>` 通过。
- Dashboard 能作为 HTML 打开，并且任务索引可用。
- Dashboard status data 报告 `summary.briefCoverage.ready == total` 且 `missing == 0`。
- 每个 task 都有可读 standalone `brief.md`，不能只依赖 legacy `task_plan.md` fallback。
- 所有 final adversarial reviews 在修复后通过。

任何一项不满足，只能报告 `baseline` 或 `strict deferred`，不能说 complete。

## 迁移深度由 Agent 推荐

完整迁移不是一上来就让用户填模式。目标项目里的 agent 必须先只读扫描，再根据证据推荐迁移深度，并等用户确认后才写文件。

| 模式 | 目的 | 是否接受 residual | 完成声明 |
| --- | --- | --- | --- |
| `baseline-preserve` | 保留历史、创建 registry、生成第一版 dashboard、暴露 warning 队列。 | 是 | "usable baseline" |
| `status-aware-rewrite` | 根据 SSoT / Ledger / progress / review / git 证据，重写当前、重开、当前证据任务；历史任务写可读索引或 residual。 | 可以，但必须解释。 | "migration usable" 或进入 full cutover |
| `full-semantic-rewrite` | 证明旧项目整体可以重构成 v1 可读项目，所有任务达到 dashboard 可读，CLI strict-clean。 | 否，除非用户明确接受。 | "migration complete" |

Baseline 可以保留历史任务的 legacy 格式。Status-aware rewrite 可以改写已有 brief / execution strategy / visual map，但必须由证据触发。Full semantic rewrite 不能留下 missing briefs、未解决 warnings 或 strict failures。

## Coordinator 合同

Coordinator 负责编排和验证。Subagent 负责有边界的迁移切片。

Coordinator 规则：

- 不要手工修目标文件，除非 subagent 被阻塞且用户接受 coordinator intervention。
- 给每个 worker disjoint write scope。
- 告诉每个 worker：其他 agent 同时活跃，不得 revert 或覆盖其他人的工作。
- 执行用 subagent，独立对抗审查也用 subagent。
- Subagent 报告只是 claim，直到 coordinator 重新跑检查。
- 所有 cleanup 后重新生成 final `migrate-run` session。baseline session 不是 final evidence。
- 除非用户要求，目标 git index 保持 unstaged。
- 首轮只能做只读扫描和推荐，不要在用户确认迁移深度前启动写入 worker。

## Phase 0: 只读扫描与用户确认

运行：

```bash
git -C /path/to/project status --short --branch
harness status --json /path/to/project > /tmp/cah-baseline-status.json
harness migrate-plan --json --limit 1000 /path/to/project > /tmp/cah-baseline-plan.json
```

明确决定 locale：

- 中文用户、中文运行文档或中文项目上下文使用 `zh-CN`。
- 英文团队或英文对外项目文档使用 `en-US`。
- 中英信号冲突时停止并询问用户。

把扫描结果整理成迁移计划，至少包含任务总数、brief 覆盖、canonical `visual_map.md` 覆盖、warning/action/residual 计数、strict 状态、dirty 文件解释、推荐迁移模式、预计写入范围、预计 token/时间成本、subagent 拆分建议和需要用户确认的问题。

用户确认迁移深度后，运行 baseline rail：

```bash
harness migrate-run \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-baseline \
  --out-dir /tmp/cah-migration-baseline/dashboard \
  /path/to/project
```

如果目标仓库已经 dirty，只有记录 dirty 文件为什么属于本次迁移后，才使用 `--allow-dirty`。

然后运行：

```bash
harness migrate-verify /tmp/cah-migration-baseline/session.json
```

这只能证明迁移轨道能跑通。除非所有完成门禁已经归零，否则不能证明 full migration。

## Phase 1: Work Queue

读取：

- `/tmp/cah-baseline-plan.json`
- `/tmp/cah-migration-baseline/session.json`
- `docs/Harness-Ledger.md`
- `docs/10-WALKTHROUGH/Closeout-SSoT.md`
- `docs/05-TEST-QA/Regression-SSoT.md`
- 当前 task 的 `progress.md`、`review.md`、`findings.md`
- 任务状态不清楚时读取 git history

按这个顺序建立队列：

1. Capability registry 和 locale。
2. Task contracts：`brief.md`、`execution_strategy.md`、`visual_map.md`。
3. Review schema。
4. Legacy governance 和 reference checker failures。
5. 每个 task 的 dashboard readability briefs。
6. 弱 brief 或 stale dashboard data 的质量修复。

任何队列还有 open item 时，不进入 final verification。

## Phase 2: 执行 Subagents

使用小而有边界的 worker role。写入范围不重叠时可以顺序或并行。

| Worker | 写入范围 | 目标 |
| --- | --- | --- |
| Task Contract Worker | `docs/09-PLANNING/TASKS/**/brief.md`、`execution_strategy.md`、`visual_map.md`、同任务 `progress.md` 可选追加 | 清掉 task contract failures；在已确认 rewrite 模式下重写薄弱旧表面。 |
| Review/Capability Worker | `.harness-capabilities.json`、当前 strict review 文件 | 声明真实能力并规范 release-blocking review schema。 |
| Legacy Governance Worker | `AGENTS.md`、PR template 或 residual、`docs/11-REFERENCE/**`、Ledger、Closeout SSoT、Lessons SSoT、walkthrough template | 清掉 legacy checker failures。 |
| Brief Coverage Workers | 按 task 日期段或模块拆分，写缺失或被点名薄弱的 `brief.md` | 达到 dashboard brief coverage 100%，并移除空模板。 |
| Quality Repair Worker | 只写 reviewer 点名的文件 | 移除弱 brief、自动解析痕迹和 stale dashboard assumptions。 |

Worker prompt 必须包含：

- 准确目标路径。
- 准确允许写入范围。
- 明确不要提交 git。
- 明确不要覆盖已有用户改动或其他 agent 改动。
- 要求本地证据，不要通用模板；已有文件也只有在用户确认的 rewrite 模式和证据支持下才能改写。
- 要求 final self-check command 或 scan。
- 要求列出 changed path summary 和 residuals。

Brief worker prompt 示例：

```text
Your write scope is only docs/09-PLANNING/TASKS/2026-03-11* through 2026-03-31*/brief.md.
Only create missing brief.md unless the coordinator explicitly assigned user-confirmed rewrite scope. Do not edit progress.md, task_plan.md, review.md, execution_strategy.md, or visual_map.md unless they are in your assigned write scope.
Every brief must be Chinese-first if locale is zh-CN and must cite this task's task_plan.md/progress.md/findings.md/review evidence.
Do not leave parser-failure phrases such as "unknown", "could not parse", "若干", "未能解析", "未提供 Current Focus", or "无明确 Roadmap Binding".
```

## Phase 3: Capability Registry

Full cutover 需要 declared-capability mode。

顺序添加 capability。不要并发对同一个 target registry 运行 `add-capability`。

```bash
harness add-capability safe-adoption --locale zh-CN /path/to/project
harness add-capability dashboard --locale zh-CN /path/to/project
harness add-capability long-running-task --locale zh-CN /path/to/project
harness add-capability adversarial-review --locale zh-CN /path/to/project
```

只有项目事实支持时，才声明 optional capabilities。如果 legacy artifacts 证明该能力存在，且 strict migration 采用了对应标准，才声明。

验证：

```bash
harness migrate-plan --json --limit 1000 /path/to/project
```

预期：

- `mode=declared-capability`
- `recommendedCapabilities=[]`

## Phase 4: Task Contracts

每个需要在 dashboard 中可读的任务：

- `brief.md` 回答任务是什么、为什么重要、人第一眼看什么、当前状态、风险、残余和证据来源。
- `execution_strategy.md` 说明 agent 如何恢复或验证任务。
- `visual_map.md` 是图表集合：只放能帮助人理解任务的 phase flow、sequence、architecture、data-flow、state、topology 或 decision map。不是所有任务都要画满所有图，也不能生成空图。

Full readable cutover 要求每个 task 都有 standalone `brief.md`。这比 baseline safe-adoption 严格。

Brief 最小结构：

```markdown
# Brief

## Task Goal

## First Human Read

## Execution and Evidence Flow

## Current Status Judgment

## Risks and Residuals

## Evidence Sources
```

`zh-CN` 使用中文标题：

```markdown
# Brief

## 任务目标

## 迁移后的第一眼

## 执行/证据流

## 当前状态判断

## 风险与残余

## 证据来源
```

不可接受内容：

- 空模板文本。
- `若干`、`未能解析`、`unknown`、`not parsed` 等解析失败文本。
- 没有证据的完成声明。
- 不引用本地文件的摘要。
- 中文迁移里出现英文 stub headings。

## Phase 5: Legacy Governance

Task/review cleanup 后，strict cutover 仍可能因为旧 checker 要求 governance surfaces 而失败。

修复或路由：

- `AGENTS.md` 指向所有已采用 standards 和 SSoTs。
- `repo-governance-standard.md` 包含 repo platform profile、PR policy 和 branch protection。
- `delivery-operating-model-standard.md` 定义 operating model profile、agent visibility 和 delivery SSoT。
- PR template 存在，或有 explicit blocked-with-owner residual。
- `Harness-Ledger.md` 包含 repo governance / CI-CD 和 Lessons Check 列。
- `Closeout-SSoT.md` 包含 walkthrough、Lessons Check 和 closeout status。
- `Lessons-SSoT.md` 包含 ID、status 和 detail doc 列。
- `_walkthrough-template.md` 包含 Lessons Reflection。

不要覆盖业务事实。尽量 merge 缺失列，或追加 migration section。

## Phase 6: Dashboard Smoke

所有修复后生成全新 final dashboard：

```bash
rm -rf /tmp/cah-migration-final
harness migrate-run \
  --allow-dirty \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-final \
  --out-dir /tmp/cah-migration-final/dashboard \
  /path/to/project
```

然后验证：

```bash
harness migrate-verify /tmp/cah-migration-final/session.json
```

`file://` 无法打开时用本地服务：

```bash
cd /tmp/cah-migration-final/dashboard
python3 -m http.server 55983 --bind 127.0.0.1
```

Dashboard smoke 必须检查：

- 第一屏显示 status passed。
- Brief coverage 是 `total/total`。
- Warning count 是 0。
- Strict cutover count 是 0。
- Task index 能打开。
- Task index 显示 `total / total`。
- Search、status filter 和 grouping controls 能渲染。
- 至少一个 task detail 能打开。

Data smoke：

```bash
node -e '
const fs = require("fs");
const status = JSON.parse(fs.readFileSync("/tmp/cah-migration-final/dashboard/data/status.json", "utf8"));
console.log(status.summary.briefCoverage);
console.log(status.tasks.filter((task) => task.briefSource !== "standalone" || !task.briefPath).slice(0, 5));
'
```

预期：

- `ready == total`
- `missing == 0`
- 没有 task 缺 `briefPath`

## Phase 7: Adversarial Review

Coordinator 认为迁移完成后，至少跑三条独立 review lanes。

| Reviewer | 检查 | 失败例子 |
| --- | --- | --- |
| CLI/session reviewer | `migrate-plan`、normal、strict、`migrate-verify`、session fields、dashboard data。 | `legacy-compat`、stale session、strict deferred、无 brief coverage summary。 |
| Brief quality reviewer | 缺失 brief 扫描，跨时间段/模块抽样 brief 质量。 | 空模板、parser-failure text、无 evidence sources、语言错误。 |
| Boundary reviewer | 源仓 cleanliness、private/public boundary、target dirty whitelist、staged files。 | private docs 被 stage 到公开仓、target 有 staged files、意外 target paths。 |
| External source reviewer（如适用） | 外部资料是否进入 source pack，digest 是否投影到 `03/04/06`，敏感资料是否未入仓。 | 原始外部文档直接堆进执行目录、digest 没有 projection、疑似密钥或客户数据入仓。 |

任何 reviewer 说 FAIL：

1. 先当成有效，除非有证据推翻。
2. 修目标文件或 harness data contract。
3. 重新生成 final session 和 dashboard。
4. 重新跑失败 review 和 coordinator full smoke。

不要带着已知 FAIL 结束。

## Final Report Template

报告：

- Target path。
- Final dashboard URL/path。
- Capability registry。
- `migrate-plan` zero counts。
- normal 和 strict check 结果。
- `migrate-verify` 结果。
- Dashboard brief coverage。
- 使用过的 subagent worker roles。
- Final adversarial review outcomes。
- Target git status：staged count 和 dirty path categories。
- accepted residuals；如果没有，写 none。

除非所有 Definition of Done gates 都通过，不要说 "complete"。
