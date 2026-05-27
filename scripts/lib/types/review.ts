export type ReviewSeverity = "P0" | "P1" | "P2" | "P3";

export type ReviewDisposition = "open" | "closed" | "mitigated" | "accepted" | "superseded";

export interface ReviewFinding {
  id: string;
  severity: ReviewSeverity;
  finding: string;
  evidenceChecked: string;
  requiredAction: string;
  open: boolean;
  disposition: ReviewDisposition;
  blocksRelease: boolean;
  followUp?: string;
}

export interface ReviewerIdentity {
  reviewer: string;
  type: "human" | "subagent" | "self" | "automation";
  scope: string;
}
