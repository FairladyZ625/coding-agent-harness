# Repository Governance Standard

## Repo Platform Profile

- Platform: [GitHub / GitLab / local-only / other]
- Remote: [owner/repo or URL]
- Default branch: [main / master / other]
- Repo type: [single app / monorepo / multi-repo / library / service]
- Admin access available to agent: [yes / no / unknown]

## Branch Model

- Protected branch(es):
- Feature branch naming:
- Release branch naming:
- Hotfix branch naming:
- Direct push policy:

## PR Policy

- PR required before merge:
- PR title format:
- PR body requirements:
- Required reviewers:
- Required review type:
- Merge method:
- Merge order owner:

## Required Checks

| Check | Command / Workflow | Required? | Evidence |
|-------|--------------------|-----------|----------|
| lint | [command] | yes/no | [evidence path] |
| typecheck | [command] | yes/no | [evidence path] |
| build | [command] | yes/no | [evidence path] |
| test | [command] | yes/no | [evidence path] |
| smoke | [command] | yes/no | [evidence path] |

## Branch Protection Plan

- Status: [designed / implemented / verified / blocked-with-owner]
- Required status checks:
- Required PR review count:
- Dismiss stale reviews:
- Require branches up to date:
- Block force push:
- Block deletion:
- Bypass actors:
- Verification command:
- Manual setup residual:

## Worktree Concurrency

- Max active worktrees:
- Naming pattern:
- Branch pattern:
- Ownership rule:
- Subagent worker rule: each code-changing worker uses its own worktree / branch and hands off a commit SHA
- Merge ordering rule:
- Cleanup rule:

## Evidence Status

| Item | Status | Evidence | Residual |
|------|--------|----------|----------|
| PR policy | [designed / implemented / verified / blocked-with-owner] | [path] | [residual] |
| Required checks | [designed / implemented / verified / blocked-with-owner] | [path] | [residual] |
| Branch protection | [designed / implemented / verified / blocked-with-owner] | [path] | [residual] |
| Worktree concurrency | [designed / implemented / verified / blocked-with-owner] | [path] | [residual] |
