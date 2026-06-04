#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { SpawnSyncOptionsWithStringEncoding, SpawnSyncReturns } from "node:child_process";
import { confirmTaskReview } from "../../scripts/lib/task-lifecycle.mjs";
import {
  acceptNoLessonCandidate,
  assert,
  expectJson,
  node,
  cli,
  humanControlledTestEnv,
  repoRoot,
  sanitizeTemplateFixtureMaterials,
  tmpRoot,
  todayLocal,
} from "../helpers/harness-test-utils.mjs";
import { prepareReviewConfirmGitGate } from "../../scripts/lib/review-confirm-git-gate.mjs";

type RunOptions = Omit<SpawnSyncOptionsWithStringEncoding, "cwd" | "encoding"> & {
  env?: NodeJS.ProcessEnv;
};
type ReviewFixture = {
  target: string;
  taskId: string;
  taskDir: string;
  shortId: string;
};
type StatusResponse = {
  tasks: Array<{ id?: string; reviewStatus?: string }>;
};
type TaskListResponse = {
  tasks: Array<{
    id?: string;
    currentPath?: string;
    deletionState?: string;
    reviewConfirmation?: {
      confirmed?: boolean;
      gitAudit?: {
        valid?: boolean;
        expectedPaths?: string[];
        expectedPathGroups?: string[][];
      };
    };
    reviewStatus?: string;
  }>;
};
type ReviewConfirmPayload = {
  audit: { commitSha: string; auditCommitSha?: string };
};

const gitEnv = {
  ...process.env,
};

function humanReviewEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return humanControlledTestEnv({ ...gitEnv, ...overrides });
}

function runHarness(args: string[], options: RunOptions = {}): SpawnSyncReturns<string> {
  return spawnSync(node, [cli, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...humanReviewEnv(), ...(options.env || {}) },
    ...options,
  });
}

function expectHarnessJson<TPayload = unknown>(args: string[], options: RunOptions = {}): TPayload {
  const result = runHarness(args, options);
  assert(result.status === 0, `${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return JSON.parse(result.stdout) as TPayload;
}

function git(target: string, args: string[], options: RunOptions = {}): SpawnSyncReturns<string> {
  return spawnSync("git", args, {
    cwd: target,
    encoding: "utf8",
    env: { ...gitEnv, ...(options.env || {}) },
    ...options,
  });
}

function expectGit(target: string, args: string[], options: RunOptions = {}): SpawnSyncReturns<string> {
  const result = git(target, args, options);
  assert(result.status === 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return result;
}

function prepareReviewTarget(name: string): ReviewFixture {
  const target = path.join(tmpRoot, name);
  fs.mkdirSync(target);
  expectHarnessJson(["init", "--locale", "en-US", "--capabilities", "core,dashboard", target]);
  fs.writeFileSync(path.join(target, ".gitignore"), ".harness-private/\nAGENTS.md\nCLAUDE.md\n");
  expectHarnessJson(["new-task", name, "--title", name, target]);
  const taskId = `TASKS/${todayLocal}-${name}`;
  const taskDir = path.join(target, "coding-agent-harness/planning/tasks", `${todayLocal}-${name}`);
  const walkthroughPath = path.join(taskDir, "walkthrough.md");
  fs.writeFileSync(walkthroughPath, `# Walkthrough: ${name}\n\n## Summary\n\nFixture walkthrough.\n`);
  acceptNoLessonCandidate(taskDir);
  expectHarnessJson(["task-start", name, "--message", "start", target]);
  expectHarnessJson(["task-phase", name, "EXEC-01", "--state", "done", "--completion", "100", "--evidence", "present", target]);
  expectHarnessJson(["task-review", name, "--message", "submitted", "--evidence", "command:test", target]);
  sanitizeTemplateFixtureMaterials(taskDir);
  expectGit(target, ["init"]);
  expectGit(target, ["config", "user.name", "Harness Test"]);
  expectGit(target, ["config", "user.email", "harness-test@example.invalid"]);
  expectGit(target, ["add", "."]);
  expectGit(target, ["commit", "-m", "test fixture baseline"]);
  return { target, taskId, taskDir, shortId: `${todayLocal}-${name}` };
}

function reviewConfirm(fixture: ReviewFixture, options: RunOptions & { message?: string } = {}): SpawnSyncReturns<string> {
  return withEnv(options.env || {}, () => {
    try {
      const payload = confirmTaskReview(fixture.target, fixture.shortId, {
        reviewer: "Human Reviewer",
        message: options.message || "confirmed",
        confirmText: fixture.shortId,
      });
      return { status: 0, stdout: `${JSON.stringify(payload)}\n`, stderr: "" } as SpawnSyncReturns<string>;
    } catch (error) {
      return { status: 1, stdout: "", stderr: `${errorMessage(error)}\n` } as SpawnSyncReturns<string>;
    }
  });
}

function withEnv<T>(overrides: NodeJS.ProcessEnv, fn: () => T): T {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides || {})) {
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error || "unknown error");
  const details = "details" in error ? JSON.stringify((error as { details?: unknown }).details || {}) : "";
  const recovery = "recovery" in error ? JSON.stringify((error as { recovery?: unknown }).recovery || []) : "";
  return [error.message, details, recovery].filter(Boolean).join("\n");
}

function readReview(fixture: ReviewFixture): string {
  return fs.readFileSync(path.join(fixture.taskDir, "review.md"), "utf8");
}

function readIndex(fixture: ReviewFixture): string {
  return fs.readFileSync(path.join(fixture.taskDir, "INDEX.md"), "utf8");
}

{
  const fixture = prepareReviewTarget("git-gate-cli-hidden");
  const result = runHarness(["review-confirm", fixture.shortId, "--confirm", fixture.shortId, fixture.target]);
  assert(result.status !== 0, "review-confirm must not be exposed as a top-level CLI command");
  const output = `${result.stdout}\n${result.stderr}`;
  assert(output.includes("Unknown command") || output.includes("Usage:"), "hidden CLI command should fail before running review confirmation");
  assert(!readIndex(fixture).includes("| Human Review Status | confirmed |"), "hidden CLI command should not write confirmed audit metadata");
}

{
  const fixture = prepareReviewTarget("git-gate-allowlist-refusal");
  let rejected = false;
  try {
    prepareReviewConfirmGitGate(fixture.target, [path.join(fixture.target, "docs/legacy-review.md")]);
  } catch (error) {
    rejected = String(error instanceof Error ? error.message : error).includes("allowlist");
  }
  assert(rejected, "review-confirm git gate should only allow task INDEX.md writes");
}

{
  const fixture = prepareReviewTarget("git-gate-fake-committed-audit");
  fs.writeFileSync(
    path.join(fixture.taskDir, "INDEX.md"),
    readIndex(fixture)
      .replace("| Human Review Status | not-confirmed |", "| Human Review Status | confirmed |")
      .replace("| Confirmation ID | n/a |", "| Confirmation ID | HRC-20260524000100 |")
      .replace("| Confirmed At | n/a |", "| Confirmed At | 2026-05-24T00:01:00+08:00 |")
      .replace("| Reviewer | n/a |", "| Reviewer | Human Reviewer |")
      .replace("| Reviewer Email | n/a |", "| Reviewer Email | reviewer@example.test |")
      .replace("| Confirm Text | n/a |", `| Confirm Text | ${fixture.shortId} |`)
      .replace("| Evidence Checked | n/a |", "| Evidence Checked | command:test |")
      .replace("| Review Commit SHA | n/a |", "| Review Commit SHA | deadbeefdeadbeefdeadbeefdeadbeefdeadbeef |")
      .replace("| Audit Status | created |", "| Audit Status | committed |")
      .replace("| Message | n/a |", "| Message | forged committed block |"),
  );
  const status = expectHarnessJson<StatusResponse>(["status", "--json", fixture.target]);
  const task = status.tasks.find((candidate) => candidate.id === fixture.taskId);
  assert(task?.reviewStatus !== "confirmed", "status must reject forged committed review confirmation with fake SHA");
  const complete = runHarness(["task-complete", fixture.shortId, "--message", "done", fixture.target]);
  assert(complete.status !== 0, "task-complete must reject forged committed review confirmation with fake SHA");
  assert(`${complete.stdout}\n${complete.stderr}`.includes("Dashboard workbench"), "fake committed audit rejection should route through Dashboard confirmation");
}

{
  const fixture = prepareReviewTarget("git-gate-clean-success");
  const result = reviewConfirm(fixture);
  assert(result.status === 0, `clean review-confirm should pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const payload = JSON.parse(result.stdout) as ReviewConfirmPayload;
  assert(/^[0-9a-f]{7,40}$/.test(payload.audit?.commitSha || ""), "review-confirm should return the confirmation commit SHA");
  assert(/^[0-9a-f]{7,40}$/.test(payload.audit?.auditCommitSha || ""), "review-confirm should return the audit finalization commit SHA");
  const index = readIndex(fixture);
  assert(index.includes("| Audit Status | committed |"), "review confirmation should record committed audit status in INDEX.md");
  assert(index.includes(`| Review Commit SHA | ${payload.audit.commitSha} |`), "review confirmation should record real commit SHA in INDEX.md");
  assert(!readReview(fixture).includes("Human Review Confirmation"), "review-confirm should not write Human Review Confirmation to review.md");
  assert(git(fixture.target, ["status", "--porcelain"]).stdout.trim() === "", "clean success should leave the repo clean");
}

{
  const fixture = prepareReviewTarget("git-gate-archived-provenance");
  const result = reviewConfirm(fixture);
  assert(result.status === 0, `review-confirm before archive should pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  expectHarnessJson(["task-archive", fixture.shortId, "--reason", "release closeout fixture", "--archived-by", "Release Manager <release@example.invalid>", "--archive-field", "retention bucket=release:fixture", fixture.target]);
  const listed = expectHarnessJson<TaskListResponse>(["task-list", "--include-archived", "--json", fixture.target]);
  const archived = listed.tasks.find((candidate) => candidate.id === fixture.taskId);
  assert(archived, "archived task should remain discoverable with --include-archived");
  assert(archived.deletionState === "archived", "archived task should expose archived deletion state");
  assert(String(archived.currentPath || "").includes("/governance/archive/"), "archived task current path should point at archive storage");
  assert(archived.reviewConfirmation?.confirmed === true, `archived task should keep Git-backed human review confirmation: ${JSON.stringify(archived.reviewConfirmation)}`);
  assert(archived.reviewConfirmation?.gitAudit?.valid === true, "archived task review git audit should validate against historical active path");
  assert(
    (archived.reviewConfirmation?.gitAudit?.expectedPaths || []).includes(`coding-agent-harness/planning/tasks/${fixture.shortId}/INDEX.md`),
    "archived task git audit should match the historical active INDEX path, not only current archive path",
  );
}

{
  const fixture = prepareReviewTarget("git-gate-unrelated-dirty-allowed");
  fs.writeFileSync(path.join(fixture.target, "README.md"), "unrelated change\n");
  const result = reviewConfirm(fixture);
  assert(result.status === 0, `review-confirm should ignore unrelated dirty files\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const payload = JSON.parse(result.stdout) as ReviewConfirmPayload;
  const committedFiles = expectGit(fixture.target, ["show", "--name-only", "--format=", payload.audit.commitSha]).stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(committedFiles.length === 1, `review-confirm should commit only INDEX.md, got ${committedFiles.join(", ")}`);
  assert(committedFiles[0] === `coding-agent-harness/planning/tasks/${fixture.shortId}/INDEX.md`, "review-confirm commit should not include unrelated dirty files");
  assert(git(fixture.target, ["status", "--porcelain"]).stdout.includes("README.md"), "unrelated dirty file should remain dirty after review-confirm");
  const status = expectHarnessJson<StatusResponse>(["status", "--json", fixture.target]);
  const task = status.tasks.find((candidate) => candidate.id === fixture.taskId);
  assert(task?.reviewStatus === "confirmed", "unrelated dirty state should not keep the task in review after confirmation");
}

{
  const fixture = prepareReviewTarget("git-gate-owned-dirty-refusal");
  const indexPath = path.join(fixture.taskDir, "INDEX.md");
  fs.appendFileSync(indexPath, "\n<!-- user-owned local edit -->\n");
  const beforeIndex = readIndex(fixture);
  const result = reviewConfirm(fixture);
  assert(result.status !== 0, "review-confirm should reject pre-existing dirty state in its owned INDEX.md");
  const output = `${result.stdout}\n${result.stderr}`;
  assert(output.includes("Review confirmation owned path is already dirty"), "owned dirty refusal should identify the owned path boundary");
  assert(readIndex(fixture) === beforeIndex, "owned dirty refusal should not overwrite existing INDEX.md edits");
}

{
  const fixture = prepareReviewTarget("git-gate-staged-outside-refusal");
  fs.writeFileSync(path.join(fixture.target, "STAGED_OUTSIDE.md"), "staged outside review confirm\n");
  expectGit(fixture.target, ["add", "STAGED_OUTSIDE.md"]);
  const result = reviewConfirm(fixture);
  assert(result.status !== 0, "review-confirm should reject staged files outside its write allowlist");
  const output = `${result.stdout}\n${result.stderr}`;
  assert(output.includes("staged") || output.includes("Git index"), "staged outside refusal should explain staged-file ownership");
  assert(git(fixture.target, ["status", "--short"]).stdout.includes("A  STAGED_OUTSIDE.md"), "review-confirm should leave staged outside files untouched after refusal");
}

{
  const fixture = prepareReviewTarget("git-gate-missing-identity");
  expectGit(fixture.target, ["config", "--unset", "user.name"]);
  expectGit(fixture.target, ["config", "--unset", "user.email"]);
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "harness-git-home-"));
  const result = reviewConfirm(fixture, {
    env: {
      ...humanReviewEnv(),
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
  fs.mkdirSync(path.join(repoRoot, "tmp"), { recursive: true });
  const hookDir = fs.mkdtempSync(path.join(repoRoot, "tmp", "review-confirm-hook-"));
  const hookPath = path.join(hookDir, "pre-commit");
  fs.writeFileSync(hookPath, `#!${node}\nconsole.error("hook blocked review confirmation");\nprocess.exit(1);\n`);
  fs.chmodSync(hookPath, 0o755);
  expectGit(fixture.target, ["config", "core.hooksPath", hookDir]);
  const result = reviewConfirm(fixture);
  assert(result.status !== 0, "review-confirm should fail closed when git hooks reject the commit");
  const output = `${result.stdout}\n${result.stderr}`;
  assert(output.includes("Git commit failed"), "hook failure should identify commit failure");
  assert(
    output.includes("hook blocked review confirmation") || output.includes("pre-commit died of signal"),
    `hook failure should preserve Git hook stderr\nOUTPUT:\n${output}`,
  );
  assert(output.includes("Review confirmation files were written but not committed"), "hook failure should include recovery guidance");
}

{
  const fixture = prepareReviewTarget("git-gate-allowlist");
  const result = reviewConfirm(fixture);
  assert(result.status === 0, `allowlist fixture should pass\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const committedFiles = expectGit(fixture.target, ["show", "--name-only", "--format=", `${result.stdout && JSON.parse(result.stdout).audit.commitSha}`]).stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(committedFiles.length === 1, `review-confirm commit should contain exactly one file, got ${committedFiles.join(", ")}`);
  assert(committedFiles[0] === `coding-agent-harness/planning/tasks/${fixture.shortId}/INDEX.md`, "review-confirm commit should stage only INDEX.md");
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
