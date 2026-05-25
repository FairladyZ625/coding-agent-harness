import fs from "node:fs";
import path from "node:path";
import { readFileSafe, toPosix } from "./core-shared.mjs";

export function validateTaskPresetAuditSnapshot(target, task, presetPackage) {
  const failures = [];
  if (!presetPackage?.audit?.manifestRequired) return failures;
  const bundle = String(task.evidenceBundle || "").replace(/^TARGET:/, "").replace(/^\/+/, "");
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
    failures.push(`${task.path} ${task.taskPreset} preset audit invalid JSON: ${error.message}`);
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
  return failures;
}
