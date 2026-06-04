export type WorkbenchActionId =
  | "review-complete"
  | "review-complete-bulk"
  | "task-complete"
  | "lesson-sedimentation-task"
  | "lesson-sedimentation-bulk"
  | "preset-check"
  | "preset-install"
  | "preset-seed"
  | "preset-uninstall";

export type WorkbenchActionCatalogEntry = {
  id: WorkbenchActionId;
  method: "POST";
  path: string;
  domain: "task" | "lesson" | "preset";
  snapshotRefresh: "always" | "never" | "when-confirmed" | "unless-dry-run";
  humanControlled: boolean;
};

const workbenchActionCatalog = [
  { id: "review-complete", method: "POST", path: "/api/tasks/review-complete", domain: "task", snapshotRefresh: "always", humanControlled: true },
  { id: "review-complete-bulk", method: "POST", path: "/api/tasks/review-complete-bulk", domain: "task", snapshotRefresh: "when-confirmed", humanControlled: true },
  { id: "task-complete", method: "POST", path: "/api/tasks/task-complete", domain: "task", snapshotRefresh: "always", humanControlled: false },
  { id: "lesson-sedimentation-task", method: "POST", path: "/api/tasks/lesson-sedimentation", domain: "lesson", snapshotRefresh: "always", humanControlled: false },
  { id: "lesson-sedimentation-bulk", method: "POST", path: "/api/tasks/lesson-sedimentation-bulk", domain: "lesson", snapshotRefresh: "never", humanControlled: false },
  { id: "preset-check", method: "POST", path: "/api/presets/check", domain: "preset", snapshotRefresh: "never", humanControlled: false },
  { id: "preset-install", method: "POST", path: "/api/presets/install", domain: "preset", snapshotRefresh: "always", humanControlled: false },
  { id: "preset-seed", method: "POST", path: "/api/presets/seed", domain: "preset", snapshotRefresh: "unless-dry-run", humanControlled: false },
  { id: "preset-uninstall", method: "POST", path: "/api/presets/uninstall", domain: "preset", snapshotRefresh: "always", humanControlled: false },
] as const satisfies ReadonlyArray<WorkbenchActionCatalogEntry>;

export function listWorkbenchActions(): WorkbenchActionCatalogEntry[] {
  return workbenchActionCatalog.map((action) => ({ ...action }));
}

export function listWorkbenchWritableActionIds(): WorkbenchActionId[] {
  return workbenchActionCatalog.map((action) => action.id);
}

export function workbenchActionPath(id: WorkbenchActionId): string {
  return workbenchAction(id).path;
}

export function isWorkbenchActionRequest(pathname: string, method: string | undefined, id: WorkbenchActionId): boolean {
  const action = workbenchAction(id);
  return pathname === action.path && method === action.method;
}

function workbenchAction(id: WorkbenchActionId): WorkbenchActionCatalogEntry {
  const action = workbenchActionCatalog.find((candidate) => candidate.id === id);
  if (!action) throw new Error(`Unknown workbench action: ${id}`);
  return { ...action };
}
