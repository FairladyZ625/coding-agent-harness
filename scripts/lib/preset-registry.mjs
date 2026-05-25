import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { builtinPresetRoot, projectPresetRoot, repoRoot, toPosix, userPresetRoot } from "./core-shared.mjs";

const allowedEntrypoints = new Set(["newTask", "plan", "scaffold", "check"]);
const allowedEntrypointTypes = new Set(["template", "script", "check"]);
const allowedEvidenceTypes = new Set(["text", "json", "input-json", "preset-audit", "preset-manifest", "write-scope", "migration-verify", "migration-ledger", "dashboard-hash", "target-git-status", "target-commit", "harness-version", "generated-at"]);

export function listPresetPackages({ targetInput = "" } = {}) {
  const seen = new Set();
  const presets = [];
  for (const { root, source } of presetSearchRoots({ targetInput })) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const id = tryNormalizePresetId(entry.name);
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      presets.push(readPresetPackage(id, { targetInput }));
    }
  }
  return presets;
}

export function readPresetPackage(id, { targetInput = "" } = {}) {
  const normalizedId = normalizePresetId(id);
  const found = findPresetManifest(normalizedId, { targetInput });
  const manifestPath = found?.manifestPath || "";
  if (!fs.existsSync(manifestPath)) {
    const known = listPresetIds({ targetInput });
    throw new Error(`Invalid task preset: ${id}. Expected one of: ${known.join(", ") || "(none)"}`);
  }
  assertPresetDirectory(path.dirname(manifestPath));
  assertPresetManifestFile(path.dirname(manifestPath), manifestPath);
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = parseSimpleYaml(raw);
  const preset = normalizePresetManifest(manifest, { id: normalizedId, manifestPath, raw, source: found.source });
  const report = validatePresetPackage(preset);
  if (report.failures.length) throw new Error(`Invalid preset package ${normalizedId}: ${report.failures.join("; ")}`);
  return preset;
}

export function inspectPresetPackage(id, { targetInput = "" } = {}) {
  const preset = fs.existsSync(path.join(path.resolve(id || ""), "preset.yaml")) ? readPresetPackageFromPath(path.resolve(id)) : readPresetPackage(id, { targetInput });
  return publicPresetShape(preset);
}

export function checkPresetPackage(id, { targetInput = "" } = {}) {
  const preset = fs.existsSync(path.join(path.resolve(id || ""), "preset.yaml")) ? readPresetPackageFromPath(path.resolve(id)) : readPresetPackage(id, { targetInput });
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
    resources: preset.resources,
    context: preset.context,
    entrypoints: preset.entrypoints,
    writeScopes: preset.writeScopes,
  };
}

function readPresetPackageFromPath(directory) {
  const manifestPath = path.join(directory, "preset.yaml");
  assertPresetDirectory(directory);
  assertPresetManifestFile(directory, manifestPath);
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = parseSimpleYaml(raw);
  return normalizePresetManifest(manifest, { id: normalizePresetId(manifest.id || path.basename(directory)), manifestPath, raw, source: "local" });
}

function assertPresetDirectory(directory) {
  if (!fs.existsSync(directory)) throw new Error(`Preset package directory missing: ${toPosix(directory)}`);
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink()) throw new Error(`Preset package directory must not be a symlink: ${toPosix(directory)}`);
  if (!stat.isDirectory()) throw new Error(`Preset package path must be a directory: ${toPosix(directory)}`);
}

function assertPresetManifestFile(directory, manifestPath) {
  if (!fs.existsSync(manifestPath)) throw new Error(`Preset manifest missing: ${displayManifestPath(manifestPath)}`);
  const stat = fs.lstatSync(manifestPath);
  if (stat.isSymbolicLink()) throw new Error(`Preset manifest must not be a symlink: ${displayManifestPath(manifestPath)}`);
  if (!stat.isFile()) throw new Error(`Preset manifest must be a file: ${displayManifestPath(manifestPath)}`);
  const realRoot = fs.realpathSync(directory);
  const realPath = fs.realpathSync(manifestPath);
  if (!isInside(realRoot, realPath)) throw new Error(`Preset manifest real path escapes preset package: ${displayManifestPath(manifestPath)}`);
}

export function installPresetPackage(source, { force = false, scope = "user", targetInput = "." } = {}) {
  if (!source) throw new Error("Missing preset source");
  const sourcePath = resolveInstallSource(source);
  const stagedPreset = readPresetPackageFromPath(sourcePath);
  const stagedReport = validatePresetPackage(stagedPreset);
  if (stagedReport.failures.length) throw new Error(`Invalid preset package ${stagedPreset.id}: ${stagedReport.failures.join("; ")}`);
  const id = stagedPreset.id;
  if (!id) throw new Error("Preset manifest missing id");
  const destination = scope === "project" ? projectPresetDestination(id, targetInput) : userPresetDestination(id);
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
    const preset = readPresetPackage(id, scope === "project" ? { targetInput } : {});
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

export function uninstallPresetPackage(id, { scope = "user", targetInput = "." } = {}) {
  const normalizedId = normalizePresetId(id);
  if (!normalizedId) throw new Error("Missing preset id");
  const destination = scope === "project" ? projectPresetDestination(normalizedId, targetInput) : userPresetDestination(normalizedId);
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
  if (preset.evidence?.files && (Array.isArray(preset.evidence.files) || typeof preset.evidence.files !== "object")) {
    failures.push("evidence.files must be a mapping");
  }
  for (const [name, evidence] of Object.entries(preset.evidence?.files || {})) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      failures.push(`evidence file ${name} must be a mapping`);
      continue;
    }
    if (evidence.path && unsafeRelativePresetPath(evidence.path)) failures.push(`evidence file ${name} path escapes evidence bundle: ${evidence.path}`);
    if (evidence.type && !allowedEvidenceTypes.has(String(evidence.type))) failures.push(`evidence file ${name} has unsupported type: ${evidence.type}`);
  }
  validateAuditEvidenceFiles(preset, failures);
  const resourcePaths = new Set();
  validateResourceCollection(preset, "reference", "references", "references/", resourcePaths, failures);
  validateResourceCollection(preset, "artifact", "artifacts", "artifacts/", resourcePaths, failures);
  const referenceIds = new Set(Object.values(preset.resources?.references || {}).map((resource) => resource.index.id).filter(Boolean));
  for (const requiredRead of preset.context?.requiredReads || []) {
    if (!referenceIds.has(requiredRead)) failures.push(`required read ${requiredRead} does not match a declared reference`);
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
      else validatePresetPackageFile(preset, entrypoint.command, `${name} command`, failures);
    }
  }
  for (const templatePath of Object.values(preset.newTaskTemplates)) {
    const absolute = path.join(preset.directory, templatePath);
    if (!isInside(preset.directory, absolute)) failures.push(`template escapes preset package: ${templatePath}`);
    else validatePresetPackageFile(preset, templatePath, "template", failures);
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

function projectPresetDestination(id, targetInput) {
  const root = path.resolve(projectPresetRoot(targetInput));
  const destination = path.resolve(root, normalizePresetId(id));
  if (!isInside(root, destination) || destination === root) {
    throw new Error(`Preset destination escapes project preset root: ${id}`);
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
    resources: normalizeResources(manifest.resources || {}),
    context: normalizeContext(manifest.context || {}),
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
    manifestRelativePath: displayManifestPath(manifestPath),
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

function normalizeResources(rawResources) {
  return {
    references: normalizeResourceGroup(rawResources.references || {}),
    artifacts: normalizeResourceGroup(rawResources.artifacts || {}),
  };
}

function normalizeResourceGroup(rawGroup) {
  return Object.fromEntries(Object.entries(rawGroup || {}).map(([name, value]) => [name, {
    name,
    path: String(value.path || "").trim(),
    source: String(value.source || "").trim(),
    template: String(value.template || "").trim(),
    index: {
      id: String(value.index?.id || "").trim(),
      type: String(value.index?.type || "").trim(),
      summary: String(value.index?.summary || "").trim(),
      usedBy: String(value.index?.usedBy || "").trim(),
      producedBy: String(value.index?.producedBy || "").trim(),
    },
  }]));
}

function normalizeContext(rawContext) {
  return {
    requiredReads: asArray(rawContext.requiredReads),
  };
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
    resources: preset.resources,
    context: preset.context,
    source: preset.source,
    manifestPath: preset.manifestRelativePath,
    manifestSha256: preset.manifestSha256,
  };
}

function validateResourceCollection(preset, label, groupName, requiredPrefix, resourcePaths, failures) {
  const seen = new Set();
  for (const [name, resource] of Object.entries(preset.resources?.[groupName] || {})) {
    const normalizedPath = toPosix(path.normalize(resource.path || ""));
    if (!resource.path) failures.push(`${label} resource ${name} missing path`);
    else if (hasMarkdownTableDelimiter(resource.path)) failures.push(`${label} resource ${name} path cannot contain Markdown table delimiters: ${resource.path}`);
    else if (unsafeRelativePresetPath(resource.path)) failures.push(`resource ${name} path escapes task directory: ${resource.path}`);
    else if (String(resource.path).endsWith("/") || String(resource.path).endsWith("\\") || normalizedPath.endsWith("/")) {
      failures.push(`${label} resource ${name} path must be a file under ${requiredPrefix}: ${resource.path}`);
    }
    else if (!normalizedPath.startsWith(requiredPrefix) || normalizedPath === requiredPrefix.slice(0, -1) || normalizedPath === `${requiredPrefix}INDEX.md`) {
      failures.push(`${label} resource ${name} path must be under ${requiredPrefix}: ${resource.path}`);
    } else if (resourcePaths.has(normalizedPath)) {
      failures.push(`duplicate resource path: ${normalizedPath}`);
    } else {
      resourcePaths.add(normalizedPath);
    }
    if (!resource.source && !resource.template) failures.push(`${label} resource ${name} missing source or template`);
    if (resource.source && resource.template) failures.push(`${label} resource ${name} cannot declare both source and template`);
    for (const field of ["source", "template"]) {
      if (!resource[field]) continue;
      const resourcePath = path.join(preset.directory, resource[field]);
      if (!isInside(preset.directory, resourcePath)) failures.push(`${label} resource ${name} ${field} escapes preset package`);
      else validatePresetPackageFile(preset, resource[field], `${label} resource ${name} ${field}`, failures);
    }
    const id = resource.index?.id || "";
    if (!id) failures.push(`${label} resource ${name} missing index.id`);
    if (id && hasMarkdownTableDelimiter(id)) failures.push(`${label} resource ${name} index.id cannot contain Markdown table delimiters: ${id}`);
    if (id && seen.has(id)) failures.push(`duplicate ${label} resource id: ${id}`);
    if (id) seen.add(id);
  }
}

function validateAuditEvidenceFiles(preset, failures) {
  const seen = new Set();
  for (const name of preset.audit?.evidenceFiles || []) {
    const raw = String(name || "").trim();
    const normalized = toPosix(path.normalize(raw));
    if (!raw) failures.push("audit evidence file name is empty");
    else if (hasMarkdownTableDelimiter(raw)) failures.push(`audit evidence file cannot contain Markdown table delimiters: ${raw}`);
    else if (unsafeRelativePresetPath(raw) || raw.includes("/") || raw.includes("\\") || normalized !== path.basename(normalized)) {
      failures.push(`audit evidence file must be a basename within evidence bundle: ${raw}`);
    } else if (seen.has(normalized)) {
      failures.push(`duplicate audit evidence file: ${normalized}`);
    } else {
      seen.add(normalized);
    }
  }
}

function validatePresetPackageFile(preset, relativePath, label, failures) {
  const filePath = path.join(preset.directory, relativePath || "");
  if (!isInside(preset.directory, filePath)) {
    failures.push(`${label} escapes preset package`);
    return;
  }
  if (!fs.existsSync(filePath)) {
    failures.push(`${label} missing: ${relativePath}`);
    return;
  }
  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink()) {
    failures.push(`${label} must not be a symlink: ${relativePath}`);
    return;
  }
  if (!stat.isFile()) {
    failures.push(`${label} must be a file: ${relativePath}`);
    return;
  }
  const realRoot = fs.realpathSync(preset.directory);
  const realPath = fs.realpathSync(filePath);
  if (!isInside(realRoot, realPath)) failures.push(`${label} real path escapes preset package: ${relativePath}`);
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

function hasMarkdownTableDelimiter(value) {
  return /[|\r\n]/.test(String(value || ""));
}

function getValue(values, key) {
  return String(key).split(".").reduce((cursor, part) => (cursor && Object.prototype.hasOwnProperty.call(cursor, part) ? cursor[part] : undefined), values);
}

function displayManifestPath(manifestPath) {
  const relative = path.relative(repoRoot, manifestPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return toPosix(relative);
  return toPosix(manifestPath);
}

function findPresetManifest(id, { targetInput = "" } = {}) {
  const candidates = presetSearchRoots({ targetInput }).map(({ source, root }) => ({ source, manifestPath: path.join(root, id, "preset.yaml") }));
  return candidates.find((candidate) => fs.existsSync(candidate.manifestPath)) || null;
}

function listPresetIds({ targetInput = "" } = {}) {
  const ids = new Set();
  for (const { root } of presetSearchRoots({ targetInput })) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  }
  return [...ids].sort();
}

function presetSearchRoots({ targetInput = "" } = {}) {
  const roots = [];
  if (targetInput) roots.push({ source: "project", root: projectPresetRoot(targetInput) });
  roots.push({ source: "user", root: userPresetRoot });
  roots.push({ source: "builtin", root: builtinPresetRoot });
  return roots;
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
