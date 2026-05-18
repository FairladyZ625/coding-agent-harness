# [任务名称] - Review

## Reviewer Identity

| Reviewer | Type | Scope |
| --- | --- | --- |
| coordinator | self-check / verifier / adversarial-review / human | task |

## Review Scope

- Reviewer: [agent / subagent / human / self-review]
- Review type: [adversarial / security / regression / architecture / release / other]
- Reviewed refs:
  - [diff / commit / PR / files / runtime target]
- Out of scope:
  - [明确不审查的范围；如无写"无"]

## Confidence Challenge

- Question: 你对这个方案、实现和策略有 100% 的信心吗？
- Answer: [yes / no]
- If not 100%, remaining vulnerabilities:
  - [漏洞 / 风险 / 证据缺口；如无写"无"]
- Fix loop count: [本轮已执行几次 review -> fix -> evidence -> review 循环]
- Final confidence basis: [为什么现在可以收口；引用 evidence 和 finding 状态]

## Material Findings

| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

Do not leave example findings in this table. If there are no material findings, leave only the header and complete the No-Finding Statement.

Allowed `Disposition`: `open`, `mitigated`, `closed`, `deferred`,
`accepted-risk`, `not-reproducible`, `out-of-scope`.

## Non-Material Notes

- [不阻塞本轮目标但值得记录的问题；如无写"无"]

## Evidence Checked

| Evidence ID | Type | Path | Summary |
| --- | --- | --- | --- |
| E-001 | command / diff / fixture / screenshot / review / report | PUBLIC:path or PRIVATE:path or TARGET:path or EXTERNAL:path or URL:https://example.com | What was checked |

## No-Finding Statement

[如果没有 material finding，明确写：本轮未发现阻塞目标的 material finding。]

## Residual Risk

- [已知残余风险；如无写"无"]

## Follow-Up Routing

- Task Plan: [是否需要更新，路径或"无"]
- Progress: [对应 progress.md 条目]
- Findings: [是否需要写入 findings.md]
- Regression SSoT: [新增/调整/无]
- Lessons SSoT: [checked-created: L-YYYY-MM-DD-NNN / checked-none: 一句话原因]
- Walkthrough: [收口时引用路径]

## Final Confidence Basis

State whether this is self-only, verifier-backed, adversarial-reviewed, or
human-approved. Release final review cannot be self-only.
