# 收口记录标准

## 职责

收口记录是每个 wave、feature、release 或非平凡任务完成后的交接文档，写给下一轮 agent、reviewer 和维护者看。它不复述每一行代码，而是说明本轮做了什么、为什么这样做、如何验证、还有什么 residual。

默认位置：

```text
docs/10-WALKTHROUGH/YYYY-MM-DD-<feature-name>.md
```

Closeout SSoT 固定位置：

```text
docs/10-WALKTHROUGH/Closeout-SSoT.md
```

## 何时必须写

- 每个 feature、wave、release 或非平凡任务完成后。
- merge 后需要给后续 agent 留交接。
- 产生 review、regression、CI/CD、Lessons 或 Harness Ledger 回写。
- 用户要求阶段收口或交付总结。

没有 walkthrough 的非平凡任务视为未完整收口；如受控跳过，必须登记原因。

## 必须包含

1. **概要**：一句话说清楚本轮交付。
2. **改动范围**：模块、文件、配置、文档和外部系统影响。
3. **关键决策**：为什么选择当前方案，放弃了什么方案。
4. **验证结果**：测试、回归、CI/CD、smoke、browser inspection、evidence depth。
5. **审查结果**：引用 `review.md`，列出 material findings、no-finding 结论和 `accepted-risk`。
6. **残余风险**：没有残余也要写“无”；有残余则写 owner 和后续路径。
7. **Lessons 反思**：判断是否有可沉淀的 workflow、reference、checker 或工程规则。
8. **关联信息**：task plan、SSoT、Regression SSoT、Harness Ledger ID、commit、PR、release。

## 写作原则

- 重点写决策、证据和残余，不写流水账。
- 用路径和命令引用证据，不依赖聊天记录。
- 表格适合列验证、关联和 residual；段落适合解释判断。
- 关键决策要足够明确，避免后续 agent 推翻已验证选择。
- 如果本轮存在 skipped check，必须说明原因、影响和 owner。

## 收口单一事实源规则

以下 Harness Ledger row 必须有 Closeout SSoT row：

- `closed`
- `closed-with-residual`
- `closed-local-only`

Closeout SSoT 中：

- walkthrough 列写实际路径，或写受控跳过原因。
- Lessons 检查列写 `checked-candidate: LC-...`、`queued-promotion: LC-...`、`checked-created: L-YYYY-MM-DD-NNN`，或旧任务兼容的 `checked-none: <reason>`。
- 允许的跳过原因只有：`docs-only`、`no-runtime`、`superseded`、`historical-backfill`、`owner-deferred`。

## 经验沉淀反思规则

写 walkthrough 时必须加入“Lessons 反思”小节，并回答：

1. 本轮有没有发现 reference、workflow、checker 不够用或有误？
2. 有没有反复出现、跨页面、跨模块或跨阶段的共性问题？
3. 有没有下次 agent 也可能重复踩的坑？

任一答案为“有”时：

- 先在任务目录 `lesson_candidates.md` 写候选。
- 人工审查后，如需沉淀，再由维护命令写 lesson 详情文档并追加 Lessons SSoT。
- Lessons SSoT 的详情文档列必须指向该详情文档。

三个答案都为“没有”时，Closeout SSoT 和 Harness Ledger 仍要记录：

```text
lesson_candidates.md: no-candidate-accepted
```

## 收口要求

walkthrough 写完后，必须更新 Closeout SSoT 和 Harness Ledger。涉及回归、CI/CD、repo governance、reference 或 template 的，还要同步对应标准或 SSoT。
