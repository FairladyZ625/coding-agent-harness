# PR 提交标准

## 职责

每个非平凡 PR 都必须让 maintainer 在不阅读完整 agent 对话的情况下完成审查。PR body 是审查交接包：说明改了什么、为什么改、如何验证、影响哪个版本、还剩什么风险。

## 必需结构

如果仓库面向中英文用户，或本次任务讨论是中文，PR 必须中英双语。公开 GitHub 读者优先读英文，所以英文在前，简体中文在后。

PR body 必须包含：

1. Summary / 摘要
2. What Changed / 改动内容
3. Version Impact / 版本影响
4. Verification / 验证
5. Review Evidence / 审查证据
6. Residual Risk / 残余风险
7. References / 关联材料

## 内容规则

- 必须明确目标版本。如果 `package.json` 从 `1.0.2` 变为 `1.0.3`，就在版本影响里写清楚。
- 改动内容按用户可见面或模块总结，不要只堆文件路径。
- 验证必须列真实命令、浏览器检查、CI run 或证据产物。没有跑的检查必须说明原因。
- 审查证据必须说明自查、subagent 审查、人工审查或代码质量审查状态。release-blocking finding 必须在 merge 前关闭或路由。
- 残余风险必须区分已接受风险、延期 follow-up、无关本地或私有债务。
- 关联材料必须链接相关 task doc、SSoT 行、review 文件、commit、issue 或 PR。

## 模板

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
