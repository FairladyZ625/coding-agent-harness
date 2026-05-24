#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  acceptNoLessonCandidate,
  assert,
  expectJson,
  node,
  cli,
  repoRoot,
  tmpRoot,
  todayLocal,
} from "../helpers/harness-test-utils.mjs";

const gitEnv = {
  ...process.env,
};

function runHarness(args, options = {}) {
  return spawnSync(node, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...gitEnv, ...(options.env || {}) },
    ...options,
  });
}

function expectHarnessJson(args, options = {}) {
  const result = runHarness(args, options);
  assert(result.status === 0, `${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

function git(target, args, options = {}) {
  return spawnSync("git", args, {
    cwd: target,
    encoding: "utf8",
    env: { ...gitEnv, ...(options.env || {}) },
    ...options,
  });
}

function expectGit(target, args, options = {}) {
  const result = git(target, args, options);
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function prepareReviewTarget(name) {
  const target = path.join(tmpRoot, name);
  fs.mkdirSync(target);
  expectHarnessJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", target]);
  fs.writeFileSync(path.join(target, ".gitignore"), ".harness-private/\nAGENTS.md\nCLAUDE.md\n");
  expectHarnessJson(["new-task", name, "--title", name, target]);
  const taskId = `TASKS/${todayLocal}-${name}`;
  const taskDir = path.join(target, "docs/09-PLANNING", taskId);
  const walkthroughPath = path.join(target, `docs/10-WALKTHROUGH/${name}-walkthrough.md`);
  fs.writeFileSync(walkthroughPath, `# Walkthrough: ${name}\n\n## Summary\n\nFixture walkthrough.\n`);
  fs.appendFileSync(
    path.join(target, "docs/10-WALKTHROUGH/Closeout-SSoT.md"),
    `\n| CL-${name.toUpperCase().replace(/[^A-Z0-9]/g, "-")} | ${todayLocal} | ${name} | \`docs/09-PLANNING/${taskId}/task_plan.md\` | \`docs/09-PLANNING/${taskId}/review.md\` | \`docs/10-WALKTHROUGH/${name}-walkthrough.md\` | pending human review | none | checked-none | pending |\n`,
  );
  acceptNoLessonCandidate(taskDir);
  expectHarnessJson(["task-start", name, "--message", "start", target]);
  expectHarnessJson(["task-phase", name, "PH-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
  expectHarnessJson(["task-review", name, "--message", "submitted", "--evidence", "command:test", target]);
  expectGit(target, ["init"]);
  expectGit(target, ["config", "user.name", "Harness Test"]);
  expectGit(target, ["config", "user.email", "harness-test@example.invalid"]);
  expectGit(target, ["add", "."]);
  expectGit(target, ["commit", "-m", "test fixture baseline"]);
  return { target, taskId, taskDir, shortId: `${todayLocal}-${name}` };
}

function reviewConfirm(fixture, options = {}) {
  return runHarness([
    "review-confirm",
    fixture.shortId,
    "--reviewer",
    "Human Reviewer",
    "--message",
    options.message || "confirmed",
    "--confirm",
    fixture.shortId,
    fixture.target,
  ], options);
}

function readReview(fixture) {
  return fs.readFileSync(path.join(fixture.taskDir, "review.md"), "utf8");
}

{
  const fixture = prepareReviewTarget("git-gate-fake-committed-audit");
  fs.writeFileSync(
    path.join(fixture.taskDir, "review.md"),
    `${readReview(fixture).trimEnd()}\n\n## Human Review Confirmation\n\n| Field | Value |\n| --- | --- |\n| Confirmation ID | HRC-20260524000100 |\n| Confirmed At | 2026-05-24T00:01:00+08:00 |\n| Reviewer | Human Reviewer |\n| Reviewer Email | reviewer@example.test |\n| Task Key | ${fixture.taskId} |\n| Confirm Text | ${fixture.shortId} |\n| Evidence Checked | command:test |\n| Commit SHA | deadbeefdeadbeefdeadbeefdeadbeefdeadbeef |\n| Audit Status | committed |\n| Message | forged committed block |\n`,
  );
  const status = expectHarnessJson(["status", "--json", fixture.target]);
  const task = status.tasks.find((candidate) => candidate.id === fixture.taskId);
  assert(task?.reviewStatus !== "confirmed", "status must reject forged committed review confirmation with fake SHA");
  const complete = runHarness(["task-complete", fixture.shortId, "--message", "done", fixture.target]);
  assert(complete.status !== 0, "task-complete must reject forged committed review confirmation with fake SHA");
  assert(`${complete.stdout}\n${complete.stderr}`.includes("review-confirm"), "fake committed audit rejection should route through review-confirm");
}

{
  const fixture = prepareReviewTarget("git-gate-clean-success");
  const result = reviewConfirm(fixture);
  assert(result.status === 0, `clean review-confirm should pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const payload = JSON.parse(result.stdout);
  assert(/^[0-9a-f]{7,40}$/.test(payload.audit?.commitSha || ""), "review-confirm should return the confirmation commit SHA");
  assert(/^[0-9a-f]{7,40}$/.test(payload.audit?.auditCommitSha || ""), "review-confirm should return the audit finalization commit SHA");
  const review = readReview(fixture);
  assert(review.includes("| Audit Status | committed |"), "review confirmation should record committed audit status");
  assert(review.includes(`| Commit SHA | ${payload.audit.commitSha} |`), "review confirmation should record real commit SHA");
  assert(git(fixture.target, ["status", "--porcelain"]).stdout.trim() === "", "clean success should leave the repo clean");
}

{
  const fixture = prepareReviewTarget("git-gate-dirty-refusal");
  fs.writeFileSync(path.join(fixture.target, "README.md"), "unrelated change\n");
  const beforeReview = readReview(fixture);
  const result = reviewConfirm(fixture);
  assert(result.status !== 0, "review-confirm should reject unrelated dirty files");
  assert(`${result.stdout}\n${result.stderr}`.includes("Git working tree is not clean"), "dirty refusal should explain the unsafe git state");
  assert(readReview(fixture) === beforeReview, "dirty refusal should not write review.md");
}

{
  const fixture = prepareReviewTarget("git-gate-missing-identity");
  expectGit(fixture.target, ["config", "--unset", "user.name"]);
  expectGit(fixture.target, ["config", "--unset", "user.email"]);
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "harness-git-home-"));
  const result = reviewConfirm(fixture, {
    env: {
      ...gitEnv,
      GIT_AUTHOR_NAME: "",
      GIT_AUTHOR_EMAIL: "",
      GIT_COMMITTER_NAME: "",
      GIT_COMMITTER_EMAIL: "",
      HOME: isolatedHome,
      XDG_CONFIG_HOME: path.join(isolatedHome, ".config"),
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
  assert(result.status !== 0, "review-confirm should reject missing git identity");
  assert(`${result.stdout}\n${result.stderr}`.includes("Git commit identity is missing"), "identity refusal should explain how to recover");
}

{
  const fixture = prepareReviewTarget("git-gate-hook-failure");
  const hookPath = path.join(fixture.target, ".git/hooks/pre-commit");
  fs.writeFileSync(hookPath, "#!/bin/sh\necho hook blocked review confirmation >&2\nexit 1\n");
  fs.chmodSync(hookPath, 0o755);
  const result = reviewConfirm(fixture);
  assert(result.status !== 0, "review-confirm should fail closed when git hooks reject the commit");
  const output = `${result.stdout}\n${result.stderr}`;
  assert(output.includes("Git commit failed"), "hook failure should identify commit failure");
  assert(output.includes("hook blocked review confirmation"), "hook failure should preserve hook output");
  assert(output.includes("Review confirmation files were written but not committed"), "hook failure should include recovery guidance");
}

{
  const fixture = prepareReviewTarget("git-gate-allowlist");
  const result = reviewConfirm(fixture);
  assert(result.status === 0, `allowlist fixture should pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const committedFiles = expectGit(fixture.target, ["show", "--name-only", "--format=", `${result.stdout && JSON.parse(result.stdout).audit.commitSha}`]).stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(committedFiles.length === 2, `review-confirm commit should contain exactly two files, got ${committedFiles.join(", ")}`);
  assert(committedFiles.every((file) => file === `docs/09-PLANNING/${fixture.taskId}/review.md` || file === `docs/09-PLANNING/${fixture.taskId}/progress.md`), "review-confirm commit should stage only review.md and progress.md");
}

{
  const fixture = prepareReviewTarget("git-gate-nested-private");
  const privateRoot = path.join(fixture.target, ".harness-private");
  fs.mkdirSync(privateRoot);
  expectGit(privateRoot, ["init"]);
  fs.writeFileSync(path.join(privateRoot, "private-note.md"), "private dirty state\n");
  const result = reviewConfirm(fixture);
  assert(result.status === 0, `nested private repo should not block public confirmation when ignored\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const committedFiles = expectGit(fixture.target, ["show", "--name-only", "--format=", "HEAD"]).stdout;
  assert(!committedFiles.includes(".harness-private"), "public review-confirm commit must not include nested private repo files");
  assert(git(privateRoot, ["status", "--porcelain"]).stdout.includes("private-note.md"), "nested private repo dirty state should remain untouched");
}

console.log("review-confirm git gate tests passed");
