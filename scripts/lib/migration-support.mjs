import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  normalizeTarget,
  normalizeLocale,
  readFileSafe,
  existsInDocs,
  walkFiles,
  toPosix,
  sanitizeText,
  slug,
  visualMapFile,
} from "./core-shared.mjs";
import { readCapabilityRegistry, detectCapabilities } from "./capability-registry.mjs";
import { buildStatus } from "./check-profiles.mjs";
import { listTaskPlanPaths } from "./task-scanner.mjs";

export function migrationSampleFiles(target) {
  const candidates = [
    path.join(target.projectRoot, "AGENTS.md"),
    path.join(target.projectRoot, "CLAUDE.md"),
    path.join(target.docsRoot, "Harness-Ledger.md"),
    path.join(target.docsRoot, "05-TEST-QA/Regression-SSoT.md"),
    path.join(target.docsRoot, "09-PLANNING/Delivery-SSoT.md"),
  ];
  const taskPlans = listTaskPlanPaths(target).slice(0, 20);
  return [...candidates, ...taskPlans].filter((file) => fs.existsSync(file));
}

export function probeTargetLocale(target) {
  const files = migrationSampleFiles(target);
  let hanChars = 0;
  let latinWords = 0;
  const signals = [];
  for (const file of files) {
    const content = readFileSafe(file).slice(0, 20000);
    const han = content.match(/\p{Script=Han}/gu)?.length || 0;
    const latin = content.match(/\b[A-Za-z][A-Za-z-]{2,}\b/g)?.length || 0;
    hanChars += han;
    latinWords += latin;
    if (han > 0 || latin > 0) {
      signals.push({
        path: `TARGET:${toPosix(path.relative(target.projectRoot, file))}`,
        hanChars: han,
        latinWords: latin,
      });
    }
  }
  const suggested = hanChars > 0 && hanChars >= latinWords * 0.4 ? "zh-CN" : "en-US";
  const mixedLanguageDetected = hanChars >= 10 && latinWords >= 15;
  const confidence = mixedLanguageDetected ? "requires-human-choice" : hanChars > 0 || latinWords > 0 ? "medium" : "low";
  return { suggested, confidence, mixedLanguageDetected, signals: signals.slice(0, 12), totals: { hanChars, latinWords } };
}

export function inspectGitStatus(projectRoot) {
  const probe = spawnSync("git", ["-C", projectRoot, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8" });
  if (probe.status !== 0) return { inGit: false, branch: "", entries: [], staged: [], dirty: false };
  const result = spawnSync("git", ["-C", projectRoot, "status", "--short", "--branch"], { encoding: "utf8" });
  const lines = (result.stdout || "").split(/\r?\n/).filter(Boolean);
  const entries = lines.filter((line) => !line.startsWith("## "));
  const staged = entries.filter((line) => line.length >= 2 && line[0] !== " " && line[0] !== "?");
  return {
    inGit: true,
    branch: lines.find((line) => line.startsWith("## ")) || "",
    entries,
    staged,
    dirty: entries.length > 0,
    error: result.status === 0 ? "" : result.stderr || result.stdout || `git status exited ${result.status}`,
  };
}

export function ensureSessionDir(projectName, requestedDir = "") {
  const base = requestedDir
    ? path.resolve(requestedDir)
    : path.join(os.tmpdir(), `cah-migration-${slug(projectName)}-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(base, { recursive: true });
  return base;
}

export function statusCheckSummary(status) {
  return {
    status: status.checkState.status,
    failures: status.checkState.failures,
    warnings: status.checkState.warnings,
    legacyStatus: status.checkState.legacy?.status || "skipped",
    failureDetails: status.checkState.details.failures,
    warningDetails: status.checkState.details.warnings,
  };
}

export function strictDeferredFromStatus(strictStatus) {
  const failures = strictStatus.checkState.details.failures;
  if (strictStatus.checkState.status !== "fail") return null;
  return {
    owner: "migration-owner",
    trigger: "strict-cutover",
    nextAction: "Classify each strict failure as active migration work or accepted historical residual, then rerun migrate-verify.",
    reason: "Normal migration can be adopted while strict cutover remains deferred for historical contract gaps.",
    failureCount: failures.length,
    failures,
  };
}

export function writeMigrationReport(session) {
  const lines = [
    `# Coding Agent Harness Migration Report`,
    "",
    `- Target: ${session.target}`,
    `- Result: ${session.result}`,
    `- Locale: ${session.localeDecision.selected}`,
    `- Locale confidence: ${session.localeDecision.probe.confidence}`,
    `- Dashboard: ${session.dashboard?.indexPath || "not generated"}`,
    `- Normal check: ${session.checks.normal.status} (${session.checks.normal.failures} failures, ${session.checks.normal.warnings} warnings)`,
    `- Strict check: ${session.checks.strict.status} (${session.checks.strict.failures} failures, ${session.checks.strict.warnings} warnings)`,
    "",
    "## Capabilities",
    "",
    ...session.capabilities.map((capability) => `- ${capability.name}: ${capability.state || "configured"}`),
    "",
    "## Warning Summary",
    "",
    `- Total: ${session.plan.summary.warnings}`,
    `- Active task actions: ${session.plan.summary.taskActions}`,
    `- Visual map actions: ${session.plan.summary.visualMapActions || 0}`,
    `- Legacy visual-only tasks: ${session.plan.summary.legacyVisualOnly || 0}`,
    `- Weak briefs: ${session.plan.summary.weakBrief || 0}`,
    `- Unknown classifications: ${session.plan.summary.unknownClassification || 0}`,
    `- Full cutover eligible: ${session.plan.summary.fullCutoverEligible === true ? "yes" : "no"}`,
    `- Review schema gaps: ${session.plan.summary.reviewSchemaGaps}`,
    `- Legacy residuals: ${session.plan.summary.legacyResiduals}`,
    "",
    "## Strict Deferred",
    "",
  ];
  if (session.strictDeferred) {
    lines.push(`- Owner: ${session.strictDeferred.owner}`);
    lines.push(`- Trigger: ${session.strictDeferred.trigger}`);
    lines.push(`- Next action: ${session.strictDeferred.nextAction}`);
    lines.push(`- Failure count: ${session.strictDeferred.failureCount}`);
  } else {
    lines.push("- none");
  }
  lines.push("", "## Next Commands", "");
  for (const command of session.plan.nextCommands) lines.push(`- \`${command}\``);
  return `${lines.join("\n")}\n`;
}

export function validateFullCutoverSession(session, failures) {
  if (session.result !== "complete") failures.push(`full cutover requires result complete, got ${session.result || "(none)"}`);
  if (session.strictDeferred) failures.push("full cutover cannot have strictDeferred");
  if (session.checks?.strict?.status !== "pass") failures.push("full cutover requires recorded strict check pass");
  if (session.plan?.mode !== "declared-capability") failures.push(`full cutover requires migrate-plan mode declared-capability, got ${session.plan?.mode || "(none)"}`);
  const summary = session.plan?.summary || {};
  for (const [field, value] of [
    ["warnings", summary.warnings],
    ["visualMapActions", summary.visualMapActions],
    ["legacyVisualOnly", summary.legacyVisualOnly],
    ["unknownClassification", summary.unknownClassification],
    ["weakBrief", summary.weakBrief],
    ["missingCanonicalVisualMap", summary.missingCanonicalVisualMap],
    ["taskActions", summary.taskActions],
    ["reviewSchemaGaps", summary.reviewSchemaGaps],
    ["legacyReferenceGaps", summary.legacyReferenceGaps],
    ["legacyResiduals", summary.legacyResiduals],
  ]) {
    if (Number(value || 0) !== 0) failures.push(`full cutover requires ${field}=0, got ${value || 0}`);
  }
  if (summary.fullCutoverEligible !== true) failures.push("full cutover requires summary.fullCutoverEligible=true");
  if ((summary.recommendedCapabilities || []).length) {
    failures.push(`full cutover has recommended capabilities: ${summary.recommendedCapabilities.join(", ")}`);
  }
  if (!session.target || !fs.existsSync(session.target)) return;
  const status = buildStatus(session.target, { strict: true, strictLegacy: true });
  if (status.checkState.status !== "pass") failures.push(`full cutover current strict status is ${status.checkState.status}`);
  for (const task of status.tasks) {
    if (task.briefQuality?.status !== "pass") failures.push(`${task.path} weak brief: ${(task.briefQuality?.issues || []).join(", ")}`);
    if (task.migrationClassification === "unknown-needs-human") failures.push(`${task.path} has unknown migration classification`);
    if (task.visualMapStatus === "legacy-only") failures.push(`${task.path} only has legacy visual_roadmap.md`);
    if (["active", "reopened", "current-evidence", "historical-with-diagram"].includes(task.migrationClassification) && task.visualMapSource !== "canonical") {
      failures.push(`${task.path} needs canonical visual_map.md for ${task.migrationClassification}`);
    }
  }
}

export function recommendedMigrationCapabilities(status, target, registry) {
  const declared = new Set(registry.capabilities.map((capability) => capability.name));
  const detected = new Set(detectCapabilities(target));
  const recommendations = [];
  if (!declared.has("safe-adoption")) {
    recommendations.push({
      name: "safe-adoption",
      priority: "required",
      reason: "The project has legacy harness artifacts or missing v1 registry; migration must preserve existing documents.",
    });
  }
  if (detected.has("long-running-task") && !declared.has("long-running-task")) {
    recommendations.push({
      name: "long-running-task",
      priority: "candidate",
      reason: "Long-running task artifacts exist; declare only if active work still uses continuous execution contracts.",
    });
  }
  const moduleRegistry = existsInDocs(target, "09-PLANNING/Module-Registry.md");
  const modulePlans = walkFiles(path.join(target.docsRoot, "09-PLANNING/MODULES")).some((file) => file.endsWith("module_plan.md"));
  if ((moduleRegistry || modulePlans) && !declared.has("module-parallel")) {
    recommendations.push({
      name: "module-parallel",
      priority: "candidate",
      reason: "Module planning artifacts already exist; verify owners, write scopes, and registry sync before declaring.",
    });
  }
  if (status.checkState.details.warnings.some((warning) => /review/i.test(warning)) && !declared.has("adversarial-review")) {
    recommendations.push({
      name: "adversarial-review",
      priority: "consider",
      reason: "Review artifacts exist but may not use the v1 schema; declare when active release or architecture reviews are migrated.",
    });
  }
  return recommendations;
}

export function migrationPhases({ locale, recommendedCapabilities }) {
  return [
    {
      id: "MP-01",
      title: "Stabilize legacy state",
      goal: "Record current harness state without rewriting historical documents.",
      actions: ["Run safe-adoption dry-run", "Confirm locale", "Confirm current git status is understood"],
      exitCriteria: [".harness-capabilities.json exists", "Existing AGENTS.md/CLAUDE.md/history are preserved"],
    },
    {
      id: "MP-02",
      title: "Choose capability cutover",
      goal: "Declare only capabilities that match real project facts.",
      actions: recommendedCapabilities.map((capability) => `Evaluate ${capability.name}: ${capability.reason}`),
      exitCriteria: ["Capability registry has no accidental declarations", "Every optional capability has a project fact trigger"],
    },
    {
      id: "MP-03",
      title: "Classify tasks from SSoT before repairing contracts",
      goal: "Use Harness Ledger, Closeout SSoT, Regression SSoT, task progress, walkthroughs, reviews, and git history to decide which tasks are actually current.",
      actions: [
        "Classify taskActions as current-active, closed-with-evidence, closed-with-residual, superseded, or unknown-history",
        "Add brief.md, execution_strategy.md, visual_map.md only for current-active or reopened tasks",
        "Route closed historical gaps as residuals instead of adding fake current templates",
      ],
      exitCriteria: [
        "Every repaired task cites SSoT/progress/walkthrough/review/git evidence",
        "Closed historical tasks remain unchanged and have residual routing",
        "Active task status is readable by status/dashboard",
      ],
    },
    {
      id: "MP-04",
      title: "Introduce modules if needed",
      goal: "Move from single-line task history to module ownership only when the project has real independent domains.",
      actions: ["Identify modules by product/domain, not file folders", "Create module registry after owner/write-scope decisions", "Route shared updates through coordinator"],
      exitCriteria: ["Module owners and write scopes are explicit", "No worker owns shared global ledgers without coordinator sync"],
    },
    {
      id: "MP-05",
      title: "Upgrade current reviews and references",
      goal: "Bring only active review and reference gates to v1 schema.",
      actions: ["Upgrade release-blocking reviews first", "Create missing reference files only for adopted capabilities", "Record accepted historical gaps as residuals"],
      exitCriteria: ["Current release gates have v1 review evidence", "Legacy-only gaps are categorized as residuals"],
    },
    {
      id: "MP-06",
      title: "Strict cutover",
      goal: "Turn strict checks into the blocking gate after migration scope is complete.",
      actions: ["Run normal check until warnings are understood", "Run --strict after active work is migrated", "Keep residual owner/action/status for deferred history"],
      exitCriteria: ["Strict check passes or every remaining failure has owner/action/status"],
    },
  ].map((phase) => ({
    ...phase,
    locale,
  }));
}

function splitWarningMessage(message) {
  return String(message || "")
    .split(/\n-\s+/)
    .map((item, index) => (index === 0 ? item : `- ${item}`))
    .filter(Boolean);
}

function warningTitle(message) {
  if (/missing execution_strategy\.md/i.test(message)) return "Missing execution strategy";
  if (/missing visual_map\.md|Visual Map/i.test(message)) return "Missing visual map";
  if (/missing visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Missing legacy visual roadmap";
  if (/legacy-compat/i.test(message)) return "Legacy compatibility mode";
  if (/legacy check failed/i.test(message)) return "Legacy checker finding";
  if (/review\.md missing/i.test(message)) return "Review schema gap";
  if (/findings table missing/i.test(message)) return "Review findings schema gap";
  return String(message).split(":")[0].slice(0, 96);
}

function warningAffected(message) {
  const target = String(message).match(/(?:docs|\.harness-private)\/[^\s:]+/);
  return target ? target[0] : "project";
}

function warningAction(message) {
  if (/execution_strategy\.md/i.test(message)) return "Add standalone execution strategy file.";
  if (/visual_map\.md|Visual Map/i.test(message)) return "Add standalone visual map file.";
  if (/visual_roadmap\.md|Visual Roadmap/i.test(message)) return "Rewrite legacy visual_roadmap.md into canonical visual_map.md.";
  if (/review\.md missing/i.test(message)) return "Update review.md to v1 review schema.";
  if (/legacy/i.test(message)) return "Review manually; do not auto-migrate.";
  return "Inspect source document and decide whether to adopt v1 contract.";
}
