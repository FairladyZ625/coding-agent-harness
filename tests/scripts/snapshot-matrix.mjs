#!/usr/bin/env node
// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const defaultRepoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const harnessScript = "scripts/harness.mjs";
export const snapshotCommands = [
    { id: "status", args: ["status", "--json", "."] },
    { id: "task-list", args: ["task-list", "--json", "."] },
    { id: "preset-list", args: ["preset", "list", "--json", "."] },
    { id: "source-check", args: ["check", "--profile", "source-package", "."] },
    { id: "target-check", args: ["check", "--profile", "target-project", "examples/minimal-project"] },
    { id: "migrate-plan", args: ["migrate-plan", "--json", "--limit", "20", "examples/minimal-project"] },
];
export function captureSnapshotMatrix({ repoRoot = defaultRepoRoot, outDir, label = "snapshot", commands = snapshotCommands } = {}) {
    const matrix = {
        schemaVersion: 1,
        label,
        generatedAt: new Date().toISOString(),
        repoRoot,
        commands: commands.map((command) => ({ id: command.id, args: command.args })),
        captures: {},
    };
    for (const command of commands) {
        const started = Date.now();
        const result = spawnSync(process.execPath, [path.join(repoRoot, harnessScript), ...command.args], {
            cwd: repoRoot,
            encoding: "utf8",
            env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
        });
        const durationMs = Date.now() - started;
        matrix.captures[command.id] = {
            id: command.id,
            command: `node ${path.join(repoRoot, harnessScript)} ${command.args.join(" ")}`,
            exitCode: result.status ?? 1,
            signal: result.signal || null,
            durationMs,
            stdout: parseJsonOrText(result.stdout),
            stderr: parseJsonOrText(result.stderr),
        };
    }
    if (outDir)
        writeSnapshotMatrix(matrix, { repoRoot, outDir });
    return matrix;
}
export function writeSnapshotMatrix(matrix, { repoRoot = defaultRepoRoot, outDir }) {
    fs.mkdirSync(outDir, { recursive: true });
    const normalized = normalizeSnapshotMatrix(matrix, { repoRoot });
    fs.writeFileSync(path.join(outDir, "matrix.raw.json"), `${JSON.stringify(matrix, null, 2)}\n`);
    fs.writeFileSync(path.join(outDir, "matrix.normalized.json"), `${JSON.stringify(normalized, null, 2)}\n`);
    for (const [id, capture] of Object.entries(normalized.captures || {})) {
        fs.writeFileSync(path.join(outDir, `${id}.json`), `${JSON.stringify(capture, null, 2)}\n`);
    }
    return normalized;
}
export function normalizeSnapshotMatrix(matrix, { repoRoot = defaultRepoRoot } = {}) {
    return normalizeValue(matrix, { repoRoot });
}
export function compareSnapshotMatrices(before, after) {
    const drifts = [];
    const commandIds = [...new Set([...Object.keys(before.captures || {}), ...Object.keys(after.captures || {})])].sort();
    for (const id of commandIds) {
        const left = before.captures?.[id];
        const right = after.captures?.[id];
        if (!left || !right) {
            drifts.push({ code: "missing-command", command: id, before: Boolean(left), after: Boolean(right) });
            continue;
        }
        if (left.exitCode !== right.exitCode) {
            drifts.push({ code: "exit-code", command: id, before: left.exitCode, after: right.exitCode });
        }
        const leftShape = shapeOf(left.stdout);
        const rightShape = shapeOf(right.stdout);
        if (leftShape !== rightShape) {
            drifts.push({ code: "json-shape", command: id, before: leftShape, after: rightShape });
        }
        compareTextOutput(drifts, id, "stdout", left.stdout, right.stdout);
        compareTextOutput(drifts, id, "stderr", left.stderr, right.stderr);
        compareMetric(drifts, id, "task-count", countTasks(left.stdout), countTasks(right.stdout));
        compareMetric(drifts, id, "failure-count", countNamedMetric(left.stdout, ["failureCount", "failures", "errors"]), countNamedMetric(right.stdout, ["failureCount", "failures", "errors"]));
        compareMetric(drifts, id, "lifecycle-queue-count", countNamedMetric(left.stdout, ["queueCount", "queues"]), countNamedMetric(right.stdout, ["queueCount", "queues"]));
        compareMetric(drifts, id, "migration-action-count", countNamedMetric(left.stdout, ["actionCount", "actions"]), countNamedMetric(right.stdout, ["actionCount", "actions"]));
        compareMetric(drifts, id, "migration-residual-count", countNamedMetric(left.stdout, ["residualCount", "residuals"]), countNamedMetric(right.stdout, ["residualCount", "residuals"]));
        compareMigrationPlanMetrics(drifts, id, left.stdout, right.stdout);
        const leftPresetIds = collectPresetIds(left.stdout);
        const rightPresetIds = collectPresetIds(right.stdout);
        if (leftPresetIds && rightPresetIds && leftPresetIds.join("\n") !== rightPresetIds.join("\n")) {
            drifts.push({ code: "preset-id-set", command: id, before: leftPresetIds, after: rightPresetIds });
        }
    }
    const markdown = renderDiffMarkdown(drifts);
    return { ok: drifts.length === 0, drifts, markdown };
}
export function runSnapshotSelfTest({ repoRoot = defaultRepoRoot, outDir = path.join(repoRoot, "tmp", "snapshot-matrix-self-test") } = {}) {
    const beforeDir = path.join(outDir, "before");
    const afterDir = path.join(outDir, "after");
    const before = normalizeSnapshotMatrix(captureSnapshotMatrix({ repoRoot, outDir: beforeDir, label: "before" }), { repoRoot });
    const after = normalizeSnapshotMatrix(captureSnapshotMatrix({ repoRoot, outDir: afterDir, label: "after" }), { repoRoot });
    const diff = compareSnapshotMatrices(before, after);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "diff.md"), diff.markdown);
    return { ok: diff.ok, before, after, diff, outDir };
}
function parseJsonOrText(value) {
    const trimmed = String(value || "").trim();
    if (!trimmed)
        return "";
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return trimmed;
    }
}
function normalizeValue(value, context) {
    if (Array.isArray(value))
        return value.map((entry) => normalizeValue(entry, context));
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
            if (isTimestampKey(key))
                return [key, "<timestamp>"];
            if (isDurationKey(key))
                return [key, "<duration>"];
            return [key, normalizeValue(entry, context)];
        }));
    }
    if (typeof value !== "string")
        return value;
    return normalizeString(value, context);
}
function normalizeString(value, { repoRoot }) {
    let normalized = value;
    if (repoRoot)
        normalized = replaceAll(normalized, repoRoot, "<repo>");
    normalized = normalized.replace(/\/private\/var\/folders\/[^\s"',)]+|\/var\/folders\/[^\s"',)]+|\/tmp\/[^\s"',)]+/g, "<tmp>");
    normalized = normalized.replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, "<timestamp>");
    return normalized;
}
function replaceAll(value, search, replacement) {
    return search ? value.split(search).join(replacement) : value;
}
function isTimestampKey(key) {
    return /(?:^|_|\b)(generatedAt|createdAt|updatedAt|startedAt|completedAt|timestamp|date)(?:$|_|\b)/i.test(key);
}
function isDurationKey(key) {
    return /duration|elapsed/i.test(key);
}
function shapeOf(value) {
    if (Array.isArray(value)) {
        const childShapes = [...new Set(value.map((entry) => shapeOf(entry)))].sort();
        return `[${childShapes.join("|")}]`;
    }
    if (value && typeof value === "object") {
        return `{${Object.keys(value)
            .sort()
            .map((key) => `${key}:${shapeOf(value[key])}`)
            .join(",")}}`;
    }
    return typeof value;
}
function compareMetric(drifts, command, code, before, after) {
    if (before === undefined || after === undefined || before === after)
        return;
    drifts.push({ code, command, before, after });
}
function compareTextOutput(drifts, command, stream, before, after) {
    if (typeof before !== "string" || typeof after !== "string" || before === after)
        return;
    drifts.push({ code: `${stream}-text`, command, before, after });
}
function compareMigrationPlanMetrics(drifts, command, before, after) {
    const left = collectMigrationPlanMetrics(before);
    const right = collectMigrationPlanMetrics(after);
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
        compareMetric(drifts, command, key, left[key], right[key]);
    }
}
function collectMigrationPlanMetrics(value) {
    if (!value || typeof value !== "object")
        return {};
    const summary = value.summary && typeof value.summary === "object" ? value.summary : {};
    return Object.fromEntries([
        ["migration-task-actions", countMetricValue(summary.taskActions) ?? countMetricValue(value.taskActions)],
        ["migration-visual-map-actions", countMetricValue(summary.visualMapActions) ?? countMetricValue(value.visualMapActions)],
        ["migration-legacy-actions", countMetricValue(summary.legacyReferenceGaps) ?? countMetricValue(summary.legacyActions) ?? countMetricValue(value.legacyActions)],
        ["migration-legacy-residuals", countMetricValue(summary.legacyResiduals) ?? countMetricValue(value.legacyResiduals)],
    ].filter(([, count]) => count !== undefined));
}
function countMetricValue(value) {
    if (Array.isArray(value))
        return value.length;
    if (typeof value === "number")
        return value;
    if (value && typeof value === "object")
        return Object.keys(value).length;
    return undefined;
}
function countTasks(value) {
    const taskArrays = [];
    walkValue(value, (entry, key) => {
        if (key === "tasks" && Array.isArray(entry))
            taskArrays.push(entry.length);
    });
    if (taskArrays.length === 0)
        return undefined;
    return taskArrays.reduce((sum, count) => sum + count, 0);
}
function countNamedMetric(value, names) {
    const counts = [];
    const nameSet = new Set(names);
    walkValue(value, (entry, key) => {
        if (!nameSet.has(key))
            return;
        if (Array.isArray(entry))
            counts.push(entry.length);
        else if (typeof entry === "number")
            counts.push(entry);
        else if (entry && typeof entry === "object")
            counts.push(Object.keys(entry).length);
    });
    if (counts.length === 0)
        return undefined;
    return counts.reduce((sum, count) => sum + count, 0);
}
function collectPresetIds(value) {
    const ids = new Set();
    walkValue(value, (entry, key) => {
        if (key !== "presets" || !Array.isArray(entry))
            return;
        for (const preset of entry) {
            if (preset && typeof preset === "object" && typeof preset.id === "string")
                ids.add(preset.id);
        }
    });
    return ids.size === 0 ? undefined : [...ids].sort();
}
function walkValue(value, visit, key = "") {
    visit(value, key);
    if (Array.isArray(value)) {
        value.forEach((entry, index) => walkValue(entry, visit, String(index)));
    }
    else if (value && typeof value === "object") {
        for (const [childKey, childValue] of Object.entries(value))
            walkValue(childValue, visit, childKey);
    }
}
function renderDiffMarkdown(drifts) {
    const lines = ["# Snapshot Matrix Diff", ""];
    if (drifts.length === 0) {
        lines.push("No blocking drift detected.", "");
        return lines.join("\n");
    }
    lines.push("| Code | Command | Before | After |", "| --- | --- | --- | --- |");
    for (const drift of drifts) {
        lines.push(`| ${drift.code} | ${drift.command || ""} | ${markdownCell(drift.before)} | ${markdownCell(drift.after)} |`);
    }
    lines.push("");
    return lines.join("\n");
}
function markdownCell(value) {
    return String(JSON.stringify(value) ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\n/g, "<br>");
}
function parseArgs(argv) {
    const [command, ...rest] = argv;
    const options = {};
    for (let index = 0; index < rest.length; index += 1) {
        const arg = rest[index];
        if (arg === "--out-dir")
            options.outDir = rest[++index];
        else if (arg === "--label")
            options.label = rest[++index];
        else if (arg === "--before-dir")
            options.beforeDir = rest[++index];
        else if (arg === "--after-dir")
            options.afterDir = rest[++index];
        else if (arg === "--out")
            options.out = rest[++index];
        else
            throw new Error(`Unknown argument: ${arg}`);
    }
    return { command, options };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        const { command, options } = parseArgs(process.argv.slice(2));
        if (command === "capture") {
            if (!options.outDir)
                throw new Error("capture requires --out-dir");
            const matrix = captureSnapshotMatrix({ outDir: options.outDir, label: options.label || "snapshot" });
            const normalized = normalizeSnapshotMatrix(matrix);
            console.log(JSON.stringify({ ok: true, outDir: options.outDir, captures: Object.keys(normalized.captures) }, null, 2));
        }
        else if (command === "diff") {
            if (!options.beforeDir || !options.afterDir)
                throw new Error("diff requires --before-dir and --after-dir");
            const before = JSON.parse(fs.readFileSync(path.join(options.beforeDir, "matrix.normalized.json"), "utf8"));
            const after = JSON.parse(fs.readFileSync(path.join(options.afterDir, "matrix.normalized.json"), "utf8"));
            const diff = compareSnapshotMatrices(before, after);
            if (options.out)
                fs.writeFileSync(options.out, diff.markdown);
            console.log(diff.markdown);
            if (!diff.ok)
                process.exit(1);
        }
        else if (command === "self-test") {
            const result = runSnapshotSelfTest({ outDir: options.outDir });
            console.log(result.diff.markdown);
            if (!result.ok)
                process.exit(1);
        }
        else {
            throw new Error("Usage: snapshot-matrix.mjs capture|diff|self-test [options]");
        }
    }
    catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}
