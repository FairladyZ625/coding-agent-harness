# 旧 Harness 迁移 Agent Prompt

English source: `docs-release/guides/legacy-migration-agent-prompt.md`

当一个 agent 需要把旧版 Harness 项目迁移到 v1.0 document kernel，同时不破坏历史证据时，使用这份 prompt。

## 使命

你正在把一个 pre-v1 Harness 项目迁移到 v1.0。

你的默认工作不是重写整个 `docs/` 树。默认 baseline 是保留历史、安装 v1.0 兼容层、识别活跃工作，并让当前工作能在 dashboard 里被看懂。

但是迁移不是单一策略。Agent 必须先扫描目标项目，产出迁移计划、推荐迁移模式和需要用户确认的问题；用户确认前不要写文件。

如果用户要求证明旧项目已经完整迁移，还要同时遵循：

- `docs-release/guides/full-legacy-migration-subagent-strategy.md`
- `docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`

本 prompt 足够完成 baseline safe-adoption。完整可读切换有更严格门禁。

## 路径术语

本文出现的 `docs/Harness-Ledger.md`、`docs/09-PLANNING/**`、
`docs/10-WALKTHROUGH/**`、`docs/11-REFERENCE/**`、`03-ARCHITECTURE`、
`04-DEVELOPMENT` 或 `06-INTEGRATIONS` 都是旧项目输入路径。它们表示需要读取或迁移的历史证据，
不是 v2 active runtime 结构。新的 active state 应写入探测到的 Harness 根目录，
通常是 `coding-agent-harness/`。

## 不可违反的规则

1. 不要覆盖 `AGENTS.md`、`CLAUDE.md`、历史 task 文件夹、Harness Ledger、SSoT、review、walkthrough 或 evidence 文件。
2. 不要把几百个旧任务机械转换成 v1 任务。
3. baseline 模式下，把已关闭或状态未知的历史任务当作 legacy residual，除非用户明确说它们重新活跃。
4. 只有项目存在真实模块 owner、写入范围和集成规则时，才添加 `module-parallel`。任务数量大本身不是模块边界。
5. normal check 是迁移信号。只有活跃任务升级后才使用 `--strict` 作为最终门禁。
6. 先运行 `migrate-run`，再用 `migrate-verify` 证明输出。不要手写第一轮接入流程。
7. 每个迁移动作都必须能从生成的 `migrate-plan.json` 和 `session.json` 解释。
8. 除非用户明确要求，不要 stage、commit、push 或创建 PR。
9. Dashboard evidence 必须是实际存在的 HTML dashboard 路径。Markdown ledger 或 docs 页面不是 dashboard。
10. Full readable cutover 比 baseline 严格：需要 0 warning/action/residual、strict 通过、dashboard brief coverage 达到 `total/total`。
11. 写文件前必须完成“扫描 → 建议迁移模式 → 用户确认”三步；不能由 agent 静默选择只补齐或全量重写。
12. 状态轴必须分开。保留旧的 `task.state`，从 `status --json` 读取派生的 `lifecycleState`、`reviewStatus`、`closeoutStatus` 和 `stateConflicts`，不要在迁移脚本里重新发明含义。
13. 不要把 `done`、`completed`、`merged` 或 `shipped` 当成 `closed`。只有 Closeout SSoT 记录了收口证据，或明确记录 skipped-with-reason 收口路径，任务才算关闭。
14. 人工审查确认是 dashboard workbench 动作。日常本地 HTML 入口使用 `harness dev /path/to/project`。静态 dashboard 快照只读；CLI 可以支持自动化，但需要人工确认的迁移必须在本地 HTML workbench 中暴露操作入口。

## Step 0: 扫描后询问用户

先扫描，不写文件：

```bash
git -C /path/to/project status --short --branch
harness status --json /path/to/project > /tmp/harness-status.json
harness migrate-plan --json --limit 1000 /path/to/project > /tmp/harness-migrate-plan.json
harness migrate-structure --plan --json /path/to/project > /tmp/harness-migrate-structure-plan.json
```

然后给用户一个简短迁移计划，并主动提问。计划必须包含：

- 任务总数、brief 覆盖、canonical `visual_map.md` 覆盖。
- `migrate-plan.summary` 中的 warnings、taskActions、reviewSchemaGaps、legacyReferenceGaps、legacyResiduals、fullCutoverEligible。
- dirty / untracked 文件解释。
- v2 目录结构计划，包括活跃 Harness 根目录是默认的 `coding-agent-harness/`，还是自定义的 `structure.harnessRoot`。
- 是否属于微服务、多仓、前后端分仓或外部集成项目；如果是，是否已询问用户外部资料。
- 推荐迁移模式和原因。
- 预计改动范围、token / 时间成本、是否需要 subagent。
- 需要用户确认的问题。

Agent 应推荐下面三种模式之一，而不是让用户自己先懂这些概念：

| Mode | Agent 何时推荐 | 写入策略 |
| --- | --- | --- |
| `baseline-preserve` | 用户只需要先安全接入 v1.0，历史任务很多且暂不追求 strict-clean。 | 不重写历史任务；只补 registry、dashboard、活跃任务、必要 metadata 和 warning 队列。 |
| `status-aware-rewrite` | 用户要迁移真实当前工作，且希望根据任务状态决定重写深度。 | 根据 SSoT / Ledger / progress / review / git 证据重写当前、重新打开、当前证据任务；历史任务写可读索引或 residual。 |
| `full-semantic-rewrite` | 用户要证明旧项目整体能重构成 v1.0 可读项目。 | 每个任务都重写为 v1.0 可读合同；已有 brief、execution strategy、visual map 如果不够清楚也要重写。 |

提问格式示例：

```text
我建议使用 status-aware-rewrite，因为当前项目有 470+ 历史任务，但只有一部分仍是当前证据。
请确认：
1. 是否接受这个模式，还是要 baseline-preserve / full-semantic-rewrite？
2. 是否允许我改写已有 brief 和 visual_map，还是只补缺失文件？
3. 这个项目是否有外部架构文档、接口文档、流程图、会议纪要、链接或导出包需要一起整理？
4. 是否允许我启动 subagent 分日期段或模块迁移？
```

`visual_map.md` 是图表集合，不是必须画满所有图。可以画 phase flow、sequence、architecture、data-flow、state、topology、decision map；只有图能让人更快理解任务时才画。不能为了过 checker 生成空图或无意义图。

如果用户提供外部资料，先按 `docs/11-REFERENCE/external-source-intake-standard.md` 建立 `docs/04-DEVELOPMENT/external-source-packs/<source-key>/` 索引和 digest，再把稳定事实投影到 `03-ARCHITECTURE`、`04-DEVELOPMENT/external-context` 或 `06-INTEGRATIONS`。不要把外部资料原文直接塞进 `03/04/06`。

## Step 1: Baseline

先检查目标环境是否有 `harness` 命令。如果没有，不要静默全局安装。先询问用户是否允许运行 `npm install -g coding-agent-harness`。只有用户明确同意后才执行全局安装。用户不同意或未回复时，Harness CLI 都用 `npx --yes coding-agent-harness <command>` 临时执行。如果你在调试当前源码 checkout 改动，在仓库根目录把 `harness` 替换为 `node run-dist.mjs harness.mjs`。

用户确认迁移模式后再运行或复用：

```bash
git -C /path/to/project status --short --branch
harness migrate-plan --json --limit 50 /path/to/project > /tmp/harness-migrate-plan.json
```

读迁移计划并确认用户选择后再编辑任何文件。

写文件前：

- 解释 `git status` 里的每个 dirty 或 untracked 路径。
- 保留 `/tmp/harness-migrate-plan.json` 作为本轮 baseline 快照。
- 如果 dirty 文件无关且 owner 不清楚，停止。
- 明确选择 locale。项目中英文混杂时按下面规则选择：
  - 中文用户、中文项目运行上下文或中文对外文档使用 `--locale zh-CN`。
  - 英文团队或英文对外文档使用 `--locale en-US`。
- 从入口文件或产品文档记录具体语言证据，例如 `AGENTS.md`、`CLAUDE.md`、`README.md`、`docs/Harness-Ledger.md` 和活跃任务文档。信号冲突时停止并让用户决定语言。

先运行 v2 目录结构迁移，再运行迁移轨道：

```bash
harness migrate-structure --apply --json /path/to/project
harness check --profile target-project /path/to/project
```

然后创建 migration session：

```bash
harness migrate-run \
  --locale zh-CN \
  --session-dir /tmp/cah-migration-project \
  --out-dir /tmp/cah-migration-project/dashboard \
  /path/to/project
```

如果 `migrate-run` 报告目标仓库 dirty，停止并解释 dirty 文件。只有用户或仓库 owner 接受这些文件属于迁移上下文时，才使用 `--allow-dirty`。

命令会写出：

- `session.json`
- `report.md`
- `migrate-plan.json`
- `status-normal.json`
- `status-strict.json`
- `dashboard/index.html`

`migrate-run` 之后，先验证 session，再创建受控迁移任务：

```bash
harness migrate-verify /tmp/cah-migration-project/session.json

harness new-task \
  --budget complex \
  --preset legacy-migration \
  --from-session /tmp/cah-migration-project/session.json \
  /path/to/project
```

不要跳过 `legacy-migration` preset 任务。它会创建一个 Complex Task，把 session、证据包、preset manifest audit、write scope 和 migration follow-up queue 记录下来；它不会自动重写历史任务正文。如果 `harness new-task --preset legacy-migration` 失败，停止并报告迁移任务没有创建，不要只靠口头总结继续。

输出分类：

| Output | 含义 | 动作 |
| --- | --- | --- |
| `taskActions` | 活跃或重新打开的任务需要 v1 文件 | 谨慎升级 |
| `legacyResiduals` | 历史任务合同缺口 | 默认不重写 |
| `reviewActions` | review 缺 v1 schema | 只升级当前 release-blocking review |
| `legacyActions` | 缺旧 reference/governance 文件 | 只有明确采用该能力时才创建 |
| `recommendedCapabilities` | 候选能力 | 按项目事实评估 |

继续前选择完成模式：

| 模式 | 适用场景 | 最终声明 |
| --- | --- | --- |
| Baseline safe-adoption | 用户要第一轮安全迁移面和 warning 队列。 | "baseline usable" |
| Full readable cutover | 用户要证明另一个 agent 能把旧项目完整迁移。 | 所有门禁通过后才说 "migration complete" |

Full readable cutover 必须继续使用 subagent。不要让单个 agent 默默修完所有类别。

生成 dashboard 后，检查 bundle 里的 `adoption.warnings`。每条 warning 都应作为队列项，包含：

- `category`: 人类可读分组。
- `type`: 稳定问题类型。
- `scope`: task、module、review、reference、capability 或 project。
- `priority`: P1/P2/P3 清理顺序。
- `phase`: 建议迁移阶段。
- `fixability`: template、guided、human-evidence、decision 或 manual。
- `status`: open、done、deferred 或 accepted-residual。
- `confidence`: high、medium 或 low。
- `affected`: 主要受影响路径。
- `affectedPaths`: 需要检查或分派的文件。
- `requiredAction`: 下一步动作。
- `detail`: 原始 warning 细节。

每批 warning 都需要 owner/action/status。不要只因为“看过了”就标 done。

当 `status --json` 显示 `reviewStatus: blocked-open-findings`，先关闭或路由所有开放 P0/P1/P2 finding，再让人确认审查完成。当显示 `lifecycleState: closing`，不要宣布任务 closed，除非 Closeout SSoT、walkthrough 或 skipped-with-reason 证据已经存在。

## Step 2: 安装 Safe Adoption

这通常由 `migrate-run` 完成。只有调试轨道时才使用低层命令：

```bash
harness add-capability safe-adoption --locale zh-CN /path/to/project
harness add-capability dashboard --locale zh-CN /path/to/project
```

预期行为：

- 已存在文件显示 `skip-existing`。
- `.harness-capabilities.json` 声明 `core`、`safe-adoption` 和 `dashboard`。
- 历史任务内容不被覆盖。

如果已有项目文档被覆盖，停止。

## Step 3: 只升级活跃工作

编辑任务文件前，按顺序建立证据图：

1. 读取 `docs/Harness-Ledger.md`、`docs/10-WALKTHROUGH/Closeout-SSoT.md`、`docs/05-TEST-QA/Regression-SSoT.md` 和项目特有历史 regression SSoT。
2. 用任务的 `progress.md`、walkthrough 链接、regression 行和近期 git commit 交叉验证候选活跃任务。
3. 将每个任务分类为 `current-active`、`closed-with-evidence`、`closed-with-residual`、`superseded` 或 `unknown-history`。
4. Baseline 模式只修 `current-active` 和 “仍被 SSoT 引用为当前证据的 unknown-history”；已确认 rewrite 模式下，可以重写被证据判定为薄弱或过期的现有 v1 表面。
5. 对关闭的历史任务，在迁移报告里路由 residual，不要添加假的当前文件。

baseline triage 使用 subagent 时，分派证据工作，而不是分派列表整理：

- Reviewer A：检查 SSoT 和 ledger 行，判断完成状态。
- Reviewer B：检查任务 `progress.md` / walkthrough / review 证据。
- Reviewer C：检查 git history 和 regression 证据，判断任务是否真的完成。

每个被修复的任务都必须说明用什么证据判断它是 active 或 reopened。

对 `taskActions` 中每项添加或适配：

- `brief.md`
- `execution_strategy.md`
- `visual_map.md`

不要写通用 placeholder brief。有用的 `brief.md` 必须回答：

- 这个任务要达成什么？
- 执行流是什么？
- 人应该第一眼看什么？
- 当前阻塞或风险是什么？
- 哪个 SSoT、ledger、progress、walkthrough、regression、review 或 git 证据说明它仍是当前工作？

## Step 4: 保留历史 Backlog

如果项目有数百个旧 task 文件夹：

- 保持它们在 dashboard metadata 中可搜索。
- 保留旧的 `task_plan.md`、`progress.md` 和 review 证据。
- 不要给每个旧 task 都补 `brief.md`。
- 把数量和类别记录为 migration residual。
- 用 SSoT/ledger 证据判断完成度。不要只因为缺 v1 模板文件就推断“没完成”。

Full readable cutover 下，这条 baseline 规则会改变：

- 每个任务都必须有 standalone `brief.md`，让 dashboard 能被人读懂。
- 历史任务 brief 不能在无证据时声称正在执行。
- 把它们写成可读索引卡：任务目标、第一眼读什么、证据流、当前状态判断、风险/残余、证据来源。
- `execution_strategy.md` 和 `visual_map.md` 主要用于 active/current tasks 或被用户确认需要语义重写的任务；`visual_map.md` 只放有帮助的图，不为凑数画空图。
- 按日期范围、模块或迁移 bucket 拆给 subagent。

## Step 5: 判断是否真的有模块

只有同时满足下面条件，才创建 `Module-Registry.md` 和 module plans：

- 有两个以上稳定产品或工程域。
- 每个 domain 有清晰 owner 或 worker lane。
- 写入范围可以做到互不重叠。
- 共享文件由 coordinator 维护。
- 迁移后模块状态能持续维护。

不满足时，把项目保持为单线 `safe-adoption` Harness。

模块分类顺序：

1. 优先使用显式模块：已有 `docs/09-PLANNING/MODULES/<module>/` 或维护中的 `Module-Registry.md`。
2. dashboard inferred modules 只用于浏览、过滤和 cleanup routing，不代表 capability 声明。
3. 不确定历史保持 `legacy-unclassified`。

创建模块文件前，先产出分类摘要：

- 候选模块名。
- 为什么这是产品/工程域，而不是文件夹或时间段。
- owner 和不重叠写入范围。
- 共享文件 coordinator 规则。
- 仍保留 `legacy-unclassified` 的任务数量。

不要用日期 bucket、单纯路径或“让 dashboard 好看”来创建模块。

## Step 6: 生成 Dashboard

这通常由 `migrate-run --out-dir` 完成。如需独立调试 dashboard，同时生成两种形式：

```bash
harness dashboard --out /tmp/harness-dashboard.html /path/to/project
harness dashboard --out-dir /tmp/harness-dashboard /path/to/project
```

Dashboard 必须展示：

- 小项目显示 project flow，大型 legacy 项目显示聚合迁移跑道。
- 有活跃任务时显示 active task briefs。
- 历史任务可搜索、可分页。
- 把迁移关注项作为 warning workbench，而不是假的全绿状态。
- legacy residual 与当前 blocker 分开。

数百任务项目的使用方式：

1. 从聚合迁移跑道开始，不从 raw task graph 开始。
2. Task Index 按 migration bucket 分组，先区分 active/current work 和 historical records。
3. 只有 inferred 或 explicit modules 有意义时，才切 module grouping。
4. 用 warning filters 一类一类修。
5. 每批 cleanup 后重新生成 dashboard 并比较计数。

## Step 7: Verify

运行：

```bash
harness migrate-verify /tmp/cah-migration-project/session.json
harness check --profile target-project /path/to/project
harness check --profile target-project --strict /path/to/project
harness status --json /path/to/project
harness migrate-plan --json /path/to/project
git -C /path/to/project diff --cached --name-only
```

报告 migration usable 前，`migrate-verify` 必须通过。

如果第一轮 session 后又做了清理，重新运行 `migrate-run` 生成 session/dashboard，或者明确说明第一轮 session 只是 baseline 并提供新的 final check/dashboard 证据。不要把过期 baseline dashboard 当 final evidence。

Full readable cutover 额外验证：

```bash
node -e '
const fs = require("fs");
const status = JSON.parse(fs.readFileSync("/tmp/cah-migration-project/dashboard/data/status.json", "utf8"));
console.log(status.summary.briefCoverage);
console.log(status.tasks.filter((task) => task.briefSource !== "standalone" || !task.briefPath).slice(0, 5));
'
```

预期：

- `ready == total`
- `missing == 0`
- 没有 sample task 缺 `briefPath`

还要打开 dashboard task index，确认显示 `total / total`。

不要声称 strict migration complete，除非：

- 活跃任务有 v1 visibility files。
- 当前 release-blocking reviews 使用 v1 review schema。
- 剩余历史缺口有 owner/action/status 或 accepted residual reason。
- `--strict` 通过。

不要声称 full readable migration complete，除非：

- 上述 strict-complete 条件全部通过。
- `migrate-plan` 报告 `mode=declared-capability` 或 `mode=v2-manifest`，不能是 `legacy-compat`；该 mode 只表示候选资格。
- `migrate-plan` 有 0 warnings/actions/residuals。
- Dashboard brief coverage 是 100%。
- Final adversarial review lanes 通过：CLI/session、brief quality、boundary/git state。

如果用户接受剩余 residual，报告 `strict deferred`，不是 `strict complete`。

## 期望最终报告

返回：

- 创建和跳过的文件。
- Capability registry 状态。
- 完成的 active task actions 数量。
- 保留未动的 legacy residuals 数量。
- Dashboard 路径。
- `session.json` 和 `report.md` 路径。
- Normal check 结果。
- Strict check 结果，或仍 deferred 的明确原因。
- Dashboard brief coverage 结果。
- 使用的 subagent worker roles。
- Final adversarial review outcome。
