# Changelog

## 1.0.3

- Added lesson sedimentation follow-up task creation through CLI, preset, and
  Dashboard actions, without writing directly to Lessons SSoT by default.
- Added git-backed review confirmation audit validation so forged committed
  Markdown blocks cannot satisfy human review confirmation.
- Added governance table entropy checks for Lessons SSoT and Harness Ledger
  boundaries.
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
