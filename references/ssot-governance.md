# SSoT 治理

## 核心思路

SSoT（Single Source of Truth，单一事实源）是长程项目的命脉。没有 SSoT，agent 和人都会在多个版本的"真相"之间迷失。

## 四张 SSoT + 一张 Ledger

长程项目需要四张 SSoT 保存当前事实，再用一张全局 Harness Ledger 记录每轮任务是否按 SOP 维护这些事实。

### Delivery SSoT（交付排期表）

管理多人、多 agent、多仓或传统流程下的 feature block 分配、依赖和集成顺序。

- 文件：`docs/09-PLANNING/Delivery-SSoT.md`
- 职责：谁负责哪个 feature block、agent 能看哪些上下文、依赖和 merge 顺序是什么
- 规则：多人、多仓、split-repo、program、waterfall 或 kanban 团队流程必须维护

### Feature SSoT（实施排期表）

管理 feature / wave / implementation 的进度和 residual。

- 文件：`docs/09-PLANNING/Feature-SSoT.md`（按你的项目命名）
- 职责：哪些 feature 在做、做到哪了、还剩什么
- 规则：开始任何非平凡任务前先读，完成后必须回写

### Regression SSoT（回归控制塔）

管理所有 regression surface 的状态、证据深度和残项。

- 文件：`docs/05-TEST-QA/Regression-SSoT.md`
- 职责：哪些回归面存在、每条的标准入口、当前证据深度、residual
- 规则：新增固定 gate 或 evidence depth 变化时必须更新

### Lessons SSoT（经验沉淀）

管理 Agent 在开发过程中发现的经验、改进建议和规范演进。

- 文件：`docs/01-GOVERNANCE/Lessons-SSoT.md`
- 职责：哪些经验值得沉淀、当前审批状态、冲突关系
- 规则：Walkthrough 收口后检查是否有沉淀建议；写之前必须完整读 SSoT
- 详细治理规范：`references/lessons-governance.md`

### Harness Ledger（全局上下文回写总账）

管理每个非平凡任务对 harness 文档骨架的回写情况。

- 文件：`docs/Harness-Ledger.md`
- 职责：本轮任务是否回写 task plan、Feature SSoT、Regression SSoT、walkthrough、Lessons SSoT 和 reference/template
- 规则：任务收口时最后更新；只记录任务级 compliance，不记录逐行 diff
- 详细规范：`references/harness-ledger.md`

### 分工规则

- Feature SSoT 不替代 Regression SSoT
- Delivery SSoT 不替代 Feature SSoT；它管交付组织和集成顺序，不管功能细节
- Regression SSoT 也不替代 Feature SSoT
- Lessons SSoT 不替代前两者，它管的是规范本身的演进
- Harness Ledger 不替代任何 SSoT，它只记录本轮任务是否维护了对应事实
- 四张 SSoT 和 Harness Ledger 必须各司其职，不能彼此吞并

### Module Registry 与 Feature SSoT 的分工

当项目启用模块并行开发（见 `references/module-parallel-standard.md`）时：

- **Module Registry + module_plan.md** 追踪模块内步骤进度（替代 Feature SSoT 对模块工作的追踪）
- **Feature SSoT** 只追踪：
  - 不属于任何模块的独立功能
  - 发布级汇总（哪个 release 包含了哪些模块步骤）

**禁止**：同一个工作项同时出现在 module_plan 和 Feature SSoT 中。这会造成真相分裂。

未启用模块并行的项目继续使用 Feature SSoT 追踪所有功能进度。

## SSoT 与 Planning 的双向绑定

- 每个 task plan 必须指向 SSoT 中的对应条目
- SSoT 中的每个条目必须指向对应的 task plan
- 完成任务后，SSoT 和 task plan 都必须更新
- 非平凡任务完成后，Harness Ledger 必须记录本轮上下文回写结果

## 常见反模式

- 只更新 task plan 不回写 SSoT → SSoT 过时，下一轮 agent 拿到错误信息
- 只更新 SSoT 不更新 task plan → 任务目录变成死文档
- 建多个平行的进度总览 → 真相分裂，没人知道哪个是对的
- 把业务事实复制进 Harness Ledger → 四张 SSoT 被架空
- 把 Harness Ledger 写成逐行 diff 流水账 → 表会快速失控，没人再读
