#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  allowedMulticaMetadataKeys,
  assertTaskBinding,
  createExternalTaskBinding,
  createLocalTaskBinding,
  isAllowedMulticaMetadataKey,
  taskBindingSchemaVersion,
  type TaskBinding,
} from "../scripts/kernel/task/index.mjs";

const createdAt = "2026-06-10T05:44:19Z";

const localOnly = createLocalTaskBinding({
  harnessTask: {
    taskRef: "TASKS/2026-06-10-local-only-schema-task",
    taskPackagePath: "coding-agent-harness/planning/tasks/2026-06-10-local-only-schema-task",
  },
  bindingCreatedAt: createdAt,
});

assert.equal(localOnly.schemaVersion, taskBindingSchemaVersion);
assert.equal(localOnly.issueBackend, "none");
assert.equal(localOnly.syncMode, "local-only");
assert.equal("externalTask" in localOnly, false);

const multicaBound = createExternalTaskBinding({
  issueBackend: "multica",
  externalTask: {
    provider: "multica",
    id: "f9e8e75b-739c-428c-824b-6efa71e2aad6",
    identifier: "FAI-37",
    url: "https://multica.local/issues/FAI-37",
    projectId: "7470d226-891d-4d1e-9e17-7268d20ad310",
    parentId: "d5bbfb25-0ce7-4dfb-94fd-5519a2c01304",
  },
  harnessTask: {
    taskRef: "TASKS/2026-06-10-fai-37-multica-taskbinding-schema",
    taskPackagePath: "coding-agent-harness/planning/tasks/2026-06-10-fai-37-multica-taskbinding-schema",
  },
  titleSnapshot: "Define Multica TaskBinding schema for Coding Agent Harness",
  bindingCreatedAt: createdAt,
});

assert.equal(multicaBound.issueBackend, "multica");
assert.equal(multicaBound.externalTask.identifier, "FAI-37");
assert.equal(multicaBound.titleSnapshot, "Define Multica TaskBinding schema for Coding Agent Harness");
assert.deepEqual(assertTaskBinding(multicaBound), multicaBound);

const childPackage = createExternalTaskBinding({
  issueBackend: "multica",
  bindingRole: "subtask",
  externalTask: {
    provider: "multica",
    id: "f9e8e75b-739c-428c-824b-6efa71e2aad6",
    identifier: "FAI-37",
  },
  harnessTask: {
    taskRef: "TASKS/2026-06-10-fai-37-review-packet",
    taskPackagePath: "coding-agent-harness/planning/tasks/2026-06-10-fai-37-review-packet",
  },
  parentHarnessTaskRef: "TASKS/2026-06-10-fai-37-multica-taskbinding-schema",
  titleSnapshot: "Define Multica TaskBinding schema for Coding Agent Harness",
  bindingCreatedAt: createdAt,
});

assert.equal(childPackage.bindingRole, "subtask");
assert.equal(childPackage.parentHarnessTaskRef, "TASKS/2026-06-10-fai-37-multica-taskbinding-schema");

assert.deepEqual(
  allowedMulticaMetadataKeys,
  [
    "harness_task_ref",
    "harness_artifact_index_ref",
    "pipeline_status",
    "pr_url",
    "pr_number",
    "deploy_url",
    "external_issue_url",
    "waiting_on",
    "blocked_reason",
    "decision",
  ],
);
assert.equal(isAllowedMulticaMetadataKey("harness_task_ref"), true);
assert.equal(isAllowedMulticaMetadataKey("issue_title_snapshot"), false);
assert.equal(isAllowedMulticaMetadataKey("run_logs"), false);

const invalidCases: Array<{ name: string; binding: unknown; message: RegExp }> = [
  {
    name: "local binding with external sync",
    binding: {
      ...localOnly,
      syncMode: "bound-optional",
    },
    message: /syncMode must be local-only/,
  },
  {
    name: "Multica binding without issue identifier",
    binding: {
      ...multicaBound,
      externalTask: {
        ...multicaBound.externalTask,
        identifier: undefined,
      },
    },
    message: /identifier is required/,
  },
  {
    name: "Multica binding with non-UUID id",
    binding: {
      ...multicaBound,
      externalTask: {
        ...multicaBound.externalTask,
        id: "FAI-37",
      },
    },
    message: /Multica issue UUID/,
  },
  {
    name: "external binding with provider mismatch",
    binding: {
      ...multicaBound,
      externalTask: {
        ...multicaBound.externalTask,
        provider: "github",
      },
    },
    message: /provider must match issueBackend/,
  },
  {
    name: "subtask binding without parent task ref",
    binding: {
      ...childPackage,
      parentHarnessTaskRef: undefined,
    } satisfies Partial<TaskBinding>,
    message: /parentHarnessTaskRef is required/,
  },
  {
    name: "absolute task package path",
    binding: {
      ...localOnly,
      harnessTask: {
        ...localOnly.harnessTask,
        taskPackagePath: "/tmp/task",
      },
    },
    message: /repository-relative path/,
  },
];

for (const { name, binding, message } of invalidCases) {
  assert.throws(() => assertTaskBinding(binding), message, name);
}

console.log("Task binding schema tests passed");
