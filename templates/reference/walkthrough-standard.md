# Walkthrough Standard

## 职责

Walkthrough 是每个 wave / feature 完成后的收口记录。给下一轮 agent 看的交接文档。

## 何时写

- 每个 feature / wave 完成并 merge 后，必须写 walkthrough
- 没有 walkthrough 的 feature 视为未完成

## 存放位置

`docs/10-WALKTHROUGH/YYYY-MM-DD-<feature-name>.md`

## 必须包含的内容

1. **概要**：一句话说清楚做了什么
2. **改动范围**：改了哪些模块/文件
3. **关键决策**：为什么选了方案 A 而不是方案 B
4. **验证结果**：跑了什么测试、回归结果、evidence depth
5. **Residual**：遗留问题（如无则显式写"无"）
6. **关联**：task plan 路径、SSoT 条目、regression gate、commit hash

## 写作原则

- 重点是决策和验证，不是逐行解释代码
- 用表格呈现结构化信息
- Residual 是下一轮任务的输入源之一
- 关键决策记录避免后续 agent 推翻已验证的架构选择

## 模板

使用 `docs/10-WALKTHROUGH/_walkthrough-template.md`（如已初始化）。
