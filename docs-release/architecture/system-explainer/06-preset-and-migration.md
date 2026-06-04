# 06 — Preset 系统与迁移引擎

## Level 0 — 两个独立子系统

本文档覆盖两个相关但独立的子系统：

```mermaid
flowchart LR
  A["Preset 系统\n可复用的任务方法包\n（new-task 时注入）"]
  B["迁移引擎\n旧项目接入 harness\n（migrate-* 命令）"]

  A -->|"legacy-migration preset\n是迁移引擎的专用 Preset"| B
```

它们的关系：迁移引擎有一个专用 Preset（`legacy-migration`），但 Preset 系统本身是通用的，
任何类型的任务都可以有自己的 Preset。

---

## Part 1 — Preset 系统

### Level 1 — Preset 是什么

Preset 是一个**可复用的任务方法包**，打包了特定类型任务所需的：
- 模板追加内容（在标准模板基础上追加 preset 专属内容）
- 执行脚本（plan / scaffold 阶段运行）
- 检查脚本（验证 preset 合规）
- 资源声明（参考文件、工件、必需阅读）

```mermaid
flowchart TD
  Preset["Preset 包\npresets/<id>/"]

  Preset --> Manifest["preset.yaml\n包清单（必须）"]
  Preset --> Templates["templates/\n模板追加文件"]
  Preset --> Scripts["scripts/\nplan / scaffold 脚本"]
  Preset --> Checks["checks/\n检查脚本"]
  Preset --> Workbench["workbench/\nDashboard 面板定义（可选）"]
```

### Level 1 — 分层发现：三个搜索层

Preset 按 **project → user → builtin** 的顺序搜索，同名 Preset 采用**首匹配优先**策略：

```mermaid
flowchart LR
  P["project 层\n<target>/.coding-agent-harness/presets/\n（优先级最高）"]
  U["user 层\n~/.coding-agent-harness/presets/\n（次优先）"]
  B["builtin 层\npackage/presets/\n（最低优先级）"]

  P -->|"未找到时继续"| U -->|"未找到时继续"| B
```

这个设计允许：
- **项目级覆盖**：在项目里放一个同名 Preset，覆盖 builtin 版本
- **用户级覆盖**：在 home 目录放 Preset，对所有项目生效
- **builtin 兜底**：package 自带的 Preset 作为默认实现

`harness preset install --project <preset-id>` 把 Preset 安装到项目层；
`harness preset uninstall --project <preset-id>` 从项目层移除（不影响 user 和 builtin 层）。

### Level 2 — preset.yaml 的结构

```mermaid
flowchart TD
  YAML["preset.yaml"]

  YAML --> Meta["基本信息\nid / version / purpose\ncompatibleBudgets / localeSupport"]
  YAML --> Task["task 配置\nkind / requiresFromSession\nprojectLevelOnly"]
  YAML --> EP["entrypoints\n（见下）"]
  YAML --> WS["writeScopes\n限定写入路径（安全边界）"]
  YAML --> Resources["resources\nreferences / artifacts / context.requiredReads"]
  YAML --> Audit["audit\nmanifestRequired: true\nevidenceFiles[]"]
```

### Level 3 — Entrypoint 类型系统

每个 entrypoint 有两个维度：**name**（触发时机）和 **type**（执行方式）：

```mermaid
flowchart LR
  subgraph "Name（触发时机）"
    N1["newTask\nharness new-task --preset X 时"]
    N2["plan\n迁移计划阶段"]
    N3["scaffold\n批量补全阶段"]
    N4["check\n验证阶段"]
  end

  subgraph "Type（执行方式）"
    T1["template\n追加模板内容到任务文件"]
    T2["script\n运行 Node.js 脚本"]
    T3["check\n运行检查脚本"]
  end
```

三种执行方式的区别：
- **template**：渲染模板文件，将结果追加到任务文件（`task_plan.md`、`execution_strategy.md` 等）
- **script**：执行 Node.js 脚本，脚本可读写文件系统，返回结果作为 audit 证据
- **check**：执行检查脚本，验证 preset 应用的完整性，失败时阻止任务创建

每个 entrypoint 还声明 `writes`（允许写入的路径 glob）和 `reads`（允许读取的路径 glob）。

### Level 3 — writeScopes 安全边界

`writeScopes` 是一个路径白名单，限制 Preset 只能写入声明的目录。
`assertPresetWriteScope()` 在每次文件写入时检查相对路径是否匹配任何 scope。

```
writeScopes:
  tasks:
    path: coding-agent-harness/planning/tasks/**
    access: write
```

支持 `path/**` 通配符表示目录及其所有子目录。
相对路径必须规范化（无 `../`、无绝对路径），防止目录遍历攻击。

### Level 2 — Preset 的生命周期

```mermaid
sequenceDiagram
  participant User
  participant CLI as harness CLI
  participant Registry as preset-registry.mjs
  participant Engine as preset-engine.mjs
  participant TaskDir as 任务目录

  User->>CLI: harness new-task my-task --preset legacy-migration --from-session session.json
  CLI->>Registry: listPresetPackages()\n（分层发现，首匹配优先）
  Registry-->>CLI: preset 对象（含 manifest + 路径）
  CLI->>TaskDir: 创建标准任务骨架（brief / task_plan / visual_map 等）
  CLI->>Engine: executeEntrypoint("newTask", preset, taskDir)
  Engine->>TaskDir: 追加 preset 模板内容到任务文件
  CLI->>TaskDir: 写入 preset metadata 到 task_plan.md
  CLI->>TaskDir: 生成证据包（preset-manifest.json / preset-audit.json）
  CLI-->>User: 任务创建完成
```

### Level 1 — 当前可用 Preset

| Preset ID | 用途 | 兼容 Budget | 特殊要求 |
| --- | --- | --- | --- |
| `legacy-migration` | 旧 harness 项目迁移到 v1.0 | complex | 需要 `--from-session session.json` |
| `lesson-sedimentation` | Lesson 沉淀任务 | standard, complex | 无 |
| `module` | 模块并行工作任务 | standard, complex | 需要 `--module <module-id>` |
| `standard-task` | 标准任务方法 | standard, complex | 无 |
| `version-upgrade` | 按版本升级 manifest 生成升级计划和验证证据 | complex | 需要 `--from-version` 与 `--to-version` |

### Level 2 — version-upgrade Preset

`version-upgrade` 使用一个通用 Preset 包承载升级工作流，再用 `presets/version-upgrade/releases/<from>-to-<to>.yaml`
描述每个版本边的差异。这样 runner、安全边界、证据格式和检查逻辑保持通用；每次发版只需要新增或更新版本 manifest。
当前 bundled manifest 覆盖 `1.0.0 -> 1.0.2`、`1.0.2 -> 1.0.3`、`1.0.3 -> 1.0.4`、`1.0.4 -> 1.0.5`、`1.0.5 -> 1.0.6`、`1.0.6 -> 1.0.7`、`1.0.7 -> 1.0.8`、`1.0.8 -> 1.0.9`、`1.0.9 -> 1.1.0`。

工作流分三步：
- `plan`：读取版本 manifest，生成 task-local `artifacts/version-upgrade/upgrade-plan.json`
- `apply-safe`：只记录 manifest 标记为 safe 的动作证据，不自动执行 manual 或 blocked 项
- `check`：生成 `upgrade-verify.json`；只要 manual confirmation 或 blocked action 还未解决，状态保持 `blocked`

这个 Preset 不会合成人工 review 确认、不删除历史任务记录，也不会绕过 runner 的 materialization manifest 写入边界。

---

## Part 2 — 迁移引擎

### Level 1 — 迁移的三个阶段

```mermaid
flowchart LR
  A["① migrate-plan\n分析差距\n生成动作队列"] --> B["② migrate-run\n执行迁移动作\n写入 session 记录"] --> C["③ migrate-verify\n验证迁移结果\n对比 baseline"]
```

### Level 2 — migrate-plan 做什么

`buildMigrationPlan()` 识别 6 类差距：

```mermaid
flowchart TD
  Plan["harness migrate-plan"]

  Plan --> Scan["扫描目标仓库\nbuildStatus（非严格模式）"]
  Scan --> Detect["检测已有能力\nreadCapabilityRegistry()"]
  Detect --> Gaps["识别差距（6 类）"]

  Gaps --> TaskActions["taskActions\n缺失 execution_strategy.md\n缺失 visual_map.md 的活跃任务"]
  Gaps --> ReviewActions["reviewActions\n缺失审查字段\n（Reviewer Identity 等）"]
  Gaps --> LegacyActions["legacyActions\n缺失必需的参考文件"]
  Gaps --> LegacyResiduals["legacyResiduals\n历史任务的合同差距\n（不应自动迁移）"]
  Gaps --> WeakBriefs["weakBriefTasks\nbrief.md 质量不达标"]
  Gaps --> UnknownClass["unknownClassificationTasks\n任务分类不明确"]
```

**动作队列格式**：每个 taskAction 包含 `taskId`、`path`、`files[]`、`commands[]`、`action` 描述。
`commands[]` 是可以直接执行的 harness CLI 命令列表。

### Level 2 — migrate-verify 的两种模式

```mermaid
flowchart TD
  Verify["harness migrate-verify session.json"]

  Verify --> Normal["普通模式\n重新运行检查\n报告 failures / warnings"]

  Verify --> FullCutover["--full-cutover 模式\n最严格验证（8 个条件）"]

  FullCutover --> C1{"session.result == complete?"}
  C1 -->|"否"| F1["FAIL"]
  C1 -->|"是"| C2{"无 strictDeferred?"}
  C2 -->|"否"| F2["FAIL"]
  C2 -->|"是"| C3{"所有计数器 == 0?\n（warnings / taskActions\nreviewSchemaGaps / legacyResiduals 等）"}
  C3 -->|"否"| F3["FAIL（列出非零计数器）"]
  C3 -->|"是"| C4{"eligible mode?\ndeclared-capability 或 v2-manifest"}
  C4 -->|"否"| F4["FAIL"]
  C4 -->|"是"| C5{"fullCutoverEligible == true?"}
  C5 -->|"否"| F5["FAIL"]
  C5 -->|"是"| P1["PASS（full cutover verified）"]
```

`--full-cutover` 是迁移完成的最终验收标准：8 个条件全部满足才算通过。
它只把 `declared-capability` 和 `v2-manifest` migrate-plan mode 视为候选输入，
继续拒绝 `legacy-compat`，并且仍要求其余 full-cutover 检查全部通过。
mode 资格本身不能证明 full migration complete。

---

## Part 3 — Capability 注册表

### Level 1 — 能力依赖图

```mermaid
flowchart TD
  Core["core\n（必选，所有其他能力的基础）"]

  Core --> ModParallel["module-parallel\nYAML 模块注册 + 并行工作"]
  Core --> AdvReview["adversarial-review\n对抗审查报告\n（别名：review-contract）"]
  Core --> LongRunning["long-running-task\n长时间运行任务合约"]
  Core --> Dashboard["dashboard\n本地 HTML Dashboard"]
  ModParallel --> SubagentWorker["subagent-worker\ncommit-backed worker 交接协议"]
```

### Level 2 — 每个能力的 selectWhen

| 能力 | 何时启用 |
| --- | --- |
| `core` | 始终，这是必选基础 |
| `module-parallel` | 项目有 2 个以上独立模块，需要在 `harness.yaml modules.items` 里维护 owner、scope、依赖和同步规则时 |
| `subagent-worker` | 代码变更 subagent 需要在独立 worktree 工作并 commit 交接时 |
| `adversarial-review` | 发布、架构、安全、数据或策略风险需要独立审查产物时 |
| `long-running-task` | Agent 可能跨多个 loop 运行而无需每步用户确认时 |
| `dashboard` | 需要本地只读状态可视化时 |

### Level 2 — Preset 资源声明（resources）

Preset 可以声明三类资源，这些资源会在任务创建时自动生成，并由检查器验证：

| 资源类型 | 含义 | 验证方式 |
| --- | --- | --- |
| `resources.references` | Preset 提供的参考文件 | 文件存在 + `references/INDEX.md` 中有索引 + `task_plan.md` 中有必需阅读声明 |
| `resources.artifacts` | Preset 生成的工件 | 文件存在 + `artifacts/INDEX.md` 中有索引 |
| `context.requiredReads` | 必需阅读的参考文件 ID | 在两个索引中都有记录 |

这是一个**三层验证链**：文件存在 → 索引表中有记录 → task_plan.md 中有必需阅读声明。
任何一层缺失都会产生 failure。

---

## Part 4 — 设计决策

### 为什么 Preset 不是一开始就有的

Preset 系统是从"旧项目迁移太复杂"这个需求演进出来的。最初只有 `new-task --budget complex`，
没有任何 preset 概念。当用户提出旧项目迁移需求时，最初的方案是发明一个新的 "Ultra" 任务等级。

研究后发现问题不是 Complex 不够用，而是"没有 preset 时每个 Agent 都要自己想迁移流程该怎么拆"。
三个独立 subagent 的对抗审查都指向同一结论——preset 是正确抽象，Ultra 是过度设计。

否决 Ultra 的理由：
1. Ultra 会引入第二套任务系统，破坏 simple/standard/complex 的一致性
2. 问题的根因不是 Complex 承载不了，而是没有预填骨架
3. Preset 是通用抽象，不只服务迁移——任何类型的任务都可以有自己的 Preset

### 为什么 Preset manifest 用 YAML

选择 YAML 是因为可读性——preset manifest 需要人工编写和审查，YAML 比 JSON 少引号和括号。
选择自写轻量解析器（`parseSimpleYaml()`）而不是引入 `js-yaml` 是为了保持零依赖。
JS 格式被排除是因为 preset 需要跨工具可审计，不能是可执行代码。

### 为什么分层发现（project/user/builtin）

分层发现比 preset 系统本身晚了两天引入。最初只从 package 的 `presets/` 固定路径读取。
分层设计解决的核心问题是：
- 不同项目可以有自己的私有 preset（project 层）
- 用户可以安装跨项目共享的 preset（user 层）
- Package bundled preset 作为兜底，不需要安装就能用（builtin 层）

优先级顺序（project > user > builtin）确保项目级定制能覆盖全局默认。

### 为什么迁移分三个阶段而不是一步到位

核心考量是"不能自动迁移"——preset 只搭骨架，不自动改历史文档，
不自动 stage 或 commit。真正写入目标仓库前，仍然要先让用户确认写入范围和迁移深度。

- `migrate-plan`：只读分析，无副作用
- `migrate-run`：有写入的执行，需要用户确认
- `migrate-verify`：事后验证，确认迁移结果

三步分离让用户在每个有副作用的节点都有确认机会。

### 为什么 full-cutover 验证这么严格

`full-cutover` 是不可逆的声明——一旦宣称完成迁移，后续 Agent 就不会再把这个项目当成迁移目标处理。
更宽松的方案（只检查 strict pass）被否决，因为真实项目验证（471 个任务）证明了
即使 strict pass，仍然可能有 weak brief 或 legacy-only visual map 残留。

### writeScopes 安全边界

writeScopes 和 preset 系统同时引入，不是后来补的安全加固。
Preset 是第三方可安装的包，如果不限制写入范围，恶意或错误的 preset 可以覆盖任意文件。
运行时强制检查路径，拒绝 `../` 开头的路径和绝对路径（path traversal 防护）。
