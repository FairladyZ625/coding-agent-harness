# Verifier Output

## Verifier Metadata

- template_id: harness-verifier/v1
- verifier: agent, tool, or human name
- target: task, pull request, release, module, or document set
- verdict: pass / fail / inconclusive
- date: YYYY-MM-DD

## Scope Checked

| Area | Included? | Evidence |
| --- | --- | --- |
| Implementation scope | yes / no | files, diff, commit, or PR |
| Tests and regression | yes / no | commands, CI runs, logs, screenshots |
| SSoT and ledger updates | yes / no | Feature, Delivery, Regression, Closeout, or Harness Ledger links |
| Review disposition | yes / no | review path, finding IDs, or no-finding statement |
| Lessons and references | yes / no | Lessons SSoT, detail doc, or checked-none reason |

## Explicit Exclusions

| Exclusion | Reason | Risk |
| --- | --- | --- |
| Scope not checked | why it was excluded | low / medium / high |

## Findings

| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Allowed `Disposition` values: `open`, `mitigated`, `closed`, `deferred`, `accepted-risk`, `not-reproducible`, `out-of-scope`.
Do not keep sample findings. If there are no findings, leave only the header and explain the no-finding basis in `Final Confidence Basis`.

## Residual Routing

| Residual | Owner | Due | Accepted? | Link |
| --- | --- | --- | --- | --- |
| risk or `none` | owner | YYYY-MM-DD or n/a | yes / no / n/a | issue, SSoT row, or none |

## Final Confidence Basis

State the concrete evidence that justifies the verdict. Include the strongest checks run, the most important exclusions, and why any residual risk is acceptable or blocking.
