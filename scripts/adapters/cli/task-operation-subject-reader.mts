import { createScannerTaskRepository } from "../../lib/task-repository.mjs";
import type { TaskOperationSubjectReader } from "../../lib/types/task-repository.js";
import type { TaskScannerTarget } from "../../lib/types/task-scanner.js";

export function createScannerTaskOperationSubjectReader(targetInput: TaskScannerTarget | string | undefined = "."): TaskOperationSubjectReader {
  return createScannerTaskRepository(targetInput);
}
