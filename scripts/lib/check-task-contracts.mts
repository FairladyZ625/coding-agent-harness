// @ts-nocheck
// Task contract checks depend on dynamic task scan metadata until checker domain types are modeled.

import fs from "node:fs";
import path from "node:path";
import {
  lessonCandidatesFile,
  readFileSafe,
  toPosix,
  visualMapFile,
} from "./core-shared.mjs";
import {
  listTaskPlanPaths,
  parseTaskBudget,
  parseTaskContractInfo,
} from "./task-scanner.mjs";
import { parseTaskAuditMetadata } from "./task-audit-metadata.mjs";

export function validatePlanContracts(target, { strict = true, taskPlanPaths } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  for (const taskPlanPath of taskPlanPaths || listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    const relativeDir = toPosix(path.relative(target.projectRoot, taskDir));
    const taskPlanContent = readFileSafe(taskPlanPath);
    const indexContent = readFileSafe(path.join(taskDir, "INDEX.md"));
    const budget = parseTaskBudget(taskPlanContent);
    const taskContract = parseTaskContractInfo(taskPlanContent);
    const taskAudit = parseTaskAuditMetadata(indexContent, { required: strict && taskContract.generated });
    if (!taskContract.generated) {
      warnings.push(`adoption-needed: ${relativeDir} missing Task Contract: harness-task/v1 marker`);
    }
    for (const issue of taskAudit.issues) {
      if (taskContract.generated || taskAudit.present) failures.push(`${relativeDir}/INDEX.md ${issue.message}`);
      else report(`${relativeDir}/INDEX.md ${issue.message}`);
    }
    const indexRequired = /^Task Package Index\s*[:：]\s*(required|yes|true|必需|必须|required)\s*$/im.test(taskPlanContent);
    for (const fileName of requiredTaskFilesForBudget(budget, { indexRequired })) {
      if (!fs.existsSync(path.join(taskDir, fileName))) {
        if (taskContract.generated) failures.push(`${relativeDir} missing ${fileName}`);
        else report(`${relativeDir} missing ${fileName}`);
      }
    }
  }
  return { failures, warnings };
}

function requiredTaskFilesForBudget(budget, { indexRequired = false } = {}) {
  const simpleFiles = [...(indexRequired ? ["INDEX.md"] : []), "brief.md", "task_plan.md", visualMapFile, "progress.md"];
  if (budget === "simple") return simpleFiles;
  const standardFiles = [...simpleFiles, "execution_strategy.md", "findings.md", lessonCandidatesFile, "review.md"];
  if (budget === "complex") return [...standardFiles, "references/INDEX.md", "artifacts/INDEX.md"];
  return standardFiles;
}
