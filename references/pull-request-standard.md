# Pull Request Standard

## Purpose

Every non-trivial PR must be reviewable without reading the full agent
conversation. The PR body is a handoff packet for maintainers: what changed,
why it changed, how it was verified, which version is affected, and what risks
remain.

## Required Shape

Use a bilingual PR body when the repository has Chinese and English users or
the task discussion is Chinese. English comes first for public GitHub readers,
then Simplified Chinese.

The PR body must include:

1. Summary / 摘要
2. What Changed / 改动内容
3. Version Impact / 版本影响
4. Verification / 验证
5. Review Evidence / 审查证据
6. Residual Risk / 残余风险
7. References / 关联材料

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

---

## 摘要

[用一两句话说明目标和结果。]

## 改动内容

- [面向用户或模块级改动。]
- [治理、CLI、Dashboard、文档或模板改动。]

## 版本影响

- 包版本：`[旧版本]` -> `[新版本]`
- 发布说明：[CHANGELOG 条目或无需发布说明的原因]

## 验证

- `[命令]`：通过
- `[浏览器 / 运行时 / CI 证据]`：通过
- 未运行：[原因]

## 审查证据

- 自查：[摘要]
- 额外审查：[reviewer / subagent / human 结果]
- 阻塞发现：[无 / 已关闭 / 已路由]

## 残余风险

- [无 / 已接受 / 已延期 / 无关债务]

## 关联材料

- 任务：[路径或 issue]
- 审查：[路径或 PR review]
- 证据：[路径、commit、截图、workflow 或 dashboard]
```
