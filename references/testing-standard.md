# Testing Standard

## Purpose

Define the minimum verification required before an agent claims that a change is complete.

## Minimum Evidence by Change Type

| Change Type | Minimum Evidence |
| --- | --- |
| Bug fix | Focused regression test or a verification command that would have exposed the bug |
| Parser, lifecycle, scanner, or protocol behavior | Unit test coverage is required; prefer TDD |
| CLI behavior | CLI assertion for success and failure paths |
| Dashboard or UI behavior | Dashboard smoke plus browser/workbench interaction evidence when behavior changes |
| Documentation, configuration, or research | Verification command or explicit waiver with residual risk |
| High-risk shared code | TDD is expected; regression assertion is required |

## TDD Policy

Use TDD for behavior changes, bug fixes, lifecycle transitions, parsers, scanners, and shared protocol logic:

1. Add or update a failing test that describes the desired behavior.
2. Run the test and confirm it fails for the expected reason.
3. Implement the smallest change that makes the test pass.
4. Run the full relevant verification set before closeout.

If TDD is skipped, record why the change is not testable or why a smoke/manual check is the better evidence.

## Rules

1. Tests must match the change risk. Use unit tests for isolated logic, integration tests for contracts, end-to-end or smoke tests for user workflows, and manual verification for surfaces automation cannot cover.
2. Do not claim success from tests that did not exercise the changed behavior.
3. A skipped, flaky, or unavailable test is residual risk and must be recorded with a reason.
4. When fixing a bug, add or update coverage that would have caught the failure unless the cost is clearly unjustified and documented.
5. For UI changes, verify realistic viewport and interaction states when layout, navigation, or user workflow changed.
6. For data, migration, security, or deployment changes, include evidence from the real contract or environment where feasible.
7. Final summaries must distinguish checks run, checks not run, and evidence inspected.

## Required Checklist

- Changed behavior is mapped to a verification method.
- Required checks were run from the correct branch or worktree.
- Test output, logs, screenshots, or command results are captured or summarized.
- Manual checks include exact path and expected result.
- Known gaps and residual risk are recorded.
- Regression SSoT is updated when the change adds or changes a protected surface.

## Closeout Expectations

Testing closeout must list commands or manual checks, summarize results, identify untested risk, and explain why the evidence is sufficient for the requested acceptance criteria.
