export type HarnessTaskState = "planning" | "in-progress" | "review" | "blocked" | "completed" | "archived";

export type HarnessTaskQueue =
  | "review"
  | "missing-materials"
  | "blocked"
  | "lessons"
  | "confirmed"
  | "finalized"
  | "soft-deleted"
  | "superseded";

export type HarnessEvidenceType = "command" | "diff" | "fixture" | "screenshot" | "review" | "report";

export interface HarnessEvidenceRef {
  type: HarnessEvidenceType;
  path: string;
  summary: string;
}

export interface HarnessTaskRef {
  id: string;
  title?: string;
  state?: HarnessTaskState;
  queue?: HarnessTaskQueue;
  module?: string;
  evidence?: readonly HarnessEvidenceRef[];
}
