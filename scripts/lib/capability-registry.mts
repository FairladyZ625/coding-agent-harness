import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  repoRoot,
  visualMapFile,
  normalizeTarget,
  toPosix,
  exists,
  existsInDocs,
  readFileSafe,
  readJsonSafe,
  readBundledTemplate,
  renderHarnessTemplate,
  walkFiles,
  normalizeLocale,
  localizedTemplateSource,
} from "./core-shared.mjs";
import { seedBundledPresets } from "./preset-registry.mjs";
import {
  legacyCloseoutFile,
  legacyCompatMode,
  legacyLedgerFile,
  legacyModuleRoot,
  legacyPath,
  legacyPlanningRoot,
  legacyTaskRoot,
  legacyWalkthroughRoot,
  safeAdoptionCapability,
  assertRenderableHarnessManifest,
  renderHarnessManifest,
  v2HarnessRoot,
} from "./harness-paths.mjs";
import type { HarnessManifest } from "./harness-paths.mjs";

type StringRecord = Record<string, unknown>;
type CapabilityDefinition = {
  description: string;
  selectWhen: string;
  default: boolean;
  dependencies: string[];
  artifacts: string[];
};
type CapabilityEntry = { name: string; state: string };
type CapabilityRegistry = {
  mode: string;
  path: string;
  capabilities: CapabilityEntry[];
  locale: string;
  raw: StringRecord | null;
  errors: string[];
};
type CapabilityHarness = {
  version?: number;
  manifest?: HarnessManifest | null;
  manifestPath?: string;
  projectRoot?: string;
  harnessRoot?: string;
  planningRoot?: string;
  tasksRoot?: string;
  modulesRoot?: string;
  externalRoot?: string;
  governanceRoot?: string;
  generatedRoot?: string;
  regressionRoot?: string;
  ledgerPath?: string;
  closeoutIndexPath?: string;
};
type CapabilityTarget = {
  projectRoot: string;
  docsRoot: string;
  harness?: CapabilityHarness | null;
  manifestPath?: string;
};
type CapabilityChange = {
  destination: string;
  source?: string;
  action: string;
  ownership?: string;
  pathFindings?: string[];
};
type TemplateProjectionEntry = {
  destination: string;
  source: string;
  ownership: string;
  renderedSha256: string;
  sourceSha256: string;
  paths: Record<string, string>;
  updatedAt: string;
};
type TemplateProjectionManifest = {
  schemaVersion: string;
  entries: TemplateProjectionEntry[];
};
type PlannedPathOptions = { locale?: string; paths?: CapabilityHarness | null };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

export const capabilityDefinitions: Record<string, CapabilityDefinition> = {
  core: {
    description: "Planning loop and task execution records.",
    selectWhen: "Always install. This is the required document kernel.",
    default: true,
    dependencies: [],
    artifacts: [legacyPath(legacyPlanningRoot)],
  },
  "module-parallel": {
    description: "YAML-backed module registry, module briefs/plans, and global worker handoff prompt pack.",
    selectWhen: "Use only when the project has two or more independent modules that need parallel ownership.",
    default: false,
    dependencies: ["core"],
    artifacts: [legacyPath(legacyPlanningRoot, "Module-Registry.md"), legacyPath(legacyModuleRoot)],
  },
  "subagent-worker": {
    description: "Commit-backed worker handoff protocol for code-changing subagents.",
    selectWhen: "Use only when code-changing subagents will work in dedicated worktrees with commit-backed handoff.",
    default: false,
    dependencies: ["module-parallel"],
    artifacts: [legacyPath(legacyModuleRoot)],
  },
  "adversarial-review": {
    description: "Machine-gateable adversarial review reports and verifier output contract.",
    selectWhen: "Use when release, architecture, security, data, or strategy risk requires an independent review artifact.",
    default: false,
    dependencies: ["core"],
    artifacts: [legacyPath(legacyTaskRoot)],
  },
  "long-running-task": {
    description: "Long-running task contract with review cadence and stop conditions.",
    selectWhen: "Use when agents may run across many loops without user confirmation after every step.",
    default: false,
    dependencies: ["core"],
    artifacts: [legacyPath(legacyTaskRoot, "_task-template/long-running-task-contract.md")],
  },
  "dashboard": {
    description: "Read-only HTML dashboard generated from harness status JSON.",
    selectWhen: "Use when users or agents need a local read-only status surface.",
    default: false,
    dependencies: ["core"],
    artifacts: [],
  },
  [safeAdoptionCapability]: {
    description: "Legacy compatibility and assisted capability adoption.",
    selectWhen: "Use when adopting v1.0 into an existing harness project without rewriting history.",
    default: false,
    dependencies: ["core"],
    artifacts: [],
  },
};

export const capabilityAliases: Record<string, string> = {
  "review-contract": "adversarial-review",
};

export const allowedCapabilityStates = new Set(["scaffolded", "configured", "verified"]);

export function readCapabilityRegistry(target: CapabilityTarget): CapabilityRegistry {
  if (target.harness?.version === 2 && target.harness.manifest) {
    return {
      mode: "v2-manifest",
      path: target.harness.manifestPath || target.manifestPath || "",
      capabilities: (target.harness.manifest.capabilities || ["core"]).map((name) => ({
        name: normalizeCapabilityName(name),
        state: "configured",
      })),
      locale: normalizeLocale(target.harness.manifest.locale),
      raw: target.harness.manifest,
      errors: [],
    };
  }
  const registryPath = path.join(target.projectRoot, ".harness-capabilities.json");
  if (!fs.existsSync(registryPath)) {
    return {
      mode: legacyCompatMode,
      path: registryPath,
      capabilities: [{ name: "core", state: "configured" }],
      locale: "en-US",
      raw: null,
      errors: [],
    };
  }

  let readError: unknown = null;
  const raw = readJsonSafe<StringRecord | null>(registryPath, null, { onError: (error) => { readError = error; } });
  if (raw) {
    const locale = normalizeLocale(String(raw.locale || ""));
    const capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities.map((entry) =>
          typeof entry === "string"
            ? { name: normalizeCapabilityName(entry), state: "scaffolded" }
            : { name: normalizeCapabilityName((entry as StringRecord).name), state: String((entry as StringRecord).state || "scaffolded") },
        )
      : [];
    return { mode: "declared-capability", path: registryPath, capabilities, raw, locale, errors: [] };
  }
  return { mode: "declared-capability", path: registryPath, capabilities: [], locale: "en-US", raw: null, errors: [errorMessage(readError) || "invalid .harness-capabilities.json"] };
}

export function normalizeCapabilityName(name: unknown): string {
  const normalized = String(name || "");
  return capabilityAliases[normalized] || normalized;
}

export function validateSourcePackageBoundary(targetInput = "."): { failures: string[]; warnings: string[] } {
  const root = path.resolve(targetInput || ".");
  const gitProbe = spawnSync("git", ["-C", root, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (gitProbe.status !== 0) return { failures: [], warnings: [] };
  const staged = spawnSync("git", ["-C", root, "diff", "--cached", "--name-only", "-z"], { encoding: "utf8" });
  if (staged.status !== 0) return { failures: [], warnings: [`could not inspect staged files: ${staged.stderr.trim() || staged.status}`] };
  const localOnly = staged.stdout
    .split("\0")
    .filter(Boolean)
    .filter((file) => file === "AGENTS.md" || file === "CLAUDE.md" || file === "docs" || file.startsWith("docs/") || file === ".harness-private" || file.startsWith(".harness-private/"));
  const tracked = spawnSync("git", ["-C", root, "ls-files", "-z", "--", "harness-dashboard.html"], { encoding: "utf8" });
  const generatedRootDashboard = tracked.status === 0
    ? tracked.stdout.split("\0").filter(Boolean)
      .filter((file) => fs.existsSync(path.join(root, file)))
    : [];
  const internalScripts = ["scripts/test-harness.mjs", "scripts/smoke-dashboard.mjs"]
    .filter((file) => fs.existsSync(path.join(root, file)));
  const dashboardAppDrift = validateDashboardAppAssembly(root);
  const dashboardCssDrift = validateDashboardAssetAssembly(root, "app.css.manifest.json", "app.css", "dashboard assets/app.css does not match css-src manifest assembly");
  return {
    failures: [
      ...localOnly.map((file) => `private local-only file staged: ${file}`),
      ...generatedRootDashboard.map((file) => `generated dashboard file tracked in source root: ${file}`),
      ...internalScripts.map((file) => `internal test/smoke file in publishable scripts directory: ${file}`),
      ...dashboardAppDrift,
      ...dashboardCssDrift,
    ],
    warnings: tracked.status === 0 ? [] : [`could not inspect tracked generated dashboard files: ${tracked.stderr.trim() || tracked.status}`],
  };
}

function validateDashboardAppAssembly(root: string): string[] {
  return validateDashboardAssetAssembly(root, "app.manifest.json", "app.js", "dashboard assets/app.js does not match app-src manifest assembly");
}

function validateDashboardAssetAssembly(root: string, manifestName: string, assetName: string, driftMessage: string): string[] {
  const assetsDir = path.join(root, "templates/dashboard/assets");
  const manifestPath = path.join(assetsDir, manifestName);
  const assetPath = path.join(assetsDir, assetName);
  if (!fs.existsSync(manifestPath) || !fs.existsSync(assetPath)) return [];
  try {
    const manifest = readJsonSafe(manifestPath, null);
    if (!Array.isArray(manifest) || manifest.length === 0) {
      return [`dashboard asset manifest must list source files: ${manifestName}`];
    }
    const assembled = `${manifest.map((relativePath) => {
      const source = path.join(assetsDir, relativePath);
      if (!fs.existsSync(source)) throw new Error(`missing ${relativePath}`);
      return fs.readFileSync(source, "utf8").trimEnd();
    }).join("\n\n")}\n`;
    const trackedAsset = fs.readFileSync(assetPath, "utf8");
    return trackedAsset === assembled ? [] : [driftMessage];
  } catch (error) {
    return [`could not validate dashboard asset assembly (${assetName}): ${errorMessage(error)}`];
  }
}

export function detectCapabilities(target: CapabilityTarget): string[] {
  const detected = new Set(["core"]);
  if (target.harness?.version === 2) {
    if (fs.existsSync(path.join(target.harness.modulesRoot || "", "Module-Registry.md"))) detected.add("module-parallel");
    if (fs.existsSync(path.join(target.harness.governanceRoot || "", "standards/adversarial-review-standard.md"))) detected.add("adversarial-review");
    if (fs.existsSync(path.join(target.harness.tasksRoot || "", "_task-template/long-running-task-contract.md"))) detected.add("long-running-task");
    return [...detected];
  }
  if (existsInDocs(target, "09-PLANNING/Module-Registry.md")) detected.add("module-parallel");
  if (existsInDocs(target, "11-REFERENCE/adversarial-review-standard.md")) detected.add("adversarial-review");
  if (
    existsInDocs(target, "11-REFERENCE/long-running-task-standard.md") ||
    existsInDocs(target, "09-PLANNING/TASKS/_task-template/long-running-task-contract.md")
  ) {
    detected.add("long-running-task");
  }
  return [...detected];
}

export function buildInstallReport({ target, locale, capabilities, changes, dryRun = false, operation = "init" }: { target: CapabilityTarget; locale: string; capabilities: string[]; changes: CapabilityChange[]; dryRun?: boolean; operation?: string }) {
  const selected = new Set(capabilities.map(normalizeCapabilityName));
  return {
    operation,
    dryRun,
    target: target.projectRoot,
    locale,
    capabilities: Object.entries(capabilityDefinitions).map(([name, definition]) => ({
      name,
      selected: selected.has(name),
      default: definition.default === true,
      dependencies: definition.dependencies,
      description: definition.description,
      selectWhen: definition.selectWhen,
    })),
    selectedCapabilities: capabilities,
    created: changes.filter((change) => ["create", "would-create"].includes(change.action)).map((change) => change.destination),
    skipped: changes.filter((change) => change.action === "skip-existing").map((change) => change.destination),
    agentInstructions: [
      "Agents must choose locale during Decide and pass --locale zh-CN|en-US explicitly in non-interactive installs.",
      "Use core for every install; add optional capabilities only when their selectWhen rule is true.",
      "Bundled presets are seeded during init; use harness preset list --json before choosing task presets.",
      "After scaffold, run Configure before marking capabilities configured or verified.",
      "Run harness check/status/dashboard and record residuals before delivery.",
    ],
    verificationCommands: [
      `harness check --profile target-project ${target.projectRoot}`,
      `harness status --json ${target.projectRoot}`,
      `harness dashboard --out /tmp/harness-dashboard.html ${target.projectRoot}`,
    ],
  };
}

export function validateCapabilities(target: CapabilityTarget) {
  const registry = readCapabilityRegistry(target);
  const detected = detectCapabilities(target);
  const failures = [];
  const warnings = [];
  const byName = new Map(registry.capabilities.map((capability) => [capability.name, capability]));

  for (const error of registry.errors) failures.push(`invalid .harness-capabilities.json: ${error}`);
  for (const capability of registry.capabilities) {
    if (!capabilityDefinitions[capability.name]) {
      failures.push(`unknown capability: ${capability.name}`);
      continue;
    }
    if (!allowedCapabilityStates.has(capability.state)) {
      failures.push(`capability ${capability.name} has invalid state: ${capability.state}`);
    }
    for (const dependency of capabilityDefinitions[capability.name].dependencies) {
      if (!byName.has(dependency)) failures.push(`capability ${capability.name} missing dependency: ${dependency}`);
    }
    if (registry.mode === "declared-capability" || registry.mode === "v2-manifest") {
      for (const artifact of capabilityArtifactsForTarget(target, capability.name)) {
        if (!exists(target, artifact)) {
          failures.push(`capability ${capability.name} missing required artifact: ${artifact}`);
        }
      }
    }
  }

  if (registry.mode === "declared-capability") {
    for (const capability of detected) {
      if (!byName.has(capability)) warnings.push(`orphan capability artifact detected without declaration: ${capability}`);
    }
  } else if (registry.mode === legacyCompatMode) {
    warnings.push(`${legacyCompatMode} mode: no .harness-capabilities.json; adoption suggestion is available`);
  }

  return { registry, detected, failures, warnings };
}

function capabilityArtifactsForTarget(target: CapabilityTarget, capabilityName: string): string[] {
  if (target.harness?.version !== 2) return capabilityDefinitions[capabilityName].artifacts;
  const relative = (absolutePath: string) => toPosix(path.relative(target.projectRoot, absolutePath));
  const paths = target.harness;
  switch (capabilityName) {
    case "core":
      return [relative(paths.planningRoot || "")];
    case "module-parallel":
      return [relative(path.join(paths.modulesRoot || "", "Module-Registry.md")), relative(paths.modulesRoot || "")];
    case "subagent-worker":
      return [relative(paths.modulesRoot || "")];
    case "adversarial-review":
      return [relative(paths.tasksRoot || "")];
    case "long-running-task":
      return [];
    default:
      return capabilityDefinitions[capabilityName].artifacts;
  }
}


export function plannedInitFiles(capabilities: string[] = ["core"], { locale = "en-US", paths = null }: PlannedPathOptions = {}): Array<[string, string]> {
  const root = paths ? toPosix(path.relative(paths.projectRoot || "", paths.harnessRoot || "")) : v2HarnessRoot;
  const modulesRoot = paths ? toPosix(path.relative(paths.projectRoot || "", paths.modulesRoot || "")) : `${root}/planning/modules`;
  const regressionRoot = paths ? toPosix(path.relative(paths.projectRoot || "", paths.regressionRoot || "")) : `${root}/governance/regression`;
  const contextRoot = `${root}/context`;
  const governanceRoot = paths ? toPosix(path.relative(paths.projectRoot || "", paths.governanceRoot || "")) : `${root}/governance`;
  const files = [
    ["AGENTS.md", "templates/AGENTS.md.template"],
    ["CLAUDE.md", "templates/CLAUDE.md.template"],
    [`${contextRoot}/architecture/README.md`, "templates/architecture/README.md"],
    [`${contextRoot}/architecture/Architecture-SSoT.md`, "templates/architecture/Architecture-SSoT.md"],
    [`${contextRoot}/architecture/local-repo-context.md`, "templates/architecture/local-repo-context.md"],
    [`${contextRoot}/architecture/system-map.md`, "templates/architecture/system-map.md"],
    [`${contextRoot}/architecture/service-catalog.md`, "templates/architecture/service-catalog.md"],
    [`${contextRoot}/architecture/critical-flows.md`, "templates/architecture/critical-flows.md"],
    [`${contextRoot}/architecture/services/_service-template.md`, "templates/architecture/services/service-template.md"],
    [`${contextRoot}/development/README.md`, "templates/development/README.md"],
    [`${contextRoot}/development/local-setup.md`, "templates/development/local-setup.md"],
    [`${contextRoot}/development/codebase-map.md`, "templates/development/codebase-map.md"],
    [`${contextRoot}/development/external-context/_service-template.md`, "templates/development/external-context/service-template.md"],
    [`${contextRoot}/development/external-source-packs/README.md`, "templates/development/external-source-packs/README.md"],
    [`${contextRoot}/development/external-source-packs/_digest-template.md`, "templates/development/external-source-packs/digest-template.md"],
    [`${contextRoot}/development/stubs-and-mocks.md`, "templates/development/stubs-and-mocks.md"],
    [`${contextRoot}/development/cross-repo-debugging.md`, "templates/development/cross-repo-debugging.md"],
    [`${contextRoot}/integrations/README.md`, "templates/integrations/README.md"],
    [`${contextRoot}/integrations/_api-contract-template.md`, "templates/integrations/api-contract.md"],
    [`${contextRoot}/integrations/_event-contract-template.md`, "templates/integrations/event-contract.md"],
    [`${contextRoot}/integrations/_webhook-contract-template.md`, "templates/integrations/webhook-contract.md"],
    [`${contextRoot}/integrations/third-party/_vendor-template.md`, "templates/integrations/third-party/vendor-template.md"],
    [`${regressionRoot}/Regression-SSoT.md`, "templates/ssot/Regression-SSoT.md"],
    [`${regressionRoot}/Cadence-Ledger.md`, "templates/regression/Cadence-Ledger.md"],
    [`${governanceRoot}/standards/walkthrough-template.md`, "templates/walkthrough/walkthrough-template.md"],
    [`${governanceRoot}/standards/external-source-intake-standard.md`, "templates/reference/external-source-intake-standard.md"],
  ];
  if (capabilities.includes("module-parallel")) {
  files.push([`${modulesRoot}/Module-Registry.md`, "templates/modules/registry_view.md"]);
  files.push([`${modulesRoot}/Session-Prompt-Pack.md`, "templates/modules/session_prompt_pack.md"]);
  }
  return files.map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function plannedInitDirectories(capabilities: string[] = ["core"], { paths = null }: { paths?: CapabilityHarness | null } = {}): string[] {
  const planningRoot = paths ? toPosix(path.relative(paths.projectRoot || "", paths.planningRoot || "")) : `${v2HarnessRoot}/planning`;
  const tasksRoot = paths ? toPosix(path.relative(paths.projectRoot || "", paths.tasksRoot || "")) : `${v2HarnessRoot}/planning/tasks`;
  const modulesRoot = paths ? toPosix(path.relative(paths.projectRoot || "", paths.modulesRoot || "")) : `${v2HarnessRoot}/planning/modules`;
  const generatedRoot = paths ? toPosix(path.relative(paths.projectRoot || "", paths.generatedRoot || "")) : `${v2HarnessRoot}/governance/generated`;
  const directories = [
    planningRoot,
    tasksRoot,
    generatedRoot,
  ];
  if (capabilities.includes("module-parallel")) directories.push(modulesRoot);
  return directories;
}

export function writeInitFiles(targetInput: string, capabilities: string[], { dryRun = true, locale = "en-US", addNpmScripts = false }: { dryRun?: boolean; locale?: string; addNpmScripts?: boolean } = {}) {
  let target = normalizeTarget(targetInput) as CapabilityTarget;
  const normalizedCapabilities = [...new Set(capabilities.map(normalizeCapabilityName))];
  const normalizedLocale = normalizeLocale(locale);
  const existingRegistry = readCapabilityRegistry(target);
  if (existingRegistry.raw) {
    const installed = new Set(existingRegistry.capabilities.map((capability) => capability.name));
    const requested = new Set(normalizedCapabilities);
    const same =
      installed.size === requested.size &&
      [...installed].every((capability) => requested.has(capability));
    if (!same) {
      throw new Error("Existing capability registry differs from requested init capabilities; use add-capability instead.");
    }
  }
  const planned = plannedInitFiles(normalizedCapabilities, { locale: normalizedLocale });
  const changes = [];
  const projectionEntries = [];
  const manifestDestination = `${v2HarnessRoot}/harness.yaml`;
  const manifestPath = path.join(target.projectRoot, manifestDestination);
  const manifestExists = fs.existsSync(manifestPath);
  changes.push({ destination: manifestDestination, source: "harness-root/v2", action: manifestExists ? "skip-existing" : dryRun ? "would-create" : "create" });
  if (!dryRun && !manifestExists) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, renderHarnessManifest({ locale: normalizedLocale, capabilities: normalizedCapabilities }));
    target = normalizeTarget(target.projectRoot) as CapabilityTarget;
  }
  for (const directory of plannedInitDirectories(normalizedCapabilities)) {
    const directoryPath = path.join(target.projectRoot, directory);
    const existsAlready = fs.existsSync(directoryPath);
    changes.push({ destination: directory, source: "harness-directory/v2", action: existsAlready ? "skip-existing" : dryRun ? "would-create-directory" : "create-directory" });
    if (!dryRun && !existsAlready) fs.mkdirSync(directoryPath, { recursive: true });
  }
  for (const [destination, source] of planned) {
    const destinationPath = path.join(target.projectRoot, destination);
    const sourcePath = path.join(repoRoot, source);
    const existsAlready = fs.existsSync(destinationPath);
    changes.push({ destination, source, action: existsAlready ? "skip-existing" : dryRun ? "would-create" : "create" });
    if (!dryRun && !existsAlready) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      const rendered = renderInstallTemplate(source, target);
      fs.writeFileSync(destinationPath, rendered);
      projectionEntries.push(templateProjectionEntry({ destination, source, target, rendered }));
    }
  }
  if (!dryRun) writeTemplateProjectionManifest(target, projectionEntries);
  if (addNpmScripts) {
    changes.push(...writeNpmScripts(target, { dryRun }));
  }
  const presetSeed = seedBundledPresets({ scope: "project", targetInput: target.projectRoot, dryRun });
  const report = buildInstallReport({ target, locale: normalizedLocale, capabilities: normalizedCapabilities, changes, dryRun, operation: "init" });
  return { target, capabilities: normalizedCapabilities, locale: normalizedLocale, changes, presetSeed, nextCommands: initNextCommands(), report };
}

function initNextCommands(): string[] {
  return [
    "npx --yes coding-agent-harness dev .",
    "npx --yes coding-agent-harness dashboard --out-dir tmp/harness-dashboard .",
  ];
}

function writeNpmScripts(target: CapabilityTarget, { dryRun = true }: { dryRun?: boolean } = {}): CapabilityChange[] {
  const packagePath = path.join(target.projectRoot, "package.json");
  if (!fs.existsSync(packagePath)) throw new Error("init --add-npm-scripts requires an existing package.json");
  const pkg = readJsonSafe<StringRecord>(packagePath, {});
  const scripts = { ...((pkg.scripts as Record<string, string> | undefined) || {}) };
  const additions = {
    "harness:dev": "npx --yes coding-agent-harness dev .",
    "harness:dashboard": "npx --yes coding-agent-harness dashboard --out-dir tmp/harness-dashboard .",
  };
  let changed = false;
  const scriptChanges = [];
  for (const [name, command] of Object.entries(additions)) {
    if (scripts[name]) {
      scriptChanges.push({ destination: "package.json", source: `scripts.${name}`, action: "skip-existing-script" });
      continue;
    }
    scripts[name] = command;
    changed = true;
  }
  if (!changed) return scriptChanges;
  if (!dryRun) {
    fs.writeFileSync(packagePath, `${JSON.stringify({ ...pkg, scripts }, null, 2)}\n`);
  }
  return [{ destination: "package.json", source: "npm-scripts", action: dryRun ? "would-update-scripts" : "update-scripts" }, ...scriptChanges];
}

function renderInstallTemplate(source: string, target: CapabilityTarget): string {
  return renderHarnessTemplate(readBundledTemplate(source), { paths: targetPathContext(target) });
}

function targetPathContext(target: CapabilityTarget): Record<string, string> {
  const paths = target.harness || {};
  const projectRoot = String(paths.projectRoot || target.projectRoot);
  const fields = [
    "harnessRoot",
    "planningRoot",
    "tasksRoot",
    "modulesRoot",
    "externalRoot",
    "governanceRoot",
    "generatedRoot",
    "regressionRoot",
    "ledgerPath",
    "closeoutIndexPath",
  ];
  return Object.fromEntries(fields.map((field) => {
    const value = String(paths[field as keyof CapabilityHarness] || "");
    const rendered = value && path.isAbsolute(value) ? toPosix(path.relative(projectRoot, value)) : toPosix(String(value || ""));
    return [field, rendered];
  }));
}

function templateProjectionManifestPath(target: CapabilityTarget): string {
  const effectiveTarget = target.harness?.version === 2 || !fs.existsSync(path.join(target.projectRoot, v2HarnessRoot, "harness.yaml"))
    ? target
    : normalizeTarget(target.projectRoot) as CapabilityTarget;
  const generatedRoot = effectiveTarget.harness?.generatedRoot || path.join(effectiveTarget.projectRoot, v2HarnessRoot, "governance/generated");
  return path.join(generatedRoot, "Template-Projections.json");
}

function readTemplateProjectionManifest(target: CapabilityTarget): TemplateProjectionManifest {
  const currentPath = templateProjectionManifestPath(target);
  if (fs.existsSync(currentPath)) return readJsonSafe<TemplateProjectionManifest>(currentPath, { schemaVersion: "template-projections/v1", entries: [] });
  const fallback = walkFiles(target.projectRoot)
    .find((filePath) => path.basename(filePath) === "Template-Projections.json");
  return fallback ? readJsonSafe<TemplateProjectionManifest>(fallback, { schemaVersion: "template-projections/v1", entries: [] }) : { schemaVersion: "template-projections/v1", entries: [] };
}

function writeTemplateProjectionManifest(target: CapabilityTarget, entries: TemplateProjectionEntry[]): void {
  if (!entries.length) return;
  const manifestPath = templateProjectionManifestPath(target);
  const current = readTemplateProjectionManifest(target);
  const byDestination = new Map((current.entries || []).map((entry) => [entry.destination, entry]));
  for (const entry of entries) byDestination.set(entry.destination, entry);
  const next = {
    schemaVersion: "template-projections/v1",
    generatedAt: new Date().toISOString(),
    entries: [...byDestination.values()].sort((a, b) => a.destination.localeCompare(b.destination)),
  };
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
}

function templateProjectionEntry({ destination, source, target, rendered }: { destination: string; source: string; target: CapabilityTarget; rendered: string }): TemplateProjectionEntry {
  return {
    destination,
    source,
    ownership: "package-template-pristine",
    renderedSha256: sha256(rendered),
    sourceSha256: sha256(readBundledTemplate(source)),
    paths: targetPathContext(target),
    updatedAt: new Date().toISOString(),
  };
}

function pathFindings(content: string, target: CapabilityTarget): string[] {
  const findings = [];
  const text = String(content || "");
  if (text.includes("{{paths.")) findings.push("unresolved-path-token");
  const defaultRootPattern = /\bcoding-agent-harness\/(?:planning|governance|context)\//g;
  if (target.harness?.version === 2 && targetPathContext(target).harnessRoot !== v2HarnessRoot && defaultRootPattern.test(text)) {
    findings.push("default-root-literal");
  }
  if (/docs\/09-PLANNING|docs\/10-WALKTHROUGH|docs\/Harness-Ledger\.md/.test(text)) findings.push("legacy-path-literal");
  return [...new Set(findings)];
}

function scanProjectAuthoredPathFindings(target: CapabilityTarget, plannedDestinations: Set<string>): CapabilityChange[] {
  const root = target.harness?.harnessRoot || target.docsRoot;
  if (!root || !fs.existsSync(root)) return [];
  return walkFiles(root)
    .map((filePath) => toPosix(path.relative(target.projectRoot, filePath)))
    .filter((relative) => !plannedDestinations.has(relative))
    .filter((relative) => !relative.includes("/governance/archive/") && !relative.includes("/planning/tasks/") && !relative.includes("/governance/generated/"))
    .map((relative) => {
      const findings = pathFindings(readFileSafe(path.join(target.projectRoot, relative)), target);
      return findings.length ? { destination: relative, ownership: "project-authored", action: "report-only", pathFindings: findings } : null;
    })
    .filter((change): change is NonNullable<typeof change> => Boolean(change));
}

function sha256(content: unknown): string {
  return crypto.createHash("sha256").update(String(content)).digest("hex");
}

export function addCapability(targetInput: string, capabilityName: string, { dryRun = true, locale = "" }: { dryRun?: boolean; locale?: string } = {}) {
  const target = normalizeTarget(targetInput) as CapabilityTarget;
  const normalizedCapability = normalizeCapabilityName(capabilityName);
  if (!capabilityDefinitions[normalizedCapability]) throw new Error(`Unknown capability: ${capabilityName}`);
  const registry = readCapabilityRegistry(target);
  const normalizedLocale = normalizeLocale(registry.raw ? registry.locale : locale || "en-US");
  const capabilityMap = new Map(registry.capabilities.map((capability) => [capability.name, capability]));
  for (const dependency of capabilityDefinitions[normalizedCapability].dependencies) {
    if (!capabilityMap.has(dependency)) capabilityMap.set(dependency, { name: dependency, state: "scaffolded" });
  }
  if (!capabilityMap.has(normalizedCapability)) capabilityMap.set(normalizedCapability, { name: normalizedCapability, state: "scaffolded" });
  const nextCapabilities = [...capabilityMap.keys()];
  const scaffold = plannedInitFiles([...capabilityMap.keys()], { locale: normalizedLocale, paths: target.harness?.version === 2 ? target.harness : null });
  const changes: CapabilityChange[] = [];
  const projectionEntries: TemplateProjectionEntry[] = [];
  for (const directory of plannedInitDirectories(nextCapabilities, { paths: target.harness?.version === 2 ? target.harness : null })) {
    const destinationPath = path.join(target.projectRoot, directory);
    const existsAlready = fs.existsSync(destinationPath);
    changes.push({ destination: directory, source: "harness-directory/v2", action: existsAlready ? "skip-existing" : dryRun ? "would-create-directory" : "create-directory" });
    if (!dryRun && !existsAlready) fs.mkdirSync(destinationPath, { recursive: true });
  }
  for (const [destination, source] of scaffold) {
    const destinationPath = path.join(target.projectRoot, destination);
    const sourcePath = path.join(repoRoot, source);
    const existsAlready = fs.existsSync(destinationPath);
    changes.push({ destination, source, action: existsAlready ? "skip-existing" : dryRun ? "would-create" : "create" });
    if (!dryRun && !existsAlready) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      const rendered = renderInstallTemplate(source, target);
      fs.writeFileSync(destinationPath, rendered);
      projectionEntries.push(templateProjectionEntry({ destination, source, target, rendered }));
    }
  }
  if (!dryRun) {
    const manifestPath = target.harness?.version === 2 && target.manifestPath
      ? target.manifestPath
      : path.join(target.projectRoot, v2HarnessRoot, "harness.yaml");
    assertRenderableHarnessManifest(target.harness?.manifest);
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, renderHarnessManifest({ locale: normalizedLocale, capabilities: nextCapabilities, structure: target.harness?.manifest?.structure, modules: target.harness?.manifest?.modules || null }));
    writeTemplateProjectionManifest(target, projectionEntries);
  }
  const report = buildInstallReport({ target, locale: normalizedLocale, capabilities: [...capabilityMap.keys()], changes, dryRun, operation: "add-capability" });
  return {
    target,
    dryRun,
    registry: { version: 2, locale: normalizedLocale, capabilities: nextCapabilities.map((name) => ({ name, state: "configured" })) },
    changes,
    report,
  };
}

export function auditTemplateProjections(targetInput = ".") {
  const target = normalizeTarget(targetInput) as CapabilityTarget;
  const registry = readCapabilityRegistry(target);
  const capabilities = registry.capabilities.map((capability) => capability.name);
  const planned = plannedInitFiles(capabilities, { locale: registry.locale, paths: target.harness?.version === 2 ? target.harness : null });
  const manifest = readTemplateProjectionManifest(target);
  const entriesByDestination = new Map((manifest.entries || []).map((entry) => [entry.destination, entry]));
  const plannedDestinations = new Set(planned.map(([destination]) => destination));
  const projections = planned.map(([destination, source]) => {
    const destinationPath = path.join(target.projectRoot, destination);
    const rendered = renderInstallTemplate(source, target);
    const renderedSha256 = sha256(rendered);
    const existsAlready = fs.existsSync(destinationPath);
    const current = existsAlready ? fs.readFileSync(destinationPath, "utf8") : "";
    const currentSha256 = existsAlready ? sha256(current) : "";
    const recorded = entriesByDestination.get(destination);
    const ownership = !existsAlready
      ? "missing"
      : currentSha256 === renderedSha256
        ? "package-template-pristine"
        : recorded && currentSha256 === recorded.renderedSha256
          ? "package-template-pristine"
          : recorded
            ? "package-template-modified"
            : "project-authored";
    const action = !existsAlready
      ? "would-create"
      : currentSha256 === renderedSha256
        ? "no-op"
        : ownership === "package-template-pristine"
          ? "would-refresh"
          : "report-only";
    return {
      destination,
      source,
      exists: existsAlready,
      ownership,
      action,
      currentSha256: currentSha256 || null,
      expectedSha256: renderedSha256,
      recordedSha256: recorded?.renderedSha256 || null,
      pathFindings: pathFindings(current, target),
    };
  });
  const authoredFindings = scanProjectAuthoredPathFindings(target, plannedDestinations);
  return {
    operation: "template-projection-audit",
    target: target.projectRoot,
    manifestPath: templateProjectionManifestPath(target),
    projections,
    projectAuthoredFindings: authoredFindings,
    summary: {
      total: projections.length,
      missing: projections.filter((item) => item.ownership === "missing").length,
      refreshable: projections.filter((item) => item.action === "would-refresh").length,
      reportOnly: projections.filter((item) => item.action === "report-only").length + authoredFindings.length,
    },
  };
}

export function refreshTemplateProjections(targetInput = ".", { apply = false }: { apply?: boolean } = {}) {
  const target = normalizeTarget(targetInput) as CapabilityTarget;
  const audit = auditTemplateProjections(targetInput);
  const changes: CapabilityChange[] = [];
  const entries: TemplateProjectionEntry[] = [];
  for (const item of audit.projections) {
    if (!["would-create", "would-refresh"].includes(item.action)) continue;
    const rendered = renderInstallTemplate(item.source, target);
    changes.push({ destination: item.destination, source: item.source, action: apply ? item.action.replace("would-", "") : item.action });
    entries.push(templateProjectionEntry({ destination: item.destination, source: item.source, target, rendered }));
    if (!apply) continue;
    const destinationPath = path.join(target.projectRoot, item.destination);
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, rendered);
  }
  if (apply) writeTemplateProjectionManifest(target, entries);
  return {
    operation: "template-projection-refresh",
    dryRun: !apply,
    target: target.projectRoot,
    changes,
    audit,
  };
}
