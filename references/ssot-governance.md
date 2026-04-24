# SSoT 治理

## 核心思路

SSoT（Single Source of Truth，单一事实源）是长程项目的命脉。没有 SSoT，agent 和人都会在多个版本的"真相"之间迷失。

## 双轨制

长程项目需要两个 SSoT，各管各的：

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

### 分工规则

- Feature SSoT 不替代 Regression SSoT
- Regression SSoT 也不替代 Feature SSoT
- 两者必须互相引用，但不能彼此吞并

## SSoT 与 Planning 的双向绑定

- 每个 task plan 必须指向 SSoT 中的对应条目
- SSoT 中的每个条目必须指向对应的 task plan
- 完成任务后，SSoT 和 task plan 都必须更新

## 常见反模式

- 只更新 task plan 不回写 SSoT → SSoT 过时，下一轮 agent 拿到错误信息
- 只更新 SSoT 不更新 task plan → 任务目录变成死文档
- 建多个平行的进度总览 → 真相分裂，没人知道哪个是对的
