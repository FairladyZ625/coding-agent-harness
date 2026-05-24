import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { builtinPresetRoot, repoRoot, toPosix, userPresetRoot } from "./core-shared.mjs";

const allowedEntrypoints = new Set(["newTask", "plan", "scaffold", "check"]);
const allowedEntrypointTypes = new Set(["template", "script", "check"]);

export function listPresetPackages() {
  const seen = new Set();
  const presets = [];
  for (const root of [userPresetRoot, builtinPresetRoot]) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const id = tryNormalizePresetId(entry.name);
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      presets.push(readPresetPackage(id));
    }
  }
  return presets;
}

export function readPresetPackage(id) {
  const normalizedId = normalizePresetId(id);
  const found = findPresetManifest(normalizedId);
  const manifestPath = found?.manifestPath || "";
  if (!fs.existsSync(manifestPath)) {
    const known = listPresetIds();
    throw new Error(`Invalid task preset: ${id}. Expected one of: ${known.join(", ") || "(none)"}`);
  }
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = parseSimpleYaml(raw);
  const preset = normalizePresetManifest(manifest, { id: normalizedId, manifestPath, raw, source: found.source });
  const report = validatePresetPackage(preset);
  if (report.failures.length) throw new Error(`Invalid preset package ${normalizedId}: ${report.failures.join("; ")}`);
  return preset;
}

export function inspectPresetPackage(id) {
  const preset = fs.existsSync(path.join(path.resolve(id || ""), "preset.yaml")) ? readPresetPackageFromPath(path.resolve(id)) : readPresetPackage(id);
  return publicPresetShape(preset);
}

export function checkPresetPackage(id) {
  const preset = fs.existsSync(path.join(path.resolve(id || ""), "preset.yaml")) ? readPresetPackageFromPath(path.resolve(id)) : readPresetPackage(id);
  const report = validatePresetPackage(preset);
  return {
    id: preset.id,
    version: preset.version,
    status: report.failures.length === 0 ? "pass" : "fail",
    failures: report.failures,
    warnings: report.warnings,
    manifestPath: preset.manifestRelativePath,
    source: preset.source,
    inputs: preset.inputs,
    templateValues: preset.templateValues,
    metadata: preset.metadata,
    entrypoints: preset.entrypoints,
    writeScopes: preset.writeScopes,
  };
}

function readPresetPackageFromPath(directory) {
  const manifestPath = path.join(directory, "preset.yaml");
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = parseSimpleYaml(raw);
  return normalizePresetManifest(manifest, { id: normalizePresetId(manifest.id || path.basename(directory)), manifestPath, raw, source: "local" });
}

export function installPresetPackage(source, { force = false } = {}) {
  if (!source) throw new Error("Missing preset source");
  const sourcePath = resolveInstallSource(source);
  const stagedPreset = readPresetPackageFromPath(sourcePath);
  const stagedReport = validatePresetPackage(stagedPreset);
  if (stagedReport.failures.length) throw new Error(`Invalid preset package ${stagedPreset.id}: ${stagedReport.failures.join("; ")}`);
  const id = stagedPreset.id;
  if (!id) throw new Error("Preset manifest missing id");
  const destination = userPresetDestination(id);
  if (fs.existsSync(destination)) {
    if (!force) throw new Error(`Preset already installed: ${id}. Re-run with --force to overwrite.`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const tempDestination = path.join(path.dirname(destination), `.${id}.install-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`);
  fs.rmSync(tempDestination, { recursive: true, force: true });
  copyDirectory(sourcePath, tempDestination);
  try {
    const tempPreset = readPresetPackageFromPath(tempDestination);
    const tempReport = validatePresetPackage(tempPreset);
    if (tempReport.failures.length) throw new Error(`Invalid preset package ${id}: ${tempReport.failures.join("; ")}`);
    fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(tempDestination, destination);
    const preset = readPresetPackage(id);
    return {
      installed: true,
      id: preset.id,
      version: preset.version,
      source: preset.source,
      destination: toPosix(destination),
      manifestPath: preset.manifestRelativePath,
    };
  } catch (error) {
    fs.rmSync(tempDestination, { recursive: true, force: true });
    throw error;
  }
}

export function uninstallPresetPackage(id) {
  const normalizedId = normalizePresetId(id);
  if (!normalizedId) throw new Error("Missing preset id");
  const destination = userPresetDestination(normalizedId);
  const existed = fs.existsSync(destination);
  if (existed) fs.rmSync(destination, { recursive: true, force: true });
  return { removed: existed, id: normalizedId, destination: toPosix(destination) };
}

export function validatePresetPackage(preset) {
  const failures = [];
  const warnings = [];
  if (!preset.id) failures.push("missing id");
  if (!Number.isInteger(preset.version)) failures.push("missing numeric version");
  if (!preset.compatibleBudgets.length) failures.push("missing compatibleBudgets");
  if (!preset.audit.manifestRequired) failures.push("audit.manifestRequired must be true");
  if (!preset.writeScopes.length) failures.push("missing writeScopes");
  for (const [name, input] of Object.entries(preset.inputs)) {
    if (!["text", "flag", "json-file"].includes(input.type)) failures.push(`${name} has unsupported input type: ${input.type || "(missing)"}`);
    if (!input.flag && input.type !== "flag") warnings.push(`${name} input has no CLI flag`);
  }
  if (preset.evidence?.bundleDir && unsafeRelativePresetPath(preset.evidence.bundleDir)) failures.push(`evidence.bundleDir escapes task directory: ${preset.evidence.bundleDir}`);
  for (const [name, evidence] of Object.entries(preset.evidence?.files || {})) {
    if (evidence.path && unsafeRelativePresetPath(evidence.path)) failures.push(`evidence file ${name} path escapes evidence bundle: ${evidence.path}`);
  }
  for (const [name, entrypoint] of Object.entries(preset.entrypoints)) {
    if (!allowedEntrypoints.has(name)) failures.push(`unsupported entrypoint: ${name}`);
    if (!allowedEntrypointTypes.has(entrypoint.type)) failures.push(`${name} has unsupported type: ${entrypoint.type || "(missing)"}`);
    if (!entrypoint.writes.length) failures.push(`${name} missing write scope manifest`);
    for (const writeScope of entrypoint.writes) {
      if (!preset.writeScopes.some((scope) => scope.path === writeScope)) {
        failures.push(`${name} writes undeclared scope: ${writeScope}`);
      }
    }
    if (["script", "check"].includes(entrypoint.type)) {
      const entryPath = path.join(preset.directory, entrypoint.command || "");
      if (!entrypoint.command) failures.push(`${name} missing command`);
      else if (!isInside(preset.directory, entryPath)) failures.push(`${name} command escapes preset package`);
      else if (!fs.existsSync(entryPath)) failures.push(`${name} command missing: ${entrypoint.command}`);
    }
  }
  for (const templatePath of Object.values(preset.newTaskTemplates)) {
    const absolute = path.join(preset.directory, templatePath);
    if (!isInside(preset.directory, absolute)) failures.push(`template escapes preset package: ${templatePath}`);
    else if (!fs.existsSync(absolute)) failures.push(`template missing: ${templatePath}`);
  }
  return { failures, warnings };
}

export function buildPresetAudit(preset, { taskId = "", targetRoot = "", entrypoint = "newTask", writeScopes = [] } = {}) {
  const entrypoints = {
    [entrypoint]: preset.entrypoints[entrypoint],
  };
  const scopes = writeScopes.length ? writeScopes : preset.entrypoints[entrypoint]?.writes || preset.writeScopes.map((scope) => scope.path);
  return {
    preset: preset.id,
    version: preset.version,
    manifestPath: preset.manifestRelativePath,
    manifestSha256: preset.manifestSha256,
    entrypoints,
    writeScopes: scopes,
    taskId,
    targetRoot,
    generatedAt: new Date().toISOString(),
  };
}

export function renderPresetTemplate(preset, templatePath, values) {
  if (!templatePath) return "";
  const absolute = path.join(preset.directory, templatePath);
  if (!isInside(preset.directory, absolute)) throw new Error(`Preset template escapes package: ${templatePath}`);
  const content = fs.readFileSync(absolute, "utf8");
  return content.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = getValue(values, key);
    return value == null ? "" : String(value);
  });
}

function normalizePresetId(id) {
  const normalized = String(id || "").trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return "";
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(normalized)) {
    throw new Error(`Invalid preset id: ${id}. Use lowercase letters, numbers, and hyphens only.`);
  }
  return normalized;
}

function tryNormalizePresetId(id) {
  try {
    return normalizePresetId(id);
  } catch {
    return "";
  }
}

function userPresetDestination(id) {
  const destination = path.resolve(userPresetRoot, normalizePresetId(id));
  if (!isInside(path.resolve(userPresetRoot), destination) || destination === path.resolve(userPresetRoot)) {
    throw new Error(`Preset destination escapes user preset root: ${id}`);
  }
  return destination;
}

function normalizePresetManifest(manifest, { id, manifestPath, raw, source }) {
  const directory = path.dirname(manifestPath);
  const entrypoints = normalizeEntryPoints(manifest.entrypoints || {});
  const writeScopes = Object.entries(manifest.writeScopes || {}).map(([name, value]) => ({
    name,
    path: String(value.path || value || "").trim(),
    access: String(value.access || "write").trim(),
  })).filter((scope) => scope.path);
  return {
    id: normalizePresetId(manifest.id || id),
    version: Number.parseInt(manifest.version, 10),
    purpose: String(manifest.purpose || ""),
    compatibleBudgets: asArray(manifest.compatibleBudgets),
    localeSupport: asArray(manifest.localeSupport),
    task: manifest.task || {},
    inputs: normalizeInputs(manifest.inputs || {}),
    templateValues: normalizeTemplateValues(manifest.templateValues || {}),
    metadata: normalizeTemplateValues(manifest.metadata || {}),
    entrypoints,
    workbench: manifest.workbench || {},
    evidence: manifest.evidence || {},
    review: manifest.review || {},
    audit: {
      manifestRequired: asBoolean(manifest.audit?.manifestRequired),
      evidenceFiles: asArray(manifest.audit?.evidenceFiles),
    },
    writeScopes,
    newTaskTemplates: manifest.entrypoints?.newTask?.templates || {},
    directory,
    source,
    manifestPath,
    manifestRelativePath: toPosix(path.relative(repoRoot, manifestPath)),
    manifestSha256: crypto.createHash("sha256").update(raw).digest("hex"),
  };
}

function normalizeInputs(rawInputs) {
  return Object.fromEntries(Object.entries(rawInputs || {}).map(([name, value]) => [name, {
    type: String(value.type || "text").trim(),
    flag: String(value.flag || "").trim(),
    required: asBoolean(value.required),
    default: value.default,
    validateOperation: String(value.validateOperation || "").trim(),
    rejectPlanOnly: asBoolean(value.rejectPlanOnly),
    requireTarget: asBoolean(value.requireTarget),
    targetFromSession: asBoolean(value.targetFromSession),
  }]));
}

function normalizeTemplateValues(rawValues) {
  return Object.fromEntries(Object.entries(rawValues || {}).map(([name, value]) => [name, typeof value === "object" && value !== null ? value : { value }]));
}

function normalizeEntryPoints(rawEntryPoints) {
  const result = {};
  for (const [name, value] of Object.entries(rawEntryPoints || {})) {
    result[name] = {
      type: String(value.type || "").trim(),
      command: value.command ? String(value.command).trim() : "",
      templates: value.templates || {},
      writes: asArray(value.writes),
      reads: asArray(value.reads),
      audit: asBoolean(value.audit),
    };
  }
  return result;
}

function publicPresetShape(preset) {
  return {
    id: preset.id,
    version: preset.version,
    purpose: preset.purpose,
    compatibleBudgets: preset.compatibleBudgets,
    localeSupport: preset.localeSupport,
    task: preset.task,
    entrypoints: preset.entrypoints,
    workbench: preset.workbench,
    evidence: preset.evidence,
    review: preset.review,
    audit: preset.audit,
    writeScopes: preset.writeScopes,
    inputs: preset.inputs,
    templateValues: preset.templateValues,
    metadata: preset.metadata,
    source: preset.source,
    manifestPath: preset.manifestRelativePath,
    manifestSha256: preset.manifestSha256,
  };
}

export function parseSimpleYaml(source) {
  const root = {};
  const stack = [{ indent: -1, object: root }];
  for (const rawLine of String(source).split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indent = rawLine.match(/^\s*/)[0].length;
    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) throw new Error(`Unsupported preset YAML line: ${rawLine}`);
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].object;
    const key = match[1];
    const rawValue = match[2] || "";
    if (!rawValue) {
      parent[key] = {};
      stack.push({ indent, object: parent[key] });
    } else {
      parent[key] = parseYamlScalar(rawValue);
    }
  }
  return root;
}

function parseYamlScalar(rawValue) {
  const value = String(rawValue || "").trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (value.startsWith("[") && value.endsWith("]")) {
    const body = value.slice(1, -1).trim();
    if (!body) return [];
    return body.split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, ""));
  }
  return value.replace(/^['"]|['"]$/g, "");
}

function asArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

function asBoolean(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function unsafeRelativePresetPath(value) {
  const raw = String(value || "");
  const normalized = toPosix(path.normalize(raw));
  return path.isAbsolute(raw) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../");
}

function getValue(values, key) {
  return String(key).split(".").reduce((cursor, part) => (cursor && Object.prototype.hasOwnProperty.call(cursor, part) ? cursor[part] : undefined), values);
}

function findPresetManifest(id) {
  const candidates = [
    { source: "user", manifestPath: path.join(userPresetRoot, id, "preset.yaml") },
    { source: "builtin", manifestPath: path.join(builtinPresetRoot, id, "preset.yaml") },
  ];
  return candidates.find((candidate) => fs.existsSync(candidate.manifestPath)) || null;
}

function listPresetIds() {
  const ids = new Set();
  for (const root of [userPresetRoot, builtinPresetRoot]) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  }
  return [...ids].sort();
}

function resolveInstallSource(source) {
  const localPath = path.resolve(source);
  if (fs.existsSync(path.join(localPath, "preset.yaml"))) return localPath;
  const builtinPath = path.join(builtinPresetRoot, normalizePresetId(source));
  if (fs.existsSync(path.join(builtinPath, "preset.yaml"))) return builtinPath;
  throw new Error(`Preset source not found: ${source}`);
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, destinationPath);
  }
}
