import type { ResolvedHarnessPaths } from "../harness-paths.mjs";
import type { PhaseProgress } from "../phase-kind.mjs";

export type TaskScannerTarget = Partial<ResolvedHarnessPaths> & {
  projectRoot: string;
  docsRoot?: string;
  docsOnly?: boolean;
  input?: string;
  harness?: Record<string, unknown>;
  harnessRootRelative?: string;
  structureVersion?: number;
  structureState?: string;
};

export type TaskMaterialSource = "standalone" | "legacy" | "missing";
export type VisualMapSource = "canonical" | "legacy" | "missing";
export type VisualMapStatus = "present" | "legacy-only" | "missing" | "not-needed";
export type TaskBudget = "simple" | "standard" | "complex";

export type TaskContractFile = {
  path: string;
  content: string;
  source: TaskMaterialSource;
};

export type VisualMapContractFile = {
  path: string;
  content: string;
  source: VisualMapSource;
  status: Exclude<VisualMapStatus, "not-needed">;
};

export type TaskClassification = {
  module: string;
  source: "explicit" | "structure" | "inferred" | "fallback";
  bucket: "module" | "legacy" | "current";
};

export type TaskPhase = PhaseProgress & {
  id: string;
  kind: string;
  dependsOn: string[];
  state: string;
  output: string;
  requiredEvidence: string[];
  exitCommand: string;
  actor: string;
  evidenceStatus: string;
  blockingRisk: string;
  owner: string;
};

export type BriefQuality = {
  status: "pass" | "fail";
  issues: string[];
};

export type LessonCandidateRow = Record<string, string>;

export type LessonCandidateStatus = {
  status: string;
  declaredStatus?: string;
  schemaVersion?: string;
  reviewDecision: string;
  promotionState: string;
  closeoutToken: string;
  rows: LessonCandidateRow[];
  openCount: number;
  issues: string[];
};

export type MigrationSnapshot = {
  targetLevel: string;
  achievedLevel: string;
  evidenceBundle: string;
  evidencePresent: boolean;
  sessionPresent: boolean;
  sessionResult: string;
  normalStatus: string;
  strictStatus: string;
  strictDeferred: boolean;
  warnings: number;
  taskActions: number;
  reviewSchemaGaps: number;
  legacyReferenceGaps: number;
  legacyResiduals: number;
  fullCutoverEligible: boolean;
};

export type CloseoutInfo = {
  status: string;
  walkthroughPath: string;
};

export type HandoffRef = {
  id: string;
  from: string;
  to: string;
  state: string;
  summary: string;
};

export type EvidenceRef = {
  id: string;
  type: string;
  path: string;
  status: string;
  summary: string;
};

export type CollectTasksOptions = {
  requireGeneratedScaffoldProvenance?: boolean;
  includeArchived?: boolean;
  taskPlanPaths?: string[];
  closeoutContent?: string;
  strictReviewGitAudit?: boolean;
};
