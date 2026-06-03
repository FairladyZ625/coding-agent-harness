export function isGitBackedHumanReviewConfirmed(input: unknown): boolean {
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

export function isConcreteAuditField(value: unknown): boolean {
  return String(value || "").trim().length > 0 && String(value || "").trim().toLowerCase() !== "n/a";
}
