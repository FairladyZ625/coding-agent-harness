# [任务名称] - Long-Running Task Contract

## Goal

[一句话说明本轮要完整收掉的主问题。只保留一个主目标。]

## Scope

### In Scope

- [允许修改的目录 / 模块 / 能力面]

### Out of Scope

- [本轮明确不做的事项]

### Shared File / Conflict Risk

- [可能与其他任务冲突的共享文件；如无则写"无"]

## Primary Caller / Entry Surface

- Primary caller: [CLI / local agent / UI / API / automation / integration / other]
- Required entrypoints this task must support: [列出]
- Explicitly not required entrypoints: [列出]

## Execution Permission

- Continuous execution: [allowed / not allowed]
- May continue without asking after each loop: [yes / no]
- May start reviewer agent / subagent: [yes / no]
- Review report required: [yes / no; if yes, write `review.md`]
- Actions that still require human approval:
  - [高风险操作，如 destructive migration / production deploy / secret change]

## Required Loop

Each loop must include:

1. [implement / edit / configure]
2. [run locally]
3. [test / smoke / inspect]
4. [self-review with Confidence Challenge]
5. [reviewer or subagent review, if required, with `review.md` update]
6. [fix findings]
7. [rerun evidence]
8. [rerun Confidence Challenge until no open material finding]
9. [update progress.md]

Minimum loop count or no-finding requirement:

- [例如：至少 2 轮，或直到 self-review + reviewer 都没有 material finding]

## Reviewer / Subagent Contract

- Reviewer role: [read-only review / code-change worker / test verifier]
- Reviewer scope: [文件 / 模块 / 问题域]
- If code-change worker:
  - Worktree path: [路径 / 不适用]
  - Branch: [分支 / 不适用]
  - Task directory: [路径 / 不适用]
  - Commit before handoff: [yes / no / 不适用]
  - Handoff must include: [worktree path / branch / commit SHA / checks / residual risks]
- Reviewer must report:
  - [bugs]
  - [regressions]
  - [missing tests]
  - [unverified assumptions]
  - [material findings / no-finding statement in `review.md`]
- Reviewer must not:
  - [越权改动 / 重写不相关模块 / 推翻 scope]

## Evidence

Required evidence before completion:

- [ ] [lint / typecheck / build command]
- [ ] [unit / integration / e2e test command]
- [ ] [local smoke command]
- [ ] [browser / UI / manual inspection]
- [ ] [live environment smoke]
- [ ] [reviewer no material findings]
- [ ] [`review.md` completed if review is required]
- [ ] [walkthrough / PR / release note]

## Stop Condition

The task may stop only when:

- [ ] [critical path passes]
- [ ] [required tests or regression gates pass]
- [ ] [runtime / console / request errors are cleared or documented]
- [ ] [reviewer has no material finding, if reviewer is required]
- [ ] [`review.md` has no open P0/P1 findings, if review is required]
- [ ] [residual risks are documented and non-blocking]

## Pause Conditions

Pause and report if:

- [ ] Goal or scope becomes invalid
- [ ] A high-risk product / architecture / security / data decision is required
- [ ] Unknown unrelated changes conflict with this task
- [ ] The environment blocks all useful evidence collection
- [ ] Reviewer findings change the task direction

## Deliverables

- [ ] Code / config changes
- [ ] Tests / regression evidence
- [ ] Docs updates
- [ ] `review.md` report, if required
- [ ] `progress.md` / `findings.md` updates
- [ ] Harness Ledger update
- [ ] Walkthrough
- [ ] Lessons Reflection + Lessons Check (`checked-created` or `checked-none`)
- [ ] PR / commit / release note
- [ ] Residual risk summary
