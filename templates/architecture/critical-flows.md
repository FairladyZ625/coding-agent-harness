# Critical Flows

Context Doc Type: critical-flows
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Flow Index

| Flow ID | Name | Trigger | Services | Business Impact | Source Evidence | Last Verified | Confidence |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Flow Template

```mermaid
sequenceDiagram
  participant User
  participant CurrentRepo
  participant ExternalService
  User->>CurrentRepo: request
  CurrentRepo->>ExternalService: call
```
