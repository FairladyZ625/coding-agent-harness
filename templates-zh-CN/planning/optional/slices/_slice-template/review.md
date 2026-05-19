# 切片审查

本文件只记录当前切片的审查结论。任务级发布判断仍以任务目录根部的 `review.md` 为准。

## 审查者身份（Reviewer Identity）

| Reviewer | Type | Scope |
| --- | --- | --- |
| [name] | self / subagent / external / human | [切片范围] |

## 信心挑战（Confidence Challenge）

直接回答：你是否对这个切片有 100% 信心？

- Verdict：yes / no
- 如果不是 100%，列出剩余漏洞和修复建议。

## 重要发现（Material Findings）

| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

不要保留示例 finding。若没有重要发现，只保留表头，并补全 Final Confidence Basis。

## 已检查证据（Evidence Checked）

| Evidence ID | Type | Path | Summary |
| --- | --- | --- | --- |
| SE-001 | command / file / runtime | [路径或命令] | [检查了什么，结论是什么] |

## 残余风险

- [切片级残余风险；如无写“无”]

## 最终信心依据（Final Confidence Basis）

[说明为什么这个切片可以合并，或写清剩余限制和负责人。]
