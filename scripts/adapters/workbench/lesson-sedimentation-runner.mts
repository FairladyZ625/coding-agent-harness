import { createAggregateLessonSedimentationTask } from "../../lib/task-lesson-sedimentation.mjs";

export function createWorkbenchAggregateLessonSedimentationTask(
  projectRoot: string,
  selections: Array<{ taskId: string; candidateId: string }>,
  options: { title?: string } = {},
) {
  return createAggregateLessonSedimentationTask(projectRoot, selections, options);
}
