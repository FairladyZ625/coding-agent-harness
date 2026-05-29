import path from "node:path";
import type {
  ChangedFileRecord,
  ClassifiedChangedFile,
  CompatibilityPolicy,
  CompatibilityPolicyRequirement,
  GateId,
  ImpactClassification,
  ImpactSurface,
  RequiredGate,
  RuntimeLayer,
  UnknownSurface,
} from "./types/impact.js";

const surfaceOrder: ImpactSurface[] = [
  "ts-runtime",
  "type-island",
  "runtime-build",
  "built-test-runner",
  "dashboard-data",
  "template-schema",
  "dashboard-ui",
  "docs-release",
  "preset-package",
  "package-boundary",
  "migration-legacy",
  "multi-repo-contract",
  "ci-pr-evidence",
  "root-contributor-docs",
  "skill-reference-distribution",
  "fixture-golden",
  "gui-submodule",
  "private-local-only",
  "unknown",
];

const runtimeLayerOrder: RuntimeLayer[] = ["ts-source", "runtime-emit", "built-test", "package-runtime", "installed-target", "not-runtime"];

const gateOrder: GateId[] = [
  "typecheck",
  "typecheck-guards",
  "import-graph",
  "dist-drift",
  "runtime-emit-contract",
  "dist-build-pipeline",
  "dist-observation",
  "temp-project-cli-smoke",
  "status-json-contract",
  "built-tests",
  "target-project-check",
  "dashboard-smoke",
  "source-package-check",
  "pack-dry-run",
  "docs-leak-link-check",
  "compatibility-policy",
  "maintainer-review",
  "dashboard-data-golden",
  "preset-contract",
  "migration-fixture",
  "workflow-lint",
  "fixture-manifest",
  "gui-check",
  "command-consistency",
];

const compatibilityPolicies: CompatibilityPolicy[] = ["legacy-support", "migration-required", "hard-cutover"];

const surfaceGateMap: Record<ImpactSurface, GateId[]> = {
  "ts-runtime": ["typecheck", "typecheck-guards", "import-graph", "dist-drift"],
  "type-island": ["typecheck", "typecheck-guards", "import-graph"],
  "runtime-build": ["runtime-emit-contract", "dist-build-pipeline", "dist-observation", "dist-drift"],
  "built-test-runner": ["built-tests", "typecheck"],
  "dashboard-data": ["dashboard-data-golden", "status-json-contract", "dashboard-smoke"],
  "template-schema": ["target-project-check", "compatibility-policy"],
  "dashboard-ui": ["dashboard-smoke"],
  "docs-release": ["docs-leak-link-check", "source-package-check"],
  "preset-package": ["preset-contract", "source-package-check", "compatibility-policy"],
  "package-boundary": ["source-package-check", "pack-dry-run", "compatibility-policy"],
  "migration-legacy": ["migration-fixture", "compatibility-policy"],
  "multi-repo-contract": ["target-project-check", "maintainer-review"],
  "ci-pr-evidence": ["workflow-lint", "maintainer-review"],
  "root-contributor-docs": ["docs-leak-link-check", "source-package-check", "command-consistency"],
  "skill-reference-distribution": ["source-package-check", "pack-dry-run"],
  "fixture-golden": ["fixture-manifest", "target-project-check"],
  "gui-submodule": ["gui-check"],
  "private-local-only": ["source-package-check", "maintainer-review"],
  "unknown": ["maintainer-review"],
};

const gateReasonMap: Record<GateId, string> = {
  typecheck: "TypeScript source changes must satisfy the enforced strict type gate.",
  "typecheck-guards": "Type boundary and no-ts-nocheck guards protect shared type islands and implementation coverage.",
  "import-graph": "Runtime and type island changes can introduce unresolved imports, cycles, or invalid type imports.",
  "dist-drift": "Runtime source or emit changes can make committed/package dist drift from TypeScript source.",
  "runtime-emit-contract": "Runtime build surfaces must prove TypeScript emits package-safe JavaScript.",
  "dist-build-pipeline": "Runtime build changes must prove the dist build pipeline still emits required package files.",
  "dist-observation": "Runtime/package changes need dist observation evidence across source, package, and command surfaces.",
  "temp-project-cli-smoke": "CLI/runtime changes need target-project smoke evidence for the installed command path.",
  "status-json-contract": "Status, scanner, and CLI JSON surfaces need machine-readable contract evidence.",
  "built-tests": "Built tests prove the compiled test runner still exercises the package runtime shape.",
  "target-project-check": "Target project fixtures prove templates, examples, and contracts remain usable.",
  "dashboard-smoke": "Dashboard surfaces need smoke coverage for data and UI consumption.",
  "source-package-check": "Package-facing changes must not publish private or local-only source state.",
  "pack-dry-run": "Package boundary changes need file-list and npm packaging evidence.",
  "docs-leak-link-check": "Public documentation changes need leak and link/path validation.",
  "compatibility-policy": "Contract-changing surfaces must declare legacy-support, migration-required, or hard-cutover.",
  "maintainer-review": "Unknown or high-cost surfaces require maintainer review before contributor verify can pass.",
  "dashboard-data-golden": "Dashboard data contract changes need golden or schema evidence.",
  "preset-contract": "Preset changes need install, resource, and safety contract evidence.",
  "migration-fixture": "Migration and legacy changes need fixture evidence for supported or rejected formats.",
  "workflow-lint": "CI and PR evidence changes need workflow and path-filter validation.",
  "fixture-manifest": "Fixture and golden changes need drift policy evidence.",
  "gui-check": "GUI submodule changes need path-filtered GUI validation or pointer evidence.",
  "command-consistency": "Contributor docs must stay consistent with actual package commands and profiles.",
};

export function classifyImpact(changedFiles: readonly ChangedFileRecord[]): ImpactClassification {
  const classifiedFiles = changedFiles.map(classifyChangedFile);
  const surfaces = orderedUnique(classifiedFiles.flatMap((file) => file.surfaces), surfaceOrder);
  const runtimeLayers = orderedUnique(classifiedFiles.flatMap((file) => file.runtimeLayers), runtimeLayerOrder);
  const requiredGateIds = orderedUnique(classifiedFiles.flatMap((file) => file.requiredGates), gateOrder);
  const compatibilityRequirements = classifiedFiles.flatMap((file) => buildCompatibilityRequirements(file));

  return {
    changedFiles: classifiedFiles,
    surfaces,
    runtimeLayers,
    requiredGates: requiredGateIds.map((gate) => ({
      id: gate,
      blocking: gate === "maintainer-review" ? "maintainer-review" : "required",
      reason: gateReasonMap[gate],
      surfaces: surfacesForGate(surfaces, gate),
    })),
    unknownSurfaces: classifiedFiles.flatMap((file) => buildUnknownSurface(file)),
    compatibilityPolicyRequired: compatibilityRequirements.length > 0,
    compatibilityPolicyRequirements: compatibilityRequirements,
  };
}

function classifyChangedFile(record: ChangedFileRecord): ClassifiedChangedFile {
  const normalizedPath = normalizeChangedPath(record.path);
  const normalizedOldPath = record.oldPath ? normalizeChangedPath(record.oldPath) : undefined;
  const pathClassifications = [
    classifyPath(normalizedPath, record),
    ...(normalizedOldPath && normalizedOldPath !== normalizedPath ? [classifyPath(normalizedOldPath, record)] : []),
  ];
  const surfaces = orderedUnique(pathClassifications.flatMap((classification) => classification.surfaces), surfaceOrder);
  const runtimeLayers = orderedUnique(pathClassifications.flatMap((classification) => classification.runtimeLayers), runtimeLayerOrder);
  const requiredGates = orderedUnique([...surfaces.flatMap((surface) => surfaceGateMap[surface]), ...pathClassifications.flatMap((classification) => classification.requiredGates)], gateOrder);

  return {
    path: normalizedPath,
    status: record.status,
    ...(normalizedOldPath ? { oldPath: normalizedOldPath } : {}),
    surfaces,
    runtimeLayers,
    requiredGates,
    compatibilityPolicyRequired: pathClassifications.some((classification) => classification.compatibilityPolicyRequired),
  };
}

type PathClassification = {
  surfaces: ImpactSurface[];
  runtimeLayers: RuntimeLayer[];
  compatibilityPolicyRequired: boolean;
  requiredGates: GateId[];
};

function classifyPath(relativePath: string, record: ChangedFileRecord): PathClassification {
  const surfaces: ImpactSurface[] = [];
  const runtimeLayers: RuntimeLayer[] = [];
  const requiredGates: GateId[] = [];
  let compatibilityPolicyRequired = false;

  const addSurface = (surface: ImpactSurface): void => {
    surfaces.push(surface);
  };
  const addLayer = (layer: RuntimeLayer): void => {
    runtimeLayers.push(layer);
  };
  const requirePolicy = (): void => {
    compatibilityPolicyRequired = true;
  };
  const requireGate = (gate: GateId): void => {
    requiredGates.push(gate);
  };

  if (!isRepositoryRelativePath(relativePath)) {
    addSurface("unknown");
    addLayer("not-runtime");
    return { surfaces: orderedUnique(surfaces, surfaceOrder), runtimeLayers: orderedUnique(runtimeLayers, runtimeLayerOrder), compatibilityPolicyRequired, requiredGates: orderedUnique(requiredGates, gateOrder) };
  }

  if (isPrivateLocalOnlyPath(relativePath)) {
    addSurface("private-local-only");
    addLayer("not-runtime");
    return { surfaces: orderedUnique(surfaces, surfaceOrder), runtimeLayers: orderedUnique(runtimeLayers, runtimeLayerOrder), compatibilityPolicyRequired, requiredGates: orderedUnique(requiredGates, gateOrder) };
  }

  if (record.isSubmodule || relativePath === "harness-gui" || relativePath.startsWith("harness-gui/")) {
    addSurface("gui-submodule");
    addLayer("not-runtime");
  }

  if (relativePath.startsWith(".github/")) {
    addSurface("ci-pr-evidence");
    addLayer("not-runtime");
    if (relativePath === ".github/pull_request_template.md") requirePolicy();
  }

  if (isTypeIslandPath(relativePath)) {
    addSurface("type-island");
    addLayer("ts-source");
  }

  if (isCliContractPath(relativePath)) {
    requireGate("temp-project-cli-smoke");
    requireGate("status-json-contract");
    requirePolicy();
  }

  if (isTsRuntimePath(relativePath)) {
    addSurface("ts-runtime");
    addLayer("ts-source");
  }

  if (isRuntimeBuildPath(relativePath)) {
    addSurface("runtime-build");
    addLayer("runtime-emit");
    if (relativePath === "tsconfig.json") addLayer("ts-source");
    if (relativePath.startsWith("dist/")) {
      addSurface("package-boundary");
      addLayer("package-runtime");
      requirePolicy();
    }
  }

  if (isBuiltTestRunnerPath(relativePath)) {
    addSurface("built-test-runner");
    addLayer("built-test");
    if (/^tests\/.*\.mts$/.test(relativePath)) addLayer("ts-source");
  }

  if (isDashboardDataPath(relativePath)) {
    addSurface("dashboard-data");
    requirePolicy();
    if (relativePath.startsWith("scripts/")) addLayer("ts-source");
  }

  if (relativePath.startsWith("templates/dashboard/assets/")) {
    addSurface("dashboard-ui");
    addLayer("installed-target");
    if (relativePath.includes("manifest")) requirePolicy();
  } else if (relativePath.startsWith("templates/") || relativePath.startsWith("templates-zh-CN/")) {
    addSurface("template-schema");
    addLayer("installed-target");
    requirePolicy();
  }

  if (relativePath.startsWith("docs-release/")) {
    addSurface("docs-release");
    addLayer("not-runtime");
    if (relativePath.includes("parent-control-repository-pattern")) addSurface("multi-repo-contract");
  }

  if (isRootContributorDoc(relativePath)) {
    addSurface("root-contributor-docs");
    addLayer("not-runtime");
  }

  if (isPresetPackagePath(relativePath)) {
    addSurface("preset-package");
    addLayer(relativePath.startsWith("scripts/") ? "ts-source" : "installed-target");
    requirePolicy();
  }

  if (isPackageBoundaryPath(relativePath)) {
    addSurface("package-boundary");
    addLayer("package-runtime");
    requirePolicy();
  }

  if (isMigrationPath(relativePath)) {
    addSurface("migration-legacy");
    if (relativePath.startsWith("scripts/")) addLayer("ts-source");
    requirePolicy();
  }

  if (isSkillReferenceDistributionPath(relativePath)) {
    addSurface("skill-reference-distribution");
    addLayer("installed-target");
  }

  if (isFixtureGoldenPath(relativePath)) {
    addSurface("fixture-golden");
    addLayer(relativePath.startsWith("examples/") ? "installed-target" : "not-runtime");
  }

  if (surfaces.length === 0) {
    addSurface("unknown");
    addLayer("not-runtime");
  }

  return {
    surfaces: orderedUnique(surfaces, surfaceOrder),
    runtimeLayers: orderedUnique(runtimeLayers, runtimeLayerOrder),
    compatibilityPolicyRequired,
    requiredGates: orderedUnique(requiredGates, gateOrder),
  };
}

function buildCompatibilityRequirements(file: ClassifiedChangedFile): CompatibilityPolicyRequirement[] {
  if (!file.compatibilityPolicyRequired) return [];
  const policySurfaces = file.surfaces.filter((surface) => surfaceRequiresCompatibilityPolicy(surface));
  const surfaces = policySurfaces.length > 0 ? policySurfaces : file.surfaces;
  return surfaces.map((surface) => ({
    path: file.path,
    surface,
    allowedPolicies: compatibilityPolicies,
    reason: compatibilityReason(surface),
  }));
}

function buildUnknownSurface(file: ClassifiedChangedFile): UnknownSurface[] {
  if (!file.surfaces.includes("unknown")) return [];
  return [
    {
      path: file.path,
      status: file.status,
      reason: "No public impact surface matched this repository-relative path.",
    },
  ];
}

function surfacesForGate(surfaces: readonly ImpactSurface[], gate: GateId): ImpactSurface[] {
  if ((gate === "temp-project-cli-smoke" || gate === "status-json-contract") && surfaces.includes("ts-runtime")) {
    return ["ts-runtime", ...surfaces.filter((surface) => surface !== "ts-runtime" && surfaceGateMap[surface].includes(gate))];
  }
  return surfaces.filter((surface) => surfaceGateMap[surface].includes(gate));
}

function surfaceRequiresCompatibilityPolicy(surface: ImpactSurface): boolean {
  return [
    "ts-runtime",
    "dashboard-data",
    "template-schema",
    "preset-package",
    "package-boundary",
    "migration-legacy",
    "ci-pr-evidence",
  ].includes(surface);
}

function compatibilityReason(surface: ImpactSurface): string {
  switch (surface) {
    case "ts-runtime":
      return "CLI output, exit code, or machine-readable report contract may change.";
    case "dashboard-data":
      return "Dashboard data JSON or public manifest contract may change.";
    case "template-schema":
      return "Task schema, template frontmatter, or target-project layout may change.";
    case "preset-package":
      return "Preset registry, installed resources, or action contract may change.";
    case "package-boundary":
      return "Package file list or installed runtime layout may change.";
    case "migration-legacy":
      return "Migration or legacy adoption behavior may change.";
    case "ci-pr-evidence":
      return "PR evidence or workflow contract may change.";
    default:
      return "Contract-changing surface requires explicit compatibility policy.";
  }
}

function normalizeChangedPath(inputPath: string): string {
  const normalized = inputPath.trim().replaceAll("\\", "/").replace(/\/+/g, "/");
  if (normalized === ".") return "";
  return normalized.startsWith("./") ? normalized.slice(2) : normalized;
}

function isRepositoryRelativePath(relativePath: string): boolean {
  return relativePath.length > 0 && !relativePath.startsWith("/") && !relativePath.startsWith("../") && !path.isAbsolute(relativePath);
}

function isPrivateLocalOnlyPath(relativePath: string): boolean {
  return (
    relativePath === "AGENTS.md" ||
    relativePath === "CLAUDE.md" ||
    relativePath === "docs" ||
    relativePath.startsWith("docs/") ||
    relativePath === ".harness-private" ||
    relativePath.startsWith(".harness-private/")
  );
}

function isTypeIslandPath(relativePath: string): boolean {
  return relativePath.startsWith("scripts/lib/types/") || /^tests\/helpers\/.*types.*\.(mts|ts)$/.test(relativePath);
}

function isTsRuntimePath(relativePath: string): boolean {
  return relativePath.startsWith("scripts/") && relativePath.endsWith(".mts");
}

function isCliContractPath(relativePath: string): boolean {
  return (
    relativePath === "scripts/harness.mts" ||
    relativePath.startsWith("scripts/commands/") ||
    relativePath === "scripts/lib/types/impact.ts" ||
    relativePath === "scripts/lib/types/task-lifecycle.ts" ||
    relativePath === "scripts/lib/check-profiles.mts" ||
    relativePath === "scripts/lib/status-builder.mts" ||
    relativePath === "scripts/lib/task-index.mts" ||
    relativePath === "scripts/lib/task-lifecycle.mts"
  );
}

function isRuntimeBuildPath(relativePath: string): boolean {
  return (
    relativePath === "scripts/build-dist.mts" ||
    relativePath === "scripts/check-runtime-emit.mts" ||
    relativePath === "scripts/check-dist-observation.mts" ||
    /^tsconfig(?:\.[A-Za-z-]+)?\.json$/.test(relativePath) ||
    relativePath.startsWith("dist/")
  );
}

function isBuiltTestRunnerPath(relativePath: string): boolean {
  return relativePath === "scripts/run-built-tests.mts" || relativePath === "tests/run-all.mts" || relativePath === "tsconfig.tests.json" || /^tests\/.*\.mts$/.test(relativePath);
}

function isDashboardDataPath(relativePath: string): boolean {
  return (
    relativePath === "scripts/lib/dashboard-data.mts" ||
    relativePath === "scripts/lib/check-profiles.mts" ||
    relativePath === "scripts/lib/status-builder.mts" ||
    relativePath === "scripts/lib/status-dashboard-renderer.mts" ||
    relativePath === "scripts/lib/task-scanner.mts" ||
    relativePath === "scripts/lib/task-review-model.mts" ||
    relativePath === "scripts/lib/task-index.mts" ||
    relativePath === "scripts/lib/types/check-profiles.ts" ||
    relativePath === "scripts/lib/types/task-scanner.ts" ||
    relativePath === "scripts/lib/types/impact.ts" ||
    relativePath.startsWith("tests/golden/dashboard/")
  );
}

function isRootContributorDoc(relativePath: string): boolean {
  return /^README(\.[A-Za-z-]+)?\.md$/.test(relativePath) || relativePath === "CONTRIBUTING.md" || relativePath === "CHANGELOG.md";
}

function isPackageBoundaryPath(relativePath: string): boolean {
  return (
    relativePath === "package.json" ||
    relativePath === "package-lock.json" ||
    relativePath === "postinstall.mjs" ||
    relativePath === "run-dist.mjs" ||
    relativePath === "LICENSE" ||
    relativePath === "LICENSE-EXCEPTION.md"
  );
}

function isPresetPackagePath(relativePath: string): boolean {
  return (
    relativePath.startsWith("presets/") ||
    relativePath === "scripts/commands/preset-command.mts" ||
    relativePath === "scripts/lib/core-shared.mts" ||
    relativePath === "scripts/lib/types/preset.ts" ||
    /^scripts\/lib\/preset-.*\.mts$/.test(relativePath)
  );
}

function isMigrationPath(relativePath: string): boolean {
  return relativePath.includes("migration") || relativePath.includes("legacy") || relativePath.includes("hard-cutover");
}

function isSkillReferenceDistributionPath(relativePath: string): boolean {
  return relativePath === "SKILL.md" || relativePath.startsWith("skills/") || relativePath.startsWith("references/");
}

function isFixtureGoldenPath(relativePath: string): boolean {
  return (
    relativePath.startsWith("examples/") ||
    relativePath.startsWith("fixtures/") ||
    relativePath.startsWith("tests/fixtures/") ||
    relativePath.startsWith("tests/golden/")
  );
}

function orderedUnique<T extends string>(values: readonly T[], order: readonly T[]): T[] {
  const present = new Set(values);
  const ordered = order.filter((value) => present.has(value));
  const orderSet = new Set(order);
  const extra = values.filter((value, index) => !orderSet.has(value) && values.indexOf(value) === index);
  return [...ordered, ...extra];
}
