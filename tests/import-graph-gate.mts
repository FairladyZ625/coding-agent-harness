#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.env.HARNESS_TEST_REPO_ROOT || path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
type ImportGraphNode = {
  path: string;
  reachableFromBin?: boolean;
  reachableFromHarnessCore?: boolean;
  barrelReachable?: boolean;
  layer: number;
};
type ImportGraph = {
  summary: {
    fileCount: number;
    localEdgeCount: number;
    unresolvedLocalEdges: number;
    cycleNodes: number;
    runtimeMjsToTsEdges: number;
    typesValueImports: number;
    architectureBoundaryViolations: number;
  };
  nodes: ImportGraphNode[];
};
type ImportGraphViolation = { code: string; message: string };
type ImportGraphCheck = {
  ok: boolean;
  violations: ImportGraphViolation[];
};
type ImportGraphApi = {
  buildImportGraph(options: { repoRoot: string }): ImportGraph;
  checkImportGraph(options: { repoRoot: string; expectNodes?: number; expectEdges?: number }): ImportGraphCheck;
};
const { buildImportGraph, checkImportGraph } = await import(pathToFileURL(path.join(repoRoot, "dist/check-import-graph.mjs")).href) as ImportGraphApi;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeFixture(root: string, relativePath: string, content: string): void {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function nodeByPath(graph: ImportGraph, relativePath: string): ImportGraphNode {
  const node = graph.nodes.find((candidate) => candidate.path === relativePath);
  assert(node, `missing graph node ${relativePath}`);
  return node;
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-import-graph-"));

writeFixture(
  fixtureRoot,
  "scripts/harness.mjs",
  'import { core } from "./lib/harness-core.mjs";\nawait import("./commands/task-command.mjs");\nconsole.log(core);\n',
);
writeFixture(fixtureRoot, "scripts/commands/task-command.mjs", 'import { leaf } from "../lib/leaf.mjs";\nconsole.log(leaf);\n');
writeFixture(fixtureRoot, "scripts/lib/harness-core.mjs", 'export { leaf } from "./leaf.mjs";\nexport { helper } from "./nested/helper.mjs";\n');
writeFixture(fixtureRoot, "scripts/lib/leaf.mjs", "export const leaf = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/nested/helper.mjs", "export const helper = 2;\n");
writeFixture(fixtureRoot, "scripts/lib/types/protocol.ts", "export type Protocol = { id: string };\n");
writeFixture(fixtureRoot, "scripts/infrastructure/kernel/path-utils.mts", "export const value = 1;\n");
writeFixture(fixtureRoot, "scripts/domain/task/model.mts", 'import { value } from "../../infrastructure/kernel/path-utils.mjs";\nexport const model = value;\n');
writeFixture(fixtureRoot, "scripts/application/task/use-case.mts", 'import { model } from "../../domain/task/model.mjs";\nexport const useCase = model;\n');
writeFixture(fixtureRoot, "scripts/adapters/cli/task-adapter.mts", 'import { useCase } from "../../application/task/use-case.mjs";\nexport const adapter = useCase;\n');
writeFixture(
  fixtureRoot,
  "tests/type-consumer.ts",
  'import type { Protocol } from "../scripts/lib/' + 'types/protocol' + '.js";\nconst value: Protocol = { id: "ok" };\n',
);

const graph = buildImportGraph({ repoRoot: fixtureRoot });
assert(graph.summary.fileCount === 11, `expected 11 graph files, got ${graph.summary.fileCount}`);
assert(graph.summary.localEdgeCount === 9, `expected 9 local edges, got ${graph.summary.localEdgeCount}`);
assert(graph.summary.unresolvedLocalEdges === 0, "valid graph should have no unresolved local edges");
assert(graph.summary.cycleNodes === 0, "valid graph should have no cycle nodes");
assert(graph.summary.runtimeMjsToTsEdges === 0, "valid graph should have no .mjs to .ts/.mts edges");
assert(graph.summary.typesValueImports === 0, "valid graph should allow import type from scripts/lib/types");
assert(graph.summary.architectureBoundaryViolations === 0, "valid layered fixture should have no architecture boundary violations");

assert(nodeByPath(graph, "scripts/harness.mjs").reachableFromBin === true, "bin entry should be bin-reachable");
assert(nodeByPath(graph, "scripts/lib/harness-core.mjs").reachableFromBin === true, "harness-core should be bin-reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").reachableFromHarnessCore === true, "barrel target should be harness-core reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").barrelReachable === true, "barrel re-export target should be barrel reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").layer === 0, "leaf dependency should be layer 0");
assert(nodeByPath(graph, "scripts/harness.mjs").layer > nodeByPath(graph, "scripts/lib/leaf.mjs").layer, "importer layer should be deeper than leaf layer");

const checked = checkImportGraph({ repoRoot: fixtureRoot, expectNodes: 11, expectEdges: 9 });
assert(checked.ok === true, `valid graph gate should pass:\n${checked.violations.map((violation) => violation.message).join("\n")}`);

writeFixture(fixtureRoot, "scripts/bad-missing.mjs", 'import "./missing.mjs";\n');
writeFixture(fixtureRoot, "scripts/bad-runtime.mjs", 'import "./runtime-target' + '.ts";\n');
writeFixture(fixtureRoot, "scripts/runtime-target.ts", "export const value = 1;\n");
writeFixture(fixtureRoot, "scripts/a.mjs", 'import "./b.mjs";\n');
writeFixture(fixtureRoot, "scripts/b.mjs", 'import "./a.mjs";\n');
writeFixture(fixtureRoot, "scripts/value-consumer.ts", 'import { Protocol } from "./lib/' + 'types/protocol' + '.js";\nconsole.log(Protocol);\n');
writeFixture(fixtureRoot, "scripts/infrastructure/kernel/bad-kernel.mts", 'import { leaf } from "../../lib/leaf.mjs";\nexport const bad = leaf;\n');
writeFixture(fixtureRoot, "scripts/domain/task/bad-domain.mts", 'import { adapter } from "../../adapters/cli/task-adapter.mjs";\nexport const bad = adapter;\n');
writeFixture(fixtureRoot, "scripts/application/task/bad-use-case.mts", 'import { adapter } from "../../adapters/cli/task-adapter.mjs";\nexport const bad = adapter;\n');
writeFixture(fixtureRoot, "scripts/lib/task-scanner.mts", "export const scan = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/dashboard-data.mts", 'import { scan } from "./task-scanner.mjs";\nexport const dashboard = scan;\n');
writeFixture(fixtureRoot, "scripts/lib/task-lifecycle.mts", "export const lifecycle = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/dashboard-workbench.mts", 'import { lifecycle } from "./task-lifecycle.mjs";\nexport const workbench = lifecycle;\n');
writeFixture(fixtureRoot, "scripts/lib/governance-index-generator.mts", 'import { scan } from "./task-scanner.mjs";\nexport const generated = scan;\n');
writeFixture(fixtureRoot, "scripts/lib/governance-sync.mts", "export const sync = 1;\n");
writeFixture(fixtureRoot, "scripts/lib/preset-runner.mts", 'import { sync } from "./governance-sync.mjs";\nexport const preset = sync;\n');
writeFixture(fixtureRoot, "scripts/commands/module-command.mts", 'import { sync } from "../lib/governance-sync.mjs";\nexport const command = sync;\n');
writeFixture(fixtureRoot, "scripts/lib/task-operations.mts", "export const operations = 1;\n");
writeFixture(fixtureRoot, "scripts/commands/task-command.mts", 'import { operations } from "../lib/task-operations.mjs";\nexport const commandTask = operations;\n');

const failed = checkImportGraph({ repoRoot: fixtureRoot });
assert(failed.ok === false, "invalid graph fixture should fail");
assert(failed.violations.some((violation) => violation.code === "unresolved-local-edge"), "gate should report unresolved local edges");
assert(failed.violations.some((violation) => violation.code === "cycle"), "gate should report import cycles");
assert(failed.violations.some((violation) => violation.code === "mjs-imports-ts"), "gate should report .mjs importing .ts/.mts");
assert(failed.violations.some((violation) => violation.code === "types-value-import"), "gate should report value imports from scripts/lib/types");
assert(failed.violations.some((violation) => violation.code === "kernel-imports-outer-layer"), "gate should report kernel imports from outer layers");
assert(failed.violations.some((violation) => violation.code === "domain-imports-outer-layer"), "gate should report domain imports from adapters/application");
assert(failed.violations.some((violation) => violation.code === "application-imports-adapter"), "gate should report application imports from adapters");
assert(failed.violations.some((violation) => violation.code === "dashboard-data-imports-task-internal"), "gate should report dashboard-data imports from task internals");
assert(failed.violations.some((violation) => violation.code === "dashboard-workbench-imports-task-internal"), "gate should report dashboard-workbench imports from task internals");
assert(failed.violations.some((violation) => violation.code === "generated-governance-imports-task-scanner"), "gate should report generated governance imports from task scanner internals");
assert(failed.violations.some((violation) => violation.code === "command-imports-task-internal"), "gate should report command adapters importing task internals");
assert(failed.violations.some((violation) => violation.code === "runtime-imports-task-operations-facade"), "gate should report runtime callers importing the TaskOperations compatibility facade");
assert(failed.violations.some((violation) => violation.code === "preset-runtime-imports-governance-sync"), "gate should report preset runtime direct governance sync imports");

console.log("Import graph gate tests passed");
