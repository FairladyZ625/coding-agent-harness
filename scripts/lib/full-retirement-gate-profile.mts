export type FullRetirementPhase = "P10" | "P11" | "P12" | "P13";

export type FullRetirementGateId =
  | "build-runtime"
  | "typecheck"
  | "import-graph"
  | "legacy-fallback-detector"
  | "legacy-fallback-final-audit"
  | "dashboard-smoke"
  | "dashboard-generation"
  | "source-package-check"
  | "pack-dry-run"
  | "installed-package-smoke"
  | "retired-path-text-scan"
  | "docs-release-leak-check"
  | "full-npm-test"
  | "npm-check"
  | "reviewer-no-open-p0-p2";

export type FullRetirementGateKind =
  | "build"
  | "typecheck"
  | "import-graph"
  | "detector"
  | "dashboard"
  | "package"
  | "docs"
  | "test"
  | "review";

export type GateEvidenceStatus = "pass" | "fail" | "not-run" | "waived" | "no-impact";

export type GateResidualClassification = "implemented" | "no-impact" | "deferred-with-expiry";

export type FullRetirementGateRequirement = {
  id: FullRetirementGateId;
  kind: FullRetirementGateKind;
  phases: FullRetirementPhase[];
  command: string;
  proves: string;
  required: boolean;
  allowNoImpact: boolean;
};

export type GateEvidenceResult = {
  gateId: FullRetirementGateId;
  status: GateEvidenceStatus;
  evidence?: string;
  reason?: string;
};

export type GateResidual = {
  id: string;
  classification: GateResidualClassification;
  owner?: string;
  expiryPhase?: FullRetirementPhase;
  evidence?: string;
  closePath?: string;
};

export type GateEvidenceEnvelope = {
  schemaVersion: "full-retirement-evidence-envelope/v1";
  phase: FullRetirementPhase;
  results: GateEvidenceResult[];
  residuals?: GateResidual[];
};

export type GateEvidenceFinding = {
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

export type GateEvidenceEvaluation = {
  schemaVersion: "full-retirement-gate-evaluation/v1";
  phase: FullRetirementPhase;
  readyForAgentReview: boolean;
  findings: GateEvidenceFinding[];
  requiredGateIds: FullRetirementGateId[];
};

export const fullRetirementGateProfile: FullRetirementGateRequirement[] = [
  gate("build-runtime", "build", ["P10", "P11", "P13"], "npm run build:runtime", "runtime JS emit exists before detector/package gates"),
  gate("typecheck", "typecheck", ["P10", "P11", "P13"], "npm run typecheck", "TypeScript contract remains valid"),
  gate("import-graph", "import-graph", ["P10", "P11", "P13"], "node scripts/check-import-graph.mts --check --json", "legacy import boundaries and repository identity guards hold"),
  gate("legacy-fallback-detector", "detector", ["P10", "P11"], "node scripts/run-built-tests.mts --test tests/legacy-fallback-detector.mjs", "detector positive/negative fixtures catch illegal raw fallback, retired facade import, and stale package export"),
  gate("legacy-fallback-final-audit", "detector", ["P13"], "node dist/check-legacy-fallback-surfaces.mjs --final-audit --registry <fallback-surface-registry.md> --json", "P13 registry classes and review states are final-audit clean"),
  gate("dashboard-smoke", "dashboard", ["P10", "P11", "P13"], "npm run smoke:dashboard", "Dashboard consumer still renders after gate/package changes"),
  gate("dashboard-generation", "dashboard", ["P10", "P13"], "node scripts/run-built-tests.mts --test tests/dashboard-generation.mjs", "Dashboard generation has no-data-loss coverage"),
  gate("source-package-check", "package", ["P10", "P11", "P13"], "npm run check", "source-package profile and governance checks pass"),
  gate("pack-dry-run", "package", ["P10", "P11", "P13"], "npm pack --dry-run --json", "tarball file surface is observable"),
  gate("installed-package-smoke", "package", ["P11", "P13"], "npm run prepublishOnly", "installed/package smoke does not expose retired facades"),
  gate("retired-path-text-scan", "package", ["P11", "P12", "P13"], "node dist/check-legacy-fallback-surfaces.mjs --package-json package.json --json", "package/docs text does not point to retired paths"),
  gate("docs-release-leak-check", "docs", ["P12", "P13"], "node dist/check-legacy-fallback-surfaces.mjs --scan-root docs-release --json", "public docs do not teach retired paths or leak private planning"),
  gate("full-npm-test", "test", ["P10", "P11", "P13"], "npm test", "full regression catches cross-surface fallback reintroduction"),
  gate("npm-check", "test", ["P10", "P11", "P12", "P13"], "npm run check", "project source-package profile remains green"),
  gate("reviewer-no-open-p0-p2", "review", ["P13"], "read-only reviewer report", "final review has no open P0/P1/P2 findings"),
];

export function getFullRetirementGateProfile(phase: FullRetirementPhase): FullRetirementGateRequirement[] {
  return fullRetirementGateProfile.filter((requirement) => requirement.phases.includes(phase));
}

export function evaluateGateEvidenceEnvelope(envelope: GateEvidenceEnvelope): GateEvidenceEvaluation {
  const requirements = getFullRetirementGateProfile(envelope.phase);
  const requirementById = new Map(fullRetirementGateProfile.map((requirement) => [requirement.id, requirement]));
  const resultByGate = new Map(envelope.results.map((result) => [result.gateId, result]));
  const findings: GateEvidenceFinding[] = [];

  for (const result of envelope.results) {
    const requirement = requirementById.get(result.gateId);
    if (!requirement) {
      findings.push({
        code: "unknown-gate",
        gateId: result.gateId,
        message: `Unknown full-retirement gate: ${result.gateId}`,
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
        message: `Missing required ${envelope.phase} gate: ${requirement.id}`,
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
        message: `Required gate ${requirement.id} was waived; waiver cannot mark done.`,
      });
    }
  }

  for (const residual of envelope.residuals || []) {
    if (residual.classification !== "deferred-with-expiry") continue;
    if (!residual.owner) {
      findings.push({
        code: "residual-missing-owner",
        residualId: residual.id,
        message: `Deferred residual ${residual.id} is missing an owner.`,
      });
    }
    if (!residual.expiryPhase) {
      findings.push({
        code: "residual-missing-expiry",
        residualId: residual.id,
        message: `Deferred residual ${residual.id} is missing an expiry phase.`,
      });
    }
    if (!residual.closePath) {
      findings.push({
        code: "residual-missing-close-path",
        residualId: residual.id,
        message: `Deferred residual ${residual.id} is missing a P13 close path.`,
      });
    }
  }

  return {
    schemaVersion: "full-retirement-gate-evaluation/v1",
    phase: envelope.phase,
    readyForAgentReview: findings.length === 0,
    findings,
    requiredGateIds: requirements.filter((entry) => entry.required).map((entry) => entry.id),
  };
}

function gate(
  id: FullRetirementGateId,
  kind: FullRetirementGateKind,
  phases: FullRetirementPhase[],
  command: string,
  proves: string,
): FullRetirementGateRequirement {
  return {
    id,
    kind,
    phases,
    command,
    proves,
    required: true,
    allowNoImpact: false,
  };
}
