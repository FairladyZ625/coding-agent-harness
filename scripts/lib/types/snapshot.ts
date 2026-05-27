export type SnapshotCommandId =
  | "status"
  | "task-list"
  | "preset-list"
  | "source-check"
  | "target-check"
  | "migrate-plan";

export interface SnapshotCommandSpec {
  id: SnapshotCommandId;
  args: readonly string[];
}

export interface SnapshotCapture {
  id: SnapshotCommandId;
  command: string;
  exitCode: number;
  signal: string | null;
  durationMs: number | "<duration>";
  stdout: unknown;
  stderr: unknown;
}

export interface SnapshotMatrix {
  schemaVersion: 1;
  label: string;
  generatedAt: string;
  repoRoot: string;
  commands: readonly SnapshotCommandSpec[];
  captures: Partial<Record<SnapshotCommandId, SnapshotCapture>>;
}

export type SnapshotDriftCode =
  | "missing-command"
  | "exit-code"
  | "json-shape"
  | "stdout-text"
  | "stderr-text"
  | "task-count"
  | "failure-count"
  | "lifecycle-queue-count"
  | "migration-action-count"
  | "migration-residual-count"
  | "migration-task-actions"
  | "migration-visual-map-actions"
  | "migration-legacy-actions"
  | "migration-legacy-residuals"
  | "preset-id-set";

export interface SnapshotDrift {
  code: SnapshotDriftCode;
  command?: SnapshotCommandId;
  before?: unknown;
  after?: unknown;
}
