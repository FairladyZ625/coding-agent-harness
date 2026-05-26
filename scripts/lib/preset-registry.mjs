import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { builtinPresetRoot, projectPresetRoot, repoRoot, toPosix, userPresetRoot, userPresetRootForHome } from "./core-shared.mjs";

const allowedEntrypoints = new Set(["newTask", "plan", "scaffold", "check"]);
const allowedEntrypointTypes = new Set(["template", "script", "check"]);
const allowedEvidenceTypes = new Set(["text", "json", "input-json", "preset-audit", "preset-manifest", "write-scope", "migration-verify", "migration-ledger", "dashboard-hash", "target-git-status", "target-commit", "harness-version", "generated-at"]);
const allowedNewTaskTemplateKeys = new Set(["taskPlanAppend", "executionStrategyAppend", "visualMapAppend", "findingsSeed", "reviewSeed", "prompt"]);
const maxPresetArchiveBytes = 25 * 1024 * 1024;
const maxPresetArchiveUncompressedBytes = 50 * 1024 * 1024;
const maxPresetArchiveEntries = 500;

export function listPresetPackages({ targetInput = "", home = "" } = {}) {
  return listPresetPackageLayers({ targetInput, home }).filter((preset) => preset.effective);
}

export function listPresetPackageLayers({ targetInput = "", home = "" } = {}) {
  const effectiveIds = new Set();
  const presets = [];
  for (const { root, source } of presetSearchRoots({ targetInput, home })) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const id = tryNormalizePresetId(entry.name);
      if (!id) continue;
      const preset = readPresetPackageFromPath(path.join(root, id), source);
      const effective = !effectiveIds.has(preset.id);
      if (effective) effectiveIds.add(preset.id);
      presets.push({ ...preset, effective });
    }
  }
  return presets;
}

export function readPresetPackage(id, { targetInput = "", home = "" } = {}) {
  const normalizedId = normalizePresetId(id);
  const found = findPresetManifest(normalizedId, { targetInput, home });
  const manifestPath = found?.manifestPath || "";
  if (!fs.existsSync(manifestPath)) {
    const known = listPresetIds({ targetInput, home });
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

export function inspectPresetPackage(id, { targetInput = "", home = "" } = {}) {
  const preset = fs.existsSync(path.join(path.resolve(id || ""), "preset.yaml")) ? readPresetPackageFromPath(path.resolve(id)) : readPresetPackage(id, { targetInput, home });
  return publicPresetShape(preset);
}

export function checkPresetPackage(id, { targetInput = "", home = "" } = {}) {
  const preset = fs.existsSync(path.join(path.resolve(id || ""), "preset.yaml")) ? readPresetPackageFromPath(path.resolve(id)) : readPresetPackage(id, { targetInput, home });
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

function readPresetPackageFromPath(directory, source = "local") {
  const manifestPath = path.join(directory, "preset.yaml");
  assertPresetDirectory(directory);
  assertPresetManifestFile(directory, manifestPath);
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = parseSimpleYaml(raw);
  return normalizePresetManifest(manifest, { id: normalizePresetId(manifest.id || path.basename(directory)), manifestPath, raw, source });
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

export function installPresetPackage(source, { force = false, scope = "user", targetInput = ".", home = "" } = {}) {
  if (!source) throw new Error("Missing preset source");
  const resolvedSource = resolveInstallSource(source);
  try {
    const sourcePath = resolvedSource.path;
    const stagedPreset = readPresetPackageFromPath(sourcePath);
    const stagedReport = validatePresetPackage(stagedPreset);
    if (stagedReport.failures.length) throw new Error(`Invalid preset package ${stagedPreset.id}: ${stagedReport.failures.join("; ")}`);
    const id = stagedPreset.id;
    if (!id) throw new Error("Preset manifest missing id");
    const destination = scope === "project" ? projectPresetDestination(id, targetInput) : userPresetDestination(id, { home });
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
      const preset = readPresetPackage(id, scope === "project" ? { targetInput, home } : { home });
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
  } finally {
    resolvedSource.cleanup();
  }
}

export function uninstallPresetPackage(id, { scope = "user", targetInput = ".", home = "" } = {}) {
  const normalizedId = normalizePresetId(id);
  if (!normalizedId) throw new Error("Missing preset id");
  const destination = scope === "project" ? projectPresetDestination(normalizedId, targetInput) : userPresetDestination(normalizedId, { home });
  const existed = fs.existsSync(destination);
  if (existed) fs.rmSync(destination, { recursive: true, force: true });
  return { removed: existed, id: normalizedId, destination: toPosix(destination) };
}

export function listBundledPresetIds() {
  if (!fs.existsSync(builtinPresetRoot)) return [];
  return fs.readdirSync(builtinPresetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => tryNormalizePresetId(entry.name))
    .filter(Boolean)
    .filter((id) => fs.existsSync(path.join(builtinPresetRoot, id, "preset.yaml")))
    .sort();
}

export function seedBundledPresets({ force = false, scope = "user", targetInput = ".", home = "", dryRun = false } = {}) {
  const presets = listBundledPresetIds().map((id) => {
    const sourcePath = path.join(builtinPresetRoot, id);
    const stagedPreset = readPresetPackageFromPath(sourcePath);
    const destination = scope === "project" ? projectPresetDestination(stagedPreset.id, targetInput) : userPresetDestination(stagedPreset.id, { home });
    const existsAlready = fs.existsSync(destination);
    const action = existsAlready ? (force ? (dryRun ? "would-overwrite" : "overwrite") : "skip-existing") : dryRun ? "would-create" : "create";
    if (!dryRun && (!existsAlready || force)) copyPresetPackage(sourcePath, destination, stagedPreset.id);
    return {
      id: stagedPreset.id,
      version: stagedPreset.version,
      source: "builtin",
      destination: toPosix(destination),
      action,
    };
  });
  return {
    operation: "preset-seed",
    scope,
    target: scope === "project" ? toPosix(projectPresetRoot(targetInput)) : toPosix(userPresetRootForHome(home)),
    dryRun,
    force,
    presets,
    created: presets.filter((preset) => ["create", "would-create"].includes(preset.action)).length,
    overwritten: presets.filter((preset) => ["overwrite", "would-overwrite"].includes(preset.action)).length,
    skipped: presets.filter((preset) => preset.action === "skip-existing").length,
  };
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
  for (const [templateKey, templatePath] of Object.entries(preset.newTaskTemplates)) {
    if (!allowedNewTaskTemplateKeys.has(templateKey)) {
      failures.push(`unsupported newTask template: ${templateKey}`);
      continue;
    }
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

function userPresetDestination(id, { home = "" } = {}) {
  const root = home ? userPresetRootForHome(home) : userPresetRoot;
  const destination = path.resolve(root, normalizePresetId(id));
  if (!isInside(path.resolve(root), destination) || destination === path.resolve(root)) {
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

function findPresetManifest(id, { targetInput = "", home = "" } = {}) {
  const candidates = presetSearchRoots({ targetInput, home }).map(({ source, root }) => ({ source, manifestPath: path.join(root, id, "preset.yaml") }));
  return candidates.find((candidate) => fs.existsSync(candidate.manifestPath)) || null;
}

function listPresetIds({ targetInput = "", home = "" } = {}) {
  const ids = new Set();
  for (const { root } of presetSearchRoots({ targetInput, home })) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  }
  return [...ids].sort();
}

function presetSearchRoots({ targetInput = "", home = "" } = {}) {
  const roots = [];
  if (targetInput) roots.push({ source: "project", root: projectPresetRoot(targetInput) });
  roots.push({ source: "user", root: home ? userPresetRootForHome(home) : userPresetRoot });
  roots.push({ source: "builtin", root: builtinPresetRoot });
  return roots;
}

function resolveInstallSource(source) {
  const localPath = path.resolve(source);
  if (fs.existsSync(path.join(localPath, "preset.yaml"))) return { path: localPath, cleanup: () => {} };
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    if (!localPath.toLowerCase().endsWith(".zip")) throw new Error(`Preset source file must be a .zip archive: ${toPosix(localPath)}`);
    return resolveZipInstallSource(localPath);
  }
  const builtinPath = path.join(builtinPresetRoot, normalizePresetId(source));
  if (fs.existsSync(path.join(builtinPath, "preset.yaml"))) return { path: builtinPath, cleanup: () => {} };
  throw new Error(`Preset source not found: ${source}`);
}

function resolveZipInstallSource(sourcePath) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-preset-archive-"));
  try {
    extractPresetZip(sourcePath, tempRoot);
    return {
      path: presetRootFromExtractedArchive(tempRoot),
      cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function presetRootFromExtractedArchive(tempRoot) {
  if (fs.existsSync(path.join(tempRoot, "preset.yaml"))) return tempRoot;
  const children = fs.readdirSync(tempRoot, { withFileTypes: true })
    .filter((entry) => entry.name !== "__MACOSX" && entry.name !== ".DS_Store");
  const presetDirs = children
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(tempRoot, entry.name))
    .filter((directory) => fs.existsSync(path.join(directory, "preset.yaml")));
  if (presetDirs.length === 1) return presetDirs[0];
  throw new Error("Preset archive must contain preset.yaml at the archive root or inside one top-level directory.");
}

function extractPresetZip(sourcePath, destinationRoot) {
  const archiveStat = fs.statSync(sourcePath);
  if (archiveStat.size > maxPresetArchiveBytes) throw new Error("Preset archive file is too large.");
  const archive = fs.readFileSync(sourcePath);
  const eocdOffset = findZipEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(eocdOffset + 10);
  const centralSize = archive.readUInt32LE(eocdOffset + 12);
  const centralOffset = archive.readUInt32LE(eocdOffset + 16);
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error("Zip64 preset archives are not supported.");
  }
  if (entryCount > maxPresetArchiveEntries) throw new Error(`Preset archive has too many entries: ${entryCount}`);
  if (centralOffset + centralSize > archive.length) throw new Error("Invalid preset archive central directory.");
  const written = new Set();
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error("Invalid preset archive central directory entry.");
    const flags = archive.readUInt16LE(cursor + 8);
    const method = archive.readUInt16LE(cursor + 10);
    const compressedSize = archive.readUInt32LE(cursor + 20);
    const uncompressedSize = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const externalAttributes = archive.readUInt32LE(cursor + 38);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const rawName = archive.slice(cursor + 46, cursor + 46 + nameLength).toString(flags & 0x0800 ? "utf8" : "utf8");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (shouldSkipZipEntry(rawName)) continue;
    if (flags & 0x0001) throw new Error(`Encrypted preset archive entries are not supported: ${rawName}`);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported preset archive compression method ${method}: ${rawName}`);
    const mode = (externalAttributes >>> 16) & 0o170000;
    if (mode === 0o120000) throw new Error(`Preset archive must not contain symlinks: ${rawName}`);
    const entryName = safeZipEntryName(rawName);
    if (!entryName) continue;
    if (entryName.endsWith("/")) {
      fs.mkdirSync(path.join(destinationRoot, entryName), { recursive: true });
      continue;
    }
    if (written.has(entryName)) throw new Error(`Preset archive contains duplicate entry: ${entryName}`);
    if (uncompressedSize > maxPresetArchiveUncompressedBytes - totalUncompressed) throw new Error("Preset archive is too large.");
    const data = readZipEntryData(archive, { localOffset, compressedSize, uncompressedSize, method, name: entryName });
    totalUncompressed += data.length;
    const destination = path.resolve(destinationRoot, entryName);
    if (!isInside(path.resolve(destinationRoot), destination)) throw new Error(`Preset archive entry escapes extraction root: ${rawName}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);
    written.add(entryName);
  }
}

function findZipEndOfCentralDirectory(archive) {
  const minOffset = Math.max(0, archive.length - 22 - 65535);
  for (let offset = archive.length - 22; offset >= minOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid preset zip archive: end of central directory not found.");
}

function readZipEntryData(archive, { localOffset, compressedSize, uncompressedSize, method, name }) {
  if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`Invalid preset archive local header: ${name}`);
  }
  const localNameLength = archive.readUInt16LE(localOffset + 26);
  const localExtraLength = archive.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > archive.length) throw new Error(`Invalid preset archive entry size: ${name}`);
  const compressed = archive.slice(dataStart, dataEnd);
  let data;
  try {
    data = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: uncompressedSize });
  } catch (error) {
    throw new Error(`Preset archive entry could not be decompressed within its declared size: ${name}`);
  }
  if (data.length !== uncompressedSize) throw new Error(`Preset archive entry size mismatch: ${name}`);
  return data;
}

function shouldSkipZipEntry(rawName) {
  const normalized = String(rawName || "").replace(/\\/g, "/");
  return normalized === "__MACOSX/" || normalized.startsWith("__MACOSX/") || normalized.endsWith("/.DS_Store") || normalized === ".DS_Store";
}

function safeZipEntryName(rawName) {
  if (String(rawName).includes("\0")) throw new Error("Preset archive entry contains NUL byte.");
  const withSlashes = String(rawName || "").replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(withSlashes) || withSlashes.startsWith("/")) {
    throw new Error(`Preset archive entry must be relative: ${rawName}`);
  }
  const normalized = path.posix.normalize(withSlashes);
  if (normalized === "." || normalized === "") return "";
  if (normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Preset archive entry escapes extraction root: ${rawName}`);
  }
  return withSlashes.endsWith("/") ? `${normalized}/` : normalized;
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

function copyPresetPackage(sourcePath, destination, id) {
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
  } catch (error) {
    fs.rmSync(tempDestination, { recursive: true, force: true });
    throw error;
  }
}
