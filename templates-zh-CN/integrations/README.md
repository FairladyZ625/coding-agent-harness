# 接口契约 / Integrations

Context Doc Type: integration-index
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Purpose

这个文件夹只放具体接口契约：API、event、webhook、SDK、第三方集成、auth、payload、error 和 contract tests。

Keep the English field names and section headings because CLI checks rely on them.

## Boundary

- 服务拓扑和职责归属放 `docs/03-ARCHITECTURE/`。
- 开发 mock 和调试说明放 `docs/04-DEVELOPMENT/`。
- endpoint、payload、error、auth、event、webhook、SDK 契约放这里。

## Structure Contract

| 文件 / 路径 | 必须维护的事实 | 写入规则 |
| --- | --- | --- |
| `<service-key>-api.md` | API endpoint、auth、payload、error、contract test | 从 `api-contract.md` 创建 |
| `<event-name>-event.md` | event producer/consumer、schema、delivery、retry | 从 `event-contract.md` 创建 |
| `<webhook-name>-webhook.md` | webhook source、target、signature、payload、retry | 从 `webhook-contract.md` 创建 |
| `third-party/<vendor-key>.md` | 第三方平台、账号/权限边界、SDK 使用、限制 | 从 `third-party/vendor-template.md` 创建 |

## Contract Rule

每个接口契约必须是独立文件，并链接回对应服务：

- 服务职责和上下游关系：`docs/03-ARCHITECTURE/service-catalog.md` 或 `services/<service-key>.md`
- 本地 mock / stub / debug：`docs/04-DEVELOPMENT/external-context/<service-key>.md`
- 具体 payload、auth、error、contract test：本文件夹

不要在一个“接口说明”大文档里混写多个服务。多个微服务就维护多个契约文件；README 里的 Contract Index 负责让人和 Agent 快速定位。

## Contract Index

| Contract | Type | Producer | Consumer | Service Profile | Development Context | Contract Tests | Last Verified | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
