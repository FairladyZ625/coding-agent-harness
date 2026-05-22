# AGENTS.md / CLAUDE.md 入口设计模式

## 核心思路

AGENTS.md 是跨 agent 的 canonical 入口；CLAUDE.md 是 Claude Code 的兼容入口。两者都应该是**目录和宪章**，不是百科全书。

推荐默认生成：

- `AGENTS.md`：唯一事实源，包含硬规则和 Task-Type Reading Matrix
- `CLAUDE.md`：轻量 shim，只要求 Claude Code 先读 `AGENTS.md`，不复制完整规范

## 反模式：百科全书式

把所有规则塞进一个文件：架构原则、开发规范、测试标准、文档治理、协作纪律、环境配置……

结果：文件越长，agent 表现越差。不相关的约束互相干扰，该关注的重点被淹没。

## 正确模式：宪章 + 索引

AGENTS.md 只包含两类内容：

1. **硬规则（宪章）** — 核心架构原则、绝对不能违反的约束
2. **导航矩阵（索引）** — 做什么类型的任务，先读哪个文件

### Task-Type Reading Matrix 示例

```markdown
## Task-Type Reading Matrix

- 架构 / adapter / runtime 相关任务：
  先读 docs/11-REFERENCE/core-decoupling-standard.md

- 测试 / scenario / 冒烟：
  先读 docs/11-REFERENCE/testing-standard.md

- 文档治理 / planning / walkthrough：
  先读 docs/11-REFERENCE/docs-library-standard.md

- Harness Ledger / 上下文回写：
  先读 docs/11-REFERENCE/harness-ledger-standard.md

- Walkthrough / Closeout / Lessons 收口：
  先读 docs/11-REFERENCE/walkthrough-standard.md，然后读 docs/01-GOVERNANCE/Lessons-SSoT.md 和 docs/10-WALKTHROUGH/Closeout-SSoT.md

- 开发执行 / 回写流程：
  先读 docs/11-REFERENCE/execution-workflow-standard.md

- Repo governance / PR / branch protection:
  先读 docs/11-REFERENCE/repo-governance-standard.md

- CI/CD / required checks:
  先读 docs/11-REFERENCE/ci-cd-standard.md

- 长程任务 / 连续执行 / 子代理审查：
  先读 docs/11-REFERENCE/long-running-task-standard.md

- 对抗性 review / reviewer 报告：
  先读 docs/11-REFERENCE/adversarial-review-standard.md

- Reviewer / subagent / 外部审查路由：
  先读 docs/11-REFERENCE/review-routing-standard.md

- 前端 / UI 任务：
  先读 docs/11-REFERENCE/frontend-standard.md
```

### 推荐结构

```
项目根目录/
├── AGENTS.md        ← concise canonical charter + routing index
├── CLAUDE.md        ← 轻量 shim，指向 AGENTS.md
└── docs/
    ├── Harness-Ledger.md
    └── 11-REFERENCE/
        ├── testing-standard.md
        ├── execution-workflow-standard.md
        ├── repo-governance-standard.md
        ├── ci-cd-standard.md
        ├── long-running-task-standard.md
        ├── adversarial-review-standard.md
        ├── review-routing-standard.md
        ├── engineering-standard.md
        ├── frontend-standard.md
        ├── docs-library-standard.md
        ├── harness-ledger-standard.md
        ├── regression-ssot-governance.md
        ├── walkthrough-standard.md
        └── ...（按需扩展）
```

### 行数控制

AGENTS.md 默认控制在 **80-160 行**。超过 160 行时，优先把操作细节下沉到 reference 文件；超过 300 行基本可以判断已经变成百科全书式入口。

CLAUDE.md 控制在 **10-50 行**。它只做 Claude Code 兼容入口，不应复制 AGENTS.md 的完整规则，避免两份入口文件漂移。

### 关键设计决策

- agent 做后端重构时，不会被前端规范干扰
- agent 做测试时，不会被文档治理规则分心
- 每种任务类型只加载它需要的上下文
- agent 写 walkthrough 时会被入口显式路由回 Lessons SSoT，但 Lessons 全文不会塞进 AGENTS.md

这跟 OpenAI 在 Harness Engineering 实践中得出的结论一致：给 agent 一张地图，不给一本千页手册。

## 生成 AGENTS.md + CLAUDE.md 的步骤

1. 确认项目的技术栈和主要模块
2. 确认 `docs/11-REFERENCE/` 下有哪些标准文件
3. 用 `templates/AGENTS.md.template` 作为 AGENTS.md 起点
4. 填写项目信息区（项目名、技术栈、仓库结构）
5. 根据项目模块编写 Task-Type Reading Matrix
6. 写入硬规则（核心架构约束、绝对不能违反的原则）
7. 控制 AGENTS.md 总行数在 80-160 行，避免把安装教程或操作手册塞进入口
8. 用 `templates/CLAUDE.md.template` 生成 CLAUDE.md shim，指向 AGENTS.md
9. 不要在 CLAUDE.md 中复制完整规范

## 不同项目类型的调整

### 单仓小项目
- Reading Matrix 可以简化为 3-5 条
- 硬规则可以更精简
- 不需要多 agent 协作规则

### Monorepo
- Reading Matrix 按包/模块分组
- 每个包可以有自己的 reference 文件
- 需要跨包依赖规则

### 前后端分离
- 前端和后端各有独立的 reference 文件
- Reading Matrix 按前端/后端/共享分组
- 需要 API 契约规则

### 多人 + 多 Agent
- 需要协作纪律规则
- 需要 worktree 命名规范
- 需要明确 subagent reviewer 与 worker 的区别：worker 必须使用独立 worktree / branch，提交自己的 commit，再由 coordinator 集成
- 需要 merge 审批流程
