# 经验沉淀治理（Lessons Governance）

## 核心思路

Lessons 不再使用一张手工维护的全局表。原因很简单：lesson candidate 是任务收口时的审查材料，promotion 是后续治理动作；把两者都塞进共享表，会让多个 agent 争抢同一个文件，也会让表和任务本地事实漂移。

新的事实来源只有三层：

| 层级 | 文件 | 职责 |
| --- | --- | --- |
| 任务本地队列 | `coding-agent-harness/planning/**/lesson_candidates.md` | 记录候选、拒绝、无候选、排队 promotion 和人工判定 |
| 任务本地详情 | `coding-agent-harness/planning/**/lessons/LC-*.md` | 在源任务上下文还新鲜时写完整 lesson 正文，供后续沉淀任务读取 |
| Promoted lesson 详情 | `coding-agent-harness/governance/lessons/L-YYYY-MM-DD-NNN-<slug>.md` | 记录已接受、可复用、需要后续治理合入的经验 |

`coding-agent-harness/governance/generated/Harness-Ledger.md` 和 `coding-agent-harness/governance/generated/Closeout-Index.md` 只记录 closeout 结果：
`checked-candidate:<LC-ID>`、`queued-promotion:<LC-ID>`、`checked-created:<L-ID>` 或历史兼容的 `checked-none:<reason>`。

## 目录结构

```text
coding-agent-harness/governance/
├── lessons/                     ← promoted lesson 详情文档
│   ├── L-2026-05-07-001-xxx.md
│   └── ...
└── archive/                     ← 已合入或废弃的历史详情归档

coding-agent-harness/planning/tasks/<task-id>/
├── lesson_candidates.md          ← 候选索引和人工路由状态
└── lessons/
    └── LC-YYYYMMDD-NNN.md        ← task-local detail artifact
```

## 触发时机

在 Walkthrough 收口流程中，写完 Walkthrough 并更新 Feature / Regression / Closeout / Ledger 之后，Agent 执行经验沉淀检查：

1. 这次开发中有没有发现现有 reference 不够用或有误的地方？
2. 有没有值得固化为规范的新模式或新做法？
3. 有没有踩坑经验值得记录，避免下次重复？
4. 有没有架构层面的洞察，值得更新架构文档？

如果任何一条答案是“有”，先写入任务目录的 `lesson_candidates.md`。当候选进入
`needs-promotion` 时，Agent 必须同步写出任务本地 `lessons/LC-*.md` 详情文件，并在
`Detail Artifact` 列链接它；后续沉淀任务读取这个详情文件，不从表格 brief 复写正文。

人工决定后只允许以下任务级状态：

- `no-candidate-accepted`：接受本轮没有可复用 lesson。
- `needs-promotion`：至少一个候选已排队进入治理沉淀。
- `promoted`：维护命令已经创建 promoted lesson 详情文档，并回写源 candidate。
- `rejected`：候选已带理由拒绝。

`needs-promotion` 不阻塞任务 closeout，但必须在 Closeout Index / Harness Ledger 中记录 `queued-promotion: LC-YYYYMMDD-NNN`，并由后续维护任务处理。模块级候选还必须填写 `Module Key`，避免沉淀任务丢失模块边界。`promoted` 或人工直接创建详情文档时记录 `checked-created: L-YYYY-MM-DD-NNN`。如果没有候选，记录 `checked-candidate: LC-...` 或 `checked-none: <reason>`；`checked-none` 只用于旧任务兼容或没有 candidate 文件的历史收口。

## Promotion 执行

promotion 只写 promoted 详情文档和源 candidate，不写共享 Lessons 表：

1. 读取源任务 `lesson_candidates.md` 中的 `Detail Artifact` 指向的任务本地详情文件。
2. 选择 `templates/lessons/` 下的对应模板，或由 `lesson-promote --apply` 创建 promoted 详情文档。
3. promoted 详情文档写清背景、现状问题、建议改动、影响范围和冲突声明。
4. 回写源任务 `lesson_candidates.md`：对应候选标记为 `promoted`，并记录 `promoted:<L-ID>`。
5. 在 Closeout Index / Harness Ledger 中记录 `checked-created:<L-ID>` 或 `queued-promotion:<LC-ID>`。

`lesson-promote --apply` 是 CLI-owned 机械写入：目标仓库必须是干净 Git root，
命令会加 governance lock，只允许提交新 lesson detail 和源任务 `lesson_candidates.md`。
如果存在 unrelated dirty diff，命令必须拒绝，让 coordinator 先提交、归属或记录 no-commit reason。

如果四个问题的答案全是“没有”，也不能静默跳过。新任务必须在 `lesson_candidates.md` 中使用 `no-candidate-accepted` 并填写 No-Candidate Reason；旧任务可在 Closeout Index 和 Harness Ledger 中记录 `checked-none: <一句话原因>`。

## Closeout 判定

收口时只允许以下合格状态：

- `checked-created: L-YYYY-MM-DD-NNN`：发现可沉淀经验，已创建 promoted lesson 详情文档。
- `queued-promotion: LC-YYYYMMDD-NNN`：人工确认候选值得沉淀，但交给维护命令后续提升。
- `checked-candidate: LC-YYYYMMDD-NNN`：人工已审查 candidate 文件，结论为无候选或全部拒绝。
- `checked-none: <reason>`：旧任务兼容状态，已完整检查且没有 candidate 文件。

以下状态不合格：

- 只在 walkthrough 或 progress 中说“无 lessons”，但 Closeout Index / Harness Ledger 没有记录。
- 新任务跳过 `lesson_candidates.md`，只用 `checked-none` 代替 candidate 判定。
- 用 `n/a` 代替检查结果，除非任务是纯只读分析且没有 closed ledger row。
- `checked-created:<L-ID>` 指向的 `coding-agent-harness/governance/lessons/*.md` 不存在。

## 沉淀类型

| Type | 说明 |
| --- | --- |
| `ref-change` | 修改现有 reference 文档 |
| `new-doc` | 新增文档/规范 |
| `arch-change` | 架构层面的改动建议 |
| `process-change` | 流程/工作方式的改动建议 |

## 冲突处理规则

### 规则 1：写之前必须查重

Agent 在产出任何 promoted lesson 之前，必须查看：

- 任务本地 `lesson_candidates.md`
- 任务本地 `lessons/LC-*.md`
- `coding-agent-harness/governance/lessons/*.md`
- 目标 reference / template / checker

目的是确认是否已有同一 target、同一问题或冲突建议。

### 规则 2：副本始终基于正式版本

无论已有多少个待处理 lesson 指向同一个 target，新的副本始终基于当前正式 reference 的最新版本，不基于任何未合入的 pending 副本。

原因：人可能选择不采纳之前的 pending 改动。如果基于别人未合入的副本去改，一旦那个被 reject，改动就建立在错误基础上。

### 规则 3：以解决冲突的方式编写

如果发现已有 lesson 指向同一 target，Agent 必须：

1. 读取那个 lesson 的内容，了解对方想改什么。
2. 在自己的详情文档中，以解决冲突的方式编写。
3. 在“冲突声明”中明确说明看到了哪个 lesson，自己的建议如何兼容或取代它。
4. 独立基于正式版本编写，不直接修改对方详情文档。

### 规则 4：人做最终聚合

当多个 lesson 指向同一 target 时，人在审批时可以：

- 逐个 approve，按顺序合入。
- 一次性看所有 pending 改动，做聚合后合入。
- reject 部分，approve 部分。
- 要求 Agent 基于审批结果重新生成一个合并版本。

## 状态流转

```text
lesson_candidates.md:
pending-review -> needs-promotion -> promoted
               -> rejected
               -> no-candidate-accepted

lesson detail docs:
pending governance integration -> approved -> merged
                                -> rejected
                                -> superseded
```

## 归档机制

当 `coding-agent-harness/governance/lessons/` 中已合入或废弃的详情文档过多时，可以把 `merged`、`rejected`、`superseded` 的文档移入 `coding-agent-harness/governance/archive/`。不要归档仍被 Closeout Index 或 Harness Ledger 当前行引用的文档，除非同步更新引用。

## 人的审批工作流

1. 打开 dashboard 的 Lessons 队列，或搜索任务本地 `lesson_candidates.md` 中的 `needs-promotion`。
2. 查看候选行的 `Detail Artifact`，确认任务本地详情正文足够完整。
3. 需要提升时创建后续 sedimentation task，或批准 `lesson-promote --apply`。
4. 查看生成的 `coding-agent-harness/governance/lessons/*.md`。
5. 有冲突的 lesson 一起审。
6. 批准后由维护任务更新目标 reference / template / checker。

## 合入执行

当 Agent 获得明确的人审批准后：

- `ref-change`：按 lesson 详情更新正式 reference。
- `new-doc`：将 lesson 建议落到正式建议路径。
- `arch-change`：按建议更新架构文档。
- `process-change`：按建议更新流程文档或 CLI/checker。

合入任务收口时，必须在 `coding-agent-harness/governance/generated/Harness-Ledger.md` 的当前任务 row 中记录 `checked-created:<L-ID>`、`queued-promotion:<LC-ID>` 或 `checked-candidate:<LC-ID>`。
