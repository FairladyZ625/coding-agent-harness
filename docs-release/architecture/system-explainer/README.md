# Coding Agent Harness — 架构解释文档

这组文档帮助你理解 `coding-agent-harness` 的系统架构。
无论你是想贡献代码、集成到自己的项目、还是只是想搞清楚"这东西到底怎么工作的"，
这里都是最好的起点。

每篇文档采用**自顶向下、逐层展开**的方式：先给你一张大图建立整体感，
再一个模块一个模块地深入。你可以在任意层级停下来——不需要读完所有细节。

---

## 为什么要有这套文档

`coding-agent-harness` 的代码库本身并不复杂，但它的**设计意图**不容易从代码里直接读出来。

比如：
- 为什么状态存在 Markdown 文件里，而不是数据库？
- 为什么有三种 check profile，而不是一种？
- `governance-sync` 和 `governance rebuild` 有什么区别，为什么要分开？
- `review-confirm` 为什么必须是人工操作，不能自动化？

这些问题的答案散落在设计决策、历史演进和操作规范里。
这套文档把它们集中起来，让你不需要翻 git log 就能理解系统的"为什么"。

---

## 阅读顺序

按顺序读效果最好，每篇 15-25 分钟：

| 文件 | 主题 | 你会理解什么 |
| --- | --- | --- |
| [01-system-overview.md](01-system-overview.md) | 系统全景 | 这个东西是什么，解决什么问题，四个大块分别做什么 |
| [02-module-dependency.md](02-module-dependency.md) | 代码模块 | CLI 怎么分发，lib/ 里 30+ 个模块怎么分层，依赖关系 |
| [03-task-lifecycle.md](03-task-lifecycle.md) | 任务生命周期 | 一个任务从创建到收口的完整流转、门禁和队列系统 |
| [04-check-and-governance.md](04-check-and-governance.md) | 检查体系 | 三种 profile，9 个验证器各验什么，治理索引如何重建 |
| [05-data-flow.md](05-data-flow.md) | 数据流 | Markdown 文件如何变成 Dashboard，两种生成模式的边界 |
| [06-preset-and-migration.md](06-preset-and-migration.md) | Preset 与迁移 | Preset 包结构和 entrypoint 类型系统，旧项目迁移三阶段 |

---

## 文档约定

每个文件用 `Level 0 / 1 / 2 / 3` 标注层级深度：

- **Level 0**：最高层，3-5 个大块，建立整体感（必读）
- **Level 1**：展开大块，看清子模块（推荐读）
- **Level 2**：深入子模块，理解内部逻辑（按需读）
- **Level 3**：最细节，函数级别的流程（查阅用）

可以只读到 Level 1 就停，有需要再往下看。

---

## 快速定位

如果你有具体问题，直接跳到对应文件：

| 我想知道… | 去哪里 |
| --- | --- |
| 这个系统解决什么问题 | [01 — 系统全景](01-system-overview.md) |
| `harness check` 在验什么 | [04 — 检查体系](04-check-and-governance.md) |
| 任务的 `review` 状态是什么意思 | [03 — 任务生命周期](03-task-lifecycle.md) |
| Dashboard 数据从哪来 | [05 — 数据流](05-data-flow.md) |
| Preset 怎么写 | [06 — Preset 与迁移](06-preset-and-migration.md) |
| 代码里某个模块是干什么的 | [02 — 代码模块](02-module-dependency.md) |
| 旧项目怎么迁移进来 | [06 — Preset 与迁移](06-preset-and-migration.md) |
