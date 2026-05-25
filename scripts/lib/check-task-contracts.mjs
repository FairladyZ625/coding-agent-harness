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
  parseScaffoldProvenance,
} from "./task-scanner.mjs";

export function validatePlanContracts(target, { strict = true } = {}) {
  const failures = [];
  const warnings = [];
  const report = (message) => {
    if (strict) failures.push(message);
    else warnings.push(`adoption-needed: ${message}`);
  };
  for (const taskPlanPath of listTaskPlanPaths(target)) {
    const taskDir = path.dirname(taskPlanPath);
    const relativeDir = toPosix(path.relative(target.projectRoot, taskDir));
    const taskPlanContent = readFileSafe(taskPlanPath);
    const budget = parseTaskBudget(taskPlanContent);
    const taskContract = parseTaskContractInfo(taskPlanContent);
    const scaffoldProvenance = parseScaffoldProvenance(taskPlanContent);
    if (!taskContract.generated) {
      warnings.push(`adoption-needed: ${relativeDir} missing Task Contract: harness-task/v1 marker`);
    }
    if (taskContract.generated && !scaffoldProvenance.present) {
      if (strict) failures.push(`${relativeDir} missing Scaffold Provenance section`);
    }
    for (const issue of scaffoldProvenance.issues) {
      if (scaffoldProvenance.required || scaffoldProvenance.present) failures.push(`${relativeDir} ${issue.message}`);
      else report(`${relativeDir} ${issue.message}`);
    }
    for (const fileName of requiredTaskFilesForBudget(budget)) {
      if (!fs.existsSync(path.join(taskDir, fileName))) {
        if (taskContract.generated) failures.push(`${relativeDir} missing ${fileName}`);
        else report(`${relativeDir} missing ${fileName}`);
      }
    }
  }
  return { failures, warnings };
}

function requiredTaskFilesForBudget(budget) {
  const simpleFiles = ["brief.md", "task_plan.md", visualMapFile, "progress.md"];
  if (budget === "simple") return simpleFiles;
  const standardFiles = [...simpleFiles, "execution_strategy.md", "findings.md", lessonCandidatesFile, "review.md"];
  if (budget === "complex") return [...standardFiles, "references/INDEX.md", "artifacts/INDEX.md"];
  return standardFiles;
}
