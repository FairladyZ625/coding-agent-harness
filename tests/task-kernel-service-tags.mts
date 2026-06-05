#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Effect } from "effect";

import {
  GENERATED_PROJECTION_PORT_ID,
  GIT_UNIT_OF_WORK_PORT_ID,
  GeneratedProjectionPort,
  GitUnitOfWork,
  HUMAN_REVIEW_PORT_ID,
  HumanReviewPort,
  TASK_COMMAND_SERVICE_ID,
  TASK_QUERY_SERVICE_ID,
  TASK_PACKAGE_STORE_PORT_ID,
  TaskApplicationServicesPlaceholderLayer,
  TaskCommands,
  TaskKernelNotImplementedError,
  TaskPortsPlaceholderLayer,
  TaskQueries,
  TaskQueryService,
  TaskPackageStore,
} from "../scripts/kernel/task/index.mjs";
import {
  createTaskRef,
  createWriteScope,
  parseModuleKey,
  parseTaskId,
} from "../scripts/kernel/task/domain/index.mjs";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const serviceIdentities = await Effect.runPromise(
  Effect.gen(function* () {
    const queryService = yield* TaskQueryService;
    return {
      query: queryService.identity,
    };
  }).pipe(Effect.provide(TaskApplicationServicesPlaceholderLayer)),
);

assert.equal(serviceIdentities.query, TASK_QUERY_SERVICE_ID);
assert.equal(TASK_COMMAND_SERVICE_ID, "coding-agent-harness/task-kernel/application/TaskCommandService");

const portIdentities = await Effect.runPromise(
  Effect.gen(function* () {
    const repository = yield* TaskPackageStore;
    const unitOfWork = yield* GitUnitOfWork;
    const humanReview = yield* HumanReviewPort;
    const projection = yield* GeneratedProjectionPort;
    return {
      repository: repository.identity,
      unitOfWork: unitOfWork.identity,
      humanReview: humanReview.identity,
      projection: projection.identity,
    };
  }).pipe(Effect.provide(TaskPortsPlaceholderLayer)),
);

assert.deepEqual(portIdentities, {
  repository: TASK_PACKAGE_STORE_PORT_ID,
  unitOfWork: GIT_UNIT_OF_WORK_PORT_ID,
  humanReview: HUMAN_REVIEW_PORT_ID,
  projection: GENERATED_PROJECTION_PORT_ID,
});

const listFailure = await captureFailure(
  TaskQueries.listTasks({}).pipe(Effect.provide(TaskApplicationServicesPlaceholderLayer)),
);
assert(listFailure instanceof TaskKernelNotImplementedError);
assert.equal(listFailure._tag, "TaskKernelNotImplemented");
assert.match(listFailure.message, /TaskQueryService\.listTasks/);

const writeScope = createWriteScope({ allowedPaths: ["scripts/kernel/task"] });
const createFailure = await captureFailure(
  TaskCommands.createTask({
    id: parseTaskId("2026-06-05-task-kernel-tk02-effect-service-tags-layers"),
    title: "TK-02 Effect service tags and layers",
    moduleKey: parseModuleKey("task-kernel"),
    presetId: "coding-agent-harness-task",
    budget: "standard",
    writeScope,
  }).pipe(Effect.provide(TaskApplicationServicesPlaceholderLayer)),
);
assert(createFailure instanceof TaskKernelNotImplementedError);
assert.match(createFailure.message, /TaskCommandService\.createTask/);

const repositoryFailure = await captureFailure(
  Effect.gen(function* () {
    const repository = yield* TaskPackageStore;
    return yield* repository.get(createTaskRef({
      kind: "task-id",
      value: "2026-06-05-task-kernel-tk02-effect-service-tags-layers",
    }));
  }).pipe(Effect.provide(TaskPortsPlaceholderLayer)),
);
assert(repositoryFailure instanceof TaskKernelNotImplementedError);
assert.match(repositoryFailure.message, /TaskPackageStore\.get/);

const productionSources = collectSources(path.join(repoRoot, "scripts/kernel/task"));
assert(productionSources.length > 0, "Task Kernel source files should exist");

for (const file of productionSources) {
  const source = fs.readFileSync(file, "utf8");
  const relativePath = toPosix(path.relative(repoRoot, file));
  assert(
    !/\b(?:from|import)\s*["'][^"']*scripts\/lib\b/.test(source),
    `${relativePath} must not import scripts/lib by absolute package path`,
  );
  assert(
    !/\b(?:from|import)\s*["'](?:\.\.\/)+(?:\.\.\/)*lib\//.test(source),
    `${relativePath} must not import legacy scripts/lib by relative path`,
  );
}

console.log("Task Kernel service tag tests passed");

async function captureFailure<A, E>(effect: Effect.Effect<A, E>): Promise<E> {
  return Effect.runPromise(Effect.flip(effect));
}

function collectSources(root: string): string[] {
  const files: string[] = [];
  walk(root, files);
  return files.filter((file) => file.endsWith(".mts") || file.endsWith(".ts")).sort();
}

function walk(current: string, files: string[]): void {
  const stat = fs.lstatSync(current);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(current)) walk(path.join(current, entry), files);
    return;
  }
  if (stat.isFile()) files.push(current);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}
