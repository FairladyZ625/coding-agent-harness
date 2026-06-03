// Generic preset entrypoint runner. Domain logic belongs in preset packages.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  absoluteHarnessPathContext,
  harnessPathContext,
  normalizeTarget,
  readFileSafe,
  readJsonSafe,
  renderHarnessTemplate,
  sanitizeDeep,
  toPosix,
  walkFiles,
} from "./core-shared.mjs";
import { assertTransactionSucceeded, createGovernanceHarnessTransaction, type FileWrite, type TransactionResult } from "./harness-transaction.mjs";
import { resolveHarnessPaths, taskIdFromDirectory } from "./harness-paths.mjs";
import { parseTaskMetadata } from "./task-metadata.mjs";
import { resolveTaskDirectory } from "./task-lifecycle.mjs";
import { evaluateTemplateValues, assertPresetWriteScope, resolvePresetScopes } from "./preset-engine.mjs";
import { buildPresetAudit, buildPresetScriptPolicy, presetScriptTrustValid, readPresetPackage } from "./preset-registry.mjs";
import type { PresetAction, PresetEntrypoint, PresetInputDeclaration, PresetPackage, PresetTarget } from "./types/preset.js";

const materializationSchemaVersion = "preset-materialization/v1";
const maxMaterializedFileBytes = 10 * 1024 * 1024;
const maxMaterializedWrites = 500;

type PresetRunOptions = {
  taskRef?: string;
  targetInput?: string;
  json?: boolean;
  allowScripts?: boolean;
  useCurrentPreset?: boolean;
  reason?: string;
};

type PresetActionOptions = PresetRunOptions & {
  actionArgs?: string[];
  allowScripts?: boolean;
};

type PresetTaskMetadata = {
  preset?: string;
  evidenceBundle?: string;
};

type MaterializationManifest = {
  schemaVersion: string;
  writes: MaterializationWriteDeclaration[];
  status?: string;
  publicRedactionReport?: {
    source?: string;
  };
};

type MaterializationWriteDeclaration = {
  source?: unknown;
  destination?: unknown;
  type?: unknown;
  visibility?: unknown;
};

type MaterializedWrite = {
  source: string;
  sourcePath: string;
  destination: string;
  destinationPath: string;
  type: string;
  visibility: string;
  sha256: string;
};

type FileSnapshot = Map<string, string>;

type PresetTransactionSummary = {
  operation: string;
  dryRun: boolean;
  allowedPaths: string[];
  writes: string[];
  generatedSurfaces: string[];
  success: boolean;
};

type TaskPathContext = {
  dir: string;
  taskPlan: string;
  progress: string;
  artifacts: string;
  artifactsIndex: string;
  visualMap: string;
};

function taskIdForDirectory(target: PresetTarget, taskDir: string): string {
  return taskIdFromDirectory(resolveHarnessPaths(target), taskDir);
}

export function runPresetEntrypoint(presetId: string, entrypointName: string, { taskRef = "", targetInput = ".", json = false, allowScripts = false, useCurrentPreset = false, reason = "" }: PresetRunOptions = {}) {
  void json;
  const target = normalizeTarget(targetInput) as PresetTarget;
  const preset = readPresetPackage(presetId, { targetInput });
  const entrypoint = preset.entrypoints?.[entrypointName];
  if (!entrypoint) throw new Error(`Preset ${preset.id} does not declare entrypoint: ${entrypointName}`);
  if (!["script", "check"].includes(entrypoint.type)) throw new Error(`Preset entrypoint ${entrypointName} is not runnable by preset run`);
  const scriptPolicy = buildPresetScriptPolicy(preset);
  if (scriptPolicy.requiresTrustedSource && !allowScripts && !presetScriptTrustValid(preset)) {
    throw new Error(`Preset entrypoint ${preset.id}.${entrypointName} executes trusted local code. Re-run with --allow-scripts if you trust this preset source.`);
  }
  if (!taskRef) throw new Error("preset run requires --task <task-id>");
  const taskDir = resolveTaskDirectory(target, taskRef);
  const taskPlan = readFileSafe(path.join(taskDir, "task_plan.md"));
  const metadata = parseTaskMetadata(taskPlan);
  if (metadata.preset !== preset.id) throw new Error(`Task ${taskRef} was created by preset ${metadata.preset || "none"}, not ${preset.id}`);
  const taskId = taskIdForDirectory(target, taskDir);
  const audit = readPresetAudit(target, metadata);
  const presetDrift = assessPresetDrift(audit, preset, { useCurrentPreset, reason });
  const resolvedInputs = asRecord(audit.resolvedInputs);
  const values = evaluateTemplateValues(preset, resolvedInputs, { taskId, taskTitle: taskId, moduleKey: "", target });
  const resolvedScopes = resolvePresetScopes(preset, target);
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), `harness-preset-${preset.id}-${entrypointName}-`));
  const manifestPath = path.join(outputRoot, "materialization-manifest.json");
  const contextPath = path.join(outputRoot, "preset-context.json");
  const beforeSnapshot = targetSnapshot(target.projectRoot);
  try {
    const context = {
      schemaVersion: "preset-run-context/v1",
      preset: { id: preset.id, version: preset.version, source: preset.source },
      entrypoint: entrypointName,
      task: {
        id: taskId,
        ref: taskRef,
        dir: toPosix(path.relative(target.projectRoot, taskDir)),
        taskPlanPath: toPosix(path.relative(target.projectRoot, path.join(taskDir, "task_plan.md"))),
      },
      targetRoot: target.projectRoot,
      targetRootPolicy: "read-only; direct target mutation before manifest materialization is a hard failure",
      runtime: {
        coreModule: new URL("./harness-core.mjs", import.meta.url).href,
      },
      outputRoot,
      materializationManifestPath: manifestPath,
      paths: harnessPathContext(target),
      absolutePaths: absoluteHarnessPathContext(target),
      inputs: sanitizeDeep(resolvedInputs),
      values: sanitizeDeep(values),
      audit: buildPresetAudit(preset, {
        taskId,
        targetRoot: target.projectRoot,
        entrypoint: entrypointName,
        writeScopes: resolvedScopes.entrypoints[entrypointName] || entrypoint.writes,
        resolvedInputs,
      }),
    };
    fs.writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`);
    const commandPath = path.join(preset.directory, entrypoint.command || "");
    const script = spawnSync(process.execPath, [commandPath], {
      cwd: outputRoot,
      encoding: "utf8",
      env: presetScriptEnv(contextPath),
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });
    if (script.error) throw script.error;
    if (script.status !== 0) {
      throw new Error(`Preset entrypoint ${preset.id}.${entrypointName} failed with ${script.status}\n${script.stderr || script.stdout || ""}`.trim());
    }
    const afterScriptSnapshot = targetSnapshot(target.projectRoot);
    assertSnapshotsEqual(beforeSnapshot, afterScriptSnapshot, "Preset script mutated target before materialization");
    const manifest = readMaterializationManifest(manifestPath);
    const materialization = validateMaterializationManifest(preset, entrypoint, manifest, { outputRoot, target, entrypointName });
    const transactionResult = applyPresetMaterializationTransaction(target, {
      operation: `preset-run ${preset.id}.${entrypointName}`,
      message: `chore(harness): run preset ${preset.id} ${entrypointName}`,
      materialization,
    });
    return {
      preset: preset.id,
      entrypoint: entrypointName,
      taskId,
      status: manifest.status || (entrypoint.type === "check" ? "pass" : "ok"),
      materialized: materialization.map((item) => ({
        source: item.source,
        destination: item.destination,
        type: item.type,
        sha256: item.sha256,
      })),
      governance: { commit: transactionResult.commit, transaction: presetTransactionSummary(transactionResult) },
      presetDrift,
    };
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

export function runPresetAction(presetId: string, actionName: string, { taskRef = "", targetInput = ".", json = false, actionArgs = [], allowScripts = false, useCurrentPreset = false, reason = "" }: PresetActionOptions = {}) {
  void json;
  const target = normalizeTarget(targetInput) as PresetTarget;
  const preset = readPresetPackage(presetId, { targetInput });
  const action = preset.actions?.[actionName];
  if (!action) throw new Error(`Preset ${preset.id} does not declare action: ${actionName}`);
  if (action.type !== "script") throw new Error(`Preset action ${actionName} is not runnable by preset action`);
  if (action.taskRequired !== true) throw new Error(`Preset action ${preset.id}.${actionName} requires taskRequired: true`);
  if (!taskRef) throw new Error("preset action requires --task <task-id>");
  const scriptPolicy = buildPresetScriptPolicy(preset);
  if (scriptPolicy.requiresTrustedSource && !allowScripts && !presetScriptTrustValid(preset)) {
    throw new Error(`Preset action ${preset.id}.${actionName} executes trusted local code. Re-run with --allow-scripts if you trust this preset source.`);
  }
  const taskDir = resolveTaskDirectory(target, taskRef);
  const taskPlan = readFileSafe(path.join(taskDir, "task_plan.md"));
  const metadata = parseTaskMetadata(taskPlan);
  if (metadata.preset !== preset.id) throw new Error(`Task ${taskRef} was created by preset ${metadata.preset || "none"}, not ${preset.id}`);
  const taskId = taskIdForDirectory(target, taskDir);
  const taskPaths = taskPathContext(target, taskDir);
  const actionInputs = resolveActionInputs(action, actionArgs);
  const audit = readPresetAudit(target, metadata);
  const presetDrift = assessPresetDrift(audit, preset, { useCurrentPreset, reason });
  const creationInputs = asRecord(audit.resolvedInputs);
  const values = evaluateTemplateValues(preset, creationInputs, { taskId, taskTitle: taskId, moduleKey: "", target });
  const actionWriteScopes = resolveActionScopes(action.writes, { target, taskPaths, label: `${actionName} action write scope` });
  const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), `harness-preset-${preset.id}-${actionName}-`));
  const manifestPath = path.join(outputRoot, "materialization-manifest.json");
  const contextPath = path.join(outputRoot, "preset-action-context.json");
  try {
    const beforeSnapshot = targetSnapshot(target.projectRoot);
    const context = {
      schemaVersion: "preset-action-context/v1",
      preset: { id: preset.id, version: preset.version, source: preset.source, manifestSha256: preset.manifestSha256 },
      action: { id: actionName, type: action.type },
      task: {
        id: taskId,
        ref: taskRef,
        dir: taskPaths.dir,
        taskPlanPath: taskPaths.taskPlan,
        paths: taskPaths,
      },
      targetRoot: target.projectRoot,
      targetRootPolicy: "read-only; direct target mutation before manifest materialization is a hard failure",
      outputRoot,
      materializationManifestPath: manifestPath,
      paths: harnessPathContext(target),
      inputs: sanitizeDeep(actionInputs),
      creationInputs: sanitizeDeep(creationInputs),
      values: sanitizeDeep(values),
      audit: buildPresetAudit(preset, {
        taskId,
        targetRoot: target.projectRoot,
        entrypoint: `action:${actionName}`,
        writeScopes: actionWriteScopes,
        resolvedInputs: actionInputs,
      }),
      presetDrift,
    };
    fs.writeFileSync(contextPath, `${JSON.stringify(context, null, 2)}\n`);
    const commandPath = path.join(preset.directory, action.command || "");
    const script = spawnSync(process.execPath, [commandPath], {
      cwd: outputRoot,
      encoding: "utf8",
      env: presetScriptEnv(contextPath),
      timeout: 120000,
      maxBuffer: 128 * 1024,
    });
    if (script.error) throw script.error;
    if (script.status !== 0) {
      throw new Error(`Preset action ${preset.id}.${actionName} failed with ${script.status}\n${boundedScriptOutput(script.stderr || script.stdout || "")}`.trim());
    }
    const afterScriptSnapshot = targetSnapshot(target.projectRoot);
    assertSnapshotsEqual(beforeSnapshot, afterScriptSnapshot, "Preset script mutated target before materialization");
    const manifest = readMaterializationManifest(manifestPath);
    const materialization = validateMaterializationManifest(preset, {
      type: action.type,
      command: action.command,
      templates: {},
      writes: actionWriteScopes,
      reads: action.reads,
      audit: action.audit,
    }, manifest, { outputRoot, target, entrypointName: actionName });
    const transactionResult = applyPresetMaterializationTransaction(target, {
      operation: `preset-action ${preset.id}.${actionName}`,
      message: `chore(harness): run preset action ${preset.id} ${actionName}`,
      materialization,
    });
    return {
      preset: preset.id,
      action: actionName,
      source: preset.source,
      manifestSha256: preset.manifestSha256,
      taskId,
      status: manifest.status || "ok",
      materialized: materialization.map((item) => ({
        source: item.source,
        destination: item.destination,
        type: item.type,
        sha256: item.sha256,
      })),
      governance: { commit: transactionResult.commit, transaction: presetTransactionSummary(transactionResult) },
      presetDrift,
    };
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function readPresetAudit(target: PresetTarget, metadata: PresetTaskMetadata): Record<string, unknown> {
  const evidenceBundle = normalizeTargetRelativePath(metadata.evidenceBundle || "", "Preset evidence bundle");
  if (!evidenceBundle) return {};
  const auditPath = path.join(target.projectRoot, evidenceBundle, "preset-audit.json");
  const audit = asRecord(readJsonSafe(auditPath, {}));
  return audit;
}

function assessPresetDrift(audit: Record<string, unknown>, preset: PresetPackage, { useCurrentPreset = false, reason = "" }: { useCurrentPreset?: boolean; reason?: string } = {}) {
  const recorded = String(audit.manifestSha256 || "");
  const current = String(preset.manifestSha256 || "");
  if (!recorded || !current || recorded === current) {
    return { detected: false, accepted: false, recordedManifestSha256: recorded, currentManifestSha256: current, reason: "" };
  }
  const normalizedReason = String(reason || "").trim();
  if (!useCurrentPreset || !normalizedReason) {
    throw new Error(`Preset manifest hash drift detected for ${preset.id}: recorded ${recorded}, current ${current}. Re-run with --use-current-preset --reason <why-current-semantics-are-intended>, or create a new task with the current preset.`);
  }
  return { detected: true, accepted: true, recordedManifestSha256: recorded, currentManifestSha256: current, reason: normalizedReason };
}

function resolveActionInputs(action: PresetAction, cliArgs: string[]): Record<string, unknown> {
  const remaining = [...cliArgs];
  const inputs: Record<string, unknown> = {};
  for (const [name, declaration] of Object.entries(action.inputs || {})) {
    inputs[name] = resolveActionInputValue(name, declaration, remaining);
  }
  if (remaining.length > 0) throw new Error(`Unknown action argument: ${remaining[0]}`);
  return inputs;
}

function resolveActionInputValue(name: string, declaration: PresetInputDeclaration, remaining: string[]): unknown {
  const flag = declaration.flag || name;
  const index = remaining.indexOf(flag);
  if (declaration.type === "flag") {
    if (index >= 0) {
      remaining.splice(index, 1);
      return true;
    }
    return Boolean(declaration.default);
  }
  if (index < 0) {
    if (declaration.required) throw new Error(`Missing required action input ${flag}`);
    return declaration.default ?? "";
  }
  const value = remaining[index + 1] || "";
  if (!value || value.startsWith("--")) throw new Error(`Missing value for action input ${flag}`);
  remaining.splice(index, 2);
  if (String(value).includes("\0")) throw new Error(`Action input ${flag} contains NUL byte`);
  if (declaration.type === "text") {
    if (String(value).length > 4096) throw new Error(`Action input ${flag} exceeds text length limit`);
    return String(value);
  }
  if (declaration.type === "json-file") {
    const filePath = path.resolve(String(value));
    if (!fs.existsSync(filePath)) throw new Error(`Action input file not found for ${flag}: ${value}`);
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error(`Action input file must be a file for ${flag}: ${value}`);
    if (stat.size > 1024 * 1024) throw new Error(`Action input file exceeds size limit for ${flag}: ${value}`);
    let readError: unknown = null;
    const parsed = readJsonSafe(filePath, null, { onError: (error: unknown) => { readError = error; } });
    if (!isRecord(parsed)) throw new Error(`Invalid action JSON input ${flag}: ${errorMessage(readError)}`);
    return parsed;
  }
  throw new Error(`Unsupported action input type for ${flag}: ${declaration.type}`);
}

function taskPathContext(target: PresetTarget, taskDir: string): TaskPathContext {
  const dir = toPosix(path.relative(target.projectRoot, taskDir));
  return {
    dir,
    taskPlan: toPosix(path.join(dir, "task_plan.md")),
    progress: toPosix(path.join(dir, "progress.md")),
    artifacts: toPosix(path.join(dir, "artifacts")),
    artifactsIndex: toPosix(path.join(dir, "artifacts/INDEX.md")),
    visualMap: toPosix(path.join(dir, "visual_map.md")),
  };
}

function resolveActionScopes(scopes: string[], { target, taskPaths, label }: { target: PresetTarget; taskPaths: TaskPathContext; label: string }): string[] {
  return (scopes || []).map((scope) => {
    const rendered = renderHarnessTemplate(String(scope || ""), { paths: harnessPathContext(target), task: { paths: taskPaths } }, { strict: true });
    const normalized = toPosix(path.normalize(rendered));
    if (!rendered.trim() || path.isAbsolute(rendered) || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
      throw new Error(`${label} escapes target root: ${scope}`);
    }
    return normalized;
  });
}

function presetScriptEnv(contextPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { HARNESS_PRESET_CONTEXT: contextPath };
  for (const key of ["PATH", "TMPDIR", "TEMP", "TMP", "SystemRoot", "ComSpec"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}

function normalizeTargetRelativePath(value: unknown, label: string): string {
  const raw = String(value || "").replace(/^TARGET:/, "").replace(/^\/+/, "").trim();
  if (!raw) return "";
  const normalized = toPosix(path.normalize(raw));
  if (path.isAbsolute(raw) || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`${label} escapes target root: ${raw}`);
  }
  return normalized;
}

function boundedScriptOutput(output: string): string {
  const redacted = String(output || "")
    .replace(/(api[_-]?key|token|secret|password)=\S+/gi, "$1=[redacted]")
    .replace(/\/Users\/[^/\s]+/g, "/Users/[redacted]");
  return redacted.length > 4096 ? `${redacted.slice(0, 4096)}\n[output truncated]` : redacted;
}

function readMaterializationManifest(manifestPath: string): MaterializationManifest {
  if (!fs.existsSync(manifestPath)) throw new Error("Preset entrypoint did not emit materialization manifest");
  const manifest = readJsonSafe(manifestPath, null);
  if (!isRecord(manifest)) throw new Error("Invalid preset materialization manifest");
  if (manifest.schemaVersion !== materializationSchemaVersion) throw new Error(`Invalid preset materialization schema: ${manifest.schemaVersion || "(missing)"}`);
  if (!Array.isArray(manifest.writes)) throw new Error("Preset materialization manifest writes must be an array");
  if (manifest.writes.length > maxMaterializedWrites) throw new Error(`Preset materialization manifest has too many writes: ${manifest.writes.length}`);
  return {
    schemaVersion: String(manifest.schemaVersion),
    writes: manifest.writes.map((write) => asRecord(write)),
    status: manifest.status === undefined ? undefined : String(manifest.status),
    publicRedactionReport: isRecord(manifest.publicRedactionReport) ? { source: String(manifest.publicRedactionReport.source || "") } : undefined,
  };
}

function validateMaterializationManifest(preset: PresetPackage, entrypoint: PresetEntrypoint, manifest: MaterializationManifest, { outputRoot, target, entrypointName }: { outputRoot: string; target: PresetTarget; entrypointName: string }): MaterializedWrite[] {
  const targetRoot = target.projectRoot;
  const seenDestinations = new Set<string>();
  const writes = manifest.writes.map((write, index) => {
    const source = normalizeManifestRelativePath(write.source, "Manifest source");
    const destination = normalizeManifestRelativePath(write.destination, "Manifest destination");
    if (seenDestinations.has(destination)) throw new Error(`Duplicate materialization destination: ${destination}`);
    seenDestinations.add(destination);
    assertEntrypointWriteScope(preset, entrypoint, destination, target, entrypointName);
    if (entrypointName && preset.actions?.[entrypointName] && isDefaultTaskGovernanceFile(destination)) {
      throw new Error(`Preset action ${entrypointName} cannot write task governance file by default: ${destination}`);
    }
    const sourcePath = path.join(outputRoot, source);
    assertOutputSource(outputRoot, sourcePath, source);
    const stat = fs.lstatSync(sourcePath);
    if (stat.size > maxMaterializedFileBytes) throw new Error(`Manifest source exceeds size limit: ${source}`);
    assertDestinationParent(targetRoot, destination);
    return {
      source,
      sourcePath,
      destination,
      destinationPath: path.join(targetRoot, destination),
      type: String(write.type || "text"),
      visibility: String(write.visibility || ""),
      sha256: sha256File(sourcePath),
    };
  });
  enforcePublicRedaction(manifest, writes, { outputRoot });
  return writes;
}

function normalizeManifestRelativePath(value: unknown, label: string): string {
  const raw = String(value || "").trim();
  const normalized = toPosix(path.normalize(raw));
  if (!raw || path.isAbsolute(raw) || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`${label} escapes preset output root: ${raw || "(missing)"}`);
  }
  return normalized;
}

function assertOutputSource(outputRoot: string, sourcePath: string, source: string): void {
  if (!fs.existsSync(sourcePath)) throw new Error(`Manifest source missing: ${source}`);
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) throw new Error(`Manifest source must not be a symlink: ${source}`);
  if (!stat.isFile()) throw new Error(`Manifest source must be a file: ${source}`);
  const realRoot = fs.realpathSync(outputRoot);
  const realSource = fs.realpathSync(sourcePath);
  if (!isInside(realRoot, realSource)) throw new Error(`Manifest source escapes preset output root: ${source}`);
}

function assertDestinationParent(targetRoot: string, destination: string): void {
  let parent = path.dirname(path.join(targetRoot, destination));
  const realTarget = fs.realpathSync(targetRoot);
  while (!fs.existsSync(parent) && parent !== targetRoot && parent !== path.dirname(parent)) parent = path.dirname(parent);
  if (fs.existsSync(parent)) {
    const stat = fs.lstatSync(parent);
    if (stat.isSymbolicLink()) throw new Error(`Manifest destination parent must not be a symlink: ${destination}`);
    const realParent = fs.realpathSync(parent);
    if (!isInside(realTarget, realParent)) throw new Error(`Manifest destination parent escapes target root: ${destination}`);
  }
}

function assertEntrypointWriteScope(preset: PresetPackage, entrypoint: PresetEntrypoint, destination: string, target: PresetTarget, entrypointName: string): void {
  assertPresetWriteScope(preset, destination, target);
  const resolved = resolvePresetScopes(preset, target).entrypoints[entrypointName] || entrypoint.writes;
  if (!resolved.some((scope) => matchesScope(scope, destination))) {
    throw new Error(`Preset write scope violation for ${destination}`);
  }
}

function matchesScope(scope: string, relativePath: string): boolean {
  const normalizedScope = toPosix(path.normalize(String(scope || "")));
  if (normalizedScope.endsWith("/**")) {
    const prefix = normalizedScope.slice(0, -3);
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
  }
  return relativePath === normalizedScope;
}

function isDefaultTaskGovernanceFile(destination: string): boolean {
  return /(^|\/)(review|brief|task_plan)\.md$/.test(destination);
}

function enforcePublicRedaction(manifest: MaterializationManifest, writes: MaterializedWrite[], { outputRoot }: { outputRoot: string }): void {
  const publicWrites = writes.filter((write) => write.visibility === "public" || write.destination.startsWith("docs-release/"));
  if (publicWrites.length === 0) return;
  const reportSource = normalizeManifestRelativePath(manifest.publicRedactionReport?.source || "", "Public redaction report source");
  const reportPath = path.join(outputRoot, reportSource);
  assertOutputSource(outputRoot, reportPath, reportSource);
  const report = asRecord(readJsonSafe(reportPath, null));
  if (report.status !== "pass") throw new Error("Public materialization requires a passing public redaction report");
}

function targetSnapshot(root: string): FileSnapshot {
  const entries: FileSnapshot = new Map();
  for (const filePath of walkFiles(root)) {
    const relative = toPosix(path.relative(root, filePath));
    if (relative.startsWith(".harness/locks/")) continue;
    const stat = fs.lstatSync(filePath);
    entries.set(relative, `${stat.size}:${sha256File(filePath)}`);
  }
  return entries;
}

function assertSnapshotsEqual(before: FileSnapshot, after: FileSnapshot, message: string): void {
  const changed: string[] = [];
  const paths = new Set([...before.keys(), ...after.keys()]);
  for (const item of paths) {
    if (before.get(item) !== after.get(item)) changed.push(item);
  }
  if (changed.length) throw new Error(`${message}: ${changed.slice(0, 12).join(", ")}`);
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function applyPresetMaterializationTransaction(target: PresetTarget, { operation, message, materialization }: { operation: string; message: string; materialization: MaterializedWrite[] }): Extract<TransactionResult, { success: true }> {
  const transaction = createGovernanceHarnessTransaction(target);
  const writes = materialization.map((item): FileWrite => ({
    path: item.destination,
    content: fs.readFileSync(item.sourcePath),
    action: "materialize-preset-write",
    surface: "preset-materialization",
  }));
  const plan = transaction.plan({
    operation,
    writes,
    allowedPaths: materialization.map((item) => item.destination),
    commit: {
      message,
      allowDirtyWorktree: true,
    },
  });
  const result = transaction.apply(plan);
  assertTransactionSucceeded(result);
  return result;
}

function presetTransactionSummary(result: TransactionResult): PresetTransactionSummary {
  return {
    operation: result.operation,
    dryRun: result.dryRun,
    allowedPaths: result.allowedPaths,
    writes: result.writes,
    generatedSurfaces: result.generatedSurfaces,
    success: result.success,
  };
}
