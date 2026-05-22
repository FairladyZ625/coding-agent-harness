# Document Audiences And Surfaces

Chinese mirror: `docs-release/guides/document-audience-and-surfaces.md`

Coding Agent Harness documentation is not one uniform pile of Markdown. It serves three audiences:

- Humans who need to understand the product, architecture, migration path, and project state.
- Agents that need executable entrypoints, rules, task contracts, and evidence paths.
- Release systems that need to know which files can ship publicly and which files are only local operating state.

If these audiences are mixed, the documentation becomes unclear. Humans cannot find the decision, and agents cannot tell which file is authoritative.

## Principle

Human-facing docs explain intent and judgment.

Agent-facing docs define facts, paths, gates, and next actions.

Release docs explain public methodology and product capability. They do not carry a team's private operating ledger.

## Documentation Surfaces

| Surface | Primary reader | Contains | Does not contain |
| --- | --- | --- | --- |
| `README.md` | Humans | What the project is, how to start, key links | Long-running task state, private ledgers |
| `docs-release/` | Humans and evaluators | Public architecture, guides, patterns, migration tutorials | Private task plans, internal reviews, customer-specific operating state |
| `references/` | Agents and maintainers | Reusable standards such as testing, workflow, review, worktree rules | A project's current schedule |
| `templates/` | CLI and agents | Files generated into target projects | Evidence from completed work |
| Target `AGENTS.md` | Agents | Entrypoint, routing, hard rules, reading matrix | Long background essays |
| Target `docs/09-PLANNING/` | Agents and project owners | Feature SSoT, task plans, current state | Generic marketing material |
| Target `docs/05-TEST-QA/` | Agents, QA, human reviewers | Regression SSoT, Cadence Ledger, quality gates | Requirement brainstorm drafts |
| Target `docs/10-WALKTHROUGH/` | Reviewers and handoff agents | Closeout evidence, residuals, human confirmation | Unverified plans |

## Human-Facing Docs

Human-facing docs answer:

- What problem does this method solve?
- Which repository operating model should I choose?
- What are the risks when migrating an old project?
- What evidence should make me trust that the agent stayed on track?

Typical files:

- `docs-release/architecture/overview.md`
- `docs-release/guides/repository-operating-models.en-US.md`
- `docs-release/guides/parent-control-repository-pattern.en-US.md`
- `docs-release/guides/migration-playbook.en-US.md`

Human-facing docs may explain tradeoffs, examples, and decisions, but they should not be the only source of truth. Live project state belongs in SSoTs, task files, reviews, walkthroughs, and regression files.

## Agent-Facing Docs

Agent-facing docs answer:

- Where do I start reading?
- Which files are authoritative?
- Which paths may I edit?
- Which checks must I run after editing?
- When must I stop and ask a human?

Typical files:

- `AGENTS.md`
- `docs/09-PLANNING/Feature-SSoT.md`
- `docs/09-PLANNING/TASKS/<task>/task_plan.md`
- `docs/09-PLANNING/TASKS/<task>/progress.md`
- `docs/05-TEST-QA/Regression-SSoT.md`
- `docs/10-WALKTHROUGH/<date>-<task>.md`
- `docs/11-REFERENCE/*.md`

Agent-facing docs should be concrete, path-oriented, and checkable. Do not turn them into essays, and do not make agents infer execution contracts from narrative prose.

## Release Docs

Release docs explain the public capability of Coding Agent Harness. They should not record the maintainers' private development process.

Good release docs include:

- Architecture overviews.
- Installation and migration guides.
- Single-repo, multi-repo, and parent-control operating model guidance.
- Public migration prompts for agents.
- Reusable engineering methodology.

Do not publish:

- In-progress conclusions from private tasks.
- Private review drafts.
- Machine-local paths that only work for one maintainer.
- Customer or team internal state.
- Ledgers, handoffs, or walkthroughs that have not been sanitized for release.

## Writing Rules

1. Identify the reader before choosing the file.
2. Human docs explain why; agent docs define how.
3. Public docs may describe patterns and structures, but not private operating state.
4. Task state belongs in SSoTs, task files, reviews, walkthroughs, and ledgers.
5. If one document tries to be both a human explanation and an agent execution contract, split it into a public guide and an execution contract.

## A Useful Test

Before writing a document, ask:

> Who reads this file, at what moment, and what action should they take after reading it?

If the answer is "a human uses it to understand," put it in a public guide or architecture doc.

If the answer is "an agent uses it to execute," put it in the target project's entrypoint, task, standard, or regression files.

If the answer is "a maintainer records how this source repository is being operated," it is not a public release document.
