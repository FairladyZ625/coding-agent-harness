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
  sanitizeDeep,
  toPosix,
  walkFiles,
} from "./core-shared.mjs";
import { beginGovernanceSync, commitGovernanceSync, releaseGovernanceSync } from "./governance-sync.mjs";
import { parseTaskMetadata } from "./task-metadata.mjs";
import { taskIdForDirectory } from "./task-scanner.mjs";
import { resolveTaskDirectory } from "./task-lifecycle.mjs";
import { evaluateTemplateValues, assertPresetWriteScope, resolvePresetScopes } from "./preset-engine.mjs";
import { buildPresetAudit, readPresetPackage } from "./preset-registry.mjs";
import type { PresetEntrypoint, PresetPackage, PresetResolvedInputs, PresetTarget } from "./types/preset.js";

const materializationSchemaVersion = "preset-materialization/v1";
const maxMaterializedFileBytes = 10 * 1024 * 1024;
const maxMaterializedWrites = 500;

type PresetRunOptions = {
  taskRef?: string;
  targetInput?: string;
  json?: boolean;
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

type BackupRecord = {
  destinationPath: string;
  backupPath: string;
  existed: boolean;
};

export function runPresetEntrypoint(presetId: string, entrypointName: string, { taskRef = "", targetInput = ".", json = false }: PresetRunOptions = {}) {
  void json;
  const target = normalizeTarget(targetInput) as PresetTarget;
  const preset = readPresetPackage(presetId, { targetInput });
  const entrypoint = preset.entrypoints?.[entrypointName];
  if (!entrypoint) throw new Error(`Preset ${preset.id} does not declare entrypoint: ${entrypointName}`);
  if (!["script", "check"].includes(entrypoint.type)) throw new Error(`Preset entrypoint ${entrypointName} is not runnable by preset run`);
  if (!taskRef) throw new Error("preset run requires --task <task-id>");
  const taskDir = resolveTaskDirectory(target, taskRef);
  const taskPlan = readFileSafe(path.join(taskDir, "task_plan.md"));
  const metadata = parseTaskMetadata(taskPlan);
  if (metadata.preset !== preset.id) throw new Error(`Task ${taskRef} was created by preset ${metadata.preset || "none"}, not ${preset.id}`);
  const taskId = taskIdForDirectory(target, taskDir);
  const resolvedInputs = readResolvedInputs(target, metadata);
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
      env: {
        ...process.env,
        HARNESS_PRESET_CONTEXT: contextPath,
      },
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
    const governanceContext = beginGovernanceSync(target, {
      operation: `preset-run ${preset.id}.${entrypointName}`,
      allowDirtyWorktree: true,
      allowedRelativePaths: materialization.map((item) => item.destination),
    });
    try {
      materializeWrites(target.projectRoot, materialization);
      const commit = commitGovernanceSync(governanceContext, materialization.map((item) => item.destination), {
        message: `chore(harness): run preset ${preset.id} ${entrypointName}`,
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
        governance: { commit },
      };
    } finally {
      releaseGovernanceSync(governanceContext);
    }
  } finally {
    fs.rmSync(outputRoot, { recursive: true, force: true });
  }
}

function readResolvedInputs(target: PresetTarget, metadata: PresetTaskMetadata): PresetResolvedInputs {
  const evidenceBundle = String(metadata.evidenceBundle || "").replace(/^TARGET:/, "").replace(/^\/+/, "");
  if (!evidenceBundle) return {};
  const auditPath = path.join(target.projectRoot, evidenceBundle, "preset-audit.json");
  const audit = asRecord(readJsonSafe(auditPath, {}));
  return asRecord(audit.resolvedInputs);
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

function enforcePublicRedaction(manifest: MaterializationManifest, writes: MaterializedWrite[], { outputRoot }: { outputRoot: string }): void {
  const publicWrites = writes.filter((write) => write.visibility === "public" || write.destination.startsWith("docs-release/"));
  if (publicWrites.length === 0) return;
  const reportSource = normalizeManifestRelativePath(manifest.publicRedactionReport?.source || "", "Public redaction report source");
  const reportPath = path.join(outputRoot, reportSource);
  assertOutputSource(outputRoot, reportPath, reportSource);
  const report = asRecord(readJsonSafe(reportPath, null));
  if (report.status !== "pass") throw new Error("Public materialization requires a passing public redaction report");
}

function materializeWrites(targetRoot: string, writes: MaterializedWrite[]): void {
  const backups: BackupRecord[] = [];
  try {
    for (const write of writes) {
      const destinationPath = write.destinationPath;
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      const existed = fs.existsSync(destinationPath);
      const backupPath = existed ? `${destinationPath}.backup-${process.pid}-${crypto.randomBytes(4).toString("hex")}` : "";
      if (existed) {
        fs.copyFileSync(destinationPath, backupPath);
        backups.push({ destinationPath, backupPath, existed });
      } else {
        backups.push({ destinationPath, backupPath: "", existed });
      }
      const tempPath = `${destinationPath}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
      fs.copyFileSync(write.sourcePath, tempPath);
      fs.renameSync(tempPath, destinationPath);
    }
    for (const backup of backups) {
      if (backup.backupPath) fs.rmSync(backup.backupPath, { force: true });
    }
  } catch (error) {
    for (const backup of backups.reverse()) {
      try {
        if (backup.existed && backup.backupPath && fs.existsSync(backup.backupPath)) fs.renameSync(backup.backupPath, backup.destinationPath);
        else if (!backup.existed) fs.rmSync(backup.destinationPath, { force: true });
      } catch {
        // Preserve the original materialization failure.
      }
    }
    throw error;
  }
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
