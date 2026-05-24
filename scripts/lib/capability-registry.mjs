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
  readBundledTemplate,
  walkFiles,
  normalizeLocale,
  localizedTemplateSource,
} from "./core-shared.mjs";

export const capabilityDefinitions = {
  core: {
    description: "Planning loop and task execution records.",
    selectWhen: "Always install. This is the required document kernel.",
    default: true,
    dependencies: [],
    artifacts: ["docs/09-PLANNING"],
  },
  "module-parallel": {
    description: "Module registry, module plans, session prompts, and worker handoff.",
    selectWhen: "Use only when the project has two or more independent modules that need parallel ownership.",
    default: false,
    dependencies: ["core"],
    artifacts: ["docs/09-PLANNING/Module-Registry.md", "docs/09-PLANNING/MODULES"],
  },
  "subagent-worker": {
    description: "Commit-backed worker handoff protocol for code-changing subagents.",
    selectWhen: "Use only when code-changing subagents will work in dedicated worktrees with commit-backed handoff.",
    default: false,
    dependencies: ["module-parallel"],
    artifacts: ["docs/09-PLANNING/MODULES"],
  },
  "adversarial-review": {
    description: "Machine-gateable adversarial review reports and verifier output contract.",
    selectWhen: "Use when release, architecture, security, data, or strategy risk requires an independent review artifact.",
    default: false,
    dependencies: ["core"],
    artifacts: ["docs/09-PLANNING/TASKS"],
  },
  "long-running-task": {
    description: "Long-running task contract with review cadence and stop conditions.",
    selectWhen: "Use when agents may run across many loops without user confirmation after every step.",
    default: false,
    dependencies: ["core"],
    artifacts: ["docs/09-PLANNING/TASKS/_task-template/long-running-task-contract.md"],
  },
  "dashboard": {
    description: "Read-only HTML dashboard generated from harness status JSON.",
    selectWhen: "Use when users or agents need a local read-only status surface.",
    default: false,
    dependencies: ["core"],
    artifacts: [],
  },
  "safe-adoption": {
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
  const registryPath = path.join(target.projectRoot, ".harness-capabilities.json");
  if (!fs.existsSync(registryPath)) {
    return {
      mode: "legacy-compat",
      path: registryPath,
      capabilities: [{ name: "core", state: "configured" }],
      locale: "en-US",
      raw: null,
      errors: [],
    };
  }

  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"));
    const locale = normalizeLocale(raw.locale);
    const capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities.map((entry) =>
          typeof entry === "string"
            ? { name: normalizeCapabilityName(entry), state: "scaffolded" }
            : { name: normalizeCapabilityName(entry.name), state: entry.state || "scaffolded" },
        )
      : [];
    return { mode: "declared-capability", path: registryPath, capabilities, raw, locale, errors: [] };
  } catch (error) {
    return { mode: "declared-capability", path: registryPath, capabilities: [], raw: null, errors: [error.message] };
  }
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
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
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
    const pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
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
    "scripts",
    "docs-release",
    "examples",
  ];
}

function listPackageFiles() {
  const files = [];
  function walk(relativePath) {
    const full = path.join(repoRoot, relativePath);
    if (!fs.existsSync(full)) return;
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(full)) walk(path.join(relativePath, entry));
      return;
    }
    if (stat.isFile()) files.push(toPosix(relativePath));
  }
  for (const entry of skillPackageEntries()) walk(entry);
  return files.sort();
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

export function installUserSkill({ agent = "codex", home = "", dryRun = false, force = false } = {}) {
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
  const changed = targets.some((target) => target.created > 0 || target.overwritten > 0);
  const onlySkipped = targets.every((target) => target.created === 0 && target.overwritten === 0 && target.skipped > 0);
  return {
    operation: "install-user",
    status: dryRun ? "dry-run" : changed ? "installed" : onlySkipped ? "already-present" : "no-op",
    dryRun,
    force,
    version: packageVersion(),
    source: repoRoot,
    targets,
  };
}

function readInstalledVersion(targetRoot) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(targetRoot, "package.json"), "utf8"));
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
    "scripts/harness.mjs",
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
  const harnessCommand = commandOnPath("harness");
  return {
    operation: "doctor-user",
    status: targets.every((target) => target.status === "pass") ? "pass" : "fail",
    version: packageVersion(),
    harnessCommand: harnessCommand || null,
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
    if (registry.mode === "declared-capability") {
      for (const artifact of capabilityDefinitions[capability.name].artifacts) {
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
  } else {
    warnings.push("legacy-compat mode: no .harness-capabilities.json; adoption suggestion is available");
  }

  return { registry, detected, failures, warnings };
}


export function plannedInitFiles(capabilities = ["core"], { locale = "en-US" } = {}) {
  const files = [
    ["AGENTS.md", "templates/AGENTS.md.template"],
    ["CLAUDE.md", "templates/CLAUDE.md.template"],
    ["docs/Harness-Ledger.md", "templates/ledger/Harness-Ledger.md"],
    ["docs/03-ARCHITECTURE/README.md", "templates/architecture/README.md"],
    ["docs/03-ARCHITECTURE/Architecture-SSoT.md", "templates/architecture/Architecture-SSoT.md"],
    ["docs/03-ARCHITECTURE/local-repo-context.md", "templates/architecture/local-repo-context.md"],
    ["docs/03-ARCHITECTURE/system-map.md", "templates/architecture/system-map.md"],
    ["docs/03-ARCHITECTURE/service-catalog.md", "templates/architecture/service-catalog.md"],
    ["docs/03-ARCHITECTURE/critical-flows.md", "templates/architecture/critical-flows.md"],
    ["docs/03-ARCHITECTURE/services/_service-template.md", "templates/architecture/services/service-template.md"],
    ["docs/04-DEVELOPMENT/README.md", "templates/development/README.md"],
    ["docs/04-DEVELOPMENT/local-setup.md", "templates/development/local-setup.md"],
    ["docs/04-DEVELOPMENT/codebase-map.md", "templates/development/codebase-map.md"],
    ["docs/04-DEVELOPMENT/external-context/_service-template.md", "templates/development/external-context/service-template.md"],
    ["docs/04-DEVELOPMENT/external-source-packs/README.md", "templates/development/external-source-packs/README.md"],
    ["docs/04-DEVELOPMENT/external-source-packs/_digest-template.md", "templates/development/external-source-packs/digest-template.md"],
    ["docs/04-DEVELOPMENT/stubs-and-mocks.md", "templates/development/stubs-and-mocks.md"],
    ["docs/04-DEVELOPMENT/cross-repo-debugging.md", "templates/development/cross-repo-debugging.md"],
    ["docs/06-INTEGRATIONS/README.md", "templates/integrations/README.md"],
    ["docs/06-INTEGRATIONS/_api-contract-template.md", "templates/integrations/api-contract.md"],
    ["docs/06-INTEGRATIONS/_event-contract-template.md", "templates/integrations/event-contract.md"],
    ["docs/06-INTEGRATIONS/_webhook-contract-template.md", "templates/integrations/webhook-contract.md"],
    ["docs/06-INTEGRATIONS/third-party/_vendor-template.md", "templates/integrations/third-party/vendor-template.md"],
    ["docs/09-PLANNING/TASKS/_task-template/brief.md", "templates/planning/brief.md"],
    ["docs/09-PLANNING/TASKS/_task-template/task_plan.md", "templates/planning/task_plan.md"],
    ["docs/09-PLANNING/TASKS/_task-template/execution_strategy.md", "templates/planning/execution_strategy.md"],
    [`docs/09-PLANNING/TASKS/_task-template/${visualMapFile}`, "templates/planning/visual_map.md"],
    ["docs/09-PLANNING/TASKS/_task-template/findings.md", "templates/planning/findings.md"],
    ["docs/09-PLANNING/TASKS/_task-template/progress.md", "templates/planning/progress.md"],
    ["docs/09-PLANNING/TASKS/_task-template/review.md", "templates/planning/review.md"],
    ["docs/05-TEST-QA/Regression-SSoT.md", "templates/ssot/Regression-SSoT.md"],
    ["docs/05-TEST-QA/Cadence-Ledger.md", "templates/regression/Cadence-Ledger.md"],
    ["docs/10-WALKTHROUGH/_walkthrough-template.md", "templates/walkthrough/walkthrough-template.md"],
    ["docs/10-WALKTHROUGH/Closeout-SSoT.md", "templates/walkthrough/Closeout-SSoT.md"],
    ["docs/11-REFERENCE/external-source-intake-standard.md", "templates/reference/external-source-intake-standard.md"],
  ];
  if (capabilities.includes("module-parallel")) {
    files.push(["docs/09-PLANNING/Module-Registry.md", "templates/ssot/Module-Registry.md"]);
    files.push(["docs/09-PLANNING/MODULES/Session-Prompt-Pack.md", "templates/planning/module_session_prompt.md"]);
    files.push(["docs/09-PLANNING/MODULES/_module-template/brief.md", "templates/planning/module_brief.md"]);
    files.push(["docs/09-PLANNING/MODULES/_module-template/module_plan.md", "templates/planning/module_plan.md"]);
    files.push(["docs/09-PLANNING/MODULES/_module-template/execution_strategy.md", "templates/planning/execution_strategy.md"]);
    files.push([`docs/09-PLANNING/MODULES/_module-template/${visualMapFile}`, "templates/planning/visual_map.md"]);
    files.push(["docs/09-PLANNING/MODULES/_module-template/session_prompt.md", "templates/planning/module_session_prompt.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/task_plan.md", "templates/planning/task_plan.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/execution_strategy.md", "templates/planning/execution_strategy.md"]);
    files.push([`docs/09-PLANNING/MODULES/_task-template/${visualMapFile}`, "templates/planning/visual_map.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/findings.md", "templates/planning/findings.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/progress.md", "templates/planning/progress.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/review.md", "templates/planning/review.md"]);
  }
  if (capabilities.includes("long-running-task")) {
    files.push(["docs/09-PLANNING/TASKS/_task-template/long-running-task-contract.md", "templates/planning/long-running-task-contract.md"]);
  }
  return files.map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

export function writeInitFiles(targetInput, capabilities, { dryRun = true, locale = "en-US", addNpmScripts = false } = {}) {
  const target = normalizeTarget(targetInput);
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
  const registry = {
    version: 1,
    locale: normalizedLocale,
    capabilities: normalizedCapabilities.map((name) => ({ name, state: "scaffolded" })),
  };
  if (!dryRun) {
    const registryPath = path.join(target.projectRoot, ".harness-capabilities.json");
    if (!fs.existsSync(registryPath)) fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
  }
  const report = buildInstallReport({ target, locale: normalizedLocale, capabilities: normalizedCapabilities, changes, dryRun, operation: "init" });
  return { target, capabilities: normalizedCapabilities, locale: normalizedLocale, changes, nextCommands: initNextCommands(), report };
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
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
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
  const next = { version: 1, locale: normalizedLocale, capabilities: [...capabilityMap.values()] };
  const scaffold = plannedInitFiles([...capabilityMap.keys()], { locale: normalizedLocale });
  const changes = [];
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
    fs.writeFileSync(path.join(target.projectRoot, ".harness-capabilities.json"), `${JSON.stringify(next, null, 2)}\n`);
  }
  const report = buildInstallReport({ target, locale: normalizedLocale, capabilities: [...capabilityMap.keys()], changes, dryRun, operation: "add-capability" });
  return { target, dryRun, registry: next, changes, report };
}
