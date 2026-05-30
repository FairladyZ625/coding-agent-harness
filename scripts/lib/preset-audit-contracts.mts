import fs from "node:fs";
import path from "node:path";
// @ts-ignore core-shared remains a JS runtime dependency until its migration PR.
import { readFileSafe, toPosix } from "./core-shared.mjs";

type AnyRecord = Record<string, any>;

export function validateTaskPresetAuditSnapshot(target: AnyRecord, task: AnyRecord, presetPackage: AnyRecord): string[] {
  const failures: string[] = [];
  if (!presetPackage?.audit?.manifestRequired) return failures;
  const bundle = normalizeTargetRelativePath(task.evidenceBundle || "", "preset Evidence Bundle");
  if (!bundle) {
    failures.push(`${task.path} ${task.taskPreset} preset missing Evidence Bundle for manifest audit`);
    return failures;
  }
  const auditPath = path.join(target.projectRoot, bundle, "preset-audit.json");
  if (!fs.existsSync(auditPath)) {
    failures.push(`${task.path} ${task.taskPreset} preset audit missing: TARGET:${toPosix(path.relative(target.projectRoot, auditPath))}`);
    return failures;
  }
  let audit = null;
  try {
    audit = JSON.parse(readFileSafe(auditPath));
  } catch (error) {
    failures.push(`${task.path} ${task.taskPreset} preset audit invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return failures;
  }
  if (audit.preset !== task.taskPreset) {
    failures.push(`${task.path} ${task.taskPreset} preset audit id mismatch: ${audit.preset || "(missing)"}`);
  }
  if (String(audit.version || "") !== String(task.presetVersion || "")) {
    failures.push(`${task.path} ${task.taskPreset} preset audit version mismatch: ${audit.version || "(missing)"}`);
  }
  if (!audit.manifestSha256) {
    failures.push(`${task.path} ${task.taskPreset} preset audit missing manifestSha256`);
  } else if (audit.manifestSha256 !== presetPackage.manifestSha256) {
    failures.push(`${task.path} ${task.taskPreset} preset manifest hash mismatch: task audit ${audit.manifestSha256}, current ${presetPackage.manifestSha256}`);
  }
  const auditScriptSha256s = asRecord(audit.scriptSha256s);
  const currentScriptSha256s = asRecord(presetPackage.scriptSha256s);
  if (Object.keys(auditScriptSha256s).length > 0 && !recordsEqual(auditScriptSha256s, currentScriptSha256s)) {
    failures.push(`${task.path} ${task.taskPreset} preset script hash mismatch`);
  }
  return failures;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function recordsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  const leftEntries = Object.entries(left).map(([key, value]) => [key, String(value)]).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).map(([key, value]) => [key, String(value)]).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}
