# L-[ID]: [一句话标题]

## 元信息

- **ID**: L-[YYYY-MM-DD-NNN]
- **日期**: YYYY-MM-DD
- **来源**: `docs/10-WALKTHROUGH/[walkthrough文件名].md`
- **类型**: ref-change
- **目标**: `docs/11-REFERENCE/[目标文件].md`
- **提出者**: [agent session / model / human]

## 背景

[说明为什么提出这个 reference 改动。写清在哪个 walkthrough 中发现问题、具体场景是什么、现有规则为什么没有让 agent 做对。]

## 共性问题

[说明这个问题是否跨多轮、多个文件、多个 agent 或多个阶段反复出现。若不是重复问题，说明为什么仍值得沉淀到正式 reference。]

## 现行规范缺口

[引用当前 reference 的相关段落或规则，说明缺口属于措辞不清、顺序错误、模板缺字段、checker 没拦住、负责人不明确，还是路由规则缺失。]

## 建议改动

[具体写出要改什么。可以使用 diff、前后对比或要点列表，但必须足够具体，能直接落到目标文件。]

## 改动理由

[说明为什么这个改动比现状更好。引用实际任务证据、review 发现、失败案例或重复返工情况。]

## 采纳后的触发点

[说明下次 agent 在什么动作点会被提醒或拦截，例如读 AGENTS.md 后、写任务计划时、review 后、closeout 前、checker 运行时。]

## 验证方式

[说明合入后如何确认它生效：模板字段、checker、review 清单、一次试运行或人工确认。]

## 冲突声明

- 当前是否有其他 pending 条目指向同一目标：是 / 否
- 如果有，涉及条目：L-[XXX]
- 本文档是否已考虑冲突：是 / 否
- 基于版本：当前正式 reference（`docs/11-REFERENCE/[目标文件].md`）@ YYYY-MM-DD

## 完整副本

> 以下是修改后的完整 reference 副本。副本必须基于当前正式版本独立编写，不基于其他 pending 副本。若存在冲突，必须在“冲突声明”中说明。

---
<!-- 完整副本开始 -->
<!-- 基于: docs/11-REFERENCE/[目标文件].md @ YYYY-MM-DD -->
<!-- 本副本独立于其他 pending 改动 -->

[完整的修改后文档内容]

<!-- 完整副本结束 -->
---
