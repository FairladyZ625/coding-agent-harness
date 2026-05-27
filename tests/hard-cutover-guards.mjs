#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assert, repoRoot, } from "./helpers/harness-test-utils.mjs";
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
const packageForbidden = /docs\/(?:0[1-9]-|1[0-1]-)|docs\/Harness-Ledger\.md|\.harness-capabilities\.json|Closeout SSoT|Closeout-SSoT\.md|coding-agent-harness\/planning\/Module-Registry\.md|(^|[^A-Za-z0-9])(?:03-ARCHITECTURE|04-DEVELOPMENT|05-TEST-QA|06-INTEGRATIONS|09-PLANNING|10-WALKTHROUGH|11-REFERENCE)(?:\/|\b)|coding-agent-harness\/planning\/[^\n`|]*\b(?:TASKS|MODULES)\b|(?:current task walkthrough\.md|AGENTS\.md\s*\+\s*docs\/|source files under docs\/|docs\/ (?:目录|tree|文档树|完整骨架|下的源文件))/;
const packageAllow = [
    /^docs-release\/guides\/legacy-migration/,
    /^docs-release\/guides\/migration-playbook/,
    /^docs-release\/guides\/full-legacy-migration/,
    /^references\/legacy-/,
    /^scripts\//,
    /^scripts\/check-harness\.mjs$/,
    /^scripts\/lib\/migration-/,
    /^scripts\/lib\/harness-paths\.mjs$/,
    /^templates(?:-zh-CN)?\/walkthrough\/Closeout-SSoT\.md$/,
];
function walkFiles(root) {
    const absolute = path.join(repoRoot, root);
    if (!fs.existsSync(absolute))
        return [];
    const results = [];
    const visit = (file) => {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink())
            return;
        if (stat.isDirectory()) {
            for (const entry of fs.readdirSync(file))
                visit(path.join(file, entry));
            return;
        }
        if (stat.isFile() && file.endsWith(".mjs"))
            results.push(file);
    };
    visit(absolute);
    return results;
}
const offenders = [];
for (const root of runtimeRoots) {
    for (const file of walkFiles(root)) {
        const relative = path.relative(repoRoot, file).split(path.sep).join("/");
        if (allowed.some((pattern) => pattern.test(relative)))
            continue;
        const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
        for (const [index, line] of lines.entries()) {
            if (forbidden.test(line))
                offenders.push(`${relative}:${index + 1}: ${line.trim()}`);
        }
    }
}
assert(offenders.length === 0, `runtime still contains legacy hard-cutover forbidden strings:\n${offenders.join("\n")}`);
const packageOffenders = [];
for (const relative of packageFiles()) {
    if (packageAllow.some((pattern) => pattern.test(relative)))
        continue;
    if (!/\.(md|mjs|js|json|yaml|yml|template)$/.test(relative))
        continue;
    const file = path.join(repoRoot, relative);
    if (!fs.existsSync(file))
        continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
        if (packageForbidden.test(line))
            packageOffenders.push(`${relative}:${index + 1}: ${line.trim()}`);
    }
}
assert(packageOffenders.length === 0, `package-facing surfaces still contain legacy hard-cutover strings:\n${packageOffenders.join("\n")}`);
console.log("Hard cutover guard tests passed");
function packageFiles() {
    const result = spawnSync("npm", ["pack", "--dry-run", "--json"], { cwd: repoRoot, encoding: "utf8" });
    assert(result.status === 0, `npm pack dry-run failed:\n${result.stderr || result.stdout}`);
    return JSON.parse(result.stdout)[0].files.map((file) => file.path).sort();
}
