#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  assert,
  repoRoot,
} from "./helpers/harness-test-utils.mjs";

const forbidden = /docs\/09-PLANNING|docs\/10-WALKTHROUGH|docs\/Harness-Ledger\.md|legacy-compat|safe-adoption|legacyChecker|runLegacyCheck|runDashboardLegacyCheck/;
const runtimeRoots = [
  "scripts/harness.mjs",
  "scripts/lib",
  "scripts/commands",
];
const allowed = [
  /^scripts\/lib\/migration-/,
  /^scripts\/commands\/migration-command\.mjs$/,
  /^scripts\/lib\/hard-cutover-guard\.mjs$/,
  /^scripts\/lib\/harness-paths\.mjs$/,
  /^scripts\/lib\/core-shared\.mjs$/,
];
const packageSurfaceFiles = [
  "README.md",
  "templates/AGENTS.md.template",
  "templates-zh-CN/AGENTS.md.template",
  "templates/ledger/Harness-Ledger.md",
  "templates-zh-CN/ledger/Harness-Ledger.md",
  "templates/ssot/Module-Registry.md",
  "templates/walkthrough/walkthrough-template.md",
  "templates-zh-CN/walkthrough/walkthrough-template.md",
  "templates/dashboard/assets/app-src/40-modules.js",
  "templates/dashboard/assets/app.js",
  "templates/dashboard/assets/i18n.js",
  "docs-release/architecture/system-explainer/en-US/01-system-overview.md",
  "docs-release/architecture/system-explainer/01-system-overview.md",
  "docs-release/guides/preset-development.md",
];
const packageSurfaceRoots = ["examples/minimal-project"];
const packageForbidden = /docs\/(?:0[1-9]-|1[0-1]-)|docs\/Harness-Ledger\.md|\.harness-capabilities\.json|Closeout SSoT/;

function walkFiles(root) {
  const absolute = path.join(repoRoot, root);
  if (!fs.existsSync(absolute)) return [];
  const results = [];
  const visit = (file) => {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file)) visit(path.join(file, entry));
      return;
    }
    if (stat.isFile() && file.endsWith(".mjs")) results.push(file);
  };
  visit(absolute);
  return results;
}

const offenders = [];
for (const root of runtimeRoots) {
  for (const file of walkFiles(root)) {
    const relative = path.relative(repoRoot, file).split(path.sep).join("/");
    if (allowed.some((pattern) => pattern.test(relative))) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (forbidden.test(line)) offenders.push(`${relative}:${index + 1}: ${line.trim()}`);
    }
  }
}

assert(offenders.length === 0, `runtime still contains legacy hard-cutover forbidden strings:\n${offenders.join("\n")}`);

const packageOffenders = [];
for (const relative of packageSurfaceFiles) {
  const file = path.join(repoRoot, relative);
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (packageForbidden.test(line)) packageOffenders.push(`${relative}:${index + 1}: ${line.trim()}`);
  }
}
for (const root of packageSurfaceRoots) {
  for (const file of walkAllFiles(root)) {
    const relative = path.relative(repoRoot, file).split(path.sep).join("/");
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (packageForbidden.test(line)) packageOffenders.push(`${relative}:${index + 1}: ${line.trim()}`);
    }
  }
}

assert(packageOffenders.length === 0, `package-facing surfaces still contain legacy hard-cutover strings:\n${packageOffenders.join("\n")}`);

console.log("Hard cutover guard tests passed");

function walkAllFiles(root) {
  const absolute = path.join(repoRoot, root);
  const results = [];
  const visit = (file) => {
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(file)) visit(path.join(file, entry));
      return;
    }
    if (stat.isFile()) results.push(file);
  };
  visit(absolute);
  return results;
}
