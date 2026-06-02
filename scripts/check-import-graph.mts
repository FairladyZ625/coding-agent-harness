#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["scripts", "tests"];
const sourceExtensionPattern = /\.(mjs|mts|ts)$/;

type ImportKind = "import" | "export";
type ImportType = "dynamic" | "type" | "value" | "re-export";

type ParsedImport = {
  kind: ImportKind;
  importType: ImportType;
  specifier: string;
};

type ImportEdge = ParsedImport & {
  target?: string;
};

type ImportGraphNode = {
  path: string;
  kind: string;
  imports: ImportEdge[];
  importType: ImportType[];
  reachableFromHarnessCore: boolean;
  reachableFromBin: boolean;
  barrelReachable: boolean;
  layer: number | null;
};

type ImportGraphViolation = {
  code?: string;
  message: string;
  file?: string;
  target?: string | null;
  specifier?: string;
  resolved?: string | null;
  cycle?: string[];
  expected?: number;
  actual?: number;
};

type ArchitectureContractLayer = {
  id: string;
  owns: string[];
  mayImport: string[];
};

type ArchitecturePhaseOpenException = {
  id: string;
  source: string;
  target: string;
  ownerPhase: string;
  expiryPhase: string;
  reason: string;
  evidence: string;
};

type ArchitectureSharedFileLock = {
  path: string;
  ownerPhase: string;
  reason: string;
};

type ArchitectureImportContract = {
  version: string;
  layers: ArchitectureContractLayer[];
  phaseOpenExceptions: ArchitecturePhaseOpenException[];
  sharedFileLocks: ArchitectureSharedFileLock[];
  boundaryRules: string[];
};

type ImportGraph = {
  schemaVersion: 1;
  sourceRoots: string[];
  architectureContract: ArchitectureImportContract;
  summary: {
    fileCount: number;
    mjsCount: number;
    localEdgeCount: number;
    unresolvedLocalEdges: number;
    cycleNodes: number;
    runtimeMjsToTsEdges: number;
    typesValueImports: number;
    architectureBoundaryViolations: number;
    binReachableFiles: number;
    harnessCoreBarrelTargets: number;
  };
  nodes: ImportGraphNode[];
  unresolvedEdges: ImportGraphViolation[];
  cycles: string[][];
  runtimeMjsToTsEdges: ImportGraphViolation[];
  typesValueImports: ImportGraphViolation[];
  architectureBoundaryViolations: ImportGraphViolation[];
};

type ImportGraphOptions = {
  repoRoot?: string;
};

type CheckImportGraphOptions = ImportGraphOptions & {
  expectNodes?: number;
  expectEdges?: number;
};

export const architectureImportContract: ArchitectureImportContract = {
  version: "architecture-import-contract/2026-06-02-p03",
  layers: [
    {
      id: "kernel",
      owns: ["scripts/infrastructure/kernel/**"],
      mayImport: ["scripts/infrastructure/kernel/**", "scripts/lib/types/**"],
    },
    {
      id: "domain",
      owns: ["scripts/domain/**"],
      mayImport: ["scripts/domain/**", "scripts/infrastructure/kernel/**", "scripts/lib/types/**"],
    },
    {
      id: "ports",
      owns: ["scripts/ports/**"],
      mayImport: ["scripts/domain/**", "scripts/lib/types/**"],
    },
    {
      id: "application",
      owns: ["scripts/application/**"],
      mayImport: ["scripts/application/**", "scripts/domain/**", "scripts/ports/**", "scripts/infrastructure/kernel/**", "phase-open-exceptions"],
    },
    {
      id: "adapters",
      owns: ["scripts/adapters/**"],
      mayImport: ["scripts/application/**", "scripts/ports/**", "scripts/domain/**", "scripts/lib/types/**"],
    },
    {
      id: "commands",
      owns: ["scripts/commands/**"],
      mayImport: ["scripts/application/**", "scripts/ports/**", "scripts/domain/**", "scripts/lib/types/**"],
    },
    {
      id: "dashboard-data",
      owns: ["scripts/lib/dashboard-data.mts"],
      mayImport: ["semantic projection/repository outputs", "phase-open-exceptions"],
    },
    {
      id: "dashboard-workbench",
      owns: ["scripts/lib/dashboard-workbench.mts"],
      mayImport: ["scripts/application/workbench/**", "scripts/application/task/**", "semantic projection/repository outputs", "phase-open-exceptions"],
    },
    {
      id: "preset-runtime",
      owns: ["scripts/lib/preset-runner.mts", "scripts/lib/preset-engine.mts", "scripts/lib/preset-registry.mts", "scripts/domain/preset/**"],
      mayImport: ["HarnessTransaction/OperationPlan boundaries", "phase-open-exceptions"],
    },
    {
      id: "generated-governance",
      owns: ["scripts/lib/governance-index-generator.mts"],
      mayImport: ["TaskRepository/projection records", "phase-open-exceptions"],
    },
  ],
  phaseOpenExceptions: [
    {
      id: "P04-application-task-operations-legacy-bridge",
      source: "scripts/application/task/task-operations.mts",
      target: "scripts/lib/task-lifecycle.mts",
      ownerPhase: "P04-transaction-cutover",
      expiryPhase: "P07-task-operations-facade-removal",
      reason: "TaskOperations is the current application seam while lifecycle writes move behind HarnessTransaction and stable use-case ports.",
      evidence: "import graph check plus P04 no-data-loss lifecycle fixtures",
    },
    {
      id: "P05-application-tombstone-repository-resolution-bridge",
      source: "scripts/application/task/tombstone-operations.mts",
      target: "scripts/lib/task-repository.mts",
      ownerPhase: "P05-repository-scanner-strangler",
      expiryPhase: "P07-task-operations-facade-removal",
      reason: "Tombstone mutations now resolve task directories through the TaskRepository Module resolver helper, but the concrete adapter is still scanner-backed until P05 completes repository/scanner strangling.",
      evidence: "import graph check plus P04 tombstone no-data-loss fixtures and P05 repository parity fixtures",
    },
    {
      id: "P04-application-task-operations-lesson-bridge",
      source: "scripts/application/task/task-operations.mts",
      target: "scripts/lib/task-lesson-sedimentation.mts",
      ownerPhase: "P04-transaction-cutover",
      expiryPhase: "P07-task-operations-facade-removal",
      reason: "Lesson task creation remains a legacy command bridge until lifecycle writes are expressed as application changesets.",
      evidence: "import graph check plus P04 lesson-routing fixtures",
    },
    {
      id: "P05-application-task-operations-repository-bridge",
      source: "scripts/application/task/task-operations.mts",
      target: "scripts/lib/task-repository.mts",
      ownerPhase: "P05-repository-scanner-strangler",
      expiryPhase: "P07-task-operations-facade-removal",
      reason: "TaskOperations still creates the scanner-backed repository until the TaskRepository port is owned outside legacy scripts/lib.",
      evidence: "import graph check plus P05 repository/scanner parity fixtures",
    },
    {
      id: "P06-application-task-operations-projection-bridge",
      source: "scripts/application/task/task-operations.mts",
      target: "scripts/lib/task-semantic-projection.mts",
      ownerPhase: "P06-dashboard-projection-consumer-cutover",
      expiryPhase: "P08-dashboard-workbench-consumer-cutover",
      reason: "TaskOperations still exposes the shared semantic projection until Dashboard/Test consumers fully depend on the stable projection contract.",
      evidence: "import graph check plus P06 Dashboard/Test schema/no-data-loss fixtures",
    },
    {
      id: "P08-application-workbench-review-confirmation-sync-bridge",
      source: "scripts/application/workbench/review-confirmation.mts",
      target: "scripts/lib/governance-sync.mts",
      ownerPhase: "P08-dashboard-workbench-consumer-cutover",
      expiryPhase: "P08-dashboard-workbench-consumer-cutover",
      reason: "Workbench review confirmation still needs governance lock/write helpers until the workbench adapter consumes application changesets.",
      evidence: "import graph check plus P08 workbench smoke and no-data-loss fixtures",
    },
    {
      id: "P08-application-workbench-review-confirmation-lifecycle-bridge",
      source: "scripts/application/workbench/review-confirmation.mts",
      target: "scripts/lib/task-lifecycle.mts",
      ownerPhase: "P08-dashboard-workbench-consumer-cutover",
      expiryPhase: "P08-dashboard-workbench-consumer-cutover",
      reason: "Deferred review-confirm finalization remains legacy lifecycle behavior until workbench confirmation moves behind application contracts.",
      evidence: "import graph check plus P08 review-confirm workbench fixtures",
    },
    {
      id: "P06-dashboard-data-repository-bridge",
      source: "scripts/lib/dashboard-data.mts",
      target: "scripts/lib/task-repository.mts",
      ownerPhase: "P06-dashboard-projection-consumer-cutover",
      expiryPhase: "P06-dashboard-projection-consumer-cutover",
      reason: "Dashboard bundle generation still consumes the scanner-backed repository until dashboard data is fully derived from stable projection outputs.",
      evidence: "import graph check plus P06 dashboard generation/schema fixtures",
    },
    {
      id: "P08-dashboard-workbench-lesson-bridge",
      source: "scripts/lib/dashboard-workbench.mts",
      target: "scripts/lib/task-lesson-sedimentation.mts",
      ownerPhase: "P08-dashboard-workbench-consumer-cutover",
      expiryPhase: "P08-dashboard-workbench-consumer-cutover",
      reason: "Workbench lesson-sedimentation action remains a legacy bridge until workbench actions use application command contracts.",
      evidence: "import graph check plus P08 workbench action fixtures",
    },
    {
      id: "P08-dashboard-workbench-repository-bridge",
      source: "scripts/lib/dashboard-workbench.mts",
      target: "scripts/lib/task-repository.mts",
      ownerPhase: "P08-dashboard-workbench-consumer-cutover",
      expiryPhase: "P08-dashboard-workbench-consumer-cutover",
      reason: "Workbench still creates the scanner-backed repository until its read paths consume stable task repository/projection ports.",
      evidence: "import graph check plus P08 workbench smoke fixtures",
    },
    {
      id: "P08-dashboard-workbench-review-confirm-internal-bridge",
      source: "scripts/lib/dashboard-workbench.mts",
      target: "scripts/lib/task-lifecycle/review-confirm.mts",
      ownerPhase: "P08-dashboard-workbench-consumer-cutover",
      expiryPhase: "P08-dashboard-workbench-consumer-cutover",
      reason: "Workbench still calls review-confirm internals directly until review confirmation is fully routed through application workbench contracts.",
      evidence: "import graph check plus P08 review-confirm workbench fixtures",
    },
    {
      id: "P08-dashboard-workbench-projection-bridge",
      source: "scripts/lib/dashboard-workbench.mts",
      target: "scripts/lib/task-semantic-projection.mts",
      ownerPhase: "P08-dashboard-workbench-consumer-cutover",
      expiryPhase: "P08-dashboard-workbench-consumer-cutover",
      reason: "Workbench still builds semantic projection responses directly until it consumes stable projection service ports.",
      evidence: "import graph check plus P08 workbench schema fixtures",
    },
  ],
  sharedFileLocks: [
    { path: "scripts/lib/harness-transaction.mts", ownerPhase: "P04-transaction-cutover", reason: "Transaction/ChangeSet write contract." },
    { path: "scripts/lib/task-lifecycle.mts", ownerPhase: "P04-transaction-cutover", reason: "Current lifecycle write facade and legacy bridge." },
    { path: "scripts/lib/governance-sync.mts", ownerPhase: "P04-transaction-cutover", reason: "Current low-level write/lock implementation." },
    { path: "scripts/lib/task-repository.mts", ownerPhase: "P05-repository-scanner-strangler", reason: "TaskRepository port and scanner-backed implementation." },
    { path: "scripts/lib/task-scanner.mts", ownerPhase: "P05-repository-scanner-strangler", reason: "Legacy scanner adapter and migration-only boundary." },
    { path: "scripts/lib/task-semantic-projection.mts", ownerPhase: "P06-dashboard-projection-consumer-cutover", reason: "Shared CLI/Dashboard/Test semantic contract." },
    { path: "scripts/lib/dashboard-data.mts", ownerPhase: "P06-dashboard-projection-consumer-cutover", reason: "Dashboard projection consumer." },
    { path: "scripts/lib/dashboard-workbench.mts", ownerPhase: "P08-dashboard-workbench-consumer-cutover", reason: "Workbench command adapter and review-confirm consumer." },
    { path: "scripts/lib/preset-runner.mts", ownerPhase: "P09-preset-runtime-cutover", reason: "Preset runtime transaction boundary." },
    { path: "scripts/lib/preset-engine.mts", ownerPhase: "P09-preset-runtime-cutover", reason: "Preset runtime package and template boundary." },
    { path: "scripts/lib/preset-registry.mts", ownerPhase: "P09-preset-runtime-cutover", reason: "Preset discovery and package surface boundary." },
    { path: "package.json", ownerPhase: "P13-deletion-and-package-surface", reason: "Package export/bin/files surface." },
  ],
  boundaryRules: [
    "kernel-imports-outer-layer",
    "domain-imports-outer-layer",
    "domain-imports-infrastructure",
    "application-imports-adapter",
    "application-imports-unregistered-legacy-surface",
    "runtime-imports-task-operations-facade",
    "adapter-imports-task-internal",
    "command-imports-task-internal",
    "dashboard-workbench-imports-task-internal",
    "dashboard-data-imports-task-internal",
    "generated-governance-imports-task-scanner",
    "preset-runtime-imports-governance-sync",
  ],
};

type CliArgs = {
  check: boolean;
  json: boolean;
  out?: string;
  expectNodes?: number;
  expectEdges?: number;
};

export function buildImportGraph({ repoRoot = defaultRepoRoot }: ImportGraphOptions = {}): ImportGraph {
  const files = collectSourceFiles(repoRoot);
  const fileSet = new Set(files);
  const nodesByPath = new Map<string, ImportGraphNode>();
  const unresolvedEdges: ImportGraphViolation[] = [];
  const runtimeMjsToTsEdges: ImportGraphViolation[] = [];
  const typesValueImports: ImportGraphViolation[] = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
    const imports: ImportEdge[] = [];

    for (const imported of parseImports(content)) {
      if (!isLocalSpecifier(imported.specifier)) continue;

      const resolved = resolveLocalSpecifier(repoRoot, file, imported.specifier);
      const target = resolved && fileSet.has(resolved) ? resolved : undefined;
      const edge = {
        specifier: imported.specifier,
        kind: imported.kind,
        importType: imported.importType,
        target,
      };
      imports.push(edge);

      if (!target) {
        unresolvedEdges.push({
          file,
          specifier: imported.specifier,
          resolved: resolved || null,
          message: `${file} imports unresolved local specifier ${imported.specifier}`,
        });
      }

      if (file.endsWith(".mjs") && (hasTypeScriptSourceExtension(imported.specifier) || hasTypeScriptSourceExtension(target))) {
        runtimeMjsToTsEdges.push({
          file,
          specifier: imported.specifier,
          target: target || resolved || null,
          message: `${file} imports TypeScript from runtime .mjs: ${imported.specifier}`,
        });
      }

      if (target && isSharedTypesPath(target) && imported.importType !== "type") {
        typesValueImports.push({
          file,
          specifier: imported.specifier,
          target,
          message: `${file} value-imports shared type island: ${imported.specifier}`,
        });
      }
    }

    nodesByPath.set(file, {
      path: file,
      kind: path.extname(file).slice(1),
      imports,
      importType: [...new Set(imports.map((imported) => imported.importType))],
      reachableFromHarnessCore: false,
      reachableFromBin: false,
      barrelReachable: false,
      layer: null,
    });
  }

  for (const entrypoint of ["scripts/harness.mts", "scripts/harness.mjs"]) {
    markReachable(nodesByPath, entrypoint, "reachableFromBin");
  }
  for (const core of ["scripts/lib/harness-core.mts", "scripts/lib/harness-core.mjs"]) {
    markReachable(nodesByPath, core, "reachableFromHarnessCore");
    markBarrelReachable(nodesByPath, core);
  }

  const cycles = findCycles(nodesByPath);
  const cycleNodeSet = new Set(cycles.flat());
  assignLayers(nodesByPath, cycleNodeSet);
  const architectureBoundaryViolations = findArchitectureBoundaryViolations(nodesByPath);

  const nodes = [...nodesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  const localEdgeCount = nodes.reduce((count, node) => count + node.imports.filter((imported) => imported.target).length, 0);
  const barrelTargets = [
    ...(nodesByPath.get("scripts/lib/harness-core.mts")?.imports.filter((imported) => imported.kind === "export" && imported.target) || []),
    ...(nodesByPath.get("scripts/lib/harness-core.mjs")?.imports.filter((imported) => imported.kind === "export" && imported.target) || []),
  ];

  return {
    schemaVersion: 1,
    sourceRoots,
    architectureContract: architectureImportContract,
    summary: {
      fileCount: nodes.length,
      mjsCount: nodes.filter((node) => node.path.endsWith(".mjs")).length,
      localEdgeCount,
      unresolvedLocalEdges: unresolvedEdges.length,
      cycleNodes: cycleNodeSet.size,
      runtimeMjsToTsEdges: runtimeMjsToTsEdges.length,
      typesValueImports: typesValueImports.length,
      architectureBoundaryViolations: architectureBoundaryViolations.length,
      binReachableFiles: nodes.filter((node) => node.reachableFromBin).length,
      harnessCoreBarrelTargets: barrelTargets.length,
    },
    nodes,
    unresolvedEdges,
    cycles,
    runtimeMjsToTsEdges,
    typesValueImports,
    architectureBoundaryViolations,
  };
}

export function checkImportGraph({ repoRoot = defaultRepoRoot, expectNodes, expectEdges }: CheckImportGraphOptions = {}) {
  const graph = buildImportGraph({ repoRoot });
  const violations: ImportGraphViolation[] = [];

  for (const edge of graph.unresolvedEdges) {
    violations.push({ ...edge, code: "unresolved-local-edge" });
  }
  for (const cycle of graph.cycles) {
    violations.push({
      code: "cycle",
      cycle,
      message: `import cycle detected: ${cycle.join(" -> ")}`,
    });
  }
  for (const edge of graph.runtimeMjsToTsEdges) {
    violations.push({ ...edge, code: "mjs-imports-ts" });
  }
  for (const edge of graph.typesValueImports) {
    violations.push({ ...edge, code: "types-value-import" });
  }
  for (const edge of graph.architectureBoundaryViolations) {
    violations.push(edge);
  }

  const barrels = graph.nodes.filter((node) => node.path === "scripts/lib/harness-core.mts" || node.path === "scripts/lib/harness-core.mjs");
  for (const barrel of barrels) {
    for (const edge of barrel.imports || []) {
      if (edge.kind !== "export" || !edge.target) continue;
      const target = graph.nodes.find((node) => node.path === edge.target);
      if (!target?.barrelReachable) {
        violations.push({
          code: "barrel-target-not-reachable",
          file: barrel.path,
          target: edge.target,
          message: `${edge.target} is exported by harness-core but is not marked barrel reachable`,
        });
      }
    }
  }

  if (expectNodes !== undefined && graph.summary.fileCount !== expectNodes) {
    violations.push({
      code: "node-count-drift",
      expected: expectNodes,
      actual: graph.summary.fileCount,
      message: `expected ${expectNodes} graph files, got ${graph.summary.fileCount}`,
    });
  }

  if (expectEdges !== undefined && graph.summary.localEdgeCount !== expectEdges) {
    violations.push({
      code: "edge-count-drift",
      expected: expectEdges,
      actual: graph.summary.localEdgeCount,
      message: `expected ${expectEdges} local graph edges, got ${graph.summary.localEdgeCount}`,
    });
  }

  return { ok: violations.length === 0, graph, violations };
}

function collectSourceFiles(repoRoot: string): string[] {
  const files: string[] = [];
  for (const root of sourceRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absoluteRoot)) continue;
    walk(absoluteRoot, files, repoRoot);
  }
  return files.sort();
}

function walk(current: string, files: string[], repoRoot: string): void {
  const stat = fs.lstatSync(current);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    const name = path.basename(current);
    if (name === "node_modules" || name === ".worktrees" || name === "tmp" || name === "dist" || name === "coverage") return;
    for (const entry of fs.readdirSync(current)) walk(path.join(current, entry), files, repoRoot);
    return;
  }
  if (stat.isFile() && sourceExtensionPattern.test(current)) {
    files.push(path.relative(repoRoot, current).split(path.sep).join("/"));
  }
}

function parseImports(content: string): ParsedImport[] {
  const imports: ParsedImport[] = [];
  let index = 0;

  while (index < content.length) {
    const skipped = skipNonCode(content, index);
    if (skipped !== index) {
      index = skipped;
      continue;
    }

    if (isKeywordAt(content, index, "import")) {
      const afterKeyword = skipWhitespace(content, index + "import".length);
      if (content[afterKeyword] === ".") {
        index = afterKeyword + 1;
        continue;
      }
      if (content[afterKeyword] === "(") {
        const specifier = readFirstStringArgument(content, afterKeyword + 1);
        if (specifier) imports.push({ kind: "import", importType: "dynamic", specifier });
        index = afterKeyword + 1;
        continue;
      }

      const statement = content.slice(index, findStatementEnd(content, index));
      const sideEffect = statement.match(/\bimport\s+["']([^"']+)["']/s);
      const fromImport = statement.match(/\bfrom\s*["']([^"']+)["']/s);
      const specifier = fromImport?.[1] || sideEffect?.[1];
      if (specifier) {
        imports.push({
          kind: "import",
          importType: /^\s*import\s+type\b/s.test(statement) ? "type" : "value",
          specifier,
        });
      }
    } else if (isKeywordAt(content, index, "export")) {
      const statement = content.slice(index, findStatementEnd(content, index));
      const fromExport = statement.match(/\bfrom\s*["']([^"']+)["']/s);
      if (fromExport) {
        imports.push({
          kind: "export",
          importType: /^\s*export\s+type\b/s.test(statement) ? "type" : "re-export",
          specifier: fromExport[1],
        });
      }
    }

    index += 1;
  }

  return imports;
}

function skipNonCode(content: string, index: number): number {
  const char = content[index];
  const next = content[index + 1];

  if (char === "/" && next === "/") {
    const lineEnd = content.indexOf("\n", index + 2);
    return lineEnd === -1 ? content.length : lineEnd + 1;
  }
  if (char === "/" && next === "*") {
    const commentEnd = content.indexOf("*/", index + 2);
    return commentEnd === -1 ? content.length : commentEnd + 2;
  }
  if (char === "'" || char === '"' || char === "`") {
    return skipString(content, index, char);
  }
  return index;
}

function skipString(content: string, index: number, quote: string): number {
  let cursor = index + 1;
  while (cursor < content.length) {
    if (content[cursor] === "\\") {
      cursor += 2;
      continue;
    }
    if (content[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return content.length;
}

function findStatementEnd(content: string, index: number): number {
  let cursor = index;
  while (cursor < content.length) {
    const skipped = skipNonCode(content, cursor);
    if (skipped !== cursor) {
      cursor = skipped;
      continue;
    }
    if (content[cursor] === ";") return cursor + 1;
    cursor += 1;
  }
  return content.length;
}

function readFirstStringArgument(content: string, index: number): string | undefined {
  let cursor = skipWhitespace(content, index);
  const quote = content[cursor];
  if (quote !== "'" && quote !== '"') return undefined;
  cursor += 1;
  let value = "";
  while (cursor < content.length) {
    if (content[cursor] === "\\") {
      value += content[cursor + 1] || "";
      cursor += 2;
      continue;
    }
    if (content[cursor] === quote) return value;
    value += content[cursor];
    cursor += 1;
  }
  return undefined;
}

function skipWhitespace(content: string, index: number): number {
  let cursor = index;
  while (/\s/.test(content[cursor] || "")) cursor += 1;
  return cursor;
}

function isKeywordAt(content: string, index: number, keyword: string): boolean {
  if (content.slice(index, index + keyword.length) !== keyword) return false;
  const before = content[index - 1] || "";
  const after = content[index + keyword.length] || "";
  return !isIdentifierChar(before) && !isIdentifierChar(after);
}

function isIdentifierChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
}

function resolveLocalSpecifier(repoRoot: string, importer: string, specifier: string): string | undefined {
  const importerDir = path.dirname(path.join(repoRoot, importer));
  const basePath = specifier.startsWith("/") ? path.join(repoRoot, specifier) : path.resolve(importerDir, specifier);
  for (const candidate of candidatePaths(basePath)) {
    if (fs.existsSync(candidate)) return path.relative(repoRoot, candidate).split(path.sep).join("/");
  }
  const relative = path.relative(repoRoot, basePath).split(path.sep).join("/");
  return relative.startsWith("..") ? undefined : relative;
}

function candidatePaths(basePath: string): string[] {
  const extension = path.extname(basePath);
  if (extension) {
    const paths = [basePath];
    if (extension === ".js") paths.push(basePath.slice(0, -3) + ".ts", basePath.slice(0, -3) + ".mts", basePath.slice(0, -3) + ".mjs");
    if (extension === ".mjs") paths.push(basePath.slice(0, -4) + ".mts");
    return paths;
  }
  return [
    basePath,
    `${basePath}.mjs`,
    `${basePath}.mts`,
    `${basePath}.ts`,
    `${basePath}.js`,
    path.join(basePath, "index.mjs"),
    path.join(basePath, "index.ts"),
  ];
}

function markReachable(nodesByPath: Map<string, ImportGraphNode>, startPath: string, field: "reachableFromBin" | "reachableFromHarnessCore"): void {
  const stack = nodesByPath.has(startPath) ? [startPath] : [];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    if (seen.has(current)) continue;
    seen.add(current);
    const node = nodesByPath.get(current);
    if (!node) continue;
    node[field] = true;
    for (const imported of node.imports) {
      if (imported.target) stack.push(imported.target);
    }
  }
}

function markBarrelReachable(nodesByPath: Map<string, ImportGraphNode>, barrelPath: string): void {
  const barrel = nodesByPath.get(barrelPath);
  if (!barrel) return;
  for (const imported of barrel.imports) {
    if (imported.kind !== "export" || !imported.target) continue;
    const target = nodesByPath.get(imported.target);
    if (target) target.barrelReachable = true;
  }
}

function findArchitectureBoundaryViolations(nodesByPath: Map<string, ImportGraphNode>): ImportGraphViolation[] {
  const violations: ImportGraphViolation[] = [];
  for (const node of nodesByPath.values()) {
    for (const edge of node.imports) {
      if (!edge.target) continue;
      const code = architectureBoundaryCode(node.path, edge.target);
      if (!code) continue;
      violations.push({
        code,
        file: node.path,
        target: edge.target,
        specifier: edge.specifier,
        message: architectureBoundaryMessage(code, node.path, edge.target),
      });
    }
  }
  return violations.sort((left, right) => `${left.file}:${left.code}:${left.target}`.localeCompare(`${right.file}:${right.code}:${right.target}`));
}

function architectureBoundaryCode(file: string, target: string): string {
  if (file.startsWith("scripts/infrastructure/kernel/") && !target.startsWith("scripts/infrastructure/kernel/")) {
    return "kernel-imports-outer-layer";
  }
  if (file.startsWith("scripts/domain/") && (target.startsWith("scripts/adapters/") || target.startsWith("scripts/application/"))) {
    return "domain-imports-outer-layer";
  }
  if (file.startsWith("scripts/domain/") && target.startsWith("scripts/infrastructure/") && !target.startsWith("scripts/infrastructure/kernel/")) {
    return "domain-imports-infrastructure";
  }
  if (file.startsWith("scripts/application/") && target.startsWith("scripts/adapters/")) {
    return "application-imports-adapter";
  }
  if (file.startsWith("scripts/application/") && isLegacyTaskRuntimeSurface(target) && !isArchitecturePhaseOpenException(file, target)) {
    return "application-imports-unregistered-legacy-surface";
  }
  if ((file.startsWith("scripts/commands/") || file === "scripts/lib/dashboard-workbench.mts") && target === "scripts/lib/task-operations.mts") {
    return "runtime-imports-task-operations-facade";
  }
  if (file.startsWith("scripts/adapters/") && isTaskSourceOfTruthInternal(target) && !isArchitecturePhaseOpenException(file, target)) {
    return "adapter-imports-task-internal";
  }
  if (file.startsWith("scripts/commands/") && isTaskSourceOfTruthInternal(target) && !isArchitecturePhaseOpenException(file, target)) {
    return "command-imports-task-internal";
  }
  if (file === "scripts/lib/dashboard-workbench.mts" && isTaskSourceOfTruthInternal(target) && !isArchitecturePhaseOpenException(file, target)) {
    return "dashboard-workbench-imports-task-internal";
  }
  if (file === "scripts/lib/dashboard-data.mts" && isTaskSourceOfTruthInternal(target) && !isArchitecturePhaseOpenException(file, target)) {
    return "dashboard-data-imports-task-internal";
  }
  if (file === "scripts/lib/governance-index-generator.mts" && target === "scripts/lib/task-scanner.mts") {
    return "generated-governance-imports-task-scanner";
  }
  if (isPresetRuntimePath(file) && target === "scripts/lib/governance-sync.mts") {
    return "preset-runtime-imports-governance-sync";
  }
  return "";
}

function architectureBoundaryMessage(code: string, file: string, target: string): string {
  if (code === "kernel-imports-outer-layer") return `${file} is infrastructure/kernel and must not import outer layer module ${target}`;
  if (code === "domain-imports-outer-layer") return `${file} is domain code and must not import outer layer module ${target}`;
  if (code === "domain-imports-infrastructure") return `${file} is domain code and may only import infrastructure/kernel, not ${target}`;
  if (code === "application-imports-adapter") return `${file} is application code and must not import adapter module ${target}`;
  if (code === "application-imports-unregistered-legacy-surface") return `${file} is application code and may import legacy task runtime surface ${target} only through a phase-open architecture contract exception`;
  if (code === "runtime-imports-task-operations-facade") return `${file} must import TaskOperations from scripts/application/task, not the scripts/lib compatibility facade`;
  if (code === "adapter-imports-task-internal") return `${file} adapter must go through application/repository boundaries, not task internal ${target}`;
  if (code === "command-imports-task-internal") return `${file} command adapter must go through application/repository boundaries, not task internal ${target}`;
  if (code === "dashboard-workbench-imports-task-internal") return `${file} must go through application workbench boundaries, not task internal ${target}`;
  if (code === "dashboard-data-imports-task-internal") return `${file} must consume Task projection/repository outputs, not task internal ${target}`;
  if (code === "generated-governance-imports-task-scanner") return `${file} must consume TaskRepository/projection records, not scanner internals ${target}`;
  if (code === "preset-runtime-imports-governance-sync") return `${file} must use HarnessTransaction/OperationPlan boundaries, not governance-sync directly`;
  return `${file} violates architecture boundary by importing ${target}`;
}

function isArchitecturePhaseOpenException(file: string, target: string): boolean {
  return architectureImportContract.phaseOpenExceptions.some((exception) => exception.source === file && exception.target === target);
}

function isLegacyTaskRuntimeSurface(target: string): boolean {
  return target === "scripts/lib/governance-sync.mts"
    || target === "scripts/lib/task-lifecycle.mts"
    || target.startsWith("scripts/lib/task-lifecycle/")
    || target === "scripts/lib/task-lesson-sedimentation.mts"
    || target === "scripts/lib/task-repository.mts"
    || target === "scripts/lib/task-scanner.mts"
    || target === "scripts/lib/task-semantic-projection.mts"
    || target === "scripts/lib/task-tombstone-commands.mts";
}

function isTaskSourceOfTruthInternal(target: string): boolean {
  return isLegacyTaskRuntimeSurface(target);
}

function isPresetRuntimePath(file: string): boolean {
  return [
    "scripts/lib/preset-runner.mts",
    "scripts/lib/preset-engine.mts",
    "scripts/lib/preset-registry.mts",
  ].includes(file) || file.startsWith("scripts/domain/preset/");
}

function findCycles(nodesByPath: Map<string, ImportGraphNode>): string[][] {
  const indexByPath = new Map<string, number>();
  const lowlinkByPath = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  let index = 0;

  function strongConnect(file: string): void {
    indexByPath.set(file, index);
    lowlinkByPath.set(file, index);
    index += 1;
    stack.push(file);
    onStack.add(file);

    for (const target of adjacency(nodesByPath, file)) {
      if (!indexByPath.has(target)) {
        strongConnect(target);
        lowlinkByPath.set(file, Math.min(lowlinkByPath.get(file) ?? 0, lowlinkByPath.get(target) ?? 0));
      } else if (onStack.has(target)) {
        lowlinkByPath.set(file, Math.min(lowlinkByPath.get(file) ?? 0, indexByPath.get(target) ?? 0));
      }
    }

    if (lowlinkByPath.get(file) === indexByPath.get(file)) {
      const component: string[] = [];
      let current: string | undefined;
      do {
        current = stack.pop();
        if (!current) break;
        onStack.delete(current);
        component.push(current);
      } while (current !== file);

      if (component.length > 1 || hasSelfLoop(nodesByPath, component[0] ?? "")) cycles.push(component.sort());
    }
  }

  for (const file of nodesByPath.keys()) {
    if (!indexByPath.has(file)) strongConnect(file);
  }

  return cycles.sort((left, right) => (left[0] ?? "").localeCompare(right[0] ?? ""));
}

function assignLayers(nodesByPath: Map<string, ImportGraphNode>, cycleNodeSet: Set<string>): void {
  const memo = new Map<string, number | null>();

  function layerFor(file: string, visiting = new Set<string>()): number | null {
    if (memo.has(file)) return memo.get(file) ?? null;
    if (cycleNodeSet.has(file) || visiting.has(file)) {
      memo.set(file, null);
      return null;
    }

    visiting.add(file);
    let maxDependencyLayer = -1;
    for (const target of adjacency(nodesByPath, file)) {
      const dependencyLayer = layerFor(target, visiting);
      if (dependencyLayer !== null) maxDependencyLayer = Math.max(maxDependencyLayer, dependencyLayer);
    }
    visiting.delete(file);

    const layer = maxDependencyLayer + 1;
    memo.set(file, layer);
    return layer;
  }

  for (const node of nodesByPath.values()) {
    node.layer = layerFor(node.path);
  }
}

function adjacency(nodesByPath: Map<string, ImportGraphNode>, file: string): string[] {
  return (nodesByPath.get(file)?.imports || []).map((imported) => imported.target).filter((target): target is string => Boolean(target && nodesByPath.has(target)));
}

function hasSelfLoop(nodesByPath: Map<string, ImportGraphNode>, file: string): boolean {
  return adjacency(nodesByPath, file).includes(file);
}

function isSharedTypesPath(relativePath: string): boolean {
  return relativePath === "scripts/lib/types" || relativePath.startsWith("scripts/lib/types/");
}

function hasTypeScriptSourceExtension(filePath: unknown): boolean {
  return typeof filePath === "string" && /\.(mts|ts)$/.test(filePath);
}

function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    check: false,
    json: false,
    out: undefined,
    expectNodes: undefined,
    expectEdges: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--check") args.check = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--out") {
      args.out = requireValue(argv, index, arg);
      index += 1;
    } else if (arg === "--expect-nodes") {
      args.expectNodes = Number(requireValue(argv, index, arg));
      index += 1;
    } else if (arg === "--expect-edges") {
      args.expectEdges = Number(requireValue(argv, index, arg));
      index += 1;
    }
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function requireValue(argv: string[], index: number, option: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${option} requires a value`);
  return value;
}

function writeOutput({ graph, args }: { graph: ImportGraph; args: CliArgs }): void {
  if (args.out) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(graph, null, 2)}\n`);
  }

  if (args.json) {
    console.log(JSON.stringify(graph, null, 2));
    return;
  }

  console.log(
    [
      `Import graph: ${graph.summary.fileCount} files, ${graph.summary.localEdgeCount} local edges`,
      `unresolved=${graph.summary.unresolvedLocalEdges}`,
      `cycles=${graph.summary.cycleNodes}`,
      `mjsToTs=${graph.summary.runtimeMjsToTsEdges}`,
      `typesValueImports=${graph.summary.typesValueImports}`,
      `architectureBoundaries=${graph.summary.architectureBoundaryViolations}`,
    ].join(", "),
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const result = checkImportGraph({
      expectNodes: args.expectNodes,
      expectEdges: args.expectEdges,
    });

    writeOutput({ graph: result.graph, args });

    if (args.check || args.expectNodes !== undefined || args.expectEdges !== undefined) {
      if (!result.ok) {
        console.error(result.violations.map((violation) => violation.message).join("\n"));
        process.exit(1);
      }
      console.log("Import graph gate passed");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
