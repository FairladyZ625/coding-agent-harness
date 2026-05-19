# [Task Name] - Review

## Reviewer Identity

| Reviewer | Type | Scope |
| --- | --- | --- |
| [name] | self / subagent / external / human | [files, modules, behavior, or release surface] |

## Review Scope

- Review type: adversarial / security / regression / architecture / release / other
- In scope: [files, modules, behavior]
- Out of scope: [explicit exclusions]
- Source materials: [task plan, diff, test output, runtime evidence]

## Confidence Challenge

Answer directly: do you have 100% confidence in the plan, implementation, and strategy?

- Verdict: yes / no
- If no, list every plausible gap below and propose fixes.

## Material Findings

| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Do not keep sample findings. If there are no material findings, leave only the header and complete the No-Finding Statement.

## No-Finding Statement

[If no material findings remain, state what evidence was checked and why no material finding remains.]

## Evidence Checked

| Evidence ID | Type | Path | Summary |
| --- | --- | --- | --- |
| E-001 | command / file / runtime | [path or command] | [what was checked and what it showed] |

## Residual Risk

| Risk | Owner | Accepted? | Follow-up |
| --- | --- | --- | --- |
| [risk] | [owner] | yes / no | [path or next action] |

## Final Confidence Basis

[Explain the final confidence basis after fixes and verification. If confidence is limited, name the remaining limits and who owns them.]
