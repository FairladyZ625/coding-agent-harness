import { listTaskPlanPaths } from "../../lib/task-scanner.mjs";
import type { TaskScannerTarget } from "../../lib/types/task-scanner.js";

export type MigrationTaskSampleReader = {
  listSampleTaskPlans(limit?: number): string[];
};

export function createMigrationTaskSampleReader(target: TaskScannerTarget): MigrationTaskSampleReader {
  return {
    listSampleTaskPlans(limit = 20) {
      return listTaskPlanPaths(target).slice(0, limit);
    },
  };
}
