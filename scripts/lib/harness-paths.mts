import fs from "node:fs";
import path from "node:path";

export const v2HarnessRoot = "coding-agent-harness";
export const legacyPlanningRoot = ["docs", "09-PLANNING"];
export const legacyTaskRoot = [...legacyPlanningRoot, "TASKS"];
export const legacyModuleRoot = [...legacyPlanningRoot, "MODULES"];
export const legacyWalkthroughRoot = ["docs", "10-WALKTHROUGH"];
export const legacyLedgerFile = ["docs", "Harness-Ledger.md"];
export const legacyCloseoutFile = [...legacyWalkthroughRoot, "Closeout-SSoT.md"];
export const legacyCompatMode = "legacy-compat";
export const safeAdoptionCapability = "safe-adoption";

export type HarnessManifest = {
    version: number;
    locale: string;
    capabilities: string[];
    structure: Record<string, string>;
    modules?: HarnessModulesManifest;
    harnessRoot?: string;
    [key: string]: unknown;
};

export type HarnessModuleDefinition = {
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
    [key: string]: unknown;
};

export type HarnessModulesManifest = {
    schema?: string;
    generatedView?: string;
    items: Record<string, HarnessModuleDefinition>;
    [key: string]: unknown;
};

export type HarnessTargetInput = string | {
    projectRoot: string;
    input?: string;
    docsRoot?: string;
    harnessRootCandidate?: string;
    [key: string]: unknown;
};

export type NormalizedHarnessTarget = {
    input?: string;
    projectRoot: string;
    docsRoot: string;
    docsOnly?: boolean;
    harnessRootCandidate: string;
    [key: string]: unknown;
};

export type LegacyHarnessPaths = {
    docsRoot: string;
    planningRoot: string;
    tasksRoot: string;
    modulesRoot: string;
    walkthroughRoot: string;
    ledgerPath: string;
    closeoutPath: string;
};

export type ResolvedHarnessPaths = {
    version: 1 | 2;
    manifest: HarnessManifest | null;
    manifestPath: string;
    input?: string;
    projectRoot: string;
    docsRoot: string;
    docsOnly?: boolean;
    harnessRoot: string;
    planningRoot: string;
    tasksRoot: string;
    modulesRoot: string;
    taskRoots: string[];
    externalRoot: string;
    governanceRoot: string;
    generatedRoot: string;
    regressionRoot: string;
    ledgerPath: string;
    closeoutIndexPath: string;
    legacy: LegacyHarnessPaths;
};

export function legacyPath(...segments: Array<string | string[]>): string {
    return segments.flat().join("/");
}

export function resolveHarnessPaths(targetInput: HarnessTargetInput = "."): ResolvedHarnessPaths {
    const target = normalizeTargetShape(targetInput);
    const manifestPath = path.join(target.harnessRootCandidate, "harness.yaml");
    const manifest = readHarnessManifest(manifestPath);
    if (manifest) {
        const structure = manifest.structure || {};
        const harnessRoot = structure.harnessRoot || v2HarnessRoot;
        const planningRoot = structure.planningRoot || `${harnessRoot}/planning`;
        const tasksRoot = structure.tasksRoot || `${planningRoot}/tasks`;
        const modulesRoot = structure.modulesRoot || `${planningRoot}/modules`;
        const externalRoot = structure.externalRoot || `${planningRoot}/external`;
        const governanceRoot = structure.governanceRoot || `${harnessRoot}/governance`;
        const generatedRoot = structure.generatedRoot || `${governanceRoot}/generated`;
        const regressionRoot = structure.regressionRoot || `${governanceRoot}/regression`;
        const resolved = Object.fromEntries(
            Object.entries({
                harnessRoot,
                planningRoot,
                tasksRoot,
                modulesRoot,
                externalRoot,
                governanceRoot,
                generatedRoot,
                regressionRoot,
            }).map(([key, value]) => [key, resolveManifestStructurePath(target.projectRoot, key, value)]),
        ) as Record<"harnessRoot" | "planningRoot" | "tasksRoot" | "modulesRoot" | "externalRoot" | "governanceRoot" | "generatedRoot" | "regressionRoot", string>;
        return {
            version: 2,
            manifest,
            manifestPath,
            input: target.input,
            projectRoot: target.projectRoot,
            docsRoot: target.docsRoot,
            docsOnly: target.docsOnly,
            harnessRoot: resolved.harnessRoot,
            planningRoot: resolved.planningRoot,
            tasksRoot: resolved.tasksRoot,
            modulesRoot: resolved.modulesRoot,
            taskRoots: [resolved.tasksRoot, resolved.modulesRoot, resolved.externalRoot].filter(Boolean),
            externalRoot: resolved.externalRoot,
            governanceRoot: resolved.governanceRoot,
            generatedRoot: resolved.generatedRoot,
            regressionRoot: resolved.regressionRoot,
            ledgerPath: path.join(resolved.generatedRoot, "Harness-Ledger.md"),
            closeoutIndexPath: path.join(resolved.generatedRoot, "Closeout-Index.md"),
            legacy: legacyPaths(target.projectRoot),
        };
    }
    const legacy = legacyPaths(target.projectRoot);
    return {
        version: 1,
        manifest: null,
        manifestPath,
        input: target.input,
        projectRoot: target.projectRoot,
        docsRoot: target.docsRoot,
        docsOnly: target.docsOnly,
        harnessRoot: target.docsRoot,
        planningRoot: legacy.planningRoot,
        tasksRoot: legacy.tasksRoot,
        modulesRoot: legacy.modulesRoot,
        taskRoots: [legacy.tasksRoot, legacy.modulesRoot],
        externalRoot: "",
        governanceRoot: target.docsRoot,
        generatedRoot: path.join(legacy.planningRoot, "generated"),
        regressionRoot: path.join(target.docsRoot, "05-TEST-QA"),
        ledgerPath: legacy.ledgerPath,
        closeoutIndexPath: legacy.closeoutPath,
        legacy,
    };
}

export function taskIdFromDirectory(paths: ResolvedHarnessPaths, taskDir: string): string {
    const normalized = path.resolve(taskDir);
    const tasksRoot = path.resolve(paths.tasksRoot);
    const modulesRoot = path.resolve(paths.modulesRoot);
    const externalRoot = paths.externalRoot ? path.resolve(paths.externalRoot) : "";
    if (isPathInside(normalized, tasksRoot)) return `TASKS/${toPosix(path.relative(tasksRoot, normalized))}`;
    if (isPathInside(normalized, modulesRoot)) {
        const relative = toPosix(path.relative(modulesRoot, normalized));
        const match = relative.match(/^([^/]+)\/tasks\/(.+)$/);
        return match ? `MODULES/${match[1]}/${match[2]}` : `MODULES/${relative}`;
    }
    if (externalRoot && isPathInside(normalized, externalRoot)) return `EXTERNAL/${toPosix(path.relative(externalRoot, normalized))}`;
    if (paths.version === 1) return toPosix(path.relative(paths.planningRoot, normalized));
    return toPosix(path.relative(paths.projectRoot, normalized));
}

export function taskRefPath(paths: ResolvedHarnessPaths, raw: string): string {
    if (/^TASKS\//.test(raw)) return path.join(paths.tasksRoot, raw.replace(/^TASKS\//, ""));
    if (/^MODULES\//.test(raw)) return moduleRefPath(paths, raw.replace(/^MODULES\//, ""));
    if (/^EXTERNAL\//.test(raw) && paths.externalRoot) return path.join(paths.externalRoot, raw.replace(/^EXTERNAL\//, ""));
    if (/^(tasks|modules|external)\//.test(raw)) return path.join(paths.planningRoot, raw);
    return "";
}

export function taskLocalWalkthrough(paths: ResolvedHarnessPaths, taskDir: string): string {
    if (paths.version !== 2) return "";
    const walkthrough = path.join(taskDir, "walkthrough.md");
    if (!fs.existsSync(walkthrough)) return "";
    let stat: fs.Stats;
    try {
        stat = fs.lstatSync(walkthrough);
    } catch {
        return "";
    }
    if (!stat.isFile() || stat.isSymbolicLink()) return "";
    return toPosix(path.relative(paths.projectRoot, walkthrough));
}

export function dashboardWatchRoots(paths: ResolvedHarnessPaths): string[] {
    const roots = paths.version === 2
        ? [
            paths.harnessRoot,
            paths.planningRoot,
            paths.tasksRoot,
            paths.modulesRoot,
            paths.externalRoot,
            paths.governanceRoot,
            paths.generatedRoot,
            paths.regressionRoot,
        ]
        : [paths.docsRoot];
    return dedupeAncestorRoots(roots.filter(Boolean).map((root) => path.resolve(root)).filter((root) => fs.existsSync(root)));
}

export function discoverImplicitHarnessTarget(input = "."): string {
    const root = path.resolve(input || ".");
    const nearest = findNearestHarnessRoot(root);
    if (nearest) return projectRootForHarnessRoot(nearest);
    const discovered = findProjectHarnessRoot(root, { requireDeclaredProjectRoot: false });
    return discovered ? projectRootForHarnessRoot(discovered) : "";
}

function moduleRefPath(paths: ResolvedHarnessPaths, relative: string): string {
    if (paths.version !== 2) return path.join(paths.modulesRoot, relative);
    const [moduleKey = "", ...taskSegments] = relative.split("/");
    return taskSegments.length ? path.join(paths.modulesRoot, moduleKey, "tasks", ...taskSegments) : path.join(paths.modulesRoot, moduleKey);
}

export function toPosix(value: string): string {
    return String(value).split(path.sep).join("/");
}

function normalizeTargetShape(input: HarnessTargetInput = "."): NormalizedHarnessTarget {
    if (input && typeof input === "object" && input.projectRoot) {
        const requestedProjectRoot = path.resolve(input.projectRoot);
        const inputPath = path.resolve(input.input || requestedProjectRoot);
        const directHarnessRoot = findNearestHarnessRoot(inputPath);
        const discoveredHarnessRoot = directHarnessRoot || findProjectHarnessRoot(requestedProjectRoot);
        const projectRoot = directHarnessRoot
            ? projectRootForHarnessRoot(directHarnessRoot)
            : requestedProjectRoot;
        return {
            ...input,
            projectRoot,
            docsRoot: input.docsRoot || path.join(projectRoot, "docs"),
            harnessRootCandidate: input.harnessRootCandidate || discoveredHarnessRoot || path.join(projectRoot, v2HarnessRoot),
        };
    }
    const target = path.resolve(typeof input === "string" ? input || "." : ".");
    const docsProjectRoot = path.dirname(target);
    const siblingHarnessRoot = findProjectHarnessRoot(docsProjectRoot);
    const siblingV2Manifest = siblingHarnessRoot
        ? path.join(siblingHarnessRoot, "harness.yaml")
        : path.join(docsProjectRoot, v2HarnessRoot, "harness.yaml");
    const isDocsRoot =
        path.basename(target) === "docs" &&
        (fs.existsSync(path.join(target, "09-PLANNING")) || fs.existsSync(path.join(target, "11-REFERENCE")) || fs.existsSync(siblingV2Manifest));
    const directHarnessRoot = !isDocsRoot ? findNearestHarnessRoot(target) : "";
    const discoveredHarnessRoot = directHarnessRoot || (!isDocsRoot ? findProjectHarnessRoot(target) : siblingHarnessRoot);
    const projectRoot = isDocsRoot ? docsProjectRoot : directHarnessRoot ? projectRootForHarnessRoot(directHarnessRoot) : target;
    return {
        input: target,
        projectRoot,
        docsRoot: isDocsRoot ? target : path.join(target, "docs"),
        docsOnly: isDocsRoot,
        harnessRootCandidate: discoveredHarnessRoot || path.join(projectRoot, v2HarnessRoot),
    };
}

function findNearestHarnessRoot(target: string): string {
    let current = target;
    for (let depth = 0; depth < 5; depth += 1) {
        if (fs.existsSync(path.join(current, "harness.yaml"))) return current;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return "";
}

function findProjectHarnessRoot(projectRoot: string, { requireDeclaredProjectRoot = true } = {}): string {
    const defaultRoot = path.join(projectRoot, v2HarnessRoot);
    if (fs.existsSync(path.join(defaultRoot, "harness.yaml"))) return defaultRoot;
    const candidates: string[] = [];
    const ignored = new Set([".git", "node_modules", "tmp", "dist", "build", ".next", "coverage"]);
    function visit(dir: string, depth: number): void {
        if (depth > 5 || !fs.existsSync(dir)) return;
        if (fs.existsSync(path.join(dir, "harness.yaml")) && (!requireDeclaredProjectRoot || projectRootForHarnessRoot(dir) === projectRoot)) {
            candidates.push(dir);
            return;
        }
        for (const entry of fs.readdirSync(dir)) {
            if (ignored.has(entry)) continue;
            const full = path.join(dir, entry);
            let stat: fs.Stats;
            try {
                stat = fs.lstatSync(full);
            } catch {
                continue;
            }
            if (stat.isDirectory() && !stat.isSymbolicLink()) visit(full, depth + 1);
        }
    }
    visit(projectRoot, 0);
    const unique = [...new Set(candidates)].sort((left, right) => {
        const leftDepth = path.relative(projectRoot, left).split(path.sep).filter(Boolean).length;
        const rightDepth = path.relative(projectRoot, right).split(path.sep).filter(Boolean).length;
        return leftDepth - rightDepth || left.localeCompare(right);
    });
    if (unique.length > 1) {
        const shallowestDepth = path.relative(projectRoot, unique[0]).split(path.sep).filter(Boolean).length;
        const shallowest = unique.filter((item) => path.relative(projectRoot, item).split(path.sep).filter(Boolean).length === shallowestDepth);
        if (shallowest.length === 1) return shallowest[0];
        throw new Error(`Multiple v2 harness manifests found at the same nearest depth; pass the intended harness root explicitly: ${shallowest.map((item) => toPosix(path.relative(projectRoot, item))).join(", ")}`);
    }
    return unique[0] || "";
}

function projectRootForHarnessRoot(harnessRoot: string): string {
    const manifest = readHarnessManifest(path.join(harnessRoot, "harness.yaml"));
    const declaredHarnessRoot = manifest?.structure?.harnessRoot || v2HarnessRoot;
    let current = harnessRoot;
    for (let depth = 0; depth < 10; depth += 1) {
        if (path.resolve(current, declaredHarnessRoot) === path.resolve(harnessRoot)) return current;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    return path.dirname(harnessRoot);
}

function legacyPaths(projectRoot: string): LegacyHarnessPaths {
    const docsRoot = path.join(projectRoot, "docs");
    const planningRoot = path.join(docsRoot, ...legacyPlanningRoot.slice(1));
    return {
        docsRoot,
        planningRoot,
        tasksRoot: path.join(docsRoot, ...legacyTaskRoot.slice(1)),
        modulesRoot: path.join(docsRoot, ...legacyModuleRoot.slice(1)),
        walkthroughRoot: path.join(docsRoot, ...legacyWalkthroughRoot.slice(1)),
        ledgerPath: path.join(projectRoot, ...legacyLedgerFile),
        closeoutPath: path.join(projectRoot, ...legacyCloseoutFile),
    };
}

function readHarnessManifest(manifestPath: string): HarnessManifest | null {
    if (!fs.existsSync(manifestPath)) return null;
    const manifest: HarnessManifest = { version: 2, locale: "en-US", capabilities: [], structure: {} };
    let section = "";
    let inModuleItems = false;
    let currentModuleKey = "";
    let currentModuleListField = "";
    for (const rawLine of fs.readFileSync(manifestPath, "utf8").split(/\r?\n/)) {
        const line = rawLine.replace(/\s+#.*$/, "");
        if (!line.trim()) continue;
        const top = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
        if (top) {
            section = top[1];
            inModuleItems = false;
            currentModuleKey = "";
            currentModuleListField = "";
            if (section === "version") manifest.version = Number(top[2]) || 2;
            else if (section === "locale") manifest.locale = top[2] || "en-US";
            else if (section === "modules") manifest.modules = { items: {} };
            else if (section !== "structure" && section !== "capabilities") manifest[section] = top[2];
            continue;
        }
        const listItem = line.match(/^\s*-\s*(.+)$/);
        if (section === "capabilities" && listItem) {
            manifest.capabilities.push(listItem[1].trim());
            continue;
        }
        const nested = line.match(/^\s+([A-Za-z][A-Za-z0-9_-]*):\s*(.+)$/);
        if (section === "structure" && nested) manifest.structure[nested[1]] = nested[2].trim();
        if (section === "modules") {
            if (!manifest.modules) manifest.modules = { items: {} };
            const moduleTop = line.match(/^  ([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
            if (moduleTop) {
                currentModuleKey = "";
                currentModuleListField = "";
                if (moduleTop[1] === "items") inModuleItems = true;
                else if (moduleTop[1] === "schema") manifest.modules.schema = moduleTop[2].trim();
                else if (moduleTop[1] === "generatedView") manifest.modules.generatedView = moduleTop[2].trim();
                else manifest.modules[moduleTop[1]] = moduleTop[2].trim();
                continue;
            }
            const moduleItem = line.match(/^    ([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
            if (inModuleItems && moduleItem) {
                currentModuleKey = moduleItem[1];
                currentModuleListField = "";
                if (!manifest.modules.items[currentModuleKey]) manifest.modules.items[currentModuleKey] = {};
                continue;
            }
            const moduleField = line.match(/^      ([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
            if (inModuleItems && currentModuleKey && moduleField) {
                const field = moduleField[1];
                const raw = moduleField[2].trim();
                if (["scope", "shared", "dependsOn"].includes(field)) {
                    manifest.modules.items[currentModuleKey][field] = raw === "[]" ? [] : raw ? [raw] : [];
                    currentModuleListField = field;
                } else {
                    manifest.modules.items[currentModuleKey][field] = raw;
                    currentModuleListField = "";
                }
                continue;
            }
            const moduleListItem = line.match(/^        -\s*(.+)$/);
            if (inModuleItems && currentModuleKey && currentModuleListField && moduleListItem) {
                const existing = manifest.modules.items[currentModuleKey][currentModuleListField];
                manifest.modules.items[currentModuleKey][currentModuleListField] = [
                    ...(Array.isArray(existing) ? existing : []),
                    moduleListItem[1].trim(),
                ];
            }
        }
    }
    if (!manifest.structure.harnessRoot && manifest.harnessRoot) manifest.structure.harnessRoot = manifest.harnessRoot;
    if (!manifest.structure.planningRoot && manifest.harnessRoot) manifest.structure.planningRoot = `${manifest.harnessRoot}/planning`;
    return manifest;
}

export function renderHarnessManifest({ locale, capabilities, structure = null, modules = null }: { locale: string; capabilities: string[]; structure?: Record<string, string> | null; modules?: HarnessModulesManifest | null }): string {
    const manifestStructure = structure || {
        harnessRoot: v2HarnessRoot,
        planningRoot: `${v2HarnessRoot}/planning`,
        tasksRoot: `${v2HarnessRoot}/planning/tasks`,
        modulesRoot: `${v2HarnessRoot}/planning/modules`,
        externalRoot: `${v2HarnessRoot}/planning/external`,
        governanceRoot: `${v2HarnessRoot}/governance`,
        generatedRoot: `${v2HarnessRoot}/governance/generated`,
    };
    const lines = [
        "version: 2",
        `locale: ${locale}`,
        "capabilities:",
        ...capabilities.map((capability) => `  - ${capability}`),
        "structure:",
        ...Object.entries(manifestStructure).map(([key, value]) => `  ${key}: ${value}`),
    ];
    if (modules && (modules.schema || modules.generatedView || Object.keys(modules.items || {}).length > 0)) {
        lines.push("modules:");
        if (modules.schema) lines.push(`  schema: ${yamlScalar(modules.schema)}`);
        if (modules.generatedView) lines.push(`  generatedView: ${yamlScalar(modules.generatedView)}`);
        lines.push("  items:");
        for (const [key, module] of Object.entries(modules.items || {}).sort(([left], [right]) => left.localeCompare(right))) {
            lines.push(`    ${key}:`);
            for (const field of ["title", "prefix", "status", "branch", "owner", "currentStep", "scope", "shared", "dependsOn", "plan", "brief", "updated"]) {
                const value = module[field];
                if (Array.isArray(value)) {
                    lines.push(`      ${field}:${value.length ? "" : " []"}`);
                    for (const item of value) lines.push(`        - ${yamlScalar(String(item))}`);
                } else if (value !== undefined && value !== null && String(value) !== "") {
                    lines.push(`      ${field}: ${yamlScalar(String(value))}`);
                }
            }
        }
    }
    return `${lines.join("\n")}\n`;
}

export function assertRenderableHarnessManifest(manifest: HarnessManifest | null | undefined): void {
    if (!manifest) return;
    const allowed = new Set(["version", "locale", "capabilities", "structure", "modules", "harnessRoot"]);
    const unknown = Object.keys(manifest).filter((key) => !allowed.has(key));
    if (unknown.length > 0) throw new Error(`Cannot rewrite harness.yaml with unknown top-level fields: ${unknown.join(", ")}`);
}

function yamlScalar(value: string): string {
    const raw = String(value || "");
    if (!raw) return "''";
    if (/[:#\n\r]|^\s|\s$|^(?:true|false|null|\d+(?:\.\d+)?)$/i.test(raw)) return JSON.stringify(raw);
    return raw;
}

function resolveManifestStructurePath(projectRoot: string, fieldName: string, relativePath: string): string {
    const raw = String(relativePath || "").trim();
    if (!raw) throw new Error(`Invalid v2 harness manifest: structure.${fieldName} is empty`);
    if (path.isAbsolute(raw)) throw new Error(`Invalid v2 harness manifest: structure.${fieldName} escapes project root: ${raw}`);
    const resolved = path.resolve(projectRoot, raw);
    if (!isPathInside(resolved, projectRoot)) {
        throw new Error(`Invalid v2 harness manifest: structure.${fieldName} escapes project root: ${raw}`);
    }
    return resolved;
}

function isPathInside(child: string, parent: string): boolean {
    const relative = path.relative(parent, child);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function dedupeAncestorRoots(roots: string[]): string[] {
    const result: string[] = [];
    for (const root of [...new Set(roots)].sort((a, b) => a.length - b.length)) {
        if (result.some((parent) => isPathInside(root, parent))) continue;
        result.push(root);
    }
    return result;
}
