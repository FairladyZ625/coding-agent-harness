#!/usr/bin/env node
// @ts-nocheck

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["scripts", "tests"];
const sourceExtensionPattern = /\.(mjs|mts|ts)$/;

export function buildImportGraph({ repoRoot = defaultRepoRoot } = {}) {
  const files = collectSourceFiles(repoRoot);
  const fileSet = new Set(files);
  const nodesByPath = new Map();
  const unresolvedEdges = [];
  const runtimeMjsToTsEdges = [];
  const typesValueImports = [];

  for (const file of files) {
    const content = fs.readFileSync(path.join(repoRoot, file), "utf8");
    const imports = [];

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

  const nodes = [...nodesByPath.values()].sort((left, right) => left.path.localeCompare(right.path));
  const localEdgeCount = nodes.reduce((count, node) => count + node.imports.filter((imported) => imported.target).length, 0);
  const barrelTargets = [
    ...(nodesByPath.get("scripts/lib/harness-core.mts")?.imports.filter((imported) => imported.kind === "export" && imported.target) || []),
    ...(nodesByPath.get("scripts/lib/harness-core.mjs")?.imports.filter((imported) => imported.kind === "export" && imported.target) || []),
  ];

  return {
    schemaVersion: 1,
    sourceRoots,
    summary: {
      fileCount: nodes.length,
      mjsCount: nodes.filter((node) => node.path.endsWith(".mjs")).length,
      localEdgeCount,
      unresolvedLocalEdges: unresolvedEdges.length,
      cycleNodes: cycleNodeSet.size,
      runtimeMjsToTsEdges: runtimeMjsToTsEdges.length,
      typesValueImports: typesValueImports.length,
      binReachableFiles: nodes.filter((node) => node.reachableFromBin).length,
      harnessCoreBarrelTargets: barrelTargets.length,
    },
    nodes,
    unresolvedEdges,
    cycles,
    runtimeMjsToTsEdges,
    typesValueImports,
  };
}

export function checkImportGraph({ repoRoot = defaultRepoRoot, expectNodes, expectEdges } = {}) {
  const graph = buildImportGraph({ repoRoot });
  const violations = [];

  for (const edge of graph.unresolvedEdges) {
    violations.push({ code: "unresolved-local-edge", ...edge });
  }
  for (const cycle of graph.cycles) {
    violations.push({
      code: "cycle",
      cycle,
      message: `import cycle detected: ${cycle.join(" -> ")}`,
    });
  }
  for (const edge of graph.runtimeMjsToTsEdges) {
    violations.push({ code: "mjs-imports-ts", ...edge });
  }
  for (const edge of graph.typesValueImports) {
    violations.push({ code: "types-value-import", ...edge });
  }

  const barrels = graph.nodes.filter((node) => node.path === "scripts/lib/harness-core.mts" || node.path === "scripts/lib/harness-core.mjs");
  for (const edge of barrels.flatMap((barrel) => barrel.imports || [])) {
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

function collectSourceFiles(repoRoot) {
  const files = [];
  for (const root of sourceRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!fs.existsSync(absoluteRoot)) continue;
    walk(absoluteRoot, files, repoRoot);
  }
  return files.sort();
}

function walk(current, files, repoRoot) {
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

function parseImports(content) {
  const imports = [];
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

function skipNonCode(content, index) {
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

function skipString(content, index, quote) {
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

function findStatementEnd(content, index) {
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

function readFirstStringArgument(content, index) {
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

function skipWhitespace(content, index) {
  let cursor = index;
  while (/\s/.test(content[cursor] || "")) cursor += 1;
  return cursor;
}

function isKeywordAt(content, index, keyword) {
  if (content.slice(index, index + keyword.length) !== keyword) return false;
  const before = content[index - 1] || "";
  const after = content[index + keyword.length] || "";
  return !isIdentifierChar(before) && !isIdentifierChar(after);
}

function isIdentifierChar(char) {
  return /[A-Za-z0-9_$]/.test(char);
}

function isLocalSpecifier(specifier) {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/");
}

function resolveLocalSpecifier(repoRoot, importer, specifier) {
  const importerDir = path.dirname(path.join(repoRoot, importer));
  const basePath = specifier.startsWith("/") ? path.join(repoRoot, specifier) : path.resolve(importerDir, specifier);
  for (const candidate of candidatePaths(basePath)) {
    if (fs.existsSync(candidate)) return path.relative(repoRoot, candidate).split(path.sep).join("/");
  }
  const relative = path.relative(repoRoot, basePath).split(path.sep).join("/");
  return relative.startsWith("..") ? undefined : relative;
}

function candidatePaths(basePath) {
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

function markReachable(nodesByPath, startPath, field) {
  const stack = nodesByPath.has(startPath) ? [startPath] : [];
  const seen = new Set();
  while (stack.length > 0) {
    const current = stack.pop();
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

function markBarrelReachable(nodesByPath, barrelPath) {
  const barrel = nodesByPath.get(barrelPath);
  if (!barrel) return;
  for (const imported of barrel.imports) {
    if (imported.kind !== "export" || !imported.target) continue;
    const target = nodesByPath.get(imported.target);
    if (target) target.barrelReachable = true;
  }
}

function findCycles(nodesByPath) {
  const indexByPath = new Map();
  const lowlinkByPath = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];
  let index = 0;

  function strongConnect(file) {
    indexByPath.set(file, index);
    lowlinkByPath.set(file, index);
    index += 1;
    stack.push(file);
    onStack.add(file);

    for (const target of adjacency(nodesByPath, file)) {
      if (!indexByPath.has(target)) {
        strongConnect(target);
        lowlinkByPath.set(file, Math.min(lowlinkByPath.get(file), lowlinkByPath.get(target)));
      } else if (onStack.has(target)) {
        lowlinkByPath.set(file, Math.min(lowlinkByPath.get(file), indexByPath.get(target)));
      }
    }

    if (lowlinkByPath.get(file) === indexByPath.get(file)) {
      const component = [];
      let current;
      do {
        current = stack.pop();
        onStack.delete(current);
        component.push(current);
      } while (current !== file);

      if (component.length > 1 || hasSelfLoop(nodesByPath, component[0])) cycles.push(component.sort());
    }
  }

  for (const file of nodesByPath.keys()) {
    if (!indexByPath.has(file)) strongConnect(file);
  }

  return cycles.sort((left, right) => left[0].localeCompare(right[0]));
}

function assignLayers(nodesByPath, cycleNodeSet) {
  const memo = new Map();

  function layerFor(file, visiting = new Set()) {
    if (memo.has(file)) return memo.get(file);
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

function adjacency(nodesByPath, file) {
  return (nodesByPath.get(file)?.imports || []).map((imported) => imported.target).filter((target) => target && nodesByPath.has(target));
}

function hasSelfLoop(nodesByPath, file) {
  return adjacency(nodesByPath, file).includes(file);
}

function isSharedTypesPath(relativePath) {
  return relativePath === "scripts/lib/types" || relativePath.startsWith("scripts/lib/types/");
}

function hasTypeScriptSourceExtension(filePath) {
  return typeof filePath === "string" && /\.(mts|ts)$/.test(filePath);
}

function parseCliArgs(argv) {
  const args = {
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
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--expect-nodes") args.expectNodes = Number(argv[++index]);
    else if (arg === "--expect-edges") args.expectEdges = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function writeOutput({ graph, args }) {
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
