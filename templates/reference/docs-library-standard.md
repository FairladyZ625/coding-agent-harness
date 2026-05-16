# Docs Library Standard

## 文档目录结构

参考 `docs/` 标准目录结构（见 AGENTS.md 或 docs-directory-standard）。

## 命名规范

### 目录命名
- 使用编号前缀：`00-`、`01-`、`02-`...
- 编号后接大写英文名称
- 示例：`03-ARCHITECTURE`、`11-REFERENCE`

### 文件命名
- 使用 kebab-case：`testing-standard.md`
- 日期前缀用于时序文档：`2026-03-15-user-auth-walkthrough.md`
- 模板文件以 `_` 开头或放在 `_template` 目录

## 文档分类

| 类型 | 位置 | 说明 |
|------|------|------|
| Harness Ledger | `Harness-Ledger.md` | 全局上下文回写总账 |
| 架构设计 | `03-ARCHITECTURE/` | ADR、技术方案、设计讨论 |
| 测试相关 | `05-TEST-QA/` | Regression SSoT、Cadence Ledger、测试策略 |
| Repo Governance | `11-REFERENCE/repo-governance-standard.md` | PR、branch protection、required checks、worktree concurrency |
| CI/CD | `11-REFERENCE/ci-cd-standard.md` | CI profile、workflow、release/CD residual |
| 任务计划 | `09-PLANNING/TASKS/` | 每个任务一个子目录，包含 task plan / progress / findings / review |
| Delivery SSoT | `09-PLANNING/Delivery-SSoT.md` | 多人、多 agent、多仓或传统流程下的 feature block 分配与集成顺序 |
| Module Registry | `09-PLANNING/Module-Registry.md` | 模块并行开发时的活跃模块总表 |
| Module Plan | `09-PLANNING/MODULES/<key>/module_plan.md` | 单模块步骤、状态、写入范围 |
| Archive | `<folder>/_archive/` | 该目录下历史事实和过期文档归档 |
| Walkthrough | `10-WALKTHROUGH/` | 每个 wave 一篇 |
| Closeout SSoT | `10-WALKTHROUGH/Closeout-SSoT.md` | closed task 的 walkthrough / skip reason 索引 |
| 标准文件 | `11-REFERENCE/` | agent 按需加载的规范 |
| 临时文件 | `99-TMP/` | 定期清理 |

## 归档规则

- 每个会持续增长的目录必须有同级 `_archive/`；第一次归档前必须创建
- Active 文件只保留当前事实；历史事实必须移入同级 `_archive/`，不能无限追加在 Active 表底部
- 已完成任务可保留在原任务目录；当整个线性阶段迁移或目录过大时，将历史任务批量移动到 `09-PLANNING/_archive/`
- Feature SSoT / Delivery SSoT / Module Registry / Regression SSoT / Lessons SSoT / Harness Ledger 都必须有归档策略
- 归档不改原始 ID，不删除 task plan、walkthrough、SSoT 或 Ledger 的可追溯引用
- Active 文件必须留下归档索引或指针，说明历史在哪里
- `review.md` 保留在对应任务目录，不移动到 walkthrough 或根目录
- `docs/Harness-Ledger.md` 保留在 docs 根目录，是根目录过程文件禁令的唯一例外
- 99-TMP/ 下的文件超过 7 天未更新应清理
- 标准文件更新时，在文件头部记录最后更新日期

## 文档写作原则

1. 文档是写给 Agent 看的，不是写给人看的
2. 每个文档有明确的职责，不混写
3. 标准文件控制在合理长度，超长则拆分
4. 使用 markdown 格式，保持结构清晰
5. 关键信息用表格呈现，便于 agent 解析
