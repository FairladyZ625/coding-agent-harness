# 架构 / Architecture

Context Doc Type: architecture-index
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Purpose

这个文件夹是系统结构事实源。它说明当前仓库负责什么、属于哪个更大的系统、以及 Agent 改代码前必须理解哪些服务、流程和架构决策。

Keep the English field names and file names because CLI checks rely on them.

## Read Order

1. `Architecture-SSoT.md`
2. `local-repo-context.md`
3. `system-map.md`
4. `service-catalog.md`
5. `critical-flows.md`
6. `services/<service-key>.md`
7. `decisions/ADR-*.md`

## Boundary

- 系统结构、服务责任、归属关系、关键流程放这里。
- Payload、endpoint 参数、event schema、SDK 细节放 `docs/06-INTEGRATIONS/`。
- 本地启动、mock、stub、跨仓调试经验放 `docs/04-DEVELOPMENT/`。
