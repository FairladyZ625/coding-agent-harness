// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
  walkFiles,
  normalizeLocale,
  localizedTemplateSource,
  userPresetRootForHome,
} from "./core-shared.mjs";
import { listBundledPresetIds, seedBundledPresets } from "./preset-registry.mjs";
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
  v2HarnessRoot,
} from "./harness-paths.mjs";

export const capabilityDefinitions = {
  core: {
    description: "Planning loop and task execution records.",
    selectWhen: "Always install. This is the required document kernel.",
    default: true,
    dependencies: [],
    artifacts: [legacyPath(legacyPlanningRoot)],
  },
  "module-parallel": {
    description: "Module registry, module plans, session prompts, and worker handoff.",
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

export const capabilityAliases = {
  "review-contract": "adversarial-review",
};

export const allowedCapabilityStates = new Set(["scaffolded", "configured", "verified"]);
export const userInstallTargets = {
  codex: [".codex", "skills", "coding-agent-harness"],
  claude: [".claude", "skills", "coding-agent-harness"],
  gemini: [".gemini", "skills", "coding-agent-harness"],
  openclaw: [".openclaw", "skills", "coding-agent-harness"],
  agents: [".agents", "skills", "coding-agent-harness"],
};

export function readCapabilityRegistry(target) {
  if (target.harness?.version === 2 && target.harness.manifest) {
    return {
      mode: "v2-manifest",
      path: target.harness.manifestPath,
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

  let readError = null;
  const raw = readJsonSafe(registryPath, null, { onError: (error) => { readError = error; } });
  if (raw) {
    const locale = normalizeLocale(raw.locale);
    const capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities.map((entry) =>
          typeof entry === "string"
            ? { name: normalizeCapabilityName(entry), state: "scaffolded" }
            : { name: normalizeCapabilityName(entry.name), state: entry.state || "scaffolded" },
        )
      : [];
    return { mode: "declared-capability", path: registryPath, capabilities, raw, locale, errors: [] };
  }
  return { mode: "declared-capability", path: registryPath, capabilities: [], raw: null, errors: [readError?.message || "invalid .harness-capabilities.json"] };
}

export function normalizeCapabilityName(name) {
  return capabilityAliases[name] || name;
}

export function validateSourcePackageBoundary(targetInput = ".") {
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

function validateDashboardAppAssembly(root) {
  return validateDashboardAssetAssembly(root, "app.manifest.json", "app.js", "dashboard assets/app.js does not match app-src manifest assembly");
}

function validateDashboardAssetAssembly(root, manifestName, assetName, driftMessage) {
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
    return [`could not validate dashboard asset assembly (${assetName}): ${error.message}`];
  }
}

export function detectCapabilities(target) {
  const detected = new Set(["core"]);
  if (target.harness?.version === 2) {
    if (fs.existsSync(path.join(target.harness.modulesRoot, "Module-Registry.md"))) detected.add("module-parallel");
    if (fs.existsSync(path.join(target.harness.governanceRoot, "standards/adversarial-review-standard.md"))) detected.add("adversarial-review");
    if (fs.existsSync(path.join(target.harness.tasksRoot, "_task-template/long-running-task-contract.md"))) detected.add("long-running-task");
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

export function buildInstallReport({ target, locale, capabilities, changes, dryRun = false, operation = "init" }) {
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

function packageVersion() {
  try {
    const pkg = readJsonSafe(path.join(repoRoot, "package.json"), {});
    return pkg.version || "";
  } catch {
    return "";
  }
}

function userHome(home = "") {
  return path.resolve(home || os.homedir());
}

function normalizeUserAgent(agent = "codex") {
  const normalized = String(agent || "codex").toLowerCase();
  if (normalized === "all") return Object.keys(userInstallTargets);
  if (!userInstallTargets[normalized]) throw new Error(`Unknown user agent target: ${agent}`);
  return [normalized];
}

function targetForUserAgent(agent, home = "") {
  return path.join(userHome(home), ...userInstallTargets[agent]);
}

function skillPackageEntries() {
  return [
    "README.md",
    "CHANGELOG.md",
    "SKILL.md",
    "LICENSE",
    "package.json",
    "references",
    "templates",
    "templates-zh-CN",
    "presets",
    "dist",
    "docs-release",
    "examples",
  ];
}

function listPackageFiles() {
  return skillPackageEntries()
    .flatMap((entry) => {
      const fullPath = path.join(repoRoot, entry);
      if (!fs.existsSync(fullPath)) return [];
      if (fs.statSync(fullPath).isFile()) return [toPosix(path.relative(repoRoot, fullPath))];
      return walkFiles(fullPath).map((file) => toPosix(path.relative(repoRoot, file)));
    })
    .sort();
}

function copySkillPackage(targetRoot, { dryRun = false, force = false } = {}) {
  const changes = [];
  for (const relativeFile of listPackageFiles()) {
    const source = path.join(repoRoot, relativeFile);
    const destination = path.join(targetRoot, relativeFile);
    const existsAlready = fs.existsSync(destination);
    const action = existsAlready ? (force ? "overwrite" : "skip-existing") : dryRun ? "would-create" : "create";
    changes.push({ source: relativeFile, destination, action });
    if (dryRun || (existsAlready && !force)) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
  return changes;
}

export function installUserSkill({ agent = "codex", home = "", dryRun = false, force = false, seedPresets = true } = {}) {
  const agents = normalizeUserAgent(agent);
  const targets = agents.map((targetAgent) => {
    const target = targetForUserAgent(targetAgent, home);
    const changes = copySkillPackage(target, { dryRun, force });
    return {
      agent: targetAgent,
      target,
      changes,
      created: changes.filter((change) => ["create", "would-create"].includes(change.action)).length,
      overwritten: changes.filter((change) => change.action === "overwrite").length,
      skipped: changes.filter((change) => change.action === "skip-existing").length,
    };
  });
  const presetSeed = seedPresets ? seedBundledPresets({ scope: "user", home, dryRun, force }) : null;
  const changed = targets.some((target) => target.created > 0 || target.overwritten > 0) || (presetSeed && (presetSeed.created > 0 || presetSeed.overwritten > 0));
  const onlySkipped =
    targets.every((target) => target.created === 0 && target.overwritten === 0 && target.skipped > 0) &&
    (!presetSeed || presetSeed.presets.every((preset) => preset.action === "skip-existing"));
  return {
    operation: "install-user",
    status: dryRun ? "dry-run" : changed ? "installed" : onlySkipped ? "already-present" : "no-op",
    dryRun,
    force,
    version: packageVersion(),
    source: repoRoot,
    presets: presetSeed,
    targets,
  };
}

function readInstalledVersion(targetRoot) {
  try {
    const pkg = readJsonSafe(path.join(targetRoot, "package.json"), {});
    return pkg.version || "";
  } catch {
    return "";
  }
}

function commandOnPath(command) {
  const paths = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const extensions = process.platform === "win32" ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const base of paths) {
    for (const extension of extensions) {
      const candidate = path.join(base, `${command}${extension}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return "";
}

export function doctorUserSkill({ agent = "codex", home = "" } = {}) {
  const required = [
    "SKILL.md",
    "package.json",
    "references",
    "templates",
    "templates-zh-CN",
    "presets",
    "dist/harness.mjs",
    "docs-release/guides/agent-installation.md",
  ];
  const targets = normalizeUserAgent(agent).map((targetAgent) => {
    const target = targetForUserAgent(targetAgent, home);
    const missing = required.filter((relativePath) => !fs.existsSync(path.join(target, relativePath)));
    return {
      agent: targetAgent,
      target,
      status: missing.length === 0 ? "pass" : "fail",
      version: readInstalledVersion(target),
      missing,
    };
  });
  const presetRoot = userPresetRootForHome(home);
  const missingPresets = listBundledPresetIds().filter((id) => !fs.existsSync(path.join(presetRoot, id, "preset.yaml")));
  const presets = {
    root: presetRoot,
    status: missingPresets.length === 0 ? "pass" : "fail",
    missing: missingPresets,
  };
  const harnessCommand = commandOnPath("harness");
  return {
    operation: "doctor-user",
    status: targets.every((target) => target.status === "pass") && presets.status === "pass" ? "pass" : "fail",
    version: packageVersion(),
    harnessCommand: harnessCommand || null,
    presets,
    targets,
  };
}

export function validateCapabilities(target) {
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

function capabilityArtifactsForTarget(target, capabilityName) {
  if (target.harness?.version !== 2) return capabilityDefinitions[capabilityName].artifacts;
  const relative = (absolutePath) => toPosix(path.relative(target.projectRoot, absolutePath));
  const paths = target.harness;
  switch (capabilityName) {
    case "core":
      return [relative(paths.planningRoot)];
    case "module-parallel":
      return [relative(path.join(paths.modulesRoot, "Module-Registry.md")), relative(paths.modulesRoot)];
    case "subagent-worker":
      return [relative(paths.modulesRoot)];
    case "adversarial-review":
      return [relative(paths.tasksRoot)];
    case "long-running-task":
      return [];
    default:
      return capabilityDefinitions[capabilityName].artifacts;
  }
}


export function plannedInitFiles(capabilities = ["core"], { locale = "en-US", paths = null } = {}) {
  const root = paths ? toPosix(path.relative(paths.projectRoot, paths.harnessRoot)) : v2HarnessRoot;
  const modulesRoot = paths ? toPosix(path.relative(paths.projectRoot, paths.modulesRoot)) : `${root}/planning/modules`;
  const regressionRoot = paths ? toPosix(path.relative(paths.projectRoot, paths.regressionRoot)) : `${root}/governance/regression`;
  const contextRoot = `${root}/context`;
  const governanceRoot = paths ? toPosix(path.relative(paths.projectRoot, paths.governanceRoot)) : `${root}/governance`;
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
    files.push([`${modulesRoot}/Module-Registry.md`, "templates/ssot/Module-Registry.md"]);
    files.push([`${modulesRoot}/Session-Prompt-Pack.md`, "templates/planning/module_session_prompt.md"]);
  }
  return files.map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function plannedInitDirectories(capabilities = ["core"], { paths = null } = {}) {
  const planningRoot = paths ? toPosix(path.relative(paths.projectRoot, paths.planningRoot)) : `${v2HarnessRoot}/planning`;
  const tasksRoot = paths ? toPosix(path.relative(paths.projectRoot, paths.tasksRoot)) : `${v2HarnessRoot}/planning/tasks`;
  const modulesRoot = paths ? toPosix(path.relative(paths.projectRoot, paths.modulesRoot)) : `${v2HarnessRoot}/planning/modules`;
  const generatedRoot = paths ? toPosix(path.relative(paths.projectRoot, paths.generatedRoot)) : `${v2HarnessRoot}/governance/generated`;
  const directories = [
    planningRoot,
    tasksRoot,
    generatedRoot,
  ];
  if (capabilities.includes("module-parallel")) directories.push(modulesRoot);
  return directories;
}

export function writeInitFiles(targetInput, capabilities, { dryRun = true, locale = "en-US", addNpmScripts = false } = {}) {
  let target = normalizeTarget(targetInput);
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
  const manifestDestination = `${v2HarnessRoot}/harness.yaml`;
  const manifestPath = path.join(target.projectRoot, manifestDestination);
  const manifestExists = fs.existsSync(manifestPath);
  changes.push({ destination: manifestDestination, source: "harness-root/v2", action: manifestExists ? "skip-existing" : dryRun ? "would-create" : "create" });
  if (!dryRun && !manifestExists) {
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, renderHarnessManifest({ locale: normalizedLocale, capabilities: normalizedCapabilities }));
    target = normalizeTarget(target.projectRoot);
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
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
  if (addNpmScripts) {
    changes.push(...writeNpmScripts(target, { dryRun }));
  }
  const presetSeed = seedBundledPresets({ scope: "project", targetInput: target.projectRoot, dryRun });
  const report = buildInstallReport({ target, locale: normalizedLocale, capabilities: normalizedCapabilities, changes, dryRun, operation: "init" });
  return { target, capabilities: normalizedCapabilities, locale: normalizedLocale, changes, presetSeed, nextCommands: initNextCommands(), report };
}

function renderHarnessManifest({ locale, capabilities, structure = null }) {
  const manifestStructure = structure || {
    harnessRoot: v2HarnessRoot,
    planningRoot: `${v2HarnessRoot}/planning`,
    tasksRoot: `${v2HarnessRoot}/planning/tasks`,
    modulesRoot: `${v2HarnessRoot}/planning/modules`,
    externalRoot: `${v2HarnessRoot}/planning/external`,
    governanceRoot: `${v2HarnessRoot}/governance`,
    generatedRoot: `${v2HarnessRoot}/governance/generated`,
  };
  return [
    "version: 2",
    `locale: ${locale}`,
    "capabilities:",
    ...capabilities.map((capability) => `  - ${capability}`),
    "structure:",
    ...Object.entries(manifestStructure).map(([key, value]) => `  ${key}: ${value}`),
    "",
  ].join("\n");
}

function initNextCommands() {
  return [
    "npx --yes coding-agent-harness dev .",
    "npx --yes coding-agent-harness dashboard --out-dir tmp/harness-dashboard .",
  ];
}

function writeNpmScripts(target, { dryRun = true } = {}) {
  const packagePath = path.join(target.projectRoot, "package.json");
  if (!fs.existsSync(packagePath)) throw new Error("init --add-npm-scripts requires an existing package.json");
  const pkg = readJsonSafe(packagePath, {});
  const scripts = { ...(pkg.scripts || {}) };
  const additions = {
    "harness:dev": "coding-agent-harness dev .",
    "harness:dashboard": "coding-agent-harness dashboard --out-dir tmp/harness-dashboard .",
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

export function addCapability(targetInput, capabilityName, { dryRun = true, locale = "" } = {}) {
  const target = normalizeTarget(targetInput);
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
  const changes = [];
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
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
  if (!dryRun) {
    const manifestPath = target.harness.version === 2
      ? target.manifestPath
      : path.join(target.projectRoot, v2HarnessRoot, "harness.yaml");
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, renderHarnessManifest({ locale: normalizedLocale, capabilities: nextCapabilities, structure: target.harness.manifest?.structure }));
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
