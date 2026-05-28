# Integrations

Context Doc Type: integration-index
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Purpose

This folder owns concrete interface contracts: APIs, events, webhooks, SDK usage, third-party integrations, auth, payloads, errors, and contract tests.

## Boundary

- Put service topology and ownership in `{{paths.harnessRoot}}/context/architecture/`.
- Put development mocks and debugging notes in `{{paths.harnessRoot}}/context/development/`.
- Put endpoint, payload, error, auth, event, webhook, and SDK contracts here.

## Structure Contract

| File / Path | Facts to maintain | Write rule |
| --- | --- | --- |
| `<service-key>-api.md` | API endpoints, auth, payloads, errors, contract tests | Create from `api-contract.md` |
| `<event-name>-event.md` | Event producer/consumer, schema, delivery, retry | Create from `event-contract.md` |
| `<webhook-name>-webhook.md` | Webhook source, target, signature, payload, retry | Create from `webhook-contract.md` |
| `third-party/<vendor-key>.md` | Third-party platform, account/permission boundaries, SDK usage, limits | Create from `third-party/vendor-template.md` |

## Contract Rule

Every interface contract must be its own file and link back to the related service:

- Service ownership and topology: `{{paths.harnessRoot}}/context/architecture/service-catalog.md` or `services/<service-key>.md`
- Local mocks, stubs, and debugging: `{{paths.harnessRoot}}/context/development/external-context/<service-key>.md`
- Concrete payloads, auth, errors, and contract tests: this folder

Do not mix multiple services into one large "integration notes" document. Multi-service systems should have multiple contract files; the Contract Index below is the navigation layer for humans and agents.

## Contract Index

| Contract | Type | Producer | Consumer | Service Profile | Development Context | Contract Tests | Last Verified | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
