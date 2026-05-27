#!/usr/bin/env node
// @ts-nocheck

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const { buildImportGraph, checkImportGraph } = await import(pathToFileURL(path.join(repoRoot, "scripts/check-import-graph.mjs")));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function writeFixture(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function nodeByPath(graph, relativePath) {
  return graph.nodes.find((node) => node.path === relativePath);
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
writeFixture(
  fixtureRoot,
  "tests/type-consumer.ts",
  'import type { Protocol } from "../scripts/lib/' + 'types/protocol' + '.js";\nconst value: Protocol = { id: "ok" };\n',
);

const graph = buildImportGraph({ repoRoot: fixtureRoot });
assert(graph.summary.fileCount === 7, `expected 7 graph files, got ${graph.summary.fileCount}`);
assert(graph.summary.localEdgeCount === 6, `expected 6 local edges, got ${graph.summary.localEdgeCount}`);
assert(graph.summary.unresolvedLocalEdges === 0, "valid graph should have no unresolved local edges");
assert(graph.summary.cycleNodes === 0, "valid graph should have no cycle nodes");
assert(graph.summary.runtimeMjsToTsEdges === 0, "valid graph should have no .mjs to .ts/.mts edges");
assert(graph.summary.typesValueImports === 0, "valid graph should allow import type from scripts/lib/types");

assert(nodeByPath(graph, "scripts/harness.mjs").reachableFromBin === true, "bin entry should be bin-reachable");
assert(nodeByPath(graph, "scripts/lib/harness-core.mjs").reachableFromBin === true, "harness-core should be bin-reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").reachableFromHarnessCore === true, "barrel target should be harness-core reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").barrelReachable === true, "barrel re-export target should be barrel reachable");
assert(nodeByPath(graph, "scripts/lib/leaf.mjs").layer === 0, "leaf dependency should be layer 0");
assert(nodeByPath(graph, "scripts/harness.mjs").layer > nodeByPath(graph, "scripts/lib/leaf.mjs").layer, "importer layer should be deeper than leaf layer");

const checked = checkImportGraph({ repoRoot: fixtureRoot, expectNodes: 7, expectEdges: 6 });
assert(checked.ok === true, `valid graph gate should pass:\n${checked.violations.map((violation) => violation.message).join("\n")}`);

writeFixture(fixtureRoot, "scripts/bad-missing.mjs", 'import "./missing.mjs";\n');
writeFixture(fixtureRoot, "scripts/bad-runtime.mjs", 'import "./runtime-target' + '.ts";\n');
writeFixture(fixtureRoot, "scripts/runtime-target.ts", "export const value = 1;\n");
writeFixture(fixtureRoot, "scripts/a.mjs", 'import "./b.mjs";\n');
writeFixture(fixtureRoot, "scripts/b.mjs", 'import "./a.mjs";\n');
writeFixture(fixtureRoot, "scripts/value-consumer.ts", 'import { Protocol } from "./lib/' + 'types/protocol' + '.js";\nconsole.log(Protocol);\n');

const failed = checkImportGraph({ repoRoot: fixtureRoot });
assert(failed.ok === false, "invalid graph fixture should fail");
assert(failed.violations.some((violation) => violation.code === "unresolved-local-edge"), "gate should report unresolved local edges");
assert(failed.violations.some((violation) => violation.code === "cycle"), "gate should report import cycles");
assert(failed.violations.some((violation) => violation.code === "mjs-imports-ts"), "gate should report .mjs importing .ts/.mts");
assert(failed.violations.some((violation) => violation.code === "types-value-import"), "gate should report value imports from scripts/lib/types");

console.log("Import graph gate tests passed");
