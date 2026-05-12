---
name: coding-agent-harness
description: >
  Coding Agent Harness 工程方法论。为使用 Coding Agent（Codex、Claude Code、Gemini CLI 等）
  做长程项目开发的团队，在用户的项目上构建一套完整的 harness 工程体系。
  包括：项目诊断、AGENTS.md + CLAUDE.md 入口文件生成、docs/ 目录搭建、Planning Loop、SSoT 治理、
  Long-Running Task Protocol、Worktree 并行开发、Regression SSoT 与 Evidence Depth
  分级回归、Walkthrough 收口、Cadence Ledger、经验沉淀回流（Lessons SSoT）、
  Harness Ledger 全局上下文回写总账。
  当用户要求设置 coding agent 的开发流程、建立回归测试体系、设计 AGENTS.md / CLAUDE.md、
  规划长程 agent 任务的执行框架、子代理审查循环、搭建 harness、或者提到 harness engineering 时，使用此技能。
  也适用于"帮我搭一套 agent 开发规范"、"怎么让 AI 在长任务上不跑偏"、
  "怎么做 agent 的回归测试"、"帮我初始化项目的 harness"等场景。
---

# Coding Agent Harness 工程方法论

一套经过真实项目验证的方法论，用于在任意项目上构建 Coding Agent 的工程化支撑体系。

## 核心理念

- **文档是写给 Agent 看的，不是写给人看的。** 人看排期表、架构文档和执行 output。Agent 看 task_plan、walkthrough、reference 标准。
- **上下文不是越多越好，是越准越好。** AGENTS.md 做目录不做百科；CLAUDE.md 只做 Claude Code 兼容 shim，不做第二份规范。
- **单元测试只是底线，不是保障。** 真正的保障需要多层证据（Evidence Depth）。
- **长程任务先设计合同，再开放执行。** 连续跑数小时的前提是 Goal、Scope、Review Loop、Evidence、Stop Condition 都清楚。
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
7. 收口时写 walkthrough，并在 `docs/Harness-Ledger.md` 记录本次 harness update 的 delta。

一句话：harness update 是 delta merge，不是重新搭一遍。

当用户要求在项目上搭建 harness 时，严格按以下顺序执行：

### Phase 1: 项目诊断

读 `references/project-onboarding-audit.md`，按其中的扫描清单分析用户项目现状，输出诊断报告。

### Phase 2: 确认方案

根据诊断结果，确定 harness 规模（参考 `references/project-onboarding-audit.md` 中的项目类型分支），与用户确认落地方案。

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

### Phase 6: 初始化 Planning Loop

读 `references/planning-loop.md`，在 `docs/09-PLANNING/TASKS/` 下建立任务模板目录。使用 `templates/planning/` 下的三件套模板。

### Phase 7: 初始化 Long-Running Task Protocol

读 `references/long-running-task-standard.md`，在 `docs/11-REFERENCE/` 中生成长程任务标准。使用 `templates/reference/long-running-task-standard.md`，并把 `templates/planning/long-running-task-contract.md` 放入任务模板目录。

### Phase 8: 初始化 SSoT

读 `references/ssot-governance.md`，创建 Feature SSoT 和 Regression SSoT。使用 `templates/ssot/` 下的模板。

### Phase 8b: 初始化经验沉淀体系

读 `references/lessons-governance.md`，创建 Lessons SSoT。使用 `templates/ssot/Lessons-SSoT.md` 作为模板。同时在 `docs/01-GOVERNANCE/` 下创建 `lessons/` 和 `archive/` 目录（含 `.gitkeep`）。

### Phase 8c: 初始化 Harness Ledger

读 `references/harness-ledger.md`，在 `docs/` 根目录创建 `Harness-Ledger.md`。使用 `templates/ledger/Harness-Ledger.md` 作为模板。

### Phase 9: 初始化 Regression 体系

读 `references/regression-system.md` 和 `references/cadence-ledger.md`，根据项目的关键 surface 建立回归 gate 和 cadence 规则。使用 `templates/regression/` 下的模板。

### Phase 10: 初始化 Walkthrough 流程

读 `references/walkthrough-closeout.md`，建立 walkthrough 模板。使用 `templates/walkthrough/` 下的模板。

### Phase 11: 初始化 Worktree 规范

读 `references/worktree-parallel.md`，确认 worktree 命名和分支规范，写入 AGENTS.md 或对应 reference 文件。

### Phase 12: 输出 Bootstrap Summary

输出一份 harness bootstrap 总结，包括：
- 创建了哪些文件
- 每个文件的用途
- 建议的首批任务
- 下一步行动

---

## 最小交付清单

harness bootstrap 完成后，项目中至少应存在以下文件：

- [ ] `AGENTS.md`，100-300 行，宪章 + 索引结构
- [ ] `CLAUDE.md`，Claude Code 兼容 shim，指向 `AGENTS.md`（不复制完整规范）
- [ ] `docs/11-REFERENCE/` 下至少 3 个标准文件
- [ ] `docs/09-PLANNING/TASKS/_task-template/` 包含三件套模板
- [ ] `docs/11-REFERENCE/long-running-task-standard.md`
- [ ] `docs/09-PLANNING/TASKS/_task-template/long-running-task-contract.md`
- [ ] `docs/05-TEST-QA/Regression-SSoT.md`
- [ ] `docs/05-TEST-QA/Cadence-Ledger.md`
- [ ] `docs/10-WALKTHROUGH/_walkthrough-template.md`
- [ ] `docs/01-GOVERNANCE/Lessons-SSoT.md`
- [ ] `docs/01-GOVERNANCE/lessons/`（空目录 + .gitkeep）
- [ ] `docs/01-GOVERNANCE/archive/`（空目录 + .gitkeep）
- [ ] `docs/Harness-Ledger.md`
- [ ] `docs/11-REFERENCE/harness-ledger-standard.md`
- [ ] Feature SSoT 文件（位置由项目决定）
- [ ] Bootstrap Summary 已输出给用户

---

## Feature 完整生命周期

harness 搭建完成后，每个 feature 从想法到代码的标准流程：

1. **Brainstorming** — 讨论需求，产出设计记录
2. **Planning with Files** — 建任务目录，三件套文件
3. **Long-Running Contract（如适用）** — 明确连续执行权限、review loop、evidence、stop condition
4. **SSoT 排期** — 回写到 Feature SSoT
5. **Worktree 并行开发** — 开独立 worktree，分支隔离
6. **Merge + 自动回归** — Cadence Ledger 触发对应回归面
7. **Walkthrough 收口** — 写收口记录
8. **Harness Ledger 回写** — 记录本轮上下文维护是否完成
9. **Worktree 清理** — 删除已 merge 的 worktree

---

## Reference 索引

| 模块 | Reference | 何时读取 |
|------|-----------|---------|
| 项目诊断 | `references/project-onboarding-audit.md` | Phase 1 |
| AGENTS.md + CLAUDE.md | `references/agents-md-pattern.md` | Phase 4 |
| 目录结构 | `references/docs-directory-standard.md` | Phase 3, 5 |
| Planning Loop | `references/planning-loop.md` | Phase 6 |
| Long-Running Task | `references/long-running-task-standard.md` | Phase 7 |
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
| Harness Ledger | `templates/ledger/Harness-Ledger.md` | Phase 8c |
| Lesson (ref-change) | `templates/lessons/lesson-ref-change.md` | Walkthrough 收口后 |
| Lesson (new-doc) | `templates/lessons/lesson-new-doc.md` | Walkthrough 收口后 |
| Lesson (arch/process) | `templates/lessons/lesson-arch-process-change.md` | Walkthrough 收口后 |
| Cadence Ledger | `templates/regression/Cadence-Ledger.md` | Phase 9 |
| Task Plan | `templates/planning/task_plan.md` | Phase 6 |
| Findings | `templates/planning/findings.md` | Phase 6 |
| Progress | `templates/planning/progress.md` | Phase 6 |
| Long-Running Task Contract | `templates/planning/long-running-task-contract.md` | Phase 7 |
| Walkthrough | `templates/walkthrough/walkthrough-template.md` | Phase 10 |
| Testing Standard | `templates/reference/testing-standard.md` | Phase 5 |
| Execution Workflow | `templates/reference/execution-workflow-standard.md` | Phase 5 |
| Long-Running Task Standard | `templates/reference/long-running-task-standard.md` | Phase 7 |
| Docs Library | `templates/reference/docs-library-standard.md` | Phase 5 |
| Harness Ledger Standard | `templates/reference/harness-ledger-standard.md` | Phase 5 |
| Regression Governance | `templates/reference/regression-ssot-governance.md` | Phase 5 |
| Walkthrough Standard | `templates/reference/walkthrough-standard.md` | Phase 5 |
| Worktree Standard | `templates/reference/worktree-standard.md` | Phase 5 |
| Engineering Standard | `templates/reference/engineering-standard.md` | Phase 5 |
