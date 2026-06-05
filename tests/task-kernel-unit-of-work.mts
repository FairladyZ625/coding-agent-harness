#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Effect } from "effect";

import {
  createGitUnitOfWork,
  WriteScopeViolationError,
} from "../scripts/kernel/task/index.mjs";
import {
  createWriteScope,
} from "../scripts/kernel/task/domain/index.mjs";
import { tmpRoot } from "./helpers/harness-test-utils.mjs";

const writeScope = createWriteScope({ allowedPaths: ["allowed"] });

{
  const target = createGitFixture("task-kernel-uow-allowed");
  const unitOfWork = createGitUnitOfWork({ root: target });
  const result = await Effect.runPromise(
    unitOfWork.transact(
      {
        label: "fixture.allowed-write",
        writeScope,
        evidenceRefs: ["review.md#uow-evidence"],
      },
      Effect.sync(() => {
        fs.writeFileSync(path.join(target, "allowed", "progress.md"), "# Progress\n");
        return { taskId: "fixture-task" };
      }),
    ),
  );

  assert.equal(result.value.taskId, "fixture-task");
  assert.deepEqual(result.evidenceRefs, ["review.md#uow-evidence"]);
  assert(gitStatus(target).includes("?? allowed/progress.md"), "allowed transaction should leave the allowed write for the caller to commit");
}

{
  const target = createGitFixture("task-kernel-uow-out-of-scope");
  const unitOfWork = createGitUnitOfWork({ root: target });
  const failure = await captureFailure(
    unitOfWork.transact(
      { label: "fixture.out-of-scope", writeScope },
      Effect.sync(() => {
        fs.writeFileSync(path.join(target, "outside.txt"), "mutated outside\n");
        return "unexpected";
      }),
    ),
  );

  assert(failure instanceof WriteScopeViolationError);
  assert.match(failure.message, /outside the write scope/);
  assert.equal(fs.readFileSync(path.join(target, "outside.txt"), "utf8"), "outside baseline\n");
  assert.equal(gitStatus(target), "", "out-of-scope mutation should be rolled back");
}

{
  const target = createGitFixture("task-kernel-uow-dirty-allowed");
  const unitOfWork = createGitUnitOfWork({ root: target });
  let invoked = false;
  fs.writeFileSync(path.join(target, "allowed", "existing.md"), "# Existing dirty\n");

  const failure = await captureFailure(
    unitOfWork.transact(
      { label: "fixture.dirty-allowed", writeScope },
      Effect.sync(() => {
        invoked = true;
        return "unexpected";
      }),
    ),
  );

  assert(failure instanceof WriteScopeViolationError);
  assert.match(failure.message, /dirty files inside the write scope/);
  assert.equal(invoked, false, "dirty allowed scope should be rejected before mutation runs");
  assert(gitStatus(target).includes("M allowed/existing.md"), "pre-existing dirty allowed file should remain for the caller");
}

{
  const target = createGitFixture("task-kernel-uow-failure-cleanup");
  const unitOfWork = createGitUnitOfWork({ root: target });
  fs.writeFileSync(path.join(target, "outside.txt"), "outside dirty before\n");

  const failure = await captureFailure(
    unitOfWork.transact(
      { label: "fixture.failure-cleanup", writeScope },
      Effect.zipRight(
        Effect.sync(() => {
          fs.writeFileSync(path.join(target, "outside.txt"), "outside baseline\n");
          fs.writeFileSync(path.join(target, "allowed", "failure.md"), "# Failure\n");
        }),
        Effect.fail(new Error("planned unit-of-work failure")),
      ),
    ),
  );

  assert(failure instanceof Error);
  assert.equal(failure.message, "planned unit-of-work failure");
  assert.equal(fs.readFileSync(path.join(target, "outside.txt"), "utf8"), "outside dirty before\n");
  assert(!fs.existsSync(path.join(target, "allowed", "failure.md")), "failed transaction should remove its allowed write");
  assert.equal(gitStatus(target), "M outside.txt", "failed transaction should preserve only the unrelated pre-existing dirty file");
}

console.log("Task Kernel Git Unit of Work tests passed");

async function captureFailure<A, E>(effect: Effect.Effect<A, E>): Promise<E> {
  return Effect.runPromise(Effect.flip(effect));
}

function createGitFixture(name: string): string {
  const target = path.join(tmpRoot, name);
  fs.mkdirSync(path.join(target, "allowed"), { recursive: true });
  fs.writeFileSync(path.join(target, "allowed", "existing.md"), "# Existing\n");
  fs.writeFileSync(path.join(target, "outside.txt"), "outside baseline\n");
  git(target, ["init"]);
  git(target, ["config", "user.name", "Harness Test"]);
  git(target, ["config", "user.email", "harness-test@example.invalid"]);
  git(target, ["add", "."]);
  git(target, ["commit", "-m", "fixture baseline"]);
  return target;
}

function gitStatus(root: string): string {
  return git(root, ["status", "--short", "--untracked-files=all"]).stdout.trim();
}

function git(root: string, args: readonly string[]): { stdout: string; stderr: string } {
  const result = spawnSync("git", [...args], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
