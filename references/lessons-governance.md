# 经验沉淀治理（Lessons Governance）

## 核心思路

Agent 在 Walkthrough 收口时自动识别可沉淀的经验，写入 Lessons SSoT 并将详细内容落到 `docs/01-GOVERNANCE/lessons/` 目录。人审批后决定是否合入正式 reference。

这是 harness 的第三条 SSoT 轨道：

| SSoT | 管什么 | 位置 |
|------|--------|------|
| Feature SSoT | 实施排期 | `docs/09-PLANNING/` |
| Regression SSoT | 回归控制 | `docs/05-TEST-QA/` |
| **Lessons SSoT** | **经验沉淀** | **`docs/01-GOVERNANCE/`** |

## 目录结构

```
docs/01-GOVERNANCE/
├── Lessons-SSoT.md              ← 沉淀建议表（SSoT）
├── lessons/                     ← 具体沉淀内容存放
│   ├── 2026-05-07-L001-xxx.md   ← 单条沉淀建议的详细内容
│   └── ...
└── archive/                     ← 已处理的历史条目归档
    └── Lessons-SSoT-archive-YYYY-QN.md
```

## 触发时机

在 Walkthrough 收口流程中，写完 Walkthrough 并更新 Feature/Regression SSoT 之后，Agent 执行经验沉淀检查：

1. 这次开发中有没有发现现有 reference 不够用或有误的地方？
2. 有没有值得固化为规范的新模式/新做法？
3. 有没有踩坑经验值得记录，避免下次重复？
4. 有没有架构层面的洞察，值得更新架构文档？

如果任何一条答案是"有"，就写入 Lessons SSoT。

## 沉淀类型

| Type | 说明 |
|------|------|
| `ref-change` | 修改现有 reference 文档 |
| `new-doc` | 新增文档/规范 |
| `arch-change` | 架构层面的改动建议 |
| `process-change` | 流程/工作方式的改动建议 |

## 冲突处理规则

### 规则 1：写之前必须读 SSoT

Agent 在产出任何沉淀建议之前，**必须完整读一遍 Lessons SSoT**，了解：
- 当前有哪些 pending 条目
- 是否有人已经对同一个 target 提出了改动
- 当前各条目的状态

### 规则 2：副本始终基于正式版本

无论 SSoT 上有多少个 pending 的改动指向同一个 target，新的副本**始终基于当前正式 reference 的最新版本**，不基于任何未合入的 pending 副本。

**原因**：人可能选择不采纳之前的 pending 改动。如果基于别人未合入的副本去改，一旦那个被 reject，改动就建立在错误基础上。

### 规则 3：以解决冲突的方式编写

如果发现有 pending 条目指向同一 target，Agent 必须：
1. 读取那个 pending 条目的内容（了解对方想改什么）
2. 在自己的副本中，以"解决冲突"的方式编写——即：假设对方的改动最终也会被采纳，自己的改动应该与之兼容
3. 在"冲突声明"中明确说明：我看到了 L-XXX 的改动，我的副本已考虑兼容
4. 但**不是在对方副本之上修改**，而是独立基于正式版本编写

### 规则 4：人做最终聚合

当多个 pending 条目指向同一 target 时，人在审批时可以：
- 逐个 approve，按顺序合入
- 一次性看所有 pending 改动，做聚合后合入
- reject 部分，approve 部分
- 要求 Agent 基于审批结果重新生成一个合并版本

### 规则 5：SSoT 表标记冲突

当新条目与已有 pending 条目指向同一 target 时，两个条目的 Conflict 列都要标记对方的 ID。人一眼就能看到"这两个要一起审"。

## 状态流转

```
🟡 pending → 🟢 approved → ✅ merged
                         ↘ (人决定不合入) → ❌ rejected
          → 🔀 superseded (被后续条目取代)
```

## 归档机制

### 触发条件
- Active Lessons 表超过 **20 条**时，将所有 `✅ merged` 和 `❌ rejected` 的条目移入归档
- 人也可以手动触发归档

### 归档格式
```
docs/01-GOVERNANCE/archive/Lessons-SSoT-archive-YYYY-QN.md
```

### 归档后
- Active 表只保留 `🟡 pending` / `🟢 approved` / `🔀 superseded` 的条目
- 归档文件保留完整历史，可追溯

## 人的审批工作流

1. 打开 `Lessons-SSoT.md`，看 Active 表里有没有 🟡 pending 的条目
2. 看 Summary 列，大部分情况一句话就能判断
3. 需要细看就点进 Detail 路径，看完整副本和改动理由
4. 有冲突的条目一起审（看 Conflict 列）
5. 批准后改状态为 🟢 approved
6. Agent 下次看到 approved 状态就执行合入，完成后改为 ✅ merged

## 合入执行

当 Agent 发现 Lessons SSoT 中有 `🟢 approved` 状态的条目时：
- `ref-change`：用 lessons/ 中的副本替换正式 reference
- `new-doc`：将 lessons/ 中的内容移动到建议路径
- `arch-change`：按建议更新架构文档
- `process-change`：按建议更新流程文档

合入完成后，状态改为 `✅ merged`。
