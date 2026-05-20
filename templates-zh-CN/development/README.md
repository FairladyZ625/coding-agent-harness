# 开发上下文 / Development Context

Context Doc Type: development-index
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Purpose

这个文件夹是 Agent 的开发输入包。它说明如何在本仓工作、外部服务不可见时如何开发、哪些内容只能 mock 或 stub、以及哪些假设不能直接成立。

Keep the English field names and section headings because CLI checks rely on them.

## Boundary

- 本地启动、代码地图、外部服务开发摘要、mock、stub、跨仓调试放这里。
- 长期系统结构放 `docs/03-ARCHITECTURE/`。
- API、event、webhook 等具体契约放 `docs/06-INTEGRATIONS/`。
