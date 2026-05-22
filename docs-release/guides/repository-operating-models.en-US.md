# Repository Operating Models

Chinese mirror: `docs-release/guides/repository-operating-models.md`

Coding Agent Harness can live inside different repository structures. If you choose the wrong one, the main problem is not "not enough docs." The harness itself becomes another source of confusion.

This guide explains three common models:

- Single-repo model: one code repository, one harness.
- Independent multi-repo model: multiple code repositories, each with its own harness.
- Parent-control repository model: one parent control repository owns the harness, while child repositories hold implementation facts.

## Quick Choice

| Model | Fits | Does not fit | Harness source of truth |
| --- | --- | --- | --- |
| Single repo | One product, one code repository, clear team boundary | A system already split across independently released repositories | Current repo `AGENTS.md` + `docs/` |
| Independent multi-repo | Frontend, backend, SDK, or services evolve independently and cross-repo work is rare | Frequent cross-repo features and one shared release plan | Each repo's own `AGENTS.md` + `docs/` |
| Parent-control repo | Microservices, many subsystems, shared roadmap, cross-repo releases, agents need one startup point | Small projects or short-lived script repositories | Parent repo `AGENTS.md` + `docs/` |

## Single-Repo Model

The single-repo model is the simplest. Code, plans, regression state, and walkthroughs live in one repository.

```text
product-repo/
  AGENTS.md
  docs/
    03-ARCHITECTURE/
    04-DEVELOPMENT/
    05-TEST-QA/
    09-PLANNING/
    10-WALKTHROUGH/
    11-REFERENCE/
  src/
  tests/
```

The agent starts at the repository root, reads `AGENTS.md`, then moves into task files and code.

### When To Choose It

- The application, service, script, or library is in one repository.
- A feature usually modifies only this repository.
- Regression commands can run inside one checkout.
- The team wants to adopt Harness quickly without first changing repository structure.

### Risk

When the project later splits into several repositories, the single-repo harness can lose global visibility. Frontend, backend, and SDK repositories may each have local state, but no single place explains whether the cross-repo task is actually complete.

## Independent Multi-Repo Model

The independent multi-repo model gives each repository its own harness.

```text
frontend-repo/
  AGENTS.md
  docs/

backend-repo/
  AGENTS.md
  docs/

sdk-repo/
  AGENTS.md
  docs/
```

Each repository entrypoint only governs that repository. Frontend tasks are planned and closed in the frontend repo. Backend tasks are planned and closed in the backend repo.

### When To Choose It

- The repositories are genuinely independent from an organizational point of view.
- Each repository has its own owners, release cadence, and review rules.
- Cross-repo tasks are rare, or humans coordinate them manually.
- One repository's harness should not know another repository's internal state.

### Required External Context

Independent multi-repo mode is not just "copy the template into every repo." If you do that, cross-repo context disappears.

Each repository should document its external boundary in:

- `docs/03-ARCHITECTURE/`: where this repository sits in the overall system.
- `docs/04-DEVELOPMENT/`: sibling repo dependencies and local integration startup.
- `docs/06-INTEGRATIONS/`: APIs, events, SDKs, queues, databases, auth, and other contracts.
- `docs/05-TEST-QA/Regression-SSoT.md`: which checks cover this repository only and which require integration across repositories.
- `AGENTS.md`: whether agents should stop, switch repositories, or ask humans when a task crosses repository boundaries.

### Risk

The risk is harness fragmentation:

- The frontend Feature SSoT says a task is complete while the backend Regression SSoT is still red.
- An SDK breaking change is not projected into the product shell.
- An agent starts from a child repository, sees only local facts, and incorrectly treats the global task as complete.

If this happens often, move to the parent-control repository model.

## Parent-Control Repository Model

The parent-control model puts the harness in a parent repository. Child repositories hold implementation facts.

```text
product-control-repo/
  AGENTS.md
  docs/
    03-ARCHITECTURE/
    04-DEVELOPMENT/
    05-TEST-QA/
    06-INTEGRATIONS/
    09-PLANNING/
    10-WALKTHROUGH/
    11-REFERENCE/
  tools/
  frontend/   -> child repository
  backend/    -> child repository
  sdk/        -> child repository
  service-a/  -> child repository
  service-b/  -> child repository
```

The parent repository is the control plane. It owns:

- Overall architecture and repo topology.
- Cross-repo Feature SSoT.
- Task plans, reviews, and walkthroughs.
- Regression SSoT and cross-repo cadence.
- Agent entrypoint and reading matrix.
- Evidence for child repository commits, branches, submodule pointers, or release versions.

Child repositories are the execution plane. They own:

- Code implementation.
- Repository-local dependencies and lockfiles.
- Repository-local tests and CI.
- Repository-local `AGENTS.md`.
- Concrete commits and pull requests.

### When To Choose It

- One product is delivered by multiple repositories.
- Features often touch frontend, backend, SDKs, or services together.
- You want every agent to start from one entrypoint.
- You need unified task state, review gates, and release closeout.
- There are many services, and you cannot let each repository maintain its own global plan.

### Main Benefit

The parent-control model fixes global truth in one place. Even if there are 100 child repositories, the agent first reads the parent task contract, then enters the specific child repository to execute.

This avoids:

- Conflicting Feature SSoTs.
- Each child repo saying "done" while the release still cannot ship.
- Agents starting from the wrong repository and seeing only local context.
- Cross-repo review and regression evidence scattered across many places.

See `docs-release/guides/parent-control-repository-pattern.en-US.md` for the full method.

## Moving Between Models

### Single Repo To Multi-Repo

When a single repository splits into frontend, backend, or SDK repositories, do not copy the same `docs/` tree into every repository.

Decide first:

- Which tasks remain global?
- Which tasks become repository-local?
- Does the old Regression SSoT stay at a parent layer or split into local gates?
- Where should agents start in the future?

If cross-repo features remain common, create a parent-control repository.

### Independent Multi-Repo To Parent-Control

Migration order:

1. Create the parent `AGENTS.md` and repo topology.
2. Move global Feature SSoT, Regression SSoT, and walkthrough index into the parent repository.
3. Keep local `AGENTS.md` files in child repositories, but point global planning back to the parent.
4. Create new cross-repo tasks only in the parent repository.
5. Treat child repository commits as evidence for parent tasks.

Do not rewrite all historical tasks at once. Start by moving the current release and active features into the parent repository.

## Recommended Defaults

- New small project: single-repo model.
- Several strongly independent teams: independent multi-repo model.
- One product, multiple code repositories, one release target: parent-control model.
- Many microservices that need unified agent collaboration: parent-control model.

The real decision is not the number of repositories. It is whether global decisions need one source of truth.
