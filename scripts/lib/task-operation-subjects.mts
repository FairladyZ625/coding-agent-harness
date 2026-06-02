import { createScannerTaskRepository } from "./task-repository.mjs";
import type { TaskOperationSubjectReader } from "./types/task-repository.js";
import type { TaskScannerTarget } from "./types/task-scanner.js";

export function createScannerTaskOperationSubjectReader(targetInput: TaskScannerTarget | string | undefined = "."): TaskOperationSubjectReader {
  return createScannerTaskRepository(targetInput);
}
