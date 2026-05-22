# 服务目录 / Service Catalog

Context Doc Type: service-catalog
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Services

| Service Key | Service / Component | Owner | Repo / Path | Responsibility | Interfaces | Data Owned | Dependencies | Service Profile | Development Context | Source Pack | Contract Index | Source Evidence | Last Verified | Stale After | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Boundary Rule

这个目录只放服务责任、接口摘要和跳转链接。Payload、auth、error code、event schema 放 `docs/06-INTEGRATIONS/`。

一个服务或微服务只占一行。只要该服务影响本仓开发或判断，就补 `services/<service-key>.md`、`docs/04-DEVELOPMENT/external-context/<service-key>.md` 和相关 `docs/06-INTEGRATIONS/<contract>.md` 链接。
