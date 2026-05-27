// @ts-nocheck
// Governance table parsing remains behavior-first until target/table domain types are modeled.

import fs from "node:fs";
import path from "node:path";
import { readFileSafe, toPosix } from "./core-shared.mjs";
import { getCell, parseAllMarkdownTables } from "./markdown-utils.mjs";

const newRuleCutoff = "2026-05-24";

const globalTableSpecs = [
  { key: "feature-ssot", pathFor: (target) => path.join(target.harness.planningRoot, "Feature-SSoT.md"), allowed: "index-state-route-summary", evaluate: evaluateFeatureRow },
  { key: "harness-ledger", pathFor: (target) => target.harness.ledgerPath, allowed: "task-audit-summary-route", evaluate: evaluateLedgerRow },
  { key: "closeout-ssot", pathFor: (target) => target.harness.closeoutIndexPath, allowed: "closeout-index-review-route-summary", evaluate: evaluateCloseoutRow },
  { key: "regression-ssot", pathFor: (target) => path.join(target.harness.regressionRoot, "Regression-SSoT.md"), allowed: "gate-index-current-state", evaluate: evaluateRegressionRow },
  { key: "cadence-ledger", pathFor: (target) => path.join(target.harness.regressionRoot, "Cadence-Ledger.md"), allowed: "trigger-rule-and-batch-summary", evaluate: evaluateCadenceRow },
];

export function validateGovernanceTableBoundaries(target) {
  const failures = [];
  const warnings = [];
  for (const spec of globalTableSpecs) {
    const file = spec.pathFor(target);
    if (!fs.existsSync(file)) continue;
    const relative = toPosix(path.relative(target.projectRoot, file));
    for (const table of parseAllMarkdownTables(readFileSafe(file), relative, spec.key)) {
      for (const row of table.rows) {
        if (isPlaceholderRow(row)) continue;
        for (const finding of spec.evaluate(row)) {
          const rowKey = governanceRowKey(row);
          const message = [
            "governance-table-entropy",
            `${relative}:${table.line}`,
            `${spec.key} row ${rowKey}`,
            finding.reason,
            `allowed=${spec.allowed}`,
            `route=${finding.route}`,
          ].join(": ");
          if (isLegacyRow(rowUpdatedDate(row))) warnings.push(`${message}: legacy-report-only`);
          else failures.push(message);
        }
      }
    }
  }
  return { failures, warnings };
}

function evaluateFeatureRow(row) {
  const cells = row.cells || {};
  const text = rowText(row);
  const taskPlan = getCell(cells, ["Task Plan", "Task", "任务计划", "路径"], "");
  const evidence = getCell(cells, ["Acceptance Evidence", "Evidence", "验收证据"], "");
  const findings = [];
  if (/(?:09-PLANNING\/MODULES|planning\/modules)\//i.test(taskPlan) && !isModuleAggregateRow(row) && localDetailPattern().test(text)) {
    findings.push({
      reason: "module-local detail belongs in module_plan.md or task files, not Feature SSoT",
      route: "module-plan-or-task-detail",
    });
  }
  if (longEvidencePattern().test(evidence) || temporaryPromptPattern().test(text)) {
    findings.push({
      reason: "long evidence or temporary repair prompt belongs in task evidence, not Feature SSoT",
      route: "task-artifacts-or-progress",
    });
  }
  return findings;
}

function isModuleAggregateRow(row) {
  const cells = row.cells || {};
  const id = getCell(cells, ["ID"], "");
  const taskPlan = getCell(cells, ["Task Plan", "Task", "任务计划", "路径"], "");
  return /^F-MODULE-/i.test(id) && /(?:09-PLANNING\/MODULES|planning\/modules)\/[^/]+\/module_plan\.md/i.test(taskPlan);
}

function evaluateLedgerRow(row) {
  const text = rowText(row);
  const evidence = ledgerEvidenceText(row);
  if (executionLogPattern().test(evidence) || temporaryPromptPattern().test(text) || rawTranscriptPattern().test(evidence)) {
    return [{
      reason: "execution logs, long evidence, and temporary repair prompts belong in task progress/review/artifacts",
      route: "task-progress-review-artifacts",
    }];
  }
  return [];
}

function ledgerEvidenceText(row) {
  const cells = row.cells || {};
  return [
    "Evidence Summary",
    "Evidence",
    "Regression Evidence",
    "Review Evidence",
    "Regression",
    "Review",
    "证据摘要",
    "证据",
    "回归",
    "审查",
  ].map((column) => getCell(cells, [column], "")).filter(Boolean).join(" ");
}

function evaluateCloseoutRow(row) {
  const text = rowText(row);
  if (executionLogPattern().test(text) || rawTranscriptPattern().test(text)) {
    return [{
      reason: "closeout rows should route to walkthrough/evidence instead of carrying execution detail",
      route: "walkthrough-or-task-evidence",
    }];
  }
  return [];
}

function evaluateRegressionRow(row) {
  const text = rowText(row);
  if (executionLogPattern().test(text) || temporaryPromptPattern().test(text)) {
    return [{
      reason: "regression global tables should keep gate state and route detailed failure analysis elsewhere",
      route: "regression-detail-or-task-review",
    }];
  }
  return [];
}

function evaluateCadenceRow(row) {
  const text = rowText(row);
  if (rawTranscriptPattern().test(text) || temporaryPromptPattern().test(text)) {
    return [{
      reason: "cadence rows should summarize batch outcomes and route raw run detail elsewhere",
      route: "regression-batch-artifacts",
    }];
  }
  return [];
}

function governanceRowKey(row) {
  return getCell(row.cells || {}, ["ID", "Lesson", "Lesson ID", "Feature", "Work Item", "Gate ID", "Batch ID"], "") || row.id || "unknown-row";
}

function rowText(row) {
  return Object.values(row.cells || {}).join(" ");
}

function rowUpdatedDate(row) {
  const value = getCell(row.cells || {}, ["Updated", "Date", "日期", "Last Verified", "最近验证"], "");
  const match = String(value).match(/\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : "";
}

function isLegacyRow(updated) {
  return updated && updated < newRuleCutoff;
}

function isPlaceholderRow(row) {
  const text = rowText(row);
  return /\b(?:YYYY|MM|DD|NNN)\b|L-YYYY|HL-YYYY|\[[^\]]+\]|\.\.\.md|\bowner\b|\bShort lesson title\b/i.test(text);
}

function localDetailPattern() {
  return /\b(module|local|implementation detail|parser branch|button label|copy every|工作项|局部|实现细节)\b/i;
}

function longEvidencePattern() {
  return /\b(long evidence|full local evidence|raw evidence|stack trace|reviewer transcript|copied raw)\b/i;
}

function executionLogPattern() {
  return /\b(execution log|command failed|stack trace|raw output|step one|step two|执行流水|命令输出)\b/i;
}

function temporaryPromptPattern() {
  return /\b(temporary repair prompt|repair prompt|copyable prompt|paste back|临时修复提示)\b/i;
}

function rawTranscriptPattern() {
  return /\b(raw transcript|reviewer transcript|full transcript|完整记录|原始记录)\b/i;
}
