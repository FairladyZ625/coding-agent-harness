# [模块名] Module Plan

## 基本信息

- Key: [module key]
- PREFIX: [step ID prefix]
- Branch: [长期分支名，如 codex/reader]
- Write Scope: [该模块可修改的目录/文件范围]
- Shared Surfaces: [与其他模块共享的文件，需协调；无则填"无"]

## 步骤序列

| Step ID | Name | Status | Task Plan | Depends On |
|---------|------|--------|-----------|------------|
| XXX-01 | [步骤名] | planned | — | — |
| XXX-02 | [步骤名] | planned | — | XXX-01 |

## Execution & Visualization Files

Module-level execution strategy and roadmap are sibling files in this module
folder, not embedded sections in `module_plan.md`.

| Contract File | Required | Purpose |
| --- | --- | --- |
| `execution_strategy.md` | yes | Module execution mode, write boundary, subagent use, global sync owner, verification depth |
| `visual_roadmap.md` | yes | Module phase graph, status, completion, evidence state, blocking risk |

For legacy module folders only, dashboard/checker may read old `module_plan.md`
sections as a fallback. New module folders must use the standalone files.

### Status 定义

- `planned` — 尚未开始
- `in-progress` — 当前正在开发
- `done` — 已完成并合并
- `blocked` — 被依赖阻塞
- `superseded` — 被其他步骤替代

## 当前状态

[1-3 句话描述当前进度，供新会话快速理解。每次会话结束时更新此段。]

## 完成标准

[该模块整体完成的条件。所有步骤 done 不等于模块完成——可能还需要集成测试、性能验证等。]
