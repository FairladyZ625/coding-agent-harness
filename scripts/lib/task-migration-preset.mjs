import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  repoRoot,
  visualMapFile,
  toPosix,
} from "./core-shared.mjs";
import { verifyMigrationSession } from "./migration-planner.mjs";
import {
  buildPresetAudit,
  renderPresetTemplate,
} from "./preset-registry.mjs";

export function readMigrationSession(fromSession) {
  const sessionPath = path.resolve(fromSession || "");
  if (!sessionPath || !fs.existsSync(sessionPath)) throw new Error(`Migration session not found: ${fromSession}`);
  let session;
  try {
    session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid migration session JSON: ${error.message}`);
  }
  if (session.operation !== "migrate-run") throw new Error("legacy-migration preset requires a migrate-run session");
  if (session.planOnly) throw new Error("legacy-migration preset cannot use plan-only session evidence");
  if (!session.target || !fs.existsSync(session.target)) throw new Error(`Migration session target missing: ${session.target || "(none)"}`);
  return { ...session, sourcePath: sessionPath };
}

export function legacyMigrationPresetContext({ presetPackage, target, taskDir, taskId, session }) {
  const stamp = String(session.generatedAt || new Date().toISOString()).replace(/[^0-9A-Za-z-]+/g, "-").replace(/-+$/g, "");
  const evidenceBundle = toPosix(path.relative(target.projectRoot, path.join(taskDir, "evidence", stamp || "session")));
  const targetLevel = presetPackage.task?.migrationTargetLevel || "migration-baseline";
  const achievedLevel = session.strictDeferred ? "migration-deferred" : session.result === "complete" ? "migration-full-cutover" : "migration-baseline";
  const verifyResult = verifyMigrationSession(session.sourcePath, { fullCutover: false });
  const audit = buildPresetAudit(presetPackage, {
    taskId,
    targetRoot: target.projectRoot,
    entrypoint: "newTask",
  });
  return {
    kind: presetPackage.task?.kind || "project-migration",
    preset: presetPackage.id,
    presetVersion: String(presetPackage.version),
    presetPackage,
    audit,
    migrationTargetLevel: targetLevel,
    migrationAchievedLevel: achievedLevel,
    evidenceBundle,
    session,
    evidenceFiles: legacyMigrationEvidenceFiles({ target, session, evidenceBundle, verifyResult, presetPackage, audit }),
  };
}

export function renderPresetTaskTemplate(destination, content, presetContext) {
  if (!presetContext) return content;
  if (destination === "task_plan.md") content = renderLegacyMigrationTaskPlan(content, presetContext);
  const templateKey = {
    task_plan: "taskPlanAppend",
    "task_plan.md": "taskPlanAppend",
    execution_strategy: "executionStrategyAppend",
    "execution_strategy.md": "executionStrategyAppend",
    findings: "findingsSeed",
    "findings.md": "findingsSeed",
    review: "reviewSeed",
    "review.md": "reviewSeed",
    [visualMapFile]: "visualMapAppend",
  }[destination];
  const templatePath = presetContext.presetPackage?.newTaskTemplates?.[templateKey];
  if (templatePath) {
    return `${content.trimEnd()}\n\n${renderPresetTemplate(presetContext.presetPackage, templatePath, presetTemplateValues(presetContext)).trimEnd()}\n`;
  }
  return content;
}

function legacyMigrationEvidenceFiles({ target, session, evidenceBundle, verifyResult, presetPackage, audit }) {
  const files = [];
  const addJson = (name, value, source = "session") => files.push({
    relativePath: path.join(evidenceBundle, name),
    source,
    content: `${JSON.stringify(value, null, 2)}\n`,
  });
  const addText = (name, value, source = "generated") => files.push({
    relativePath: path.join(evidenceBundle, name),
    source,
    content: `${String(value || "").trim()}\n`,
  });
  addJson("session.json", session, "session.json");
  addJson("migrate-plan.json", session.plan || {}, "migrate-plan.json");
  addJson("normal-check.json", session.checks?.normal || {}, "session.checks.normal");
  addJson("strict-check.json", session.checks?.strict || {}, "session.checks.strict");
  addJson("migrate-verify.json", verifyResult, "migrate-verify");
  addJson("migration-ledger.json", migrationLedger({ session, presetPackage, verifyResult }), "preset-ledger");
  addJson("preset-manifest.json", {
    id: presetPackage.id,
    version: presetPackage.version,
    manifestPath: presetPackage.manifestRelativePath,
    manifestSha256: presetPackage.manifestSha256,
    compatibleBudgets: presetPackage.compatibleBudgets,
    entrypoints: presetPackage.entrypoints,
    audit: presetPackage.audit,
    writeScopes: presetPackage.writeScopes,
  }, "preset.yaml");
  addJson("preset-audit.json", audit, "preset-audit");
  addJson("write-scope.json", {
    preset: presetPackage.id,
    scopes: presetPackage.writeScopes,
    entrypointScopes: audit.writeScopes,
  }, "preset.yaml");
  addText("dashboard.hash.txt", dashboardHash(session.dashboard?.indexPath || ""), "dashboard");
  addText("target-git-status.txt", JSON.stringify(session.git?.after || {}, null, 2), "session.git.after");
  addText("target-commit.txt", targetCommit(target.projectRoot), "git");
  addText("harness-version.txt", packageVersion(), "package.json");
  addText("generated-at.txt", new Date().toISOString(), "generated");
  return files;
}

function migrationLedger({ session, presetPackage, verifyResult }) {
  const summary = session.plan?.summary || {};
  return {
    schemaVersion: "legacy-migration-ledger/v2",
    preset: presetPackage.id,
    presetVersion: presetPackage.version,
    staticDashboardRole: "evidence-snapshot",
    workbenchRole: "human-confirmation-control-plane",
    phases: [
      {
        id: "baseline",
        state: verifyResult.status === "pass" ? "done" : "blocked",
        evidence: ["session.json", "migrate-plan.json", "normal-check.json", "strict-check.json", "migrate-verify.json"],
      },
      {
        id: "mechanical-scaffold",
        state: "planned",
        automationAllowed: true,
        outputPolicy: "May add missing task contract files and placeholders, but must not mark semantic reconstruction complete.",
        counters: {
          taskActions: Number(summary.taskActions || 0),
          reviewSchemaGaps: Number(summary.reviewSchemaGaps || 0),
          legacyReferenceGaps: Number(summary.legacyReferenceGaps || 0),
        },
      },
      {
        id: "semantic-reconstruction",
        state: "planned",
        automationAllowed: false,
        evidenceLedgerRequired: true,
        requiredEvidenceSources: ["task_plan.md", "progress.md", "review.md", "walkthrough", "Harness-Ledger", "git"],
        completionRule: "Each task needs explicit evidenceSources and reviewState before semantic completion.",
      },
      {
        id: "cutover-review",
        state: "planned",
        humanConfirmationRequired: true,
        workbenchQueueRequired: true,
        staticDashboardRole: "evidence-snapshot",
      },
    ],
    counters: {
      warnings: Number(summary.warnings || 0),
      taskActions: Number(summary.taskActions || 0),
      reviewSchemaGaps: Number(summary.reviewSchemaGaps || 0),
      legacyReferenceGaps: Number(summary.legacyReferenceGaps || 0),
      legacyResiduals: Number(summary.legacyResiduals || 0),
      fullCutoverEligible: summary.fullCutoverEligible === true,
    },
    queue: [],
  };
}

function dashboardHash(indexPath) {
  if (!indexPath || !fs.existsSync(indexPath)) return "missing";
  const hash = crypto.createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex");
  return `sha256:${hash}`;
}

function targetCommit(projectRoot) {
  const result = spawnSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "n/a";
}

function packageVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).version || "unknown";
  } catch {
    return "unknown";
  }
}

function presetTemplateValues(context) {
  return {
    preset: context.preset,
    presetVersion: context.presetVersion,
    kind: context.kind,
    evidenceBundle: context.evidenceBundle,
    migrationTargetLevel: context.migrationTargetLevel,
    migrationAchievedLevel: context.migrationAchievedLevel,
    strictDeferred: context.session.strictDeferred ? "yes" : "no",
    fullCutoverClaimAllowed: context.migrationAchievedLevel === "migration-full-cutover" ? "yes" : "no",
    warnings: context.session.plan?.summary?.warnings || 0,
    taskActions: context.session.plan?.summary?.taskActions || 0,
    legacyResiduals: context.session.plan?.summary?.legacyResiduals || 0,
  };
}

function renderLegacyMigrationTaskPlan(content, context) {
  const metadata = [
    "Selected budget: complex",
    `Task Kind: ${context.kind}`,
    `Task Preset: ${context.preset}`,
    `Preset Version: ${context.presetVersion}`,
    `Migration Target Level: ${context.migrationTargetLevel}`,
    `Migration Achieved Level: ${context.migrationAchievedLevel}`,
    `Evidence Bundle: ${context.evidenceBundle}`,
  ].join("\n");
  let next = String(content).replace(/^(Task Contract:\s*harness-task\/v1\s*)$/im, `$1\n${metadata}`);
  next = next.replace("[State the outcome this task must deliver in one sentence.]", "Create a controlled Harness v1 migration task from the recorded migrate-run session without rewriting history automatically.");
  next = next.replace("[用一句话说明本任务完成后应达到的状态。]", "基于已记录的 migrate-run session 创建受控的 Harness v1 迁移任务，不自动改写历史材料。");
  return next;
}
