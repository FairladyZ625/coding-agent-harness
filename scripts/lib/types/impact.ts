export type ChangedFileStatus = "added" | "modified" | "deleted" | "renamed" | "typechange" | "untracked";

export type ImpactSurface =
  | "ts-runtime"
  | "type-island"
  | "runtime-build"
  | "built-test-runner"
  | "dashboard-data"
  | "template-schema"
  | "dashboard-ui"
  | "docs-release"
  | "preset-package"
  | "package-boundary"
  | "migration-legacy"
  | "multi-repo-contract"
  | "ci-pr-evidence"
  | "root-contributor-docs"
  | "skill-reference-distribution"
  | "fixture-golden"
  | "gui-submodule"
  | "private-local-only"
  | "unknown";

export type RuntimeLayer = "ts-source" | "runtime-emit" | "built-test" | "package-runtime" | "installed-target" | "not-runtime";

export type GateId =
  | "typecheck"
  | "typecheck-guards"
  | "import-graph"
  | "dist-drift"
  | "runtime-emit-contract"
  | "dist-build-pipeline"
  | "dist-observation"
  | "temp-project-cli-smoke"
  | "status-json-contract"
  | "built-tests"
  | "target-project-check"
  | "dashboard-smoke"
  | "source-package-check"
  | "pack-dry-run"
  | "docs-leak-link-check"
  | "compatibility-policy"
  | "maintainer-review"
  | "dashboard-data-golden"
  | "preset-contract"
  | "migration-fixture"
  | "workflow-lint"
  | "fixture-manifest"
  | "gui-check"
  | "command-consistency";

export type CompatibilityPolicy = "legacy-support" | "migration-required" | "hard-cutover";

export type GateBlockingLevel = "required" | "maintainer-review";

export interface ChangedFileRecord {
  path: string;
  status: ChangedFileStatus;
  oldPath?: string;
  isSubmodule?: boolean;
}

export interface RequiredGate {
  id: GateId;
  blocking: GateBlockingLevel;
  reason: string;
  surfaces: ImpactSurface[];
}

export interface ClassifiedChangedFile {
  path: string;
  status: ChangedFileStatus;
  oldPath?: string;
  surfaces: ImpactSurface[];
  runtimeLayers: RuntimeLayer[];
  requiredGates: GateId[];
  compatibilityPolicyRequired: boolean;
}

export interface UnknownSurface {
  path: string;
  status: ChangedFileStatus;
  reason: string;
}

export interface CompatibilityPolicyRequirement {
  path: string;
  surface: ImpactSurface;
  allowedPolicies: CompatibilityPolicy[];
  reason: string;
}

export interface ImpactClassification {
  changedFiles: ClassifiedChangedFile[];
  surfaces: ImpactSurface[];
  runtimeLayers: RuntimeLayer[];
  requiredGates: RequiredGate[];
  unknownSurfaces: UnknownSurface[];
  compatibilityPolicyRequired: boolean;
  compatibilityPolicyRequirements: CompatibilityPolicyRequirement[];
}
