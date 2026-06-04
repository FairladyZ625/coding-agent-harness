# TypeScript Runtime Migration Closeout

This closeout records the public package rule after the progressive JavaScript to
TypeScript runtime migration. The package executes generated `dist/**/*.mjs`
artifacts, while `scripts/**/*.mts` and `tests/**/*.mts` are the source ownership
surfaces. Historical checked-in `scripts/**/*.mjs` and `tests/**/*.mjs` shims
have been removed after the dist observation gates passed.

## Current State

All Node runtime and test sources under `scripts/` and `tests/` are now
TypeScript-first:

- `scripts/**/*.mts` builds to generated `dist/**/*.mjs` artifacts.
- `tests/**/*.mts` runs through the built test runner.
- `dist/**/*.mjs` is the package runtime execution surface for npm bin and
  installed execution. It is not a public deep-import API. Source checkout npm
  scripts refresh it before running.
- `scripts/**/*.mjs` and `tests/**/*.mjs` have a final inventory of zero.

The source repository ignores `dist/`, but the npm package publishes generated
`dist/` and no longer publishes `scripts/` or `tests/`. This keeps installed
execution independent from TypeScript source files and from the deleted
historical shims.

## Final Closeout Evidence

The TS-first runtime closeout is based on the PR-28 deletion gate plus the PR-29
final inventory:

- final `scripts/` and `tests/` JavaScript shim inventory is zero;
- packed package file inventory includes `dist/` and excludes `scripts/` and
  `tests/`;
- Node 24 tarball smoke proved installed `harness` commands execute from
  `dist/` with a temporary `HOME` and PATH isolated to the temp consumer
  `node_modules/.bin`;
- source-package and target-project checks pass through `dist/harness.mjs`;
- snapshot matrix reported no blocking drift after shim deletion.

That means remaining package-included JavaScript is not unfinished CLI/test
runtime migration work. The remaining files are the documented preset and
dashboard exceptions below.

## Runtime Contract

The package is an ESM package. Its public package contract is the `harness`
binary plus `package.json` metadata; generated dist files are internal runtime
implementation used by that binary:

- `package.json` maps the `harness` executable to `dist/harness.mjs`.
- npm postinstall runs the source-safe `postinstall.mjs` bootstrap, which
  delegates to `dist/postinstall.mjs` after generating `dist/` in a source
  checkout.
- npm helper scripts such as `check`, `status`, and dashboard generation run
  through `run-dist.mjs`, which refreshes `dist/` in a source checkout and then
  runs the relevant dist entrypoint.
- Runtime modules import sibling `.mjs` files inside `dist/`, so installed
  package execution does not depend on TypeScript loaders.
- External consumers should not import `dist/lib/*` or other deep runtime paths.
  Package `exports` intentionally denies those paths.

The PR-27 observation gate proved the package was dist-primary before deletion.
The PR-28 deletion gate keeps that proof executable by requiring final inventory
counts of zero for `scripts/**/*.mjs` and `tests/**/*.mjs`, package dry-run with
no `scripts/**` or `tests/**`, snapshot matrix, and Node 24 tarball smoke.

## Documented Exceptions

The following package-included JavaScript files are not part of the Node runtime
source-twin cleanup target.

| Path | Reason To Keep |
| --- | --- |
| `presets/legacy-migration/checks/preset-check.mjs` | Preset executable hook. It belongs to the preset extension surface, not core runtime migration. |
| `presets/legacy-migration/scripts/plan-work-queue.mjs` | Preset helper script loaded as packaged preset material. |
| `presets/legacy-migration/scripts/scaffold-task-contracts.mjs` | Preset helper script loaded as packaged preset material. |
| `templates/dashboard/assets/app-src/*.js` | Browser dashboard source assets. They are shipped as template assets, not Node runtime modules. |
| `templates/dashboard/assets/app.js` | Built browser dashboard bundle. Keep until a separate dashboard asset pipeline replaces it. |
| `templates/dashboard/assets/i18n.js` | Browser dashboard localization asset. |
| `templates/dashboard/assets/markdown-reader.js` | Browser dashboard helper asset. |
| `templates/dashboard/assets/mermaid-renderer.js` | Browser dashboard helper asset. |

These files should not be deleted by a runtime `.mjs` cleanup PR. If they are
migrated later, use a dedicated preset or dashboard asset migration plan with its
own package and browser checks.

## Future Cleanup Gate

Any future PR that removes or migrates the remaining preset/dashboard JavaScript
exceptions must prove all of the following for its own surface:

- package `bin` and `postinstall` still work from a packed tarball;
- installed package execution works with a temp `HOME` and PATH isolated to the
  temp consumer `node_modules/.bin`;
- `npm pack --dry-run --json` includes the intended runtime files and excludes
  private, temporary, and test-only material;
- snapshot matrix has no blocking drift;
- real target smoke passes;
- the PR is independently revertible without reverting the earlier dist runtime
  cutover or the PR-28 historical shim deletion.

`dist/**/*.mjs` remains the supported package execution surface for the CLI, not
a public import API. Preset `.mjs` hooks and dashboard browser `.js` assets
remain documented exceptions, not unfinished CLI runtime migration work.
