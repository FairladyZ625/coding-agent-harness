# 经验沉淀 SSoT - [项目名称]

> 可复用经验、流程修正和 reference 改动建议的单一事实源。这里管理 lesson 生命周期，详情必须写在独立文档中。

## 使用约定

- 写新 lesson 前，先完整阅读本表，确认是否已有相同或冲突建议。
- 表行不能单独存在；每条活跃 lesson 都必须有 `docs/01-GOVERNANCE/lessons/` 下的详情文档。
- lesson 只记录可复用的机制性改进，不记录一次性 bug、个人偏好或聊天摘要。
- 人批准前，pending lesson 不能被当成正式流程规则使用。

## 活跃 Lessons

| Lesson ID | 日期 | 来源 | 类型 | 目标 | 摘要 | 详情文档 | 状态 | 冲突 / 关联 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| L-YYYY-MM-DD-001 | YYYY-MM-DD | `docs/10-WALKTHROUGH/[file].md` | ref-change | `docs/11-REFERENCE/[target].md` | [一句话摘要] | `docs/01-GOVERNANCE/lessons/L-YYYY-MM-DD-001-[slug].md` | pending | `none` / L-... |

## 已归档 Lessons

> 状态为 `merged`、`rejected`、`superseded` 的条目在阶段收口后移入 `docs/01-GOVERNANCE/_archive/Lessons-SSoT-archive-YYYY-QN.md`，本节保留索引。

| Lesson ID | 日期 | 处理结果 | 处理日期 | 归档文件 |
| --- | --- | --- | --- | --- |
| L-YYYY-MM-DD-001 | YYYY-MM-DD | merged / rejected / superseded | YYYY-MM-DD | `docs/01-GOVERNANCE/_archive/Lessons-SSoT-archive-YYYY-QN.md` |

## 状态说明

- `pending`：Agent 提出建议，等待人审查。
- `approved`：已批准，等待合入正式 reference、template 或 checker。
- `merged`：已合入正式文件，并有 commit 或变更证据。
- `rejected`：明确不采纳，保留原因。
- `superseded`：被后续 lesson 取代，必须指向新 Lesson ID。
- `needs-rework`：方向可能成立，但详情文档需要补充或重写。

## 类型说明

- `ref-change`：修改现有 reference、标准或规则文档。
- `new-doc`：新增 reference、模板、检查器说明或治理文档。
- `arch-change`：架构、模块边界、仓库结构或系统职责变化。
- `process-change`：任务流程、审查流程、回归节奏或 closeout 规则变化。

## 路由规则

1. 先写详情文档，再追加本表行；不要先占表行。
2. `详情文档` 字段必须是路径，不能写摘要。
3. `ref-change` 的详情文档必须包含基于当前正式文件的完整副本或明确 diff。
4. 多个 pending lesson 指向同一目标时，必须在“冲突 / 关联”中互相标记。
5. `merged` 后必须更新目标正式文件，并在详情文档或本表记录证据。
6. closeout 中的 Lessons 检查必须能追溯到本表行，或写明 `checked-none` 原因。
