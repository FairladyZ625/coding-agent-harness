import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { repoRoot, toPosix } from "./core-shared.mjs";

const presetRoot = path.join(repoRoot, "presets");
const allowedEntrypoints = new Set(["newTask", "plan", "scaffold", "check"]);
const allowedEntrypointTypes = new Set(["template", "script", "check"]);

export function listPresetPackages() {
  if (!fs.existsSync(presetRoot)) return [];
  return fs.readdirSync(presetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readPresetPackage(entry.name));
}

export function readPresetPackage(id) {
  const normalizedId = normalizePresetId(id);
  const manifestPath = path.join(presetRoot, normalizedId, "preset.yaml");
  if (!fs.existsSync(manifestPath)) {
    const known = listPresetIds();
    throw new Error(`Invalid task preset: ${id}. Expected one of: ${known.join(", ") || "(none)"}`);
  }
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = parseSimpleYaml(raw);
  const preset = normalizePresetManifest(manifest, { id: normalizedId, manifestPath, raw });
  const report = validatePresetPackage(preset);
  if (report.failures.length) throw new Error(`Invalid preset package ${normalizedId}: ${report.failures.join("; ")}`);
  return preset;
}

export function inspectPresetPackage(id) {
  const preset = readPresetPackage(id);
  return publicPresetShape(preset);
}

export function checkPresetPackage(id) {
  const preset = readPresetPackage(id);
  const report = validatePresetPackage(preset);
  return {
    id: preset.id,
    version: preset.version,
    status: report.failures.length === 0 ? "pass" : "fail",
    failures: report.failures,
    warnings: report.warnings,
    manifestPath: preset.manifestRelativePath,
    entrypoints: preset.entrypoints,
    writeScopes: preset.writeScopes,
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
  return String(id || "").trim().toLowerCase().replaceAll("_", "-");
}

function listPresetIds() {
  if (!fs.existsSync(presetRoot)) return [];
  return fs.readdirSync(presetRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function normalizePresetManifest(manifest, { id, manifestPath, raw }) {
  const directory = path.dirname(manifestPath);
  const entrypoints = normalizeEntryPoints(manifest.entrypoints || {});
  const writeScopes = Object.entries(manifest.writeScopes || {}).map(([name, value]) => ({
    name,
    path: String(value.path || value || "").trim(),
    access: String(value.access || "write").trim(),
  })).filter((scope) => scope.path);
  return {
    id: String(manifest.id || id),
    version: Number.parseInt(manifest.version, 10),
    purpose: String(manifest.purpose || ""),
    compatibleBudgets: asArray(manifest.compatibleBudgets),
    localeSupport: asArray(manifest.localeSupport),
    task: manifest.task || {},
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
    manifestPath,
    manifestRelativePath: toPosix(path.relative(repoRoot, manifestPath)),
    manifestSha256: crypto.createHash("sha256").update(raw).digest("hex"),
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
    manifestPath: preset.manifestRelativePath,
    manifestSha256: preset.manifestSha256,
  };
}

function parseSimpleYaml(source) {
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

function getValue(values, key) {
  return String(key).split(".").reduce((cursor, part) => (cursor && Object.prototype.hasOwnProperty.call(cursor, part) ? cursor[part] : undefined), values);
}
