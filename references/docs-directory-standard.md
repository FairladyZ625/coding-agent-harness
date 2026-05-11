# docs/ 目录标准

## 目的

定义项目文档目录的标准结构。所有文档按职责分层，agent 按 Task-Type Reading Matrix 按需加载。

## 标准目录结构

```
docs/
├── Harness-Ledger.md           ← 全局 harness 上下文回写总账
├── 00-RAW-PRDS/              ← 原始需求文档、PRD、用户故事
├── 01-GOVERNANCE/             ← 项目治理规则、决策记录、经验沉淀
│   ├── Lessons-SSoT.md        ← 经验沉淀建议表
│   ├── lessons/               ← 具体沉淀内容
│   └── archive/               ← 已处理条目归档
├── 02-PRODUCT/                ← 产品设计、用户流程、功能规格
├── 03-ARCHITECTURE/           ← 架构设计、技术方案、ADR
├── 04-DEVELOPMENT/            ← 开发指南、环境配置、本地开发说明
├── 05-TEST-QA/                ← 测试策略、Regression SSoT、Cadence Ledger
├── 06-INTEGRATIONS/           ← 第三方集成文档、API 对接说明
├── 07-OPERATIONS/             ← 部署、运维、监控、告警
├── 08-SECURITY/               ← 安全策略、权限模型、审计日志
├── 09-PLANNING/               ← 排期、任务计划
│   ├── TASKS/                 ← 任务目录（每个任务一个子目录）
│   │   └── _task-template/    ← 任务模板
│   └── [Feature-SSoT].md     ← 实施排期表
├── 10-WALKTHROUGH/            ← Walkthrough 收口记录
├── 11-REFERENCE/              ← 标准文件（agent 按需加载）
└── 99-TMP/                    ← 临时文件（定期清理）
```

## 裁剪规则

不是每个项目都需要全部目录。根据诊断结果裁剪：

| 目录 | 何时可省略 |
|------|-----------|
| 00-RAW-PRDS | 没有正式 PRD 流程的小项目 |
| 01-GOVERNANCE | 仅实验性 Lite 项目且明确不启用 Lessons / 归档时 |
| 02-PRODUCT | 纯技术项目（库、CLI 工具） |
| 06-INTEGRATIONS | 没有第三方集成 |
| 07-OPERATIONS | 没有部署需求（纯库） |
| 08-SECURITY | 没有安全敏感场景 |
| 99-TMP | 可选 |

以下目录是 harness 的核心，不可省略：
- 01-GOVERNANCE
- 03-ARCHITECTURE
- 05-TEST-QA
- 09-PLANNING（含 TASKS/）
- 10-WALKTHROUGH
- 11-REFERENCE

`docs/Harness-Ledger.md` 不是目录，但属于核心 harness 文件，不可省略。它是
`docs/` 根目录允许存在的全局控制文件；普通过程文件仍然不得放在根目录。

## Reference 标准文件清单

`docs/11-REFERENCE/` 下的标准文件，按项目需要选择：

| 文件 | 职责 | 必需？ |
|------|------|--------|
| testing-standard.md | 测试规范、框架选择、覆盖率要求 | 是 |
| execution-workflow-standard.md | 开发执行流程、commit 规范、PR 流程 | 是 |
| long-running-task-standard.md | 长程任务合同、连续执行权限、review loop、停止条件 | 是 |
| docs-library-standard.md | 文档治理规范、命名规则、归档规则 | 是 |
| harness-ledger-standard.md | Harness Ledger 写入规范、closeout 检查 | 是 |
| regression-ssot-governance.md | Regression SSoT 治理规范 | Standard+ |
| walkthrough-standard.md | Walkthrough 写作规范 | 是 |
| worktree-standard.md | Worktree 命名、分支、清理规范 | Standard+ |
| engineering-standard.md | 工程规范、代码风格、架构约束 | 推荐 |
| frontend-standard.md | 前端规范（如有前端） | 按需 |
| api-standard.md | API 设计规范（如有 API） | 按需 |
| security-standard.md | 安全规范（如有安全需求） | 按需 |
| deployment-standard.md | 部署规范（如有部署需求） | 按需 |
| debugging-playbook.md | 调试经验手册 | 推荐 |
