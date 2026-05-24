# PR 提交标准

## 职责

PR 描述是给 maintainer 的审查交接包。维护者应当不读完整 agent 对话，也能看懂：
为什么改、改了哪些面、版本影响、如何验证、审查状态、还有什么残余风险。

## 必需段落

如果仓库面向中英文用户，或本次任务讨论是中文，PR 必须中英双语：

1. Summary / 摘要
2. What Changed / 改动内容
3. Version Impact / 版本影响
4. Verification / 验证
5. Review Evidence / 审查证据
6. Residual Risk / 残余风险
7. References / 关联材料

## 规则

- 涉及包、应用或 release 时，必须写明版本影响。
- 改动内容按模块或用户可见面总结，不要只堆文件列表。
- 验证必须列真实命令和证据；没有跑的检查必须说明原因。
- 关联任务计划、review、walkthrough、SSoT、issue、PR、commit 或 dashboard 证据。
- 发布阻塞发现不能藏在摘要里；必须关闭、路由或带 owner 接受风险。

## 模板

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

---

## 摘要

[目标和结果。]

## 改动内容

- [改动。]

## 版本影响

- 版本：`[旧版本]` -> `[新版本]` / 不改版本，原因是 [原因]

## 验证

- `[命令或证据]`：通过
- 未运行：[原因]

## 审查证据

- 自查：[摘要]
- 额外审查：[摘要]
- 阻塞发现：[无 / 已关闭 / 已路由]

## 残余风险

- [无 / 已接受 / 已延期]

## 关联材料

- 任务：[路径]
- 证据：[路径 / commit / workflow / 截图]
```
