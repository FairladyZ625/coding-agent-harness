# Parent-Control Repository Pattern

Chinese mirror: `docs-release/guides/parent-control-repository-pattern.md`

The parent-control repository pattern is a repository organization model for multi-repo Coding Agent Harness projects.

Its core rule is:

> Business code may be distributed across many repositories, but the agent operating contract must not be distributed.

The parent repository owns the harness. Child repositories own implementation facts.

## Why This Pattern Exists

Multi-repo projects often run into these failures:

- Frontend, backend, SDK, and services each have their own plans, and no one can tell where the global release is blocked.
- An agent starts inside a child repository, reads only local `AGENTS.md`, and misses cross-repo architecture constraints.
- Each repository maintains its own handwritten task lifecycle table, and the states conflict.
- Review evidence, test evidence, and walkthroughs are scattered across repositories, making it hard to prove that a cross-repo task is complete.

The parent-control pattern solves a control-plane problem. It does not force code back into a monorepo. It moves the harness source of truth into one place.

## Basic Topology

```text
product-control-repo/
  AGENTS.md
  README.md
  docs/
    01-GOVERNANCE/
    02-PRODUCT/
    03-ARCHITECTURE/
    04-DEVELOPMENT/
    05-TEST-QA/
    06-INTEGRATIONS/
    09-PLANNING/
    10-WALKTHROUGH/
    11-REFERENCE/
  tools/
    check-harness.mjs
    internal-ci.mjs
  frontend/       -> child repository
  backend/        -> child repository
  sdk/            -> child repository
  services/auth/  -> child repository
  services/bill/  -> child repository
```

Child repositories can be git submodules, git subtrees, workspace checkouts, fixed local paths, or entries in an internal repo registry. The technical mechanism matters less than ownership of facts:

- The parent repository records global plans and evidence.
- Child repositories record code and local verification.

## Parent Repository Responsibilities

The parent repository is the control plane.

It should contain:

- `AGENTS.md`: the single agent startup entrypoint and reading matrix.
- `docs/03-ARCHITECTURE/repository-topology.md`: repository topology, owners, boundaries, dependency direction.
- `docs/04-DEVELOPMENT/local-development.md`: cross-repo local startup, integration workflow, dependency setup.
- `docs/06-INTEGRATIONS/`: cross-service APIs, events, SDKs, databases, permissions, and external contracts.
- `docs/Harness-Ledger.md`: generated global task lifecycle index from task files.
- `docs/09-PLANNING/Delivery-SSoT.md`: cross-repo feature blocks, dependencies, and release orchestration.
- `docs/09-PLANNING/TASKS/`: cross-repo task contracts.
- `docs/05-TEST-QA/Regression-SSoT.md`: cross-repo regression gates.
- `docs/05-TEST-QA/Cadence-Ledger.md`: which changes trigger which checks.
- `docs/10-WALKTHROUGH/`: cross-repo closeout and human confirmation.
- `docs/11-REFERENCE/`: local standards for using Harness in this project.

The parent repository should also provide a check command, for example:

```bash
node tools/check-harness.mjs
```

At minimum, that command should verify:

- Required harness files exist.
- `AGENTS.md` contains repo topology and child repo routing.
- Current tasks have planning, progress, review, or closeout state.
- Cross-repo regression gates have owners and evidence.
- Child repo pointers, branches, commits, or release versions are recorded.

## Child Repository Responsibilities

Child repositories are the execution plane.

They should contain:

- Local `AGENTS.md`: repository rules, commands, stack, and test workflow.
- Code, dependencies, lockfiles, and CI.
- Repository-local reviews or pull requests.
- Repository-local test evidence.

Child repositories should not independently maintain global task lifecycle tables, and they should not decide whether a cross-repo release is complete.

A child repository `AGENTS.md` can be short:

````md
# Backend Agent Guide

This child repository owns the backend implementation.
Parent-level planning, architecture, and cross-repo closeout live in `../docs/`.

## Rules

1. Keep API contracts aligned with the parent task plan.
2. Do not change frontend or SDK assumptions without updating the parent integration docs.
3. Run `npm run typecheck` after TypeScript changes.

## Commands

```bash
npm install
npm run typecheck
npm test
```
````

## Agent Startup Rule

In the parent-control model, the default rule is:

1. The agent starts from the parent repository.
2. The agent reads the parent `AGENTS.md`.
3. The agent reads parent architecture, development, integration, planning, and regression docs based on the task type.
4. The agent enters one or more child repositories to make code changes.
5. The agent runs local checks inside child repositories.
6. The agent returns to the parent repository to record global evidence, review, walkthrough, and residuals.

Do not let agents start cross-repo tasks from random child repositories. They will naturally miss global context.

## Cross-Repo Task Contract

Cross-repo tasks should be created in the parent repository:

```text
docs/09-PLANNING/TASKS/2026-05-22-example-cross-repo-feature/
  brief.md
  task_plan.md
  execution_strategy.md
  visual_map.md
  progress.md
  review.md
```

The task plan should state:

- Which child repositories will be modified.
- The write scope for each child repository.
- Where shared contracts live, such as API schema, SDK types, or event format.
- Which local checks each child repository must run.
- The final cross-repo regression gate.
- Who updates the parent global SSoT and walkthrough.

A child repository commit is not the end of the task. It is evidence for the parent task.

## What To Put In Architecture / Development / Integration

In the parent-control model, the parent repository must document more external context than a single-repo project.

### Architecture

`docs/03-ARCHITECTURE/` explains how the system is split across repositories:

- Repo topology.
- Service boundaries.
- Data flow.
- Dependency direction.
- Which repositories are product code and which are upstream references.
- Which interfaces must not be called across boundaries directly.

### Development

`docs/04-DEVELOPMENT/` explains cross-repo development:

- How to clone or initialize all child repositories.
- How to install dependencies.
- How to start the local integration environment.
- Which ports, environment variables, accounts, or fixtures are shared.
- How to validate the overall contract when only one child repository changed.

### Integration

`docs/06-INTEGRATIONS/` explains how repositories connect:

- API contract.
- SDK contract.
- Event contract.
- Database ownership.
- Auth boundary.
- Queue or topic ownership.
- External vendor integration.
- Breaking change policy.

If these external facts are missing, the parent repository becomes only a bigger task list, not a real control plane.

## Regression Strategy

The parent `Regression-SSoT.md` should not duplicate every child repository test. It should define layered gates:

| Gate | Location | Purpose |
| --- | --- | --- |
| Repo-local gate | Child repository | Prove local code did not break |
| Contract gate | Parent repo or shared package | Prove cross-repo interfaces did not drift |
| Integration gate | Parent tools or CI | Prove multiple child repositories can run together |
| Release gate | Parent repository | Prove the current feature or release can close |

Child repositories may run `npm test`, `pytest`, or `go test`. The parent repository projects those results into evidence that a release can understand.

## Many Microservices

If there are dozens or hundreds of repositories, do not hand-write long documentation for each one. The parent repository should maintain a repo registry:

```md
| Repo | Role | Owner | Local checks | Integration surface | Release critical |
| --- | --- | --- | --- | --- | --- |
| `services/auth` | auth service | platform | `go test ./...` | JWT, user session events | yes |
| `services/bill` | billing service | revenue | `npm test` | invoice events, payment API | yes |
| `frontend` | product shell | product | `npm run typecheck` | backend API, SDK client | yes |
```

The agent does not need to read all docs in 100 repositories at startup. It reads the parent task first, then enters only the repositories relevant to the current task.

## Anti-Patterns

Avoid:

- Each child repository maintaining its own global task lifecycle table.
- A parent repository with only a README and no task, regression, or closeout surface.
- Child `AGENTS.md` files copying large sections from the parent, causing drift.
- Starting cross-repo tasks from a child repository and backfilling parent records at the end.
- Putting all business code directly in the parent repository and losing independent release ability.
- Recording only child repository test passes without contract and release gates.

## Minimum Adoption Checklist

To adopt the parent-control model, start with:

- Parent `AGENTS.md` states that this is the control repository.
- `docs/03-ARCHITECTURE/repository-topology.md` lists all child repositories.
- `docs/Harness-Ledger.md` is generated from task files as the global task lifecycle index.
- `docs/09-PLANNING/Delivery-SSoT.md` is maintained only when cross-repo release or block orchestration is needed.
- `docs/05-TEST-QA/Regression-SSoT.md` defines local, contract, integration, and release gates.
- Each child repository has only a short local `AGENTS.md`.
- New cross-repo tasks are created only in the parent repository.
- Child commits, PRs, and test output are recorded as parent task evidence.

## One Sentence

The parent-control repository pattern does not add a repository for its own sake. It gives a multi-repo product one harness brain.
