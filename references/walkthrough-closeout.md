# Walkthrough 收口

## 核心思路

每个 wave / feature 完成后,必须写一篇 walkthrough。这是给下一轮 agent 看的交接文档,不是给人看的周报。

## Walkthrough 模板

```markdown
# [Wave/Feature 名称] Walkthrough

## 概要
[一句话说清楚这个 wave 做了什么]

## 改动范围
- [改了哪些包/模块]
- [新增了哪些文件]
- [删除了哪些文件]

## 关键决策
- [决策1:为什么选了方案A而不是方案B]
- [决策2:...]

## 验证结果
- [跑了哪些测试]
- [回归结果]
- [Evidence Depth 到了哪一层]

## Residual
- [遗留问题1]
- [遗留问题2]

## 相关文件
- Task Plan: [路径]
- SSoT 条目: [引用]
- Regression Gate: [引用]
- Harness Ledger: [HL-...]
```

## 存放位置

```
docs/10-WALKTHROUGH/<YYYY-MM-DD-wave名称>.md
```

## 规则

1. **每个 wave 必须有 walkthrough** — 没有 walkthrough 的 wave 视为未完成
2. **Walkthrough 必须包含 residual** — 即使没有遗留问题，也要显式写“无 residual”
3. **Walkthrough 必须引用验证结果** — 跑了什么、结果是什么
4. **Walkthrough 不是代码注释** — 不需要逐行解释代码，重点是决策和验证
5. **Walkthrough 完成后必须执行经验沉淀检查** — 见下方“经验沉淀检查”章节
6. **收口后必须更新 Harness Ledger** — 记录本轮上下文回写是否完成

## 经验沉淀检查

写完 Walkthrough 并更新 Feature/Regression SSoT 之后，Agent 必须执行以下自检：

1. 这次开发中有没有发现现有 reference 不够用或有误的地方？
2. 有没有值得固化为规范的新模式/新做法？
3. 有没有踩坑经验值得记录，避免下次重复？
4. 有没有架构层面的洞察，值得更新架构文档？

如果任何一条答案是“有”：

1. 完整读一遍 `docs/01-GOVERNANCE/Lessons-SSoT.md`
2. 按 `references/lessons-governance.md` 中的规则处理冲突
3. 在 `docs/01-GOVERNANCE/lessons/` 下写入详细建议（使用 `templates/lessons/` 下的对应模板）
4. 更新 Lessons SSoT 表

如果所有答案都是“没有”，跳过即可。

## Harness Ledger 回写

写完 Walkthrough、更新 Feature/Regression SSoT，并完成 Lessons 检查后，Agent 必须更新
`docs/Harness-Ledger.md`：

1. 为本轮任务追加或更新对应 `HL-*` 条目
2. 记录 Task Plan、Feature SSoT、Regression SSoT、Walkthrough、Lessons Check 的结果
3. 列出本轮触碰的 harness 文档
4. 如有未完成项，使用 `missing` 或 `skipped-with-reason` 并写明 residual

没有 Harness Ledger 条目的 wave，不视为完整 closed。

## 为什么 Walkthrough 有效

- 下一轮 agent 开始工作前,读最近几篇 walkthrough 就能快速了解项目当前状态
- Residual 列表是下一轮任务的输入源之一
- 关键决策记录避免后续 agent 推翻已经验证过的架构选择
- 可追溯性:413 篇 walkthrough = 413 次可查的交接记录
