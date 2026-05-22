# Repository Governance Standard

## 核心思路

Harness 不是只生成文档骨架。每个项目必须有项目级 repository governance contract，
明确分支、PR、merge、review、required checks、worktree 并发和权限残项。

如果某些设置因为权限不足无法自动配置，agent 不能把它们当作完成；必须记录为
`blocked-with-owner` 或 `manual-setup-residual`。

## 存放位置

标准文件：

```text
docs/11-REFERENCE/repo-governance-standard.md
```

如果项目需要更详细的 CI/CD 说明，另见：

```text
docs/11-REFERENCE/ci-cd-standard.md
```

## 必填字段

每个项目必须定制以下内容：

### Repo Platform Profile

- Platform: [GitHub / GitLab / local-only / other]
- Remote: [owner/repo or URL]
- Default branch: [main / master / other]
- Repo type: [single app / monorepo / multi-repo / library / service]
- Admin access available to agent: [yes / no / unknown]

### Branch Model

- Protected branch(es)
- Feature branch naming
- Release branch naming, if any
- Hotfix branch naming, if any
- Direct push policy

### PR Policy

- PR required before merge: [yes / no]
- PR title format
- PR body requirements
- Required reviewers
- Required review type: [self / subagent / external / human]
- Merge method: [squash / merge commit / rebase]
- Who decides merge order

### Required Checks

List every check required before merge:

| Check | Command / Workflow | Required? | Evidence |
|-------|--------------------|-----------|----------|
| lint | [command] | yes/no | [where result is recorded] |
| typecheck | [command] | yes/no | [where result is recorded] |
| build | [command] | yes/no | [where result is recorded] |
| test | [command] | yes/no | [where result is recorded] |
| smoke | [command] | yes/no | [where result is recorded] |

### Branch Protection Plan

Branch protection status must use one of:

- `designed`
- `implemented`
- `verified`
- `blocked-with-owner`

Required fields:

- Required status checks
- Required PR review count
- Dismiss stale reviews: [yes / no]
- Require branches up to date: [yes / no]
- Block force push: [yes / no]
- Block deletion: [yes / no]
- Bypass actors, if any
- Verification command or manual setup residual

### Worktree Concurrency

- Max active worktrees
- Naming pattern
- Branch pattern
- Ownership rule
- Subagent worker rule: each code-changing worker uses its own worktree / branch and hands off a commit SHA
- Checkpoint commit rule: verified, meaningful slices are committed proactively; deferred commits require an explicit reason
- Merge ordering rule
- Cleanup rule

## Evidence Status Model

Every governance item must be marked as:

| Status | Meaning |
|--------|---------|
| `designed` | Plan exists, not implemented |
| `implemented` | File / workflow / config exists |
| `verified` | Live or local verification passed |
| `blocked-with-owner` | Cannot finish without named owner/action |

Agent must not describe `designed` as complete.

## GitHub Default Adapter

For GitHub repositories, the default implementation should include:

- `.github/pull_request_template.md`
- `.github/workflows/ci.yml` or an explicit reason why CI is impossible
- branch protection plan for `main`
- required checks matching actual workflow job names
- review routing rule aligned with `review-routing-standard.md`

If the agent has GitHub admin permissions, it should verify branch protection with `gh api`.
If not, it must write manual setup residual with owner and exact settings.

## Completion Rule

Bootstrap is not complete unless repository governance is at least:

- PR policy: `implemented`
- Required checks: `implemented`
- Branch protection: `designed` with residual, or `verified`
- Worktree concurrency: `implemented`
- Harness checker: passing or blocked-with-owner with explicit residual
- Checkpoint commit rule: `implemented`
