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
| 架构设计 | `03-ARCHITECTURE/` | ADR、技术方案、设计讨论 |
| 测试相关 | `05-TEST-QA/` | Regression SSoT、Cadence Ledger、测试策略 |
| 任务计划 | `09-PLANNING/TASKS/` | 每个任务一个子目录 |
| Walkthrough | `10-WALKTHROUGH/` | 每个 wave 一篇 |
| 标准文件 | `11-REFERENCE/` | agent 按需加载的规范 |
| 临时文件 | `99-TMP/` | 定期清理 |

## 归档规则

- 已完成的任务计划保留在原位，不移动
- 99-TMP/ 下的文件超过 7 天未更新应清理
- 标准文件更新时，在文件头部记录最后更新日期

## 文档写作原则

1. 文档是写给 Agent 看的，不是写给人看的
2. 每个文档有明确的职责，不混写
3. 标准文件控制在合理长度，超长则拆分
4. 使用 markdown 格式，保持结构清晰
5. 关键信息用表格呈现，便于 agent 解析
