export type TaskKernelCutoverProfile = "TK11";

export type TaskKernelCutoverGateId =
  | "git-diff-check"
  | "typecheck"
  | "no-production-legacy-dependency"
  | "no-hidden-fallback"
  | "projection-no-data-loss"
  | "write-scope-transaction"
  | "human-review-boundary"
  | "package-facade-protection"
  | "generated-surface-read-only"
  | "adapter-thinness"
  | "preset-migration-split"
  | "test-runner-viability"
  | "divergence-classification";

export type TaskKernelCutoverGateKind =
  | "baseline"
  | "typecheck"
  | "import-graph"
  | "detector"
  | "projection"
  | "transaction"
  | "review-boundary"
  | "package"
  | "generated"
  | "adapter"
  | "preset"
  | "test"
  | "divergence";

export type CutoverGateEvidenceStatus = "pass" | "fail" | "not-run" | "waived" | "no-impact";

export type CutoverResidualClassification =
  | "implemented"
  | "no-impact"
  | "deferred-with-expiry"
  | "optional-human-review";

export type TaskKernelCutoverGateRequirement = {
  id: TaskKernelCutoverGateId;
  kind: TaskKernelCutoverGateKind;
  commands: readonly string[];
  proves: string;
  required: boolean;
  allowNoImpact: boolean;
};

export type CutoverGateEvidenceResult = {
  gateId: TaskKernelCutoverGateId;
  status: CutoverGateEvidenceStatus;
  evidence?: string;
  reason?: string;
};

export type CutoverResidual = {
  id: string;
  classification: CutoverResidualClassification;
  owner?: string;
  expiryGate?: TaskKernelCutoverGateId | "TK12";
  evidence?: string;
  closePath?: string;
};

export type TaskKernelCutoverEvidenceEnvelope = {
  schemaVersion: "task-kernel-cutover-evidence-envelope/v1";
  profile: TaskKernelCutoverProfile;
  results: readonly CutoverGateEvidenceResult[];
  residuals?: readonly CutoverResidual[];
};

export type CutoverGateFinding = {
  code:
    | "missing-required-gate"
    | "failed-required-gate"
    | "not-run-required-gate"
    | "waived-required-gate"
    | "no-impact-missing-reason"
    | "no-impact-not-allowed"
    | "unknown-gate"
    | "residual-missing-owner"
    | "residual-missing-expiry"
    | "residual-missing-close-path";
  gateId?: string;
  residualId?: string;
  message: string;
};

export type TaskKernelCutoverEvaluation = {
  schemaVersion: "task-kernel-cutover-gate-evaluation/v1";
  profile: TaskKernelCutoverProfile;
  readyForTk12: boolean;
  findings: readonly CutoverGateFinding[];
  requiredGateIds: readonly TaskKernelCutoverGateId[];
};

export const taskKernelCutoverGateProfile: readonly TaskKernelCutoverGateRequirement[] = [
  gate("git-diff-check", "baseline", ["git diff --check"], "public branch has no whitespace or patch-format defects"),
  gate("typecheck", "typecheck", ["npm run typecheck"], "TypeScript contracts remain valid before cutover"),
  gate(
    "no-production-legacy-dependency",
    "import-graph",
    ["node scripts/run-built-tests.mts --test tests/import-graph-gate.mts"],
    "Task Kernel production surfaces do not import legacy scripts/lib business interfaces",
  ),
  gate(
    "no-hidden-fallback",
    "detector",
    ["node scripts/run-built-tests.mts --test tests/legacy-fallback-detector.mts"],
    "fallback detector still catches hidden raw legacy runtime paths",
  ),
  gate(
    "projection-no-data-loss",
    "projection",
    [
      "node scripts/run-built-tests.mts --test tests/task-kernel-oracle-parity.mts",
      "node scripts/run-built-tests.mts --test tests/task-kernel-dashboard-gui-query-parity.mts",
    ],
    "old runtime and Task Kernel projections preserve task list/detail/dashboard data or classify differences",
  ),
  gate(
    "write-scope-transaction",
    "transaction",
    ["node scripts/run-built-tests.mts --test tests/task-kernel-unit-of-work.mts"],
    "mutating Task Kernel commands keep scoped Unit of Work write evidence",
  ),
  gate(
    "human-review-boundary",
    "review-boundary",
    ["node scripts/run-built-tests.mts --test tests/review-confirm-git-gate.mts"],
    "agent paths cannot fabricate human review-confirm and absent human confirmation is residual, not cutover blocker",
  ),
  gate(
    "package-facade-protection",
    "package",
    [
      "node scripts/run-built-tests.mts --test tests/package-surface.mts",
      "node scripts/run-built-tests.mts --test tests/dist-build-pipeline.mts",
    ],
    "package and dist surfaces do not expose retired deep imports or runtime shims",
  ),
  gate(
    "generated-surface-read-only",
    "generated",
    ["node scripts/run-built-tests.mts --test tests/governance-generated-indexes.mts"],
    "generated governance surfaces rebuild from source task truth instead of becoming writable truth",
  ),
  gate(
    "adapter-thinness",
    "adapter",
    [
      "node scripts/run-built-tests.mts --test tests/task-kernel-cli-adapter-comparison.mts",
      "node scripts/run-built-tests.mts --test tests/task-kernel-http-adapter.mts",
      "node scripts/run-built-tests.mts --test tests/import-graph-gate.mts",
    ],
    "CLI and HTTP adapters stay thin and route through Task Kernel application services",
  ),
  gate(
    "preset-migration-split",
    "preset",
    [
      "node scripts/run-built-tests.mts --test tests/preset-action-runner.mts",
      "node scripts/run-built-tests.mts --test tests/runtime-reliability-spike.mts",
    ],
    "preset closeout boundary stays isolated from migration-only compatibility and Effect does not leak into runtime ports",
  ),
  gate("test-runner-viability", "test", ["npm run check"], "source-package profile and project gates pass as the full cutover runner"),
  gate(
    "divergence-classification",
    "divergence",
    [
      "node scripts/run-built-tests.mts --test tests/task-kernel-oracle-parity.mts",
      "node scripts/run-built-tests.mts --test tests/task-kernel-dashboard-gui-query-parity.mts",
    ],
    "every known old/new output mismatch carries owner, follow-up, and kernel-cutover expiry classification",
  ),
];

export function getTaskKernelCutoverGateProfile(profile: TaskKernelCutoverProfile): readonly TaskKernelCutoverGateRequirement[] {
  if (profile === "TK11") return taskKernelCutoverGateProfile;
  const exhaustive: never = profile;
  throw new Error(`Unsupported Task Kernel cutover profile: ${String(exhaustive)}`);
}

export function evaluateTaskKernelCutoverEvidenceEnvelope(envelope: TaskKernelCutoverEvidenceEnvelope): TaskKernelCutoverEvaluation {
  const requirements = getTaskKernelCutoverGateProfile(envelope.profile);
  const requirementById = new Map(taskKernelCutoverGateProfile.map((requirement) => [requirement.id, requirement]));
  const resultByGate = new Map(envelope.results.map((result) => [result.gateId, result]));
  const findings: CutoverGateFinding[] = [];

  for (const result of envelope.results) {
    const requirement = requirementById.get(result.gateId);
    if (!requirement) {
      findings.push({
        code: "unknown-gate",
        gateId: result.gateId,
        message: `Unknown Task Kernel cutover gate: ${result.gateId}`,
      });
      continue;
    }
    if (result.status === "no-impact" && !result.reason) {
      findings.push({
        code: "no-impact-missing-reason",
        gateId: result.gateId,
        message: `No-impact gate ${result.gateId} requires a concrete reason.`,
      });
    }
    if (result.status === "no-impact" && !requirement.allowNoImpact) {
      findings.push({
        code: "no-impact-not-allowed",
        gateId: result.gateId,
        message: `Gate ${result.gateId} requires direct evidence and cannot be satisfied by no-impact.`,
      });
    }
  }

  for (const requirement of requirements.filter((entry) => entry.required)) {
    const result = resultByGate.get(requirement.id);
    if (!result) {
      findings.push({
        code: "missing-required-gate",
        gateId: requirement.id,
        message: `Missing required ${envelope.profile} gate: ${requirement.id}`,
      });
      continue;
    }
    if (result.status === "fail") {
      findings.push({
        code: "failed-required-gate",
        gateId: requirement.id,
        message: `Required gate ${requirement.id} failed.`,
      });
    } else if (result.status === "not-run") {
      findings.push({
        code: "not-run-required-gate",
        gateId: requirement.id,
        message: `Required gate ${requirement.id} was not run.`,
      });
    } else if (result.status === "waived") {
      findings.push({
        code: "waived-required-gate",
        gateId: requirement.id,
        message: `Required gate ${requirement.id} was waived; waiver cannot mark Task Kernel cutover ready.`,
      });
    }
  }

  for (const residual of envelope.residuals || []) {
    if (residual.classification === "optional-human-review") continue;
    if (residual.classification !== "deferred-with-expiry") continue;
    if (!residual.owner) {
      findings.push({
        code: "residual-missing-owner",
        residualId: residual.id,
        message: `Deferred residual ${residual.id} is missing an owner.`,
      });
    }
    if (!residual.expiryGate) {
      findings.push({
        code: "residual-missing-expiry",
        residualId: residual.id,
        message: `Deferred residual ${residual.id} is missing an expiry gate.`,
      });
    }
    if (!residual.closePath) {
      findings.push({
        code: "residual-missing-close-path",
        residualId: residual.id,
        message: `Deferred residual ${residual.id} is missing a close path.`,
      });
    }
  }

  return {
    schemaVersion: "task-kernel-cutover-gate-evaluation/v1",
    profile: envelope.profile,
    readyForTk12: findings.length === 0,
    findings,
    requiredGateIds: requirements.filter((entry) => entry.required).map((entry) => entry.id),
  };
}

function gate(
  id: TaskKernelCutoverGateId,
  kind: TaskKernelCutoverGateKind,
  commands: readonly string[],
  proves: string,
): TaskKernelCutoverGateRequirement {
  return {
    id,
    kind,
    commands,
    proves,
    required: true,
    allowNoImpact: false,
  };
}
