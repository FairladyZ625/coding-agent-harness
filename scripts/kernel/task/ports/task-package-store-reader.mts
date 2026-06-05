import type {
  Task,
  TaskId,
  TaskRef,
  WriteScope,
} from "../domain/index.mjs";

export const taskMaterialNames = [
  "INDEX.md",
  "brief.md",
  "task_plan.md",
  "execution_strategy.md",
  "visual_map.md",
  "progress.md",
  "findings.md",
  "review.md",
  "lesson_candidates.md",
  "long-running-task-contract.md",
  "walkthrough.md",
] as const;

export type TaskMaterialName = (typeof taskMaterialNames)[number];

export type TaskPackageStoreQuery = Readonly<{
  state?: Task["state"];
  module?: string;
  includeArchived?: boolean;
  search?: string;
}>;

export type TaskPackageStoreLocation = Readonly<{
  id: TaskId;
  directory: string;
  taskPlanPath: string;
  relativeDirectory: string;
  relativeTaskPlanPath: string;
}>;

export type TaskMaterialSnapshot = Readonly<{
  name: TaskMaterialName;
  path: string;
  relativePath: string;
  content: string;
  source: "standalone" | "missing";
}>;

export type TaskPackageMaterials = Readonly<{
  location: TaskPackageStoreLocation;
  materials: Readonly<Record<TaskMaterialName, TaskMaterialSnapshot>>;
}>;

export type TaskPackageSnapshot = Readonly<{
  location: TaskPackageStoreLocation;
  task: Task;
  materials: Readonly<Record<TaskMaterialName, TaskMaterialSnapshot>>;
  parseWarnings: readonly string[];
}>;

export type WriteTaskMaterialInput = Readonly<{
  ref: TaskRef;
  materialName: TaskMaterialName;
  content: string;
  writeScope: WriteScope;
}>;

export type TaskPackageStoreReader = Readonly<{
  list(query?: TaskPackageStoreQuery): readonly TaskPackageSnapshot[];
  get(ref: TaskRef): TaskPackageSnapshot;
  resolve(ref: TaskRef): TaskPackageStoreLocation;
  readMaterials(ref: TaskRef): TaskPackageMaterials;
  writeMaterial(input: WriteTaskMaterialInput): TaskMaterialSnapshot;
}>;
