// Preset manifest parsing stays behavior-first until preset package domain types are modeled.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { builtinPresetRoot, projectPresetRoot, readJsonSafe, repoRoot, renderHarnessTemplate, toPosix, validateHarnessPathTemplateTokens, userPresetRoot, userPresetRootForHome } from "./core-shared.mjs";
import type {
  PresetEntrypoint,
  PresetAction,
  PresetEvidenceFile,
  PresetInputDeclaration,
  PresetInstallOptions,
  PresetManifest,
  PresetManifestLocation,
  PresetOptions,
  PresetPackage,
  PresetResource,
  PresetSource,
  PresetTemplateDeclaration,
  PresetWriteScope,
  ZipEntryDataOptions,
} from "./types/preset.js";

const allowedEntrypoints = new Set(["newTask", "plan", "scaffold", "check"]);
const allowedEntrypointTypes = new Set(["template", "script", "check"]);
const allowedActionTypes = new Set(["script"]);
const allowedEvidenceTypes = new Set(["text", "json", "input-json", "preset-audit", "preset-manifest", "write-scope", "migration-verify", "migration-ledger", "dashboard-hash", "target-git-status", "target-commit", "harness-version", "generated-at"]);
const allowedNewTaskTemplateKeys = new Set(["taskPlanAppend", "executionStrategyAppend", "visualMapAppend", "findingsSeed", "reviewSeed", "prompt"]);
const maxPresetArchiveBytes = 25 * 1024 * 1024;
const maxPresetArchiveUncompressedBytes = 50 * 1024 * 1024;
const maxPresetArchiveEntries = 500;
const presetScriptTrustFile = ".harness-preset-trust.json";

export function listPresetPackages({ targetInput = "", home = "" }: PresetOptions = {}) {
  return listPresetPackageLayers({ targetInput, home }).filter((preset) => preset.effective);
}

export function listPresetPackageLayers({ targetInput = "", home = "" }: PresetOptions = {}): PresetPackage[] {
  const effectiveIds = new Set<string>();
  const presets: PresetPackage[] = [];
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

export function readPresetPackage(id: string, { targetInput = "", home = "" }: PresetOptions = {}): PresetPackage {
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
  const source = found?.source || "local";
  const preset = normalizePresetManifest(manifest, { id: normalizedId, manifestPath, raw, source });
  const report = validatePresetPackage(preset);
  if (report.failures.length) throw new Error(`Invalid preset package ${normalizedId}: ${report.failures.join("; ")}`);
  return preset;
}

export function inspectPresetPackage(id: string, { targetInput = "", home = "" }: PresetOptions = {}) {
  const localPath = path.resolve(id || "");
  const preset = fs.existsSync(path.join(localPath, "preset.yaml")) ? readPresetPackageFromPath(localPath) : readPresetPackage(id, { targetInput, home });
  return publicPresetShape(preset);
}

export function checkPresetPackage(id: string, { targetInput = "", home = "" }: PresetOptions = {}) {
  const localPath = path.resolve(id || "");
  const preset = fs.existsSync(path.join(localPath, "preset.yaml")) ? readPresetPackageFromPath(localPath) : readPresetPackage(id, { targetInput, home });
  const scriptPolicy = buildPresetScriptPolicy(preset);
  const report = validatePresetPackage(preset);
  return {
    id: preset.id,
    version: preset.version,
    status: report.failures.length === 0 ? "pass" : "fail",
    failures: report.failures,
    warnings: [...report.warnings, ...scriptPolicy.warnings],
    manifestPath: preset.manifestRelativePath,
    source: preset.source,
    inputs: preset.inputs,
    templateValues: preset.templateValues,
    metadata: preset.metadata,
    resources: preset.resources,
    context: preset.context,
    entrypoints: preset.entrypoints,
    actions: preset.actions,
    scriptPolicy,
    writeScopes: preset.writeScopes,
  };
}

function readPresetPackageFromPath(directory: string, source: PresetSource = "local"): PresetPackage {
  const manifestPath = path.join(directory, "preset.yaml");
  assertPresetDirectory(directory);
  assertPresetManifestFile(directory, manifestPath);
  const raw = fs.readFileSync(manifestPath, "utf8");
  const manifest = parseSimpleYaml(raw);
  const manifestRecord = asRecord(manifest);
  return normalizePresetManifest(manifest, { id: normalizePresetId(String(manifestRecord.id || path.basename(directory))), manifestPath, raw, source });
}

function assertPresetDirectory(directory: string): void {
  if (!fs.existsSync(directory)) throw new Error(`Preset package directory missing: ${toPosix(directory)}`);
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink()) throw new Error(`Preset package directory must not be a symlink: ${toPosix(directory)}`);
  if (!stat.isDirectory()) throw new Error(`Preset package path must be a directory: ${toPosix(directory)}`);
}

function assertPresetManifestFile(directory: string, manifestPath: string): void {
  if (!fs.existsSync(manifestPath)) throw new Error(`Preset manifest missing: ${displayManifestPath(manifestPath)}`);
  const stat = fs.lstatSync(manifestPath);
  if (stat.isSymbolicLink()) throw new Error(`Preset manifest must not be a symlink: ${displayManifestPath(manifestPath)}`);
  if (!stat.isFile()) throw new Error(`Preset manifest must be a file: ${displayManifestPath(manifestPath)}`);
  const realRoot = fs.realpathSync(directory);
  const realPath = fs.realpathSync(manifestPath);
  if (!isInside(realRoot, realPath)) throw new Error(`Preset manifest real path escapes preset package: ${displayManifestPath(manifestPath)}`);
}

export function installPresetPackage(source: string, { force = false, scope = "user", targetInput = ".", home = "", allowScripts = false }: PresetInstallOptions = {}) {
  if (!source) throw new Error("Missing preset source");
  const resolvedSource = resolveInstallSource(source);
  try {
    const sourcePath = resolvedSource.path;
    const stagedPreset = readPresetPackageFromPath(sourcePath);
    const stagedReport = validatePresetPackage(stagedPreset);
    if (stagedReport.failures.length) throw new Error(`Invalid preset package ${stagedPreset.id}: ${stagedReport.failures.join("; ")}`);
    const scriptPolicy = buildPresetScriptPolicy(stagedPreset);
    if (resolvedSource.source !== "builtin" && scriptPolicy.requiresTrustedSource && !allowScripts) {
      throw new Error(`Preset ${stagedPreset.id} declares script actions and requires explicit trust. Re-run with --allow-scripts if you trust this preset source.`);
    }
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
      if (scriptPolicy.requiresTrustedSource && allowScripts) {
        writePresetScriptTrustMarker(destination, stagedPreset, scriptPolicy.scriptCommands);
      }
      const preset = readPresetPackage(id, scope === "project" ? { targetInput, home } : { home });
      return {
        installed: true,
        id: preset.id,
        version: preset.version,
        source: preset.source,
        destination: toPosix(destination),
        manifestPath: preset.manifestRelativePath,
        scriptPolicy: {
          ...buildPresetScriptPolicy(preset),
          trusted: presetScriptTrustValid(preset),
        },
      };
    } catch (error) {
      fs.rmSync(tempDestination, { recursive: true, force: true });
      throw error;
    }
  } finally {
    resolvedSource.cleanup();
  }
}

export function uninstallPresetPackage(id: string, { scope = "user", targetInput = ".", home = "" }: PresetInstallOptions = {}) {
  const normalizedId = normalizePresetId(id);
  if (!normalizedId) throw new Error("Missing preset id");
  const destination = scope === "project" ? projectPresetDestination(normalizedId, targetInput) : userPresetDestination(normalizedId, { home });
  const existed = fs.existsSync(destination);
  if (existed) fs.rmSync(destination, { recursive: true, force: true });
  return { removed: existed, id: normalizedId, destination: toPosix(destination) };
}

export function listBundledPresetIds(): string[] {
  if (!fs.existsSync(builtinPresetRoot)) return [];
  return fs.readdirSync(builtinPresetRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => tryNormalizePresetId(entry.name))
    .filter((id): id is string => Boolean(id))
    .filter((id) => fs.existsSync(path.join(builtinPresetRoot, id, "preset.yaml")))
    .sort();
}

export function seedBundledPresets({ force = false, scope = "user", targetInput = ".", home = "", dryRun = false }: PresetInstallOptions = {}) {
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

export function auditBundledPresetDrift({ scope = "user", targetInput = ".", home = "" }: PresetInstallOptions = {}) {
  const targetRoot = scope === "project" ? projectPresetRoot(targetInput) : userPresetRootForHome(home);
  const presets = listBundledPresetIds().map((id) => {
    const builtin = readPresetPackageFromPath(path.join(builtinPresetRoot, id), "builtin");
    const installedPath = path.join(targetRoot, id, "preset.yaml");
    const installed = fs.existsSync(installedPath) ? readPresetPackageFromPath(path.dirname(installedPath), scope) : null;
    const sameHash = Boolean(installed && installed.manifestSha256 === builtin.manifestSha256);
    const sameVersion = Boolean(installed && installed.version === builtin.version);
    const sameVersionDifferentHash = Boolean(installed && sameVersion && !sameHash);
    const action = !installed
      ? "install-available"
      : sameHash
        ? "up-to-date"
        : installed.source === "project" || installed.source === "user"
          ? "manual-review"
          : "upgrade-available";
    return {
      id,
      scope,
      source: installed ? installed.source : "missing",
      effective: installed ? true : false,
      builtinVersion: builtin.version,
      installedVersion: installed?.version || null,
      builtinSha256: builtin.manifestSha256,
      installedSha256: installed?.manifestSha256 || null,
      sameVersionDifferentHash,
      upgradeAction: action,
      installedPath: installed ? installed.manifestRelativePath : toPosix(installedPath),
    };
  });
  return {
    operation: "preset-audit",
    scope,
    target: toPosix(targetRoot),
    presets,
    stale: presets.filter((preset) => preset.upgradeAction !== "up-to-date").length,
  };
}

export function validatePresetPackage(preset: PresetPackage): { failures: string[]; warnings: string[] } {
  const failures: string[] = [];
  const warnings: string[] = [];
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
  const evidenceFiles = typeof preset.evidence?.files === "object" && preset.evidence.files !== null ? preset.evidence.files : {};
  for (const [name, evidence] of Object.entries(evidenceFiles)) {
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      failures.push(`evidence file ${name} must be a mapping`);
      continue;
    }
    if (evidence.path && unsafeRelativePresetPath(evidence.path)) failures.push(`evidence file ${name} path escapes evidence bundle: ${evidence.path}`);
    if (evidence.type && !allowedEvidenceTypes.has(String(evidence.type))) failures.push(`evidence file ${name} has unsupported type: ${evidence.type}`);
  }
  validateAuditEvidenceFiles(preset, failures);
  const resourcePaths = new Set<string>();
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
      failures.push(...validateHarnessPathTemplateTokens(writeScope, `${name} write scope`));
      if (!preset.writeScopes.some((scope) => scope.path === writeScope)) {
        failures.push(`${name} writes undeclared scope: ${writeScope}`);
      }
      if (name === "newTask" && !newTaskWriteScopeAllowed(writeScope)) {
        failures.push("newTask entrypoint writes must stay under coding-agent-harness/planning/**");
      }
    }
    if (["script", "check"].includes(entrypoint.type)) {
      const entryPath = path.join(preset.directory, entrypoint.command || "");
      if (!entrypoint.command) failures.push(`${name} missing command`);
      else if (!isInside(preset.directory, entryPath)) failures.push(`${name} command escapes preset package`);
      else {
        validatePresetPackageFile(preset, entrypoint.command, `${name} command`, failures);
        warnOnRuntimePathLiterals(entryPath, `${name} command`, warnings);
      }
    }
    for (const readScope of entrypoint.reads || []) failures.push(...validateHarnessPathTemplateTokens(readScope, `${name} read scope`));
  }
  for (const [name, action] of Object.entries(preset.actions || {})) {
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(name)) failures.push(`unsupported action id: ${name}`);
    if (!allowedActionTypes.has(action.type)) failures.push(`${name} action has unsupported type: ${action.type || "(missing)"}`);
    if (action.taskRequired !== true) failures.push(`${name} action must set taskRequired: true`);
    if (!action.writes.length) failures.push(`${name} action missing write scope manifest`);
    for (const [inputName, input] of Object.entries(action.inputs || {})) {
      if (!["text", "flag", "json-file"].includes(input.type)) failures.push(`${name}.${inputName} has unsupported input type: ${input.type || "(missing)"}`);
      if (!input.flag) failures.push(`${name}.${inputName} input missing CLI flag`);
      else if (!input.flag.startsWith("--")) failures.push(`${name}.${inputName} input flag must start with --`);
    }
    for (const writeScope of action.writes) {
      failures.push(...validateActionPathTemplateTokens(writeScope, `${name} action write scope`));
      if (isBroadTaskRootScope(writeScope)) failures.push(`${name} action writes must be task-local; avoid broad task-root scope: ${writeScope}`);
      if (!usesTaskLocalPath(writeScope)) warnings.push(`${name} action write scope is not task-local: ${writeScope}`);
    }
    for (const readScope of action.reads || []) failures.push(...validateActionPathTemplateTokens(readScope, `${name} action read scope`));
    if (action.type === "script") {
      const actionPath = path.join(preset.directory, action.command || "");
      if (!action.command) failures.push(`${name} action missing command`);
      else if (!action.command.endsWith(".mjs")) failures.push(`${name} action command must be a .mjs file: ${action.command}`);
      else if (!isInside(preset.directory, actionPath)) failures.push(`${name} action command escapes preset package`);
      else {
        validatePresetPackageFile(preset, action.command, `${name} action command`, failures);
        warnOnRuntimePathLiterals(actionPath, `${name} action command`, warnings);
      }
    }
  }
  for (const scope of preset.writeScopes) failures.push(...validateHarnessPathTemplateTokens(scope.path, `${scope.name || "write scope"} path`));
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

export function buildPresetAudit(preset: PresetPackage, { taskId = "", targetRoot = "", entrypoint = "newTask", writeScopes = [], resolvedInputs = {} }: {
  taskId?: string;
  targetRoot?: string;
  entrypoint?: string;
  writeScopes?: string[];
  resolvedInputs?: Record<string, unknown>;
} = {}) {
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
    resolvedInputs,
    taskId,
    targetRoot,
    generatedAt: new Date().toISOString(),
  };
}

export function buildPresetScriptPolicy(preset: PresetPackage) {
  const scriptCommands = [
    ...Object.entries(preset.entrypoints || {})
      .filter(([, entrypoint]) => entrypoint.type === "script")
      .map(([name, entrypoint]) => `entrypoint:${name}:${entrypoint.command}`),
    ...Object.entries(preset.actions || {})
      .filter(([, action]) => action.type === "script")
      .map(([name, action]) => `action:${name}:${action.command}`),
  ];
  const actionScriptCommands = Object.entries(preset.actions || {})
    .filter(([, action]) => action.type === "script")
    .map(([name, action]) => `action:${name}:${action.command}`);
  const unsupportedCommands = Object.entries(preset.actions || {})
    .filter(([, action]) => action.type === "script" && !String(action.command || "").endsWith(".mjs"))
    .map(([name, action]) => `action:${name}:${action.command || "(missing)"}`);
  const requiresTrustedSource = actionScriptCommands.length > 0 && preset.source !== "builtin";
  return {
    hasScripts: scriptCommands.length > 0,
    scriptCommands,
    riskLevel: scriptCommands.length > 0 ? "trusted-code" : "none",
    requiresTrustedSource,
    unsupportedCommands,
    warnings: requiresTrustedSource
      ? ["Script actions execute trusted local Node.js code; use --allow-scripts only for sources you trust."]
      : [],
  };
}

export function presetScriptTrustValid(preset: PresetPackage): boolean {
  if (preset.source === "builtin") return true;
  const trustPath = path.join(preset.directory, presetScriptTrustFile);
  const trust = asRecord(readJsonSafe(trustPath, {}));
  return (
    trust.schemaVersion === "preset-script-trust/v1" &&
    trust.preset === preset.id &&
    trust.manifestSha256 === preset.manifestSha256 &&
    trust.trusted === true
  );
}

function writePresetScriptTrustMarker(destination: string, preset: PresetPackage, scriptCommands: string[]): void {
  fs.writeFileSync(path.join(destination, presetScriptTrustFile), `${JSON.stringify({
    schemaVersion: "preset-script-trust/v1",
    preset: preset.id,
    version: preset.version,
    manifestSha256: preset.manifestSha256,
    scriptCommands,
    trusted: true,
    trustedAt: new Date().toISOString(),
  }, null, 2)}\n`);
}

export function renderPresetTemplate(preset: PresetPackage, templatePath: string, values: Record<string, unknown>): string {
  if (!templatePath) return "";
  const absolute = path.join(preset.directory, templatePath);
  if (!isInside(preset.directory, absolute)) throw new Error(`Preset template escapes package: ${templatePath}`);
  const content = fs.readFileSync(absolute, "utf8");
  return renderHarnessTemplate(content, values, { missing: "empty" });
}

function normalizePresetId(id: string): string {
  const normalized = String(id || "").trim().toLowerCase().replaceAll("_", "-");
  if (!normalized) return "";
  if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(normalized)) {
    throw new Error(`Invalid preset id: ${id}. Use lowercase letters, numbers, and hyphens only.`);
  }
  return normalized;
}

function tryNormalizePresetId(id: string): string {
  try {
    return normalizePresetId(id);
  } catch {
    return "";
  }
}

function userPresetDestination(id: string, { home = "" }: { home?: string } = {}): string {
  const root = home ? userPresetRootForHome(home) : userPresetRoot;
  const destination = path.resolve(root, normalizePresetId(id));
  if (!isInside(path.resolve(root), destination) || destination === path.resolve(root)) {
    throw new Error(`Preset destination escapes user preset root: ${id}`);
  }
  return destination;
}

function projectPresetDestination(id: string, targetInput: string): string {
  const root = path.resolve(projectPresetRoot(targetInput));
  const destination = path.resolve(root, normalizePresetId(id));
  if (!isInside(root, destination) || destination === root) {
    throw new Error(`Preset destination escapes project preset root: ${id}`);
  }
  return destination;
}

function normalizePresetManifest(manifest: PresetManifest, { id, manifestPath, raw, source }: { id: string; manifestPath: string; raw: string; source: PresetSource }): PresetPackage {
  const directory = path.dirname(manifestPath);
  const manifestRecord = asRecord(manifest);
  const entrypoints = normalizeEntryPoints(asRecord(manifestRecord.entrypoints));
  const actions = normalizeActions(asRecord(manifestRecord.actions));
  const writeScopes = Object.entries(asRecord(manifestRecord.writeScopes)).map(([name, value]) => {
    const scope = asRecord(value);
    return {
    name,
    path: String(scope.path || value || "").trim(),
    access: String(scope.access || "write").trim(),
  };
  }).filter((scope) => scope.path);
  const task = asRecord(manifestRecord.task);
  const entrypointRecord = asRecord(manifestRecord.entrypoints);
  const newTask = asRecord(entrypointRecord.newTask);
  return {
    id: normalizePresetId(String(manifestRecord.id || id)),
    version: Number.parseInt(String(manifestRecord.version || ""), 10),
    purpose: String(manifestRecord.purpose || ""),
    compatibleBudgets: asArray(manifestRecord.compatibleBudgets),
    localeSupport: asArray(manifestRecord.localeSupport),
    task,
    inputs: normalizeInputs(asRecord(manifestRecord.inputs)),
    templateValues: normalizeTemplateValues(asRecord(manifestRecord.templateValues)),
    metadata: normalizeTemplateValues(asRecord(manifestRecord.metadata)),
    resources: normalizeResources(asRecord(manifestRecord.resources)),
    context: normalizeContext(asRecord(manifestRecord.context)),
    entrypoints,
    actions,
    workbench: asRecord(manifestRecord.workbench),
    evidence: asEvidence(asRecord(manifestRecord.evidence)),
    review: asRecord(manifestRecord.review),
    audit: {
      manifestRequired: asBoolean(asRecord(manifestRecord.audit).manifestRequired),
      evidenceFiles: asArray(asRecord(manifestRecord.audit).evidenceFiles),
    },
    writeScopes,
    newTaskTemplates: stringRecord(newTask.templates),
    directory,
    source,
    manifestPath,
    manifestRelativePath: displayManifestPath(manifestPath),
    manifestSha256: crypto.createHash("sha256").update(raw).digest("hex"),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringRecord(value: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(asRecord(value)).map(([key, item]) => [key, String(item || "")]));
}

function asEvidence(value: Record<string, unknown>): PresetPackage["evidence"] {
  if (value.files === undefined) return value;
  if (typeof value.files !== "object" || value.files === null || Array.isArray(value.files)) return value as PresetPackage["evidence"];
  const rawFiles = asRecord(value.files);
  const files = Object.fromEntries(Object.entries(rawFiles).map(([name, item]) => {
    const record = asRecord(item);
    return [name, {
      path: record.path === undefined ? undefined : String(record.path),
      type: record.type === undefined ? undefined : String(record.type),
      value: record.value === undefined ? undefined : String(record.value),
    }];
  }));
  return { ...value, files };
}

function normalizeInputs(rawInputs: Record<string, unknown>): Record<string, PresetInputDeclaration> {
  return Object.fromEntries(Object.entries(rawInputs || {}).map(([name, value]) => [name, {
    type: String(asRecord(value).type || "text").trim(),
    flag: String(asRecord(value).flag || "").trim(),
    required: asBoolean(asRecord(value).required),
    default: asRecord(value).default,
    validateOperation: String(asRecord(value).validateOperation || "").trim(),
    rejectPlanOnly: asBoolean(asRecord(value).rejectPlanOnly),
    requireTarget: asBoolean(asRecord(value).requireTarget),
    targetFromSession: asBoolean(asRecord(value).targetFromSession),
  }]));
}

function normalizeTemplateValues(rawValues: Record<string, unknown>): Record<string, PresetTemplateDeclaration> {
  return Object.fromEntries(Object.entries(rawValues || {}).map(([name, value]) => [name, typeof value === "object" && value !== null ? asRecord(value) : { value }]));
}

function normalizeResources(rawResources: Record<string, unknown>): PresetPackage["resources"] {
  return {
    references: normalizeResourceGroup(asRecord(rawResources.references)),
    artifacts: normalizeResourceGroup(asRecord(rawResources.artifacts)),
  };
}

function normalizeResourceGroup(rawGroup: Record<string, unknown>): Record<string, PresetResource> {
  return Object.fromEntries(Object.entries(rawGroup || {}).map(([name, value]) => [name, {
    name,
    path: String(asRecord(value).path || "").trim(),
    source: String(asRecord(value).source || "").trim(),
    template: String(asRecord(value).template || "").trim(),
    index: {
      id: String(asRecord(asRecord(value).index).id || "").trim(),
      type: String(asRecord(asRecord(value).index).type || "").trim(),
      summary: String(asRecord(asRecord(value).index).summary || "").trim(),
      usedBy: String(asRecord(asRecord(value).index).usedBy || "").trim(),
      producedBy: String(asRecord(asRecord(value).index).producedBy || "").trim(),
    },
  }]));
}

function normalizeContext(rawContext: Record<string, unknown>): PresetPackage["context"] {
  return {
    requiredReads: asArray(rawContext.requiredReads),
  };
}

function normalizeEntryPoints(rawEntryPoints: Record<string, unknown>): Record<string, PresetEntrypoint> {
  const result: Record<string, PresetEntrypoint> = {};
  for (const [name, value] of Object.entries(rawEntryPoints || {})) {
    const entrypoint = asRecord(value);
    result[name] = {
      type: String(entrypoint.type || "").trim(),
      command: entrypoint.command ? String(entrypoint.command).trim() : "",
      templates: stringRecord(entrypoint.templates),
      writes: asArray(entrypoint.writes),
      reads: asArray(entrypoint.reads),
      audit: asBoolean(entrypoint.audit),
    };
  }
  return result;
}

function normalizeActions(rawActions: Record<string, unknown>): Record<string, PresetAction> {
  const result: Record<string, PresetAction> = {};
  for (const [name, value] of Object.entries(rawActions || {})) {
    const action = asRecord(value);
    result[name] = {
      type: String(action.type || "").trim(),
      command: action.command ? String(action.command).trim() : "",
      taskRequired: asBoolean(action.taskRequired),
      inputs: normalizeInputs(asRecord(action.inputs)),
      writes: asArray(action.writes),
      reads: asArray(action.reads),
      audit: asBoolean(action.audit),
    };
  }
  return result;
}

function publicPresetShape(preset: PresetPackage) {
  return {
    id: preset.id,
    version: preset.version,
    purpose: preset.purpose,
    compatibleBudgets: preset.compatibleBudgets,
    localeSupport: preset.localeSupport,
    task: preset.task,
    entrypoints: preset.entrypoints,
    actions: preset.actions,
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
    scriptPolicy: buildPresetScriptPolicy(preset),
  };
}

function validateResourceCollection(preset: PresetPackage, label: string, groupName: "references" | "artifacts", requiredPrefix: string, resourcePaths: Set<string>, failures: string[]): void {
  const seen = new Set<string>();
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
    for (const field of ["source", "template"] as const) {
      const declaredPath = resource[field];
      if (!declaredPath) continue;
      const resourcePath = path.join(preset.directory, declaredPath);
      if (!isInside(preset.directory, resourcePath)) failures.push(`${label} resource ${name} ${field} escapes preset package`);
      else validatePresetPackageFile(preset, declaredPath, `${label} resource ${name} ${field}`, failures);
    }
    const id = resource.index?.id || "";
    if (!id) failures.push(`${label} resource ${name} missing index.id`);
    if (id && hasMarkdownTableDelimiter(id)) failures.push(`${label} resource ${name} index.id cannot contain Markdown table delimiters: ${id}`);
    if (id && seen.has(id)) failures.push(`duplicate ${label} resource id: ${id}`);
    if (id) seen.add(id);
  }
}

function validateAuditEvidenceFiles(preset: PresetPackage, failures: string[]): void {
  const seen = new Set<string>();
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

function validateActionPathTemplateTokens(content: string, label: string): string[] {
  const failures = validateHarnessPathTemplateTokens(content, label);
  const allowedTaskTokens = new Set([
    "task.paths.dir",
    "task.paths.taskPlan",
    "task.paths.progress",
    "task.paths.artifacts",
    "task.paths.artifactsIndex",
    "task.paths.visualMap",
  ]);
  for (const match of String(content || "").matchAll(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g)) {
    const key = match[1];
    if (key.startsWith("paths.")) continue;
    if (key.startsWith("task.") && !allowedTaskTokens.has(key)) failures.push(`${label} uses unknown task token: ${key}`);
  }
  return failures;
}

function isBroadTaskRootScope(scope: string): boolean {
  const normalized = toPosix(path.normalize(String(scope || "")));
  return normalized === "{{paths.tasksRoot}}/**" ||
    normalized === "coding-agent-harness/planning/tasks/**" ||
    normalized === ["docs", "09-PLANNING", "TASKS", "**"].join("/");
}

function usesTaskLocalPath(scope: string): boolean {
  return String(scope || "").includes("{{task.paths.");
}

function newTaskWriteScopeAllowed(writeScope: string): boolean {
  const normalized = toPosix(path.normalize(String(writeScope || "")));
  const legacyPlanningScope = ["docs", "09-PLANNING"].join("/");
  return (
    normalized === "coding-agent-harness/planning/**" ||
    normalized.startsWith("coding-agent-harness/planning/") ||
    normalized === "{{paths.planningRoot}}/**" ||
    normalized.startsWith("{{paths.planningRoot}}/") ||
    normalized === "{{paths.tasksRoot}}/**" ||
    normalized.startsWith("{{paths.tasksRoot}}/") ||
    normalized === "{{paths.modulesRoot}}/**" ||
    normalized.startsWith("{{paths.modulesRoot}}/") ||
    normalized === `${legacyPlanningScope}/**` ||
    normalized.startsWith(`${legacyPlanningScope}/`)
  );
}

function warnOnRuntimePathLiterals(filePath: string, label: string, warnings: string[]): void {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return;
  const content = fs.readFileSync(filePath, "utf8");
  const runtimeLiteralPattern = /coding-agent-harness\/(?:planning|governance|context)\//;
  if (runtimeLiteralPattern.test(content) && !content.includes("context.paths") && !content.includes("context.absolutePaths")) {
    warnings.push(`${label} contains default harness path literals; prefer context.paths from the preset runner`);
  }
}

function validatePresetPackageFile(preset: PresetPackage, relativePath: string, label: string, failures: string[]): void {
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

export function parseSimpleYaml(source: string): PresetManifest {
  const root: PresetManifest = {};
  const stack: Array<{ indent: number; object: Record<string, unknown> }> = [{ indent: -1, object: root }];
  for (const rawLine of String(source).split(/\r?\n/)) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    const indentMatch = rawLine.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const line = rawLine.trim();
    const match = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!match) throw new Error(`Unsupported preset YAML line: ${rawLine}`);
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].object;
    const key = match[1];
    const rawValue = match[2] || "";
    if (!rawValue) {
      parent[key] = {};
      stack.push({ indent, object: asRecord(parent[key]) });
    } else {
      parent[key] = parseYamlScalar(rawValue);
    }
  }
  return root;
}

function parseYamlScalar(rawValue: string): unknown {
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

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return [String(value).trim()].filter(Boolean);
}

function asBoolean(value: unknown): boolean {
  return value === true || String(value || "").toLowerCase() === "true";
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function unsafeRelativePresetPath(value: unknown): boolean {
  const raw = String(value || "");
  const normalized = toPosix(path.normalize(raw));
  return path.isAbsolute(raw) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../");
}

function hasMarkdownTableDelimiter(value: unknown): boolean {
  return /[|\r\n]/.test(String(value || ""));
}

function getValue(values: Record<string, unknown>, key: string): unknown {
  let cursor: unknown = values;
  for (const part of String(key).split(".")) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    const record = cursor as Record<string, unknown>;
    cursor = Object.prototype.hasOwnProperty.call(record, part) ? record[part] : undefined;
  }
  return cursor;
}

function displayManifestPath(manifestPath: string): string {
  const relative = path.relative(repoRoot, manifestPath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) return toPosix(relative);
  return toPosix(manifestPath);
}

function findPresetManifest(id: string, { targetInput = "", home = "" }: PresetOptions = {}): PresetManifestLocation | null {
  const candidates = presetSearchRoots({ targetInput, home }).map(({ source, root }) => ({ source, manifestPath: path.join(root, id, "preset.yaml") }));
  return candidates.find((candidate) => fs.existsSync(candidate.manifestPath)) || null;
}

function listPresetIds({ targetInput = "", home = "" }: PresetOptions = {}): string[] {
  const ids = new Set<string>();
  for (const { root } of presetSearchRoots({ targetInput, home })) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isDirectory()) ids.add(entry.name);
    }
  }
  return [...ids].sort();
}

function presetSearchRoots({ targetInput = "", home = "" }: PresetOptions = {}): Array<{ source: PresetSource; root: string }> {
  const roots: Array<{ source: PresetSource; root: string }> = [];
  if (targetInput) roots.push({ source: "project", root: projectPresetRoot(targetInput) });
  roots.push({ source: "user", root: home ? userPresetRootForHome(home) : userPresetRoot });
  roots.push({ source: "builtin", root: builtinPresetRoot });
  return roots;
}

function resolveInstallSource(source: string): { path: string; source: "local" | "archive" | "builtin"; cleanup: () => void } {
  const localPath = path.resolve(source);
  if (fs.existsSync(path.join(localPath, "preset.yaml"))) return { path: localPath, source: "local", cleanup: () => {} };
  if (fs.existsSync(localPath) && fs.statSync(localPath).isFile()) {
    if (!localPath.toLowerCase().endsWith(".zip")) throw new Error(`Preset source file must be a .zip archive: ${toPosix(localPath)}`);
    return resolveZipInstallSource(localPath);
  }
  const builtinPath = path.join(builtinPresetRoot, normalizePresetId(source));
  if (fs.existsSync(path.join(builtinPath, "preset.yaml"))) return { path: builtinPath, source: "builtin", cleanup: () => {} };
  throw new Error(`Preset source not found: ${source}`);
}

function resolveZipInstallSource(sourcePath: string): { path: string; source: "archive"; cleanup: () => void } {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-preset-archive-"));
  try {
    extractPresetZip(sourcePath, tempRoot);
    return {
      path: presetRootFromExtractedArchive(tempRoot),
      source: "archive",
      cleanup: () => fs.rmSync(tempRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

function presetRootFromExtractedArchive(tempRoot: string): string {
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

function extractPresetZip(sourcePath: string, destinationRoot: string): void {
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
  const written = new Set<string>();
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

function findZipEndOfCentralDirectory(archive: Buffer): number {
  const minOffset = Math.max(0, archive.length - 22 - 65535);
  for (let offset = archive.length - 22; offset >= minOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid preset zip archive: end of central directory not found.");
}

function readZipEntryData(archive: Buffer, { localOffset, compressedSize, uncompressedSize, method, name }: ZipEntryDataOptions): Buffer {
  if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error(`Invalid preset archive local header: ${name}`);
  }
  const localNameLength = archive.readUInt16LE(localOffset + 26);
  const localExtraLength = archive.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > archive.length) throw new Error(`Invalid preset archive entry size: ${name}`);
  const compressed = archive.slice(dataStart, dataEnd);
  let data: Buffer;
  try {
    data = method === 0 ? Buffer.from(compressed) : zlib.inflateRawSync(compressed, { maxOutputLength: uncompressedSize });
  } catch (error) {
    throw new Error(`Preset archive entry could not be decompressed within its declared size: ${name}`);
  }
  if (data.length !== uncompressedSize) throw new Error(`Preset archive entry size mismatch: ${name}`);
  return data;
}

function shouldSkipZipEntry(rawName: string): boolean {
  const normalized = String(rawName || "").replace(/\\/g, "/");
  return normalized === "__MACOSX/" || normalized.startsWith("__MACOSX/") || normalized.endsWith("/.DS_Store") || normalized === ".DS_Store";
}

function safeZipEntryName(rawName: string): string {
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

function copyDirectory(source: string, destination: string): void {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, destinationPath);
  }
}

function copyPresetPackage(sourcePath: string, destination: string, id: string): void {
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
