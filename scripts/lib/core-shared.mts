// @ts-nocheck
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveHarnessPaths } from "./harness-paths.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(__dirname, "../..");
export const legacyChecker = path.join(repoRoot, "dist/check-harness.mjs");
export const bundledCheckScript = legacyChecker;
export const visualMapFile = "visual_map.md";
export const legacyVisualRoadmapFile = "visual_roadmap.md";
export const lessonCandidatesFile = "lesson_candidates.md";
export const longRunningTaskContractFile = "long-running-task-contract.md";
export const taskContractMarker = "Task Contract: harness-task/v1";
export const builtinPresetRoot = path.join(repoRoot, "presets");
export function userPresetRootForHome(home = "") {
  return path.join(path.resolve(home || os.homedir()), ".coding-agent-harness/presets");
}
export const userPresetRoot = userPresetRootForHome();


export const supportedLocales = new Set(["zh-CN", "en-US"]);
export const allowedReviewDispositions = new Set([
  "open",
  "mitigated",
  "closed",
  "deferred",
  "accepted-risk",
  "not-reproducible",
  "out-of-scope",
]);
export const allowedTaskStates = new Set(["not_started", "planned", "in_progress", "review", "blocked", "done"]);
export const allowedTaskBudgets = new Set(["simple", "standard", "complex"]);
export const allowedPhaseStates = new Set(["planned", "in_progress", "review", "blocked", "done", "skipped"]);
export const allowedEvidenceStatus = new Set(["missing", "partial", "present", "waived"]);

export function normalizeTarget(input = ".") {
  const target = path.resolve(input);
  const siblingV2Manifest = path.join(path.dirname(target), "coding-agent-harness", "harness.yaml");
  const isDocsRoot =
    path.basename(target) === "docs" &&
    (fs.existsSync(path.join(target, "09-PLANNING")) || fs.existsSync(path.join(target, "11-REFERENCE")) || fs.existsSync(siblingV2Manifest));
  const isHarnessRoot = path.basename(target) === "coding-agent-harness" && fs.existsSync(path.join(target, "harness.yaml"));
  const normalized = {
    input: target,
    projectRoot: isDocsRoot || isHarnessRoot ? path.dirname(target) : target,
    docsRoot: isDocsRoot ? target : path.join(target, "docs"),
    docsOnly: isDocsRoot,
  };
  const paths = resolveHarnessPaths(normalized);
  const harnessRootRelative = toPosix(path.relative(paths.projectRoot, paths.harnessRoot)) || ".";
  return {
    ...normalized,
    ...paths,
    docsRoot: paths.version === 2 ? paths.harnessRoot : normalized.docsRoot,
    harnessRootRelative,
    structureVersion: paths.version,
    structureState: paths.version === 2 ? "v2" : "legacy",
    harness: paths,
  };
}

export function projectPresetRoot(targetInput = ".") {
  return path.join(normalizeTarget(targetInput).projectRoot, ".coding-agent-harness/presets");
}

export function toPosix(value) {
  return value.split(path.sep).join("/");
}

export function exists(target, relativePath) {
  return fs.existsSync(path.join(target.projectRoot, relativePath));
}

export function existsInDocs(target, relativePath) {
  return fs.existsSync(path.join(target.docsRoot, relativePath));
}

export function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

export function readJsonSafe(filePath, fallback = null, { onError } = {}) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (typeof onError === "function") onError(error);
    return fallback;
  }
}

export function readBundledTemplate(source) {
  const sourcePath = path.join(repoRoot, source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Bundled template missing: ${source}`);
  const content = fs.readFileSync(sourcePath, "utf8");
  if (!content.trim()) throw new Error(`Bundled template is empty: ${source}`);
  return content;
}

export function walkFiles(root, options = {}) {
  const results = [];
  if (!fs.existsSync(root)) return results;
  const dirFilter = typeof options.dirFilter === "function" ? options.dirFilter : () => true;
  function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        if ([".git", "node_modules", "tmp"].includes(entry)) continue;
        if (!dirFilter(entry, full)) continue;
        walk(full);
      } else {
        results.push(full);
      }
    }
  }
  walk(root);
  return results;
}

export function isArchivedHarnessPath(filePath) {
  const normalized = `/${toPosix(filePath)}/`;
  return normalized.includes("/_archive/") || normalized.includes("/governance/archive/");
}

export function normalizeLocale(locale = "en-US") {
  return supportedLocales.has(locale) ? locale : "en-US";
}

export function inferProjectLocale(target, fallback = "en-US") {
  const candidates = [
    path.join(target.projectRoot, "AGENTS.md"),
    path.join(target.projectRoot, "CLAUDE.md"),
    path.join(target.docsRoot, "AGENTS.md"),
    path.join(target.docsRoot, "Harness-Ledger.md"),
  ];
  for (const file of candidates) {
    const content = readFileSafe(file);
    if (/\p{Script=Han}/u.test(content)) return "zh-CN";
  }
  return normalizeLocale(fallback);
}

export function slug(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "item";
}

export function prefixedPath(target, filePath) {
  return `TARGET:${toPosix(path.relative(target.projectRoot, filePath))}`;
}

export function sanitizeText(value) {
  return String(value ?? "")
    .replace(/file:\/\/\/[^\s)"'`<>\]]+/g, "LOCAL_FILE_URL_REDACTED")
    .replaceAll("file://", "LOCAL_FILE_URL_REDACTED")
    .replace(/\/Users\/[^/\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/Volumes\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/(?:private\/)?tmp\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/var\/folders\/[^\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/\/home\/[^/\s)"'`<>\]]+(?:\/[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED")
    .replace(/[A-Za-z]:\\[^\s)"'`<>\]]+(?:\\[^\s)"'`<>\]]*)*/g, "LOCAL_PATH_REDACTED");
}

export function sanitizeDeep(value) {
  if (typeof value === "string") return sanitizeText(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeDeep(entry)]));
  }
  return value;
}

export function titleFromMarkdown(content, fallback) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

export function localizedTemplateSource(source, locale) {
  const localeSource = normalizeLocale(locale) === "zh-CN" ? source.replace(/^templates\//, "templates-zh-CN/") : source;
  return fs.existsSync(path.join(repoRoot, localeSource)) ? localeSource : source;
}

export function todayDate() {
  return localDate();
}

export function localDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const datePrefix = /^\d{4}-\d{2}-\d{2}-/;

export function nowTimestamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 16);
}

export function normalizeTaskId(value) {
  return slug(value || "task");
}

export function renderTaskTemplate(content, { taskId, title, locale, budget = "standard", moduleKey = "", preset = "none", presetVersion = "", evidenceBundle = "", longRunning = false, scaffoldProvenance = {}, taskAudit = {} }) {
  const date = todayDate();
  const provenance = {
    createdBy: scaffoldProvenance.createdBy || "harness new-task",
    command: scaffoldProvenance.command || "harness new-task [task-id] <target>",
    createdAt: scaffoldProvenance.createdAt || date,
    budget: scaffoldProvenance.budget || budget,
    templateSource: scaffoldProvenance.templateSource || "templates/planning/brief.md",
    exceptionReason: scaffoldProvenance.exceptionReason || "n/a",
  };
  return String(content)
    .replaceAll("{{TASK_ID}}", taskId)
    .replaceAll("{{TASK_TITLE}}", title)
    .replaceAll("{{DATE}}", date)
    .replaceAll("{{LOCALE}}", normalizeLocale(locale))
    .replaceAll("{{TASK_BUDGET}}", budget)
    .replaceAll("{{TASK_MODULE}}", moduleKey || "n/a")
    .replaceAll("{{TASK_PRESET}}", preset || "none")
    .replaceAll("{{TASK_PRESET_VERSION}}", presetVersion || "n/a")
    .replaceAll("{{TASK_EVIDENCE_BUNDLE}}", evidenceBundle || "n/a")
    .replaceAll("{{TASK_LONG_RUNNING}}", longRunning ? "yes" : "no")
    .replaceAll("{{SCAFFOLD_CREATED_BY}}", provenance.createdBy)
    .replaceAll("{{SCAFFOLD_COMMAND}}", provenance.command)
    .replaceAll("{{SCAFFOLD_CREATED_AT}}", provenance.createdAt)
    .replaceAll("{{SCAFFOLD_BUDGET}}", provenance.budget)
    .replaceAll("{{SCAFFOLD_TEMPLATE_SOURCE}}", provenance.templateSource)
    .replaceAll("{{SCAFFOLD_EXCEPTION_REASON}}", provenance.exceptionReason)
    .replaceAll("{{TASK_AUDIT_CREATED_BY}}", taskAudit["Created By"] || provenance.createdBy)
    .replaceAll("{{TASK_AUDIT_CREATED_AT}}", taskAudit["Created At"] || provenance.createdAt)
    .replaceAll("{{TASK_AUDIT_COMMAND_SHAPE}}", taskAudit["Command Shape"] || provenance.command)
    .replaceAll("{{TASK_AUDIT_BUDGET}}", taskAudit.Budget || provenance.budget)
    .replaceAll("{{TASK_AUDIT_TEMPLATE_SOURCE}}", taskAudit["Template Source"] || provenance.templateSource)
    .replaceAll("{{TASK_AUDIT_TASK_CREATOR}}", taskAudit["Task Creator"] || "n/a")
    .replaceAll("{{TASK_AUDIT_TASK_CREATOR_SOURCE}}", taskAudit["Task Creator Source"] || "git-unavailable")
    .replaceAll("{{TASK_AUDIT_HUMAN_REVIEW_STATUS}}", taskAudit["Human Review Status"] || "not-confirmed")
    .replaceAll("{{TASK_AUDIT_CONFIRMATION_ID}}", taskAudit["Confirmation ID"] || "n/a")
    .replaceAll("{{TASK_AUDIT_CONFIRMED_AT}}", taskAudit["Confirmed At"] || "n/a")
    .replaceAll("{{TASK_AUDIT_REVIEWER}}", taskAudit.Reviewer || "n/a")
    .replaceAll("{{TASK_AUDIT_REVIEWER_EMAIL}}", taskAudit["Reviewer Email"] || "n/a")
    .replaceAll("{{TASK_AUDIT_CONFIRM_TEXT}}", taskAudit["Confirm Text"] || "n/a")
    .replaceAll("{{TASK_AUDIT_EVIDENCE_CHECKED}}", taskAudit["Evidence Checked"] || "n/a")
    .replaceAll("{{TASK_AUDIT_REVIEW_COMMIT_SHA}}", taskAudit["Review Commit SHA"] || "n/a")
    .replaceAll("{{TASK_AUDIT_AUDIT_SOURCE}}", taskAudit["Audit Source"] || "native-index")
    .replaceAll("{{TASK_AUDIT_AUDIT_STATUS}}", taskAudit["Audit Status"] || "created")
    .replaceAll("{{TASK_AUDIT_EXCEPTION_REASON}}", taskAudit["Exception Reason"] || provenance.exceptionReason)
    .replaceAll("{{TASK_AUDIT_MESSAGE}}", taskAudit.Message || "n/a")
    .replaceAll("{{TASK_AUDIT_MIGRATION_STATUS}}", taskAudit["Migration Status"] || "native")
    .replaceAll("{{TASK_AUDIT_MIGRATED_FROM}}", taskAudit["Migrated From"] || "n/a")
    .replaceAll("{{TASK_AUDIT_LEGACY_EXTRA_FIELDS}}", taskAudit["Legacy Extra Fields"] || "{}")
    .replaceAll("{{TASK_AUDIT_MIGRATION_NOTES}}", taskAudit["Migration Notes"] || "n/a")
    .replaceAll("[simple / standard / complex]", budget)
    .replaceAll("[simple / standard / long-running / module-parallel]", budget)
    .replaceAll("[simple / complex]", budget)
    .replaceAll("[Task Name]", title)
    .replaceAll("[任务名称]", title);
}
