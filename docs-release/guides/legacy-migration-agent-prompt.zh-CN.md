# 旧 Harness 迁移 Agent Prompt

English source: `docs-release/guides/legacy-migration-agent-prompt.md`

当一个 agent 需要把旧版 Harness 项目迁移到 v1.0 document kernel，同时不破坏历史证据时，使用这份 prompt。

## 使命

你正在把一个 pre-v1 Harness 项目迁移到 v1.0。

你的工作不是重写整个 `docs/` 树。你的工作是保留历史、安装 v1.0 兼容层、识别活跃工作，并让当前工作能在 dashboard 里被看懂。

如果用户要求证明旧项目已经完整迁移，还要同时遵循：

- `docs-release/guides/full-legacy-migration-subagent-strategy.md`
- `docs-release/guides/full-legacy-migration-subagent-strategy.zh-CN.md`

本 prompt 足够完成 baseline safe-adoption。完整可读切换有更严格门禁。

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

## Step 1: Baseline

本 prompt 假设目标 agent 已经安装 `harness` 命令。如果你在源码仓调试，把 `harness` 替换为 `node scripts/harness.mjs`。

运行：

```bash
git -C /path/to/project status --short --branch
harness migrate-plan --json --limit 50 /path/to/project > /tmp/harness-migrate-plan.json
```

读迁移计划后再编辑任何文件。

写文件前：

- 解释 `git status` 里的每个 dirty 或 untracked 路径。
- 保留 `/tmp/harness-migrate-plan.json` 作为本轮 baseline 快照。
- 如果 dirty 文件无关且 owner 不清楚，停止。
- 明确选择 locale。项目中英文混杂时按下面规则选择：
  - 中文用户、中文项目运行上下文或中文对外文档使用 `--locale zh-CN`。
  - 英文团队或英文对外文档使用 `--locale en-US`。
- 从入口文件或产品文档记录具体语言证据，例如 `AGENTS.md`、`CLAUDE.md`、`README.md`、`docs/Harness-Ledger.md` 和活跃任务文档。信号冲突时停止并让用户决定语言。

运行迁移轨道：

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
4. 只修 `current-active` 和 “仍被 SSoT 引用为当前证据的 unknown-history”。
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
- `execution_strategy.md` 和 `visual_map.md` 主要用于 active/current tasks，除非 strict check 明确要求。
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
