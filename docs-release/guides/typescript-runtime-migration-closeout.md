# TypeScript Runtime Migration Closeout

This closeout records the public package rule after the progressive JavaScript to
TypeScript runtime migration. The package now executes committed
`dist/**/*.mjs` artifacts, while `scripts/**/*.mts` and `tests/**/*.mts` are the
source ownership surfaces. Historical checked-in `scripts/**/*.mjs` and
`tests/**/*.mjs` shims have been removed after the dist observation gates passed.

## Current State

All Node runtime and test sources under `scripts/` and `tests/` are now
TypeScript-first:

- `scripts/**/*.mts` builds to committed `dist/**/*.mjs` artifacts.
- `tests/**/*.mts` runs through the built test runner.
- `dist/**/*.mjs` is the package runtime surface for npm bin, npm scripts, and
  postinstall.
- `scripts/**/*.mjs` and `tests/**/*.mjs` have a final inventory of zero.

The npm package publishes `dist/` and no longer publishes `scripts/` or `tests/`.
This keeps installed execution independent from TypeScript source files and from
the deleted historical shims.

## Runtime Contract

The package is an ESM package and its current public runtime contract points at
the committed dist build output:

- `package.json` maps the `harness` executable to `dist/harness.mjs`.
- npm postinstall runs `dist/postinstall.mjs`.
- npm helper scripts such as `check`, `status`, and dashboard generation run
  through `dist/harness.mjs`.
- Runtime modules import sibling `.mjs` files inside `dist/`, so installed
  package execution does not depend on TypeScript loaders.

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

## Cleanup Gate

The deletion PR must prove all of the following:

- package `bin` and `postinstall` still work from a packed tarball;
- installed package execution works with a temp `HOME` and PATH isolated to the
  temp consumer `node_modules/.bin`;
- `npm pack --dry-run --json` includes the intended runtime files and excludes
  private, temporary, and test-only material;
- snapshot matrix has no blocking drift;
- real target smoke passes;
- the PR is independently revertible by restoring the deleted shims and package
  script references without reverting the earlier dist runtime cutover.

After those gates pass, `dist/**/*.mjs` remains the supported package execution
surface. Preset `.mjs` hooks and dashboard browser `.js` assets remain documented
exceptions, not unfinished CLI runtime migration work.
