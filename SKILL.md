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
7. 收口时写 walkthrough，必须包含 Lessons Reflection；如发现可复用教训，先写
   `docs/01-GOVERNANCE/lessons/` 详情文档，再写 Lessons SSoT；最后在
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

### Phase 2: Decide / 方案决策

与用户确认三件事：

1. 文档语言：`zh-CN` 或 `en-US`。中文用户默认应获得中文任务、评审、
   ledger、SSoT、walkthrough 和 reference draft。
2. Delivery Operating Model：solo-orchestrator、team-feature-lead、
   split-repo-contract、program-multi-repo、waterfall-stage-gate 或
   kanban-continuous。
3. Capability Packs：core 必装；按需选择 module-parallel、subagent-worker、
   adversarial-review、long-running-task、dashboard、safe-adoption。

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

### Historical 12-Phase Bootstrap（旧版参考）

以下 12-phase 流程是历史参考，用于理解旧版 harness 的组成，不再作为 v1.0
`init` 的默认执行协议。

### Phase 1: 项目诊断

读 `references/project-onboarding-audit.md`，按其中的扫描清单分析用户项目现状，输出诊断报告。

### Phase 2: 确认方案

根据诊断结果，确定 harness 规模（参考 `references/project-onboarding-audit.md` 中的项目类型分支），与用户确认落地方案。

### Phase 2b: 选择 Delivery Operating Model

读 `references/delivery-operating-model-standard.md`。先判定项目的工程组织形态：

- `solo-orchestrator`：一人主控，多 agent / worktree 并行
- `team-feature-lead`：leader 拆 feature block，多人各带 agent 开发
- `split-repo-contract`：前后端或 app/service 分仓，通过接口合同协作
- `program-multi-repo`：主项目协调多个子仓库
- `waterfall-stage-gate`：需求、设计、实现、验证、发布分阶段推进
- `kanban-continuous`：连续流动式开发，用 WIP 和集成队列控节奏

如果是多人、多仓或传统工程流程，必须创建或更新 `docs/09-PLANNING/Delivery-SSoT.md`。

### Phase 2c: 模块识别与注册（可选）

当项目满足以下条件时启用：

- Operating Model 为 `solo-orchestrator` 或 `team-feature-lead`
- 存在 2+ 个可独立演进的功能域
- 开发者计划多会话 / 多 worktree 并行

读 `references/module-parallel-standard.md`，执行：

1. 识别项目中的独立模块（按功能域划分，不按技术层划分）
2. 为每个模块声明 write scope，确认无交集
3. 创建 `docs/09-PLANNING/Module-Registry.md`（使用 `templates/ssot/Module-Registry.md`）
4. 为每个活跃模块创建 `docs/09-PLANNING/MODULES/<key>/module_plan.md`（使用 `templates/planning/module_plan.md`）
5. 在 AGENTS.md 中添加模块冷启动指引段落
6. 启用检查器的模块任务反向索引规则：模块 worker 必须把活跃任务写入 `module_plan.md`，并用 Coordinator Handoff 标记总表同步需求；只有 coordinator pass 或显式 shared lock owner 写 `Module-Registry.md` / Harness Ledger。

如果项目从线性 Phase 模型迁移，还需执行迁移步骤（见 `references/module-parallel-standard.md` 的"从线性 Phase 迁移"段落）。

### Phase 3: 搭建目录结构

读 `references/docs-directory-standard.md`，在项目中创建 docs/ 目录结构。根据诊断结果裁剪不需要的目录。

### Phase 4: 生成 AGENTS.md + CLAUDE.md

读 `references/agents-md-pattern.md`，根据项目技术栈和目录结构生成 AGENTS.md。使用 `templates/AGENTS.md.template` 作为起点。

同时生成 `CLAUDE.md`：
- 优先使用 `templates/CLAUDE.md.template`
- `CLAUDE.md` 只作为 Claude Code 兼容入口，指向 AGENTS.md
- 不要在 `CLAUDE.md` 中复制完整规范，避免 AGENTS.md 与 CLAUDE.md 漂移

### Phase 5: 生成 Reference 标准文件

读 `references/docs-directory-standard.md` 中的 reference 文件清单，根据项目需要生成对应的标准文件到 `docs/11-REFERENCE/`。使用 `templates/reference/` 下的模板。
标准 harness 安装必须包含 `adversarial-review-standard.md` 和
`review-routing-standard.md`，因为 planned task closeout 默认启用 reviewer routing。
标准 harness 安装也必须包含 `repo-governance-standard.md` 和 `ci-cd-standard.md`，
因为 CI/CD、PR policy、branch protection、required checks 和 worktree concurrency 是 base guardrails。
标准 harness 安装还必须包含 `delivery-operating-model-standard.md`，
因为 harness 必须先知道自己服务的是哪一种工程组织形态。

### Phase 5b: 初始化 Repository Governance / CI-CD

读 `references/repo-governance-standard.md` 和 `references/ci-cd-standard.md`。
根据项目技术栈和远端平台定制：

- repo platform profile
- branch model
- PR policy
- required checks
- branch protection plan
- CI workflow 或 blocked-with-owner residual
- worktree concurrency

如果是 GitHub 项目，优先生成或更新 `.github/pull_request_template.md` 和
`.github/workflows/ci.yml`。如果 agent 没有权限设置 branch protection，必须写 manual setup residual，
不能把 `designed` 冒充成 `verified`。

### Phase 6: 初始化 Planning Loop

读 `references/planning-loop.md`，在 `docs/09-PLANNING/TASKS/` 下建立任务模板目录。使用 `templates/planning/` 下的任务模板。
模板目录必须额外包含 `review.md`，用于 reviewer agent / subagent / 自审写入对抗性 review 报告。

### Phase 7: 初始化 Long-Running Task Protocol

读 `references/long-running-task-standard.md`，在 `docs/11-REFERENCE/` 中生成长程任务标准。使用 `templates/reference/long-running-task-standard.md`，并把 `templates/planning/long-running-task-contract.md` 放入任务模板目录。

### Phase 8: 初始化 SSoT

读 `references/ssot-governance.md`，创建 Feature SSoT 和 Regression SSoT。使用 `templates/ssot/` 下的模板。

### Phase 8b: 初始化经验沉淀体系

读 `references/lessons-governance.md`，创建 Lessons SSoT。使用 `templates/ssot/Lessons-SSoT.md` 作为模板。同时在 `docs/01-GOVERNANCE/` 下创建 `lessons/` 和 `_archive/` 目录（含 `.gitkeep`）。

### Phase 8c: 初始化 Harness Ledger

读 `references/harness-ledger.md`，在 `docs/` 根目录创建 `Harness-Ledger.md`。使用 `templates/ledger/Harness-Ledger.md` 作为模板。

### Phase 9: 初始化 Regression 体系

读 `references/regression-system.md` 和 `references/cadence-ledger.md`，根据项目的关键 surface 建立回归 gate 和 cadence 规则。使用 `templates/regression/` 下的模板。

### Phase 10: 初始化 Walkthrough 流程

读 `references/walkthrough-closeout.md`，建立 walkthrough 模板和 Closeout SSoT。
使用 `templates/walkthrough/` 下的模板。

### Phase 11: 初始化 Worktree 规范

读 `references/worktree-parallel.md`，确认 worktree 命名、分支规范、subagent worker
handoff 和 coordinator integration 规则，写入 AGENTS.md 或对应 reference 文件。

### Phase 11b: 初始化模块并行启动 Prompt（如启用）

如果项目启用模块并行开发，读 `references/module-parallel-standard.md`，并为每个 active module 创建：

- `docs/09-PLANNING/Module-Registry.md`
- `docs/09-PLANNING/MODULES/<key>/module_plan.md`
- `docs/09-PLANNING/MODULES/Session-Prompt-Pack.md` 或 `docs/09-PLANNING/MODULES/<key>/session_prompt.md`

使用 `templates/planning/module_session_prompt.md` 填充每个模块的启动 prompt。Prompt 必须包含 start gate、worktree/branch preflight、Subagent Worker Invariant、write scope、shared coordination、verification、review/Lessons/Closeout 收口。

### Phase 12: 输出 Bootstrap Summary

输出一份 harness bootstrap 总结，包括：
- 创建了哪些文件
- 每个文件的用途
- 建议的首批任务
- 下一步行动
- `node scripts/check-harness.mjs <project-root>` 的结果；未通过不得声称 bootstrap complete

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
14. **Lessons Reflection** — 写 walkthrough 时主动反思共性/反复问题；`checked-created` 必须有详情文档和 SSoT 表行，`checked-none` 必须写明原因
15. **Harness Ledger 回写** — 记录本轮上下文维护是否完成
16. **Worktree 清理** — 删除已 merge 的 worktree

---

## Reference 索引

| 模块 | Reference | 何时读取 |
|------|-----------|---------|
| 项目诊断 | `references/project-onboarding-audit.md` | Phase 1 |
| AGENTS.md + CLAUDE.md | `references/agents-md-pattern.md` | Phase 4 |
| 目录结构 | `references/docs-directory-standard.md` | Phase 3, 5 |
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
| Harness Ledger Standard | `templates/reference/harness-ledger-standard.md` | Phase 5 |
| Regression Governance | `templates/reference/regression-ssot-governance.md` | Phase 5 |
| Walkthrough Standard | `templates/reference/walkthrough-standard.md` | Phase 5 |
| Worktree Standard | `templates/reference/worktree-standard.md` | Phase 5 |
| Engineering Standard | `templates/reference/engineering-standard.md` | Phase 5 |
