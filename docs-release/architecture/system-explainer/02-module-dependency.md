# 02 — 代码模块依赖关系

## Level 0 — 入口在哪

所有命令都从一个文件进来：

```mermaid
flowchart LR
  User["用户 / Agent\n$ harness <command> [target]"] -->|"解析参数 + 分发"| Entry["dist/harness.mjs\n唯一 CLI 入口"]
```

`harness.mjs` 做两件事：解析命令行参数，然后分发给对应的 command 模块或直接调用核心库。
它本身不包含任何业务逻辑。

---

## Level 1 — 命令如何分发

```mermaid
flowchart TD
  Entry["dist/harness.mjs"]

  Entry -->|"dashboard\ndev"| DashCmd["dist/commands/dashboard-command.mjs\nDashboard 生成 + 动态服务"]
  Entry -->|"migrate-plan\nmigrate-run\nmigrate-verify"| MigCmd["dist/commands/migration-command.mjs\n迁移三阶段命令"]
  Entry -->|"new-task / task-start\ntask-phase / task-review\ntask-complete / review-confirm\ntask-tombstone"| TaskCmd["dist/commands/task-command.mjs\n任务生命周期命令"]
  Entry -->|"preset catalog\npreset install\npreset uninstall"| PresetCmd["dist/commands/preset-command.mjs\nPreset 管理命令"]
  Entry -->|"check / status / init\ngovernance / lesson-promote\n..."| Core["dist/lib/harness-core.mjs\n（直接调用）"]
```

四个 command 模块各自负责一个领域，其余命令直接调用 `harness-core.mjs`。

**为什么这样分**：command 模块处理的是有复杂交互逻辑的命令（多步骤、需要读写多个文件、
有用户提示），而简单的查询类命令（`check`、`status`）直接调用核心库更简洁。

---

## Level 2 — harness-core.mjs 是什么

`harness-core.mjs` 是一个 **facade（门面）**，它自己不写任何业务逻辑，
只是把 `lib/` 下所有模块的导出重新 re-export 出来。

这样设计的好处：外部代码只需要 `import from "./lib/harness-core.mjs"` 就能拿到所有功能，
不需要知道具体在哪个子模块里。

```mermaid
flowchart TD
  Core["harness-core.mjs\n（纯 re-export facade）"]

  Core --> G1["① 核心工具层\ncore-shared + markdown-utils"]
  Core --> G2["② 任务扫描层\ntask-scanner + review-model + lesson-candidates"]
  Core --> G3["③ 检查与治理层\ncheck-profiles + governance-sync + governance-index"]
  Core --> G4["④ Dashboard 层\ndashboard-data + dashboard-writer + workbench"]
  Core --> G5["⑤ 任务生命周期层\ntask-lifecycle + review-gates + review-confirm"]
  Core --> G6["⑥ 迁移与 Preset 层\nmigration-planner + preset-registry + tombstone"]
```

下面逐层展开。

---

## Level 3 — 六个功能层详解

### ① 核心工具层

这两个模块是所有其他模块的基础，几乎每个模块都会 import 它们：

```mermaid
flowchart LR
  CoreShared["core-shared.mjs\n路径解析 / 常量枚举\n文件读写 / locale 处理\n模板渲染"]
  MarkdownUtils["markdown-utils.mjs\nMarkdown 表格提取\n行更新 / 列查找\n依赖列表拆分"]
```

`core-shared` 定义了所有允许的枚举值，是整个系统的"类型系统"：

| 枚举 | 允许值 |
| --- | --- |
| `allowedTaskStates` | `not_started / planned / in_progress / review / blocked / done` |
| `allowedTaskBudgets` | `simple / standard / complex` |
| `allowedPhaseStates` | `planned / in_progress / review / blocked / done / skipped` |
| `allowedCapabilities` | `core / module-parallel / subagent-worker / adversarial-review / ...` |

`markdown-utils` 提供了对 Markdown 表格的结构化操作——这是整个系统能从 Markdown 文件
派生状态的技术基础。

---

### ② 任务扫描层

负责读取 `coding-agent-harness/planning/tasks/` 下的所有文件，解析出结构化数据：

```mermaid
flowchart TD
  TaskScanner["task-scanner.mjs\n扫描所有任务目录\n解析状态 / 预算 / 阶段 / 元数据"]

  TaskScanner --> ReviewModel["task-review-model.mjs\n审查确认解析\n生命周期队列派生\ntombstone 解析"]
  TaskScanner --> LessonCandidates["task-lesson-candidates.mjs\nLesson candidate 状态解析\n决策完成判定"]

  ReviewModel --> CoreShared
  ReviewModel --> MarkdownUtils
  TaskScanner --> CoreShared
  TaskScanner --> MarkdownUtils
```

`task-review-model` 里有几个关键的**派生函数**——它们不读文件，
只根据已解析的数据计算出新的状态：

| 函数 | 输入 | 输出 |
| --- | --- | --- |
| `deriveLifecycleState()` | taskState + reviewStatus + tombstone | `lifecycleState`（队列分类） |
| `deriveTaskQueues()` | lifecycleState + materials + lessons | `taskQueues[]`（属于哪些队列） |
| `deriveReviewQueueState()` | findings + confirmation | `reviewQueueState` |
| `parseTaskTombstone()` | task_plan.md 内容 | 软删除 / 合并 / 被取代状态 |

这些派生函数是**纯函数**，相同输入永远得到相同输出，便于测试和调试。

---

### ③ 检查与治理层

负责验证合规性，以及维护全局索引的原子写入：

```mermaid
flowchart TD
  CheckProfiles["check-profiles.mjs\nbuildStatus() 编排 9 个验证器\n返回 failures + warnings + tasks"]

  CheckProfiles --> V1["validateCapabilities\n能力注册表一致性"]
  CheckProfiles --> V2["validateReviewSchema\nreview.md 结构"]
  CheckProfiles --> V3["validateVisualMaps\nvisual_map 合规"]
  CheckProfiles --> V4["validatePlanContracts\n任务合约标记"]
  CheckProfiles --> V5["validateTaskPresetContracts\nPreset 合约"]
  CheckProfiles --> V6["validateContextDocs\n上下文文档完整性"]
  CheckProfiles --> V7["validateGovernanceTableBoundaries\n表格边界"]
  CheckProfiles --> V8["validateSubagentAuthorization\nsubagent 授权"]
  CheckProfiles --> V9["validateTaskCompletionConsistency\n完成一致性"]

  CheckProfiles --> GitSummary["git-status-summary.mjs\nGit 状态摘要（dirty files 等）"]

  GovSync["governance-sync.mjs\n原子锁 + 行级更新 + Git commit\n（任务状态变更时自动调用）"]
  GovIndex["governance-index-generator.mjs\n重建全局索引表\n（手动触发）"]
  GovIndex --> GovSync
```

**重要区分**：`governance-sync` 和 `check-profiles` 没有依赖关系。
- `check-profiles`：只读，验证状态，不写文件
- `governance-sync`：只写，更新账本，不做验证

---

### ④ Dashboard 层

负责把扫描结果转换成 HTML Dashboard：

```mermaid
flowchart TD
  DashData["dashboard-data.mjs\nbuildDashboardBundle()\n收集 status + documents + tables + graph + adoption"]

  DashData --> CheckProfiles["check-profiles.mjs\n（调用 buildStatus）"]
  DashData --> DashWriter["dashboard-writer.mjs\n写入 HTML + JSON 文件\n（静态快照模式）"]
  DashData --> StatusRenderer["status-dashboard-renderer.mjs\n渲染状态摘要文本"]

  DashWorkbench["dashboard-workbench.mjs\nDev 动态服务\nHTTP server + 文件监听 + 自动刷新\n（harness dev 命令）"]
```

`DashWorkbench` 和 `DashData` / `DashWriter` 是**独立的**：
- `DashData` + `DashWriter`：生成静态快照（只读）
- `DashWorkbench`：启动本地 HTTP 服务，支持 Workbench 写操作

---

### ⑤ 任务生命周期层

负责执行所有任务状态转换命令：

```mermaid
flowchart TD
  TaskLifecycle["task-lifecycle.mjs\n生命周期命令实现\nnew-task / task-start / task-phase\ntask-review / task-complete"]

  TaskLifecycle --> ReviewGates["task-lifecycle/review-gates.mjs\n门禁验证逻辑\n（进入 review 前的检查）"]
  TaskLifecycle --> ReviewConfirm["task-lifecycle/review-confirm.mjs\n人工确认执行\n（review-confirm 命令）"]
  TaskLifecycle --> TextUtils["task-lifecycle/text-utils.mjs\n文本追加工具\n（向 Markdown 文件追加内容）"]
  TaskLifecycle --> GovSync["governance-sync.mjs\n状态变更时同步账本"]
  TaskLifecycle --> MigPreset["task-migration-preset.mjs\n迁移 preset 上下文注入"]

  ReviewConfirm --> GitGate["review-confirm-git-gate.mjs\nGit 原子提交门禁\n（写入人工确认块 + commit）"]
```

`review-confirm` 是整个生命周期层里最特殊的命令——它是唯一需要 Git 原子提交的操作，
也是唯一不能被 Agent 自动执行的操作（见 [01-system-overview.md](01-system-overview.md) 的设计决策）。

---

### ⑥ 迁移与 Preset 层

```mermaid
flowchart TD
  PresetReg["preset-registry.mjs\n读取 presets/ YAML\n验证包完整性\n分层发现（project / user / bundled）"]
  PresetEngine["preset-engine.mjs\n执行 preset entrypoints\n（template / script / check 类型）"]
  PresetAudit["preset-audit-contracts.mjs\n验证 preset 合约完整性"]
  PresetResource["preset-resource-contracts.mjs\n验证 preset 资源声明"]

  MigPlanner["migration-planner.mjs\n分析目标仓库差距\n生成迁移动作队列"]
  MigSupport["migration-support.mjs\nsession 管理 / locale 探测\nGit 状态检查 / full-cutover 验证"]
  Tombstone["task-tombstone-commands.mjs\n软删除 / 合并 / 重开命令"]

  LessonSed["task-lesson-sedimentation.mjs\nLesson 沉淀任务创建"]
  LessonMaint["lesson-maintenance.mjs\nLesson 库维护"]
  TaskIndex["task-index.mjs\n任务索引生成"]

  MigPlanner --> MigSupport
  PresetEngine --> PresetReg
```

---

## 一张完整的依赖总图（参考用）

如果你已经理解了上面的分层，这张图可以作为查阅索引：

```mermaid
flowchart TD
  Entry["harness.mjs"] --> DashCmd & MigCmd & TaskCmd & PresetCmd & Core["harness-core.mjs"]

  Core --> CoreShared & MarkdownUtils
  Core --> TaskScanner --> ReviewModel & LessonCandidates
  Core --> CheckProfiles --> GitSummary
  Core --> GovSync
  Core --> GovIndex --> GovSync
  Core --> DashData --> DashWriter & StatusRenderer
  Core --> DashWorkbench
  Core --> TaskLifecycle --> ReviewGates & ReviewConfirm & TextUtils & GovSync & MigPreset
  ReviewConfirm --> GitGate
  Core --> PresetReg
  Core --> PresetEngine --> PresetReg
  Core --> MigPlanner --> MigSupport
  Core --> Tombstone
  Core --> LessonSed
  Core --> LessonMaint
  Core --> TaskIndex
```

---

## Level 2 — 模块命名规律

理解命名规律可以帮你快速定位代码：

| 前缀 / 后缀 | 含义 | 例子 |
| --- | --- | --- |
| `task-` | 与任务相关 | `task-scanner`, `task-lifecycle`, `task-review-model` |
| `dashboard-` | 与 Dashboard 相关 | `dashboard-data`, `dashboard-writer`, `dashboard-workbench` |
| `governance-` | 与治理 / 账本相关 | `governance-sync`, `governance-index-generator` |
| `migration-` | 与迁移相关 | `migration-planner`, `migration-support` |
| `preset-` | 与 Preset 相关 | `preset-registry`, `preset-engine`, `preset-audit-contracts` |
| `check-` | 验证器 | `check-profiles`, `check-module-parallel` |
| `-command.mjs` | CLI 命令模块 | `task-command`, `dashboard-command` |
| `-utils.mjs` | 工具函数 | `markdown-utils`, `text-utils` |
| `-gates.mjs` | 门禁逻辑 | `review-gates`, `review-confirm-git-gate` |
