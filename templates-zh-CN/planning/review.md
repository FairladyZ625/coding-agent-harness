# [任务名称] - 审查

## 审查者身份（Reviewer Identity）

| Reviewer | Type | Scope |
| --- | --- | --- |
| [name] | self / subagent / external / human | [审查范围] |

## 审查范围

- 审查类型：adversarial / security / regression / architecture / release / other
- 范围内：[文件、模块、行为、运行目标]
- 范围外：[明确不审查的内容；如无写“无”]
- 来源材料：[task plan、diff、commit、PR、测试输出、运行证据]

## 信心挑战（Confidence Challenge）

直接回答：你是否对当前计划、实现和策略有 100% 信心？

- Verdict：yes / no
- 如果不是 100%，剩余漏洞或证据缺口：
  - [风险 / 漏洞 / 未验证假设；如无写“无”]
- Fix loop count：[已经执行几轮 review -> fix -> evidence -> review]
- 当前结论：[为什么现在可以继续、暂停或收口]

## 重要发现（Material Findings，表头供 checker 解析）

| ID | Severity | Finding | Evidence Checked | Required Action | Open | Disposition | Blocks Release | Follow-up |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

不要保留示例 finding。若没有重要发现，只保留表头，并补全下面的无重要发现声明。

允许的 `Severity`：`P0`, `P1`, `P2`, `P3`。
允许的 `Open`：`yes`, `no`。
允许的 `Disposition`：`open`, `mitigated`, `closed`, `deferred`, `accepted-risk`, `not-reproducible`, `out-of-scope`。
允许的 `Blocks Release`：`yes`, `no`。

## 非阻塞备注（Non-Material Notes）

- [不阻塞本轮目标但值得记录的问题；如无写“无”]

## 已检查证据（Evidence Checked）

| Evidence ID | Type | Path | Summary |
| --- | --- | --- | --- |
| E-001 | command / diff / fixture / screenshot / review / report | PUBLIC:path 或 PRIVATE:path 或 TARGET:path 或 EXTERNAL:path 或 URL:https://example.com | [检查了什么，结论是什么] |

## 无重要发现声明

[如果没有重要发现，明确写：本轮已检查上述证据，未发现阻塞目标的重要发现。]

## 残余风险

| Risk | Owner | Accepted? | Follow-up |
| --- | --- | --- | --- |
| [风险] | [负责人] | yes / no | [后续路径或“无”] |

## 后续路由（Follow-Up Routing）

- 任务计划：[是否需要更新，路径或“无”]
- Progress：[对应 `progress.md` 条目]
- 发现记录：[是否需要写入 `findings.md`]
- Regression SSoT：[新增 / 调整 / 无]
- Lessons SSoT：[checked-created: L-YYYY-MM-DD-NNN / checked-none: 一句话原因]
- 收口记录：[收口时引用路径]

## 最终信心依据（Final Confidence Basis）

[说明最终信心来自哪些证据、审查层级和已关闭发现。发布前最终审查不能只依赖 self-only。]
