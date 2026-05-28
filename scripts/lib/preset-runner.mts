// @ts-nocheck
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

const materializationSchemaVersion = "preset-materialization/v1";
const maxMaterializedFileBytes = 10 * 1024 * 1024;
const maxMaterializedWrites = 500;

export function runPresetEntrypoint(presetId, entrypointName, { taskRef = "", targetInput = ".", json = false } = {}) {
  const target = normalizeTarget(targetInput);
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

function readResolvedInputs(target, metadata) {
  const evidenceBundle = String(metadata.evidenceBundle || "").replace(/^TARGET:/, "").replace(/^\/+/, "");
  if (!evidenceBundle) return {};
  const auditPath = path.join(target.projectRoot, evidenceBundle, "preset-audit.json");
  const audit = readJsonSafe(auditPath, {});
  return audit.resolvedInputs || {};
}

function readMaterializationManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) throw new Error("Preset entrypoint did not emit materialization manifest");
  const manifest = readJsonSafe(manifestPath, null);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw new Error("Invalid preset materialization manifest");
  if (manifest.schemaVersion !== materializationSchemaVersion) throw new Error(`Invalid preset materialization schema: ${manifest.schemaVersion || "(missing)"}`);
  if (!Array.isArray(manifest.writes)) throw new Error("Preset materialization manifest writes must be an array");
  if (manifest.writes.length > maxMaterializedWrites) throw new Error(`Preset materialization manifest has too many writes: ${manifest.writes.length}`);
  return manifest;
}

function validateMaterializationManifest(preset, entrypoint, manifest, { outputRoot, target, entrypointName }) {
  const targetRoot = target.projectRoot;
  const seenDestinations = new Set();
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

function normalizeManifestRelativePath(value, label) {
  const raw = String(value || "").trim();
  const normalized = toPosix(path.normalize(raw));
  if (!raw || path.isAbsolute(raw) || normalized === "." || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`${label} escapes preset output root: ${raw || "(missing)"}`);
  }
  return normalized;
}

function assertOutputSource(outputRoot, sourcePath, source) {
  if (!fs.existsSync(sourcePath)) throw new Error(`Manifest source missing: ${source}`);
  const stat = fs.lstatSync(sourcePath);
  if (stat.isSymbolicLink()) throw new Error(`Manifest source must not be a symlink: ${source}`);
  if (!stat.isFile()) throw new Error(`Manifest source must be a file: ${source}`);
  const realRoot = fs.realpathSync(outputRoot);
  const realSource = fs.realpathSync(sourcePath);
  if (!isInside(realRoot, realSource)) throw new Error(`Manifest source escapes preset output root: ${source}`);
}

function assertDestinationParent(targetRoot, destination) {
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

function assertEntrypointWriteScope(preset, entrypoint, destination, target, entrypointName) {
  assertPresetWriteScope(preset, destination, target);
  const resolved = resolvePresetScopes(preset, target).entrypoints[entrypointName] || entrypoint.writes;
  if (!resolved.some((scope) => matchesScope(scope, destination))) {
    throw new Error(`Preset write scope violation for ${destination}`);
  }
}

function matchesScope(scope, relativePath) {
  const normalizedScope = toPosix(path.normalize(String(scope || "")));
  if (normalizedScope.endsWith("/**")) {
    const prefix = normalizedScope.slice(0, -3);
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
  }
  return relativePath === normalizedScope;
}

function enforcePublicRedaction(manifest, writes, { outputRoot }) {
  const publicWrites = writes.filter((write) => write.visibility === "public" || write.destination.startsWith("docs-release/"));
  if (publicWrites.length === 0) return;
  const reportSource = normalizeManifestRelativePath(manifest.publicRedactionReport?.source || "", "Public redaction report source");
  const reportPath = path.join(outputRoot, reportSource);
  assertOutputSource(outputRoot, reportPath, reportSource);
  const report = readJsonSafe(reportPath, null);
  if (!report || report.status !== "pass") throw new Error("Public materialization requires a passing public redaction report");
}

function materializeWrites(targetRoot, writes) {
  const backups = [];
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

function targetSnapshot(root) {
  const entries = new Map();
  for (const filePath of walkFiles(root)) {
    const relative = toPosix(path.relative(root, filePath));
    if (relative.startsWith(".harness/locks/")) continue;
    const stat = fs.lstatSync(filePath);
    entries.set(relative, `${stat.size}:${sha256File(filePath)}`);
  }
  return entries;
}

function assertSnapshotsEqual(before, after, message) {
  const changed = [];
  const paths = new Set([...before.keys(), ...after.keys()]);
  for (const item of paths) {
    if (before.get(item) !== after.get(item)) changed.push(item);
  }
  if (changed.length) throw new Error(`${message}: ${changed.slice(0, 12).join(", ")}`);
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
