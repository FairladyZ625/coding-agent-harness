import { buildTaskOperationSubject, buildTaskTombstoneSubject } from "../../domain/task/task-subjects.mjs";
import { createScannerTaskSubjectSource } from "../../infrastructure/task/scanner-subject-source.mjs";
import type {
  TaskOperationSubjectReader,
  TaskRef,
  TombstoneSubjectReader,
} from "../../lib/types/task-repository.js";
import type { TaskScannerTarget } from "../../lib/types/task-scanner.js";

export function createScannerTaskOperationSubjectReader(targetInput: TaskScannerTarget | string | undefined = "."): TaskOperationSubjectReader {
  const source = createScannerTaskSubjectSource(targetInput);
  return {
    getOperationSubject(ref: TaskRef) {
      return buildTaskOperationSubject(source.get(ref).record);
    },
  };
}

export function createScannerTaskTombstoneSubjectReader(targetInput: TaskScannerTarget | string | undefined = "."): TombstoneSubjectReader {
  const source = createScannerTaskSubjectSource(targetInput);
  return {
    getTombstoneSubject(ref: TaskRef) {
      const subject = source.get(ref);
      return buildTaskTombstoneSubject(subject.record, {
        location: subject.location,
        paths: subject.paths,
      });
    },
  };
}
