# L-[ID]: [一句话标题]

## 元信息

- **ID**: L-[YYYY-MM-DD-NNN]
- **日期**: YYYY-MM-DD
- **来源**: `docs/10-WALKTHROUGH/[walkthrough文件名].md`
- **类型**: new-doc
- **建议路径**: `docs/11-REFERENCE/[建议文件名].md`
- **提出者**: [agent session / model / human]

## 背景

[说明为什么需要新增文档。写清在哪个任务或 walkthrough 中发现缺失，以及缺失导致了什么执行风险。]

## 共性问题

[说明这个缺失是否跨多轮、多个模块、多个 agent 或多个阶段反复出现。若不是重复问题，说明为什么仍值得新增正式文档。]

## 现有文档为什么不够

[说明为什么现有 reference、template、checker 或 SSoT 无法承载这条规则。若可以合入现有文档，应改用 `ref-change` 类型。]

## 建议路径

`docs/11-REFERENCE/[建议文件名].md`

## 建议文档内容

```markdown
# [新文档标题]

[完整的新文档内容。内容应能直接合入，不要只写提纲。]
```

## 采纳后的触发点

[说明下次 agent 在什么动作点会读取或使用这份文档，例如任务计划阶段、模块拆分前、review 后、closeout 前、checker 运行时。]

## 验证方式

[说明新增文档如何被发现和执行：AGENTS.md 索引、checker、模板引用、review 清单或一次试运行。]

## 冲突声明

- 当前是否有其他 pending 条目涉及相同范围：是 / 否
- 如果有，涉及条目：L-[XXX]
- 本建议是否已考虑兼容：是 / 否
- 如果不新增文档，替代方案是什么：[无 / 说明]
