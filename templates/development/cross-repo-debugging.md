# Cross-Repo Debugging

Context Doc Type: cross-repo-debugging
Owner: project coordinator
Last Verified: unknown
Confidence: low

## Debug Flow

1. Identify the failing interface or flow.
2. Read `docs/03-ARCHITECTURE/service-catalog.md` for ownership and upstream/downstream services.
3. Read the matching `docs/06-INTEGRATIONS/` contract.
4. Use the matching `docs/04-DEVELOPMENT/external-context/<service-key>.md` notes for mocks and local debugging.

## Known Failure Modes

| Symptom | Likely Service | First Check | Source Evidence | Last Verified | Confidence |
| --- | --- | --- | --- | --- | --- |
