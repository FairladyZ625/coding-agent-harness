import { createTaskWorkbenchReviewSubjectReader } from "../../lib/task-repository.mjs";
import type { TaskQuery, TaskWorkbenchReviewSubject } from "../../lib/types/task-repository.js";

export type WorkbenchReviewSubjectSource = {
  listWorkbenchReviewSubjects(query?: TaskQuery): TaskWorkbenchReviewSubject[];
};

type WorkbenchReviewSourceTarget = {
  projectRoot: string;
};

export function createWorkbenchReviewSubjectSource(target: WorkbenchReviewSourceTarget): WorkbenchReviewSubjectSource {
  return createTaskWorkbenchReviewSubjectReader(target);
}
