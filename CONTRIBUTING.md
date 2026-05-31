# Contributing

Thanks for helping improve Coding Agent Harness.

This root file is the short GitHub entrypoint for contributors. The full
contributor guide lives in
[`docs-release/guides/contributing.md`](docs-release/guides/contributing.md).

## Start Here

- Use Node.js 24 or newer.
- Create a focused branch from the latest `main`.
- Keep pull requests scoped to one change family when possible.
- Run the checks that match your change and record the results in the PR.

## Common Checks

For docs-only changes, run:

```bash
git diff --check
```

For code, templates, presets, dashboard, package-surface, or GUI changes, use
the full guide:

- [Contributor Guide](docs-release/guides/contributing.md)
- [中文贡献者指南](docs-release/guides/contributing.zh-CN.md)

## Pull Requests

Use the repository PR template and include what changed, why it matters,
verification evidence, version impact, checks not run, and known residual risk.

Do not commit local generated dashboards, temporary output directories,
credentials, editor files, machine-specific environment files, or ignored
local-only Harness state.
