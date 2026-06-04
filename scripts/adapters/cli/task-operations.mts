import { createTaskOperations } from "../../application/task/task-operations.mjs";
import { createLegacyTaskOperationWriters } from "../../infrastructure/task/legacy-task-operation-writers.mjs";
import {
  createScannerTaskOperationSubjectReader,
  createScannerTaskTombstoneSubjectReader,
} from "./task-operation-subject-reader.mjs";

export function createScannerTaskOperations(targetInput: string = ".") {
  return createTaskOperations(targetInput, {
    subjects: createScannerTaskOperationSubjectReader(targetInput),
    strictSubjects: createScannerTaskOperationSubjectReader(targetInput, { strictReviewGitAudit: true }),
    tombstoneSubjects: createScannerTaskTombstoneSubjectReader(targetInput, { strictReviewGitAudit: true }),
    writers: createLegacyTaskOperationWriters(),
  });
}
