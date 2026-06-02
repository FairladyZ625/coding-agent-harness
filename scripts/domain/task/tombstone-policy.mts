type TombstonePolicyTask = {
  state?: unknown;
  deletionState?: unknown;
  reviewSubmitted?: unknown;
  reviewStatus?: unknown;
  reviewConfirmation?: { confirmed?: unknown } | null;
  materialsReady?: unknown;
  evidence?: unknown[];
  taskQueues?: unknown[];
  risks?: Array<{ open?: unknown; blocksRelease?: unknown; severity?: unknown }>;
};

export function isDraftTaskState(state: unknown): boolean {
  const normalized = String(state || "").trim().toLowerCase().replaceAll("-", "_").replace(/\s+/g, "_");
  return ["planned", "not_started"].includes(normalized);
}

export function isRiskyTombstoneMutationTask(task: TombstonePolicyTask): boolean {
  return !isDraftTaskState(task.state) ||
    Boolean(task.reviewSubmitted) ||
    task.reviewStatus === "confirmed" ||
    Boolean(task.reviewConfirmation?.confirmed) ||
    task.materialsReady === true && !isDraftTaskState(task.state) ||
    (task.evidence || []).length > 0 ||
    (task.taskQueues || []).some((queue) => ["blocked", "review", "confirmed", "finalized", "lessons"].includes(String(queue)));
}

export function hasOpenBlockingTombstoneFindings(task: TombstonePolicyTask): boolean {
  return (task.risks || []).some((risk) => normalizeReviewBoolean(risk.open) !== "no" && (normalizeReviewBoolean(risk.blocksRelease) === "yes" || ["P0", "P1", "P2"].includes(String(risk.severity))));
}

export function hardDeleteLifecycleBlockers(task: TombstonePolicyTask): string[] {
  const blockers: string[] = [];
  if (!isDraftTaskState(task.state)) blockers.push(`state:${task.state}`);
  if (task.deletionState !== "active") blockers.push(`deletionState:${task.deletionState}`);
  if (isRiskyTombstoneMutationTask(task)) blockers.push("task has lifecycle, review, evidence, or closeout history");
  if (!isDraftTaskState(task.state) && hasOpenBlockingTombstoneFindings(task)) blockers.push("task has open blocking findings");
  return blockers;
}

function normalizeReviewBoolean(value: unknown): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  const raw = String(value || "").trim().toLowerCase();
  if (/^(yes|true|open|是|开放)$/.test(raw)) return "yes";
  if (/^(no|false|closed|fixed|done|否|关闭|已关闭|已修复)$/.test(raw)) return "no";
  return raw;
}
