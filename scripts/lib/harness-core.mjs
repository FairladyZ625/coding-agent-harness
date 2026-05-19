import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { writeDashboardDirectory } from "./dashboard-writer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const legacyChecker = path.join(repoRoot, "scripts/check-harness.mjs");

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

export const supportedLocales = new Set(["zh-CN", "en-US"]);
export const allowedCapabilityStates = new Set(["scaffolded", "configured", "verified"]);
export const userInstallTargets = {
  codex: [".codex", "skills", "coding-agent-harness"],
  claude: [".claude", "skills", "coding-agent-harness"],
  gemini: [".gemini", "skills", "coding-agent-harness"],
  openclaw: [".openclaw", "skills", "coding-agent-harness"],
  agents: [".agents", "skills", "coding-agent-harness"],
};
export const allowedReviewDispositions = new Set([
  "open",
  "mitigated",
  "closed",
  "deferred",
  "accepted-risk",
  "not-reproducible",
  "out-of-scope",
]);
export const allowedTaskStates = new Set(["not_started", "planned", "in_progress", "blocked", "done"]);
export const allowedPhaseStates = new Set(["planned", "in_progress", "review", "blocked", "done", "skipped"]);
export const allowedEvidenceStatus = new Set(["missing", "partial", "present", "waived"]);

export function normalizeTarget(input = ".") {
  const target = path.resolve(input);
  const isDocsRoot =
    path.basename(target) === "docs" &&
    (fs.existsSync(path.join(target, "09-PLANNING")) || fs.existsSync(path.join(target, "11-REFERENCE")));
  return {
    input: target,
    projectRoot: isDocsRoot ? path.dirname(target) : target,
    docsRoot: isDocsRoot ? target : path.join(target, "docs"),
    docsOnly: isDocsRoot,
  };
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function exists(target, relativePath) {
  return fs.existsSync(path.join(target.projectRoot, relativePath));
}

export function existsInDocs(target, relativePath) {
  return fs.existsSync(path.join(target.docsRoot, relativePath));
}

export function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function walkFiles(root) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if ([".git", "node_modules", "tmp"].includes(entry)) continue;
        walk(full);
      } else {
        results.push(full);
      }
    }
  }
  walk(root);
  return results;
}

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

function normalizeCapabilityName(name) {
  return capabilityAliases[name] || name;
}

export function normalizeLocale(locale = "en-US") {
  return supportedLocales.has(locale) ? locale : "en-US";
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
  return {
    failures: localOnly.map((file) => `private local-only file staged: ${file}`),
    warnings: [],
  };
}

function inferProjectLocale(target, fallback = "en-US") {
  const candidates = [
    path.join(target.projectRoot, "AGENTS.md"),
    path.join(target.projectRoot, "CLAUDE.md"),
    path.join(target.docsRoot, "AGENTS.md"),
    path.join(target.docsRoot, "Harness-Ledger.md"),
  ];
  for (const file of candidates) {
    const content = readFileSafe(file);
    if (/\p{Script=Han}/u.test(content)) return "zh-CN";
  }
  return normalizeLocale(fallback);
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
      `node scripts/harness.mjs check --profile target-project ${target.projectRoot}`,
      `node scripts/harness.mjs status --json ${target.projectRoot}`,
      `node scripts/harness.mjs dashboard --out /tmp/harness-dashboard.html ${target.projectRoot}`,
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

function markdownTableRows(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map(splitMarkdownRow);
}

function slug(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

function prefixedPath(target, filePath) {
  return `TARGET:${toPosix(path.relative(target.projectRoot, filePath))}`;
}

function sanitizeText(value) {
  return String(value ?? "")
    .replace(/file:\/\/\/[^\s)"'`<>\]]+/g, "LOCAL_FILE_URL_REDACTED")
    .replaceAll("file://", "LOCAL_FILE_URL_REDACTED")
    .replace(/\/Users\/[^/\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/Volumes\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/(?:private\/)?tmp\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/var\/folders\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/home\/[^/\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/[A-Za-z]:\\[^\s)"'`<>\]]+(?:\\[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED");
}

function sanitizeDeep(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeDeep(entry)]));
  }
  return value;
}

function titleFromMarkdown(content, fallback) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function parseAllMarkdownTables(content, source, kindPrefix) {
  const lines = content.split(/\r?\n/);
  const tables = [];
  let index = 0;
  let tableIndex = 1;
  while (index < lines.length) {
    if (!lines[index].trim().startsWith("|")) {
      index += 1;
      continue;
    }
    const start = index;
    const block = [];
    while (index < lines.length && lines[index].trim().startsWith("|")) {
      block.push(lines[index]);
      index += 1;
    }
    if (block.length < 2) continue;
    const rows = block.map(splitMarkdownRow);
    const separator = rows[1] || [];
    if (!separator.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    const columns = rows[0];
    const dataRows = rows.slice(2).filter((row) => row.length === columns.length);
    tables.push({
      id: `${slug(kindPrefix)}-${String(tableIndex).padStart(2, "0")}`,
      kind: kindPrefix,
      source,
      line: start + 1,
      columns,
      rows: dataRows.map((row, rowIndex) => ({
        id: `${slug(kindPrefix)}-${String(tableIndex).padStart(2, "0")}-row-${String(rowIndex + 1).padStart(3, "0")}`,
        cells: Object.fromEntries(columns.map((column, columnIndex) => [column, sanitizeText(row[columnIndex] || "")])),
      })),
    });
    tableIndex += 1;
  }
  return tables;
}

function splitMarkdownRow(line) {
  let text = String(line || "").trim();
  if (text.startsWith("|")) text = text.slice(1);
  if (text.endsWith("|") && !text.endsWith("\\|")) text = text.slice(0, -1);
  const cells = [];
  let current = "";
  let inCode = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\" && text[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "`") inCode = !inCode;
    if (char === "|" && !inCode) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function tableAfterHeading(content, headerPattern) {
  const rows = markdownTableRows(content);
  const headerIndex = rows.findIndex((cells) => cells.some((cell) => headerPattern.test(cell)));
  if (headerIndex < 0) return { header: [], rows: [] };
  const header = rows[headerIndex];
  const body = [];
  for (const row of rows.slice(headerIndex + 1)) {
    if (row.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (row.length !== header.length) break;
    body.push(row);
  }
  return { header, rows: body };
}

function getColumn(header, name) {
  return header.findIndex((cell) => cell.toLowerCase() === name.toLowerCase());
}

function parseTaskState(progressContent) {
  const match = progressContent.match(/^##\s*(?:Current Status|Status|状态)\s*[:：]?\s*(?:\n\s*)?([^\n]+)/im);
  const raw = match ? match[1].replace(/`/g, "").trim() : "unknown";
  const aliases = new Map([
    ["进行中", "in_progress"],
    ["已完成", "done"],
    ["未开始", "not_started"],
    ["已阻塞", "blocked"],
  ]);
  return aliases.get(raw) || raw.toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
}

function parsePhases(taskPlanContent) {
  const { header, rows } = tableAfterHeading(taskPlanContent, /^Phase ID$/i);
  if (rows.length === 0) return [];
  const indexes = {
    id: getColumn(header, "Phase ID"),
    dependsOn: getColumn(header, "Depends On"),
    state: getColumn(header, "State"),
    completion: getColumn(header, "Completion"),
    output: getColumn(header, "Output"),
    requiredEvidence: getColumn(header, "Required Evidence"),
    evidenceStatus: getColumn(header, "Evidence Status"),
    blockingRisk: getColumn(header, "Blocking Risk"),
    owner: getColumn(header, "Owner / Handoff"),
  };
  return rows.map((row) => ({
    id: row[indexes.id] || "",
    dependsOn: splitDependencies(row[indexes.dependsOn] || ""),
    state: row[indexes.state] || "planned",
    completion: Number.parseInt(String(row[indexes.completion] || "0").replace("%", ""), 10) || 0,
    output: row[indexes.output] || "",
    requiredEvidence: splitList(row[indexes.requiredEvidence] || ""),
    evidenceStatus: row[indexes.evidenceStatus] || "missing",
    blockingRisk: row[indexes.blockingRisk] || "",
    owner: row[indexes.owner] || "",
  }));
}

function readTaskContractFile(taskDir, fileName, legacyContent = "") {
  const filePath = path.join(taskDir, fileName);
  const content = readFileSafe(filePath);
  if (content.trim()) return { path: filePath, content, source: "standalone" };
  return { path: filePath, content: legacyContent, source: legacyContent.trim() ? "legacy" : "missing" };
}

function splitList(value) {
  return String(value || "")
    .split(/[,+;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => item.toLowerCase() !== "none");
}

function splitDependencies(value) {
  return String(value || "")
    .split(/\s*(?:,|;|\+|&|\/|\band\b|\bAND\b)\s*/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => !/^(none|n\/a|na|-|—|–|无)$/i.test(item))
    .filter((item) => !/^same\b/i.test(item));
}

function listTaskPlanPaths(target) {
  const taskRoots = [
    path.join(target.docsRoot, "09-PLANNING/TASKS"),
    path.join(target.docsRoot, "09-PLANNING/MODULES"),
  ];
  return taskRoots
    .flatMap(walkFiles)
    .filter((file) => file.endsWith("task_plan.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`));
}

function taskIdForDirectory(target, taskDir) {
  return toPosix(path.relative(path.join(target.docsRoot, "09-PLANNING"), taskDir));
}

export function collectTasks(target) {
  return listTaskPlanPaths(target).map((taskPlanPath) => {
    const taskDir = path.dirname(taskPlanPath);
    const taskPlan = readFileSafe(taskPlanPath);
    const brief = readTaskContractFile(taskDir, "brief.md", "");
    const roadmap = readTaskContractFile(taskDir, "visual_roadmap.md", taskPlan);
    const progress = readFileSafe(path.join(taskDir, "progress.md"));
    const review = readFileSafe(path.join(taskDir, "review.md"));
    const phases = parsePhases(roadmap.content);
    const completion =
      phases.length > 0
        ? Math.round(
            phases.filter((phase) => phase.state !== "skipped").reduce((sum, phase) => sum + phase.completion, 0) /
              Math.max(1, phases.filter((phase) => phase.state !== "skipped").length),
          )
        : 0;
    const relative = toPosix(path.relative(target.projectRoot, taskDir));
    const id = taskIdForDirectory(target, taskDir);
    const title = titleFromMarkdown(brief.content || taskPlan, path.basename(taskDir));
    return {
      id,
      shortId: path.basename(taskDir),
      title,
      path: `TARGET:${relative}`,
      module: id.startsWith("MODULES/") ? id.split("/")[1] : null,
      briefSource: brief.source,
      roadmapSource: roadmap.source,
      state: parseTaskState(progress),
      completion,
      phases,
      risks: collectReviewRisks(review),
      evidence: collectEvidence(progress),
      handoffs: collectHandoffs(progress, title),
      dependencies: [],
    };
  });
}

function collectMarkdownDocuments(target) {
  const docs = collectDashboardDocumentPaths(target);
  return docs.map((file, index) => {
    const content = sanitizeText(readFileSafe(file));
    const source = prefixedPath(target, file);
    return {
      id: `doc-${String(index + 1).padStart(4, "0")}-${slug(path.basename(file, ".md"))}`,
      path: source,
      title: titleFromMarkdown(content, path.basename(file)),
      content,
    };
  });
}

function collectDashboardDocumentPaths(target) {
  const selected = new Set();
  const addDocsPath = (relativePath) => {
    const file = path.join(target.docsRoot, relativePath);
    if (fs.existsSync(file)) selected.add(file);
  };
  for (const relativePath of [
    "Harness-Ledger.md",
    "09-PLANNING/Module-Registry.md",
    "05-TEST-QA/Regression-SSoT.md",
    "05-TEST-QA/Cadence-Ledger.md",
    "01-GOVERNANCE/Lessons-SSoT.md",
    "10-WALKTHROUGH/Closeout-SSoT.md",
  ]) {
    addDocsPath(relativePath);
  }
  for (const taskPlanPath of listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    for (const fileName of ["brief.md", "task_plan.md", "execution_strategy.md", "visual_roadmap.md", "progress.md", "review.md", "findings.md"]) {
      const file = path.join(taskDir, fileName);
      if (fs.existsSync(file)) selected.add(file);
    }
    for (const indexFile of ["references/INDEX.md", "artifacts/INDEX.md"]) {
      const file = path.join(taskDir, indexFile);
      if (fs.existsSync(file)) selected.add(file);
    }
  }
  for (const file of walkFiles(path.join(target.docsRoot, "09-PLANNING/MODULES"))) {
    if (file.endsWith("module_plan.md")) selected.add(file);
    if (/09-PLANNING[\\/]+MODULES[\\/]+[^\\/]+[\\/]brief\.md$/.test(file)) selected.add(file);
  }
  for (const file of walkFiles(path.join(target.docsRoot, "01-GOVERNANCE/lessons"))) {
    if (file.endsWith(".md")) selected.add(file);
  }
  return [...selected]
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .sort();
}

function documentKind(source) {
  const lower = source.toLowerCase();
  if (lower.includes("harness-ledger.md")) return "harness-ledger";
  if (lower.includes("module-registry.md")) return "module-registry";
  if (lower.includes("regression-ssot.md")) return "regression-ssot";
  if (lower.includes("cadence-ledger.md")) return "cadence-ledger";
  if (lower.includes("lessons-ssot.md")) return "lessons-ssot";
  if (lower.endsWith("/progress.md")) return "task-progress";
  if (lower.endsWith("/brief.md")) return "task-brief";
  if (lower.endsWith("/review.md")) return "task-review";
  if (lower.endsWith("/references/index.md")) return "task-references";
  if (lower.endsWith("/artifacts/index.md")) return "task-artifacts";
  if (lower.endsWith("/execution_strategy.md")) return "execution-strategy";
  if (lower.endsWith("/visual_roadmap.md")) return "visual-roadmap";
  if (lower.endsWith("/module_plan.md")) return "module-plan";
  return "markdown-table";
}

function collectTables(documents) {
  return {
    tables: documents.flatMap((document) => parseAllMarkdownTables(document.content, document.path, documentKind(document.path))),
  };
}

function collectGraph(status, tables = { tables: [] }) {
  const nodes = [];
  const edges = [];
  const seenNodes = new Set();
  const addNode = (node) => {
    if (seenNodes.has(node.id)) return;
    seenNodes.add(node.id);
    nodes.push(node);
  };
  const addEdge = (edge) => {
    if (!edge.from || !edge.to || edge.from === edge.to) return;
    edges.push(edge);
  };
  for (const task of status.tasks) {
    addNode({ id: `task:${task.id}`, type: "task", label: task.title, state: task.state, completion: task.completion });
    for (const phase of task.phases || []) {
      const phaseId = `phase:${task.id}:${phase.id}`;
      addNode({ id: phaseId, type: "phase", label: phase.id, state: phase.state, completion: phase.completion, taskId: task.id });
      addEdge({ from: `task:${task.id}`, to: phaseId, type: "contains" });
      for (const dependency of phase.dependsOn || []) {
        addEdge({ from: `phase:${task.id}:${dependency}`, to: phaseId, type: "depends_on" });
      }
    }
    for (const handoff of task.handoffs || []) {
      const handoffId = `handoff:${handoff.id}`;
      addNode({ id: handoffId, type: "handoff", label: handoff.summary, state: handoff.state });
      addEdge({ from: `task:${task.id}`, to: handoffId, type: "handoff" });
    }
  }
  for (const table of tables.tables || []) {
    if (table.kind === "module-registry") {
      for (const row of table.rows) {
        const key = row.cells.Key || row.cells.Module || "";
        if (!key) continue;
        const moduleId = `module:${key}`;
        addNode({ id: moduleId, type: "module", label: row.cells.Name || key, state: row.cells.Status || "unknown", currentStep: row.cells["Current Step"] || "" });
        if (row.cells["Current Step"]) {
          const stepId = `step:${row.cells["Current Step"]}`;
          addNode({ id: stepId, type: "step", label: row.cells["Current Step"], state: row.cells.Status || "unknown", module: key });
          addEdge({ from: moduleId, to: stepId, type: "current_step" });
        }
      }
    }
    if (table.kind === "module-plan") {
      const moduleMatch = table.source.match(/MODULES\/([^/]+)\/module_plan\.md$/);
      const moduleKey = moduleMatch ? moduleMatch[1] : slug(table.source);
      const moduleId = `module:${moduleKey}`;
      addNode({ id: moduleId, type: "module", label: moduleKey, state: "planned" });
      for (const row of table.rows) {
        const step = row.cells["Step ID"];
        if (!step) continue;
        const stepId = `step:${step}`;
        addNode({ id: stepId, type: "step", label: `${step} ${row.cells.Name || ""}`.trim(), state: row.cells.Status || "unknown", module: moduleKey });
        addEdge({ from: moduleId, to: stepId, type: "contains" });
        for (const dependency of splitDependencies(row.cells["Depends On"] || "")) {
          addEdge({ from: `step:${dependency}`, to: stepId, type: "depends_on" });
        }
      }
    }
  }
  for (const edge of edges) {
    if (edge.type === "depends_on" && !seenNodes.has(edge.from)) {
      addNode({ id: edge.from, type: "external-dependency", label: edge.from.replace(/^(phase:[^:]+:|step:)/, ""), state: "external" });
    }
  }
  return { nodes, edges: edges.filter((edge) => seenNodes.has(edge.from) && seenNodes.has(edge.to)) };
}

function categorizeWarning(message) {
  if (/missing execution_strategy\.md|missing visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Plan Contract Missing";
  if (/legacy-compat|adoption-needed|legacy check/i.test(message)) return "Adoption Advice";
  if (/Evidence|evidence/i.test(message)) return "Missing Evidence";
  if (/schema|missing .*columns|invalid/i.test(message)) return "Schema Drift";
  return "Review Finding";
}

function collectAdoption(status) {
  const warnings = status.checkState.details.warnings.flatMap((message) => splitWarningMessage(message)).map((message, index) => ({
    id: `AD-${String(index + 1).padStart(3, "0")}`,
    category: categorizeWarning(message),
    severity: status.mode === "legacy-compat" ? "advice" : "warning",
    title: warningTitle(message),
    affected: warningAffected(message),
    requiredAction: warningAction(message),
    detail: sanitizeText(message),
  }));
  return {
    mode: status.mode,
    project: status.project,
    summary: {
      blockers: status.checkState.failures,
      advice: warnings.length,
    },
    warnings,
    manualSteps: {
      zh: [
        "先查看升级建议，决定当前项目要采用哪些 v1.0 能力合同。",
        "为仍在活跃的任务手工补齐 execution_strategy.md 和 visual_roadmap.md。",
        "只有在项目明确声明 v1.0 capability 后，再把 strict check 当成阻塞门禁。",
      ],
      en: [
        "Review adoption advice and decide which v1.0 capability contracts should be adopted.",
        "Manually add execution_strategy.md and visual_roadmap.md for active tasks.",
        "Treat strict check as blocking only after the project intentionally declares v1.0 capabilities.",
      ],
    },
  };
}

export function buildMigrationPlan(targetInput, { limit = 20 } = {}) {
  const target = normalizeTarget(targetInput);
  const status = buildStatus(targetInput, { strict: false, strictLegacy: false });
  const registry = readCapabilityRegistry(target);
  const locale = registry.raw ? registry.locale : inferProjectLocale(target, registry.locale);
  const warnings = status.checkState.details.warnings.flatMap((message) => splitWarningMessage(message)).filter(Boolean);
  const taskActionsByTask = new Map();
  const reviewActionsByPath = new Map();
  const legacyActions = [];
  const warningGroups = new Map();

  for (const warning of warnings) {
    const category = categorizeWarning(warning);
    const group = warningGroups.get(category) || { category, count: 0, examples: [] };
    group.count += 1;
    if (group.examples.length < 3) group.examples.push(sanitizeText(warning));
    warningGroups.set(category, group);

    const taskContract = warning.match(/(?:adoption-needed:\s*)?(docs\/09-PLANNING\/TASKS\/([^/\s]+))\s+missing\s+(execution_strategy\.md|visual_roadmap\.md)/i);
    if (taskContract) {
      const key = taskContract[2];
      const existing = taskActionsByTask.get(key) || {
        taskId: key,
        path: `TARGET:${taskContract[1]}`,
        files: new Set(),
        action: "For active or reopened tasks, add standalone v1 task contract files by adapting the localized task template. Leave closed historical tasks untouched unless strict gates require migration.",
      };
      existing.files.add(taskContract[3]);
      taskActionsByTask.set(key, existing);
      continue;
    }

    const reviewGap = warning.match(/(?:adoption-needed:\s*)?(docs\/[^\s]+\.md)\s+missing\s+(.+)/i);
    if (reviewGap && /Reviewer Identity|Confidence Challenge|Evidence Checked|Final Confidence Basis/i.test(reviewGap[2])) {
      const key = reviewGap[1];
      const existing = reviewActionsByPath.get(key) || {
        path: `TARGET:${key}`,
        missing: new Set(),
        action: "Upgrade this review only if it is active, release-blocking, or reused as current evidence. Otherwise keep it as historical material.",
      };
      existing.missing.add(reviewGap[2]);
      reviewActionsByPath.set(key, existing);
      continue;
    }

    const legacyRequired = warning.match(/-\s+missing required file:\s+([^\s]+)/i);
    if (legacyRequired) {
      legacyActions.push({
        type: "missing-reference",
        path: `TARGET:${legacyRequired[1]}`,
        action: "Create or adapt this reference only when the related capability is intentionally adopted.",
      });
    }
  }

  const taskActions = [...taskActionsByTask.values()].map((action) => ({
    ...action,
    files: [...action.files].sort(),
    commands: [
      `copy/adapt docs/09-PLANNING/TASKS/_task-template/${action.files.has("execution_strategy.md") ? "execution_strategy.md" : "visual_roadmap.md"} into ${action.path}`,
      `node scripts/harness.mjs task-log ${action.taskId} --message "migrated active task contract" ${target.projectRoot}`,
    ],
  }));
  const reviewActions = [...reviewActionsByPath.values()].map((action) => ({
    ...action,
    missing: [...action.missing].sort(),
  }));
  const recommendedCapabilities = recommendedMigrationCapabilities(status, target, registry);
  const missingExecutionStrategy = taskActions.filter((action) => action.files.includes("execution_strategy.md")).length;
  const missingVisualRoadmap = taskActions.filter((action) => action.files.includes("visual_roadmap.md")).length;

  return {
    operation: "migrate-plan",
    target: target.projectRoot,
    locale,
    mode: status.mode,
    compatibility: {
      preserves: [
        "AGENTS.md and CLAUDE.md are never overwritten by safe-adoption.",
        "Existing Harness-Ledger, SSoT, walkthrough, progress, review, and historical task plans are preserved.",
        "Closed historical tasks may remain in legacy format unless they become active evidence for a strict gate.",
      ],
      strictGate: "Normal migration mode reports adoption-needed warnings; --strict remains available as the final cutover gate.",
    },
    summary: {
      tasks: status.tasks.length,
      warnings: warnings.length,
      missingExecutionStrategy,
      missingVisualRoadmap,
      reviewSchemaGaps: reviewActions.length,
      legacyReferenceGaps: legacyActions.length,
      recommendedCapabilities: recommendedCapabilities.map((capability) => capability.name),
    },
    recommendedCapabilities,
    phases: migrationPhases({ locale, recommendedCapabilities }),
    taskActions: taskActions.slice(0, limit),
    reviewActions: reviewActions.slice(0, limit),
    legacyActions: legacyActions.slice(0, limit),
    warningGroups: [...warningGroups.values()],
    nextCommands: [
      `node scripts/harness.mjs add-capability safe-adoption --locale ${locale} ${target.projectRoot}`,
      `node scripts/harness.mjs migrate-plan --json ${target.projectRoot}`,
      `node scripts/harness.mjs check --profile target-project ${target.projectRoot}`,
      `node scripts/harness.mjs check --profile target-project --strict ${target.projectRoot}`,
    ],
  };
}

function recommendedMigrationCapabilities(status, target, registry) {
  const declared = new Set(registry.capabilities.map((capability) => capability.name));
  const detected = new Set(detectCapabilities(target));
  const recommendations = [];
  if (!declared.has("safe-adoption")) {
    recommendations.push({
      name: "safe-adoption",
      priority: "required",
      reason: "The project has legacy harness artifacts or missing v1 registry; migration must preserve existing documents.",
    });
  }
  if (detected.has("long-running-task") && !declared.has("long-running-task")) {
    recommendations.push({
      name: "long-running-task",
      priority: "candidate",
      reason: "Long-running task artifacts exist; declare only if active work still uses continuous execution contracts.",
    });
  }
  const moduleRegistry = existsInDocs(target, "09-PLANNING/Module-Registry.md");
  const modulePlans = walkFiles(path.join(target.docsRoot, "09-PLANNING/MODULES")).some((file) => file.endsWith("module_plan.md"));
  if ((moduleRegistry || modulePlans || status.tasks.length > 50) && !declared.has("module-parallel")) {
    recommendations.push({
      name: "module-parallel",
      priority: moduleRegistry || modulePlans ? "candidate" : "consider",
      reason: moduleRegistry || modulePlans
        ? "Module planning artifacts already exist; verify owners, write scopes, and registry sync before declaring."
        : "Large legacy task volume may need module grouping before strict migration.",
    });
  }
  if (status.checkState.details.warnings.some((warning) => /review/i.test(warning)) && !declared.has("adversarial-review")) {
    recommendations.push({
      name: "adversarial-review",
      priority: "consider",
      reason: "Review artifacts exist but may not use the v1 schema; declare when active release or architecture reviews are migrated.",
    });
  }
  return recommendations;
}

function migrationPhases({ locale, recommendedCapabilities }) {
  return [
    {
      id: "MP-01",
      title: "Stabilize legacy state",
      goal: "Record current harness state without rewriting historical documents.",
      actions: ["Run safe-adoption dry-run", "Confirm locale", "Confirm current git status is understood"],
      exitCriteria: [".harness-capabilities.json exists", "Existing AGENTS.md/CLAUDE.md/history are preserved"],
    },
    {
      id: "MP-02",
      title: "Choose capability cutover",
      goal: "Declare only capabilities that match real project facts.",
      actions: recommendedCapabilities.map((capability) => `Evaluate ${capability.name}: ${capability.reason}`),
      exitCriteria: ["Capability registry has no accidental declarations", "Every optional capability has a project fact trigger"],
    },
    {
      id: "MP-03",
      title: "Migrate active task contracts",
      goal: "Upgrade active or reopened tasks to v1 task files first.",
      actions: ["Add brief.md, execution_strategy.md, visual_roadmap.md for active tasks", "Keep closed historical tasks as legacy evidence"],
      exitCriteria: ["Active task status is readable by status/dashboard", "Task evidence is logged through progress.md"],
    },
    {
      id: "MP-04",
      title: "Introduce modules if needed",
      goal: "Move from single-line task history to module ownership only when the project has real independent domains.",
      actions: ["Identify modules by product/domain, not file folders", "Create module registry after owner/write-scope decisions", "Route shared updates through coordinator"],
      exitCriteria: ["Module owners and write scopes are explicit", "No worker owns shared global ledgers without coordinator sync"],
    },
    {
      id: "MP-05",
      title: "Upgrade current reviews and references",
      goal: "Bring only active review and reference gates to v1 schema.",
      actions: ["Upgrade release-blocking reviews first", "Create missing reference files only for adopted capabilities", "Record accepted historical gaps as residuals"],
      exitCriteria: ["Current release gates have v1 review evidence", "Legacy-only gaps are categorized as residuals"],
    },
    {
      id: "MP-06",
      title: "Strict cutover",
      goal: "Turn strict checks into the blocking gate after migration scope is complete.",
      actions: ["Run normal check until warnings are understood", "Run --strict after active work is migrated", "Keep residual owner/action/status for deferred history"],
      exitCriteria: ["Strict check passes or every remaining failure has owner/action/status"],
    },
  ].map((phase) => ({
    ...phase,
    locale,
  }));
}

function splitWarningMessage(message) {
  return String(message || "")
    .split(/\n-\s+/)
    .map((item, index) => (index === 0 ? item : `- ${item}`))
    .filter(Boolean);
}

function warningTitle(message) {
  if (/missing execution_strategy\.md/i.test(message)) return "Missing execution strategy";
  if (/missing visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Missing visual roadmap";
  if (/legacy-compat/i.test(message)) return "Legacy compatibility mode";
  if (/legacy check failed/i.test(message)) return "Legacy checker finding";
  if (/review\.md missing/i.test(message)) return "Review schema gap";
  if (/findings table missing/i.test(message)) return "Review findings schema gap";
  return String(message).split(":")[0].slice(0, 96);
}

function warningAffected(message) {
  const target = String(message).match(/(?:docs|\.harness-private)\/[^\s:]+/);
  return target ? target[0] : "project";
}

function warningAction(message) {
  if (/execution_strategy\.md/i.test(message)) return "Add standalone execution strategy file.";
  if (/visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Add standalone visual roadmap phase table.";
  if (/review\.md missing/i.test(message)) return "Update review.md to v1 review schema.";
  if (/legacy/i.test(message)) return "Review manually; do not auto-migrate.";
  return "Inspect source document and decide whether to adopt v1 contract.";
}

export function buildDashboardBundle(targetInput, options = {}) {
  const status = buildStatus(targetInput, options);
  const target = normalizeTarget(targetInput);
  const documents = { documents: collectMarkdownDocuments(target) };
  const tables = collectTables(documents.documents);
  const graph = collectGraph(status, tables);
  const adoption = collectAdoption(status);
  return sanitizeDeep({ status, tables, documents, graph, adoption });
}

export function writeDashboardFolder(outDir, targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const registry = readCapabilityRegistry(target);
  const bundle = buildDashboardBundle(targetInput, options);
  return writeDashboardDirectory(outDir, bundle, { repoRoot, projectRoot: target.projectRoot, docsRoot: target.docsRoot, locale: registry.locale });
}

function collectHandoffs(progressContent, taskId) {
  if (!/Coordinator Handoff/i.test(progressContent) || !/pending-coordinator-pass/i.test(progressContent)) return [];
  return [{ id: `H-${taskId}`, from: "worker", to: "coordinator", state: "pending", summary: "Coordinator handoff pending" }];
}

function collectReviewRisks(reviewContent) {
  const { header, rows } = tableAfterHeading(reviewContent, /^ID$/i);
  const severityIndex = getColumn(header, "Severity");
  const findingIndex = getColumn(header, "Finding");
  const openIndex = getColumn(header, "Open");
  const blocksIndex = getColumn(header, "Blocks Release");
  if (severityIndex < 0 || findingIndex < 0) return [];
  return rows
    .filter((row) => /^P[0-3]$/i.test(row[severityIndex] || ""))
    .map((row) => ({
      id: row[0],
      severity: row[severityIndex],
      open: /^yes$/i.test(row[openIndex] || "no"),
      blocksRelease: /^yes$/i.test(row[blocksIndex] || "no"),
      summary: row[findingIndex],
    }));
}

function collectEvidence(progressContent) {
  const matches = [...progressContent.matchAll(/\b(command|diff|fixture|screenshot|review|report):((?:PUBLIC|PRIVATE|TARGET|EXTERNAL|URL):[^:\s|]+):([^\n|]+)/g)];
  return matches.map((match, index) => ({
    id: `E-${String(index + 1).padStart(3, "0")}`,
    type: match[1],
    path: match[2],
    status: "present",
    summary: match[3].trim(),
  }));
}

export function runLegacyCheck(target) {
  const checkTarget = target.docsOnly ? target.projectRoot : target.input;
  const result = spawnSync(process.execPath, [legacyChecker, checkTarget], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  return {
    status: result.status === 0 ? "pass" : "fail",
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

export function validateReviewSchema(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  const reviewPaths = walkFiles(target.docsRoot)
    .filter((file) => file.endsWith("review.md"))
    .filter((file) => !file.includes(`${path.sep}_task-template${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_optional-structures${path.sep}`))
    .filter((file) => !file.includes(`${path.sep}_archive${path.sep}`));

  for (const reviewPath of reviewPaths) {
    const relative = toPosix(path.relative(target.projectRoot, reviewPath));
    const content = readFileSafe(reviewPath);
    for (const required of ["Reviewer Identity", "Confidence Challenge", "Evidence Checked", "Final Confidence Basis"]) {
      if (!content.includes(required)) {
        if (strict) failures.push(`${relative} missing ${required}`);
        else warnings.push(`${relative} missing ${required}`);
      }
    }
    const evidenceTable = tableAfterHeading(content, /^Evidence ID$/i);
    if (strict && evidenceTable.rows.length === 0) {
      failures.push(`${relative} Evidence Checked table needs at least one evidence row`);
    }
    const usesVerifier = /verifier-backed|(^|\|)[^|\n]*\|\s*verifier\s*\|/im.test(content);
    if (usesVerifier) {
      if (!/template_id:\s*`?harness-verifier\/v1`?/i.test(content)) {
        report(`${relative} verifier-backed review missing template_id: harness-verifier/v1`);
      }
      if (!/verdict:\s*`?(pass|fail|inconclusive)`?/i.test(content)) {
        report(`${relative} verifier-backed review missing verdict`);
      }
    }
    const { header, rows } = tableAfterHeading(content, /^ID$/i);
    if (rows.length === 0) continue;
    const severityIndex = getColumn(header, "Severity");
    const openIndex = getColumn(header, "Open");
    const dispositionIndex = getColumn(header, "Disposition");
    const blocksIndex = getColumn(header, "Blocks Release");
    const followUpIndex = getColumn(header, "Follow-up");
    const evidenceCheckedIndex = getColumn(header, "Evidence Checked");
    if ([severityIndex, openIndex, dispositionIndex, blocksIndex].some((index) => index < 0)) {
      report(`${relative} findings table missing Severity/Open/Disposition/Blocks Release columns`);
      continue;
    }
    for (const row of rows) {
      const id = row[0] || "";
      if (!/^(R|SR)-\d+/i.test(id)) continue;
      const severity = row[severityIndex] || "";
      const open = (row[openIndex] || "").toLowerCase();
      const disposition = (row[dispositionIndex] || "").toLowerCase();
      const blocks = (row[blocksIndex] || "").toLowerCase();
      const followUp = row[followUpIndex] || "";
      if (!/^P[0-3]$/.test(severity)) report(`${relative} ${id} invalid severity: ${severity}`);
      if (!["yes", "no"].includes(open)) report(`${relative} ${id} invalid Open value: ${open}`);
      if (!allowedReviewDispositions.has(disposition)) report(`${relative} ${id} invalid Disposition: ${disposition}`);
      if (!["yes", "no"].includes(blocks)) report(`${relative} ${id} invalid Blocks Release value: ${blocks}`);
      if ((open === "yes" || blocks === "yes") && /^P[01]$/.test(severity)) {
        report(`${relative} ${id} has release-blocking open ${severity}`);
      }
      if (["accepted-risk", "deferred"].includes(disposition) && (!followUp || /^none|无$/i.test(followUp))) {
        report(`${relative} ${id} ${disposition} requires follow-up routing`);
      }
      if (strict && evidenceCheckedIndex >= 0) {
        const refs = splitList(row[evidenceCheckedIndex] || "");
        const evidenceIds = new Set(evidenceTable.rows.map((evidenceRow) => evidenceRow[0]));
        for (const ref of refs) {
          if (ref !== "none" && /^E-\d+/i.test(ref) && !evidenceIds.has(ref)) {
            failures.push(`${relative} ${id} references missing evidence id: ${ref}`);
          }
        }
      }
    }
  }
  return { failures, warnings };
}

export function validateVisualRoadmaps(target) {
  const failures = [];
  const warnings = [];
  for (const taskPlanPath of listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    const roadmapPath = path.join(taskDir, "visual_roadmap.md");
    const relative = toPosix(path.relative(target.projectRoot, roadmapPath));
    const taskPlan = readFileSafe(taskPlanPath);
    const roadmap = readTaskContractFile(taskDir, "visual_roadmap.md", taskPlan);
    const { header, rows } = tableAfterHeading(roadmap.content, /^Phase ID$/i);
    if (rows.length > 0) {
      for (const column of ["Phase ID", "Depends On", "State", "Completion", "Output", "Required Evidence", "Evidence Status", "Blocking Risk", "Owner / Handoff"]) {
        if (getColumn(header, column) < 0) failures.push(`${relative} Visual Roadmap missing column: ${column}`);
      }
    }
    const phases = parsePhases(roadmap.content);
    for (const phase of phases) {
      if (!allowedPhaseStates.has(phase.state)) failures.push(`${relative} phase ${phase.id} invalid state: ${phase.state}`);
      if (!allowedEvidenceStatus.has(phase.evidenceStatus)) {
        failures.push(`${relative} phase ${phase.id} invalid evidence status: ${phase.evidenceStatus}`);
      }
      if (!Number.isInteger(phase.completion) || phase.completion < 0 || phase.completion > 100) {
        failures.push(`${relative} phase ${phase.id} completion must be integer 0..100`);
      }
      if (phase.state === "done" && phase.completion !== 100) failures.push(`${relative} phase ${phase.id} done must be 100`);
      if (phase.state === "planned" && phase.completion !== 0) failures.push(`${relative} phase ${phase.id} planned must be 0`);
    }
    if (roadmap.source === "standalone" && phases.length === 0) warnings.push(`${relative} has no Visual Roadmap phase table`);
    if (roadmap.source === "legacy" && phases.length > 0) warnings.push(`${relative} missing; using legacy task_plan.md Visual Roadmap fallback`);
  }
  return { failures, warnings };
}

export function validatePlanContracts(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  for (const taskPlanPath of listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    const relativeDir = toPosix(path.relative(target.projectRoot, taskDir));
    for (const fileName of ["execution_strategy.md", "visual_roadmap.md"]) {
      if (!fs.existsSync(path.join(taskDir, fileName))) {
        report(`${relativeDir} missing ${fileName}`);
      }
    }
  }
  return { failures, warnings };
}

export function buildStatus(targetInput, options = {}) {
  const target = normalizeTarget(targetInput);
  const capabilityState = validateCapabilities(target);
  const declaredCapabilities = new Set(capabilityState.registry.capabilities.map((capability) => capability.name));
  const safeAdoptionMode = declaredCapabilities.has("safe-adoption");
  const shouldRunLegacy = !options.skipLegacyCheck && (capabilityState.registry.mode === "legacy-compat" || safeAdoptionMode);
  const legacy = shouldRunLegacy ? runLegacyCheck(target) : { status: "skipped", code: 0, stdout: "", stderr: "" };
  const contractStrict = Boolean(options.strict) || (capabilityState.registry.mode !== "legacy-compat" && !safeAdoptionMode);
  const reviews = validateReviewSchema(target, { strict: contractStrict });
  const roadmaps = validateVisualRoadmaps(target);
  const planContracts = validatePlanContracts(target, { strict: contractStrict });
  const failures = [...capabilityState.failures, ...reviews.failures, ...roadmaps.failures, ...planContracts.failures];
  const warnings = [...capabilityState.warnings, ...reviews.warnings, ...roadmaps.warnings, ...planContracts.warnings];
  if (legacy.status === "fail") {
    if (options.strictLegacy) failures.push("legacy check failed");
    else warnings.push(`adoption-needed: legacy check failed: ${(legacy.stderr || legacy.stdout).trim()}`);
  }

  const tasks = collectTasks(target);
  const capabilityNames = new Map(capabilityState.registry.capabilities.map((capability) => [capability.name, capability]));
  for (const detected of capabilityState.detected) {
    if (!capabilityNames.has(detected)) capabilityNames.set(detected, { name: detected, state: "configured" });
  }

  return {
    project: {
      name: path.basename(target.projectRoot),
      root: `TARGET:${target.docsOnly ? toPosix(path.relative(target.projectRoot, target.docsRoot)) : "."}`,
      docsOnly: target.docsOnly,
    },
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    mode: capabilityState.registry.mode,
    checkState: {
      status: failures.length > 0 ? "fail" : warnings.length > 0 ? "warn" : "pass",
      failures: failures.length,
      warnings: warnings.length,
      details: { failures, warnings },
      legacy,
    },
    capabilities: [...capabilityNames.values()].map((capability) => ({
      name: capability.name,
      state: capability.state || "configured",
      dependencyStatus: capabilityDefinitions[capability.name]?.dependencies.every((dependency) => capabilityNames.has(dependency))
        ? "valid"
        : "invalid",
      warnings: capabilityState.warnings.filter((warning) => warning.includes(capability.name)),
    })),
    tasks,
    handoffs: tasks.flatMap((task) => task.handoffs || []),
    recentActivity: tasks.slice(0, 8).map((task) => ({ at: new Date().toISOString(), type: "task", summary: task.title })),
  };
}

export function renderDashboard(status) {
  const taskCards = status.tasks
    .map((task) => {
      const phases = task.phases
        .map(
          (phase) => `<div class="phase ${escapeHtml(phase.state)}">
            <div class="phase-top"><strong>${escapeHtml(phase.id)}</strong><span>${phase.completion}%</span></div>
            <div class="phase-output">${escapeHtml(phase.output)}</div>
            <div class="meter"><i style="width:${phase.completion}%"></i></div>
            <div class="muted">${escapeHtml(phase.state)} · evidence ${escapeHtml(phase.evidenceStatus)}</div>
          </div>`,
        )
        .join("");
      const risks = task.risks
        .map((risk) => `<span class="risk ${risk.open || risk.blocksRelease ? "open" : ""}">${escapeHtml(risk.severity)} ${escapeHtml(risk.summary)}</span>`)
        .join("");
      const evidence = task.evidence
        .map((item) => `<span class="evidence">${escapeHtml(item.type)} · ${escapeHtml(item.summary)}</span>`)
        .join("");
      const evidenceMeter = evidenceCompletion(task.phases);
      return `<section class="task">
        <div class="task-head">
          <div><h2>${escapeHtml(task.title)}</h2><p>${escapeHtml(task.path)}</p></div>
          <div class="score">${task.completion}%</div>
        </div>
        <div class="meter"><i style="width:${task.completion}%"></i></div>
        <div class="phases">${phases || '<div class="empty">No phase table</div>'}</div>
        <div class="evidence-row"><strong>Evidence</strong><div class="meter small"><i style="width:${evidenceMeter}%"></i></div>${evidence || '<span class="empty">No evidence</span>'}</div>
        <div class="risks">${risks || '<span class="ok">No open visual risk</span>'}</div>
      </section>`;
    })
    .join("");
  const chips = status.capabilities
    .map((capability) => `<span class="chip ${escapeHtml(capability.state)}">${escapeHtml(capability.name)} · ${escapeHtml(capability.state)}</span>`)
    .join("");
  const failures = status.checkState.details.failures.map((failure) => `<li>${escapeHtml(failure)}</li>`).join("");
  const warnings = status.checkState.details.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
  const handoffs = status.handoffs
    .map((handoff) => `<span class="handoff">${escapeHtml(handoff.state)} · ${escapeHtml(handoff.summary)}</span>`)
    .join("");
  const activity = status.recentActivity
    .map((item) => `<li><strong>${escapeHtml(item.type)}</strong> ${escapeHtml(item.summary)}</li>`)
    .join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(status.project.name)} Harness Dashboard</title>
  <style>
    :root{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#17202a;background:#f6f7f9}
    body{margin:0}.shell{max-width:1180px;margin:0 auto;padding:28px}
    header{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:24px}
    h1,h2{margin:0;letter-spacing:0}h1{font-size:30px}h2{font-size:18px}p{margin:6px 0;color:#687382}
    .pill,.chip,.risk,.ok{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:12px;margin:4px;background:#e8edf3;color:#273444}
    .pass,.verified{background:#dff5e8;color:#125c32}.warn,.configured{background:#fff0cc;color:#765100}.fail,.open{background:#ffe1df;color:#8a1c12}.scaffolded{background:#e8edf3;color:#273444}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px}.stat,.task{background:#fff;border:1px solid #e4e8ee;border-radius:8px;padding:16px}
    .stat strong{font-size:24px;display:block}.capabilities{margin-bottom:20px}.task{margin-bottom:16px}.task-head{display:flex;justify-content:space-between;gap:16px}
    .score{font-size:28px;font-weight:700;color:#223047}.meter{height:8px;background:#edf1f5;border-radius:99px;overflow:hidden;margin:10px 0}.meter i{display:block;height:100%;background:#2f6fed}.meter.small{height:6px;max-width:180px}
    .evidence,.handoff{display:inline-flex;padding:5px 8px;margin:4px;border-radius:6px;background:#edf7ff;color:#214d72;font-size:12px}.handoff{background:#fff3d8;color:#745000}
    .phases{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px;margin-top:12px}.phase{border:1px solid #e5eaf0;border-radius:8px;padding:12px;background:#fbfcfe}.phase-top{display:flex;justify-content:space-between}.phase-output{min-height:38px;margin-top:8px}
    .risks{margin-top:12px}.empty{color:#8a95a3}.panel{background:#fff;border:1px solid #e4e8ee;border-radius:8px;padding:16px;margin-top:16px}
    @media(max-width:760px){.shell{padding:16px}header{display:block}.grid{grid-template-columns:1fr 1fr}.task-head{display:block}}
  </style>
</head>
<body><main class="shell">
  <header>
    <div><h1>${escapeHtml(status.project.name)} Harness Dashboard</h1><p>${escapeHtml(status.project.root)} · ${escapeHtml(status.generatedAt)}</p></div>
    <span class="pill ${escapeHtml(status.checkState.status)}">${escapeHtml(status.checkState.status)} · ${escapeHtml(status.mode)}</span>
  </header>
  <section class="grid">
    <div class="stat"><strong>${status.tasks.length}</strong><span>Tasks</span></div>
    <div class="stat"><strong>${status.capabilities.length}</strong><span>Capabilities</span></div>
    <div class="stat"><strong>${status.checkState.failures}</strong><span>Failures</span></div>
    <div class="stat"><strong>${status.checkState.warnings}</strong><span>Warnings</span></div>
  </section>
  <section class="capabilities">${chips}</section>
  <section class="panel"><h2>Handoffs</h2>${handoffs || '<span class="ok">No pending handoff</span>'}</section>
  ${taskCards || '<section class="task">No tasks found.</section>'}
  <section class="panel"><h2>Recent Activity</h2><ul>${activity || "<li>None</li>"}</ul></section>
  <section class="panel"><h2>Failures</h2><ul>${failures || "<li>None</li>"}</ul><h2>Warnings</h2><ul>${warnings || "<li>None</li>"}</ul></section>
</main></body></html>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function evidenceCompletion(phases) {
  const scored = phases.filter((phase) => phase.state !== "skipped");
  if (scored.length === 0) return 0;
  const score = scored.reduce((sum, phase) => {
    if (["present", "waived"].includes(phase.evidenceStatus)) return sum + 100;
    if (phase.evidenceStatus === "partial") return sum + 50;
    return sum;
  }, 0);
  return Math.round(score / scored.length);
}

function localizedTemplateSource(source, locale) {
  const localeSource = normalizeLocale(locale) === "zh-CN" ? source.replace(/^templates\//, "templates-zh-CN/") : source;
  return fs.existsSync(path.join(repoRoot, localeSource)) ? localeSource : source;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function nowTimestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 16);
}

export function normalizeTaskId(value) {
  return slug(value || "task");
}

function renderTaskTemplate(content, { taskId, title, locale }) {
  const date = todayDate();
  return String(content)
    .replaceAll("{{TASK_ID}}", taskId)
    .replaceAll("{{TASK_TITLE}}", title)
    .replaceAll("{{DATE}}", date)
    .replaceAll("{{LOCALE}}", normalizeLocale(locale))
    .replaceAll("[Task Name]", title)
    .replaceAll("[任务名称]", title);
}

function taskTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["brief.md", "templates/planning/brief.md"],
    ["task_plan.md", "templates/planning/task_plan.md"],
    ["execution_strategy.md", "templates/planning/execution_strategy.md"],
    ["visual_roadmap.md", "templates/planning/visual_roadmap.md"],
    ["findings.md", "templates/planning/findings.md"],
    ["progress.md", "templates/planning/progress.md"],
    ["review.md", "templates/planning/review.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function optionalTaskTemplateFiles({ locale = "en-US" } = {}) {
  return [
    ["references/INDEX.md", "templates/planning/optional/references/INDEX.md"],
    ["artifacts/INDEX.md", "templates/planning/optional/artifacts/INDEX.md"],
  ].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function moduleTemplateFiles({ locale = "en-US" } = {}) {
  return [["brief.md", "templates/planning/module_brief.md"]].map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

function taskRoot(target, taskId, { moduleKey = "" } = {}) {
  const normalizedTaskId = normalizeTaskId(taskId);
  if (moduleKey) return path.join(target.docsRoot, "09-PLANNING/MODULES", normalizeTaskId(moduleKey), normalizedTaskId);
  return path.join(target.docsRoot, "09-PLANNING/TASKS", normalizedTaskId);
}

function resolveTaskDirectory(target, taskRef) {
  const raw = String(taskRef || "").replace(/^docs\/09-PLANNING\//, "").replace(/^\/+/, "");
  if (!raw) throw new Error("Missing task id");
  const direct = raw.startsWith("TASKS/") || raw.startsWith("MODULES/") ? path.join(target.docsRoot, "09-PLANNING", raw) : "";
  if (direct && fs.existsSync(path.join(direct, "task_plan.md"))) return direct;
  const normalized = normalizeTaskId(raw);
  const candidates = listTaskPlanPaths(target)
    .map((taskPlanPath) => path.dirname(taskPlanPath))
    .filter((taskDir) => {
      const id = taskIdForDirectory(target, taskDir);
      return id === raw || id.endsWith(`/${raw}`) || path.basename(taskDir) === normalized;
    });
  if (candidates.length === 1) return candidates[0];
  if (candidates.length > 1) {
    const options = candidates.map((taskDir) => `- ${taskIdForDirectory(target, taskDir)}`).join("\n");
    throw new Error(`Ambiguous task reference: ${taskRef}\n${options}`);
  }
  const legacy = taskRoot(target, normalized);
  if (fs.existsSync(path.join(legacy, "task_plan.md"))) return legacy;
  throw new Error(`Task not found: ${taskRef}`);
}

function findTaskByDirectory(target, taskDir) {
  const id = taskIdForDirectory(target, taskDir);
  return collectTasks(target).find((task) => task.id === id) || null;
}

function stateLabel(state, locale) {
  if (normalizeLocale(locale) !== "zh-CN") return state;
  return (
    {
      not_started: "未开始",
      planned: "未开始",
      in_progress: "进行中",
      blocked: "已阻塞",
      done: "已完成",
    }[state] || state
  );
}

function updateProgressState(content, state, locale) {
  const label = stateLabel(state, locale);
  if (/^##\s*状态[:：][^\n]*/im.test(content)) {
    return content.replace(/^##\s*状态[:：][^\n]*/im, `## 状态：${label}`);
  }
  if (/^##\s*(?:Current Status|Status)\s*\n+\s*[^\n]+/im.test(content)) {
    return content.replace(/^##\s*(Current Status|Status)\s*\n+\s*[^\n]+/im, `## $1\n\n${label}`);
  }
  return `${content.trimEnd()}\n\n## Status\n\n${label}\n`;
}

function appendProgressLog(content, { event, message, evidence, actor = "coordinator" }) {
  const timestamp = nowTimestamp();
  const safeMessage = String(message || event).replace(/\r?\n/g, " ").trim();
  const safeEvidence = String(evidence || "n/a").replace(/\r?\n/g, " ").trim();
  if (/^##\s*Log\s*$/im.test(content)) {
    return content.replace(
      /(^##\s*Log\s*$[\s\S]*?\| --- \| --- \| --- \| --- \| --- \|\n)/im,
      `$1| ${timestamp} | ${actor} | ${event}: ${safeMessage} | ${safeEvidence} | ${event === "task-complete" ? "done" : "continue"} |\n`,
    );
  }
  if (/^##\s*进度记录\s*$/im.test(content)) {
    return `${content.trimEnd()}\n\n### [${timestamp}] - ${event}\n\n- 做了什么：${safeMessage}\n- 验证结果：已记录\n- 下一步：${event === "task-complete" ? "完成" : "继续执行"}\n- 证据：${safeEvidence}\n`;
  }
  return `${content.trimEnd()}\n\n## Log\n\n| Time | Actor | Action | Evidence | Next |\n| --- | --- | --- | --- | --- |\n| ${timestamp} | ${actor} | ${event}: ${safeMessage} | ${safeEvidence} | ${event === "task-complete" ? "done" : "continue"} |\n`;
}

export function createTask(targetInput, taskId, { title = "", locale = "en-US", dryRun = false, moduleKey = "", budget = "standard" } = {}) {
  const target = normalizeTarget(targetInput);
  const normalizedTaskId = normalizeTaskId(taskId);
  if (!normalizedTaskId) throw new Error("Missing task id");
  const normalizedModuleKey = moduleKey ? normalizeTaskId(moduleKey) : "";
  const normalizedLocale = normalizeLocale(locale || readCapabilityRegistry(target).locale);
  const taskTitle = title || normalizedTaskId;
  const directory = taskRoot(target, normalizedTaskId, { moduleKey: normalizedModuleKey });
  if (fs.existsSync(directory)) throw new Error(`Task already exists: ${normalizedTaskId}`);
  const changes = [];
  if (normalizedModuleKey) {
    const moduleDirectory = path.dirname(directory);
    for (const [destination, source] of moduleTemplateFiles({ locale: normalizedLocale })) {
      const destinationPath = path.join(moduleDirectory, destination);
      if (fs.existsSync(destinationPath)) continue;
      const sourcePath = path.join(repoRoot, source);
      changes.push({
        destination: toPosix(path.relative(target.projectRoot, destinationPath)),
        source,
        action: dryRun ? "would-create" : "create",
      });
      if (dryRun) continue;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.writeFileSync(destinationPath, renderTaskTemplate(readFileSafe(sourcePath), { taskId: normalizedModuleKey, title: normalizedModuleKey, locale: normalizedLocale }));
    }
  }
  const files = budget === "complex" ? [...taskTemplateFiles({ locale: normalizedLocale }), ...optionalTaskTemplateFiles({ locale: normalizedLocale })] : taskTemplateFiles({ locale: normalizedLocale });
  for (const [destination, source] of files) {
    const destinationPath = path.join(directory, destination);
    const sourcePath = path.join(repoRoot, source);
    changes.push({
      destination: toPosix(path.relative(target.projectRoot, destinationPath)),
      source,
      action: dryRun ? "would-create" : "create",
    });
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, renderTaskTemplate(readFileSafe(sourcePath), { taskId: normalizedTaskId, title: taskTitle, locale: normalizedLocale }));
  }
  return {
    dryRun,
    task: {
      id: taskIdForDirectory(target, directory),
      shortId: normalizedTaskId,
      title: taskTitle,
      module: normalizedModuleKey || null,
      path: `TARGET:${toPosix(path.relative(target.projectRoot, directory))}`,
      locale: normalizedLocale,
      budget,
    },
    changes,
  };
}

export function updateTaskLifecycle(targetInput, taskId, { event = "task-log", state = "", message = "", evidence = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const taskDir = resolveTaskDirectory(target, taskId);
  const progressPath = path.join(taskDir, "progress.md");
  const registry = readCapabilityRegistry(target);
  const normalizedState = state ? String(state).toLowerCase().replaceAll("-", "_") : "";
  if (normalizedState && !allowedTaskStates.has(normalizedState)) throw new Error(`Invalid task state: ${state}`);
  let content = readFileSafe(progressPath);
  if (normalizedState) content = updateProgressState(content, normalizedState, registry.locale);
  content = appendProgressLog(content, { event, message, evidence });
  fs.writeFileSync(progressPath, content.endsWith("\n") ? content : `${content}\n`);
  return {
    event,
    task: findTaskByDirectory(target, taskDir) || { id: taskIdForDirectory(target, taskDir), state: normalizedState || "unknown" },
  };
}

export function updateTaskPhase(targetInput, taskId, phaseId, { state = "", completion = "", evidenceStatus = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const taskDir = resolveTaskDirectory(target, taskId);
  const roadmapPath = path.join(taskDir, "visual_roadmap.md");
  if (!fs.existsSync(roadmapPath)) throw new Error(`Task visual roadmap not found: ${taskId}`);
  let content = readFileSafe(roadmapPath);
  const normalizedState = state ? String(state).toLowerCase().replaceAll("-", "_") : "";
  if (normalizedState && !allowedPhaseStates.has(normalizedState)) throw new Error(`Invalid phase state: ${state}`);
  const normalizedEvidence = evidenceStatus ? String(evidenceStatus).toLowerCase() : "";
  if (normalizedEvidence && !allowedEvidenceStatus.has(normalizedEvidence)) throw new Error(`Invalid evidence status: ${evidenceStatus}`);
  const nextCompletion = completion === "" ? "" : Number.parseInt(String(completion), 10);
  if (nextCompletion !== "" && (!Number.isInteger(nextCompletion) || nextCompletion < 0 || nextCompletion > 100)) {
    throw new Error(`Invalid completion: ${completion}`);
  }
  content = updateMarkdownTableRow(content, /^Phase ID$/i, (header, row) => {
    const idIndex = getColumn(header, "Phase ID");
    if ((row[idIndex] || "") !== phaseId) return row;
    const next = [...row];
    const stateIndex = getColumn(header, "State");
    const completionIndex = getColumn(header, "Completion");
    const evidenceIndex = getColumn(header, "Evidence Status");
    if (normalizedState && stateIndex >= 0) next[stateIndex] = normalizedState;
    if (nextCompletion !== "" && completionIndex >= 0) next[completionIndex] = String(nextCompletion);
    if (normalizedEvidence && evidenceIndex >= 0) next[evidenceIndex] = normalizedEvidence;
    return next;
  });
  fs.writeFileSync(roadmapPath, content);
  return { event: "task-phase", task: findTaskByDirectory(target, taskDir), phaseId };
}

export function updateModuleStep(targetInput, moduleKey, stepId, { state = "" } = {}) {
  const target = normalizeTarget(targetInput);
  const normalizedModuleKey = normalizeTaskId(moduleKey);
  const normalizedState = String(state || "done").toLowerCase().replaceAll("_", "-");
  if (!["planned", "in-progress", "done", "blocked", "superseded"].includes(normalizedState)) throw new Error(`Invalid module step state: ${state}`);
  const modulePlanPath = path.join(target.docsRoot, "09-PLANNING/MODULES", normalizedModuleKey, "module_plan.md");
  if (!fs.existsSync(modulePlanPath)) throw new Error(`Module plan not found: ${normalizedModuleKey}`);
  let content = readFileSafe(modulePlanPath);
  content = updateMarkdownTableRow(content, /^(Step ID|步骤 ID)$/i, (header, row) => {
    const idIndex = firstColumn(header, ["Step ID", "步骤 ID"]);
    if ((row[idIndex] || "") !== stepId) return row;
    const next = [...row];
    const statusIndex = firstColumn(header, ["Status", "状态"]);
    if (statusIndex >= 0) next[statusIndex] = normalizedState;
    return next;
  });
  fs.writeFileSync(modulePlanPath, content);

  const registryPath = path.join(target.docsRoot, "09-PLANNING/Module-Registry.md");
  if (fs.existsSync(registryPath)) {
    let registry = readFileSafe(registryPath);
    registry = updateMarkdownTableRow(registry, /^ID$/i, (header, row) => {
      const moduleIndex = firstColumn(header, ["Module", "模块"]);
      const taskPlanIndex = getColumn(header, "Task Plan");
      const matchesModule = normalizeTaskId(row[moduleIndex] || "") === normalizedModuleKey;
      const matchesPlan = taskPlanIndex >= 0 && String(row[taskPlanIndex] || "").includes(`/MODULES/${normalizedModuleKey}/`);
      if (!matchesModule && !matchesPlan) return row;
      const next = [...row];
      const statusIndex = getColumn(header, "Status");
      const updatedIndex = getColumn(header, "Updated");
      if (statusIndex >= 0) next[statusIndex] = normalizedState === "done" ? "merged" : normalizedState === "in-progress" ? "active" : normalizedState;
      if (updatedIndex >= 0) next[updatedIndex] = todayDate();
      return next;
    });
    fs.writeFileSync(registryPath, registry);
  }
  return { event: "module-step", moduleKey: normalizedModuleKey, stepId, state: normalizedState };
}

function firstColumn(header, names) {
  for (const name of names) {
    const index = getColumn(header, name);
    if (index >= 0) return index;
  }
  return -1;
}

function updateMarkdownTableRow(content, headerPattern, updater) {
  const lines = content.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim().startsWith("|")) continue;
    const header = splitMarkdownRow(lines[index]);
    if (!header.some((cell) => headerPattern.test(cell))) continue;
    let rowIndex = index + 2;
    while (rowIndex < lines.length && lines[rowIndex].trim().startsWith("|")) {
      const row = splitMarkdownRow(lines[rowIndex]);
      if (row.length === header.length && !row.every((cell) => /^:?-{3,}:?$/.test(cell))) {
        const next = updater(header, row);
        lines[rowIndex] = `| ${next.join(" | ")} |`;
      }
      rowIndex += 1;
    }
    return lines.join("\n");
  }
  return content;
}

export function listLifecycleTasks(targetInput, { state = "", moduleKey = "" } = {}) {
  const target = normalizeTarget(targetInput);
  let tasks = collectTasks(target);
  if (state) tasks = tasks.filter((task) => task.state === String(state).toLowerCase().replaceAll("-", "_"));
  if (moduleKey) tasks = tasks.filter((task) => task.module === normalizeTaskId(moduleKey));
  return { tasks };
}

export function plannedInitFiles(capabilities = ["core"], { locale = "en-US" } = {}) {
  const files = [
    ["AGENTS.md", "templates/AGENTS.md.template"],
    ["CLAUDE.md", "templates/CLAUDE.md.template"],
    ["docs/Harness-Ledger.md", "templates/ledger/Harness-Ledger.md"],
    ["docs/09-PLANNING/TASKS/_task-template/brief.md", "templates/planning/brief.md"],
    ["docs/09-PLANNING/TASKS/_task-template/task_plan.md", "templates/planning/task_plan.md"],
    ["docs/09-PLANNING/TASKS/_task-template/execution_strategy.md", "templates/planning/execution_strategy.md"],
    ["docs/09-PLANNING/TASKS/_task-template/visual_roadmap.md", "templates/planning/visual_roadmap.md"],
    ["docs/09-PLANNING/TASKS/_task-template/findings.md", "templates/planning/findings.md"],
    ["docs/09-PLANNING/TASKS/_task-template/progress.md", "templates/planning/progress.md"],
    ["docs/09-PLANNING/TASKS/_task-template/review.md", "templates/planning/review.md"],
    ["docs/05-TEST-QA/Regression-SSoT.md", "templates/ssot/Regression-SSoT.md"],
    ["docs/05-TEST-QA/Cadence-Ledger.md", "templates/regression/Cadence-Ledger.md"],
    ["docs/01-GOVERNANCE/Lessons-SSoT.md", "templates/ssot/Lessons-SSoT.md"],
    ["docs/10-WALKTHROUGH/_walkthrough-template.md", "templates/walkthrough/walkthrough-template.md"],
    ["docs/10-WALKTHROUGH/Closeout-SSoT.md", "templates/walkthrough/Closeout-SSoT.md"],
  ];
  if (capabilities.includes("module-parallel")) {
    files.push(["docs/09-PLANNING/Module-Registry.md", "templates/ssot/Module-Registry.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/task_plan.md", "templates/planning/task_plan.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/execution_strategy.md", "templates/planning/execution_strategy.md"]);
    files.push(["docs/09-PLANNING/MODULES/_task-template/visual_roadmap.md", "templates/planning/visual_roadmap.md"]);
  }
  if (capabilities.includes("long-running-task")) {
    files.push(["docs/09-PLANNING/TASKS/_task-template/long-running-task-contract.md", "templates/planning/long-running-task-contract.md"]);
  }
  return files.map(([destination, source]) => [destination, localizedTemplateSource(source, locale)]);
}

export function writeInitFiles(targetInput, capabilities, { dryRun = true, locale = "en-US" } = {}) {
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
  return { target, capabilities: normalizedCapabilities, locale: normalizedLocale, changes, report };
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
