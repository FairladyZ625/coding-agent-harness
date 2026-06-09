# Changelog

## 1.1.2

- Publish a stable original-runtime patch release from the current `main`
  baseline without advancing the deferred `scripts-refactor` rewrite.
- Keep the existing command registry and original runtime behavior as the
  release surface while validating the package through the full release gates.
- Confirm the package surface remains private-clean and suitable for npm
  publication.

## 1.1.1

- Align lifecycle completion around the human-reviewed terminal state so
  confirmed review tasks can be finalized through the current task lifecycle.
- Route task operations and task index behavior through the application and
  repository layers, removing legacy facade/parser fallback paths.
- Make dashboard task semantics fail closed on missing projections and align
  active-task, review-material, accessibility, typography, and hot-refresh
  behavior with the projection-first model.
- Strengthen release-facing governance gates for walkthrough material checks,
  transaction-backed lifecycle writes, and projection-first task operations.

## 1.1.0

- Document the Node.js 24+ runtime baseline as a release-significant change and
  move the next publish line to `1.1.0` instead of another patch release.
- Add a `prepublishOnly` release gate that uses the source-safe dist bootstrap
  to rebuild `dist/` and run the dist observation checker before `npm publish`.
- Make the source-safe `postinstall.mjs` bootstrap fail with the package-level
  missing-dist message when installed package contents are incomplete, instead
  of attempting a source checkout build script that is not shipped.

## 1.0.8

- Preserve the executable bit for the packaged `dist/harness.mjs` npm bin
  entry during dist builds and prepack.
- Extend release observation checks to fail if the packed or installed
  `harness` bin is not executable.
- Add `migrate-structure --plan` to the dist and installed-package command
  smoke matrix.

## 1.0.7

- Generate `harness init --add-npm-scripts` commands with
  `npx --yes coding-agent-harness ...` so target projects can run Harness
  scripts without adding a project dependency or relying on a global install.
- Isolate the dist observation command matrix from local ignored docs by using
  the minimal target-project fixture for target-facing commands.
- Preserve the executable bit on the committed `dist/harness.mjs` CLI entry.

## 1.0.6

- Bump the npm package version after the 1.0.5 publication so the TypeScript
  runtime-source migration can be published again.

## 1.0.5

- Relicense the public package from MIT to AGPL-3.0-or-later.
- Add an additional permission for Generated Harness Materials so target
  project files generated or installed by Coding Agent Harness can follow the
  target project's own license terms.

## 1.0.4

- Seed bundled presets into user preset storage during npm/user installation and
  into project preset storage during `harness init`.
- Added `harness preset seed` for idempotent bundled preset repair/re-run flows.
- Included bundled presets in user-level Skill installation and `doctor-user`
  validation.
- Updated agent-facing installation guidance to require preset discovery before
  choosing task presets.

## 1.0.3

- Added lesson sedimentation follow-up task creation through CLI, preset, and
  Dashboard actions, using task-local candidates and promoted lesson detail
  docs instead of a shared Lessons table.
- Added git-backed review confirmation audit validation so forged committed
  Markdown blocks cannot satisfy human review confirmation.
- Added governance table entropy checks for shared governance table boundaries.
- Bounded lifecycle queue cards and review document panels for long task and
  review content.
- Split lifecycle review gates, review-confirm writer, and lifecycle test
  suites into dedicated module folders.
- Added a bilingual pull request standard and PR template, and routed generated
  `AGENTS.md` files to the PR standard.

## 1.0.2

- Added the dashboard workbench, review queue, migration rails, lifecycle gates,
  lesson candidate governance, and refreshed public installation guidance.
- Added bilingual README coverage and restored Star History in the public
  project README.
- Slimmed the generated `AGENTS.md` templates back to charter and routing
  content instead of install instructions.
- Removed source-checkout and private maintainer instructions from
  target-facing reports and public install guidance.
- Replaced old 12-phase labels in the Skill reference/template indexes with
  v1.0 capability and task-context routing.
- Added README architecture diagrams and separated human CLI commands from
  agent-facing setup prompts.
- Expanded the public architecture overview with Mermaid diagrams for package
  boundaries, CLI surfaces, dashboard data flow, lifecycle state, migration
  rails, release docs boundaries, and runtime safety.
- Added a Simplified Chinese mirror for the public architecture overview.

## 1.0.0

- Added the `harness` CLI with `check`, `status`, `dashboard`, `init`, and
  `add-capability`.
- Added capability-aware status JSON and read-only HTML dashboard rendering.
- Added static dashboard folder output with normalized table, document, graph,
  and adoption JSON snapshots.
- Added safe legacy adoption mode for existing harness projects.
- Added v1.0 planning templates for standalone `execution_strategy.md`,
  `visual_roadmap.md`, task IA budget, evidence indexes, and review gate schema.
- Added verifier output template and public CI smoke checks.
