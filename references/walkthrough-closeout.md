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
- [Review Report: review.md 路径、material finding 状态、no-finding 结论]

## Residual
- [遗留问题1]
- [遗留问题2]

## Lessons Reflection
- 本轮有没有发现 reference / workflow / checker 不够用或有误：[有/无，写一句理由]
- 有没有反复出现、跨页面/跨模块/跨阶段的共性问题：[有/无，写一句理由]
- 有没有下次 agent 也可能重复踩的坑：[有/无，写一句理由]
- Lessons 结果：[checked-created: L-YYYY-MM-DD-NNN / queued-promotion: LC-YYYYMMDD-NNN / checked-candidate: LC-YYYYMMDD-NNN / checked-none: 一句话原因]
- Lessons Detail Doc：[如 checked-created，填 `docs/01-GOVERNANCE/lessons/...md`；如 queued/checked-candidate，填 `lesson_candidates.md` 和任务本地 `lessons/LC-...md`；否则写"无"]

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

Closeout SSoT:

```text
docs/10-WALKTHROUGH/Closeout-SSoT.md
```

## 规则

1. **每个 wave 必须有 walkthrough** — 没有 walkthrough 的 wave 视为未完成
2. **Walkthrough 必须包含 residual** — 即使没有遗留问题，也要显式写“无 residual”
3. **Walkthrough 必须引用验证结果** — 跑了什么、结果是什么
4. **如有 review.md，Walkthrough 必须引用审查结论** — material findings、no-finding statement、accepted residual 必须可追溯
5. **Walkthrough 必须包含 Lessons Reflection** — 写 walkthrough 时就要反思共性问题、反复问题、下一轮 agent 可能重复踩的坑
6. **Walkthrough 不是代码注释** — 不需要逐行解释代码，重点是决策、验证和可复用教训
7. **Walkthrough 完成后必须执行经验沉淀检查** — 见下方“经验沉淀检查”章节
8. **收口后必须更新 Harness Ledger** — 记录本轮上下文回写是否完成
9. **收口后必须更新 Closeout SSoT** — 每个 `closed` / `closed-with-residual` / `closed-local-only` 的 Harness Ledger row 必须有 Closeout SSoT row

## Closeout SSoT 规则

`Closeout-SSoT.md` 是 walkthrough 是否写入的硬门槛，不是目录索引。

每个 closed 任务必须满足一项：

1. `Walkthrough` 列写入 `docs/10-WALKTHROUGH/<file>.md`
2. `Walkthrough` 列写入受控 skip reason

允许的 skip reason 只有：

- `walkthrough skipped-with-reason: docs-only`
- `walkthrough skipped-with-reason: no-runtime`
- `walkthrough skipped-with-reason: superseded`
- `walkthrough skipped-with-reason: historical-backfill`
- `walkthrough skipped-with-reason: owner-deferred`

如果任务是 implementation wave，默认必须写 walkthrough；skip reason 只用于 docs-only、历史补录、被后续收口取代、或需要 owner 另行决定的场景。

## 经验沉淀检查

写完 Walkthrough 并更新 Feature/Regression SSoT 之后，Agent 必须执行以下自检：

1. 这次开发中有没有发现现有 reference 不够用或有误的地方？
2. 有没有值得固化为规范的新模式/新做法？
3. 有没有踩坑经验值得记录，避免下次重复？
4. 有没有架构层面的洞察，值得更新架构文档？

这一步不是普通勾选。写 walkthrough 时，Agent 必须主动从“这次做了什么”切换到
“下次怎样避免重复问题”的复盘视角，尤其检查：

- 同一类问题是否跨多个文件、页面、阶段或 review round 反复出现？
- 本轮是否暴露了 prompt、模板、checker 或 reference 没有强制到位的地方？
- 有没有某个动作虽然已有规范，但 agent 没有主动执行？

如果任何一条答案是“有”：

1. 查找任务本地 `lesson_candidates.md`、任务本地 `lessons/LC-*.md` 和 `docs/01-GOVERNANCE/lessons/*.md`
2. 按 `references/lessons-governance.md` 中的规则处理冲突
3. 先在任务目录 `lesson_candidates.md` 中登记候选；候选进入 `needs-promotion` 时同步写任务本地 `lessons/LC-*.md` 详情文件并在 `Detail Artifact` 链接
4. 人工确认后，如需沉淀，使用 maintenance CLI 写入 `docs/01-GOVERNANCE/lessons/` promoted 详情文档
5. 在 Closeout SSoT 和 Harness Ledger 中记录 `queued-promotion: LC-...` 或 `checked-created: L-YYYY-MM-DD-NNN`

如果所有答案都是“没有”，不能静默跳过；在 Closeout SSoT 和 Harness Ledger 中记录
新任务在 `lesson_candidates.md` 中写 `no-candidate-accepted` 和 No-Candidate Reason；旧任务可记录
`checked-none: <一句话原因>`。

## Harness Ledger 回写

写完 Walkthrough、更新 Regression SSoT 或其他本轮实际触达的非任务生命周期 SSoT，并完成 Lessons 检查后，Agent 必须更新
`docs/10-WALKTHROUGH/Closeout-SSoT.md`；任务生命周期总账由 CLI 重新生成 `docs/Harness-Ledger.md`：

1. 为本轮任务追加或更新对应 `HL-*` 条目
2. 记录 Task Plan、Regression SSoT、Review Report、Walkthrough、Lessons Check 的结果
3. 列出本轮触碰的 harness 文档
4. 如有未完成项，使用 `missing` 或 `skipped-with-reason` 并写明 residual

没有 Harness Ledger 条目或 Closeout SSoT 条目的 wave，不视为完整 closed。

## 为什么 Walkthrough 有效

- 下一轮 agent 开始工作前,读最近几篇 walkthrough 就能快速了解项目当前状态
- Residual 列表是下一轮任务的输入源之一
- 关键决策记录避免后续 agent 推翻已经验证过的架构选择
- 可追溯性:413 篇 walkthrough = 413 次可查的交接记录
