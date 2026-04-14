# Walkthrough 收口

## 核心思路

每个 wave / feature 完成后，必须写一篇 walkthrough。这是给下一轮 agent 看的交接文档，不是给人看的周报。

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
- [决策1：为什么选了方案A而不是方案B]
- [决策2：...]

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
```

## 存放位置

```
docs/10-WALKTHROUGH/<YYYY-MM-DD-wave名称>.md
```

## 规则

1. **每个 wave 必须有 walkthrough** — 没有 walkthrough 的 wave 视为未完成
2. **Walkthrough 必须包含 residual** — 即使没有遗留问题，也要显式写"无 residual"
3. **Walkthrough 必须引用验证结果** — 跑了什么、结果是什么
4. **Walkthrough 不是代码注释** — 不需要逐行解释代码，重点是决策和验证

## 为什么 Walkthrough 有效

- 下一轮 agent 开始工作前，读最近几篇 walkthrough 就能快速了解项目当前状态
- Residual 列表是下一轮任务的输入源之一
- 关键决策记录避免后续 agent 推翻已经验证过的架构选择
- 可追溯性：413 篇 walkthrough = 413 次可查的交接记录
