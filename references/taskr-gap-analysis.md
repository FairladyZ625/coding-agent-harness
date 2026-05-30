# Taskr vs Coding Agent Harness — 差距分析

> 对比基准：
> - **Taskr**: [xerrors/taskr-skill](https://github.com/xerrors/taskr-skill)（SKILL.md + protocol.ts + CLI + Board）
> - **Coding Agent Harness**: 本仓库根目录（SKILL.md + references/ + 30+ templates）
>
> 分析日期：2026-05-21
> 分析人：小宁（Codex Main）

---

## 一、定位差异总览

| 维度 | Taskr | Coding Agent Harness |
|------|-------|---------------------|
| 定位 | Repo-local **任务协议** + 轻量工作流 | 项目级 **工程方法论** + 完整 harness 体系 |
| 粒度 | 单任务卡片级别（一个 md 文件 = 一个任务） | 项目 / wave / feature 级别（多文件协作体系） |
| 目标用户 | 任何用 AI coding agent 的人 | 需要长程项目工程化支撑的团队 |
| 核心产出 | `.taskr/tasks/*.md` | `coding-agent-harness/` 完整骨架 + SSoT + Ledger + Walkthrough |
| 产品形态 | Skill + npm CLI + 本地看板 + VS Code 插件 | Skill（纯文档协议，无代码工具） |
| 默认重量 | **轻量优先**（checklist 够了就不加仪式） | **完整优先**（12 个 Phase 全走一遍） |

**结论**：Taskr 不是 Harness 的竞品，是 Harness 缺失的 **"最后一公里"——单任务执行层**。Harness 擅长搭骨架、定规则、管全局；Taskr 擅长让每个具体任务的执行过程可追踪、可验证、可回溯。两者互补。

---

## 二、我们已有的（不需要从 Taskr 吸收的）

以下能力 Harness 已经覆盖，且比 Taskr 更深：

### 2.1 多级 SSoT 体系 ✅ 已有，且更深

| 能力 | 我们 | Taskr |
|------|------|-------|
| Feature 排期表 | Feature SSoT（独立文件） | 无（只有任务列表） |
| 回归控制塔 | Regression SSoT + Evidence Depth 五级制 | 无 |
| 经验沉淀 | task-local lesson candidates + promoted detail docs + 冲突处理 + 人审流程 | 无 |
| 全局审计 | Harness Ledger（HL-* ID） | 无 |

### 2.2 长程任务合同 ✅ 已有，且更细

我们的 `long-running-task-standard.md` 定义了 Goal / Scope / Primary Caller / Execution Permission / Review Loop / Evidence Depth / Stop Condition / Deliverables 八个维度，还有暂停条件和反模式清单。Taskr 没有长程任务概念，所有任务都用同一套状态机。

### 2.3 回归体系 ✅ 已有，Taskr 完全没有

Evidence Depth 五级制（L1 tests → L5 hard gate）、Cadence Ledger 触发规则、Shared Regression Batch Log。

### 2.4 Worktree 并行开发 ✅ 已有

完整的创建 / merge / 清理流程 + 多 agent 分工协议。Taskr 记录 branch 字段但不管理 worktree 生命周期。

### 2.5 Walkthrough 收口 + 经验回流 ✅ 已有

Walkthrough 模板 + Lessons 检查四问 + task-local candidate + promoted detail doc + 人审批准入流程。Taskr 只有 Completion Summary。

### 2.6 项目诊断 + 分级方案 ✅ 已有

Onboarding Audit 扫描清单 + Lite / Standard / Full 三档分支。Taskr 的 `doctor` 只检查自身是否初始化完成。

### 2.7 增量更新 SOP ✅ 已有

Delta merge 原则：不覆盖已有业务事实、历史 walkthrough、SSoT 条目。Taskr 没有"升级"概念，因为它的协议本身很简单。

---

## 三、Taskr 有而值得我们吸收的（核心差距清单）

### 3.1 🔴 `pending_confirmation` 状态 — 最关键的缺失

**现状**：我们的任务状态流转是 `未开始 → 进行中 → 已完成 → 已阻塞`。Agent 做完实现和验证后直接标"已完成"，没有中间态。

**问题**：
- Agent 自判"完成了"和人确认"可以提交了"是两件事，但我们混在一起
- 无法区分"agent 认为做完了"和"人确认做完了"
- 多 agent 场景下，reviewer 审完也没地方挂"等主人确认"

**Taskr 做法**：
```
planned → in_progress → pending_confirmation → implemented
                              ↑                      ↑
                        agent 完成+验证          人确认提交
```

`pending_confirmation` 的语义精确：
- Agent 已跑完实现 + 验证
- Completion Summary 已写
- Acceptance Criteria 已逐条 check
- Verification 已记录
- 但 **commit 还没打（或打了但等人确认）**
- 人确认后才标 `implemented`

**建议吸收方式**：
在 Planning Loop 的状态流转中加入 `pending_confirmation`：

```mermaid
未开始 → 进行中 → 待确认(pending_confirmation) → 已完成
              ↓
          已阻塞 → 进行中
```

- `progress.md` 模板增加 `pending_confirmation` 阶段
- 任务完成流程改为：实现→验证→标 `pending_confirmation` → 人确认→标 `completed` + 打 commit
- Long-Running Task Contract 的 Stop Condition 达成后进入 `pending_confirmation` 而非直接 `completed`
- Harness Ledger 状态词增加 `pending_confirmation`

**优先级：P0（必须吸收）**

---

### 3.2 🔴 结构化 YAML Frontmatter + Schema Version — 任务元数据可机器解析

**现状**：我们的 `task_plan.md` 是纯 Markdown，没有结构化元数据。标题、状态、创建时间、关联 commit 等信息散落在正文里，agent 每次都要 parse 自由文本。

**Taskr 做法**：每个任务文件有严格的 YAML frontmatter：

```yaml
---
schema_version: 1
id: 2026-05-21-implement-user-invitation-flow
title: Implement user invitation flow
status: pending_confirmation
created_at: 2026-05-21T10:30:00+08:00
updated_at: 2026-05-21T14:20:00+08:00
branch: feat/user-invitation
commits:
  - a1b2c3d
commit_status: created
verification:
  tests_run:
    - npm test -- --grep invitation
    - npm run build
  result: passed
  reason: All tests green.
---
```

**为什么重要**：
- CLI / 脚本可以直接读取状态，不需要 LLM parse
- `validate` 命令可以做自动化校验（字段完整性、状态一致性）
- 看板 / dashboard 可以零成本消费数据
- Git reconcile 可以自动匹配 commit ↔ task

**建议吸收方式**：
给 `task_plan.md` 模板加上 YAML frontmatter，定义最小字段集：

```yaml
---
schema_version: 1
id: <YYYY-MM-DD-task-slug>
title: <任务标题>
status: planned | in_progress | pending_confirmation | completed | blocked
created_at: <ISO8601>
updated_at: <ISO8601>
worktree: <path or null>
branch: <branch-name or null>
commits: []
commit_status: not_created | created | not_applicable
verification:
  tests_run: []
  result: not_run | passed | failed | partial
  reason: ""
---
```

不要求现有任务立即迁移（渐进式），但新任务必须带 frontmatter。

**优先级：P0（必须吸收）**

---

### 3.3 🔴 `validate` 协议校验 — 自动检查任务文件合规性

**现状**：没有自动化校验。任务文件是否缺 section、状态值是否合法、completed 任务有没有 completion summary、这些全靠 agent 自觉或人工巡检。

**Taskr 的 validate 检查项**（共 ~10 项）：

| 检查项 | 规则 |
|--------|------|
| 文件存在 | `.taskr/tasks/<id>.md` 必须存在 |
| YAML frontmatter | 必须有 `---...---` 块 |
| 必填字段 | schema_version, id, title, status, created_at, updated_at, branch, commits, commit_status, verification |
| ID 格式 | lower-kebab-case |
| 文件名匹配 | 文件名必须等于 id（不含 .md） |
| status 合法性 | 必须是 5 个合法值之一 |
| commit_status 合法性 | 必须是 3 个合法值之一 |
| commits 类型 | 必须是数组 |
| 必填 section | Request, Acceptance Criteria, Implementation Plan, Progress Log, Agent Notes, Completion Summary |
| Completion Summary | pending_confirmation / implemented 任务不能为空 |
| commit 一致性 | commit_status=created 时 commits 不能为空 |
| AC checkbox |必须有 checklist item，且 completed 任务至少勾了一个 |
| research_files | 如果有必须是 `.taskr/research/` 下的 .md |

**建议吸收方式**：
写一个轻量 validate 脚本（shell + python 或 node），作为 Harness 的一部分放入 `scripts/`。检查项适配我们的模板结构。

**优先级：P0（必须吸收）**

---

### 3.4 🟡 `doctor` 健康检查 — 一键诊断 harness 状态

**现状**：没有一键诊断脚本。想知道 harness 是否健康需要人工逐项检查。

**Taskr 的 doctor 检查项**：
- `.taskr/` 目录是否存在
- `tasks/` 子目录是否存在
- 任务 Markdown 文件是否通过 validate
- 有无 Claude/Codex Skill 安装线索
- Node 版本是否满足要求

**建议吸收方式**：
扩展为 Harness 级别的 doctor，检查项包括：
- `AGENTS.md` / `CLAUDE.md` 存在且非空
- `coding-agent-harness/` 目录结构是否符合标准
- 三张 SSoT 文件存在
- Harness Ledger 存在
- 任务目录下的 task_plan 是否通过 validate
- 模板文件完整
- reference 文件完整

**优先级：P1（强烈建议）**

---

### 3.5 🟡 Commit 追踪与 Git Reconcile — 任务 ↔ 提交自动关联

**现状**：我们在 progress.md 里手写"commit: abc1234"，但没有结构化记录。无法回答"这个任务对应哪些 commit"、"哪些 commit 还没关联到任务"。

**Taskr 做法**：
1. 每个 task 的 frontmatter 有 `commits: []` 数组和 `commit_status` 字段
2. commit message 强制带 footer：`Taskr: <task-id>`
3. `complete` 时自动记录 commit hash
4. 实现后有 reconcile 流程：扫 `pending_confirmation` 任务，用 `git log --grep "Taskr: <id>"` 和 `git diff` 反向补全遗漏的 commit 关联
5. 不靠时间 proximity 做模糊匹配，只认明确证据

**建议吸收方式**：
1. task_plan frontmatter 加 `commits` / `commit_status` 字段（与 3.2 联动）
2. 定义 commit message convention：harness task 引用格式（如 `Harness: <task-id>` 或沿用 Taskr 的 `Taskr:` footer）
3. 在任务收口流程中加入 reconcile 步骤
4. 写一个 `reconcile` 脚本，扫描未关联 commit

**优先级：P1（强烈建议）**

---

### 3.6 🟡 结构化验证记录 — Verification 作为一等公民

**现状**：验证结果散落在 progress.md 的自由文本里（"跑了 npm test，通过了"）。没有统一格式，无法聚合查看。

**Taskr 做法**：

```yaml
verification:
  tests_run:
    - npx vitest run src/invitation.test.ts
    - npm run build
    - # browser smoke: checked invite button renders
  result: passed
  reason: All 12 tests green. Build succeeded. UI verified.
```

**关键设计决策**：
- `tests_run` 是命令列表（可复跑），不是描述性文字
- `result` 是枚举（`not_run | passed | failed | partial`），不是自由文本
- `reason` 是自由文本，解释特殊情况
- UI 类改动要求至少检查默认状态 + 变更交互状态
- 响应式 UI 要求额外检查窄视口

**建议吸收方式**：
1. frontmatter 的 `verification` 块采用 Taskr 的结构（与 3.2 联动）
2. Verification Policy 明确写入 reference：
   - 代码改动 → unit/build check
   - UI 改动 → browser/validation 至少两个状态
   - 响应式 → 额外窄视口
   - 跑不了 → 记录原因，不允许隐式跳过
3. progress.md 中验证记录部分改用结构化格式

**优先级：P1（强烈建议）**

---

### 3.7 🟡 轻量优先哲学 — 避免 Superpowers 式重流程

**现状**：Harness 的完整流程有 12 个 Phase，对小型任务偏重。虽然我们有 Lite/Standard/Full 分档，但即使 Lite 也需要 AGENTS.md + reference + planning template + Regression SSoT + Harness Ledger + Walkthrough。

**Taskr 的 Intent And Confirmation Policy**：
- 简单明确的请求 → 写 concise task card → 直接干
- 复杂请求 → 问几个关键澄清 → 等 approval
- **不强制** brainstorming / 设计文档 / worktree / skill 拆分
- **checklist 够了就不加 scope/risk/stop condition**
- "Add useful friction before code changes, not ceremony everywhere."

**核心洞察**：Taskr 把"要不要走重流程"这个决策交给了任务本身的复杂度，而不是项目级别。同一个项目里，简单任务走轻量，复杂任务自然变重。

**建议吸收方式**：
1. 在 Planning Loop reference 中加入 **任务分级入口判断**：

| 判断 | 流程 |
|------|------|
| 单文件小修 / typo / config | 不建任务目录，直接改，commit message 引用即可 |
| 普通 feature / fix（1-3 文件） | 建任务目录 + task_plan（含 frontmatter），不需要 long-running contract |
| 复杂 feature / 重构 / 跨模块 | 完整三件套 + contract + SSoT 回写 + walkthrough |

2. 在 SKILL.md 主执行 SOP 中加一个 **快速路径**：检测到 trivial task 时跳到简化流程

**优先级：P1（强烈建议，改变用户体验）**

---

### 3.8 🟡 Research Files — 调研报告显式关联任务

**现状**：我们的 `findings.md` 存放在任务目录内，内容和任务耦合。但如果调研内容很长（比如外部技术方案对比），会撑大 findings.md，而且无法复用。

**Taskr 做法**：
- `.taskr/research/<task-id>/<report-name>.md` 独立存放
- task frontmatter 的 `research_files` 字段记录路径列表
- 一个任务可以关联多份报告
- 通过 CLI 创建：`taskr research <id> <filename>`
- Agent Notes 自动追加引用行

**建议吸收方式**：
1. 任务目录下允许建 `research/` 子目录
2. findings.md 保留为"轻量研究发现"（决策、发现、影响）
3. 大型调研报告放 `research/`，在 findings.md 中引用
4. 可选：frontmatter 加 `research_files` 字段

**优先级：P2（建议吸收）**

---

### 3.9 🟡 本地看板（Board）— 可视化任务状态

**现状**：我们有一个 HTML dashboard（`harness-dashboard.html`），但它是一个独立的静态页面，主要展示 Harness 整体状态（SSoT、Ledger 等）。没有任务级别的 Kanban / Table 视图。

**Taskr 的 Board**：
- 直接读 `.taskr/tasks/*.md`，无需中间缓存
- 支持 Table 视图和 Kanban 视图切换
- 按验收进度排序（默认），也可按创建/更新时间排
- 状态统计（各状态多少任务）
- 显示 commit 上下文和文件 diff
- 任务详情抽屉：状态、提交、需求、验收标准、实现计划
- 支持编辑任务小节
- 本地 HTTP server，文件变化自动刷新
- VS Code 侧边栏插件复用同一套 board model

**建议吸收方式**（两条路选一条）：

**路线 A（轻量）**：扩展现有 `harness-dashboard.html`，增加任务视图页签，读 `coding-agent-harness/planning/tasks/` 目录下的任务文件。

**路线 B（对齐）**：把 Taskr 的 board 直接集成进来，让它同时读 `.taskr/` 和我们的 `coding-agent-harness/planning/tasks/`。Taskr 是 MIT 开源，可以直接用。

**注意**：Board 是 nice-to-have，不是核心方法论差异。核心价值在 3.1-3.6。

**优先级：P2（产品化加分项）**

---

### 3.10 🟡 CLI 工具链 — init / new / list / status / note / complete / validate

**现状**：Harness 没有任何代码工具。所有操作都是 agent 读/写 Markdown 文件。这意味着：
- 人无法快速查看任务状态（必须打开文件）
- 无法在终端做批量操作
- 脚本集成困难

**Taskr 的 CLI 命令集**：

| 命令 | 功能 |
|------|------|
| `init` | 初始化 `.taskr/` 目录结构 |
| `new` | 创建新任务（自动生成 id + frontmatter + 模板） |
| `list` | 列出任务（支持状态过滤、数量限制） |
| `status <id>` | 切换任务状态 |
| `note <id>` | 向 Agent Notes 追加一行 |
| `complete` | 标记 pending_confirmation（自动填 summary、记录 verification、check AC） |
| `validate` | 校验单个或全部任务文件 |
| `doctor` | 健康检查 |
| `board` | 打开本地看板 |
| `research` | 创建调研报告文件 |
| `show` | 显示任务文件内容 |

**建议吸收方式**：
写一个 `harness` CLI（node/shell 都行），覆盖核心子集：

| 命令 | 对应 Harness 操作 |
|------|------------------|
| `harness init` | Bootstrap 最小骨架 |
| `harness task new` | 创建任务目录 + task_plan（带 frontmatter） |
| `harness task list` | 列出任务及状态 |
| `harness task status <id>` | 切换状态（含 pending_confirmation） |
| `harness validate` | 校验任务文件 + harness 骨架完整性 |
| `harness doctor` | Harness 级别健康检查 |
| `harness reconcile` | Git commit ↔ task 关联修复 |

不需要照搬 Taskr 的全部命令（board / research / show 可以后续加）。

**优先级：P2（工具化加分项，有了会让 Harness 从"文档协议"升级为"工程工具"）**

---

### 3.11 🟡 TDD Policy — 何时写测试的明确指引

**现状**：我们的 testing-standard.md 定义了测试分层，但没有明确说"什么情况下必须先写测试"、"什么情况可以后补"。

**Taskr 的 TDD Policy**：
- **推荐 TDD**：bug fix、行为变更、parser/协议逻辑、高风险共享代码
- **可选 TDD**：文档、配置、研究、生成资源、小 copy 修改、低风险 style
- **严格 TDD 不可行时**：仍要求至少一个 focused regression test 或 clear verification command

**建议吸收方式**：
在 `references/` 下新建或扩展 testing-standard.md，加入 TDD 适用场景表。

**优先级：P2（参考价值高，改动量小）**

---

### 3.12 🟡 Review Policy — 轻量审查门禁

**现状**：我们的 Long-Running Task Contract 有 Review Loop 定义，但没有一个简明的"什么时候需要 review"的策略。

**Taskr 的 Review Policy**：
- 复杂 / 跨模块 / 公共 API / release / 用户工作流变更 → 加 light review gate
- 优先用 reviewer agent（如果平台支持 + 用户授权了 delegation）
- 否则 self-review 或请人 manual review
- Review 对照：Request / AC / Implementation Plan / Verification，gap 记入 Agent Notes

**建议吸收方式**：
在 execution-workflow-standard.md 或新建 reference 中加入 review gate 判断表。

**优先级：P2（参考价值高）**

---

### 3.13 🟢 语言自适应模板 — 中英文自动切换

**现状**：我们的模板全是中文。如果用在国际化团队或开源项目中需要手动翻译。

**Taskr 做法**：根据 request 内容是否包含 CJK 字符自动选择中文/英文模板文本（acceptance criteria placeholder、implementation plan placeholder、"Empty." vs "暂无。"）。

**建议吸收方式**：
模板增加 `${lang}` 占位符或提供 `templates-zh-CN/`（我们已经有了！）。确认 `templates-zh-CN/` 是否完整。

**优先级：P3（锦上添花）**

---

### 3.14 🟢 Slug-based ID + 冲突处理

**现状**：我们的任务目录命名是 `YYYY-MM-DD-任务名称`（手动取名的）。没有自动 slugify，没有冲突检测。

**Taskr 做法**：
- `slugify()` 函数：NFKD 正则 → lowercase → kebab-case
- `ensureUniqueTaskId()`：自动检测冲突，追加 `-2`, `-3` 后缀
- SHA-1 fallback：如果 slugify 结果为空，用 content hash 前 8 位

**建议吸收方式**：
CLI 的 `harness task new` 内置 slugify + 冲突检测。手动创建任务时在模板注释中建议命名规范。

**优先级：P3（CLI 附属功能）**

---

### 3.15 🟢 Git Reconcile — 反向补全 Commit 关联

**现状**：（已在 3.5 中提及，单独强调因为它很聪明）

Taskr 在每次收尾时做的 reconcile 流程：
1. 找到所有 `pending_confirmation` 状态的任务
2. 跑 `git log --grep "Taskr: <id>"` 查找已有关联 commit
3. 跑 `git diff -- .taskr/tasks` 区分 task 元数据变更和源码变更
4. 对 evidence 明确的（commit message 引用了 task id 或改动的文件明显匹配）才关联
5. **不**仅因"时间和位置接近"就模糊匹配

这解决了"人在终端手动打了 commit 但忘了更新任务文件"的实际问题。

**优先级：P1（与 3.5 联动）**

---

### 3.16 🟢 Commit Message Convention — Footer 格式

**现状**：没有规定 commit message 格式。

**Taskr 做法**：
```
feat: implement user invitation flow

Add OAuth2-based invitation flow with email delivery.

Taskr: 2026-05-10-user-invitation
```

Footer 格式：`Taskr: <task-id>`（注意不是旧的 `[taskr:<id>]` subject-line 形式）

**建议吸收方式**：
定义 Harness convention：`Harness: <task-id>` 或直接沿用 `Taskr:` （兼容性好，因为未来可能集成 Taskr CLI）。

**优先级：P2（与 3.5 联动）**

---

## 四、不建议吸收的

以下 Taskr 特性我们评估后认为 **不适合** 直接吸收：

| Taskr 特性 | 不吸收的原因 |
|------------|-------------|
| `.taskr/` 目录名 | 我们用 `coding-agent-harness/planning/tasks/`，已是 harness 骨架的一部分，不应再搞一套平行目录 |
| 6-section 固定结构（Request/AC/Plan/ProgressLog/AgentNotes/CompletionSummary） | 我们的三件套（plan/findings/progress）更细粒度；但可以考虑对齐 section 名 |
| 无 SSoT / 无 Regression / 无 Lessons | 这是 Taskr 的定位选择（轻量），不代表我们该砍掉已有能力 |
| HTML-in-Markdown 片段 | 我们的任务文件面向 agent 消费，不需要富渲染 |
| VS Code 插件 | 当前阶段优先级低，等 CLI + Board 稳定了再做 |
| `closed` 状态废弃 | 我们的 `已完成` 语义清晰，不需要改 |

---

## 五、吸收优先级排序与实施建议

### Phase 1：核心协议升级（预计 1-2 天）

| # | 改动 | 优先级 | 改动范围 |
|---|------|--------|---------|
| 1 | `pending_confirmation` 状态加入状态机 | P0 | SKILL.md + planning-loop.md + progress.md 模板 |
| 2 | task_plan 增加 YAML frontmatter（最小字段集） | P0 | task_plan.md 模板 + planning-loop.md |
| 3 | 验证记录结构化（verification block） | P0 | task_plan.md 模板 + long-running-task-standard.md |
| 4 | commit 追踪字段（commits + commit_status） | P0 | task_plan.md 模板 |

### Phase 2：工具化（预计 2-3 天）

| # | 改动 | 优先级 | 改动范围 |
|---|------|--------|---------|
| 5 | `harness validate` 脚本 | P0 | `scripts/validate-tasks.sh`（或 .ts） |
| 6 | `harness doctor` 脚本 | P1 | `scripts/harness-doctor.sh` |
| 7 | `harness reconcile` 脚本 | P1 | `scripts/reconcile-commits.sh` |
| 8 | commit message convention 定义 | P1 | `references/execution-workflow-standard.md` |

### Phase 3：流程优化（预计 1 天）

| # | 改动 | 优先级 | 改动范围 |
|---|------|--------|---------|
| 9 | 任务分级入口判断（trivial / normal / complex） | P1 | SKILL.md + planning-loop.md |
| 10 | TDD Policy | P2 | `references/testing-standard.md` 扩展 |
| 11 | Review Policy | P2 | 新建或扩展 reference |
| 12 | Research Files 模式 | P2 | planning-loop.md 扩展 |

### Phase 4：产品化（可选，后续迭代）

| # | 改动 | 优先级 | 改动范围 |
|---|------|--------|---------|
| 13 | `harness` CLI（init/task/list/status/complete） | P2 | `src/cli.ts`（或 shell） |
| 14 | Board 集成（Kanban + Table） | P2 | 扩展 dashboard 或集成 Taskr board |
| 15 | 语言自适应模板 | P3 | 模板国际化 |

---

## 六、架构影响分析

吸收上述改动后，Harness 的架构变化：

```
Before（当前）:
  SKILL.md → references/ → 30+ templates → agent 手动读写 md

After（吸收后）:
  SKILL.md → references/（更新） → 30+ templates（更新，带 frontmatter）
    → scripts/validate-tasks.sh ← 新增
    → scripts/harness-doctor.sh ← 新增
    → scripts/reconcile-commits.sh ← 新增
    → [可选] harness CLI ← 新增
    → [可选] Board 集成 ← 新增
```

**不变的部分**：
- SSoT 三张表 + Harness Ledger（全局层不受影响）
- Regression 体系 + Evidence Depth + Cadence Ledger（回归层不受影响）
- Worktree 协议（并行层不受影响）
- Walkthrough + Lessons Governance（收口层不受影响）
- 项目诊断 + 分档（接入层不受影响）

**变化的 部分**：
- Planning Loop（任务执行层，变动最大）
- Task Plan 模板（新增 frontmatter + 新状态 + 新字段）
- Long-Running Task Contract（Stop Condition 后接 pending_confirmation）
- 新增 scripts/ 目录（工具化）
- SKILL.md 主 SOP（新增快速路径 + 分级入口）

---

## 七、风险与注意事项

1. **向后兼容**：旧格式的 task_plan.md（无 frontmatter）仍需能被 validate 脚本处理（warn 而非 error）
2. **不破坏现有项目**：已经在用 Harness 的项目不应强制迁移
3. **保持轻量选项**：吸收 Taskr 的"轻量优先"哲学，不要让 Harness 因为加了新特性反而变得更重
4. **Taskr 协议是 MIT**：如果决定深度集成（特别是 CLI 和 Board），可以直接 fork/依赖 `@xerrors/taskr` 包，不必从头写
5. **frontmatter 不要过度膨胀**：Taskr 的 frontmatter 字段已经是最小集，我们不应该加更多

---

## 八、总结一句话

**Taskr 解决的是"单个任务怎么执行、怎么验证、怎么确认"的问题，这正是 Harness 的 Planning Loop 层最薄弱的环节。最值得吸收的不是它的 UI 或 CLI，而是 `pending_confirmation` 状态、结构化 frontmatter、validate 校验、verification 记录、commit reconcile 这五个原子能力。有了这五个，Harness 就从"项目级工程方法论"补齐了"任务级执行协议"，形成完整闭环。**
