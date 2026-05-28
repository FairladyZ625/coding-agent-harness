# TypeScript Runtime Migration Closeout

This closeout records the public package rule after the progressive JavaScript to
TypeScript runtime migration.

## Current State

All Node runtime and test `.mjs` files under `scripts/` and `tests/` now have an
explicit TypeScript source twin:

- `scripts/**/*.mjs` has adjacent `scripts/**/*.mts`.
- `tests/**/*.mjs` has adjacent `tests/**/*.mts`.
- Checked-in `.mjs` files remain the package runtime surface.
- `.mts` files are the source ownership surface.

The package still publishes both surfaces. This is intentional: Node users,
package `bin`, postinstall, tests, and internal runtime imports execute `.mjs`
files. The `.mjs` files are generated runtime shims, not stale source files.

## Why `.mjs` Stays

The package is an ESM package and its public runtime contract points at
JavaScript entrypoints:

- `package.json` maps the `harness` executable to `scripts/harness.mjs`.
- npm postinstall runs `scripts/postinstall.mjs`.
- Runtime modules import sibling `.mjs` files so installed package execution does
  not depend on TypeScript loaders.

Removing these `.mjs` files would require a separate package contract change, a
new bin/postinstall strategy, and full tarball validation. The progressive
migration deliberately avoided that change so every PR remained independently
revertible.

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

Before any future PR removes `.mjs` runtime shims, it must prove all of the
following:

- package `bin` and `postinstall` still work from a packed tarball;
- installed package execution works with a temp `HOME` and PATH isolated to the
  temp consumer `node_modules/.bin`;
- `npm pack --dry-run --json` includes the intended runtime files and excludes
  private, temporary, and test-only material;
- snapshot matrix has no blocking drift;
- real target smoke passes;
- the PR is independently revertible.

Until those gates pass under a new package contract, `.mjs` runtime shims remain
the supported execution surface.
