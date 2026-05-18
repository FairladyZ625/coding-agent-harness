# Verifier Output

## Schema

- template_id: `harness-verifier/v1`
- verdict: `pass | fail | inconclusive`
- confidence_basis: `self-check | verifier-backed | adversarial-reviewed | human-approved`

## Invariants Checked

| Invariant | Evidence | Result |
| --- | --- | --- |
| No open release-blocking P0/P1/material-P2 | review / command / fixture | pass / fail / inconclusive |

## Findings

| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Allowed `Disposition`: `open`, `mitigated`, `closed`, `deferred`,
`accepted-risk`, `not-reproducible`, `out-of-scope`.

## Residual Routing

State where every accepted or deferred residual is routed.
