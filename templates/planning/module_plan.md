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
