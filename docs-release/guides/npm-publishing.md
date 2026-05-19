# npm 发布指南

本仓当前包名是未 scoped 的 `coding-agent-harness`，`package.json` 已声明：

```json
{
  "bin": {
    "harness": "./scripts/harness.mjs"
  }
}
```

发布到 npm 后，用户可以通过 `npm install -g coding-agent-harness` 获得全局
`harness` 命令。

## 发布前检查

```bash
npm test
npm run smoke:dashboard
node scripts/harness.mjs check --profile source-package .
node scripts/harness.mjs check --profile target-project examples/minimal-project
npm pack --dry-run --json
```

检查 `npm pack --dry-run --json` 输出，确认包含：

- `README.md`
- `SKILL.md`
- `references/`
- `templates/`
- `templates-zh-CN/`
- `scripts/`
- `docs-release/`
- `examples/`

## 首次发布

1. 确认包名可用：

   ```bash
   npm view coding-agent-harness
   ```

   如果返回 404，说明当前 registry 没有这个包名。

2. 登录 npm：

   ```bash
   npm login
   npm whoami
   ```

3. 发布未 scoped public package：

   ```bash
   npm publish
   ```

如果将来改成 scoped 包，例如 `@fairladyz625/coding-agent-harness`，public 发布命令是：

```bash
npm publish --access public
```

## 版本规则

npm 的同一个 `name@version` 发布后不能再次复用。每次重新发布前都要先 bump version：

```bash
npm version patch
npm publish
```

根据变更选择：

- `patch`：文档、修复、兼容小改动。
- `minor`：新增命令或能力，保持兼容。
- `major`：破坏性变更。

## 认证与安全

npm 当前要求发布账号满足以下之一：

- 启用 2FA。
- 使用允许 bypass 2FA 的 granular access token。

如果使用 GitHub Actions 发布，优先配置 npm trusted publishing。这样可以避免在 CI
里保存长期 npm token，并自动生成 provenance attestation。

## 推荐发布顺序

1. 合并发布 PR 到 `main`。
2. 本地或 CI 运行发布前检查。
3. 确认 `package.json` 版本。
4. `npm publish`。
5. 打 tag：

   ```bash
   git tag v$(node -p "require('./package.json').version")
   git push origin --tags
   ```

6. 验证安装：

   ```bash
   npm install -g coding-agent-harness
   harness doctor-user --agent codex
   ```

## 官方参考

- npm unscoped public package publishing: https://docs.npmjs.com/creating-and-publishing-unscoped-public-packages
- npm scoped public package publishing: https://docs.npmjs.com/creating-and-publishing-scoped-public-packages
- npm trusted publishing: https://docs.npmjs.com/trusted-publishers
- npm publish command: https://docs.npmjs.com/cli/v11/commands/npm-publish
