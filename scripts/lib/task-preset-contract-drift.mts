import fs from "node:fs";
import path from "node:path";
import { validateTaskPresetAuditSnapshot } from "./preset-audit-contracts.mjs";
import { validatePresetResourcesForTask } from "./preset-resource-contracts.mjs";
import type { CheckTarget, PresetPackage, ScannedTask, ValidationResult } from "./types/check-profiles.js";

export function validateRegularTaskPresetContract(target: CheckTarget, task: ScannedTask, presetPackage: PresetPackage): ValidationResult {
  const failures: string[] = [];
  const warnings: string[] = [];
  const driftWarnings: string[] = [];
  if (presetPackage.task?.kind && task.taskKind !== presetPackage.task.kind) {
    driftWarnings.push(`${task.path} ${task.taskPreset} preset Task Kind mismatch: expected ${presetPackage.task.kind}, got ${task.taskKind || "(missing)"}`);
  }
  if (String(task.presetVersion || "") !== String(presetPackage.version)) {
    driftWarnings.push(`${task.path} ${task.taskPreset} preset version drift: task ${task.presetVersion || "(missing)"}, current ${presetPackage.version}`);
  }
  if (presetNeedsEvidenceBundle(presetPackage)) {
    if (!task.evidenceBundle) failures.push(`${task.path} ${task.taskPreset} preset missing Evidence Bundle`);
    else if (!fs.existsSync(path.join(target.projectRoot, String(task.evidenceBundle).replace(/^TARGET:/, "").replace(/^\/+/, "")))) {
      failures.push(`${task.path} ${task.taskPreset} preset Evidence Bundle missing: ${task.evidenceBundle}`);
    }
  }
  for (const issue of validateTaskPresetAuditSnapshot(target, task, presetPackage)) {
    if (issue.includes("preset manifest hash mismatch")) driftWarnings.push(issue);
    else failures.push(issue);
  }
  const resourceIssues = validatePresetResourcesForTask(target, task, presetPackage);
  if (driftWarnings.length) {
    warnings.push(...driftWarnings.map(toPresetDriftWarning));
    warnings.push(...resourceIssues.map(toPresetDriftWarning));
  } else {
    failures.push(...resourceIssues);
  }
  return { failures, warnings };
}

function presetNeedsEvidenceBundle(presetPackage: PresetPackage): boolean {
  return Boolean(
    presetPackage.evidence?.bundleDir ||
    presetPackage.audit?.evidenceFiles?.length ||
    Object.keys(presetPackage.evidence?.files || {}).length,
  );
}

function toPresetDriftWarning(issue: string): string {
  return `preset-drift-warning: ${issue}`;
}
