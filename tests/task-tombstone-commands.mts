#!/usr/bin/env node

import {
  archiveTask,
  archiveTasks,
  assertHardDeleteEligible,
  deleteTask,
  reopenTask,
  softDeleteTask,
  supersedeTask,
} from "../scripts/lib/task-tombstone-commands.mjs";
import { assert } from "./helpers/harness-test-utils.mjs";

const compatibilityExports = {
  archiveTask,
  archiveTasks,
  assertHardDeleteEligible,
  deleteTask,
  reopenTask,
  softDeleteTask,
  supersedeTask,
};

for (const [name, value] of Object.entries(compatibilityExports)) {
  assert(typeof value === "function", `task-tombstone-commands should export function ${name}`);
}

console.log("Task tombstone command compatibility tests passed");
