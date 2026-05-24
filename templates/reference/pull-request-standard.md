# Pull Request Standard

## Purpose

A pull request must be a concise review handoff. A maintainer should understand
the intent, changed surfaces, version impact, verification evidence, review
state, and residual risk without reading the full agent conversation.

## Required Sections

Use a bilingual PR body when the repository works across English and Chinese or
when the task discussion is Chinese. In an English template, keep the canonical
section names English and add the localized section after the English one.

1. Summary
2. What Changed
3. Version Impact
4. Verification
5. Review Evidence
6. Residual Risk
7. References
8. Localized Summary, when required by the project

## Rules

- Include the package, app, or release version impact when applicable.
- Summarize changed behavior by module or user surface.
- List real verification commands and evidence. Explain skipped checks.
- Link the task plan, review, walkthrough, SSoT row, issue, PR, commit, or
  dashboard evidence that matters.
- Do not hide release-blocking findings in the summary. Close, route, or label
  them as accepted risk with an owner.

## Template

```markdown
## Summary

[Intent and outcome.]

## What Changed

- [Change.]

## Version Impact

- Version: `[old]` -> `[new]` / no version change because [reason]

## Verification

- `[command or evidence]`: pass
- Not run: [reason]

## Review Evidence

- Self-review: [summary]
- Additional review: [summary]
- Blocking findings: [none / closed / routed]

## Residual Risk

- [none / accepted / deferred]

## References

- Task: [path]
- Evidence: [path / commit / workflow / screenshot]

## Localized Summary

[Add the project-required localized PR sections here when needed.]
```
