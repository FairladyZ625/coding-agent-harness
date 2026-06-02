type ArchiveEligibilityTask = {
  state?: string;
  budget?: string;
  closeoutStatus?: string;
  taskQueues?: string[];
  risks?: Array<{ open?: unknown; blocksRelease?: unknown; severity?: unknown }>;
  materialsReady?: boolean;
  reviewStatus?: string;
  reviewConfirmation?: Record<string, unknown> | null;
  deletionState?: string;
};

export type ArchiveEligibilityResult = {
  eligible: boolean;
  reason: string;
  auditFields: Record<string, string>;
};

export function assessArchiveEligibility(task: ArchiveEligibilityTask, { archivedBy = "", now = new Date().toISOString() }: { archivedBy?: string; now?: string } = {}): ArchiveEligibilityResult {
  const reason = archiveBlockReason(task, { archivedBy });
  if (reason) return { eligible: false, reason, auditFields: {} };
  const confirmation = (task.reviewConfirmation || {}) as Record<string, unknown>;
  const actor = normalizeArchiveActor(archivedBy);
  return {
    eligible: true,
    reason: "",
    auditFields: {
      "Archived By": actor,
      "Archived At": now,
      "Review Confirmed By": String(confirmation.reviewer || ""),
      "Review Confirmed At": String(confirmation.confirmedAt || ""),
      "Review Confirmation ID": String(confirmation.confirmationId || ""),
      "Review Commit SHA": String(confirmation.commitSha || ""),
    },
  };
}

export function archiveBlockReason(task: ArchiveEligibilityTask, { archivedBy = "" }: { archivedBy?: string } = {}): string {
  if (task.deletionState === "superseded") return "superseded tasks cannot be archived";
  if (task.state === "blocked" || (task.taskQueues || []).includes("blocked")) {
    return "blocked tasks cannot be archived without an explicit human waiver";
  }
  const blockingRisks = (task.risks || []).filter((risk) => normalizeReviewBoolean(risk.open) !== "no" && (normalizeReviewBoolean(risk.blocksRelease) === "yes" || ["P0", "P1", "P2"].includes(String(risk.severity))));
  if (blockingRisks.length) return "tasks with open blocking review findings cannot be archived without an explicit human waiver";
  const reviewFinalized = isGitBackedHumanReviewConfirmed(task);
  if (!reviewFinalized && task.state !== "done") return `state:${task.state || "unknown"}`;
  if (!reviewFinalized && task.budget !== "simple" && task.closeoutStatus !== "closed") return "tasks must have closed closeout materials before archive";
  if (task.materialsReady === false && task.reviewStatus !== "confirmed") {
    return "tasks with incomplete closeout materials cannot be archived without an explicit human waiver";
  }
  const confirmation = (task.reviewConfirmation || {}) as Record<string, unknown>;
  if (confirmation.confirmed !== true) return "Human review confirmation is required before task archive";
  const missingConfirmationFields: string[] = [];
  if (!isConcreteAuditField(confirmation.confirmationId)) missingConfirmationFields.push("Confirmation ID");
  if (!isConcreteAuditField(confirmation.confirmedAt)) missingConfirmationFields.push("Confirmed At");
  if (!isConcreteAuditField(confirmation.reviewer)) missingConfirmationFields.push("Reviewer");
  if (!isConcreteAuditField(confirmation.commitSha)) missingConfirmationFields.push("Review Commit SHA");
  if (missingConfirmationFields.length) {
    return `Human review confirmation is not traceable; missing ${missingConfirmationFields.join(", ")}`;
  }
  if (!normalizeArchiveActor(archivedBy)) {
    return "task archive requires --archived-by <name-or-email> for accountability";
  }
  return "";
}

export function normalizeArchiveActor(value: unknown): string {
  const actor = String(value || "").replace(/\r?\n/g, " ").trim();
  if (!actor) return "";
  if (/^(coordinator|agent|unknown|n\/a|na|none|pending|todo|tbd)$/i.test(actor)) return "";
  return actor;
}

function normalizeReviewBoolean(value: unknown): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  const raw = String(value || "").trim().toLowerCase();
  if (/^(yes|true|open|是|开放)$/.test(raw)) return "yes";
  if (/^(no|false|closed|fixed|done|否|关闭|已关闭|已修复)$/.test(raw)) return "no";
  return raw;
}

function isGitBackedHumanReviewConfirmed(input: unknown): boolean {
  const container = input && typeof input === "object" && "reviewConfirmation" in input
    ? input as { reviewConfirmation?: unknown }
    : { reviewConfirmation: input };
  const confirmation = container.reviewConfirmation;
  if (!confirmation || typeof confirmation !== "object") return false;
  const record = confirmation as Record<string, unknown>;
  if (record.confirmed !== true) return false;
  const requiredFields = ["confirmationId", "confirmedAt", "reviewer", "commitSha"];
  if (!requiredFields.every((field) => isConcreteAuditField(record[field]))) return false;
  if (!/^[0-9a-f]{7,40}$/i.test(String(record.commitSha || ""))) return false;
  const gitAudit = record.gitAudit;
  return Boolean(gitAudit && typeof gitAudit === "object" && (gitAudit as { valid?: unknown }).valid === true);
}

function isConcreteAuditField(value: unknown): boolean {
  const raw = String(value || "").replace(/`/g, "").trim();
  return Boolean(raw) && !/^(n\/a|na|none|pending(?:[-_ ].*)?|todo|tbd|\[.*\]|-|—|–|不适用|无|待定|\{\})$/i.test(raw) && !/\{\{[^}]+\}\}/.test(raw);
}
