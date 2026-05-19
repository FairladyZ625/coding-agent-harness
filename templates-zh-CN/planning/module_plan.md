# [模块名] Module Plan

## 基本信息

- Key：[module key]
- PREFIX：[step ID prefix]
- Branch：[长期分支名，例如 `codex/reader`]
- 写入范围：[该模块可修改的目录或文件范围]
- Shared surfaces：[与其他模块共享、需要协调的文件或能力面；无则写“无”]

## 步骤序列

| 步骤 ID | 名称 | 状态 | 任务计划 | 依赖 |
| --- | --- | --- | --- | --- |
| XXX-01 | [步骤名] | planned | — | — |
| XXX-02 | [步骤名] | planned | — | XXX-01 |

## 执行与可视化文件

模块级 `execution_strategy.md` 和 `visual_roadmap.md` 应放在本模块目录，与 `module_plan.md` 同级，不嵌入本文件。

| 合同文件 | 是否必需 | 用途 |
| --- | --- | --- |
| `execution_strategy.md` | yes | 模块执行模式、写入边界、subagent 使用、全局同步 owner、验证深度 |
| `visual_roadmap.md` | yes | 模块阶段图、状态、完成度、证据状态、阻塞风险 |

旧模块目录可以保留历史嵌入式段落作为 fallback；新模块目录必须使用独立文件。

## 状态定义

- `planned`：尚未开始
- `in-progress`：正在开发
- `done`：已完成并合并
- `blocked`：被依赖或外部条件阻塞
- `superseded`：已被其他步骤替代

## 当前状态

[用 1-3 句话描述当前进度，供新会话快速接手。每次会话结束时更新。]

## 完成标准

[写清模块整体完成条件。所有步骤 `done` 不等于模块完成，可能仍需集成测试、性能验证、文档收口或 coordinator 同步。]
