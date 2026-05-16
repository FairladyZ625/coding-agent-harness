# Module Registry

> 所有活跃模块的状态总表。新会话冷启动时的第一个读取文件。
> 使用前请读 `references/module-parallel-standard.md`。

| Key | Name | PREFIX | Branch | Current Step | Status | Write Scope | Owner | Updated |
|-----|------|--------|--------|--------------|--------|-------------|-------|---------|
| example | 示例模块 | EXM | codex/example | EXM-01 | planned | src/features/example/ | — | YYYY-MM-DD |

## Status 定义

- `planned` — 步骤已规划，尚未开始
- `in-progress` — 有活跃会话在开发
- `paused` — 暂停，无活跃会话
- `completed` — 所有步骤完成，待归档

## Write Scope 规则

- 每个模块的 Write Scope 必须互不重叠
- 如有交集，必须在开发前解决（串行 / 指定 owner / 提取为独立模块）
- 共享基础设施修改走 `_shared` 基础设施 task，不属于任何模块

## 使用说明

- 新会话开始时读此表，定位目标模块
- 模块 worker 会话结束时只更新本模块 module_plan / task / progress，并在 Coordinator Handoff 里标记需要同步的总表项
- coordinator pass 或显式 shared lock owner 才更新对应行的 Status、Current Step、Updated
- 模块完成后标记 `completed`，定期归档到 `MODULES/_archive/`
