# Pull Request Standard

## Purpose

Every non-trivial PR must be reviewable without reading the full agent
conversation. The PR body is a handoff packet for maintainers: what changed,
why it changed, how it was verified, which version is affected, and what risks
remain.

## Required Shape

The PR body must include:

1. Summary
2. What Changed
3. Version Impact
4. Verification
5. Review Evidence
6. Residual Risk
7. References

Use a bilingual PR body when the repository has Chinese and English users or
the task discussion is Chinese. English comes first for public GitHub readers,
then the localized section follows after the English section.

## Content Rules

- State the target version explicitly. If `package.json` changes from `1.0.3`
  to `1.0.4`, say so in Version Impact.
- List changed surfaces by user-visible area or module, not by dumping every
  file path.
- Verification must name the real commands, browser checks, CI runs, or
  evidence artifacts. If a check was not run, say why.
- Review Evidence must mention self-review, subagent review, human review, or
  code-quality review status. Release-blocking findings must be closed or
  routed before merge.
- Residual Risk must distinguish accepted risk, deferred follow-up, and
  unrelated local/private debt.
- References must link relevant task docs, SSoT rows, review files, commits,
  issues, or PRs.

## Template

```markdown
## Summary

[One or two sentences explaining the intent and outcome.]

## What Changed

- [User-facing or module-level change.]
- [Governance, CLI, dashboard, docs, or template change.]

## Version Impact

- Package version: `[old]` -> `[new]`
- Release notes: [CHANGELOG entry or reason no release note is needed]

## Verification

- `[command]`: pass
- `[browser/runtime/CI evidence]`: pass
- Not run: [reason]

## Review Evidence

- Self-review: [summary]
- Additional review: [reviewer/subagent/human result]
- Blocking findings: [none / closed / routed]

## Residual Risk

- [none / accepted / deferred / unrelated debt]

## References

- Task: [path or issue]
- Review: [path or PR review]
- Evidence: [path, commit, screenshot, workflow, or dashboard]
```
