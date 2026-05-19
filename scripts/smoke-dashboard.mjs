#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const node = process.execPath;
const cli = path.join(repoRoot, "scripts/harness.mjs");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "harness-dashboard-smoke-"));

function run(args) {
  const result = spawnSync(node, [cli, ...args], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function smokeTarget(target, name) {
  const outDir = path.join(tmpRoot, name);
  run(["dashboard", "--out-dir", outDir, target]);
  for (const required of [
    "index.html",
    "assets/app.css",
    "assets/app.js",
    "assets/dashboard-data.js",
    "data/status.json",
    "data/tables.json",
    "data/documents.json",
    "data/graph.json",
    "data/adoption.json",
  ]) {
    assert(fs.existsSync(path.join(outDir, required)), `${name} missing ${required}`);
  }
  const index = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  assert(index.includes("dashboard-data.js"), `${name} index missing data bootstrap`);
  const payload = fs.readFileSync(path.join(outDir, "assets/dashboard-data.js"), "utf8");
  assert(payload.includes("__HARNESS_DASHBOARD__"), `${name} missing embedded bundle`);
  const documents = fs.readFileSync(path.join(outDir, "data/documents.json"), "utf8");
  assert(!documents.includes(repoRoot), `${name} leaked repo absolute path`);
  for (const generated of ["data/status.json", "data/tables.json", "data/documents.json", "data/graph.json", "data/adoption.json", "assets/dashboard-data.js"]) {
    const content = fs.readFileSync(path.join(outDir, generated), "utf8");
    assert(!content.includes("/Users/lizeyu"), `${name} ${generated} leaked local user path`);
    assert(!content.includes("file://"), `${name} ${generated} leaked file URL`);
  }
  const docs = JSON.parse(fs.readFileSync(path.join(outDir, "data/documents.json"), "utf8"));
  const tables = JSON.parse(fs.readFileSync(path.join(outDir, "data/tables.json"), "utf8"));
  assert(!JSON.stringify(docs.documents.map((doc) => doc.path)).includes("_task-template"), `${name} documents included task template paths`);
  assert(!JSON.stringify(tables.tables.map((table) => table.source)).includes("_task-template"), `${name} tables included task template sources`);
  return outDir;
}

smokeTarget("examples/minimal-project", "example");

const mingjingDocs = "/Users/lizeyu/Projects/mingjing-app/docs";
if (fs.existsSync(mingjingDocs)) {
  const mingjingRepo = path.dirname(mingjingDocs);
  const before = spawnSync("git", ["-C", mingjingRepo, "status", "--short", "--", "docs"], { encoding: "utf8" }).stdout;
  smokeTarget(mingjingDocs, "mingjing");
  const after = spawnSync("git", ["-C", mingjingRepo, "status", "--short", "--", "docs"], { encoding: "utf8" }).stdout;
  assert(before === after, "Mingjing docs changed during dashboard smoke");
}

console.log(`Dashboard smoke passed: ${tmpRoot}`);
