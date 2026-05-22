---
name: coding-agent-harness
description: >
  Coding Agent Harness 工程方法论。为使用 Coding Agent（Codex、Claude Code、Gemini CLI 等）
  做长程项目开发的团队，在用户的项目上构建一套完整的 harness 工程体系。
  包括：项目诊断、AGENTS.md + CLAUDE.md 入口文件生成、docs/ 目录搭建、Planning Loop、SSoT 治理、
  Delivery Operating Model、Repository Governance、CI/CD、Long-Running Task Protocol、Adversarial Review Report、Review Routing、Worktree 并行开发、
  Regression SSoT 与 Evidence Depth 分级回归、Walkthrough / Closeout SSoT 收口、Cadence Ledger、经验沉淀回流（Lessons SSoT）、
  Harness Ledger 全局上下文回写总账。
  当用户要求设置 coding agent 的开发流程、建立回归测试体系、设计 AGENTS.md / CLAUDE.md、
  规划长程 agent 任务的执行框架、子代理审查循环、对抗性 review 报告、搭建 harness、或者提到 harness engineering 时，使用此技能。
  也适用于"帮我搭一套 agent 开发规范"、"怎么让 AI 在长任务上不跑偏"、
  "怎么做 agent 的回归测试"、"帮我初始化项目的 harness"等场景。
---

# Coding Agent Harness 工程方法论

一套经过真实项目验证的方法论，用于在任意项目上构建 Coding Agent 的工程化支撑体系。

## 核心理念

- **文档是写给 Agent 看的，不是写给人看的。** 人看排期表、架构文档和执行 output。Agent 看 task_plan、walkthrough、reference 标准。
- **上下文不是越多越好，是越准越好。** AGENTS.md 做目录不做百科；CLAUDE.md 只做 Claude Code 兼容 shim，不做第二份规范。
- **单元测试只是底线，不是保障。** 真正的保障需要多层证据（Evidence Depth）。
- **先识别交付组织，再设计 harness。** 一人多 agent、多人团队、前后端分仓、program 多仓、敏捷/瀑布，对应的 SSoT 和冲突治理不同。
- **Repo 护栏是地基。** CI/CD、PR policy、branch protection、required checks、worktree concurrency 必须项目级定制，不能停留在模板。
- **外部资料先摄取，再投影。** 微服务或多仓项目的外部文档不能直接塞进执行文档；先建 source pack、digest、验证，再投影到 `03/04/06`。
- **长程任务先设计合同，再开放执行。** 连续跑数小时的前提是 Goal、Scope、Review Loop、Evidence、Stop Condition 都清楚。
- **审查必须落盘。** 对抗性 review 是独立交付物，不应只留在对话、progress 或 walkthrough 里；reviewer 必须用 Confidence Challenge 反复挑战方案，直到没有 open material finding。
- **Worker handoff 必须 commit-backed。** 可写 subagent 不是 reviewer；它必须在独立 worktree / branch 内实现、验证并提交，再由 coordinator 集成。
- **严肃项目用顶级模型。** 便宜模型的返工成本远高于差价。
- **强制流程优于口头约定。** 每个步骤都应该是 agent 可自主执行的。

---

## 主执行 SOP

如果用户要求"更新 harness"、"同步最新版 harness"、"把项目升级到最新
coding-agent-harness"，不要重新 bootstrap 覆盖整个项目。先执行增量更新流程：

1. 读取本 Skill 的最新版 `SKILL.md`、相关 `references/`、`templates/`。
2. 扫描目标项目现有 `AGENTS.md`、`CLAUDE.md`、`docs/` 和 SSoT / Ledger 文件。
3. 输出 delta plan：哪些 harness 骨架、reference、template、SSoT、Ledger 项缺失或过期。
4. 只补齐新增标准和缺失结构；不得用模板覆盖已有业务事实、历史 walkthrough、
   task progress、Feature SSoT、Regression SSoT 或 Lessons SSoT。
5. 对已有文档采用 merge / append / residual-with-reason；只有全新缺失文件才从模板创建。
6. 如果引入 Lessons SSoT、Harness Ledger 或新的 reference/template，同步更新入口索引。
7. 收口时写 walkthrough，必须包含 Lessons Reflection；新任务先写并审查
   `lesson_candidates.md`。如人工标记值得沉淀，维护命令再写
   `docs/01-GOVERNANCE/lessons/` 详情文档和 Lessons SSoT；最后在
   `docs/Harness-Ledger.md` 与 `docs/10-WALKTHROUGH/Closeout-SSoT.md` 记录本次 harness update 的 delta 和 Lessons Check。

一句话：harness update 是 delta merge，不是重新搭一遍。

当用户要求在项目上搭建 harness 时，使用 v1.0 的六阶段安装流程。安装不是
`npm install` 式复制文件，而是 CLI scaffold 与 Agent configure 配合完成。

面向 agent 的详细安装和迁移说明见
`docs-release/guides/agent-installation.md`。如果本 Skill 与该指南出现差异，以
本 Skill 的执行约束为准，并把差异记录为需要修复的文档漂移。

### Agent 安装合同

这个 CLI 的主要操作者通常是目标项目里的 agent，而不是最终用户。Agent 不应要求用户
记命令、读模板目录或手动判断 locale；这些决策必须由 agent 在安装流程中完成。

- 交互式安装：如果用户在场，agent 必须先确认文档语言，再运行
  `harness init --locale zh-CN|en-US --capabilities ...`。也可以让 CLI 交互提问，
  但 agent 仍要在收口说明中写明最终选择。
- 非交互式安装：agent 不得依赖 CLI 的 `en-US` 默认值；必须从用户语境、项目语言或
  明确配置中推断 locale，并显式传 `--locale`。如果无法判断，先暂停询问。
- 中文用户或中文项目默认选择 `zh-CN`；英文团队、英文代码库或用户明确要求英文时选择
  `en-US`。
- scaffold 后必须检查 `.harness-capabilities.json` 的 `locale`，并确认 dashboard、
  task template、review template 来自同一套模板树。
- `templates/` 和 `templates-zh-CN/` 是两套完整模板树。不要在目标项目里混拷两套模板；
  只允许保留 schema 字段、文件名、状态枚举、命令和跨工具协议 token 的英文。
- 如果只是 dogfood 测试，默认清理目标项目里的测试产物，不提交。

### Phase 1: Diagnose / 项目诊断

读 `references/project-onboarding-audit.md`，扫描项目技术栈、目录结构、现有文档、
CI、团队/agent 协作方式和风险面，输出诊断报告。

如果发现项目属于微服务、多仓、前后端分仓、平台子系统，或代码中出现外部服务、
SDK、API gateway、message queue、webhook、contract、schema、mock，必须询问用户是否有
外部资料。问题至少覆盖：是否有外部团队文档、接口文档、架构图、会议纪要、链接或导出包；
这些资料能否复制进仓；哪些资料是可信来源。外部资料处理方法见
`references/external-source-intake-standard.md`。

### Phase 2: Decide / 方案决策

与用户确认三件事：

1. 文档语言：`zh-CN` 或 `en-US`。中文用户默认应获得中文任务、评审、
   ledger、SSoT、walkthrough 和 reference draft。
2. Delivery Operating Model：solo-orchestrator、team-feature-lead、
   split-repo-contract、program-multi-repo、waterfall-stage-gate 或
   kanban-continuous。
3. Capability Packs：core 必装；按需选择 module-parallel、subagent-worker、
   adversarial-review、long-running-task、dashboard、safe-adoption。
4. External Source Intake：如果外部资料超过 5 份、跨多个主题或会持续增长，
   决定是否创建 `docs/04-DEVELOPMENT/external-source-packs/<source-key>/`。

Capability 选择规则必须按表执行，不得凭感觉多装：

| Capability | 何时选择 |
| --- | --- |
| `core` | 永远安装。它是任务计划、回归、walkthrough、Lessons 和 Harness Ledger 的最小内核。 |
| `dashboard` | 用户或 agent 需要本地只读状态页时安装。它不写目标项目文件。 |
| `safe-adoption` | 只在已有旧 harness 项目接入 v1.0、且需要保留历史文档时安装。新项目默认不装。 |
| `adversarial-review` | 发布、架构、安全、数据、策略风险需要独立 review artifact 时安装。 |
| `long-running-task` | 用户允许 agent 多轮连续执行、不能每步都询问时安装。 |
| `module-parallel` | 项目有 2 个以上可独立演进模块，且需要模块 owner / registry / 同步规则时安装。 |
| `subagent-worker` | 会改代码的 subagent 需要独立 worktree + commit-backed handoff 时安装；它依赖 `module-parallel`。 |

如果选择了某个可选 capability，bootstrap summary 必须写清触发它的项目事实。

### Phase 3: Scaffold / 脚手架

运行或模拟 `harness init --locale zh-CN|en-US --capabilities ...`。面向 agent 的安装
必须显式传 `--locale`；只有人直接在终端运行且未传 `--locale` 时，CLI 才交互询问。CLI 只创建
目录、模板、空表、索引和 `.harness-capabilities.json`，不得把项目级 reference
伪装成已经定制完成的标准。

CLI 会在 JSON 输出中返回 `report`。Agent 必须读取这份 report，并把其中的
`locale`、`selectedCapabilities`、`created/skipped`、`agentInstructions` 和
`verificationCommands` 转化为交付 summary；不能只看命令退出码。

### Phase 4: Configure / 对话式定制

Agent 根据项目事实与用户讨论后定制 AGENTS.md、reference standards、CI/CD、
Regression surface、Delivery SSoT、Module Registry、review routing 和
worktree/subagent handoff 规则。已有项目事实只能 merge/append/residual，
不能模板覆盖。

如果用户提供了外部资料，Configure 阶段必须按
`external-source-intake-standard.md` 执行：Inventory、Classify、Sanitize、Digest、
Project、Verify、Residual。`external-source-packs/` 只保存资料索引、摘要和投影状态；
稳定事实必须回写到 `03-ARCHITECTURE`、`04-DEVELOPMENT/external-context` 或
`06-INTEGRATIONS`。

### Phase 4b: Task Lifecycle / 任务生命周期

初始化或迁移完成后，活跃任务必须通过 CLI 创建和推进，避免 agent 手工复制模板造成漂移：

```bash
node scripts/harness.mjs new-task <task-id> --title "<title>" --locale zh-CN|en-US /path/to/project
node scripts/harness.mjs task-start <task-id> --message "<what started>" /path/to/project
node scripts/harness.mjs task-log <task-id> --message "<what changed>" --evidence "command:TARGET:path:summary" /path/to/project
node scripts/harness.mjs task-block <task-id> --message "<blocker>" /path/to/project
node scripts/harness.mjs task-review <task-id> --message "<ready for review>" /path/to/project
node scripts/harness.mjs task-complete <task-id> --message "<closeout>" /path/to/project
node scripts/harness.mjs task-list --json /path/to/project
```

- `new-task --budget simple` 创建轻量任务目录：`brief.md`、`task_plan.md`、`visual_map.md`、`progress.md`。
- `new-task` 默认 `standard`，创建完整任务目录，包括 `brief.md`、计划、策略、路线图、进度、发现和审查文件。
- `new-task --budget complex` 在完整任务文件之外创建 optional references/artifacts 索引。
- 已存在任务不会被覆盖；旧项目迁移时先 `task-list --json`，再决定复用旧任务还是开新任务。
- 状态推进只写 `progress.md`，不得重写历史 `task_plan.md`。
- `simple` 任务可以直接 `in_progress -> done`；`standard` / `complex` 必须 `in_progress -> review -> done`，不能跳过 `task-review`。
- `review-confirm` 只确认人工 review evidence / findings，不代表 closeout；closeout 仍走 walkthrough / Closeout SSoT。
- 证据必须进入 `task-log` 或 `progress.md`，并继续遵守 `type:PATH:summary` 格式。

### Phase 5: Verify / 验证

运行当前 repo 支持的检查命令，例如：

```bash
node scripts/harness.mjs check --profile target-project /path/to/project
node scripts/harness.mjs status --json /path/to/project
```

如果是在开发或修改本 harness 自身，Phase 5 必须覆盖两条回归路径：

| 回归路径 | 必须证明 |
| --- | --- |
| 新项目初始化 | 空项目 `init --locale zh-CN|en-US --capabilities core,...` 后，模板语言一致、registry 正确、`status --json` 不误报 `safe-adoption`。 |
| 老项目迁移 | 已有旧 harness 文档的项目 `add-capability safe-adoption --locale ...` 后，旧 `AGENTS.md`、`CLAUDE.md`、`Harness-Ledger` 和历史 task 不被覆盖；缺失 v1.0 模板被补齐；普通检查只给 `adoption-needed` warning；`--strict` 仍可阻塞历史合同缺口。 |

检查失败时不能声称 harness complete；必须修复或记录 owner/action/status 明确的
residual。

旧项目迁移时必须先运行：

```bash
node scripts/harness.mjs migrate-plan --json /path/to/project
```

然后按 `docs-release/guides/migration-playbook.md` 分阶段处理。不要机械迁移所有历史
task；先迁移活跃或重新打开的任务，再升级当前门禁相关 review 和 capability。

### Phase 6: Deliver / 交付

输出 bootstrap summary，说明创建/定制了哪些文件、启用了哪些 capability、当前
语言是什么、哪些检查通过、哪些 residual 仍需用户或后续任务处理，并建议首批任务。

Summary 至少包含：

- `locale`
- selected capabilities 及选择理由
- scaffold 创建和跳过的文件
- Configure 阶段做了哪些项目化改动
- 验证命令和结果
- residual owner / action / status
- 是否提交；若只是 dogfood 测试，必须清理测试产物

### 旧版 Bootstrap 参考

旧 12 阶段 bootstrap 只作为兼容迁移参考，不再放在 Skill 主执行协议里。
需要理解旧项目结构或把旧任务迁移到 v1.0 时，读取
`references/legacy-12-phase-bootstrap.md`。

---

## 最小交付清单

harness bootstrap 完成后，项目中至少应存在以下文件：

- [ ] `AGENTS.md`，100-300 行，宪章 + 索引结构
- [ ] `CLAUDE.md`，Claude Code 兼容 shim，指向 `AGENTS.md`（不复制完整规范）
- [ ] `docs/11-REFERENCE/` 下至少 3 个标准文件
- [ ] `docs/09-PLANNING/TASKS/_task-template/` 包含 task plan / findings / progress / review 模板
- [ ] `docs/11-REFERENCE/delivery-operating-model-standard.md`
- [ ] `docs/11-REFERENCE/repo-governance-standard.md`
- [ ] `docs/11-REFERENCE/ci-cd-standard.md`
- [ ] `docs/11-REFERENCE/long-running-task-standard.md`
- [ ] `docs/11-REFERENCE/adversarial-review-standard.md`
- [ ] `docs/11-REFERENCE/review-routing-standard.md`
- [ ] `docs/09-PLANNING/TASKS/_task-template/long-running-task-contract.md`
- [ ] `docs/09-PLANNING/TASKS/_task-template/review.md`
- [ ] `docs/05-TEST-QA/Regression-SSoT.md`
- [ ] `docs/05-TEST-QA/Cadence-Ledger.md`
- [ ] `docs/10-WALKTHROUGH/_walkthrough-template.md`
- [ ] `docs/10-WALKTHROUGH/Closeout-SSoT.md`
- [ ] `docs/01-GOVERNANCE/Lessons-SSoT.md`
- [ ] `docs/01-GOVERNANCE/lessons/`（空目录 + .gitkeep）
- [ ] `docs/01-GOVERNANCE/_archive/`（空目录 + .gitkeep）
- [ ] `docs/Harness-Ledger.md`
- [ ] `docs/11-REFERENCE/external-source-intake-standard.md`
- [ ] `docs/11-REFERENCE/harness-ledger-standard.md`
- [ ] `.github/pull_request_template.md` 或 platform-specific PR template / residual
- [ ] CI workflow 或 `ci-cd-standard.md` 中的 blocked-with-owner residual
- [ ] Branch protection plan 和 required checks 状态
- [ ] Worktree concurrency policy
- [ ] Delivery operating model 已选择；多人/多仓模式下有 `docs/09-PLANNING/Delivery-SSoT.md`
- [ ] 如启用模块并行：`docs/09-PLANNING/Module-Registry.md`
- [ ] 如启用模块并行：`docs/09-PLANNING/MODULES/Session-Prompt-Pack.md` 或每模块 `session_prompt.md`
- [ ] 如启用模块并行：每个 active module 有 `docs/09-PLANNING/MODULES/<key>/module_plan.md`
- [ ] 如启用模块并行：模块 task template / shared lock / dependency readiness 规则已落地
- [ ] Harness checker 已通过，或 residual 写明 owner/action/status
- [ ] Feature SSoT 文件（位置由项目决定）
- [ ] Bootstrap Summary 已输出给用户

---

## Feature 完整生命周期

harness 搭建完成后，每个 feature 从想法到代码的标准流程：

1. **Brainstorming** — 讨论需求，产出设计记录
2. **Planning with Files** — 建任务目录，task plan / findings / progress / review 文件
3. **Long-Running Contract（如适用）** — 明确连续执行权限、review loop、evidence、stop condition
4. **Delivery Operating Model** — 确认本轮属于 solo / team / split-repo / program / stage-gate / kanban 哪种交付形态
5. **SSoT 排期** — 回写到 Feature SSoT；模块并行时 worker 回写 module_plan + Coordinator Handoff，coordinator pass 回写 Module Registry / Harness Ledger；多人/多仓时回写 Delivery SSoT
6. **Repo Governance / CI-CD** — 确认 PR policy、required checks、branch protection、worktree concurrency
7. **Worktree / Branch 并行开发** — 按 operating model 决定 worktree、feature branch、contract branch 或 release branch
8. **Subagent Worker Handoff（如适用）** — coordinator 分配独立 worktree / branch / write scope；worker 提交自己的 commit 并 handoff commit SHA / checks / residuals
9. **Adversarial Review Report（如适用）** — 在任务目录写 `review.md`，记录 material findings / no-finding / residual risk
10. **Review Routing** — planned task 收口前自动触发 subagent / reviewer 审查，或记录 skip reason
11. **Merge + 自动回归** — Cadence Ledger 触发对应回归面；coordinator 只集成 worker commit，不混合多个 worker 的未提交改动
12. **Walkthrough 收口** — 写收口记录并引用 review report
13. **Closeout SSoT 回写** — 每个 closed 任务必须记录 walkthrough 路径或受控 skip reason
14. **Lessons Reflection** — 写 walkthrough 时主动反思共性/反复问题；新任务用 `lesson_candidates.md` 承载人工判定，`queued-promotion` 进入维护队列，`checked-created` 必须有详情文档和 SSoT 表行，旧任务兼容的 `checked-none` 必须写明原因
15. **Harness Ledger 回写** — 记录本轮上下文维护是否完成
16. **Worktree 清理** — 删除已 merge 的 worktree

---

## Reference 索引

| 模块 | Reference | 何时读取 |
|------|-----------|---------|
| 项目诊断 | `references/project-onboarding-audit.md` | Phase 1 |
| AGENTS.md + CLAUDE.md | `references/agents-md-pattern.md` | Phase 4 |
| 目录结构 | `references/docs-directory-standard.md` | Phase 3, 5 |
| 外部资料摄取 | `references/external-source-intake-standard.md` | Phase 1, 2, 4 |
| Delivery Operating Model | `references/delivery-operating-model-standard.md` | Phase 2b, 5 |
| Repository Governance | `references/repo-governance-standard.md` | Phase 5b |
| CI/CD | `references/ci-cd-standard.md` | Phase 5b |
| Planning Loop | `references/planning-loop.md` | Phase 6 |
| Long-Running Task | `references/long-running-task-standard.md` | Phase 7 |
| Adversarial Review | `references/adversarial-review-standard.md` | Phase 5, 6, 7 |
| Review Routing | `references/review-routing-standard.md` | Phase 5, 6, 7 |
| SSoT 治理 | `references/ssot-governance.md` | Phase 8 |
| 经验沉淀 | `references/lessons-governance.md` | Phase 8b |
| Harness Ledger | `references/harness-ledger.md` | Phase 8c |
| Regression | `references/regression-system.md` | Phase 9 |
| Cadence Ledger | `references/cadence-ledger.md` | Phase 9 |
| Walkthrough | `references/walkthrough-closeout.md` | Phase 10 |
| Worktree | `references/worktree-parallel.md` | Phase 11 |

## Template 索引

| 模板 | 路径 | 用途 |
|------|------|------|
| AGENTS.md | `templates/AGENTS.md.template` | Phase 4 |
| CLAUDE.md | `templates/CLAUDE.md.template` | Phase 4，Claude Code 兼容 shim |
| Feature SSoT | `templates/ssot/Feature-SSoT.md` | Phase 8 |
| Regression SSoT | `templates/ssot/Regression-SSoT.md` | Phase 8 |
| Lessons SSoT | `templates/ssot/Lessons-SSoT.md` | Phase 8b |
| Delivery SSoT | `templates/ssot/Delivery-SSoT.md` | Phase 2b |
| Harness Ledger | `templates/ledger/Harness-Ledger.md` | Phase 8c |
| Lesson (ref-change) | `templates/lessons/lesson-ref-change.md` | Walkthrough 收口后 |
| Lesson (new-doc) | `templates/lessons/lesson-new-doc.md` | Walkthrough 收口后 |
| Lesson (arch/process) | `templates/lessons/lesson-arch-process-change.md` | Walkthrough 收口后 |
| Cadence Ledger | `templates/regression/Cadence-Ledger.md` | Phase 9 |
| Task Plan | `templates/planning/task_plan.md` | Phase 6 |
| Findings | `templates/planning/findings.md` | Phase 6 |
| Progress | `templates/planning/progress.md` | Phase 6 |
| Review Report | `templates/planning/review.md` | Phase 6 |
| Long-Running Task Contract | `templates/planning/long-running-task-contract.md` | Phase 7 |
| Module Session Prompt | `templates/planning/module_session_prompt.md` | 模块并行开发会话冷启动 |
| Walkthrough | `templates/walkthrough/walkthrough-template.md` | Phase 10 |
| Closeout SSoT | `templates/walkthrough/Closeout-SSoT.md` | Phase 10 |
| Testing Standard | `templates/reference/testing-standard.md` | Phase 5 |
| Execution Workflow | `templates/reference/execution-workflow-standard.md` | Phase 5 |
| Delivery Operating Model Standard | `templates/reference/delivery-operating-model-standard.md` | Phase 2b |
| Repository Governance Standard | `templates/reference/repo-governance-standard.md` | Phase 5b |
| CI/CD Standard | `templates/reference/ci-cd-standard.md` | Phase 5b |
| Long-Running Task Standard | `templates/reference/long-running-task-standard.md` | Phase 7 |
| Adversarial Review Standard | `templates/reference/adversarial-review-standard.md` | Phase 5 |
| Review Routing Standard | `templates/reference/review-routing-standard.md` | Phase 5 |
| Docs Library | `templates/reference/docs-library-standard.md` | Phase 5 |
| External Source Intake Standard | `templates/reference/external-source-intake-standard.md` | Phase 1, 2, 4 |
| Harness Ledger Standard | `templates/reference/harness-ledger-standard.md` | Phase 5 |
| Regression Governance | `templates/reference/regression-ssot-governance.md` | Phase 5 |
| Walkthrough Standard | `templates/reference/walkthrough-standard.md` | Phase 5 |
| Worktree Standard | `templates/reference/worktree-standard.md` | Phase 5 |
| Engineering Standard | `templates/reference/engineering-standard.md` | Phase 5 |
