// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { normalizeLocale, normalizeTarget, readJsonSafe, toPosix, } from "./core-shared.mjs";
import { legacyModuleRoot, legacyPath, v2HarnessRoot, } from "./harness-paths.mjs";
const legacyMappings = [
    ["03-ARCHITECTURE", `${v2HarnessRoot}/context/architecture`],
    ["04-DEVELOPMENT", `${v2HarnessRoot}/context/development`],
    ["06-INTEGRATIONS", `${v2HarnessRoot}/context/integrations`],
    ["05-TEST-QA", `${v2HarnessRoot}/governance/regression`],
    ["11-REFERENCE", `${v2HarnessRoot}/governance/standards`],
    ["09-PLANNING/TASKS", `${v2HarnessRoot}/planning/tasks`],
    ["09-PLANNING/MODULES", `${v2HarnessRoot}/planning/modules`],
    ["09-PLANNING/Module-Registry.md", `${v2HarnessRoot}/planning/modules/Module-Registry.md`],
    ["10-WALKTHROUGH", `${v2HarnessRoot}/governance/archive/legacy-walkthrough`],
    ["Harness-Ledger.md", `${v2HarnessRoot}/governance/archive/legacy-governance/Harness-Ledger.md`],
];
export function planStructureMigration(targetInput = ".") {
    const target = normalizeTarget(targetInput);
    const legacyDocsRoot = path.join(target.projectRoot, "docs");
    const manifestPath = path.join(target.projectRoot, v2HarnessRoot, "harness.yaml");
    const capabilities = readLegacyCapabilities(target.projectRoot);
    const actions = [];
    if (!fs.existsSync(legacyDocsRoot)) {
        actions.push({
            action: fs.existsSync(manifestPath) ? "already-v2" : "create-v2-manifest",
            source: "",
            destination: toPosix(path.relative(target.projectRoot, manifestPath)),
        });
    }
    for (const [legacyRelative, v2Relative] of legacyMappings) {
        const source = path.join(legacyDocsRoot, legacyRelative);
        if (!fs.existsSync(source))
            continue;
        actions.push({
            action: "move",
            source: toPosix(path.relative(target.projectRoot, source)),
            destination: v2Relative,
        });
    }
    const archiveDestination = `${v2HarnessRoot}/governance/archive/legacy-docs`;
    if (fs.existsSync(legacyDocsRoot)) {
        actions.push({
            action: "archive-source-root",
            source: "docs",
            destination: archiveDestination,
        });
    }
    for (const relative of generatedTemplateDirs()) {
        const legacyEquivalent = relative
            .replace(`${v2HarnessRoot}/planning/tasks`, "09-PLANNING/TASKS")
            .replace(`${v2HarnessRoot}/planning/modules`, "09-PLANNING/MODULES");
        if (fs.existsSync(path.join(target.projectRoot, relative)) || fs.existsSync(path.join(legacyDocsRoot, legacyEquivalent))) {
            actions.push({
                action: "remove-generated-template-dir",
                source: "",
                destination: relative,
            });
        }
    }
    const legacyRegistry = path.join(target.projectRoot, ".harness-capabilities.json");
    if (fs.existsSync(legacyRegistry)) {
        actions.push({
            action: "archive-legacy-registry",
            source: ".harness-capabilities.json",
            destination: `${v2HarnessRoot}/governance/archive/legacy-governance/.harness-capabilities.json`,
        });
    }
    return {
        operation: "migrate-structure",
        target: target.projectRoot,
        mode: fs.existsSync(manifestPath) ? "v2-present" : "legacy-source",
        manifest: toPosix(path.relative(target.projectRoot, manifestPath)),
        capabilities,
        actions,
        summary: {
            actions: actions.length,
            moves: actions.filter((action) => action.action === "move").length,
            willArchiveLegacyDocs: actions.some((action) => action.action === "archive-source-root"),
            canApply: actions.length > 0,
        },
    };
}
export function applyStructureMigration(targetInput = ".", { force = false } = {}) {
    const plan = planStructureMigration(targetInput);
    const targetRoot = plan.target;
    const manifestPath = path.join(targetRoot, plan.manifest);
    const applied = [];
    preflightStructureMigration(plan, { force });
    if (!fs.existsSync(manifestPath) || force) {
        fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
        fs.writeFileSync(manifestPath, renderHarnessManifest({ locale: plan.capabilities.locale, capabilities: plan.capabilities.names }));
        applied.push({ action: "write-manifest", destination: plan.manifest });
    }
    for (const action of plan.actions.filter((entry) => entry.action === "move")) {
        const source = path.join(targetRoot, action.source);
        const destination = path.join(targetRoot, action.destination);
        if (!fs.existsSync(source))
            continue;
        if (fs.existsSync(destination) && !force) {
            throw new Error(`Refusing to overwrite existing v2 destination: ${action.destination}`);
        }
        if (fs.existsSync(destination))
            fs.rmSync(destination, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.cpSync(source, destination, { recursive: true });
        applied.push({ action: "copy", source: action.source, destination: action.destination });
    }
    const docsRoot = path.join(targetRoot, "docs");
    if (fs.existsSync(docsRoot)) {
        const archiveRoot = uniqueArchiveRoot(targetRoot);
        fs.mkdirSync(path.dirname(archiveRoot), { recursive: true });
        fs.renameSync(docsRoot, archiveRoot);
        applied.push({ action: "archive-source-root", source: "docs", destination: toPosix(path.relative(targetRoot, archiveRoot)) });
    }
    archiveLegacyCapabilityRegistry(targetRoot, applied);
    normalizeMigratedModuleTasks(targetRoot, applied, { force });
    scaffoldMissingTaskWalkthroughs(targetRoot, applied);
    removeGeneratedTemplateDirectories(targetRoot, applied);
    return {
        ...plan,
        applied: true,
        actionsApplied: applied,
        summary: {
            ...plan.summary,
            applied: applied.length,
        },
    };
}
function removeGeneratedTemplateDirectories(targetRoot, applied) {
    for (const relative of generatedTemplateDirs()) {
        const directory = path.join(targetRoot, relative);
        if (!fs.existsSync(directory))
            continue;
        fs.rmSync(directory, { recursive: true, force: true });
        applied.push({
            action: "remove-generated-template-dir",
            destination: relative,
        });
    }
}
function generatedTemplateDirs() {
    return [
        `${v2HarnessRoot}/planning/tasks/_task-template`,
        `${v2HarnessRoot}/planning/modules/_task-template`,
        `${v2HarnessRoot}/planning/modules/_module-template`,
    ];
}
function preflightStructureMigration(plan, { force = false } = {}) {
    if (force)
        return;
    const conflicts = [];
    for (const action of plan.actions.filter((entry) => entry.action === "move")) {
        const source = path.join(plan.target, action.source);
        const destination = path.join(plan.target, action.destination);
        if (fs.existsSync(source) && fs.existsSync(destination))
            conflicts.push(action.destination);
    }
    conflicts.push(...moduleTaskNormalizationConflicts(plan.target));
    if (conflicts.length) {
        throw new Error(`Refusing to overwrite existing v2 destination(s): ${conflicts.join(", ")}`);
    }
}
function moduleTaskNormalizationConflicts(targetRoot) {
    const modulesRoot = path.join(targetRoot, legacyPath(legacyModuleRoot));
    if (!fs.existsSync(modulesRoot))
        return [];
    const conflicts = [];
    for (const moduleName of fs.readdirSync(modulesRoot)) {
        if (moduleName.startsWith("_"))
            continue;
        const moduleDir = path.join(modulesRoot, moduleName);
        if (!fs.statSync(moduleDir).isDirectory())
            continue;
        const legacyTasksRoot = path.join(moduleDir, "TASKS");
        const normalizedTasksRoot = path.join(moduleDir, "tasks");
        if (!hasExactChild(moduleDir, "TASKS") || !hasExactChild(moduleDir, "tasks"))
            continue;
        for (const taskName of fs.readdirSync(legacyTasksRoot)) {
            if (fs.existsSync(path.join(normalizedTasksRoot, taskName))) {
                conflicts.push(`${v2HarnessRoot}/planning/modules/${moduleName}/tasks/${taskName}`);
            }
        }
    }
    return conflicts;
}
function hasExactChild(parentDir, childName) {
    return fs.existsSync(parentDir) && fs.readdirSync(parentDir).includes(childName);
}
function archiveLegacyCapabilityRegistry(targetRoot, applied) {
    const registry = path.join(targetRoot, ".harness-capabilities.json");
    if (!fs.existsSync(registry))
        return;
    const destination = uniqueArchiveFile(targetRoot, `${v2HarnessRoot}/governance/archive/legacy-governance/.harness-capabilities.json`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.renameSync(registry, destination);
    applied.push({
        action: "archive-legacy-registry",
        source: ".harness-capabilities.json",
        destination: toPosix(path.relative(targetRoot, destination)),
    });
}
function readLegacyCapabilities(projectRoot) {
    const raw = readJsonSafe(path.join(projectRoot, ".harness-capabilities.json"), null);
    const names = new Set(["core"]);
    let locale = "en-US";
    if (raw) {
        locale = normalizeLocale(raw.locale);
        for (const entry of raw.capabilities || [])
            names.add(typeof entry === "string" ? entry : entry.name);
    }
    return { locale, names: [...names].filter(Boolean) };
}
function renderHarnessManifest({ locale, capabilities }) {
    return [
        "version: 2",
        `locale: ${normalizeLocale(locale)}`,
        "capabilities:",
        ...[...new Set(capabilities)].map((capability) => `  - ${capability}`),
        "structure:",
        `  harnessRoot: ${v2HarnessRoot}`,
        `  planningRoot: ${v2HarnessRoot}/planning`,
        `  tasksRoot: ${v2HarnessRoot}/planning/tasks`,
        `  modulesRoot: ${v2HarnessRoot}/planning/modules`,
        `  externalRoot: ${v2HarnessRoot}/planning/external`,
        `  governanceRoot: ${v2HarnessRoot}/governance`,
        `  generatedRoot: ${v2HarnessRoot}/governance/generated`,
        "",
    ].join("\n");
}
function uniqueArchiveRoot(targetRoot) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(".", "-");
    const base = path.join(targetRoot, v2HarnessRoot, "governance/archive/legacy-docs", stamp);
    for (let index = 0; index < 100; index += 1) {
        const candidate = index === 0 ? base : `${base}-${String(index).padStart(2, "0")}`;
        if (!fs.existsSync(candidate))
            return candidate;
    }
    throw new Error("Unable to allocate legacy docs archive directory");
}
function uniqueArchiveFile(targetRoot, relativeFile) {
    const parsed = path.parse(path.join(targetRoot, relativeFile));
    const base = path.join(parsed.dir, parsed.name);
    for (let index = 0; index < 100; index += 1) {
        const suffix = index === 0 ? "" : `-${String(index).padStart(2, "0")}`;
        const candidate = `${base}${suffix}${parsed.ext}`;
        if (!fs.existsSync(candidate))
            return candidate;
    }
    throw new Error(`Unable to allocate legacy archive file: ${relativeFile}`);
}
function normalizeMigratedModuleTasks(targetRoot, applied, { force = false } = {}) {
    const modulesRoot = path.join(targetRoot, v2HarnessRoot, "planning/modules");
    if (!fs.existsSync(modulesRoot))
        return;
    for (const moduleName of fs.readdirSync(modulesRoot)) {
        if (moduleName.startsWith("_"))
            continue;
        const moduleDir = path.join(modulesRoot, moduleName);
        if (!fs.statSync(moduleDir).isDirectory())
            continue;
        const legacyTasksRoot = path.join(moduleDir, "TASKS");
        if (!fs.existsSync(legacyTasksRoot))
            continue;
        const stagingRoot = uniqueModuleTaskStagingRoot(moduleDir);
        fs.renameSync(legacyTasksRoot, stagingRoot);
        const tasksRoot = path.join(moduleDir, "tasks");
        fs.mkdirSync(tasksRoot, { recursive: true });
        for (const taskName of fs.readdirSync(stagingRoot)) {
            const source = path.join(stagingRoot, taskName);
            const destination = path.join(tasksRoot, taskName);
            if (fs.existsSync(destination) && !force) {
                throw new Error(`Refusing to overwrite existing migrated module task: ${toPosix(path.relative(targetRoot, destination))}`);
            }
            if (fs.existsSync(destination))
                fs.rmSync(destination, { recursive: true, force: true });
            fs.renameSync(source, destination);
            applied.push({
                action: "move",
                source: toPosix(path.relative(targetRoot, source)),
                destination: toPosix(path.relative(targetRoot, destination)),
            });
        }
        fs.rmSync(stagingRoot, { recursive: true, force: true });
    }
}
function uniqueModuleTaskStagingRoot(moduleDir) {
    for (let index = 0; index < 100; index += 1) {
        const suffix = index === 0 ? "" : `-${String(index).padStart(2, "0")}`;
        const candidate = path.join(moduleDir, `.TASKS-migration-${process.pid}${suffix}`);
        if (!fs.existsSync(candidate))
            return candidate;
    }
    throw new Error(`Unable to allocate module task staging directory: ${moduleDir}`);
}
function scaffoldMissingTaskWalkthroughs(targetRoot, applied) {
    for (const taskDir of migratedTaskDirectories(targetRoot)) {
        const taskId = path.basename(taskDir);
        const index = path.join(taskDir, "INDEX.md");
        if (!fs.existsSync(index)) {
            fs.writeFileSync(index, renderMigratedTaskIndex(taskId));
            applied.push({
                action: "create",
                destination: toPosix(path.relative(targetRoot, index)),
            });
        }
        const walkthrough = path.join(taskDir, "walkthrough.md");
        if (!fs.existsSync(walkthrough)) {
            fs.writeFileSync(walkthrough, "# Walkthrough\n\nPending migrated closeout.\n");
            applied.push({
                action: "create",
                destination: toPosix(path.relative(targetRoot, walkthrough)),
            });
        }
        const visualMap = path.join(taskDir, "visual_map.md");
        if (!fs.existsSync(visualMap)) {
            fs.writeFileSync(visualMap, renderMigratedVisualMap());
            applied.push({
                action: "create",
                destination: toPosix(path.relative(targetRoot, visualMap)),
            });
        }
    }
}
function renderMigratedVisualMap() {
    return `# Visual Map

Visual Map Contract: v1.0

| Phase ID | Kind | Depends On | State | Completion | Output | Required Evidence | Exit Command | Actor | Evidence Status | Blocking Risk | Owner / Handoff |
| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| MIG-01 | execution | none | planned | 0 | migrated task validation | migrated task materials | n/a | agent | present | none | coordinator |
`;
}
function migratedTaskDirectories(targetRoot) {
    const taskDirs = [];
    const tasksRoot = path.join(targetRoot, v2HarnessRoot, "planning/tasks");
    if (fs.existsSync(tasksRoot)) {
        for (const entry of fs.readdirSync(tasksRoot)) {
            const taskDir = path.join(tasksRoot, entry);
            if (fs.existsSync(path.join(taskDir, "task_plan.md")))
                taskDirs.push(taskDir);
        }
    }
    const modulesRoot = path.join(targetRoot, v2HarnessRoot, "planning/modules");
    if (!fs.existsSync(modulesRoot))
        return taskDirs;
    for (const moduleName of fs.readdirSync(modulesRoot)) {
        if (moduleName.startsWith("_"))
            continue;
        const moduleTasksRoot = path.join(modulesRoot, moduleName, "tasks");
        if (!fs.existsSync(moduleTasksRoot))
            continue;
        for (const entry of fs.readdirSync(moduleTasksRoot)) {
            const taskDir = path.join(moduleTasksRoot, entry);
            if (fs.existsSync(path.join(taskDir, "task_plan.md")))
                taskDirs.push(taskDir);
        }
    }
    return taskDirs;
}
function renderMigratedTaskIndex(taskId) {
    const today = new Date().toISOString().slice(0, 10);
    return `# ${taskId} - Task Package Index

Task Contract: harness-task/v1

## Task Identity

| Field | Value |
| --- | --- |
| Task ID | \`${taskId}\` |
| Budget | \`simple\` |
| Walkthrough Path | \`walkthrough.md\` |

## Task Audit Metadata

| Field | Value |
| --- | --- |
| Created By | historical-backfill |
| Created At | ${today} |
| Command Shape | harness migrate-structure --apply |
| Budget | simple |
| Template Source | structure-migration |
| Task Creator | migration |
| Task Creator Source | git-unavailable |
| Human Review Status | not-confirmed |
| Confirmation ID | n/a |
| Confirmed At | n/a |
| Reviewer | n/a |
| Reviewer Email | n/a |
| Confirm Text | n/a |
| Evidence Checked | n/a |
| Review Commit SHA | n/a |
| Audit Source | native-index |
| Audit Status | created |
| Exception Reason | n/a |
| Message | v2 structure migration backfill |
| Migration Status | migrated |
| Migrated From | docs |
| Legacy Extra Fields | {} |
| Migration Notes | task index created during hard-cutover structure migration |
`;
}
