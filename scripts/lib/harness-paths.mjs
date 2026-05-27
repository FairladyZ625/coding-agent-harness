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

export function legacyPath(...segments) {
  return [...segments].flat().join("/");
}

export function resolveHarnessPaths(targetInput = ".") {
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
    );
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
      taskRoots: [resolved.tasksRoot, resolved.modulesRoot],
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

export function taskIdFromDirectory(paths, taskDir) {
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

export function taskRefPath(paths, raw) {
  if (/^TASKS\//.test(raw)) return path.join(paths.tasksRoot, raw.replace(/^TASKS\//, ""));
  if (/^MODULES\//.test(raw)) return moduleRefPath(paths, raw.replace(/^MODULES\//, ""));
  if (/^EXTERNAL\//.test(raw) && paths.externalRoot) return path.join(paths.externalRoot, raw.replace(/^EXTERNAL\//, ""));
  if (/^(tasks|modules|external)\//.test(raw)) return path.join(paths.planningRoot, raw);
  return "";
}

export function taskLocalWalkthrough(paths, taskDir) {
  if (paths.version !== 2) return "";
  const walkthrough = path.join(taskDir, "walkthrough.md");
  if (!fs.existsSync(walkthrough)) return "";
  let stat;
  try {
    stat = fs.lstatSync(walkthrough);
  } catch {
    return "";
  }
  if (!stat.isFile() || stat.isSymbolicLink()) return "";
  return toPosix(path.relative(paths.projectRoot, walkthrough));
}

export function dashboardWatchRoots(paths) {
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

function moduleRefPath(paths, relative) {
  if (paths.version !== 2) return path.join(paths.modulesRoot, relative);
  const [moduleKey, ...taskSegments] = relative.split("/");
  return taskSegments.length ? path.join(paths.modulesRoot, moduleKey, "tasks", ...taskSegments) : path.join(paths.modulesRoot, moduleKey);
}

export function toPosix(value) {
  return String(value).split(path.sep).join("/");
}

function normalizeTargetShape(input = ".") {
  if (input && typeof input === "object" && input.projectRoot) {
    const requestedProjectRoot = path.resolve(input.projectRoot);
    const directHarnessRoot = findNearestHarnessRoot(path.resolve(input.input || requestedProjectRoot));
    const projectRoot = directHarnessRoot && requestedProjectRoot === directHarnessRoot
      ? path.dirname(directHarnessRoot)
      : requestedProjectRoot;
    return {
      ...input,
      projectRoot,
      docsRoot: input.docsRoot || path.join(projectRoot, "docs"),
      harnessRootCandidate: input.harnessRootCandidate || directHarnessRoot || path.join(projectRoot, v2HarnessRoot),
    };
  }
  const target = path.resolve(input || ".");
  const siblingV2Manifest = path.join(path.dirname(target), v2HarnessRoot, "harness.yaml");
  const isDocsRoot =
    path.basename(target) === "docs" &&
    (fs.existsSync(path.join(target, "09-PLANNING")) || fs.existsSync(path.join(target, "11-REFERENCE")) || fs.existsSync(siblingV2Manifest));
  const directHarnessRoot = !isDocsRoot ? findNearestHarnessRoot(target) : "";
  const projectRoot = isDocsRoot ? path.dirname(target) : directHarnessRoot ? path.dirname(directHarnessRoot) : target;
  return {
    input: target,
    projectRoot,
    docsRoot: isDocsRoot ? target : path.join(target, "docs"),
    docsOnly: isDocsRoot,
    harnessRootCandidate: directHarnessRoot || path.join(projectRoot, v2HarnessRoot),
  };
}

function findNearestHarnessRoot(target) {
  let current = target;
  for (let depth = 0; depth < 5; depth += 1) {
    if (fs.existsSync(path.join(current, "harness.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return "";
}

function legacyPaths(projectRoot) {
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

function readHarnessManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  const manifest = { version: 2, locale: "en-US", capabilities: [], structure: {} };
  let section = "";
  for (const rawLine of fs.readFileSync(manifestPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;
    const top = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (top) {
      section = top[1];
      if (section === "version") manifest.version = Number(top[2]) || 2;
      else if (section === "locale") manifest.locale = top[2] || "en-US";
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
  }
  if (!manifest.structure.harnessRoot && manifest.harnessRoot) manifest.structure.harnessRoot = manifest.harnessRoot;
  if (!manifest.structure.planningRoot && manifest.harnessRoot) manifest.structure.planningRoot = `${manifest.harnessRoot}/planning`;
  return manifest;
}

function resolveManifestStructurePath(projectRoot, fieldName, relativePath) {
  const raw = String(relativePath || "").trim();
  if (!raw) throw new Error(`Invalid v2 harness manifest: structure.${fieldName} is empty`);
  if (path.isAbsolute(raw)) throw new Error(`Invalid v2 harness manifest: structure.${fieldName} escapes project root: ${raw}`);
  const resolved = path.resolve(projectRoot, raw);
  if (!isPathInside(resolved, projectRoot)) {
    throw new Error(`Invalid v2 harness manifest: structure.${fieldName} escapes project root: ${raw}`);
  }
  return resolved;
}

function isPathInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function dedupeAncestorRoots(roots) {
  const result = [];
  for (const root of [...new Set(roots)].sort((a, b) => a.length - b.length)) {
    if (result.some((parent) => isPathInside(root, parent))) continue;
    result.push(root);
  }
  return result;
}
