import { createTombstoneOperations, assertHardDeleteEligible } from "../application/task/tombstone-operations.mjs";
import { createScannerTaskRepository } from "./task-repository.mjs";
import type {
  ArchiveBatchOptions,
  ArchiveOptions,
  SupersedeOptions,
  TombstoneOptions,
} from "../application/task/tombstone-operations.mjs";

export { assertHardDeleteEligible };

export function supersedeTask(targetInput: string, oldRef: string, options: SupersedeOptions = {}) {
  return scannerBackedOperations(targetInput).supersede(oldRef, options);
}

export function softDeleteTask(targetInput: string, taskRef: string, options: TombstoneOptions = {}) {
  return scannerBackedOperations(targetInput).softDelete(taskRef, options);
}

export function deleteTask(targetInput: string, taskRef: string, options: TombstoneOptions & { hard?: boolean } = {}) {
  return scannerBackedOperations(targetInput).delete(taskRef, options);
}

export function archiveTask(targetInput: string, taskRef: string, options: ArchiveOptions = {}) {
  return scannerBackedOperations(targetInput).archive(taskRef, options);
}

export function archiveTasks(targetInput: string, options: ArchiveBatchOptions = {}) {
  return scannerBackedOperations(targetInput).archiveBatch(options);
}

export function reopenTask(targetInput: string, taskRef: string, options: TombstoneOptions = {}) {
  return scannerBackedOperations(targetInput).reopen(taskRef, options);
}

function scannerBackedOperations(targetInput: string) {
  return createTombstoneOperations(targetInput, {
    subjects: createScannerTaskRepository(targetInput),
  });
}
