# 跨仓调试 / Cross-Repo Debugging

Context Doc Type: cross-repo-debugging
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Debug Flow

1. 先定位失败的 interface 或 flow。
2. 读 `docs/03-ARCHITECTURE/service-catalog.md`，确认归属和上下游服务。
3. 读对应的 `docs/06-INTEGRATIONS/` 契约。
4. 读 `docs/04-DEVELOPMENT/external-context/<service-key>.md`，使用其中的 mock、stub 和本地调试说明。

## Known Failure Modes

| Symptom | Likely Service | First Check | Source Evidence | Last Verified | Confidence |
| --- | --- | --- | --- | --- | --- |
