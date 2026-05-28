// Preset task rendering stays behavior-first until preset/session domain types are modeled.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { harnessPathContext, readJsonSafe, repoRoot, resolveHarnessPathTemplate, taskContractMarker, toPosix, visualMapFile } from "./core-shared.mjs";
import { verifyMigrationSession } from "./migration-planner.mjs";
import { buildPresetAudit, renderPresetTemplate } from "./preset-registry.mjs";
import {
  legacyPath,
  legacyPlanningRoot,
  legacyTaskRoot,
  v2HarnessRoot,
} from "./harness-paths.mjs";
import type {
  PresetContext,
  PresetGeneratedFile,
  PresetPackage,
  PresetResolvedInputs,
  PresetResource,
  PresetResourceIndexRows,
  PresetScopeResolution,
  PresetTarget,
  PresetTemplateValues,
} from "./types/preset.js";

type PresetInputOptions = {
  cliArgs?: string[];
  fromSession?: string;
  targetInput?: string;
};

type EvaluateTemplateOptions = {
  taskId?: string;
  taskTitle?: string;
  moduleKey?: string;
  target?: PresetTarget | null;
};

type BuildPresetContextOptions = {
  target: PresetTarget;
  taskDir: string;
  taskId: string;
  taskTitle: string;
  resolvedInputs: PresetResolvedInputs;
  evaluatedValues: PresetTemplateValues;
};

type PresetAddFile = (relativePath: string, source: string, content: string) => void;

type MigrationSessionInput = Record<string, unknown> & {
  operation?: string;
  sourcePath?: string;
  result?: string;
  strictDeferred?: boolean;
  generatedAt?: string;
  plan?: {
    summary?: Record<string, unknown>;
  };
  dashboard?: {
    indexPath?: string;
  };
  git?: {
    after?: unknown;
  };
};

export function resolvePresetInputs(preset: PresetPackage, { cliArgs = [], fromSession = "", targetInput = "" }: PresetInputOptions = {}) {
  const inputs: PresetResolvedInputs = {};
  let targetFromInput = "";
  for (const [name, declaration] of Object.entries(preset.inputs || {})) {
    const rawValue = inputValue(declaration, { cliArgs, fromSession });
    if ((rawValue == null || rawValue === "") && declaration.required) {
      throw new Error(`Missing required preset input ${declaration.flag || name}`);
    }
    if (declaration.type === "flag") {
      inputs[name] = rawValue === true;
      continue;
    }
    if (declaration.type === "json-file") {
      if (rawValue == null || rawValue === "") {
        inputs[name] = null;
        continue;
      }
      const filePath = path.resolve(String(rawValue));
      if (!fs.existsSync(filePath)) throw new Error(`Preset input file not found for ${declaration.flag || name}: ${rawValue}`);
      let readError: unknown = null;
      const value = readJsonSafe(filePath, null, { onError: (error: unknown) => { readError = error; } });
      if (value === null) throw new Error(`Invalid preset JSON input ${declaration.flag || name}: ${errorMessage(readError)}`);
      const sessionInput = asRecord(value);
      if (declaration.validateOperation && sessionInput.operation !== declaration.validateOperation) {
        throw new Error(`${preset.id} preset requires ${declaration.flag || name} operation ${declaration.validateOperation}`);
      }
      if (declaration.rejectPlanOnly && sessionInput.planOnly) throw new Error(`${preset.id} preset cannot use plan-only session evidence`);
      if (declaration.requireTarget && (!sessionInput.target || !fs.existsSync(String(sessionInput.target)))) throw new Error(`Preset input target missing: ${sessionInput.target || "(none)"}`);
      if (declaration.targetFromSession) targetFromInput = String(sessionInput.target || targetFromInput);
      inputs[name] = { ...sessionInput, sourcePath: filePath };
      continue;
    }
    inputs[name] = rawValue == null || rawValue === "" ? declaration.default || "" : String(rawValue);
  }
  return {
    inputs,
    targetInput: targetFromInput || targetInput,
  };
}

export function evaluateTemplateValues(preset: PresetPackage, resolvedInputs: PresetResolvedInputs, { taskId = "", taskTitle = "", moduleKey = "", target = null }: EvaluateTemplateOptions = {}): PresetTemplateValues {
  const computed = computedValues(preset, resolvedInputs);
  const base = {
    inputs: resolvedInputs,
    computed,
    preset: {
      id: preset.id,
      version: String(preset.version),
      source: preset.source,
    },
    task: {
      id: taskId,
      title: taskTitle,
      moduleKey,
      kind: preset.task?.kind || "general",
    },
    paths: target ? harnessPathContext(target) : {},
  };
  const values: PresetTemplateValues = {
    preset: preset.id,
    presetVersion: String(preset.version),
    kind: preset.task?.kind || "general",
    paths: base.paths,
    ...computed,
  };
  for (const [name, declaration] of Object.entries(preset.templateValues || {})) {
    if (Object.prototype.hasOwnProperty.call(declaration, "from")) {
      values[name] = getPath(base, declaration.from);
    } else if (Object.prototype.hasOwnProperty.call(declaration, "value")) {
      values[name] = declaration.value;
    } else if (Object.prototype.hasOwnProperty.call(declaration, "default")) {
      values[name] = declaration.default;
    }
  }
  return values;
}

export function buildPresetContext(preset: PresetPackage, { target, taskDir, taskId, taskTitle, resolvedInputs, evaluatedValues }: BuildPresetContextOptions): PresetContext {
  const taskRelativeDir = toPosix(path.relative(target.projectRoot, taskDir));
  const evidenceBundle = presetEvidenceBundle(preset, { target, taskDir, evaluatedValues });
  const resolvedScopes = resolvePresetScopes(preset, target);
  const audit = buildPresetAudit(preset, {
    taskId,
    targetRoot: target.projectRoot,
    entrypoint: "newTask",
    writeScopes: resolvedScopes.entrypoints.newTask || resolvedScopes.writeScopes,
    resolvedInputs,
  });
  const context: PresetContext = {
    kind: String(evaluatedValues.kind || preset.task?.kind || "general"),
    preset: preset.id,
    presetVersion: String(preset.version),
    presetPackage: preset,
    audit,
    resolvedInputs,
    taskId,
    taskTitle,
    taskRelativeDir,
    values: {
      ...evaluatedValues,
      evidenceBundle,
    },
    migrationTargetLevel: evaluatedValues.migrationTargetLevel || "",
    migrationAchievedLevel: evaluatedValues.migrationAchievedLevel || "",
    evidenceBundle,
  };
  context.evidenceFiles = generateEvidenceFiles(preset, { target, context });
  const resources = generateResourceFiles(preset, { target, context });
  context.resourceFiles = resources.files;
  context.resourceIndexRows = resources.indexRows;
  return context;
}

export function renderPresetTaskTemplate(destination: string, content: string, presetContext?: PresetContext | null): string {
  if (!presetContext) return content;
  let next = String(content);
  if (destination === "task_plan.md" || destination === "task_plan") {
    next = renderPresetMetadata(next, presetContext);
  }
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
  const templatePath = templateKey ? presetContext.presetPackage?.newTaskTemplates?.[templateKey] : "";
  if (templatePath) {
    next = `${next.trimEnd()}\n\n${renderPresetTemplate(presetContext.presetPackage, templatePath, presetContext.values).trimEnd()}\n`;
  }
  if (destination === "task_plan.md" || destination === "task_plan") {
    next = appendPresetRequiredReads(next, presetContext);
  }
  return next;
}

export function renderPresetResourceIndex(content: string, kind: string, rows: Array<Record<string, string>>): string {
  if (!rows.length) return content;
  const renderedRows = rows.map((row) => kind === "references"
    ? `| ${markdownTableCell(row.id)} | ${markdownTableCell(row.type || "preset")} | ${markdownTableCell(row.path)} | ${markdownTableCell(row.summary)} | ${markdownTableCell(row.usedBy || "coordinator")} |`
    : `| ${markdownTableCell(row.id)} | ${markdownTableCell(row.type || "preset")} | ${markdownTableCell(row.path)} | ${markdownTableCell(row.summary)} | ${markdownTableCell(row.producedBy || "preset")} |`);
  const base = String(content || "").trim() ? String(content || "") : presetIndexSkeleton(kind);
  const lines = base.trimEnd().split(/\r?\n/);
  const separatorIndex = lines.findIndex((line) => /^\|\s*---/.test(line));
  if (separatorIndex >= 0) {
    lines.splice(separatorIndex + 1, 0, ...renderedRows);
    return `${lines.join("\n")}\n`;
  }
  return `${String(content || "").trimEnd()}\n${renderedRows.join("\n")}\n`;
}

export function assertPresetWriteScope(preset: PresetPackage, relativePath: string, target: PresetTarget | null = null): void {
  return assertPresetWriteScopeForTarget(preset, relativePath, target);
}

export function assertPresetWriteScopeForTarget(preset: PresetPackage, relativePath: string, target: PresetTarget | null = null): void {
  const normalized = toPosix(path.normalize(relativePath));
  if (normalized.startsWith("../") || path.isAbsolute(normalized)) {
    throw new Error(`Preset write scope violation for ${relativePath}`);
  }
  const scopes = target ? resolvePresetScopes(preset, target).writeScopes : preset.writeScopes.flatMap((scope) => normalizedPresetScopes(scope.path));
  if (!scopes.some((candidate) => matchesScope(candidate, normalized))) {
    throw new Error(`Preset write scope violation for ${normalized}`);
  }
}

export function resolvePresetScopes(preset: PresetPackage, target: PresetTarget | null): PresetScopeResolution {
  const writeScopes = preset.writeScopes.flatMap((scope) => normalizedPresetScopes(scope.path, target));
  const entrypoints: Record<string, string[]> = {};
  for (const [name, entrypoint] of Object.entries(preset.entrypoints || {})) {
    entrypoints[name] = (entrypoint.writes || []).flatMap((scope) => normalizedPresetScopes(scope, target));
  }
  const reads: Record<string, string[]> = {};
  for (const [name, entrypoint] of Object.entries(preset.entrypoints || {})) {
    reads[name] = (entrypoint.reads || []).flatMap((scope) => normalizedPresetScopes(scope, target));
  }
  return { writeScopes, entrypoints, reads };
}

function normalizedPresetScopes(scopePath: string, target: PresetTarget | null = null): string[] {
  const raw = String(scopePath || "");
  const scope = target && raw.includes("{{")
    ? resolveHarnessPathTemplate(raw, target, "preset scope")
    : toPosix(path.normalize(raw));
  const taskRoot = legacyPath(legacyTaskRoot);
  const planningRoot = legacyPath(legacyPlanningRoot);
  const scopes = [scope];
  if (scope.startsWith(taskRoot)) scopes.push(`${v2HarnessRoot}/planning/tasks${scope.slice(taskRoot.length)}`);
  else if (scope.startsWith(planningRoot)) scopes.push(`${v2HarnessRoot}/planning${scope.slice(planningRoot.length)}`);
  return scopes;
}

function inputValue(declaration: PresetPackage["inputs"][string], { cliArgs, fromSession }: { cliArgs: string[]; fromSession: string }): unknown {
  if (declaration.flag === "--from-session" && fromSession) return fromSession;
  if (!declaration.flag) return declaration.default;
  const index = cliArgs.indexOf(declaration.flag);
  if (index < 0) return declaration.default;
  if (declaration.type === "flag") return true;
  const value = cliArgs[index + 1];
  if (!value || value.startsWith("--")) return "";
  return value;
}

function computedValues(preset: PresetPackage, inputs: PresetResolvedInputs): PresetTemplateValues {
  const values: PresetTemplateValues = {};
  const migrationSession = Object.values(inputs).find((value): value is MigrationSessionInput => isRecord(value) && value.operation === "migrate-run");
  if (migrationSession) {
    values.migrationTargetLevel = preset.task?.migrationTargetLevel || "migration-baseline";
    values.migrationAchievedLevel = migrationSession.strictDeferred ? "migration-deferred" : migrationSession.result === "complete" ? "migration-full-cutover" : "migration-baseline";
    values.strictDeferred = migrationSession.strictDeferred ? "yes" : "no";
    values.fullCutoverClaimAllowed = values.migrationAchievedLevel === "migration-full-cutover" ? "yes" : "no";
    values.warnings = migrationSession.plan?.summary?.warnings || 0;
    values.taskActions = migrationSession.plan?.summary?.taskActions || 0;
    values.legacyResiduals = migrationSession.plan?.summary?.legacyResiduals || 0;
    values.generatedAt = migrationSession.generatedAt || "";
  }
  return values;
}

function presetEvidenceBundle(preset: PresetPackage, { target, taskDir, evaluatedValues }: { target: PresetTarget; taskDir: string; evaluatedValues: PresetTemplateValues }): string {
  const bundleDir = String(preset.evidence?.bundleDir || "artifacts/preset").trim();
  const stampSource = evaluatedValues.generatedAt || new Date().toISOString();
  const stamp = String(stampSource).replace(/[^0-9A-Za-z-]+/g, "-").replace(/-+$/g, "");
  const relativeTaskDir = toPosix(path.relative(target.projectRoot, taskDir));
  return toPosix(path.join(relativeTaskDir, bundleDir, stamp || "generated"));
}

function generateEvidenceFiles(preset: PresetPackage, { target, context }: { target: PresetTarget; context: PresetContext }): PresetGeneratedFile[] {
  const files: PresetGeneratedFile[] = [];
  const add: PresetAddFile = (relativePath, source, content) => {
    assertPresetWriteScope(preset, relativePath, target);
    files.push({ relativePath, source, content });
  };
  const evidenceFiles = preset.evidence?.files || {};
  for (const [name, declaration] of Object.entries(evidenceFiles)) {
    addEvidenceFile({ name, declaration, preset, target, context, add });
  }
  for (const name of preset.audit.evidenceFiles || []) {
    if (files.some((file) => path.basename(file.relativePath) === name)) continue;
    addAuditFile({ name, preset, context, add });
  }
  return files;
}

function generateResourceFiles(preset: PresetPackage, { target, context }: { target: PresetTarget; context: PresetContext }): { files: PresetGeneratedFile[]; indexRows: PresetResourceIndexRows } {
  const files: PresetGeneratedFile[] = [];
  const indexRows: PresetResourceIndexRows = { references: [], artifacts: [] };
  const add: PresetAddFile = (relativePath, source, content) => {
    assertPresetWriteScope(preset, relativePath, target);
    files.push({ relativePath, source, content });
  };
  for (const resource of Object.values(preset.resources?.references || {})) {
    const relativePath = toPosix(path.join(context.taskRelativeDir, resource.path));
    add(relativePath, resource.source || resource.template, renderResourceContent(preset, resource, context));
    indexRows.references.push(renderReferenceIndexRow(resource, relativePath, context.values));
  }
  for (const resource of Object.values(preset.resources?.artifacts || {})) {
    const relativePath = toPosix(path.join(context.taskRelativeDir, resource.path));
    add(relativePath, resource.source || resource.template, renderResourceContent(preset, resource, context));
    indexRows.artifacts.push(renderArtifactIndexRow(resource, relativePath, context.values));
  }
  return { files, indexRows };
}

function renderResourceContent(preset: PresetPackage, resource: PresetResource, context: PresetContext): string {
  if (resource.template) return renderPresetTemplate(preset, resource.template, context.values);
  return fs.readFileSync(path.join(preset.directory, resource.source), "utf8");
}

function renderReferenceIndexRow(resource: PresetResource, relativePath: string, values: PresetTemplateValues): PresetResourceIndexRows["references"][number] {
  return {
    id: resource.index.id,
    type: renderInline(resource.index.type, values),
    path: `TARGET:${relativePath}`,
    summary: renderInline(resource.index.summary, values),
    usedBy: renderInline(resource.index.usedBy, values),
  };
}

function renderArtifactIndexRow(resource: PresetResource, relativePath: string, values: PresetTemplateValues): PresetResourceIndexRows["artifacts"][number] {
  return {
    id: resource.index.id,
    type: renderInline(resource.index.type, values),
    path: `TARGET:${relativePath}`,
    summary: renderInline(resource.index.summary, values),
    producedBy: renderInline(resource.index.producedBy || "preset", values),
  };
}

function appendPresetRequiredReads(content: string, context: PresetContext): string {
  const requiredReads = context.presetPackage?.context?.requiredReads || [];
  if (!requiredReads.length) return content;
  const rowsById = new Map((context.resourceIndexRows?.references || []).map((row) => [row.id, row]));
  const rows = requiredReads.map((id) => {
    const row = rowsById.get(id);
    return `| ${markdownTableCell(id)} | ${markdownTableCell(row?.path || "references/INDEX.md")} | ${markdownTableCell(row?.summary || "Preset-provided reference")} |`;
  });
  return `${content.trimEnd()}\n\n## Preset Required Reads\n\nOpen \`references/INDEX.md\`, then read these preset-provided references before implementation.\n\n| Reference | Path | Why |\n| --- | --- | --- |\n${rows.join("\n")}\n`;
}

function addEvidenceFile({ name, declaration, preset, target, context, add }: {
  name: string;
  declaration: NonNullable<PresetPackage["evidence"]["files"]>[string];
  preset: PresetPackage;
  target: PresetTarget;
  context: PresetContext;
  add: PresetAddFile;
}): void {
  const fileName = declaration.path || `${name}.txt`;
  const relativePath = toPosix(path.join(context.evidenceBundle, fileName));
  const type = declaration.type || "text";
  if (type === "input-json") {
    add(relativePath, declaration.value || "input-json", `${JSON.stringify(getPath({ inputs: context.resolvedInputs }, declaration.value || ""), null, 2)}\n`);
  } else if (type === "json") {
    add(relativePath, declaration.value || "json", `${JSON.stringify(getPath({ inputs: context.resolvedInputs, values: context.values }, declaration.value || ""), null, 2)}\n`);
  } else if (type === "text") {
    add(relativePath, declaration.value || "text", `${String(getPath({ inputs: context.resolvedInputs, values: context.values }, declaration.value || "") || "").trim()}\n`);
  } else if (type === "migration-verify") {
    const session = migrationSession(context);
    add(relativePath, "migrate-verify", `${JSON.stringify(verifyMigrationSession(session.sourcePath, { fullCutover: false }), null, 2)}\n`);
  } else if (type === "migration-ledger") {
    const session = migrationSession(context);
    const verifyResult = verifyMigrationSession(session.sourcePath, { fullCutover: false });
    add(relativePath, "preset-ledger", `${JSON.stringify(migrationLedger({ session, preset, verifyResult }), null, 2)}\n`);
  } else if (type === "preset-manifest") {
    add(relativePath, "preset.yaml", `${JSON.stringify(presetManifestSnapshot(preset), null, 2)}\n`);
  } else if (type === "preset-audit") {
    add(relativePath, "preset-audit", `${JSON.stringify(context.audit, null, 2)}\n`);
  } else if (type === "write-scope") {
    add(relativePath, "preset.yaml", `${JSON.stringify({ preset: preset.id, scopes: preset.writeScopes, entrypointScopes: context.audit.writeScopes }, null, 2)}\n`);
  } else if (type === "dashboard-hash") {
    add(relativePath, "dashboard", `${dashboardHash(migrationSession(context).dashboard?.indexPath || "")}\n`);
  } else if (type === "target-git-status") {
    add(relativePath, "session.git.after", `${JSON.stringify(migrationSession(context).git?.after || {}, null, 2)}\n`);
  } else if (type === "target-commit") {
    add(relativePath, "git", `${targetCommit(target.projectRoot)}\n`);
  } else if (type === "harness-version") {
    add(relativePath, "package.json", `${packageVersion()}\n`);
  } else if (type === "generated-at") {
    add(relativePath, "generated", `${new Date().toISOString()}\n`);
  } else {
    throw new Error(`Unsupported preset evidence type: ${type}`);
  }
}

function addAuditFile({ name, preset, context, add }: { name: string; preset: PresetPackage; context: PresetContext; add: PresetAddFile }): void {
  const relativePath = toPosix(path.join(context.evidenceBundle, name));
  if (name === "preset-manifest.json") {
    add(relativePath, "preset.yaml", `${JSON.stringify(presetManifestSnapshot(preset), null, 2)}\n`);
  } else if (name === "preset-audit.json") {
    add(relativePath, "preset-audit", `${JSON.stringify(context.audit, null, 2)}\n`);
  } else if (name === "write-scope.json") {
    add(relativePath, "preset.yaml", `${JSON.stringify({ preset: preset.id, scopes: preset.writeScopes, entrypointScopes: context.audit.writeScopes }, null, 2)}\n`);
  } else {
    add(relativePath, "preset-audit", `${JSON.stringify({ preset: preset.id, generatedAt: new Date().toISOString() }, null, 2)}\n`);
  }
}

function renderPresetMetadata(content: string, context: PresetContext): string {
  const metadata = [
    context.kind && context.kind !== "general" ? `Task Kind: ${context.kind}` : "",
    `Task Preset: ${context.preset}`,
    `Preset Version: ${context.presetVersion}`,
    context.migrationTargetLevel ? `Migration Target Level: ${context.migrationTargetLevel}` : "",
    context.migrationAchievedLevel ? `Migration Achieved Level: ${context.migrationAchievedLevel}` : "",
    context.evidenceBundle ? `Evidence Bundle: ${context.evidenceBundle}` : "",
    ...declaredMetadataLines(context),
  ].filter(Boolean).join("\n");
  let next = String(content).replace(new RegExp(`^(${escapeRegExp(taskContractMarker)}\\s*)$`, "im"), `$1\n${metadata}`);
  const outcome = String(context.presetPackage.task?.defaultOutcome || "");
  if (outcome) {
    next = next
      .replace("[State the outcome this task must deliver in one sentence.]", outcome)
      .replace("[用一句话说明本任务完成后应达到的状态。]", outcome);
  }
  return next;
}

function declaredMetadataLines(context: PresetContext): string[] {
  const base = {
    inputs: context.resolvedInputs || {},
    values: context.values || {},
    preset: {
      id: context.preset,
      version: context.presetVersion,
    },
    task: {
      id: context.taskId,
      title: context.taskTitle,
      kind: context.kind,
    },
  };
  return Object.entries(context.presetPackage?.metadata || {}).map(([name, declaration]) => {
    const label = declaration.label || name;
    let value = "";
    if (Object.prototype.hasOwnProperty.call(declaration, "from")) {
      value = String(getPath(base, declaration.from) || "");
    } else if (Object.prototype.hasOwnProperty.call(declaration, "value")) {
      value = String(declaration.value || "");
    } else if (Object.prototype.hasOwnProperty.call(declaration, "default")) {
      value = String(declaration.default || "");
    }
    return value == null || value === "" ? "" : `${label}: ${value}`;
  });
}

function migrationSession(context: PresetContext): MigrationSessionInput {
  const session = Object.values(context.resolvedInputs || {}).find((value): value is MigrationSessionInput => isRecord(value) && value.operation === "migrate-run");
  if (!session) throw new Error("Preset evidence requires migrate-run session input");
  return session;
}

function migrationLedger({ session, preset, verifyResult }: { session: MigrationSessionInput; preset: PresetPackage; verifyResult: Record<string, unknown> }) {
  const summary = session.plan?.summary || {};
  return {
    schemaVersion: "legacy-migration-ledger/v2",
    preset: preset.id,
    presetVersion: preset.version,
    staticDashboardRole: "evidence-snapshot",
    workbenchRole: "human-confirmation-control-plane",
    phases: [
      { id: "baseline", state: verifyResult.status === "pass" ? "done" : "blocked", evidence: ["session.json", "migrate-plan.json", "normal-check.json", "strict-check.json", "migrate-verify.json"] },
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
      { id: "cutover-review", state: "planned", humanConfirmationRequired: true, workbenchQueueRequired: true, staticDashboardRole: "evidence-snapshot" },
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

function presetManifestSnapshot(preset: PresetPackage) {
  return {
    id: preset.id,
    version: preset.version,
    manifestPath: preset.manifestRelativePath,
    manifestSha256: preset.manifestSha256,
    compatibleBudgets: preset.compatibleBudgets,
    entrypoints: preset.entrypoints,
    audit: preset.audit,
    writeScopes: preset.writeScopes,
    inputs: preset.inputs,
    templateValues: preset.templateValues,
    metadata: preset.metadata,
    resources: preset.resources,
    context: preset.context,
  };
}

function matchesScope(scope: string, relativePath: string): boolean {
  const normalizedScope = toPosix(String(scope || ""));
  if (normalizedScope.endsWith("/**")) {
    const prefix = normalizedScope.slice(0, -3);
    return relativePath === prefix || relativePath.startsWith(`${prefix}/`);
  }
  return relativePath === normalizedScope;
}

function dashboardHash(indexPath: string): string {
  if (!indexPath || !fs.existsSync(indexPath)) return "missing";
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex")}`;
}

function targetCommit(projectRoot: string): string {
  const result = spawnSync("git", ["-C", projectRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "n/a";
}

function packageVersion(): string {
  try {
    return String(asRecord(readJsonSafe(path.join(repoRoot, "package.json"), {})).version || "unknown");
  } catch {
    return "unknown";
  }
}

function getPath(values: unknown, key: unknown): unknown {
  if (!key) return values;
  let cursor = values;
  for (const part of String(key).split(".")) {
    if (!isRecord(cursor) || !Object.prototype.hasOwnProperty.call(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function renderInline(value: unknown, values: PresetTemplateValues): string {
  return String(value || "").replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const result = getPath(values, key);
    return result == null ? "" : String(result);
  });
}

function markdownTableCell(value: unknown): string {
  return String(value || "").replace(/\r?\n/g, " ").replaceAll("|", "&#124;").trim();
}

function presetIndexSkeleton(kind: string): string {
  if (kind === "references") {
    return "# References Index\n\n| ID | Type | Path | Summary | Used By |\n| --- | --- | --- | --- | --- |\n";
  }
  return "# Artifacts Index\n\n| ID | Type | Path | Summary | Produced By |\n| --- | --- | --- | --- | --- |\n";
}

function escapeRegExp(value: string): string {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown parse error";
}
