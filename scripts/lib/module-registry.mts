import fs from "node:fs";
import path from "node:path";
import { normalizeLocale, normalizeTarget, readBundledTemplate, readFileSafe, renderTaskTemplate, todayDate, toPosix } from "./core-shared.mjs";
import { assertRenderableHarnessManifest, renderHarnessManifest } from "./harness-paths.mjs";
import { createTaskModuleReferenceReader } from "./task-repository.mjs";
import { moduleTemplateFiles } from "./task-lifecycle/template-files.mjs";
import type { HarnessModuleDefinition, HarnessModulesManifest, ResolvedHarnessPaths } from "./harness-paths.mjs";

type HarnessTarget = {
  projectRoot: string;
  docsRoot: string;
  harness: ResolvedHarnessPaths;
};

type HarnessTargetInput = string | {
  projectRoot: string;
  harness?: unknown;
};

type ModuleMutationChange = {
  destination: string;
  action: string;
  surface: string;
};

export const allowedHarnessModuleStatuses = new Set([
  "planned",
  "in-progress",
  "blocked",
  "ready-for-sync",
  "integrating",
  "completed",
  "paused",
  "cancelled",
]);

export type ModuleRegistrationInput = {
  title?: string;
  prefix?: string;
  status?: string;
  branch?: string;
  owner?: string;
  currentStep?: string;
  scope?: string[];
  shared?: string[];
  dependsOn?: string[];
  plan?: string;
  brief?: string;
  updated?: string;
  locale?: string;
};

export function normalizeHarnessModuleKey(value: string): string {
  const normalized = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z][a-z0-9-]*$/.test(normalized)) throw new Error(`Invalid module key: ${value || "<empty>"}`);
  return normalized;
}

export function readHarnessModules(targetInput: HarnessTargetInput): HarnessModulesManifest {
  const target = asHarnessTarget(targetInput);
  return normalizeHarnessModules(target, target.harness.manifest?.modules || null);
}

export function registeredHarnessModule(targetInput: HarnessTargetInput, moduleKey: string): HarnessModuleDefinition | null {
  const key = normalizeHarnessModuleKey(moduleKey);
  const modules = readHarnessModules(targetInput);
  return modules.items[key] || null;
}

export function prepareModuleRegistration(
  targetInput: HarnessTargetInput,
  moduleKey: string,
  input: ModuleRegistrationInput,
  { dryRun = false, allowExisting = false }: { dryRun?: boolean; allowExisting?: boolean } = {},
): { moduleKey: string; module: HarnessModuleDefinition; changes: ModuleMutationChange[] } {
  const target = asHarnessTarget(targetInput);
  ensureV2Harness(target);
  const key = normalizeHarnessModuleKey(moduleKey);
  const modules = readHarnessModules(target);
  const existed = Boolean(modules.items[key]);
  if (existed && !allowExisting) throw new Error(`Module already registered: ${key}`);
  const module = normalizeModuleDefinition(target, key, { ...(modules.items[key] || {}), ...input });
  modules.items[key] = module;
  return writeModuleRegistryMutation(target, modules, key, { dryRun, action: existed ? "sync-module-registry" : "register-module", scaffold: true, locale: input.locale });
}

export function prepareModuleStepRegistrationUpdate(
  targetInput: HarnessTargetInput,
  moduleKey: string,
  { stepId, state, dryRun = false }: { stepId: string; state: string; dryRun?: boolean },
): { moduleKey: string; module: HarnessModuleDefinition; changes: ModuleMutationChange[] } {
  const target = asHarnessTarget(targetInput);
  ensureV2Harness(target);
  const key = normalizeHarnessModuleKey(moduleKey);
  const modules = readHarnessModules(target);
  const module = modules.items[key];
  if (!module) throw new Error(`Unknown module: ${key}. Register it first with: harness module register ${key} --title <title> --prefix <PREFIX> --scope <path> ${target.projectRoot}`);
  module.currentStep = stepId;
  module.status = mapStepStateToModuleStatus(state);
  module.updated = todayDate();
  return writeModuleRegistryMutation(target, modules, key, { dryRun, action: "sync-module-registry" });
}

export function prepareModuleUnregister(
  targetInput: HarnessTargetInput,
  moduleKey: string,
  { dryRun = false }: { dryRun?: boolean } = {},
): { moduleKey: string; changes: ModuleMutationChange[] } {
  const target = asHarnessTarget(targetInput);
  ensureV2Harness(target);
  const key = normalizeHarnessModuleKey(moduleKey);
  const modules = readHarnessModules(target);
  if (!modules.items[key]) throw new Error(`Module is not registered: ${key}`);
  const blockers = moduleUnregisterBlockers(target, key);
  if (blockers.length > 0) throw new Error(`Cannot unregister module ${key}; references still exist:\n${blockers.map((item) => `- ${item}`).join("\n")}`);
  delete modules.items[key];
  const result = writeModuleRegistryMutation(target, modules, key, { dryRun, action: "unregister-module" });
  return { moduleKey: key, changes: result.changes };
}

export function prepareModuleScaffold(
  targetInput: HarnessTargetInput,
  moduleKey: string,
  { dryRun = false, locale = "" }: { dryRun?: boolean; locale?: string } = {},
): { moduleKey: string; changes: ModuleMutationChange[] } {
  const target = asHarnessTarget(targetInput);
  ensureV2Harness(target);
  const key = normalizeHarnessModuleKey(moduleKey);
  const modules = readHarnessModules(target);
  const module = modules.items[key];
  if (!module) throw new Error(`Module is not registered: ${key}`);
  return {
    moduleKey: key,
    changes: scaffoldModuleFiles(target, key, module, { dryRun, locale }),
  };
}

export function moduleRegistryViewPath(targetInput: HarnessTargetInput): string {
  const target = asHarnessTarget(targetInput);
  const modules = readHarnessModules(target);
  const generatedView = modules.generatedView || defaultGeneratedView(target.harness);
  return path.join(target.projectRoot, generatedView);
}

export function renderModuleRegistryView(targetInput: HarnessTargetInput, modulesInput: HarnessModulesManifest | null = null): string {
  const target = asHarnessTarget(targetInput);
  const modules = modulesInput || readHarnessModules(target);
  const rows = Object.entries(modules.items || {}).sort(([left], [right]) => left.localeCompare(right)).map(([key, module]) => [
    `M-${String(module.prefix || key).toUpperCase().replace(/[^A-Z0-9]+/g, "-")}`,
    key,
    module.title || key,
    module.prefix || "",
    module.branch || "",
    module.currentStep || "",
    module.status || "planned",
    module.owner || "coordinator",
    (module.scope || []).join("<br>") || "none",
    (module.shared || []).join("<br>") || "none",
    (module.dependsOn || []).join(", ") || "none",
    module.plan || "none",
    module.brief || "none",
    module.updated || todayDate(),
  ]);
  return `# Module Registry

Generated from \`harness.yaml\` \`modules.items\`. Do not edit this view directly.

## Active Modules

| ID | Key | Title | Prefix | Branch | Current Step | Status | Owner | Scope | Shared | Depends On | Plan | Brief | Updated |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows.length ? rows.map((row) => `| ${row.map(escapeMarkdownCell).join(" | ")} |`).join("\n") : "| none | none | none | none | none | none | planned | none | none | none | none | none | none | none |"}
`;
}

export function moduleRegistryRelativePaths(targetInput: HarnessTargetInput): string[] {
  const target = asHarnessTarget(targetInput);
  return [
    toPosix(path.relative(target.projectRoot, target.harness.manifestPath)),
    toPosix(path.relative(target.projectRoot, moduleRegistryViewPath(target))),
  ];
}

function writeModuleRegistryMutation(
  target: HarnessTarget,
  modules: HarnessModulesManifest,
  moduleKey: string,
  { dryRun, action, scaffold = false, locale = "" }: { dryRun: boolean; action: string; scaffold?: boolean; locale?: string },
): { moduleKey: string; module: HarnessModuleDefinition; changes: ModuleMutationChange[] } {
  assertRenderableHarnessManifest(target.harness.manifest);
  const manifest = target.harness.manifest;
  if (!manifest) throw new Error("Missing harness.yaml");
  const manifestRelative = toPosix(path.relative(target.projectRoot, target.harness.manifestPath));
  const viewPath = moduleRegistryViewPath(target);
  const viewRelative = toPosix(path.relative(target.projectRoot, viewPath));
  const module = modules.items[moduleKey] || {};
  const scaffoldChanges = scaffold ? scaffoldModuleFiles(target, moduleKey, module, { dryRun, locale }) : [];
  if (!dryRun) {
    manifest.modules = modules;
    fs.mkdirSync(path.dirname(target.harness.manifestPath), { recursive: true });
    fs.writeFileSync(target.harness.manifestPath, renderHarnessManifest({
      locale: manifest.locale,
      capabilities: manifest.capabilities || [],
      structure: manifest.structure,
      modules,
    }));
    fs.mkdirSync(path.dirname(viewPath), { recursive: true });
    fs.writeFileSync(viewPath, renderModuleRegistryView(target, modules));
  }
  return {
    moduleKey,
    module,
    changes: [
      { destination: manifestRelative, action: dryRun ? `would-${action}` : action, surface: "harness-manifest" },
      { destination: viewRelative, action: dryRun ? `would-${action}` : action, surface: "module-registry-view" },
      ...scaffoldChanges,
    ],
  };
}

function scaffoldModuleFiles(
  target: HarnessTarget,
  moduleKey: string,
  module: HarnessModuleDefinition,
  { dryRun, locale }: { dryRun: boolean; locale?: string },
): ModuleMutationChange[] {
  const moduleDir = path.join(target.harness.modulesRoot, moduleKey);
  const normalizedLocale = normalizeLocale(locale || target.harness.manifest?.locale || "en-US");
  const changes: ModuleMutationChange[] = [];
  for (const [destination, source] of moduleTemplateFiles({ locale: normalizedLocale })) {
    const destinationPath = path.join(moduleDir, destination);
    if (fs.existsSync(destinationPath)) continue;
    const relative = toPosix(path.relative(target.projectRoot, destinationPath));
    changes.push({
      destination: relative,
      action: dryRun ? "would-create-module-file" : "create-module-file",
      surface: "module-scaffold",
    });
    if (dryRun) continue;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.writeFileSync(destinationPath, renderTaskTemplate(readBundledTemplate(source), {
      taskId: moduleKey,
      title: module.title || moduleKey,
      locale: normalizedLocale,
      budget: "standard",
      moduleKey,
      target,
    }));
  }
  return changes;
}

function normalizeHarnessModules(target: HarnessTarget, modules: HarnessModulesManifest | null): HarnessModulesManifest {
  return {
    schema: modules?.schema || "harness-modules/v1",
    generatedView: modules?.generatedView || defaultGeneratedView(target.harness),
    items: { ...(modules?.items || {}) },
  };
}

function normalizeModuleDefinition(target: HarnessTarget, key: string, input: ModuleRegistrationInput): HarnessModuleDefinition {
  const scope = normalizeStringList(input.scope || []);
  const title = String(input.title || "").trim();
  const prefix = String(input.prefix || "").trim().toUpperCase();
  if (!title) throw new Error(`Module ${key} requires --title`);
  if (!/^[A-Z][A-Z0-9-]{1,12}$/.test(prefix)) throw new Error(`Module ${key} requires --prefix with 2-13 uppercase letters, digits, or dashes`);
  if (scope.length === 0) throw new Error(`Module ${key} requires at least one --scope path`);
  const status = normalizeModuleStatus(input.status || "planned");
  const moduleDir = toPosix(path.relative(target.projectRoot, path.join(target.harness.modulesRoot, key)));
  const module: HarnessModuleDefinition = {
    title,
    prefix,
    status,
    branch: String(input.branch || `codex/${key}`).trim(),
    owner: String(input.owner || "coordinator").trim(),
    currentStep: String(input.currentStep || "").trim(),
    scope,
    shared: normalizeStringList(input.shared || []),
    dependsOn: normalizeStringList(input.dependsOn || []),
    plan: String(input.plan || `${moduleDir}/module_plan.md`).trim(),
    brief: String(input.brief || `${moduleDir}/brief.md`).trim(),
    updated: String(input.updated || todayDate()).trim(),
  };
  validateModulePaths(target, key, module);
  return module;
}

function normalizeModuleStatus(value: string): string {
  const normalized = String(value || "planned").trim().toLowerCase().replaceAll("_", "-");
  if (!allowedHarnessModuleStatuses.has(normalized)) throw new Error(`Invalid module status: ${value}. Expected one of: ${[...allowedHarnessModuleStatuses].join(", ")}`);
  return normalized;
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set((values || []).flatMap((value) => String(value || "").split(",")).map((value) => value.trim()).filter(Boolean))];
}

function validateModulePaths(target: HarnessTarget, key: string, module: HarnessModuleDefinition): void {
  for (const [field, values] of Object.entries({ scope: module.scope || [], shared: module.shared || [], plan: [module.plan || ""], brief: [module.brief || ""] })) {
    for (const value of values) validateProjectRelativePath(target, `modules.items.${key}.${field}`, value);
  }
}

function validateProjectRelativePath(target: HarnessTarget, field: string, value: string): void {
  const raw = String(value || "").trim();
  if (!raw || raw === "none") return;
  if (path.isAbsolute(raw) || raw.split(/[\\/]+/).includes("..")) throw new Error(`Invalid ${field}: path must stay project-relative: ${raw}`);
  const resolved = path.resolve(target.projectRoot, raw.replace(/\*\*/g, "__glob__").replace(/\*/g, "__glob__"));
  const relative = path.relative(target.projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Invalid ${field}: path escapes project root: ${raw}`);
}

function moduleUnregisterBlockers(target: HarnessTarget, key: string): string[] {
  const blockers: string[] = [];
  const moduleDir = path.join(target.harness.modulesRoot, key);
  const taskDir = path.join(moduleDir, "tasks");
  if (fs.existsSync(taskDir) && fs.readdirSync(taskDir).length > 0) blockers.push(toPosix(path.relative(target.projectRoot, taskDir)));
  for (const reference of createTaskModuleReferenceReader(target.projectRoot).listModuleReferences(key)) blockers.push(reference.blocker);
  const ledger = readFileSafe(target.harness.ledgerPath);
  if (ledger.includes(`| module | ${key} |`) || ledger.includes(`/modules/${key}/`)) blockers.push(toPosix(path.relative(target.projectRoot, target.harness.ledgerPath)));
  return [...new Set(blockers)];
}

function defaultGeneratedView(paths: ResolvedHarnessPaths): string {
  return toPosix(path.relative(paths.projectRoot, path.join(paths.modulesRoot, "Module-Registry.md")));
}

function mapStepStateToModuleStatus(state: string): string {
  if (state === "done") return "completed";
  if (state === "in-progress") return "in-progress";
  if (state === "blocked") return "blocked";
  if (state === "superseded") return "cancelled";
  return "planned";
}

function escapeMarkdownCell(value: unknown): string {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function ensureV2Harness(target: HarnessTarget): void {
  if (target.harness.version !== 2 || !target.harness.manifest) throw new Error("Module registry requires a v2 harness.yaml manifest");
}

function asHarnessTarget(targetInput: HarnessTargetInput): HarnessTarget {
  const candidate = typeof targetInput === "string" ? normalizeTarget(targetInput) : targetInput;
  if (isResolvedHarnessPaths(candidate.harness)) return { projectRoot: candidate.projectRoot, docsRoot: candidate.harness.docsRoot, harness: candidate.harness };
  const normalized = normalizeTarget(candidate.projectRoot);
  if (!isResolvedHarnessPaths(normalized.harness)) throw new Error("Could not resolve harness paths for module registry target");
  return { projectRoot: normalized.projectRoot, docsRoot: normalized.harness.docsRoot, harness: normalized.harness };
}

function isResolvedHarnessPaths(value: unknown): value is ResolvedHarnessPaths {
  return Boolean(value && typeof value === "object" && "version" in value && "manifestPath" in value && "modulesRoot" in value);
}
