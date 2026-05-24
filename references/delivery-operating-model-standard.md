# Delivery Operating Model Standard

## 核心思路

Harness 不能默认只有“一人主控 + 多 agent worktree”一种场景。项目启动时必须先识别
delivery operating model：谁负责拆分工作、几个仓库/团队并行、agent 能看到哪些上下文、
接口合同如何冻结、冲突和 merge 顺序由谁裁决。

代码结构回答“项目是什么”，delivery operating model 回答“人和 agent 怎么交付”。

## 存放位置

```text
docs/11-REFERENCE/delivery-operating-model-standard.md
```

如项目是多人或多仓交付，还应创建：

```text
docs/09-PLANNING/Delivery-SSoT.md
```

## 必填字段

### Operating Model Profile

- Model: `solo-orchestrator` / `team-feature-lead` / `split-repo-contract` / `program-multi-repo` / `waterfall-stage-gate` / `kanban-continuous`
- Team shape: single human, multiple humans, multiple humans with personal agents, or mixed
- Repo topology: single repo, monorepo, split frontend/backend repos, or program of repos
- Primary planning owner
- Merge/integration owner
- Release owner
- Agent visibility: full repo, package-scoped, API-doc-only, design-doc-only, or other

### Work Decomposition Rule

Define who breaks roadmap work into feature blocks:

| Level | Owner | Artifact | Rule |
|-------|-------|----------|------|
| Roadmap | [owner] | [SSoT / issue tracker] | [how priority is chosen] |
| Feature block | [owner] | `Delivery-SSoT.md` / generated Harness Ledger | [how blocks are bounded] |
| Task | [owner] | `docs/09-PLANNING/TASKS/<task>/task_plan.md` | [who can start work] |
| Review | [owner] | `review.md` / PR review | [required reviewers] |
| Integration | [owner] | PR / release branch / integration branch | [merge order] |

### Model-Specific Contracts

#### solo-orchestrator

Use when one human directs multiple agents across worktrees.

- One generated Harness Ledger is enough for ordinary task lifecycle tracking.
- Worktree concurrency is central.
- Merge order is human-decided.
- Cross-task conflicts are managed by task ownership and shared-file notices.

**模块并行扩展**：当项目有 2+ 个可独立演进的功能域时，启用模块并行开发（见 `references/module-parallel-standard.md`）。此时：

- Module Registry 管模块边界；Harness Ledger 生成全局任务生命周期索引
- 每个模块一个长期 worktree（`codex/<module-key>`）
- 模块间通过 write scope 声明避免冲突
- 跨模块修改走独立的基础设施 task
- 发布 = git tag + 包含的步骤 ID 列表

#### team-feature-lead

Use when a lead decomposes sprint/week work into feature blocks and several developers each direct agents.

- `Delivery-SSoT.md` is required.
- Each feature block must have owner, repo/package scope, shared files, dependencies, integration order, and acceptance gates.
- Shared files require owner-lock or explicit sequencing.
- Agents must not start unassigned work just because it appears in the backlog.

#### split-repo-contract

Use when frontend/backend or app/service repos remain separate.

- Each repo may have its own harness.
- Cross-repo work must be driven by an interface contract, not by agents reading both repos freely.
- Frontend agents may only rely on API schema, mock server, OpenAPI/GraphQL contract, example payloads, and agreed error semantics unless granted backend read access.
- Backend agents may only rely on frontend consumption contract and product acceptance notes unless granted frontend read access.
- Contract changes require paired PRs or a compatibility window.

#### program-multi-repo

Use when a main project coordinates several child repos.

- Program-level Delivery SSoT is required.
- Each repo keeps its own repo governance, CI/CD, and Regression SSoT.
- Integration owner decides merge order and release train.
- Cross-repo residuals must be represented in the program SSoT and child repo Harness Ledgers.

#### waterfall-stage-gate

Use when work passes through formal stages: requirements, design, implementation, verification, release.

- Stage entry/exit criteria must be explicit.
- Agents cannot skip design/review gates just because code is ready.
- Walkthrough and Closeout SSoT map to stage closeout, not only feature closeout.

#### kanban-continuous

Use when work flows continuously without sprint batches.

- WIP limits replace sprint allocation.
- Delivery SSoT can be lightweight but must record active owners, blocked items, and integration order.
- Closeout rules are identical: review, evidence, walkthrough/skip reason, Harness Ledger.

## Delivery SSoT Minimum Columns

| Block ID | Feature / Work Block | Owner | Agent Scope | Repo(s) | Dependencies | Shared Files / Contracts | Integration Order | Acceptance Gates | Status |
|----------|----------------------|-------|-------------|---------|--------------|--------------------------|-------------------|------------------|--------|

Status must use:

- `planned`
- `assigned`
- `in-progress`
- `blocked`
- `ready-for-integration`
- `integrated`
- `closed`

## Cross-Repo Interface Contract

For split frontend/backend work, every contract-bearing feature must define:

- API/schema source of truth
- request/response examples
- error semantics
- compatibility rule
- mock/stub strategy
- owner for breaking changes
- verification command on each side

## Completion Rule

Bootstrap is incomplete unless the project has:

1. A selected delivery operating model.
2. A named planning/integration owner, even if both are the same person.
3. A rule for feature block assignment.
4. A rule for cross-repo or shared-file conflict handling.
5. A Delivery SSoT when the selected model is team, split-repo, program, waterfall, or kanban with multiple people.
