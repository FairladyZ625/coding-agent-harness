# Testing Standard

## Purpose

Define the minimum verification required before an agent claims that a change is complete.

## Rules

1. Tests must match the change risk. Use unit tests for isolated logic, integration tests for contracts, end-to-end or smoke tests for user workflows, and manual verification for surfaces automation cannot cover.
2. Do not claim success from tests that did not exercise the changed behavior.
3. A skipped, flaky, or unavailable test is residual risk and must be recorded with a reason.
4. When fixing a bug, add or update coverage that would have caught the failure unless the cost is clearly unjustified and documented.
5. For UI changes, verify realistic viewport and interaction states when layout, navigation, or user workflow changed.
6. For data, migration, security, or deployment changes, include evidence from the real contract or environment where feasible.
7. Final summaries must distinguish checks run, checks not run, and evidence inspected.

## Required Checklist

- Changed behavior is mapped to verification method.
- Required checks were run from the correct branch or worktree.
- Test output, logs, screenshots, or command results are captured.
- Manual checks include exact path and expected result.
- Known gaps and residual risk are recorded.
- Regression SSoT is updated when the change adds or changes a protected surface.

## Closeout Expectations

Testing closeout must list commands or manual checks, summarize results, identify untested risk, and explain why the evidence is sufficient for the requested acceptance criteria.
