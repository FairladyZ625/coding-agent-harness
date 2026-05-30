#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createTaskOperations } from "../scripts/lib/task-operations.mjs";
import {
  assert,
  repoRoot,
  run,
  tmpRoot,
} from "./helpers/harness-test-utils.mjs";

type FailureResult = {
  success: false;
  status: number;
  reason: string;
  payload: Record<string, unknown>;
};

const target = path.join(tmpRoot, "task-operations-target");
fs.cpSync(path.join(repoRoot, "examples/minimal-project"), target, { recursive: true });

const operations = createTaskOperations(target);

const reviewResult = operations.confirmReview({
  taskId: "demo-task",
  confirmText: "demo-task",
  reviewer: "Human Reviewer",
});
assertFailure(reviewResult, "planned review confirmation should be rejected by TaskOperations");
assert(reviewResult.status === 409, "review confirmation outside the review queue should be a conflict");
assert(reviewResult.reason.includes("review queue"), "review confirmation rejection should explain the review queue gate");
assert(reviewResult.payload.reviewQueueState === "not-in-queue", "review rejection payload should include reviewQueueState");
assert(Array.isArray(reviewResult.payload.taskQueues), "review rejection payload should include taskQueues");

const completeResult = operations.complete({
  taskId: "demo-task",
  message: "try closeout from TaskOperations",
});
assertFailure(completeResult, "standard closeout before review should be rejected by TaskOperations");
assert(completeResult.status === 409, "closeout before review should be a conflict");
assert(completeResult.reason.includes("task-review"), "closeout rejection should preserve the CLI task-review guidance");
assert(completeResult.payload.lifecycleState === "active", "closeout rejection payload should include lifecycleState");

const cliComplete = run(["task-complete", "demo-task", "--message", "try closeout from CLI", target]);
assert(cliComplete.status !== 0, "CLI task-complete should reject the same closeout precondition");
assert(cliComplete.stderr.includes(completeResult.reason), "CLI task-complete should surface the TaskOperations closeout reason");

console.log("TaskOperations use-case tests passed");

function assertFailure(result: unknown, message: string): asserts result is FailureResult {
  assert(Boolean(result) && typeof result === "object" && (result as { success?: unknown }).success === false, message);
}
